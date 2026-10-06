/**
 * Instantanés d'état : le serveur autoritaire sérialise sa partie, le
 * client l'applique sur une copie locale (« miroir ») qui ne sert qu'à
 * l'affichage et à la prédiction de son propre déplacement.
 */
import { CHAOS_EVENTS } from "../core/chaos";
import type { Match } from "../core/match";
import type { MatchPhase, PlayerState, SimEvent } from "../core/types";

export interface Snapshot {
  tick: number;
  time: number;
  phase: MatchPhase;
  countdown: number;
  winnerId: number;
  suddenDeath: boolean;
  speedMul: number;
  players: PlayerState[];
  /** dernier numéro d'entrée traité, par joueur (réconciliation) */
  acks: number[];
  tiles: string;
  terrain: string;
  /** [idx, temps restant, forme, propriétaire] */
  fire: [number, number, number, number][];
  bombs: [number, number, number, number, number, number, number[], number][];
  bonuses: [number, string, number, number, number, number][];
  pending: [number, number, number][];
  chaos: { pending: [string, number, number[]] | null; active: [string, number, number[]][] } | null;
  events: SimEvent[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function encodeSnapshot(m: Match, acks: number[], events: SimEvent[]): Snapshot {
  const g = m.grid;
  const fire: Snapshot["fire"] = [];
  for (let i = 0; i < g.fire.length; i++) if (g.fire[i] > 0) fire.push([i, r2(g.fire[i]), g.fireShape[i], g.fireOwner[i]]);
  return {
    tick: m.tick,
    time: m.time,
    phase: m.phase,
    countdown: r2(m.countdown),
    winnerId: m.winnerId,
    suddenDeath: m.suddenDeath,
    speedMul: m.speedMul,
    players: m.players.map((p) => ({ ...p, x: r2(p.x * 10) / 10, y: r2(p.y * 10) / 10, stats: { ...p.stats } })),
    acks,
    tiles: Array.from(g.tiles).join(""),
    terrain: Array.from(g.terrain).join(""),
    fire,
    bombs: [...m.bombs.values()].map((b) => [b.id, b.ownerId, b.tx, b.ty, r2(b.fuse), b.range, b.passable, b.fuseTotal]),
    bonuses: [...m.bonuses.values()].map((b) => [b.id, b.type, b.tx, b.ty, r2(b.invuln), r2(b.age)]),
    pending: m.pendingDrops.map(([x, y, l]) => [x, y, r2(l)]),
    chaos: m.chaos
      ? {
          pending: m.chaos.pending ? [m.chaos.pending.def.id, r2(m.chaos.pendingLeft), m.chaos.pending.zone] : null,
          active: m.chaos.active.map((a) => [a.def.id, r2(a.timer), a.zone]),
        }
      : null,
    events,
  };
}

/** Applique un instantané sur le miroir local. `keep` = joueur dont on garde la position prédite. */
export function applySnapshot(m: Match, s: Snapshot, keep = -1): void {
  const g = m.grid;
  m.tick = s.tick;
  m.time = s.time;
  m.phase = s.phase;
  m.countdown = s.countdown;
  m.winnerId = s.winnerId;
  m.suddenDeath = s.suddenDeath;
  m.speedMul = s.speedMul;
  s.players.forEach((sp, i) => {
    const p = m.players[i];
    if (!p) return;
    const { x, y, walkPhase, faceX, faceY, moving } = p;
    Object.assign(p, sp, { stats: { ...sp.stats } });
    if (i === keep && p.alive) Object.assign(p, { x, y, walkPhase, faceX, faceY, moving });
  });
  for (let i = 0; i < g.tiles.length; i++) {
    g.tiles[i] = s.tiles.charCodeAt(i) - 48;
    g.terrain[i] = s.terrain.charCodeAt(i) - 48;
    g.fire[i] = 0;
    g.fireShape[i] = 0;
    g.fireOwner[i] = -1;
    g.bombAt[i] = -1;
    g.bonusAt[i] = -1;
  }
  for (const [i, t, shape, owner] of s.fire) {
    g.fire[i] = t;
    g.fireShape[i] = shape;
    g.fireOwner[i] = owner;
  }
  m.bombs.clear();
  for (const [id, ownerId, tx, ty, fuse, range, passable, fuseTotal] of s.bombs) {
    m.bombs.set(id, { id, ownerId, tx, ty, fuse, fuseTotal, range, passable });
    g.bombAt[g.idx(tx, ty)] = id;
  }
  m.bonuses.clear();
  for (const [id, type, tx, ty, invuln, age] of s.bonuses) {
    m.bonuses.set(id, { id, type, tx, ty, invuln, age });
    g.bonusAt[g.idx(tx, ty)] = id;
  }
  m.pendingDrops.length = 0;
  for (const d of s.pending) m.pendingDrops.push(d);
  if (m.chaos && s.chaos) {
    const def = (id: string) => CHAOS_EVENTS.find((e) => e.id === id)!;
    m.chaos.pending = s.chaos.pending ? { def: def(s.chaos.pending[0]), zone: s.chaos.pending[2], timer: 0, data: {} } : null;
    m.chaos.pendingLeft = s.chaos.pending ? s.chaos.pending[1] : 0;
    m.chaos.active = s.chaos.active.map(([id, timer, zone]) => ({ def: def(id), zone, timer, data: {} }));
  }
}
