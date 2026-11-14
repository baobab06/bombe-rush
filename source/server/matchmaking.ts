/**
 * SYSTÈME DE MATCHMAKING — ce qui se passe quand on appuie sur JOUER.
 *
 * Une file par choix (Compétition, Classique, Chaos, Domination). Pendant
 * `maxWaitS` secondes, on attend d'autres vrais joueurs :
 *  - 4 joueurs : la partie démarre tout de suite ;
 *  - 2 ou 3 joueurs au bout de l'attente : la partie démarre, des bots
 *    complètent jusqu'à 4 ;
 *  - seul au bout de l'attente : le serveur répond « solo » et le jeu lance
 *    une partie normale contre l'ordinateur, sur le téléphone.
 */
import { QUICK_MAX_WAIT_S, type QueueKind, type ServerMsg } from "../src/net/protocol";
import type { Difficulty } from "../src/core/types";
import type { Client, Lobby } from "./lobby";

const DIFFS: Difficulty[] = ["easy", "normal", "hard", "expert"];
const KINDS = ["comp", "classic", "chaos", "koth"];

interface Entry {
  c: Client;
  since: number;
  bots?: Difficulty[];
}

export class Matchmaker {
  private queues = new Map<QueueKind, Entry[]>();

  constructor(
    private lobby: Lobby,
    private send: (token: string, msg: ServerMsg) => void,
    private opts = { maxPlayers: 4, maxWaitS: QUICK_MAX_WAIT_S },
    private now: () => number = Date.now,
  ) {}

  enqueue(c: Client, kind: QueueKind = "comp", bots?: unknown) {
    if (c.room) this.lobby.leave(c);
    if (!KINDS.includes(kind)) kind = "comp";
    this.remove(c);
    const lv = Array.isArray(bots) ? (bots.filter((b) => DIFFS.includes(b as Difficulty)).slice(0, 3) as Difficulty[]) : undefined;
    const q = this.queues.get(kind) ?? [];
    q.push({ c, since: this.now(), bots: lv?.length ? lv : undefined });
    this.queues.set(kind, q);
    this.broadcast(kind);
  }

  dequeue(c: Client, notify = true) {
    const kind = this.remove(c);
    if (notify) this.send(c.token, { t: "queue", players: null });
    if (kind) this.broadcast(kind);
  }

  private remove(c: Client): QueueKind | null {
    for (const [kind, q] of this.queues) {
      const i = q.findIndex((e) => e.c.token === c.token);
      if (i >= 0) {
        q.splice(i, 1);
        return kind;
      }
    }
    return null;
  }

  has(c: Client) {
    return [...this.queues.values()].some((q) => q.some((e) => e.c.token === c.token));
  }

  /** État de la file envoyé à chaque joueur qui attend. */
  private broadcast(kind: QueueKind) {
    const q = this.queues.get(kind) ?? [];
    const t = this.now();
    const group = q.slice(0, this.opts.maxPlayers);
    const waited = group[0] ? Math.min(this.opts.maxWaitS, Math.max(0, Math.floor((t - group[0].since) / 1000))) : 0;
    for (const e of group) {
      this.send(e.c.token, {
        t: "queue",
        players: group.map((g) => ({ name: g.c.name, characterId: g.c.characterId, you: g.c.token === e.c.token || undefined })),
        waited,
        maxWait: this.opts.maxWaitS,
      });
    }
  }

  /** À appeler chaque seconde : forme les parties. */
  tick() {
    for (const [kind, all] of this.queues) {
      // joueurs déconnectés ou entrés dans une salle entre-temps : retirés
      const q = all.filter((e) => e.c.connected && !e.c.room);
      this.queues.set(kind, q);
      while (q.length) {
        const waited = (this.now() - q[0].since) / 1000;
        if (q.length >= this.opts.maxPlayers || (q.length >= 2 && waited >= this.opts.maxWaitS)) {
          const group = q.splice(0, this.opts.maxPlayers);
          for (const e of group) this.send(e.c.token, { t: "queue", players: null });
          this.lobby.startQuick(
            group.map((e) => e.c),
            kind,
            group[0].bots,
          );
          continue;
        }
        if (q.length === 1 && waited >= this.opts.maxWaitS) {
          // personne d'autre : partie contre l'ordinateur sur le téléphone
          const e = q.shift()!;
          this.send(e.c.token, { t: "queue", players: null, solo: true });
          continue;
        }
        break;
      }
      if (q.length) this.broadcast(kind);
    }
  }

  get size() {
    let n = 0;
    for (const q of this.queues.values()) n += q.length;
    return n;
  }
}
