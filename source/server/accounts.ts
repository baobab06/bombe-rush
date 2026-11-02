/**
 * COMPTES — connexion Google + sauvegarde en ligne du profil.
 *
 * Principe (sécurité) :
 *  - le client n'envoie JAMAIS un identifiant Google « en clair » : il envoie
 *    le jeton d'identité signé par Google (ID token, JWT RS256). Le serveur
 *    vérifie lui-même la signature avec les clés publiques de Google, l'émetteur,
 *    l'audience (nos identifiants OAuth) et l'expiration, puis lit l'identifiant
 *    stable du compte (`sub`) ;
 *  - aucun mot de passe n'est stocké ; le serveur délivre ensuite sa propre clé
 *    de session (aléatoire, 256 bits) dont il ne garde que l'empreinte SHA-256 ;
 *  - un compte Google = un seul profil de jeu, créé de façon atomique
 *    (impossible d'en créer deux, même avec deux connexions simultanées) ;
 *  - la sauvegarde est versionnée (`rev`) : une écriture qui ne part pas de la
 *    dernière version est refusée (409) au lieu d'écraser ; un remplacement
 *    volontaire (`force`) garde une copie de l'ancienne version.
 *
 * Stockage : Upstash Redis (REST, gratuit) en production, fichier JSON en
 * développement / tests, mémoire pour les tests unitaires.
 */
import { createHash, createPublicKey, createVerify, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

// ---------------------------------------------------------------- stockage

/** Stockage clé → valeur minimal (chaînes). `setNX` doit être atomique. */
export interface KvStore {
  readonly kind: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  /** n'écrit que si la clé n'existe pas ; true = écrit */
  setNX(key: string, value: string): Promise<boolean>;
  del(key: string): Promise<void>;
}

export class MemoryStore implements KvStore {
  readonly kind: string = "memory";
  protected m = new Map<string, { v: string; exp: number }>();
  async get(k: string) {
    const e = this.m.get(k);
    if (!e) return null;
    if (e.exp && e.exp < Date.now()) {
      this.m.delete(k);
      return null;
    }
    return e.v;
  }
  async set(k: string, v: string, ttl?: number) {
    this.m.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 });
  }
  /** atomique : vérification et écriture dans le même tour (aucun await entre les deux) */
  async setNX(k: string, v: string) {
    const e = this.m.get(k);
    if (e && (!e.exp || e.exp >= Date.now())) return false;
    this.m.set(k, { v, exp: 0 });
    this.written();
    return true;
  }
  /** appelé après chaque écriture (le stockage fichier enregistre) */
  protected written(): void {}
  async del(k: string) {
    this.m.delete(k);
  }
}

/** Fichier JSON (développement, ou serveur avec disque persistant). Écritures atomiques. */
export class FileStore extends MemoryStore {
  override readonly kind: string = "file";
  private file: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(dir: string) {
    super();
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "accounts.json");
    if (existsSync(this.file)) {
      const data = JSON.parse(readFileSync(this.file, "utf8")) as Record<string, { v: string; exp: number }>;
      for (const [k, e] of Object.entries(data)) this.m.set(k, e);
    }
  }
  protected override written() {
    this.flush();
  }
  private flush() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const tmp = this.file + ".tmp";
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.m)));
      renameSync(tmp, this.file);
    }, 50);
  }
  override async set(k: string, v: string, ttl?: number) {
    await super.set(k, v, ttl);
    this.flush();
  }
  override async del(k: string) {
    await super.del(k);
    this.flush();
  }
}

