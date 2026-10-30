import type { Match } from "../core/match";
import { DIRS } from "../core/grid";
import { RULES } from "../core/rules";
import { CHAIN, TOXIC } from "../core/bombs";
import { TILE } from "../core/types";

export interface VirtualBomb {
  tx: number;
  ty: number;
  fuse: number;
  range: number;
  /** bombe toxique : le nuage reste dangereux après l'explosion */
  toxic?: boolean;
  /** réaction en chaîne (bombe du bonus ou relais) : déclenche les bombes proches */
  chain?: boolean;
}

/**
 * Carte de danger : pour chaque case, la fenêtre de temps [start, end]
 * pendant laquelle elle sera en feu (réactions en chaîne comprises).
 * start = Infinity => case sûre.
 */
export interface DangerMap {
  start: Float32Array;
  end: Float32Array;
}

/** Cases touchées par une bombe (même logique que la simulation). */
export function blastCells(
  m: Match,
  tx: number,
  ty: number,
  range: number,
  bombCells: Set<number>,
  out: number[],
): void {
  const g = m.grid;
  out.push(g.idx(tx, ty));
  for (const [dx, dy] of DIRS) {
    for (let i = 1; i <= range; i++) {
      const x = tx + dx * i;
      const y = ty + dy * i;
      const t = g.tile(x, y);
      if (t === TILE.WALL) break;
      const idx = g.idx(x, y);
      out.push(idx);
      if (t === TILE.BLOCK || bombCells.has(idx)) break;
      if (g.bonusAt[idx] >= 0) break;
    }
  }
}

export function computeDanger(m: Match, extra?: VirtualBomb): DangerMap {
  const g = m.grid;
  const n = g.w * g.h;
  const start = new Float32Array(n).fill(Infinity);
  const end = new Float32Array(n).fill(-Infinity);

  const list: VirtualBomb[] = [];
  for (const b of m.bombs.values()) list.push({ tx: b.tx, ty: b.ty, fuse: b.fuse, range: b.range, toxic: b.toxic, chain: b.chainDepth !== undefined && b.chainDepth < CHAIN.maxDepth && !b.flight });
  if (extra) list.push(extra);

  const bombCells = new Set<number>(list.map((b) => g.idx(b.tx, b.ty)));
  const cellToBomb = new Map<number, number>();
  list.forEach((b, i) => cellToBomb.set(g.idx(b.tx, b.ty), i));

  const blasts = list.map((b) => {
    const out: number[] = [];
    blastCells(m, b.tx, b.ty, b.range, bombCells, out);
    return out;
  });

  // réaction en chaîne (bonus) : bombes que chaque bombe « chaîne » déclenchera
  const chainHits = list.map((b) => {
    if (!b.chain) return [] as number[];
    const out: number[] = [];
    for (const [c, d] of m.chainReach(b.tx, b.ty)) if (d > 0 && cellToBomb.has(c)) out.push(c);
    return out;
  });
  const isChain = list.map((b) => !!b.chain);

  // propagation des réactions en chaîne
  const t = list.map((b) => Math.max(0, b.fuse));
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 16) {
    changed = false;
    for (let a = 0; a < list.length; a++) {
      for (const c of blasts[a]) {
        const j = cellToBomb.get(c);
        if (j !== undefined && t[j] > t[a]) {
          t[j] = t[a];
          changed = true;
        }
      }
      for (const c of chainHits[a]) {
        const j = cellToBomb.get(c)!;
        const tj = t[a] + CHAIN.step;
        if (t[j] > tj) {
          t[j] = tj;
          changed = true;
        }
        // les bombes déclenchées relaient la chaîne
        if (!isChain[j]) {
          isChain[j] = true;
          const out: number[] = [];
          for (const [cc, d] of m.chainReach(list[j].tx, list[j].ty)) if (d > 0 && cellToBomb.has(cc)) out.push(cc);
          chainHits[j] = out;
          changed = true;
        }
      }
    }
  }

  for (let a = 0; a < list.length; a++) {
    for (const c of blasts[a]) {
      if (t[a] < start[c]) start[c] = t[a];
      const e = t[a] + (list[a].toxic ? Math.max(m.bombRules.fireDuration, TOXIC.duration) : m.bombRules.fireDuration);
      if (e > end[c]) end[c] = e;
    }
  }
  // flammes déjà présentes
  for (let i = 0; i < n; i++) {
    if (g.fire[i] > 0) {
      start[i] = 0;
      end[i] = Math.max(end[i], g.fire[i]);
    }
  }
  // nuages toxiques en cours (on les évite comme du feu tant qu'ils durent)
  for (const z of m.toxicZones) {
    for (const i of z.cells) {
      start[i] = 0;
      end[i] = Math.max(end[i], z.timeLeft);
    }
  }
  // murs de mort subite imminents
  for (const [x, y, left] of [...m.pendingDrops, ...m.upcomingDrops(6)]) {
    const i = g.idx(x, y);
    start[i] = Math.min(start[i], left);
    end[i] = Infinity;
  }
  // zones annoncées par le mode Chaos
  if (m.chaos?.pending) {
    const dur = m.chaos.pending.def.duration;
    for (const [i, left] of m.chaos.dangerZones()) {
      start[i] = Math.min(start[i], left);
      end[i] = Math.max(end[i], left + dur + m.bombRules.fireDuration);
    }
  }
  for (const run of m.chaos?.active ?? []) {
    for (const i of run.zone) {
      start[i] = 0;
      end[i] = Math.max(end[i], run.timer + m.bombRules.fireDuration);
    }
  }
  // éruptions de cheminées à venir
  for (const v of m.vents) {
    if (g.terrainAt(v[0], v[1]) !== 4) continue;
    const left = m.ventTimeLeft(v);
    if (left > 6) continue;
    for (const [x, y] of m.ventCells(v[0], v[1])) {
      const i = g.idx(x, y);
      start[i] = Math.min(start[i], left);
      end[i] = Math.max(end[i], left + m.bombRules.fireDuration);
    }
  }
  return { start, end };
}
