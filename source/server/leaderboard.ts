/**
 * CLASSEMENT MONDIAL — parties contre les bots VÉRIFIÉES par le serveur.
 *
 * Anti-triche :
 *  1. avant la partie, le jeu demande un « ticket » : le serveur choisit la
 *     graine (impossible de chercher une partie facile à l'avance) ;
 *  2. après la partie, le jeu envoie ses commandes ; le serveur REJOUE la
 *     partie avec la même simulation et les mêmes bots, et calcule lui-même
 *     la place et les points (le résultat envoyé par le jeu n'est pas cru) ;
 *  3. la partie ne peut pas être envoyée plus vite qu'elle n'a duré ;
 *  4. un ticket jamais rendu (partie quittée) compte comme un abandon ;
 *  5. chaque joueur a une clé secrète aléatoire (le serveur n'en garde que
 *     l'empreinte), limites de débit par adresse.
 *
 * Routes :
 *   POST /api/lb/ticket   { id?, secret?, name, modeId, stake, bots } → { id, secret?, ticket, seed }
 *   POST /api/lb/cancel   { id, secret, ticket }        (ticket arrivé trop tard : pas de pénalité)
 *   POST /api/lb/submit   { id, secret, ticket, name, spec, log } → { ok, delta, points, week, pos, weekPos }
 *   GET  /api/lb/top?board=week|all&id=…&limit=…   → classement
 *   POST /api/admin/lb/hide { id, hidden }   (ADMIN_TOKEN) : retirer un pseudo du classement
 *
 * Stockage : un seul document (même base que les comptes), gardé en mémoire.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DT } from "../src/core/rules";
import type { Difficulty } from "../src/core/types";
import { compBots, compMode, rankIndex, trophyDelta } from "../src/meta/rank";
import { columnOf, type Placement } from "../src/meta/rewards";
import { DIFFICULTIES, RANKED_MODES, Replay, checkSpec, type RankedSpec, type ReplayOutcome } from "../src/net/replay";
import { MemoryStore, type KvStore } from "./accounts";
import { adminOk } from "./updates";

/** v2 : mode Compétition (trophées) — tout le monde est reparti de 0 */
const KEY = "lb:v2";

interface Ticket {
  id: string;
  seed: number;
  at: number;
  mode: string;
  /** niveau de chaque adversaire (imposé selon les trophées) */
  bots: Difficulty[];
}
export interface LbPlayer {
  /** pseudo */
  n: string;
  /** empreinte de la clé secrète */
  h: string;
  /** points (général) */
  p: number;
  /** points de la semaine `wk` */
  w: number;
  wk: string;
  /** parties classées / victoires */
  g: number;
  v: number;
  /** créé, vu */
  c: number;
  s: number;
  /** retiré du classement (pseudo inapproprié) */
  x?: 1;
  t?: Ticket | null;
}
interface Doc {
  v: 1;
  players: Record<string, LbPlayer>;
  /** dernière semaine terminée : top 10 */
  last?: { week: string; top: string[] };
}

export interface LbEntry {
  n: string;
  p: number;
  r: number;
  me?: boolean;
}

