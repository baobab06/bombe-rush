import type { Match } from "../core/match";
import { DIRS } from "../core/grid";
import { RULES } from "../core/rules";
import { TILE } from "../core/types";

export interface VirtualBomb {
  tx: number;
  ty: number;
  fuse: number;
  range: number;
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
  for (const b of m.bombs.values()) list.push({ tx: b.tx, ty: b.ty, fuse: b.fuse, range: b.range });
  if (extra) list.push(extra);

  const bombCells = new Set<number>(list.map((b) => g.idx(b.tx, b.ty)));
  const cellToBomb = new Map<number, number>();
  list.forEach((b, i) => cellToBomb.set(g.idx(b.tx, b.ty), i));

  const blasts = list.map((b) => {
    const out: number[] = [];
    blastCells(m, b.tx, b.ty, b.range, bombCells, out);
    return out;
  });

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
    }
  }

  for (let a = 0; a < list.length; a++) {
    for (const c of blasts[a]) {
      if (t[a] < start[c]) start[c] = t[a];
      const e = t[a] + RULES.fireDuration;
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
      end[i] = Math.max(end[i], left + dur + RULES.fireDuration);
    }
  }
  for (const run of m.chaos?.active ?? []) {
    for (const i of run.zone) {
      start[i] = 0;
      end[i] = Math.max(end[i], run.timer + RULES.fireDuration);
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
      end[i] = Math.max(end[i], left + RULES.fireDuration);
    }
  }
  return { start, end };
}
