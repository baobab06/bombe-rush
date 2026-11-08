/**
 * MISES À JOUR DU JEU — règles partagées par le serveur et le jeu.
 *
 * La configuration est réglée depuis la page d'administration du serveur
 * (`/admin-mises-a-jour.html`), sans republier le jeu. Le jeu la demande au
 * démarrage (`GET /api/update`) et la garde en mémoire : même hors ligne, une
 * mise à jour obligatoire déjà connue reste obligatoire.
 */

export type UpdateStatus = "ok" | "optional" | "mandatory";

export type NoteKind = "new" | "fix" | "improve";

export interface PatchNote {
  kind: NoteKind;
  text: string;
}

export interface UpdateConfig {
  /** notifications et contrôle de version actifs */
  enabled: boolean;
  /** dernière version publiée (ex. "1.11.6") */
  latestVersion: string;
  /** version minimale encore acceptée ; en dessous, mise à jour obligatoire */
  minVersion: string;
  /** la dernière version est obligatoire pour tout le monde */
  mandatory: boolean;
  title: string;
  description: string;
  notes: PatchNote[];
  storeUrl: string;
  /**
   * Annonce envoyée en notification sur les téléphones (appli 1.12.2+), une seule
   * fois par identifiant : changer l'identifiant = nouvelle notification.
   */
  push?: { id: string; title: string; body: string } | null;
  /** date de la dernière modification (ms) */
  updatedAt: number;
}

export const STORE_URL = "https://play.google.com/store/apps/details?id=com.bomberush.game";

/** Versions sorties avant ce système (le jeu ne donnait pas sa version au serveur). */
export const LEGACY_VERSION = "1.11.5";

export const DEFAULT_UPDATE: UpdateConfig = {
  enabled: false,
  latestVersion: "1.0.0",
  minVersion: "1.0.0",
  mandatory: false,
  title: "Nouvelle mise à jour !",
  description: "Une nouvelle version de Bombe Rush est disponible.",
  notes: [],
  storeUrl: STORE_URL,
  updatedAt: 0,
};

const VERSION_RE = /^\d{1,4}(\.\d{1,4}){0,3}$/;

export function isVersion(v: unknown): v is string {
  return typeof v === "string" && VERSION_RE.test(v.trim());
}

/** Compare deux versions « 1.11.5 » : négatif si a < b, 0 si égales, positif si a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.trim().split(".").map((n) => Number(n) || 0);
  const pb = b.trim().split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Version minimale réellement exigée (la dernière si elle est marquée obligatoire). */
export function requiredVersion(c: UpdateConfig): string {
  return c.mandatory && compareVersions(c.latestVersion, c.minVersion) > 0 ? c.latestVersion : c.minVersion;
}

/** Que doit-on montrer à un joueur qui a cette version ? */
export function updateStatus(c: UpdateConfig, version: string | null | undefined): UpdateStatus {
  if (!c.enabled) return "ok";
  const v = isVersion(version) ? version : LEGACY_VERSION;
  if (compareVersions(v, requiredVersion(c)) < 0) return "mandatory";
  if (compareVersions(v, c.latestVersion) < 0) return "optional";
  return "ok";
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, n) : "");

/**
 * Nettoie une configuration reçue (page d'administration ou stockage) :
 * renvoie la configuration valide, ou un message d'erreur lisible.
 */
export function sanitizeUpdate(raw: unknown, now = Date.now()): { ok: true; config: UpdateConfig } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const latest = typeof r.latestVersion === "string" ? r.latestVersion.trim() : "";
  const min = typeof r.minVersion === "string" ? r.minVersion.trim() : "";
  if (!isVersion(latest)) return { ok: false, error: "Dernière version invalide (exemple : 1.12.0)." };
  if (!isVersion(min)) return { ok: false, error: "Version minimale invalide (exemple : 1.11.0)." };
  if (compareVersions(min, latest) > 0) return { ok: false, error: "La version minimale ne peut pas dépasser la dernière version." };
  let storeUrl = clip(r.storeUrl, 300) || STORE_URL;
  try {
    const u = new URL(storeUrl);
    if (u.protocol !== "https:" || !/(^|\.)play\.google\.com$/.test(u.hostname)) return { ok: false, error: "Le lien doit pointer vers le Google Play Store (https://play.google.com/…)." };
    storeUrl = u.toString();
  } catch {
    return { ok: false, error: "Lien Play Store invalide." };
  }
  const notes: PatchNote[] = [];
  if (Array.isArray(r.notes)) {
    for (const n of r.notes.slice(0, 60)) {
      if (notes.length >= 20) break;
      const nn = (n ?? {}) as Record<string, unknown>;
      const kind = nn.kind === "fix" || nn.kind === "improve" ? nn.kind : "new";
      const text = clip(nn.text, 160);
      if (text) notes.push({ kind, text });
    }
  }
  let push: UpdateConfig["push"] = null;
  const rp = (r.push ?? null) as Record<string, unknown> | null;
  if (rp && typeof rp === "object") {
    const title = clip(rp.title, 60);
    const body = clip(rp.body, 200);
    if (title && body) push = { id: (clip(rp.id, 40) || String(now)).replace(/[^A-Za-z0-9_-]/g, "") || String(now), title, body };
  }
  return {
    ok: true,
    config: {
      push,
      enabled: r.enabled === true,
      latestVersion: latest,
      minVersion: min,
      mandatory: r.mandatory === true,
      title: clip(r.title, 80) || DEFAULT_UPDATE.title,
      description: clip(r.description, 600),
      notes,
      storeUrl,
      updatedAt: now,
    },
  };
}

/** Réponse de `GET /api/update?v=…` */
export interface UpdateCheck {
  status: UpdateStatus;
  current: string;
  config: UpdateConfig;
}