/** Lundi (UTC) de la semaine : AAAA-MM-JJ. */
export function weekOf(t: number): string {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}
export function weekEnd(t: number): number {
  return Date.parse(weekOf(t) + "T00:00:00Z") + 7 * 86400_000;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40);
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const cleanLbName = (n: unknown) =>
  String(n ?? "")
    .replace(/[<>&"'`\u0000-\u001f​-‏‪-‮]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16) || "Joueur";

/** abandon d'une partie classée (ticket jamais rendu) */
const ABANDON_AFTER_MS = 20_000;
/** tolérance sur la durée réelle de la partie */
const CLOCK_SLACK_MS = 4000;

export class LeaderboardService {
  private doc: Doc = { v: 1, players: {} };
  private loading: Promise<void> | null = null;
  private loaded = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: (() => Promise<void>)[] = [];
  private busy = false;
  private sorted: { all: string[] | null; week: string[] | null; wk: string } = { all: null, week: null, wk: "" };

  constructor(
    readonly store: KvStore = new MemoryStore(),
    private now: () => number = Date.now,
    /** images rejouées par tranche (puis on rend la main au serveur) */
    private chunk = 1500,
  ) {}

  async ready() {
    if (this.loaded) return;
    this.loading ??= (async () => {
      try {
        const raw = await this.store.get(KEY);
        if (raw) {
          const d = JSON.parse(raw) as Doc;
          if (d && d.v === 1 && d.players && typeof d.players === "object") this.doc = d;
        }
      } catch (e) {
        console.warn("classement : lecture impossible", (e as Error).message);
      }
      this.loaded = true;
    })();
    await this.loading;
  }

  private touch() {
    this.sorted.all = this.sorted.week = null;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, 1500);
  }
  async flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      await this.store.set(KEY, JSON.stringify(this.doc));
    } catch (e) {
      console.warn("classement : écriture impossible", (e as Error).message);
    }
  }

  /** Change de semaine : garde le top 10 de la semaine passée (récompenses). */
  private rollWeek() {
    const prev = weekOf(this.now() - 7 * 86400_000);
    if (this.doc.last?.week === prev) return;
    const top = Object.entries(this.doc.players)
      .filter(([, p]) => !p.x && p.wk === prev && p.w > 0)
      .sort((a, b) => b[1].w - a[1].w || a[1].s - b[1].s)
      .slice(0, 10)
      .map(([id]) => id);
    this.doc.last = { week: prev, top };
    this.touch();
  }

  player(id: unknown, secret: unknown): LbPlayer | null {
    if (typeof id !== "string" || typeof secret !== "string" || secret.length > 80) return null;
    const p = this.doc.players[id];
    return p && sameHash(p.h, sha(secret)) ? p : null;
  }

  private create(name: string): { id: string; secret: string; p: LbPlayer } {
    let id: string;
    do id = randomBytes(6).toString("base64url");
    while (this.doc.players[id]);
    const secret = randomBytes(24).toString("base64url");
    const t = this.now();
    const p: LbPlayer = { n: name, h: sha(secret), p: 0, w: 0, wk: weekOf(t), g: 0, v: 0, c: t, s: t };
    this.doc.players[id] = p;
    return { id, secret, p };
  }

  /** Applique les trophées d'une partie (même barème que le jeu). */
  private score(p: LbPlayer, column: number, mode: string, won: boolean, draw = false): number {
    const wk = weekOf(this.now());
    if (p.wk !== wk) {
      p.wk = wk;
      p.w = 0;
    }
    const delta = trophyDelta(column, p.p, mode, draw);
    const before = p.p;
    p.p = Math.max(0, p.p + delta);
    p.w = Math.max(0, p.w + delta);
    p.g++;
    if (won) p.v++;
    p.s = this.now();
    this.touch();
    return p.p - before;
  }

  /** Ticket jamais rendu → abandon (dernière place). */
  private settleOpen(p: LbPlayer) {
    const t = p.t;
    if (!t) return;
    p.t = null;
    if (this.now() - t.at < ABANDON_AFTER_MS) return;
    this.score(p, 4, t.mode, false);
  }

  /**
   * Ticket d'une partie de Compétition : le serveur tire le mode au hasard,
   * choisit la graine et fixe le niveau des adversaires selon les trophées.
   */
  async ticket(b: { id?: unknown; secret?: unknown; name?: unknown; comp?: unknown; pts?: unknown }, canCreate: () => boolean) {
    await this.ready();
    this.rollWeek();
    // anciennes versions du jeu (avant les trophées) : partie non classée
    if (b.comp !== 2) return { error: "Mets le jeu à jour pour jouer en Compétition.", status: 400 };
    let id = typeof b.id === "string" ? b.id : "";
    let secret: string | undefined;
    let p = this.player(b.id, b.secret);
    if (!p) {
      if (!canCreate()) return { error: "Trop de nouveaux joueurs depuis cette adresse.", status: 429 };
      const c = this.create(cleanLbName(b.name));
      ({ id, secret, p } = c);
    }
    p.n = cleanLbName(b.name ?? p.n);
    this.settleOpen(p);
    // trophées affichés sur l'appareil (parties hors ligne comprises) : ne peuvent que DURCIR les adversaires
    const local = Math.max(0, Math.min(100000, Math.floor(Number(b.pts) || 0)));
    const t: Ticket = { id: randomBytes(8).toString("base64url"), seed: randomBytes(4).readUInt32BE(0) >>> 1, at: this.now(), mode: compMode(() => randomBytes(4).readUInt32BE(0) / 2 ** 32), bots: compBots(Math.max(p.p, local)) };
    p.t = t;
    p.s = this.now();
    this.touch();
    return { id, secret, ticket: t.id, seed: t.seed, modeId: t.mode, bots: t.bots, points: p.p };
  }

  async cancel(b: { id?: unknown; secret?: unknown; ticket?: unknown }) {
    await this.ready();
    const p = this.player(b.id, b.secret);
    if (p?.t && p.t.id === b.ticket && this.now() - p.t.at < 90_000) {
      p.t = null;
      this.touch();
    }
    return { ok: true };
  }

  /** Rejoue la partie (file d'attente, par tranches) et compte les points. */
  async submit(b: { id?: unknown; secret?: unknown; ticket?: unknown; name?: unknown; spec?: unknown; log?: unknown }) {
    await this.ready();
    this.rollWeek();
    const p = this.player(b.id, b.secret);
    if (!p) return { ok: false, error: "joueur inconnu", status: 401 };
    const t = p.t;
    if (!t || t.id !== b.ticket) return { ok: false, error: "ticket inconnu ou déjà utilisé", status: 409 };
    const spec = b.spec as RankedSpec;
    const bad = checkSpec(spec, { modeId: t.mode, bots: t.bots });
    if (bad || spec.seed !== t.seed) {
      p.t = null;
      this.score(p, 4, t.mode, false);
      return { ok: false, error: "partie invalide (" + (bad ?? "graine") + ")", status: 400 };
    }
    if (this.queue.length > 40) return { ok: false, error: "serveur occupé, réessaie plus tard", status: 503 };
    p.t = null; // un seul envoi par ticket
    this.touch();
    const out = await this.enqueue(spec, Array.isArray(b.log) ? (b.log as number[]) : []);
    const elapsed = this.now() - t.at;
    let pl: Placement;
    let won = false;
    let note: string | undefined;
    if (!out.complete) {
      pl = { place: out.players, players: out.players, abandon: true };
      note = "partie incomplète : comptée comme abandon";
    } else if (out.ticks * DT * 1000 > elapsed + CLOCK_SLACK_MS) {
      pl = { place: out.players, players: out.players, abandon: true };
      note = "partie envoyée trop vite : refusée";
    } else {
      pl = { place: out.won ? 1 : Math.max(1, out.place), players: out.players, draw: out.draw };
      won = out.won;
    }
    if (b.name !== undefined) p.n = cleanLbName(b.name);
    const delta = this.score(p, columnOf(pl), t.mode, won, !!pl.draw);
    return { ok: true, delta, points: p.p, week: p.w, place: pl.abandon ? null : pl.place, draw: !!pl.draw, note, pos: this.position(b.id as string, "all"), weekPos: this.position(b.id as string, "week") };
  }

  private enqueue(spec: RankedSpec, log: number[]): Promise<ReplayOutcome> {
    return new Promise((resolve) => {
      this.queue.push(async () => {
        const r = new Replay(spec, log);
        let out: ReplayOutcome | null = null;
        while (!(out = r.run(this.chunk))) await new Promise((ok) => setImmediate(ok));
        resolve(out);
      });
      void this.drain();
    });
  }
  private async drain() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) {
      const job = this.queue.shift()!;
      try {
        await job();
      } catch (e) {
        console.warn("classement : rejeu impossible", (e as Error).message);
      }
    }
    this.busy = false;
  }

  private ranking(board: "all" | "week"): string[] {
    const wk = weekOf(this.now());
    if (this.sorted.wk !== wk) this.sorted = { all: null, week: null, wk };
    const cached = this.sorted[board];
    if (cached) return cached;
    const P = this.doc.players;
    const ids =
      board === "all"
        ? Object.keys(P).filter((id) => !P[id].x && P[id].g > 0).sort((a, b) => P[b].p - P[a].p || P[a].s - P[b].s)
        : Object.keys(P).filter((id) => !P[id].x && P[id].wk === wk && P[id].w > 0).sort((a, b) => P[b].w - P[a].w || P[a].s - P[b].s);
    this.sorted[board] = ids;
    return ids;
  }

  position(id: string, board: "all" | "week"): number | null {
    const i = this.ranking(board).indexOf(id);
    return i < 0 ? null : i + 1;
  }

  async top(board: "all" | "week", id: string | null, limit: number) {
    await this.ready();
    this.rollWeek();
    const P = this.doc.players;
    const ids = this.ranking(board);
    const pts = (pid: string) => (board === "all" ? P[pid].p : P[pid].w);
    const entries: LbEntry[] = ids.slice(0, limit).map((pid) => ({ n: P[pid].n, p: pts(pid), r: rankIndex(P[pid].p), ...(pid === id ? { me: true } : {}) }));
    const me = id && P[id] ? { pos: this.position(id, board), p: board === "all" ? P[id].p : P[id].wk === weekOf(this.now()) ? P[id].w : 0, r: rankIndex(P[id].p), n: P[id].n } : null;
    const last = this.doc.last;
    const lastPos = id && last ? last.top.indexOf(id) : -1;
    return {
      board,
      entries,
      total: ids.length,
      me,
      weekEnds: weekEnd(this.now()),
      last: last ? { week: last.week, pos: lastPos >= 0 ? lastPos + 1 : null } : null,
    };
  }

  async hide(id: string, hidden: boolean) {
    await this.ready();
    const p = this.doc.players[id];
    if (!p) return false;
    if (hidden) p.x = 1;
    else delete p.x;
    this.touch();
    return true;
  }
}

