/**
 * SAUVEGARDE EN LIGNE (compte Google) — par-dessus la sauvegarde locale.
 *
 * La sauvegarde LOCALE reste la référence pendant le jeu (on joue même sans
 * réseau). Quand le joueur est connecté, chaque sauvegarde est envoyée au
 * serveur (après un court délai) avec le numéro de version sur lequel elle
 * se base ; le serveur refuse d'écraser une version plus récente.
 *
 * Règles (jamais d'écrasement sans vérification) :
 *  - 1re connexion d'un compte Google tout neuf → la progression de l'appareil
 *    (compte invité) est ASSOCIÉE au compte ;
 *  - compte déjà utilisé + appareil vierge (aucune partie, aucun achat) → on
 *    récupère la progression du compte ;
 *  - compte déjà utilisé + appareil avec une AUTRE progression → CONFLIT : le
 *    joueur choisit ; ce qui n'est pas gardé est mis de côté (copie locale,
 *    et le serveur garde l'ancienne version) ;
 *  - hors ligne : les changements restent marqués « à envoyer » et partent
 *    dès que possible ; rien n'est perdu.
 * Les réglages de l'appareil (son, vibration, pubs) restent ceux de l'appareil.
 */
import { DEFAULT_CHARACTERS, type Profile } from "./profile";
import { migrate, type SaveBackend } from "./save";

export interface CloudSave {
  rev: number;
  updatedAt: number;
  data: Partial<Profile> | null;
}

export interface CloudMeta {
  /** session délivrée par NOTRE serveur (jamais le jeton Google) */
  session: string | null;
  /** profil en ligne auquel la sauvegarde locale correspond */
  profileId: string | null;
  email: string | null;
  /** dernière version en ligne connue (la sauvegarde locale en part) */
  baseRev: number;
  /** changements locaux pas encore envoyés */
  dirty: boolean;
  lastSync: number;
}

export type CloudStatus =
  | "disabled" // serveur sans comptes / pas de réseau au démarrage
  | "signedOut"
  | "busy"
  | "synced"
  | "pending" // changements en attente d'envoi
  | "offline" // envoi impossible pour l'instant (réessai automatique)
  | "error";

export interface ProfileSummary {
  name: string;
  level: number;
  coins: number;
  bombers: number;
  played: number;
  wins: number;
  items: number;
}

export type SignInResult =
  | { kind: "linked" } // compte neuf : progression de l'appareil associée
  | { kind: "restored" } // progression du compte récupérée
  | { kind: "synced" } // déjà à jour
  | { kind: "conflict"; local: ProfileSummary; cloud: ProfileSummary; updatedAt: number };

export interface CloudDeps {
  /** appel HTTP JSON vers le serveur du jeu */
  api(path: string, init: { method: string; body?: unknown; session?: string | null }): Promise<{ status: number; json: unknown }>;
  storage: SaveBackend;
  getProfile(): Profile;
  /** remplace le profil local (déjà enregistré par l'appelant) */
  setProfile(p: Profile): void;
  now?: () => number;
}

const META_KEY = "bomberush.cloud";
const BACKUP_KEY = "bomberush.profile.backup";
const PUSH_DELAY = 2500;

export function summary(p: Partial<Profile>): ProfileSummary {
  return {
    name: p.name ?? "Joueur",
    level: p.level ?? 1,
    coins: p.coins ?? 0,
    bombers: p.bombers ?? 0,
    played: p.played ?? 0,
    wins: p.wins ?? 0,
    // objets gagnés ou achetés (sans les personnages offerts au départ)
    items: (p.owned?.length ?? 0) + Math.max(0, (p.ownedCharacters?.length ?? 0) - DEFAULT_CHARACTERS.length),
  };
}

/** Profil « vierge » : rien qu'on risquerait de perdre (aucune partie, aucun achat, aucun objet, niveau 1). */
export function isFresh(p: Profile): boolean {
  return p.played === 0 && p.level <= 1 && p.purchases.length === 0 && p.owned.length === 0 && p.bombers <= 0;
}