/** Upstash Redis via son API REST (aucune dépendance, juste fetch). */
export class UpstashStore implements KvStore {
  readonly kind: string = "upstash";
  constructor(
    private url: string,
    private token: string,
  ) {}
  private async cmd(args: (string | number)[]): Promise<unknown> {
    const r = await fetch(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error(`stockage ${r.status}`);
    const j = (await r.json()) as { result?: unknown; error?: string };
    if (j.error) throw new Error(j.error);
    return j.result;
  }
  async get(k: string) {
    return ((await this.cmd(["GET", k])) as string | null) ?? null;
  }
  async set(k: string, v: string, ttl?: number) {
    await this.cmd(ttl ? ["SET", k, v, "EX", ttl] : ["SET", k, v]);
  }
  async setNX(k: string, v: string) {
    return (await this.cmd(["SET", k, v, "NX"])) === "OK";
  }
  async del(k: string) {
    await this.cmd(["DEL", k]);
  }
}

/** Stockage choisi selon l'environnement ; null = comptes désactivés. */
export function storeFromEnv(env = process.env): KvStore | null {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return new UpstashStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  if (env.ACCOUNTS_DATA_DIR) return new FileStore(env.ACCOUNTS_DATA_DIR);
  return null;
}

// ---------------------------------------------------- vérification Google

export interface GoogleIdentity {
  sub: string;
  email?: string;
  name?: string;
}

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };

/**
 * Vérifie un jeton d'identité Google (ID token). Clés publiques de Google
 * téléchargées et gardées en cache (renouvelées selon leur durée de validité).
 */
export class GoogleVerifier {
  private keys = new Map<string, Jwk>();
  private keysUntil = 0;
  constructor(
    readonly clientIds: string[],
    private jwksUrl = "https://www.googleapis.com/oauth2/v3/certs",
    private fetchJson: (url: string) => Promise<{ keys: Jwk[]; maxAge: number }> = async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error("clés Google indisponibles");
      const m = /max-age=(\d+)/.exec(r.headers.get("cache-control") ?? "");
      return { keys: ((await r.json()) as { keys: Jwk[] }).keys, maxAge: m ? Number(m[1]) : 3600 };
    },
    private now = () => Date.now(),
  ) {}

  private async key(kid: string): Promise<Jwk | undefined> {
    if (this.now() > this.keysUntil || !this.keys.has(kid)) {
      const { keys, maxAge } = await this.fetchJson(this.jwksUrl);
      this.keys = new Map(keys.map((k) => [k.kid, k]));
      this.keysUntil = this.now() + Math.min(maxAge, 24 * 3600) * 1000;
    }
    return this.keys.get(kid);
  }

  /** Renvoie l'identité si le jeton est valide, sinon lève une erreur (raison courte). */
  async verify(idToken: string): Promise<GoogleIdentity> {
    if (typeof idToken !== "string" || idToken.length > 4096) throw new Error("jeton invalide");
    const parts = idToken.split(".");
    if (parts.length !== 3) throw new Error("jeton invalide");
    const dec = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    let header: { alg?: string; kid?: string };
    let payload: { iss?: string; aud?: string; exp?: number; iat?: number; sub?: string; email?: string; name?: string };
    try {
      header = dec(parts[0]);
      payload = dec(parts[1]);
    } catch {
      throw new Error("jeton invalide");
    }
    if (header.alg !== "RS256" || !header.kid) throw new Error("jeton invalide");
    const jwk = await this.key(header.kid);
    if (!jwk) throw new Error("clé inconnue");
    const pub = createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: "jwk" });
    const ok = createVerify("RSA-SHA256").update(`${parts[0]}.${parts[1]}`).verify(pub, Buffer.from(parts[2], "base64url"));
    if (!ok) throw new Error("signature invalide");
    if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") throw new Error("émetteur invalide");
    if (!payload.aud || !this.clientIds.includes(payload.aud)) throw new Error("audience invalide");
    const nowSec = Math.floor(this.now() / 1000);
    if (!payload.exp || payload.exp < nowSec - 30) throw new Error("jeton expiré");
    if (payload.iat && payload.iat > nowSec + 300) throw new Error("jeton invalide");
    if (!payload.sub || !/^[0-9A-Za-z_-]{1,255}$/.test(payload.sub)) throw new Error("jeton invalide");
    return { sub: payload.sub, email: payload.email, name: payload.name };
  }
}

// ------------------------------------------------------------- comptes