class Limit {
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

async function readJson(req: IncomingMessage, max: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > max) throw new Error("trop gros");
    chunks.push(c as Buffer);
  }
  const v = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  return v && typeof v === "object" ? v : {};
}

export function leaderboardRoutes(svc: LeaderboardService, adminToken: string | undefined, corsOrigin: (req: IncomingMessage) => string | null) {
  const ticketLimit = new Limit(40, 60_000);
  const createLimit = new Limit(12, 86400_000);
  const submitLimit = new Limit(40, 60_000);
  const readLimit = new Limit(60, 60_000);
  return async (req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams): Promise<boolean> => {
    if (!path.startsWith("/api/lb/") && path !== "/api/admin/lb/hide") return false;
    const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store" };
    const origin = corsOrigin(req);
    if (origin) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-headers"] = "authorization, content-type";
      headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
      headers["vary"] = "origin";
    }
    const reply = (status: number, obj: unknown) => {
      res.writeHead(status, headers);
      res.end(JSON.stringify(obj));
      return true;
    };
    if (req.method === "OPTIONS") {
      res.writeHead(origin ? 204 : 403, headers);
      res.end();
      return true;
    }
    const ip = ((req.headers["x-forwarded-for"] as string) ?? req.socket.remoteAddress ?? "?").split(",")[0].trim();
    try {
      if (path === "/api/lb/top" && req.method === "GET") {
        if (!readLimit.allow(ip)) return reply(429, { error: "Trop de requêtes" });
        const board = query.get("board") === "all" ? "all" : "week";
        const limit = Math.max(1, Math.min(100, Number(query.get("limit")) || 50));
        return reply(200, await svc.top(board, query.get("id"), limit));
      }
      if (path === "/api/lb/ticket" && req.method === "POST") {
        if (!ticketLimit.allow(ip)) return reply(429, { error: "Trop de requêtes" });
        const r = await svc.ticket(await readJson(req, 4096), () => createLimit.allow(ip));
        return "error" in r ? reply(r.status ?? 400, { error: r.error }) : reply(200, r);
      }
      if (path === "/api/lb/cancel" && req.method === "POST") return reply(200, await svc.cancel(await readJson(req, 4096)));
      if (path === "/api/lb/submit" && req.method === "POST") {
        if (!submitLimit.allow(ip)) return reply(429, { error: "Trop de requêtes" });
        const r = await svc.submit(await readJson(req, 1_200_000));
        return reply(r.ok ? 200 : (r as { status?: number }).status ?? 400, r);
      }
      if (path === "/api/admin/lb/hide" && req.method === "POST") {
        if (!adminOk(req.headers.authorization, adminToken)) return reply(401, { error: "Clé d'administration incorrecte." });
        const b = await readJson(req, 4096);
        return reply(200, { ok: await svc.hide(String(b.id ?? ""), b.hidden !== false) });
      }
      return reply(404, { error: "Introuvable" });
    } catch (e) {
      return reply(400, { error: "Requête invalide (" + (e as Error).message + ")." });
    }
  };
}
