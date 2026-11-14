/**
 * PARRAINAGE — « Invite un ami ».
 *
 *  - chaque joueur a un code ami (5 caractères), lié à son jeton secret
 *    d'appareil (le même que pour le multijoueur, jamais affiché) ;
 *  - un nouveau joueur entre le code d'un ami : il reçoit un bonus de
 *    bienvenue (versé par le jeu) ;
 *  - quand il a joué REF_GAMES parties, les deux joueurs gagnent un coffre
 *    rare (récupéré par le jeu via `claim`) ;
 *  - 10 amis maximum par code.
 *
 * Le serveur ne garde que l'empreinte SHA-256 du jeton.
 */
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { KvStore } from "./accounts";
import { generateRoomCode, normalizeCode } from "../src/net/protocol";

export const REF_MAX_FRIENDS = 10;
export const REF_GAMES = 3;
export const REF_WELCOME_COINS = 300;

interface Me {
  code: string;
  name: string;
  /** code du parrain utilisé (une seule fois) */
  usedCode?: string;
  games: number;
  done: boolean;
  /** coffres gagnés pas encore récupérés par le jeu */
  pending: number;
}

interface Friend {
  h: string;
  name: string;
  games: number;
  done: boolean;
}

const hash = (token: string) => createHash("sha256").update("ref:" + token).digest("hex").slice(0, 32);
const cleanName = (n: unknown) =>
  String(n ?? "")
    .replace(/[<>&"]/g, "")
    .trim()
    .slice(0, 16) || "Joueur";

export class ReferralService {
  constructor(
    private kv: KvStore,
    private newCode: () => string = generateRoomCode,
  ) {}

  private async getMe(h: string): Promise<Me | null> {
    const raw = await this.kv.get(`ref:me:${h}`);
    return raw ? (JSON.parse(raw) as Me) : null;
  }
  private async saveMe(h: string, me: Me) {
    await this.kv.set(`ref:me:${h}`, JSON.stringify(me));
  }
  private async friends(code: string): Promise<Friend[]> {
    const raw = await this.kv.get(`ref:fr:${code}`);
    return raw ? (JSON.parse(raw) as Friend[]) : [];
  }
  private async saveFriends(code: string, list: Friend[]) {
    await this.kv.set(`ref:fr:${code}`, JSON.stringify(list));
  }

  /** Profil de parrainage (créé au premier appel, avec un code unique). */
  private async ensure(token: string, name: unknown): Promise<{ h: string; me: Me }> {
    const h = hash(token);
    let me = await this.getMe(h);
    if (!me) {
      let code = "";
      for (let i = 0; i < 20 && !code; i++) {
        const c = this.newCode();
        if (await this.kv.setNX(`ref:code:${c}`, h)) code = c;
      }
      if (!code) throw new Error("code indisponible");
      me = { code, name: cleanName(name), games: 0, done: false, pending: 0 };
      await this.saveMe(h, me);
    } else if (name && cleanName(name) !== me.name) {
      me.name = cleanName(name);
      await this.saveMe(h, me);
    }
    return { h, me };
  }

  private async view(me: Me) {
    const list = await this.friends(me.code);
    return {
      code: me.code,
      used: me.usedCode ?? null,
      games: me.games,
      done: me.done,
      pending: me.pending,
      friends: list.map((f) => ({ name: f.name, games: Math.min(REF_GAMES, f.games), done: f.done })),
      max: REF_MAX_FRIENDS,
      need: REF_GAMES,
      welcome: REF_WELCOME_COINS,
    };
  }

  async me(body: { token?: unknown; name?: unknown }) {
    const token = tok(body.token);
    if (!token) return { error: "Jeton manquant", status: 400 };
    const { me } = await this.ensure(token, body.name);
    return this.view(me);
  }

  /** Le joueur entre le code d'un ami. */
  async use(body: { token?: unknown; name?: unknown; code?: unknown }) {
    const token = tok(body.token);
    if (!token) return { error: "Jeton manquant", status: 400 };
    const code = normalizeCode(String(body.code ?? ""));
    if (code.length !== 5) return { error: "Le code ami fait 5 caractères." };
    const { h, me } = await this.ensure(token, body.name);
    if (me.usedCode) return { error: "Tu as déjà utilisé un code ami." };
    if (code === me.code) return { error: "C'est ton propre code 😉 Envoie-le à un ami !" };
    const owner = await this.kv.get(`ref:code:${code}`);
    if (!owner) return { error: "Ce code ami n'existe pas. Vérifie-le." };
    const list = await this.friends(code);
    if (list.length >= REF_MAX_FRIENDS) return { error: "Ce code a déjà été utilisé par 10 amis." };
    me.usedCode = code;
    me.games = 0;
    me.done = false;
    await this.saveMe(h, me);
    list.push({ h, name: me.name, games: 0, done: false });
    await this.saveFriends(code, list);
    const ownerMe = await this.getMe(owner);
    return { ok: true, welcome: REF_WELCOME_COINS, friend: ownerMe?.name ?? "ton ami", ...(await this.view(me)) };
  }

  /** Une partie terminée par un joueur parrainé. */
  async progress(body: { token?: unknown }) {
    const token = tok(body.token);
    if (!token) return { error: "Jeton manquant", status: 400 };
    const h = hash(token);
    const me = await this.getMe(h);
    if (!me || !me.usedCode || me.done) return { ok: true, games: me?.games ?? 0, done: !!me?.done };
    me.games = Math.min(REF_GAMES, me.games + 1);
    if (me.games >= REF_GAMES) {
      me.done = true;
      me.pending++;
    }
    await this.saveMe(h, me);
    const list = await this.friends(me.usedCode);
    const f = list.find((x) => x.h === h);
    if (f) {
      f.games = me.games;
      f.done = me.done;
      f.name = me.name;
      await this.saveFriends(me.usedCode, list);
    }
    if (me.done) {
      const owner = await this.kv.get(`ref:code:${me.usedCode}`);
      const om = owner ? await this.getMe(owner) : null;
      if (owner && om) {
        om.pending++;
        await this.saveMe(owner, om);
      }
    }
    return { ok: true, games: me.games, done: me.done };
  }

  /** Coffres gagnés à remettre au joueur (remis une seule fois). */
  async claim(body: { token?: unknown }) {
    const token = tok(body.token);
    if (!token) return { error: "Jeton manquant", status: 400 };
    const h = hash(token);
    const me = await this.getMe(h);
    if (!me || !me.pending) return { chests: 0 };
    const n = me.pending;
    me.pending = 0;
    await this.saveMe(h, me);
    return { chests: n };
  }
}

const tok = (t: unknown) => (typeof t === "string" && /^[0-9a-f]{16,64}$/.test(t) ? t : null);

async function readJson(req: IncomingMessage, max: number): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const ch of req) {
    size += (ch as Buffer).length;
    if (size > max) throw new Error("trop gros");
    chunks.push(ch as Buffer);
  }
  return chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>) : {};
}