export interface CloudSave {
  rev: number;
  updatedAt: number;
  data: unknown | null;
}

const SESSION_TTL = 180 * 24 * 3600; // 6 mois (renouvelée à chaque connexion)
const MAX_SAVE_BYTES = 256 * 1024;
const BACKUPS = 5;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export class Accounts {
  constructor(
    readonly store: KvStore,
    readonly verifier: GoogleVerifier,
    /** nettoie une sauvegarde reçue (forme du profil) ; lève une erreur si inutilisable */
    private sanitize: (data: unknown) => unknown = (d) => d,
  ) {}

  /** Connexion : vérifie le jeton Google, retrouve (ou crée UNE fois) le profil, ouvre une session. */
  async signIn(idToken: string): Promise<{ session: string; profileId: string; created: boolean; email?: string; name?: string; cloud: CloudSave }> {
    const id = await this.verifier.verify(idToken);
    const accKey = `acct:${sha("google:" + id.sub)}`;
    let profileId = await this.store.get(accKey);
    let created = false;
    if (!profileId) {
      const fresh = randomBytes(12).toString("hex");
      // atomique : si deux connexions arrivent en même temps, une seule crée le profil
      if (await this.store.setNX(accKey, fresh)) {
        profileId = fresh;
        created = true;
        await this.store.set(`prof:${fresh}`, JSON.stringify({ rev: 0, updatedAt: Date.now(), data: null } satisfies CloudSave));
      } else profileId = (await this.store.get(accKey))!;
    }
    const pid = profileId as string;
    const session = randomBytes(32).toString("base64url");
    await this.store.set(`sess:${sha(session)}`, pid, SESSION_TTL);
    return { session, profileId: pid, created, email: id.email, name: id.name, cloud: await this.load(pid) };
  }

  /** Profil d'une session (null = session inconnue / expirée). */
  async profileOf(session: unknown): Promise<string | null> {
    if (typeof session !== "string" || session.length < 20 || session.length > 100) return null;
    return this.store.get(`sess:${sha(session)}`);
  }

  async signOut(session: string): Promise<void> {
    await this.store.del(`sess:${sha(session)}`);
  }

  async load(profileId: string): Promise<CloudSave> {
    const raw = await this.store.get(`prof:${profileId}`);
    return raw ? (JSON.parse(raw) as CloudSave) : { rev: 0, updatedAt: 0, data: null };
  }

  /**
   * Enregistre une sauvegarde. Refusée (conflict) si `baseRev` n'est pas la
   * dernière version — sauf `force` (choix explicite du joueur), qui garde
   * l'ancienne version de côté.
   */
  async save(profileId: string, data: unknown, baseRev: number, force = false): Promise<{ ok: true; rev: number; updatedAt: number } | { ok: false; cloud: CloudSave }> {
    const size = Buffer.byteLength(JSON.stringify(data ?? null));
    if (!data || typeof data !== "object" || Array.isArray(data) || size > MAX_SAVE_BYTES) throw new Error("sauvegarde invalide");
    const clean = this.sanitize(data);
    const cur = await this.load(profileId);
    if (!force && baseRev !== cur.rev) return { ok: false, cloud: cur };
    if (force && cur.data) {
      // on garde les anciennes versions remplacées volontairement
      await this.store.set(`prof:${profileId}:backup:${cur.rev}`, JSON.stringify(cur), 90 * 24 * 3600);
      await this.store.del(`prof:${profileId}:backup:${cur.rev - BACKUPS}`);
    }
    const next: CloudSave = { rev: cur.rev + 1, updatedAt: Date.now(), data: clean };
    await this.store.set(`prof:${profileId}`, JSON.stringify(next));
    return { ok: true, rev: next.rev, updatedAt: next.updatedAt };
  }
}

// ------------------------------------------------------------ routes HTTP

