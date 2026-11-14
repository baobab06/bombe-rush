/**
 * SYSTÈME DE MATCHMAKING — file d'attente de la « Partie rapide ».
 *
 * Les joueurs en file sont regroupés par 4. Si personne d'autre n'arrive
 * pendant `maxWaitS` secondes, la partie démarre quand même : les places
 * vides sont prises par des bots (on ne reste jamais bloqué).
 */
import { QUICK_MAX_WAIT_S, type ServerMsg } from "../src/net/protocol";
import type { Client, Lobby } from "./lobby";

export class Matchmaker {
  private queue: Client[] = [];
  private waitingSince = new Map<string, number>();

  constructor(
    private lobby: Lobby,
    private send: (token: string, msg: ServerMsg) => void,
    private opts = { minPlayers: 1, maxPlayers: 4, maxWaitS: QUICK_MAX_WAIT_S },
    private now: () => number = Date.now,
  ) {}

  enqueue(c: Client) {
    if (c.room) this.lobby.leave(c);
    if (!this.queue.some((q) => q.token === c.token)) {
      this.queue.push(c);
      this.waitingSince.set(c.token, this.now());
    }
    this.broadcast();
  }

  dequeue(c: Client, notify = true) {
    const was = this.queue.some((q) => q.token === c.token);
    this.queue = this.queue.filter((q) => q.token !== c.token);
    this.waitingSince.delete(c.token);
    if (notify) this.send(c.token, { t: "queue", players: null });
    if (was) this.broadcast();
  }

  has(c: Client) {
    return this.queue.some((q) => q.token === c.token);
  }

  /** État de la file envoyé à chaque joueur qui attend. */
  private broadcast() {
    const t = this.now();
    const oldest = this.queue[0] ? this.waitingSince.get(this.queue[0].token) ?? t : t;
    const waited = Math.min(this.opts.maxWaitS, Math.max(0, Math.floor((t - oldest) / 1000)));
    const group = this.queue.slice(0, this.opts.maxPlayers);
    for (const c of group) {
      this.send(c.token, {
        t: "queue",
        players: group.map((q) => ({ name: q.name, characterId: q.characterId, you: q.token === c.token || undefined })),
        waited,
        maxWait: this.opts.maxWaitS,
      });
    }
  }

  /** À appeler chaque seconde : forme les parties. */
  tick() {
    // joueurs déconnectés ou entrés dans une salle entre-temps : retirés
    const before = this.queue.length;
    this.queue = this.queue.filter((c) => c.connected && !c.room);
    if (!this.queue.length) return;
    const oldest = (this.now() - (this.waitingSince.get(this.queue[0].token) ?? this.now())) / 1000;
    const enough = this.queue.length >= this.opts.maxPlayers || (this.queue.length >= this.opts.minPlayers && oldest >= this.opts.maxWaitS);
    if (!enough) {
      if (before !== this.queue.length || this.queue.length) this.broadcast();
      return;
    }
    const group = this.queue.splice(0, this.opts.maxPlayers);
    for (const c of group) {
      this.waitingSince.delete(c.token);
      this.send(c.token, { t: "queue", players: null });
    }
    this.lobby.startQuick(group);
    if (this.queue.length) this.broadcast();
  }

  get size() {
    return this.queue.length;
  }
}