/** Petite limite de débit par adresse. */
class Limit {
  private hits = new Map<string, { n: number; t: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}
  allow(key: string) {
    const now = Date.now();
    const e = this.hits.get(key);
    if (!e || now - e.t > this.windowMs) {
      this.hits.set(key, { n: 1, t: now });
      if (this.hits.size > 5000) this.hits.clear();
      return true;
    }
    return ++e.n <= this.max;
  }
}

export function referralRoutes(svc: ReferralService, corsOrigin: (req: IncomingMessage) => string | null) {
  const limit = new Limit(60, 60_000);
  const useLimit = new Limit(10, 3600_000);
  return async (req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> => {
    if (!path.startsWith("/api/ref/")) return false;
    const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store" };
    const origin = corsOrigin(req);
    if (origin) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-headers"] = "content-type";
      headers["access-control-allow-methods"] = "POST, OPTIONS";
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
    if (req.method !== "POST") return reply(405, { error: "POST attendu" });
    const ip = ((req.headers["x-forwarded-for"] as string) ?? req.socket.remoteAddress ?? "?").split(",")[0].trim();
    if (!limit.allow(ip)) return reply(429, { error: "Trop de requêtes, réessaie dans un instant." });
    try {
      const body = await readJson(req, 2048);
      let r: Record<string, unknown>;
      if (path === "/api/ref/me") r = await svc.me(body);
      else if (path === "/api/ref/use") {
        if (!useLimit.allow(ip)) return reply(429, { error: "Trop d'essais, réessaie plus tard." });
        r = await svc.use(body);
      } else if (path === "/api/ref/progress") r = await svc.progress(body);
      else if (path === "/api/ref/claim") r = await svc.claim(body);
      else return reply(404, { error: "Introuvable" });
      return reply("error" in r ? Number(r.status ?? 400) : 200, r);
    } catch (e) {
      return reply(400, { error: "Requête invalide (" + (e as Error).message + ")." });
    }
  };
}
