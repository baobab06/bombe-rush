/**
 * SYSTÈME DE JEU — fait tourner une partie autoritaire pour une salle.
 * Réutilise exactement la simulation du client (`src/core`) et les bots.
 */
import { BotBrain } from "../src/ai/bot";
import { CHARACTERS } from "../src/core/characters";
import { Match } from "../src/core/match";
import { DT } from "../src/core/rules";
import { NO_INPUT, type InputCmd, type PlayerSlot, type SimEvent } from "../src/core/types";
import { pickMap } from "../src/maps";
import { encodeSnapshot } from "../src/net/snapshot";
import type { ServerMsg } from "../src/net/protocol";

export interface Seat {
  token: string;
  name: string;
  characterId: string;
  skinId?: string;
  accessoryId?: string;
  trailId?: string;
}

const SNAPSHOT_EVERY = 3; // 60 Hz / 3 = 20 instantanés par seconde
const MAX_QUEUE = 4; // au-delà, on jette les vieilles entrées (latence)

let matchCounter = 0;

export class GameRunner {
  readonly matchId = ++matchCounter;
  readonly match: Match;
  readonly slots: PlayerSlot[];
  /** jeton client → index de joueur */
  readonly seatOf = new Map<string, number>();
  private queues: { seq: number; cmd: InputCmd }[][] = [];
  private lastCmd: InputCmd[] = [];
  private acks: number[] = [];
  private bots: BotBrain[] = [];
  private pendingEvents: SimEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private acc = 0;
  private last = 0;
  private ended = false;

  constructor(
    seats: Seat[],
    opts: { mapId: string; modeId: string; fillBots: boolean; maxPlayers: number },
    private send: (token: string, msg: ServerMsg) => void,
    private onEnd: (winner: number) => void,
  ) {
    const used = new Set(seats.map((s) => s.characterId));
    this.slots = seats.map((s, i) => {
      this.seatOf.set(s.token, i);
      return { name: s.name, characterId: s.characterId, skinId: s.skinId, accessoryId: s.accessoryId, trailId: s.trailId, isBot: false, accountId: s.token };
    });
    if (opts.fillBots) {
      const free = CHARACTERS.filter((c) => !used.has(c.id));
      while (this.slots.length < opts.maxPlayers && free.length) {
        const c = free.shift()!;
        this.slots.push({ name: `${c.name} (bot)`, characterId: c.id, isBot: true, difficulty: "normal" });
      }
    }
    const seed = (Math.random() * 2 ** 31) | 0;
    this.match = new Match({ seed, map: pickMap(opts.mapId), modeId: opts.modeId, players: this.slots });
    this.slots.forEach((slot, i) => {
      this.queues.push([]);
      this.lastCmd.push(NO_INPUT);
      this.acks.push(0);
      if (slot.isBot) this.bots.push(new BotBrain(i, "normal", seed + i));
    });
  }

  start() {
    for (const [token, you] of this.seatOf) this.sendStart(token, you);
    this.last = performance.now();
    this.timer = setInterval(() => this.loop(), 1000 / 120);
  }

  /** (Re)envoie le démarrage + un instantané complet : sert aussi à la reconnexion. */
  sendStart(token: string, you = this.seatOf.get(token)) {
    if (you === undefined) return;
    const m = this.match;
    this.send(token, {
      t: "matchStart",
      matchId: this.matchId,
      seed: m.config.seed,
      mapId: m.config.map.id,
      modeId: m.config.modeId,
      slots: this.slots,
      you,
    });
    this.send(token, { t: "snap", s: encodeSnapshot(m, this.acks, []) });
  }

  input(token: string, seq: number, cmd: InputCmd) {
    const i = this.seatOf.get(token);
    if (i === undefined || seq <= this.acks[i]) return;
    const q = this.queues[i];
    q.push({ seq, cmd: { mx: clamp(cmd.mx), my: clamp(cmd.my), bomb: !!cmd.bomb, ability: !!cmd.ability } });
    // trop d'avance : on garde les plus récentes, sans perdre un appui
    while (q.length > MAX_QUEUE) {
      const old = q.shift()!;
      if (old.cmd.bomb) q[0].cmd.bomb = true;
      if (old.cmd.ability) q[0].cmd.ability = true;
      this.acks[i] = old.seq;
    }
  }

  private loop() {
    const now = performance.now();
    this.acc += Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    while (this.acc >= DT && !this.ended) {
      this.acc -= DT;
      this.tick();
    }
  }

  private tick() {
    const m = this.match;
    const inputs: InputCmd[] = this.slots.map((_, i) => {
      const next = this.queues[i].shift();
      if (next) {
        this.acks[i] = next.seq;
        this.lastCmd[i] = next.cmd;
        return next.cmd;
      }
      // pas d'entrée reçue ce tick : on prolonge le mouvement, sans appui
      const l = this.lastCmd[i];
      return { mx: l.mx, my: l.my, bomb: false, ability: false };
    });
    for (const b of this.bots) inputs[b.playerId] = b.update(m, DT);
    m.step(inputs);
    if (m.events.length) this.pendingEvents.push(...m.events);
    if (m.tick % SNAPSHOT_EVERY === 0 || m.phase === "over") this.broadcastSnap();
    if (m.phase === "over" && !this.ended) {
      this.ended = true;
      this.stop();
      for (const token of this.seatOf.keys()) this.send(token, { t: "matchEnd", winner: m.winnerId });
      this.onEnd(m.winnerId);
    }
  }

  private broadcastSnap() {
    const snap = encodeSnapshot(this.match, this.acks, this.pendingEvents);
    this.pendingEvents = [];
    for (const token of this.seatOf.keys()) this.send(token, { t: "snap", s: snap });
  }

  private lastEmote = new Map<string, number>();
  /** Emote : 1 par seconde maximum et par joueur, seulement s'il est en vie. */
  emote(token: string, id: string) {
    const i = this.seatOf.get(token);
    if (i === undefined || !/^emo-[a-z0-9-]{1,24}$/.test(id) || !this.match.players[i]?.alive) return;
    const now = performance.now();
    if (now - (this.lastEmote.get(token) ?? 0) < 1000) return;
    this.lastEmote.set(token, now);
    for (const t of this.seatOf.keys()) this.send(t, { t: "emote", player: i, id });
  }

  /** Joueur déconnecté : son personnage s'arrête mais reste dans la partie. */
  freeze(token: string) {
    const i = this.seatOf.get(token);
    if (i === undefined) return;
    this.queues[i] = [];
    this.lastCmd[i] = NO_INPUT;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

const clamp = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
