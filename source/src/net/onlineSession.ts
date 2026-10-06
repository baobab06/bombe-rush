import { Match } from "../core/match";
import { NO_INPUT, type InputCmd, type PlayerSlot, type SimEvent } from "../core/types";
import { getMap } from "../maps";
import type { Connection } from "./connection";
import type { GameSession } from "./session";
import { applySnapshot, type Snapshot } from "./snapshot";

const INTERP_DELAY = 100; // ms de retard d'affichage des autres joueurs (lissage)

interface Received {
  at: number;
  pos: { x: number; y: number }[];
}

/**
 * Partie en ligne côté client.
 *  - Le serveur fait autorité : on applique ses instantanés sur un « miroir ».
 *  - Son propre personnage est prédit localement (réactivité immédiate),
 *    puis réconcilié : on rejoue les entrées pas encore confirmées.
 *  - Les autres joueurs sont interpolés entre deux instantanés.
 */
export class OnlineSession implements GameSession {
  readonly match: Match;
  readonly localPlayer: number;
  readonly online = true;
  readonly matchId: number;
  private seq = 0;
  private pending: { seq: number; cmd: InputCmd }[] = [];
  private incoming: Snapshot[] = [];
  private history: Received[] = [];
  private events: SimEvent[] = [];
  serverEnded = false;

  constructor(
    start: { matchId: number; seed: number; mapId: string; modeId: string; slots: PlayerSlot[]; you: number },
    private conn: Connection,
  ) {
    this.matchId = start.matchId;
    this.match = new Match({ seed: start.seed, map: getMap(start.mapId), modeId: start.modeId, players: start.slots });
    this.localPlayer = start.you;
  }

  push(s: Snapshot) {
    this.incoming.push(s);
  }

  step(localInput: InputCmd): void {
    const m = this.match;
    const me = m.players[this.localPlayer];
    // 1. instantanés reçus depuis le dernier tick
    if (this.incoming.length) {
      for (const s of this.incoming) {
        applySnapshot(m, s);
        this.events.push(...s.events);
        this.history.push({ at: performance.now(), pos: s.players.map((p) => ({ x: p.x, y: p.y })) });
        // réconciliation : on repart de la position serveur et on rejoue le reste
        const ack = s.acks[this.localPlayer] ?? 0;
        this.pending = this.pending.filter((p) => p.seq > ack);
      }
      this.incoming = [];
      if (this.history.length > 12) this.history.splice(0, this.history.length - 12);
      if (me.alive && (m.phase === "playing" || m.phase === "ending")) {
        for (const p of this.pending) m.moveWithInput(me, p.cmd);
      }
    }
    // 2. notre entrée : envoyée au serveur et appliquée tout de suite (prédiction)
    const playing = me.alive && (m.phase === "playing" || m.phase === "ending");
    const cmd = playing ? localInput : NO_INPUT;
    this.seq++;
    this.conn.send({ t: "input", seq: this.seq, cmd });
    if (playing) {
      this.pending.push({ seq: this.seq, cmd });
      if (this.pending.length > 120) this.pending.shift();
      m.moveWithInput(me, cmd);
    }
    // 3. les autres joueurs : interpolation légèrement dans le passé
    this.interpolateOthers();
    // 4. événements (sons, particules) à jouer ce tick
    m.events = this.events;
    this.events = [];
  }

  private interpolateOthers() {
    const h = this.history;
    if (h.length < 2) return;
    const t = performance.now() - INTERP_DELAY;
    let a = h[0];
    let b = h[1];
    for (let i = 1; i < h.length; i++) {
      if (h[i].at >= t) {
        a = h[i - 1];
        b = h[i];
        break;
      }
      a = h[i - 1];
      b = h[i];
    }
    const k = b.at === a.at ? 1 : Math.max(0, Math.min(1, (t - a.at) / (b.at - a.at)));
    this.match.players.forEach((p, i) => {
      if (i === this.localPlayer || !p.alive || !a.pos[i] || !b.pos[i]) return;
      // grand saut (téléportation, réapparition) : pas d'interpolation
      if (Math.abs(b.pos[i].x - a.pos[i].x) + Math.abs(b.pos[i].y - a.pos[i].y) > 2) return;
      p.x = a.pos[i].x + (b.pos[i].x - a.pos[i].x) * k;
      p.y = a.pos[i].y + (b.pos[i].y - a.pos[i].y) * k;
    });
  }

  dispose(): void {
    this.incoming = [];
    this.pending = [];
  }
}
