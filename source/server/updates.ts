/**
 * MISES À JOUR DU JEU — configuration réglable sans republier le jeu.
 *
 *   GET /api/update?v=1.11.5        (public)  → { status, current, config }
 *   GET /api/admin/update           (admin)   → configuration actuelle
 *   PUT /api/admin/update           (admin)   → enregistre une nouvelle configuration
 *
 * Admin : en-tête « Authorization: Bearer <ADMIN_TOKEN> » (variable d'environnement
 * du serveur, jamais dans le code). Page d'administration : /admin-mises-a-jour.html
 *
 * Stockage : la même base que les comptes (Upstash) ; sans base, en mémoire
 * (perdue au redémarrage, pratique en local).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DEFAULT_UPDATE, isVersion, sanitizeUpdate, updateStatus, type UpdateConfig, type UpdateStatus } from "../src/net/update-policy";
import { MemoryStore, type KvStore } from "./accounts";

const KEY = "cfg:update";
const CACHE_MS = 30_000;

export class UpdateService {
  private cache: UpdateConfig = { ...DEFAULT_UPDATE };
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(
    readonly store: KvStore = new MemoryStore(),
    private now: () => number = Date.now,
  ) {}

  /** Configuration (relue dans la base au plus toutes les 30 s). */
  async get(): Promise<UpdateConfig> {
    if (this.now() - this.loadedAt > CACHE_MS) {
      this.loading ??= this.refresh().finally(() => (this.loading = null));
      await this.loading;
    }
    return this.cache;
  }

  /** Dernière configuration connue, sans attendre (WebSocket). */
  get current(): UpdateConfig {
    if (this.now() - this.loadedAt > CACHE_MS && !this.loading) void this.get();
    return this.cache;
  }

  private async refresh() {
    try {
      const raw = await this.store.get(KEY);
      if (raw) {
        const s = sanitizeUpdate(JSON.parse(raw), 0);
        if (s.ok) this.cache = { ...s.config, updatedAt: (JSON.parse(raw) as UpdateConfig).updatedAt ?? 0 };
      }
      this.loadedAt = this.now();
    } catch (e) {
      // base injoignable : on garde la dernière configuration connue, nouvel essai bientôt
      console.warn("mises à jour : lecture impossible", (e as Error).message);
      this.loadedAt = this.now() - CACHE_MS + 5_000;
    }
  }

  async save(raw: unknown): Promise<{ ok: true; config: UpdateConfig } | { ok: false; error: string }> {
    const s = sanitizeUpdate(raw, this.now());
    if (!s.ok) return s;
    await this.store.set(KEY, JSON.stringify(s.config));
    this.cache = s.config;
    this.loadedAt = this.now();
    return s;
  }

  /** Statut pour une version du jeu (absente = ancienne version sans ce système). */
  statusOf(version: string | null | undefined, config = this.current): UpdateStatus {
    return updateStatus(config, version);
  }
}

class RateLimit {
  private hits = new Map<string, { n: number; until: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}
  allow(key: string): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.until < now) {
      if (this.hits.size > 5000) this.hits.clear();
      this.hits.set(key, { n: 1, until: now + this.windowMs });
      return true;
    }
    return ++h.n <= this.max;
  }
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Compare le jeton admin en temps constant. Jeton trop court = administration désactivée. */
export function adminOk(header: string | undefined, token: string | undefined): boolean {
  if (!token || token.length < 24) return false;
  const given = /^Bearer (.+)$/.exec(header ?? "")?.[1] ?? "";
  return timingSafeEqual(digest(given), digest(token));
}

async function readJson(req: IncomingMessage, max = 32_768): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > max) throw new Error("trop gros");
    chunks.push(c as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

/** Routes /api/update et /api/admin/update : true si la requête a été traitée. */
export function updateRoutes(svc: UpdateService, adminToken: string | undefined, corsOrigin: (req: IncomingMessage) => string | null) {
  const checkLimit = new RateLimit(30, 60_000);
  const adminLimit = new RateLimit(20, 60_000);
  return async (req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams): Promise<boolean> => {
    if (path !== "/api/update" && path !== "/api/admin/update") return false;
    const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store" };
    const origin = corsOrigin(req);
    if (origin) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-headers"] = "authorization, content-type";
      headers["access-control-allow-methods"] = "GET, PUT, OPTIONS";
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
    const ip = ((req.headers["x-forwarded-for"] as string) ?? req.socket.remoteAddress ?? "?").split(",")[0].trim();
    if (path === "/api/update") {
      if (req.method !== "GET") return reply(405, { error: "Méthode non autorisée" }), true;
      if (!checkLimit.allow(ip)) return reply(429, { error: "Trop de requêtes" }), true;
      const v = query.get("v");
      const config = await svc.get();
      const current = isVersion(v) ? v : "";
      reply(200, { status: svc.statusOf(current || null, config), current, config });
      return true;
    }
    // administration
    if (!adminLimit.allow(ip)) return reply(429, { error: "Trop de tentatives, réessaie dans une minute." }), true;
    if (!adminOk(req.headers.authorization, adminToken)) {
      reply(adminToken && adminToken.length >= 24 ? 401 : 503, { error: adminToken && adminToken.length >= 24 ? "Clé d'administration incorrecte." : "Administration désactivée : variable ADMIN_TOKEN absente sur le serveur." });
      return true;
    }
    try {
      if (req.method === "GET") return reply(200, await svc.get()), true;
      if (req.method === "PUT") {
        const r = await svc.save(await readJson(req));
        if (!r.ok) return reply(400, { error: r.error }), true;
        console.log(`mises à jour : configuration enregistrée (dernière ${r.config.latestVersion}, minimum ${r.config.minVersion}, ${r.config.mandatory ? "obligatoire" : "facultative"}, ${r.config.enabled ? "active" : "désactivée"})`);
        return reply(200, r.config), true;
      }
      reply(405, { error: "Méthode non autorisée" });
    } catch (e) {
      reply(400, { error: "Requête invalide (" + (e as Error).message + ")." });
    }
    return true;
  };
}
