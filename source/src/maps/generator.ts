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
 *  - les positions de départ sont tirées au hasard à chaque partie
 *    (voir pickSpawns), toujours en miroir pour rester équitables.
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
const WALKABLE = [".", "_", "S", "s", "I", "i", "V", "z"];

/** Réglages du tirage des positions de départ. */
export const SPAWN_RULES = {
  /**
   * Distance minimale (en cases, de Manhattan) entre deux joueurs, essayée
   * dans l'ordre : on n'assouplit que si la map est trop petite.
   */
  minDistance: [5, 4, 3, 2],
  /** refuser les départs en cul-de-sac (une seule case libre à côté) */
  noDeadEnd: true,
  /** aucune case de départ à moins de cette distance d'une cheminée volcanique */
  ventMargin: 2,
} as const;

/** Cases qui ne reçoivent jamais de bloc (hors positions de départ). */
/** (z = dalle de zone des cartes Domination) */
const ALWAYS_FREE = ["_", "i", "z"];
/** Cases où un joueur peut commencer (pas de glace, de cheminée, de lave, d'eau ni de mur). */
const SPAWNABLE = [".", "_", "S", "s"];

export function generateArena(map: MapDef, playerCount: number, seed: number): Arena {
  const rng = new Rng(seed ^ 0x5eed);
  const height = map.layout.length;
  const width = map.layout[0].length;
  const tiles = new Uint8Array(width * height);
  const terrain = new Uint8Array(width * height);
  const hiddenBonus: (string | null)[] = new Array(width * height).fill(null);
  const at = (x: number, y: number) => map.layout[y][x];
  const count = Math.max(playerCount, 1);

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
  const zoneAround = ([sx, sy]: [number, number]): Set<number> => {
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
    return zone;
  };

  const plan = pickSpawns(map, count, seed, { open, zoneAround, hasHideSpot });
  const spawns = plan.spawns;
  // jamais de position impossible : mieux vaut refuser une map trop petite
  if (spawns.length < count) throw new Error(`Map « ${map.id} » trop petite pour ${count} joueurs`);

  // Cases protégées (jamais de bloc) : les zones de départ du plan retenu
  const protectedCells = new Set<number>();
  for (const z of plan.zones) for (const c of z) protectedCells.add(c);
  // une case 's' inutilisée reste une case ordinaire (elle peut recevoir un bloc)
  const extraIsFloor = plan.fixed && plan.useExtra;

  // Décisions aléatoires prises sur le quadrant canonique puis recopiées
  const canon = (x: number, y: number) =>
    Math.min(y, height - 1 - y) * width + Math.min(x, width - 1 - x);
  const decision = new Map<number, { block: boolean; bonus: string | null }>();
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const k = canon(x, y);
      if (decision.has(k)) continue;
      const block = rng.chance(map.blockDensity);
      // le butin n'est plus décidé ici : il est tiré quand le bloc est détruit (core/loot.ts)
      decision.set(k, { block, bonus: null });
    }

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const c = at(x, y);
      let t: TileType = TILE.FLOOR;
      terrain[i] = TERRAIN_OF[c] ?? TERRAIN.NONE;
      if (c === "#") t = TILE.WALL;
      else if (
        (c === "." || c === "I" || (c === "s" && !extraIsFloor) || (c === "S" && !plan.fixed)) &&
        !protectedCells.has(i)
      ) {
        const d = decision.get(canon(x, y))!;
        if (d.block) {
          t = TILE.BLOCK;
          hiddenBonus[i] = d.bonus;
        }
      }
      tiles[i] = t;
    }

  // Chaque zone de départ est fermée par des blocs (comme sur une map pleine) :
  // sur une map aérée, un joueur ne doit pas pouvoir rejoindre un autre avant
  // d'avoir cassé quelque chose. Les zones étant symétriques, la map le reste.
  const blockable = (x: number, y: number) => {
    const c = at(x, y);
    return c === "." || c === "I" || (c === "s" && !extraIsFloor) || (c === "S" && !plan.fixed);
  };
  for (const zone of plan.zones) {
    const area = reachFree(map.layout, zone);
    for (const c of area) {
      const x = c % width;
      const y = Math.floor(c / width);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const n = ny * width + nx;
        if (area.has(n) || protectedCells.has(n)) continue;
        if (tiles[n] === TILE.FLOOR && blockable(nx, ny)) tiles[n] = TILE.BLOCK;
      }
    }
  }

  return { width, height, tiles, terrain, hiddenBonus, spawns };
}

