/**
 * SYSTÈME DE MATCHMAKING — file d'attente pour des parties publiques.
 *
 * Prêt côté serveur mais pas encore exposé dans l'interface (aucun bouton ne
 * prétend qu'il existe). Pour l'activer : ajouter les messages
 * `queueJoin` / `queueLeave` au protocole et un bouton « Partie rapide ».
 */
import type { Client, Lobby } from "./lobby";

export class Matchmaker {
  private queue: Client[] = [];
  private waitingSince = new Map<string, number>();

  constructor(private lobby: Lobby, private opts = { minPlayers: 2, maxPlayers: 4, maxWaitS: 20 }) {}

  enqueue(c: Client) {
    if (this.queue.some((q) => q.token === c.token)) return;
    this.queue.push(c);
    this.waitingSince.set(c.token, Date.now());
  }

  dequeue(c: Client) {
    this.queue = this.queue.filter((q) => q.token !== c.token);
    this.waitingSince.delete(c.token);
  }

  /** À appeler chaque seconde : regroupe les joueurs en salles publiques. */
  tick() {
    this.queue = this.queue.filter((c) => c.connected && !c.room);
    const oldest = this.queue[0] ? (Date.now() - (this.waitingSince.get(this.queue[0].token) ?? Date.now())) / 1000 : 0;
    const enough = this.queue.length >= this.opts.maxPlayers || (this.queue.length >= this.opts.minPlayers && oldest > this.opts.maxWaitS);
    if (!enough) return;
    const group = this.queue.splice(0, this.opts.maxPlayers);
    const room = this.lobby.create(group[0], true);
    for (const c of group.slice(1)) this.lobby.join(c, room.code);
    for (const c of group) this.waitingSince.delete(c.token);
  }

  get size() {
    return this.queue.length;
  }
}
