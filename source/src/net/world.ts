/**
 * CLASSEMENT MONDIAL — côté jeu (voir server/leaderboard.ts).
 *
 *  - avant une partie contre les bots : ticket (graine choisie par le serveur) ;
 *  - après : envoi des commandes, le serveur rejoue et compte les points ;
 *  - envoi raté (réseau) : gardé et renvoyé plus tard, avant le ticket suivant.
 *
 * L'identifiant et la clé du joueur sont dans le profil (donc dans la
 * sauvegarde en ligne) et recopiés dans le stockage local par sécurité.
 */
import type { Profile } from "../meta/profile";
import { serverBase } from "./config";
import type { RankedSpec } from "./replay";

const PENDING = "bomberush.worldPending";
const BACKUP = "bomberush.world";
const TICKET_TIMEOUT = 2500;

export interface WorldTicket {
  ticket: string;
  seed: number;
}
export interface WorldResult {
  ok: boolean;
  delta?: number;
  points?: number;
  week?: number;
  place?: number | null;
  pos?: number | null;
  weekPos?: number | null;
  note?: string;
  error?: string;
}
export interface WorldBoard {
  board: "week" | "all";
  entries: { n: string; p: number; r: number; me?: boolean }[];
  total: number;
  me: { pos: number | null; p: number; r: number; n: string } | null;
  weekEnds: number;
  last: { week: string; pos: number | null } | null;
}
interface Pending {
  id: string;
  secret: string;
  ticket: string;
  name: string;
  spec: RankedSpec;
  log: number[];
  at: number;
}

const ls = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* stockage plein ou indisponible : tant pis */
    }
  },
};

async function call<T>(path: string, init?: RequestInit, timeout = 8000): Promise<T> {
  const base = serverBase();
  if (!base) throw new Error("hors ligne");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(base + path, { ...init, signal: ctl.signal, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const data = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (!r.ok) throw Object.assign(new Error(data.error ?? `erreur ${r.status}`), { status: r.status, data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export class WorldRank {
  private flushing: Promise<void> | null = null;
  /** dernier résultat reçu (affiché par l'écran de résultats / le classement) */
  last: WorldResult | null = null;
  onResult: ((r: WorldResult) => void) | null = null;

  constructor(private profile: () => Profile, private persist: () => void) {
    // identifiant perdu du profil (ancienne sauvegarde en ligne) : on reprend la copie locale
    const p = profile();
    if (!p.world.id) {
      try {
        const b = JSON.parse(ls.get(BACKUP) ?? "null") as { id?: string; secret?: string } | null;
        if (b?.id && b.secret) {
          p.world.id = b.id;
          p.world.secret = b.secret;
        }
      } catch {
        /* rien */
      }
    }
  }

  private warmAt = 0;
  /** Réveille le serveur (hébergement gratuit : il s'endort) avant qu'on lance une partie. */
  warm() {
    const base = serverBase();
    if (!base || Date.now() - this.warmAt < 4 * 60_000) return;
    this.warmAt = Date.now();
    fetch(base + "/health", { cache: "no-store" }).catch(() => {});
  }

  get available(): boolean {
    return !!serverBase();
  }

  /** Ticket pour une partie classée ; undefined = partie non classée au niveau mondial (hors ligne…). */
  async ticket(modeId: string, stake: string, bots: number): Promise<WorldTicket | undefined> {
    if (!this.available) return undefined;
    await this.flush();
    const p = this.profile();
    let late = false;
    const req = call<{ id: string; secret?: string; ticket: string; seed: number }>(
      "/api/lb/ticket",
      { method: "POST", body: JSON.stringify({ id: p.world.id || undefined, secret: p.world.secret || undefined, name: p.name, modeId, stake, bots }) },
      15000,
    ).then((r) => {
      if (r.secret) {
        p.world.id = r.id;
        p.world.secret = r.secret;
        ls.set(BACKUP, JSON.stringify({ id: r.id, secret: r.secret }));
        this.persist();
      }
      // arrivé après le début de la partie : on le rend (aucune pénalité)
      if (late) void call("/api/lb/cancel", { method: "POST", body: JSON.stringify({ id: p.world.id, secret: p.world.secret, ticket: r.ticket }) }).catch(() => {});
      return r;
    });
    req.catch(() => {});
    const t = await Promise.race([req, new Promise<null>((ok) => setTimeout(() => ok(null), TICKET_TIMEOUT))]).catch(() => null);
    if (!t) {
      late = true;
      return undefined;
    }
    return { ticket: t.ticket, seed: t.seed };
  }

  /** Partie terminée : envoi au serveur (gardé jusqu'à réussite). */
  submit(t: WorldTicket, replay: { spec: RankedSpec; log: number[] }) {
    const p = this.profile();
    if (!p.world.id) return;
    const pend: Pending = { id: p.world.id, secret: p.world.secret, ticket: t.ticket, name: p.name, spec: replay.spec, log: replay.log, at: Date.now() };
    ls.set(PENDING, JSON.stringify(pend));
    void this.flush();
  }

  /** Renvoie la partie en attente (s'il y en a une). */
  flush(): Promise<void> {
    this.flushing ??= (async () => {
      const raw = ls.get(PENDING);
      if (!raw) return;
      let pend: Pending;
      try {
        pend = JSON.parse(raw) as Pending;
      } catch {
        ls.set(PENDING, null);
        return;
      }
      // trop vieille : abandon (le serveur la compte déjà comme telle au ticket suivant)
      if (Date.now() - pend.at > 3 * 86400_000) return ls.set(PENDING, null);
      try {
        const r = await call<WorldResult>("/api/lb/submit", { method: "POST", body: JSON.stringify(pend) }, 30000);
        ls.set(PENDING, null);
        this.last = r;
        this.remember(r);
        this.onResult?.(r);
      } catch (e) {
        const st = (e as { status?: number }).status;
        // refusée définitivement (ticket inconnu, partie invalide) : on l'oublie
        if (st && st >= 400 && st < 500 && st !== 429) {
          ls.set(PENDING, null);
          const r: WorldResult = { ok: false, error: (e as Error).message };
          this.last = r;
          this.onResult?.(r);
        }
      }
    })().finally(() => (this.flushing = null));
    return this.flushing;
  }

  private remember(r: WorldResult) {
    const p = this.profile();
    if (r.points !== undefined) p.world.points = r.points;
    if (r.pos !== undefined) p.world.pos = r.pos ?? 0;
    this.persist();
  }

  async board(board: "week" | "all"): Promise<WorldBoard> {
    const p = this.profile();
    const b = await call<WorldBoard>(`/api/lb/top?board=${board}&limit=100${p.world.id ? `&id=${encodeURIComponent(p.world.id)}` : ""}`);
    if (board === "all" && b.me) {
      p.world.points = b.me.p;
      p.world.pos = b.me.pos ?? 0;
      this.persist();
    }
    return b;
  }
}