/**
 * Une zone de départ, plus les cases qui ne reçoivent jamais de bloc
 * ('_' clairière, 'i' glace libre) qu'elle touche de proche en proche.
 */
function reachFree(layout: string[], zone: Set<number>): Set<number> {
  const height = layout.length;
  const width = layout[0].length;
  const free = (x: number, y: number) => x > 0 && y > 0 && x < width - 1 && y < height - 1 && ALWAYS_FREE.includes(layout[y][x]);
  const out = new Set(zone);
  const queue = [...zone];
  while (queue.length) {
    const c = queue.pop()!;
    const x = c % width;
    const y = Math.floor(c / width);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const n = ny * width + nx;
      if (!out.has(n) && free(nx, ny)) {
        out.add(n);
        queue.push(n);
      }
    }
  }
  return out;
}

// =====================================================================
// Positions de départ aléatoires
// =====================================================================

interface SpawnTools {
  open(x: number, y: number): boolean;
  zoneAround(s: [number, number]): Set<number>;
  hasHideSpot(cells: Set<number>, range: number): boolean;
}

export interface SpawnPlan {
  /** une position par joueur, dans l'ordre des joueurs (sans doublon) */
  spawns: [number, number][];
  /** zones dégagées à protéger des blocs (toujours symétriques) */
  zones: Set<number>[];
  /** true = positions fixes du plan (secours) ; false = tirage aléatoire */
  fixed: boolean;
  useExtra: boolean;
}

const manhattan = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

/**
 * Choisit les positions de départ d'une partie, à partir de sa graine
 * (même graine = mêmes positions sur le serveur et sur chaque téléphone).
 *
 * - On tire une case dans le quart haut-gauche, puis on la recopie en miroir
 *   dans les 3 autres quarts : comme les blocs sont eux aussi symétriques,
 *   chaque joueur a exactement le même voisinage (aucun avantage).
 * - 5-6 joueurs : une paire de cases en plus, en miroir sur l'axe central.
 * - Chaque case : sol praticable (ni mur, ni lave, ni eau, ni glace, ni
 *   cheminée), loin des cheminées, avec une cachette garantie hors du souffle
 *   de la 1re bombe, et des zones de départ séparées par au moins un bloc.
 * - Toutes les possibilités sont listées puis tirées au sort : aucune boucle
 *   de recherche au hasard, donc rien d'infini, même sur une petite map.
 * - Les joueurs sont ensuite répartis au hasard sur les cases retenues.
 * - Si aucune combinaison n'est possible : positions fixes du plan (S / s).
 */
