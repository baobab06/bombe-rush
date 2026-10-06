import { Rng } from "../core/rng";
import { TERRAIN, TILE, type TileType } from "../core/types";
import type { MapDef } from "./types";

export interface Arena {
  width: number;
  height: number;
  tiles: Uint8Array; // TileType
  terrain: Uint8Array; // TERRAIN
  hiddenBonus: (string | null)[];
  spawns: [number, number][];
}

/**
 * Construit une arène à partir d'un plan.
 * Garanties d'équilibre :
 *  - remplissage symétrique sur les 4 quadrants (miroir H + V) : chaque
 *    spawn voit exactement le même voisinage, bonus cachés compris ;
 *  - autour de chaque spawn, juste assez de place pour poser une bombe et
 *    se cacher hors de son souffle (vérifié, agrandi si besoin) ;
 *  - les spawns sont attribués en coins opposés d'abord.
 */
/** Caractères du plan → sol spécial. */
const TERRAIN_OF: Record<string, number> = {
  L: TERRAIN.LAVA,
  "~": TERRAIN.WATER,
  I: TERRAIN.ICE,
  i: TERRAIN.ICE,
  V: TERRAIN.VENT,
};
/** Cases où l'on peut marcher (une fois le bloc éventuel détruit). */
const WALKABLE = [".", "_", "S", "s", "I", "i", "V"];

export function generateArena(map: MapDef, playerCount: number, seed: number): Arena {
  const rng = new Rng(seed ^ 0x5eed);
  const height = map.layout.length;
  const width = map.layout[0].length;
  const tiles = new Uint8Array(width * height);
  const terrain = new Uint8Array(width * height);
  const hiddenBonus: (string | null)[] = new Array(width * height).fill(null);
  const at = (x: number, y: number) => map.layout[y][x];

  const mainSpawns: [number, number][] = [];
  const extraSpawns: [number, number][] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const c = at(x, y);
      if (c === "S") mainSpawns.push([x, y]);
      if (c === "s") extraSpawns.push([x, y]);
    }

  // Ordre d'attribution : coins opposés en premier (HG, BD, HD, BG)
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const quad = ([x, y]: [number, number]) => (x < cx ? 0 : 1) + (y < cy ? 0 : 2);
  const order = [0, 3, 1, 2];
  mainSpawns.sort((a, b) => order.indexOf(quad(a)) - order.indexOf(quad(b)));
  const useExtra = playerCount > mainSpawns.length;
  const spawns = [...mainSpawns, ...(useExtra ? extraSpawns : [])].slice(
    0,
    Math.max(playerCount, 1),
  );

  // Cases protégées autour des spawns (tous les 'S', et les 's' si utilisés)
  const protectedCells = new Set<number>();
  const open = (x: number, y: number) =>
    x > 0 && y > 0 && x < width - 1 && y < height - 1 && WALKABLE.includes(at(x, y));
  const DIRS4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /**
   * Y a-t-il, dans la zone dégagée, une case où poser la 1re bombe et une
   * cachette atteignable hors de son souffle (portée de départ) ?
   */
  const hasHideSpot = (cells: Set<number>, range: number): boolean => {
    for (const b of cells) {
      const bx = b % width;
      const by = Math.floor(b / width);
      const blast = new Set<number>([b]);
      for (const [dx, dy] of DIRS4)
        for (let i = 1; i <= range; i++) {
          if (!open(bx + dx * i, by + dy * i)) break;
          blast.add((by + dy * i) * width + bx + dx * i);
        }
      // parcours depuis la bombe, à travers la zone dégagée
      const seen = new Set<number>([b]);
      const queue = [b];
      while (queue.length) {
        const c = queue.shift()!;
        if (!blast.has(c)) return true;
        const cx = c % width;
        const cy = Math.floor(c / width);
        for (const [dx, dy] of DIRS4) {
          const n = (cy + dy) * width + cx + dx;
          if (cells.has(n) && !seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
    }
    return false;
  };

  // Zone dégagée minimale : le spawn et ses voisins directs, puis on
  // agrandit case par case seulement si aucune cachette n'existe.
  const clearAround = ([sx, sy]: [number, number]) => {
    const zone = new Set<number>([sy * width + sx]);
    for (const [dx, dy] of DIRS4)
      for (let i = 1; i <= map.spawnClear; i++) {
        if (!open(sx + dx * i, sy + dy * i)) break;
        zone.add((sy + dy * i) * width + sx + dx * i);
      }
    let guard = 0;
    while (!hasHideSpot(zone, map.startRange) && guard++ < 8) {
      // ajoute la case libre voisine la plus proche du spawn
      let best = -1;
      let bestD = Infinity;
      for (const c of zone) {
        const cx = c % width;
        const cy = Math.floor(c / width);
        for (const [dx, dy] of DIRS4) {
          const nx = cx + dx;
          const ny = cy + dy;
          const n = ny * width + nx;
          if (!open(nx, ny) || zone.has(n)) continue;
          const d = Math.abs(nx - sx) + Math.abs(ny - sy) + (n % 7) * 0.01;
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
      }
      if (best < 0) break;
      zone.add(best);
    }
    for (const c of zone) protectedCells.add(c);
  };
  mainSpawns.forEach(clearAround);
  if (useExtra) extraSpawns.forEach(clearAround);

  // Décisions aléatoires prises sur le quadrant canonique puis recopiées
  const canon = (x: number, y: number) =>
    Math.min(y, height - 1 - y) * width + Math.min(x, width - 1 - x);
  const decision = new Map<number, { block: boolean; bonus: string | null }>();
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const k = canon(x, y);
      if (decision.has(k)) continue;
      const block = rng.chance(map.blockDensity);
      const bonus = block && rng.chance(map.bonusChance) ? rng.weighted(map.bonusWeights) : null;
      decision.set(k, { block, bonus });
    }

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const c = at(x, y);
      let t: TileType = TILE.FLOOR;
      terrain[i] = TERRAIN_OF[c] ?? TERRAIN.NONE;
      if (c === "#") t = TILE.WALL;
      else if ((c === "." || c === "I" || (c === "s" && !useExtra)) && !protectedCells.has(i)) {
        const d = decision.get(canon(x, y))!;
        if (d.block) {
          t = TILE.BLOCK;
          hiddenBonus[i] = d.bonus;
        }
      }
      tiles[i] = t;
    }

  return { width, height, tiles, terrain, hiddenBonus, spawns };
}