/** Origines autorisées à appeler l'API (le site, l'appli Android, le développement local). */
function allowedOrigin(origin: string | undefined, host: string | undefined): string | null {
  if (!origin) return null;
  if (origin === "https://appassets.androidplatform.net") return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  if (host && (origin === `https://${host}` || origin === `http://${host}`)) return origin;
  const extra = (process.env.ACCOUNTS_ORIGINS ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  return extra.includes(origin) ? origin : null;
}

/** Petite limite de débit par adresse (anti-abus). */
class RateLimit {
  private hits = new Map<string, { n: number; t: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}
  allow(key: string): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || now - h.t > this.windowMs) {
      this.hits.set(key, { n: 1, t: now });
      if (this.hits.size > 10000) this.hits.clear();
      return true;
    }
    return ++h.n <= this.max;
  }
}

async function body(req: IncomingMessage, max = MAX_SAVE_BYTES + 4096): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > max) throw new Error("trop gros");
    chunks.push(c as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

/**
 * Routes /api/… : renvoie true si la requête a été traitée.
 *   GET  /api/config         → { accounts, googleClientId }
 *   POST /api/auth/google    { idToken }            → session + profil en ligne
 *   POST /api/auth/logout    (Bearer)
 *   GET  /api/profile        (Bearer)               → { rev, updatedAt, data }
 *   PUT  /api/profile        (Bearer) { data, baseRev, force? } → { rev } | 409 { cloud }
 */
export function accountRoutes(accounts: Accounts | null, webClientId: string | undefined) {
  const authLimit = new RateLimit(20, 60_000);
  const saveLimit = new RateLimit(60, 60_000);
  return async (req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> => {
    if (!path.startsWith("/api/")) return false;
    const origin = allowedOrigin(req.headers.origin, req.headers.host);
    const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store" };
    if (origin) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-headers"] = "authorization, content-type";
      headers["access-control-allow-methods"] = "GET, POST, PUT, OPTIONS";
      headers["vary"] = "origin";
    }
    const reply = (status: number, obj: unknown) => {
      res.writeHead(status, headers);
      res.end(JSON.stringify(obj));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(origin ? 204 : 403, headers);
      res.end();
      return true;
    }
    if (path === "/api/config" && req.method === "GET") {
      reply(200, { accounts: !!accounts && !!webClientId, googleClientId: webClientId ?? null });
      return true;
    }
    if (!accounts || !webClientId) {
      reply(503, { error: "Les comptes ne sont pas encore activés sur le serveur." });
      return true;
    }
    const ip = ((req.headers["x-forwarded-for"] as string) ?? req.socket.remoteAddress ?? "?").split(",")[0].trim();
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    try {
      if (path === "/api/auth/google" && req.method === "POST") {
        if (!authLimit.allow(ip)) return reply(429, { error: "Trop de tentatives, réessaie dans une minute." }), true;
        const b = (await body(req, 8192)) as { idToken?: unknown };
        try {
          const r = await accounts.signIn(String(b.idToken ?? ""));
          reply(200, r);
        } catch (e) {
          reply(401, { error: "Connexion Google refusée (" + (e as Error).message + ")." });
        }
        return true;
      }
      const profileId = await accounts.profileOf(bearer);
      if (!profileId) return reply(401, { error: "Session expirée, reconnecte-toi." }), true;
      if (path === "/api/auth/logout" && req.method === "POST") {
        await accounts.signOut(bearer!);
        reply(200, { ok: true });
        return true;
      }
      if (path === "/api/profile" && req.method === "GET") {
        reply(200, await accounts.load(profileId));
        return true;
      }
      if (path === "/api/profile" && req.method === "PUT") {
        if (!saveLimit.allow(profileId)) return reply(429, { error: "Trop de sauvegardes, patiente un peu." }), true;
        const b = (await body(req)) as { data?: unknown; baseRev?: unknown; force?: unknown };
        const r = await accounts.save(profileId, b.data, Number(b.baseRev ?? -1), b.force === true);
        reply(r.ok ? 200 : 409, r);
        return true;
      }
      reply(404, { error: "Introuvable" });
    } catch (e) {
      reply(400, { error: "Requête invalide (" + (e as Error).message + ")." });
    }
    return true;
  };
}