export function pickSpawns(map: MapDef, count: number, seed: number, tools: SpawnTools): SpawnPlan {
  const rng = new Rng((seed ^ 0x5a17_c0de) >>> 0);
  const layout = map.layout;
  const height = layout.length;
  const width = layout[0].length;
  const at = (x: number, y: number) => layout[y][x];
  const idx = (x: number, y: number) => y * width + x;
  const symmetric = width % 2 === 1 && height % 2 === 1 && isMirrorSymmetric(layout);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;

  const vents: [number, number][] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (at(x, y) === "V") vents.push([x, y]);
  const nearVent = (x: number, y: number, d: number) => vents.some((v) => manhattan(v, [x, y]) <= d);

  const spawnable = (x: number, y: number) =>
    x > 0 && y > 0 && x < width - 1 && y < height - 1 && SPAWNABLE.includes(at(x, y)) && !nearVent(x, y, SPAWN_RULES.ventMargin);

  const mirroredZone = ([x, y]: [number, number]): Set<number> => {
    const fx = x > cx;
    const fy = y > cy;
    const base = tools.zoneAround([fx ? width - 1 - x : x, fy ? height - 1 - y : y]);
    const out = new Set<number>();
    for (const c of base) {
      const bx = c % width;
      const by = Math.floor(c / width);
      out.add(idx(fx ? width - 1 - bx : bx, fy ? height - 1 - by : by));
    }
    return out;
  };

  // zone dégagée valide : cachette garantie, à l'écart des éruptions
  const zoneCache = new Map<number, Set<number> | null>();
  const zoneOf = (s: [number, number]): Set<number> | null => {
    const k = idx(s[0], s[1]);
    if (!zoneCache.has(k)) {
      // map symétrique : on calcule la zone dans le quart haut-gauche puis on la
      // recopie en miroir, pour que tous les joueurs aient exactement la même
      const z = symmetric ? mirroredZone(s) : tools.zoneAround(s);
      const ok =
        tools.hasHideSpot(z, map.startRange) &&
        [...z].every((c) => !nearVent(c % width, Math.floor(c / width), 1));
      zoneCache.set(k, ok ? z : null);
    }
    return zoneCache.get(k)!;
  };
  // carte au plan pensé pour ses départs (ex. Château) : positions du plan
  if (map.fixedSpawns) return fixedSpawns(map, count, rng, zoneOf);

  /**
   * Une zone de départ s'étend aussi aux cases qui ne reçoivent jamais de bloc
   * ('_' clairière, 'i' glace libre) qu'elle touche : deux joueurs reliés par
   * ces cases pourraient se rejoindre dès le départ.
   */
  const reach = (zone: Set<number>) => reachFree(layout, zone);

  /** zones disjointes et non collées : au moins une case (bloc) entre deux joueurs */
  const separated = (zonesIn: Set<number>[]) => {
    const zones = zonesIn.map(reach);
    const all = new Map<number, number>();
    for (let zi = 0; zi < zones.length; zi++)
      for (const c of zones[zi]) {
        if (all.has(c)) return false;
        all.set(c, zi);
      }
    for (const [c, zi] of all) {
      const x = c % width;
      const y = Math.floor(c / width);
      for (const n of [idx(x + 1, y), idx(x - 1, y), idx(x, y + 1), idx(x, y - 1)]) {
        const o = all.get(n);
        if (o !== undefined && o !== zi) return false;
      }
    }
    return true;
  };

  /** pas de cul-de-sac : au moins 2 cases libres autour du point de départ, dans sa zone */
  const roomy = (s: [number, number], zone: Set<number>) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => zone.has(idx(s[0] + dx, s[1] + dy))).length >= 2;

  const groupOk = (cells: [number, number][], minD: number): Set<number>[] | null => {
    for (let i = 0; i < cells.length; i++) {
      if (!spawnable(cells[i][0], cells[i][1])) return null;
      for (let j = i + 1; j < cells.length; j++) if (manhattan(cells[i], cells[j]) < minD) return null;
    }
    const zones: Set<number>[] = [];
    for (const c of cells) {
      const z = zoneOf(c);
      if (!z || (SPAWN_RULES.noDeadEnd && !roomy(c, z))) return null;
      zones.push(z);
    }
    return separated(zones) ? zones : null;
  };

  if (symmetric) {
    const mirror4 = (x: number, y: number): [number, number][] => [
      [x, y], // haut-gauche
      [width - 1 - x, height - 1 - y], // bas-droite
      [width - 1 - x, y], // haut-droite
      [x, height - 1 - y], // bas-gauche
    ];
    for (const minD of SPAWN_RULES.minDistance) {
      // toutes les combinaisons valides, listées une fois
      const options: { cells: [number, number][]; zones: Set<number>[] }[] = [];
      const corners: [number, number][][] = [];
      for (let y = 1; y < cy; y++) for (let x = 1; x < cx; x++) if (groupOk(mirror4(x, y), minD)) corners.push(mirror4(x, y));
      if (count <= 4) {
        for (const c of corners) options.push({ cells: c, zones: groupOk(c, minD)! });
      } else {
        // paires sur les axes : colonne centrale (haut/bas) ou ligne centrale (gauche/droite)
        const axisPairs: [number, number][][] = [];
        for (let y = 1; y < cy; y++) axisPairs.push([[cx, y], [cx, height - 1 - y]]);
        for (let x = 1; x < cx; x++) axisPairs.push([[x, cy], [width - 1 - x, cy]]);
        for (const c of corners)
          for (const a of axisPairs) {
            const cells = [...c, ...a];
            const zones = groupOk(cells, minD);
            if (zones) options.push({ cells, zones });
          }
      }
      if (!options.length) continue;
      const choice = rng.pick(options);
      let cells = choice.cells.slice(0, 4);
      // 2 joueurs : une diagonale au hasard ; 3 joueurs : 3 coins au hasard
      if (count === 2) cells = rng.chance(0.5) ? [cells[0], cells[1]] : [cells[2], cells[3]];
      else if (count === 3) cells = rng.shuffle(cells).slice(0, 3);
      else if (count === 5) cells = [...cells, rng.pick(choice.cells.slice(4))];
      else if (count >= 6) cells = choice.cells.slice(0, 6);
      if (count === 1) cells = [rng.pick(cells)];
      return {
        spawns: rng.shuffle(cells.slice()),
        // les 4 coins sont toujours dégagés (map symétrique), les axes seulement s'ils servent
        zones: choice.zones,
        fixed: false,
        useExtra: count > 4,
      };
    }
  }
  return fixedSpawns(map, count, rng, zoneOf);
}