export class CloudSync {
  meta: CloudMeta;
  status: CloudStatus = "signedOut";
  lastError = "";
  /** le serveur accepte les comptes (identifiant Google configuré) */
  enabled = false;
  googleClientId: string | null = null;
  onChange: (() => void) | null = null;
  /** conflit en attente de choix du joueur */
  private conflict: { cloud: CloudSave; profileId: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pushing: Promise<void> | null = null;

  constructor(private d: CloudDeps) {
    this.meta = this.readMeta();
  }

  get signedIn(): boolean {
    return !!this.meta.session;
  }

  private readMeta(): CloudMeta {
    const base: CloudMeta = { session: null, profileId: null, email: null, baseRev: 0, dirty: false, lastSync: 0 };
    try {
      const raw = this.d.storage.load(META_KEY);
      return raw ? { ...base, ...(JSON.parse(raw) as Partial<CloudMeta>) } : base;
    } catch {
      return base;
    }
  }

  private writeMeta() {
    this.d.storage.store(META_KEY, JSON.stringify(this.meta));
  }

  private set(status: CloudStatus, err = "") {
    this.status = status;
    this.lastError = err;
    this.onChange?.();
  }

  /** Démarrage : configuration du serveur, puis mise à jour depuis le compte si connecté. */
  async init(): Promise<void> {
    try {
      const r = await this.d.api("/api/config", { method: "GET" });
      const j = r.json as { accounts?: boolean; googleClientId?: string | null };
      this.enabled = r.status === 200 && !!j.accounts;
      this.googleClientId = j.googleClientId ?? null;
    } catch {
      this.enabled = false;
    }
    if (!this.signedIn) return this.set(this.enabled ? "signedOut" : "disabled");
    await this.sync();
  }

  /**
   * Connexion avec un jeton d'identité Google (obtenu par Google Sign-In).
   * Le serveur vérifie le jeton ; on n'utilise jamais l'identifiant Google côté appareil.
   */
  async signInWithGoogleToken(idToken: string): Promise<SignInResult> {
    this.set("busy");
    let r: { status: number; json: unknown };
    try {
      r = await this.d.api("/api/auth/google", { method: "POST", body: { idToken } });
    } catch {
      this.set("error", "Pas de connexion au serveur. Vérifie ton réseau et réessaie.");
      throw new Error(this.lastError);
    }
    const j = r.json as { session?: string; profileId?: string; email?: string; cloud?: CloudSave; error?: string };
    if (r.status !== 200 || !j.session || !j.profileId || !j.cloud) {
      this.set(this.signedIn ? "error" : "signedOut", j.error ?? "Connexion refusée.");
      throw new Error(this.lastError);
    }
    const sameProfile = this.meta.profileId === j.profileId;
    this.meta.session = j.session;
    this.meta.email = j.email ?? null;
    this.writeMeta();
    const local = this.d.getProfile();
    const cloud = j.cloud;
    // 1) compte tout neuf : on y associe la progression de l'appareil (compte invité)
    if (!cloud.data) {
      this.meta.profileId = j.profileId;
      this.meta.baseRev = cloud.rev;
      this.meta.dirty = true;
      this.writeMeta();
      await this.push();
      return { kind: "linked" };
    }
    // 2) même profil qu'avant (reconnexion) : synchronisation normale
    if (sameProfile) {
      await this.sync();
      const c = this.pendingConflict();
      return c ? { kind: "conflict", ...c } : { kind: "synced" };
    }
    // 3) appareil vierge : on récupère la progression du compte
    if (isFresh(local)) {
      this.adopt(cloud, j.profileId);
      return { kind: "restored" };
    }
    // 4) appareil avec une autre progression : le joueur décide
    this.conflict = { cloud, profileId: j.profileId };
    this.set("busy");
    return { kind: "conflict", local: summary(local), cloud: summary(cloud.data), updatedAt: cloud.updatedAt };
  }

  /** Choix du joueur en cas de conflit. Rien n'est jeté : l'autre version est mise de côté. */
  async resolveConflict(keep: "cloud" | "local"): Promise<void> {
    const c = this.conflict;
    if (!c) return;
    this.conflict = null;
    if (keep === "cloud") {
      this.adopt(c.cloud, c.profileId);
      return;
    }
    // on garde l'appareil : il remplace la version en ligne (le serveur en garde une copie)
    this.meta.profileId = c.profileId;
    this.meta.baseRev = c.cloud.rev;
    this.meta.dirty = true;
    this.writeMeta();
    await this.push(true);
  }

  /** Annule une connexion en conflit : rien ne change sur l'appareil, on se déconnecte. */
  async cancelConflict(): Promise<void> {
    this.conflict = null;
    await this.signOut();
  }

  /** Remplace la progression locale par celle du compte (l'ancienne est gardée en copie locale). */
  private adopt(cloud: CloudSave, profileId: string) {
    const local = this.d.getProfile();
    try {
      this.d.storage.store(BACKUP_KEY, JSON.stringify({ at: this.now(), profile: local }));
    } catch {
      /* stockage plein : on continue, le compte reste la référence */
    }
    const p = migrate(cloud.data as Partial<Profile>);
    // les réglages restent ceux de l'appareil
    p.settings = local.settings;
    p.ads = { ...p.ads, personalized: local.ads.personalized };
    this.meta.profileId = profileId;
    this.meta.baseRev = cloud.rev;
    this.meta.dirty = false;
    this.meta.lastSync = this.now();
    this.writeMeta();
    this.d.setProfile(p);
    this.set("synced");
  }

  /** À appeler après chaque sauvegarde locale : envoi groupé quelques secondes plus tard. */
  markDirty(): void {
    if (this.conflict) return;
    // même déconnecté : si l'appareil est lié à un compte, on retient qu'il y a du nouveau
    if (this.meta.profileId && !this.meta.dirty) {
      this.meta.dirty = true;
      this.writeMeta();
    }
    if (!this.signedIn) return;
    if (this.status === "synced") this.set("pending");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.push();
    }, PUSH_DELAY);
  }

  /** Synchronise maintenant : récupère une version plus récente ou envoie la nôtre. */
  async sync(): Promise<void> {
    if (!this.signedIn) return;
    let r: { status: number; json: unknown };
    try {
      r = await this.d.api("/api/profile", { method: "GET", session: this.meta.session });
    } catch {
      return this.set("offline", "Hors ligne : la progression sera envoyée dès le retour du réseau.");
    }
    if (r.status === 401) return this.expired();
    if (r.status !== 200) return this.set("offline", "Serveur indisponible, nouvel essai plus tard.");
    const cloud = r.json as CloudSave;
    if (cloud.rev === this.meta.baseRev) {
      if (this.meta.dirty) await this.push();
      else {
        this.meta.lastSync = this.now();
        this.writeMeta();
        this.set("synced");
      }
      return;
    }
    // le compte a avancé ailleurs (autre appareil)
    if (!this.meta.dirty && cloud.data && this.meta.profileId) {
      this.adopt(cloud, this.meta.profileId);
      return;
    }
    if (!cloud.data) {
      // rien en ligne (cas rare) : on envoie
      this.meta.baseRev = cloud.rev;
      await this.push();
      return;
    }
    // changements des deux côtés : on demande au joueur au lieu d'écraser
    this.conflict = { cloud, profileId: this.meta.profileId! };
    this.set("error", "Ta progression a changé sur un autre appareil : choisis laquelle garder.");
  }

  /** Conflit apparu pendant une synchronisation (deux appareils) : résumé pour l'écran de choix. */
  pendingConflict(): { local: ProfileSummary; cloud: ProfileSummary; updatedAt: number } | null {
    if (!this.conflict?.cloud.data) return null;
    return { local: summary(this.d.getProfile()), cloud: summary(this.conflict.cloud.data), updatedAt: this.conflict.cloud.updatedAt };
  }

  /** Envoie la sauvegarde locale au serveur. */
  async push(force = false): Promise<void> {
    if (!this.signedIn || this.conflict) return;
    if (this.pushing) return this.pushing;
    this.pushing = (async () => {
      const data = this.d.getProfile();
      let r: { status: number; json: unknown };
      try {
        r = await this.d.api("/api/profile", { method: "PUT", session: this.meta.session, body: { data, baseRev: this.meta.baseRev, force } });
      } catch {
        this.set("offline", "Hors ligne : la progression sera envoyée dès le retour du réseau.");
        return;
      }
      if (r.status === 401) return this.expired();
      if (r.status === 409) {
        // une version plus récente existe : on ne l'écrase pas
        const cloud = (r.json as { cloud: CloudSave }).cloud;
        this.conflict = { cloud, profileId: this.meta.profileId! };
        this.set("error", "Ta progression a changé sur un autre appareil : choisis laquelle garder.");
        return;
      }
      if (r.status !== 200) return this.set("offline", "Serveur indisponible, nouvel essai plus tard.");
      const j = r.json as { rev: number };
      this.meta.baseRev = j.rev;
      this.meta.dirty = false;
      this.meta.lastSync = this.now();
      this.writeMeta();
      this.set("synced");
    })();
    try {
      await this.pushing;
    } finally {
      this.pushing = null;
    }
  }

  private expired() {
    this.meta.session = null;
    this.writeMeta();
    this.set("signedOut", "Session expirée : reconnecte-toi avec Google (ta progression sur cet appareil est conservée).");
  }

  /**
   * Déconnexion : on envoie d'abord ce qui reste, puis on oublie la session.
   * La progression reste sur l'appareil ; se reconnecter au même compte la retrouve.
   */
  async signOut(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const session = this.meta.session;
    if (session && this.meta.dirty && !this.conflict) await this.push();
    if (session) {
      try {
        await this.d.api("/api/auth/logout", { method: "POST", session });
      } catch {
        /* hors ligne : la session expirera d'elle-même */
      }
    }
    this.conflict = null;
    this.meta.session = null;
    this.meta.email = null;
    this.writeMeta();
    this.set(this.enabled ? "signedOut" : "disabled");
  }

  private now(): number {
    return (this.d.now ?? Date.now)();
  }
}