/** Le plan est-il identique en miroir horizontal et vertical ? */
function isMirrorSymmetric(layout: string[]): boolean {
  const h = layout.length;
  const w = layout[0].length;
  for (let y = 0; y < h; y++) {
    if (layout[y].length !== w) return false;
    for (let x = 0; x < w; x++) {
      const c = layout[y][x];
      if (layout[y][w - 1 - x] !== c || layout[h - 1 - y][x] !== c) return false;
    }
  }
  return true;
}

/**
 * Secours : les positions fixes du plan ('S' puis 's'), coins opposés
 * d'abord, comme avant. Les joueurs y sont répartis au hasard. S'il manque
 * encore des cases (map trop petite), on complète avec les cases libres les
 * plus éloignées des joueurs déjà placés, sans jamais en réutiliser une.
 */
function fixedSpawns(
  map: MapDef,
  count: number,
  rng: Rng,
  zoneOf: (s: [number, number]) => Set<number> | null,
): SpawnPlan {
  const layout = map.layout;
  const height = layout.length;
  const width = layout[0].length;
  const main: [number, number][] = [];
  const extra: [number, number][] = [];
  const free: [number, number][] = [];
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const c = layout[y][x];
      if (c === "S") main.push([x, y]);
      else if (c === "s") extra.push([x, y]);
      else if (SPAWNABLE.includes(c)) free.push([x, y]);
    }
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const quad = ([x, y]: [number, number]) => (x < cx ? 0 : 1) + (y < cy ? 0 : 2);
  const order = [0, 3, 1, 2];
  main.sort((a, b) => order.indexOf(quad(a)) - order.indexOf(quad(b)));
  // départs en plus : en diagonale d'abord (5e et 6e joueurs face à face)
  extra.sort((a, b) => order.indexOf(quad(a)) - order.indexOf(quad(b)));
  const useExtra = count > main.length;
  // 2 joueurs : deux départs opposés (les plus éloignés), tirés au sort
  if (count === 2 && main.length >= 2) {
    const a = main[Math.floor(rng.next() * main.length)];
    const b = main.filter((c) => c !== a).sort((p, q) => manhattan(a, q) - manhattan(a, p))[0];
    main.splice(0, main.length, a, b, ...main.filter((c) => c !== a && c !== b));
  }
  const chosen = [...main, ...(useExtra ? extra : [])].slice(0, count);
  // complément, sans doublon ni boucle infinie (liste finie)
  while (chosen.length < count && free.length) {
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < free.length; i++) {
      const d = chosen.length ? Math.min(...chosen.map((c) => manhattan(c, free[i]))) : 0;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    chosen.push(free.splice(best, 1)[0]);
  }
  const zones: Set<number>[] = [];
  for (const s of [...main, ...(useExtra ? extra : []), ...chosen.slice(main.length + (useExtra ? extra.length : 0))]) {
    const z = zoneOf(s);
    zones.push(z ?? new Set([s[1] * width + s[0]]));
  }
  return { spawns: rng.shuffle(chosen.slice()), zones, fixed: true, useExtra };
}
