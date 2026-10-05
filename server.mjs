// server/index.ts
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// src/net/protocol.ts
var PROTOCOL_VERSION = 1;
var MAX_ROOM_PLAYERS = 4;
var RECONNECT_GRACE_S = 45;
var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateRoomCode(rand = Math.random) {
  let s = "";
  for (let i = 0;i < 5; i++)
    s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}
function normalizeCode(input) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

// src/core/characters.ts
var CHARACTERS = [
  { id: "renard", name: "Flamme", kind: "fox", tagline: "Renard malin" },
  { id: "boulon", name: "Boulon", kind: "robot", tagline: "Robot de chantier" },
  { id: "rainette", name: "Rainette", kind: "frog", tagline: "Grenouille sauteuse" },
  { id: "kage", name: "Kage", kind: "ninja", tagline: "Ninja discret" },
  { id: "champi", name: "Champi", kind: "mushroom", tagline: "Champignon têtu" },
  { id: "bruno", name: "Bruno", kind: "bear", tagline: "Ourson costaud" }
];
var P = (main, dark, light, accent) => ({ main, dark, light, accent });
var SKINS = [
  { id: "renard", characterId: "renard", name: "Classique", price: 0, rarity: "base", palette: P("#ff8a2b", "#c4520c", "#fff1df", "#3a2418") },
  { id: "renard-arctique", characterId: "renard", name: "Arctique", price: 150, rarity: "rare", palette: P("#e9f4ff", "#9cb8d6", "#ffffff", "#3e5f8a"), accessory: "scarf" },
  { id: "renard-ombre", characterId: "renard", name: "Ombre", price: 300, rarity: "epic", palette: P("#5b3d8f", "#341f5c", "#d8c9ff", "#ff5fa2"), accessory: "glasses" },
  { id: "renard-or", characterId: "renard", name: "Doré", price: 500, rarity: "legend", palette: P("#ffcc33", "#c98a10", "#fff4c2", "#8a5a00"), accessory: "crown" },
  { id: "boulon", characterId: "boulon", name: "Classique", price: 0, rarity: "base", palette: P("#5aa0ff", "#2c5fb8", "#d6e8ff", "#ffd23f") },
  { id: "boulon-rouille", characterId: "boulon", name: "Rouille", price: 150, rarity: "rare", palette: P("#c8743f", "#7f4120", "#f2cfae", "#5fe0c0") },
  { id: "boulon-neon", characterId: "boulon", name: "Néon", price: 300, rarity: "epic", palette: P("#2a2a3d", "#141422", "#5d5d80", "#ff3fb4"), accessory: "headphones" },
  { id: "boulon-or", characterId: "boulon", name: "Doré", price: 500, rarity: "legend", palette: P("#ffcc33", "#c98a10", "#fff4c2", "#ff5a4f"), accessory: "crown" },
  { id: "rainette", characterId: "rainette", name: "Classique", price: 0, rarity: "base", palette: P("#4fd46a", "#22893c", "#e8ffd0", "#1f6e33") },
  { id: "rainette-tropic", characterId: "rainette", name: "Tropicale", price: 150, rarity: "rare", palette: P("#2fb7ff", "#1470b8", "#fff27a", "#ff8a1f"), accessory: "flower" },
  { id: "rainette-lave", characterId: "rainette", name: "Lave", price: 300, rarity: "epic", palette: P("#ff4b3a", "#a8180f", "#ffd06a", "#2a1010") },
  { id: "rainette-royale", characterId: "rainette", name: "Royale", price: 500, rarity: "legend", palette: P("#9a5cff", "#5c2bb8", "#f0e2ff", "#ffcc33"), accessory: "crown" },
  { id: "kage", characterId: "kage", name: "Classique", price: 0, rarity: "base", palette: P("#3b3f6b", "#1e2140", "#ffd9b8", "#ff4b4b") },
  { id: "kage-neige", characterId: "kage", name: "Neige", price: 150, rarity: "rare", palette: P("#eef2f7", "#a9b4c4", "#ffd9b8", "#3fa2ff") },
  { id: "kage-sakura", characterId: "kage", name: "Sakura", price: 300, rarity: "epic", palette: P("#ff86b8", "#c4467c", "#ffe0cc", "#ffffff"), accessory: "flower" },
  { id: "kage-or", characterId: "kage", name: "Doré", price: 500, rarity: "legend", palette: P("#2a2a2a", "#111111", "#ffd9b8", "#ffcc33"), accessory: "crown" },
  { id: "champi", characterId: "champi", name: "Classique", price: 0, rarity: "base", palette: P("#ff4d4d", "#b81c2a", "#fff3e0", "#ffffff") },
  { id: "champi-cepe", characterId: "champi", name: "Cèpe", price: 150, rarity: "rare", palette: P("#9a5a2c", "#5e3214", "#fff0d6", "#d9a76b") },
  { id: "champi-lumi", characterId: "champi", name: "Lumi", price: 300, rarity: "epic", palette: P("#3fe0e0", "#14808f", "#f2ffff", "#d8ff5a"), accessory: "glasses" },
  { id: "champi-or", characterId: "champi", name: "Doré", price: 500, rarity: "legend", palette: P("#ffcc33", "#c98a10", "#fff7e0", "#ffffff"), accessory: "crown" },
  { id: "bruno", characterId: "bruno", name: "Classique", price: 0, rarity: "base", palette: P("#a8693a", "#6b3e1c", "#f2d2a8", "#3a2414") },
  { id: "bruno-panda", characterId: "bruno", name: "Panda", price: 150, rarity: "rare", palette: P("#f6f6f2", "#2b2b2b", "#ffffff", "#2b2b2b") },
  { id: "bruno-polaire", characterId: "bruno", name: "Polaire", price: 300, rarity: "epic", palette: P("#e8f6ff", "#9cc4dc", "#ffffff", "#2a3a4a"), accessory: "scarf" },
  { id: "bruno-or", characterId: "bruno", name: "Doré", price: 500, rarity: "legend", palette: P("#ffcc33", "#c98a10", "#fff4c2", "#6b3e1c"), accessory: "crown" }
];

// src/core/rules.ts
var RULES = {
  tickRate: 60,
  countdown: 3,
  matchDuration: 150,
  suddenDeathAt: 42,
  suddenDeathInterval: 0.4,
  suddenDeathWarn: 0.7,
  endDelay: 1,
  baseSpeed: 3.4,
  speedPerLevel: 0.45,
  maxSpeedLevel: 5,
  startBombs: 1,
  maxBombs: 8,
  startRange: 1,
  maxRange: 8,
  bombFuse: 2,
  fireDuration: 0.55,
  shieldDuration: 3,
  maxShieldCharges: 1,
  ventPeriod: 9,
  ventStagger: 3,
  ventWarn: 1.6,
  cornerAssist: 0.42
};
var DT = 1 / RULES.tickRate;

// src/core/types.ts
var TILE = { FLOOR: 0, WALL: 1, BLOCK: 2 };
var TERRAIN = {
  NONE: 0,
  LAVA: 1,
  WATER: 2,
  ICE: 3,
  VENT: 4
};
var NO_INPUT = { mx: 0, my: 0, bomb: false, ability: false };
var FIRE = { L: 1, R: 2, U: 4, D: 8, CENTER: 16 };

// src/core/chaos.ts
var burnZone = (m, run, breakBlocks) => {
  for (const i of run.zone)
    m.ignite(i % m.grid.w, Math.floor(i / m.grid.w), breakBlocks);
};
var CHAOS_EVENTS = [
  {
    id: "bombRain",
    label: "PLUIE DE BOMBES",
    emoji: "\uD83D\uDCA3",
    countdown: 3,
    duration: 4,
    weight: 3,
    start(_m, run) {
      run.data.next = 0;
    },
    tick(m, run, dt) {
      run.data.next -= dt;
      if (run.data.next > 0)
        return;
      run.data.next = 0.38;
      const [c] = m.randomFreeCells(1, true);
      if (c)
        m.spawnNeutralBomb(c[0], c[1], RULES.bombFuse, 2);
    }
  },
  {
    id: "flameStorm",
    label: "TEMPÊTE DE FLAMMES",
    emoji: "\uD83D\uDD25",
    countdown: 3,
    duration: 2.5,
    weight: 3,
    prepare(m, run) {
      run.zone = m.randomFreeCells(12, true).map(([x, y]) => m.grid.idx(x, y));
    },
    start(m, run) {
      burnZone(m, run, false);
    },
    tick(m, run) {
      burnZone(m, run, false);
    }
  },
  {
    id: "overload",
    label: "SURCHARGE",
    emoji: "⚡",
    countdown: 0,
    duration: 8,
    weight: 2,
    start(m) {
      m.bonusBoost = true;
      for (const [x, y] of m.randomFreeCells(4, true))
        m.spawnBonus(m.rng.weighted(m.config.map.bonusWeights), x, y);
    },
    end(m) {
      m.bonusBoost = false;
    }
  },
  {
    id: "speedChaos",
    label: "SPEED CHAOS",
    emoji: "\uD83C\uDFC3",
    countdown: 0,
    duration: 7,
    weight: 2,
    start(m) {
      m.speedMul = 1.6;
    },
    end(m) {
      m.speedMul = 1;
    }
  },
  {
    id: "shields",
    label: "BOUCLIERS",
    emoji: "\uD83D\uDEE1️",
    countdown: 0,
    duration: 0.1,
    weight: 2,
    start(m) {
      for (const [x, y] of m.randomFreeCells(3, true))
        m.spawnBonus("shield", x, y);
    }
  },
  {
    id: "megaBlast",
    label: "EXPLOSION GÉANTE",
    emoji: "\uD83D\uDCA5",
    countdown: 3,
    duration: 0.9,
    weight: 2,
    prepare(m, run) {
      const g = m.grid;
      const cx = 3 + m.rng.int(g.w - 6);
      const cy = 3 + m.rng.int(g.h - 6);
      run.zone = [];
      for (let y = cy - 2;y <= cy + 2; y++)
        for (let x = cx - 2;x <= cx + 2; x++)
          if (g.inside(x, y) && g.tile(x, y) !== TILE.WALL)
            run.zone.push(g.idx(x, y));
      run.data.cx = cx;
      run.data.cy = cy;
    },
    start(m, run) {
      burnZone(m, run, true);
    },
    tick(m, run) {
      burnZone(m, run, false);
    }
  }
];
var RANDOM_EVENT = { id: "random", label: "ÉVÉNEMENT ALÉATOIRE", emoji: "\uD83C\uDFB2", weight: 2 };
var CHAOS_TIMING = {
  firstEvent: [9, 13],
  gap: [11, 17]
};

class ChaosDirector {
  m;
  nextIn;
  pending = null;
  pendingLeft = 0;
  active = [];
  count = 0;
  constructor(m) {
    this.m = m;
    const [a, b] = CHAOS_TIMING.firstEvent;
    this.nextIn = a + m.rng.next() * (b - a);
  }
  dangerZones() {
    if (!this.pending)
      return [];
    return this.pending.zone.map((i) => [i, this.pendingLeft]);
  }
  pick() {
    const m = this.m;
    const pool = {};
    for (const e of CHAOS_EVENTS)
      pool[e.id] = e.weight;
    pool[RANDOM_EVENT.id] = RANDOM_EVENT.weight;
    const id = m.rng.weighted(pool);
    if (id === RANDOM_EVENT.id) {
      const inner = {};
      for (const e of CHAOS_EVENTS)
        inner[e.id] = 1;
      const innerId = m.rng.weighted(inner);
      return { def: CHAOS_EVENTS.find((e) => e.id === innerId), via: RANDOM_EVENT.id };
    }
    return { def: CHAOS_EVENTS.find((e) => e.id === id) };
  }
  trigger(id) {
    const def = CHAOS_EVENTS.find((e) => e.id === id);
    if (def)
      this.launch({ def });
  }
  launch({ def, via }) {
    const m = this.m;
    const run = { def, zone: [], timer: def.duration, data: {}, via };
    this.count++;
    def.prepare?.(m, run);
    if (def.countdown > 0) {
      this.pending = run;
      this.pendingLeft = def.countdown;
      m.events.push({ t: "chaosWarn", id: def.id, label: def.label, emoji: def.emoji, seconds: def.countdown });
    } else
      this.begin(run);
  }
  begin(run) {
    const m = this.m;
    m.events.push({ t: "chaosStart", id: run.def.id, label: run.def.label, emoji: run.def.emoji, via: run.via });
    run.def.start(m, run);
    this.active.push(run);
  }
  update(dt) {
    const m = this.m;
    if (m.phase !== "playing")
      return;
    if (this.pending) {
      this.pendingLeft -= dt;
      if (this.pendingLeft <= 0) {
        const run = this.pending;
        this.pending = null;
        this.begin(run);
      }
    }
    for (const run of this.active) {
      run.def.tick?.(m, run, dt);
      run.timer -= dt;
    }
    for (const run of this.active.filter((r) => r.timer <= 0)) {
      run.def.end?.(m, run);
      m.events.push({ t: "chaosEnd", id: run.def.id });
    }
    this.active = this.active.filter((r) => r.timer > 0);
    if (this.pending || this.active.length || m.aliveCount <= 1)
      return;
    this.nextIn -= dt;
    if (this.nextIn > 0)
      return;
    const [a, b] = CHAOS_TIMING.gap;
    this.nextIn = a + m.rng.next() * (b - a);
    this.launch(this.pick());
  }
}

// src/core/modes.ts
var MODES = [
  {
    id: "classic",
    name: "Classique",
    tagline: "Le dernier debout gagne.",
    available: true
  },
  {
    id: "chaos",
    name: "Chaos",
    tagline: "Pluie de bombes, tempêtes, explosions géantes…",
    available: true,
    onStart(m) {
      m.chaos = new ChaosDirector(m);
    },
    onTick(m, dt) {
      m.chaos?.update(dt);
    }
  }
];
function getMode(id) {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}

// src/maps/beach.ts
var BEACH = {
  id: "beach",
  name: "Plage",
  subtitle: "Lagon et châteaux de sable",
  theme: "beach",
  layout: [
    "#############",
    "#S....s....S#",
    "#.#.#.#.#.#.#",
    "#...........#",
    "#.#.~~~~~.#.#",
    "#....~~~....#",
    "#.#.~~~~~.#.#",
    "#...........#",
    "#.#.#.#.#.#.#",
    "#S....s....S#",
    "#############"
  ],
  blockDensity: 1,
  bonusChance: 0.5,
  bonusWeights: { bomb: 60, flame: 18, speed: 12, shield: 10 },
  spawnClear: 1,
  startRange: 1,
  available: true
};

// src/maps/forest.ts
var FOREST = {
  id: "forest",
  name: "Forêt",
  subtitle: "Clairière moussue",
  theme: "forest",
  layout: [
    "#############",
    "#S....s....S#",
    "#.#.#.#.#.#.#",
    "#...........#",
    "#.#.#.#.#.#.#",
    "#...........#",
    "#.#.#.#.#.#.#",
    "#...........#",
    "#.#.#.#.#.#.#",
    "#S....s....S#",
    "#############"
  ],
  blockDensity: 1,
  bonusChance: 0.5,
  bonusWeights: { bomb: 60, flame: 18, speed: 12, shield: 10 },
  spawnClear: 1,
  startRange: 1,
  available: true
};

// src/maps/ice.ts
var ICE = {
  id: "ice",
  name: "Banquise",
  subtitle: "Ça glisse !",
  theme: "ice",
  layout: [
    "#############",
    "#S....s....S#",
    "#.#.#.#.#.#.#",
    "#.IIIIIIIII.#",
    "#.#I#.#.#I#.#",
    "#..I.iii.I..#",
    "#.#I#.#.#I#.#",
    "#.IIIIIIIII.#",
    "#.#.#.#.#.#.#",
    "#S....s....S#",
    "#############"
  ],
  blockDensity: 1,
  bonusChance: 0.5,
  bonusWeights: { bomb: 60, flame: 18, speed: 12, shield: 10 },
  spawnClear: 1,
  startRange: 1,
  available: true
};

// src/maps/volcano.ts
var VOLCANO = {
  id: "volcano",
  name: "Volcan",
  subtitle: "Lave et cheminées",
  theme: "volcano",
  layout: [
    "#############",
    "#S....s....S#",
    "#.#.#.#.#.#.#",
    "#..LL...LL..#",
    "#.#.#.#.#.#.#",
    "#.V.L.V.L.V.#",
    "#.#.#.#.#.#.#",
    "#..LL...LL..#",
    "#.#.#.#.#.#.#",
    "#S....s....S#",
    "#############"
  ],
  blockDensity: 1,
  bonusChance: 0.5,
  bonusWeights: { bomb: 60, flame: 18, speed: 12, shield: 10 },
  spawnClear: 1,
  startRange: 1,
  available: true
};

// src/maps/index.ts
var MAPS = [FOREST, VOLCANO, ICE, BEACH];
var RANDOM_MAP = "random";
function getMap(id) {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
function pickMap(id, rand = Math.random) {
  if (id === RANDOM_MAP)
    return MAPS[Math.floor(rand() * MAPS.length)];
  return getMap(id);
}

// src/core/grid.ts
class Grid {
  w;
  h;
  tiles;
  hiddenBonus;
  terrain;
  fire;
  fireShape;
  fireOwner;
  bombAt;
  bonusAt;
  constructor(arena) {
    this.w = arena.width;
    this.h = arena.height;
    this.tiles = arena.tiles.slice();
    this.hiddenBonus = arena.hiddenBonus.slice();
    this.terrain = arena.terrain.slice();
    const n = this.w * this.h;
    this.fire = new Float32Array(n);
    this.fireShape = new Uint8Array(n);
    this.fireOwner = new Int16Array(n).fill(-1);
    this.bombAt = new Int32Array(n).fill(-1);
    this.bonusAt = new Int32Array(n).fill(-1);
  }
  idx(x, y) {
    return y * this.w + x;
  }
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  tile(x, y) {
    if (!this.inside(x, y))
      return TILE.WALL;
    return this.tiles[this.idx(x, y)];
  }
  terrainAt(x, y) {
    if (!this.inside(x, y))
      return TERRAIN.NONE;
    return this.terrain[this.idx(x, y)];
  }
  isHazard(x, y) {
    const t = this.terrainAt(x, y);
    return t === TERRAIN.LAVA || t === TERRAIN.WATER;
  }
  blocksMove(x, y) {
    return this.isSolid(x, y) || this.isHazard(x, y);
  }
  isSolid(x, y) {
    return this.tile(x, y) !== TILE.FLOOR;
  }
}
var DIRS = [
  [-1, 0, 1],
  [1, 0, 2],
  [0, -1, 4],
  [0, 1, 8]
];

// src/core/rng.ts
class Rng {
  s;
  constructor(seed) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    let t = this.s += 1831565813;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  int(maxExclusive) {
    return Math.floor(this.next() * maxExclusive);
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[this.int(arr.length)];
  }
  shuffle(arr) {
    for (let i = arr.length - 1;i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  weighted(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let r = this.next() * total;
    for (const [k, w] of entries) {
      if ((r -= w) < 0)
        return k;
    }
    return entries[entries.length - 1][0];
  }
}

// src/ai/danger.ts
function blastCells(m, tx, ty, range, bombCells, out) {
  const g = m.grid;
  out.push(g.idx(tx, ty));
  for (const [dx, dy] of DIRS) {
    for (let i = 1;i <= range; i++) {
      const x = tx + dx * i;
      const y = ty + dy * i;
      const t = g.tile(x, y);
      if (t === TILE.WALL)
        break;
      const idx = g.idx(x, y);
      out.push(idx);
      if (t === TILE.BLOCK || bombCells.has(idx))
        break;
      if (g.bonusAt[idx] >= 0)
        break;
    }
  }
}
function computeDanger(m, extra) {
  const g = m.grid;
  const n = g.w * g.h;
  const start = new Float32Array(n).fill(Infinity);
  const end = new Float32Array(n).fill(-Infinity);
  const list = [];
  for (const b of m.bombs.values())
    list.push({ tx: b.tx, ty: b.ty, fuse: b.fuse, range: b.range });
  if (extra)
    list.push(extra);
  const bombCells = new Set(list.map((b) => g.idx(b.tx, b.ty)));
  const cellToBomb = new Map;
  list.forEach((b, i) => cellToBomb.set(g.idx(b.tx, b.ty), i));
  const blasts = list.map((b) => {
    const out = [];
    blastCells(m, b.tx, b.ty, b.range, bombCells, out);
    return out;
  });
  const t = list.map((b) => Math.max(0, b.fuse));
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 16) {
    changed = false;
    for (let a = 0;a < list.length; a++) {
      for (const c of blasts[a]) {
        const j = cellToBomb.get(c);
        if (j !== undefined && t[j] > t[a]) {
          t[j] = t[a];
          changed = true;
        }
      }
    }
  }
  for (let a = 0;a < list.length; a++) {
    for (const c of blasts[a]) {
      if (t[a] < start[c])
        start[c] = t[a];
      const e = t[a] + RULES.fireDuration;
      if (e > end[c])
        end[c] = e;
    }
  }
  for (let i = 0;i < n; i++) {
    if (g.fire[i] > 0) {
      start[i] = 0;
      end[i] = Math.max(end[i], g.fire[i]);
    }
  }
  for (const [x, y, left] of [...m.pendingDrops, ...m.upcomingDrops(6)]) {
    const i = g.idx(x, y);
    start[i] = Math.min(start[i], left);
    end[i] = Infinity;
  }
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
  for (const v of m.vents) {
    if (g.terrainAt(v[0], v[1]) !== 4)
      continue;
    const left = m.ventTimeLeft(v);
    if (left > 6)
      continue;
    for (const [x, y] of m.ventCells(v[0], v[1])) {
      const i = g.idx(x, y);
      start[i] = Math.min(start[i], left);
      end[i] = Math.max(end[i], left + RULES.fireDuration);
    }
  }
  return { start, end };
}

// src/ai/bot.ts
var PROFILES = {
  easy: { think: 0.5, margin: 0.12, bonusRadius: 4, aggression: 0.25, mistake: 0.08, reflex: false, trapRadius: 0, shieldSense: 0.12, escapeRoom: 1 },
  normal: { think: 0.22, margin: 0.22, bonusRadius: 7, aggression: 0.6, mistake: 0.012, reflex: true, trapRadius: 1, shieldSense: 0.25, escapeRoom: 2 },
  hard: { think: 0.1, margin: 0.25, bonusRadius: 11, aggression: 0.9, mistake: 0, reflex: true, trapRadius: 2, shieldSense: 0.35, escapeRoom: 3 }
};

class BotBrain {
  playerId;
  prof;
  rng;
  thinkTimer;
  path = [];
  wantBomb = false;
  wantShield = false;
  lastDecision = "";
  constructor(playerId, difficulty, seed) {
    this.playerId = playerId;
    this.prof = PROFILES[difficulty];
    this.rng = new Rng(seed * 7919 + playerId * 104729);
    this.thinkTimer = this.rng.next() * this.prof.think;
  }
  update(m, dt) {
    const p = m.players[this.playerId];
    const cmd = { mx: 0, my: 0, bomb: false, ability: false };
    if (!p.alive || m.phase !== "playing" && m.phase !== "ending")
      return cmd;
    this.thinkTimer -= dt;
    let mustThink = this.thinkTimer <= 0;
    if (!mustThink && this.prof.reflex && this.path.length) {
      const next = this.path[0];
      if (m.grid.fire[next] > 0 || m.grid.blocksMove(next % m.grid.w, Math.floor(next / m.grid.w)))
        mustThink = true;
    }
    if (mustThink) {
      this.thinkTimer = this.prof.think * (0.8 + this.rng.next() * 0.4);
      this.think(m, p);
    }
    if (this.wantShield) {
      cmd.ability = true;
      this.wantShield = false;
    }
    if (this.wantBomb) {
      cmd.bomb = true;
      this.wantBomb = false;
      return cmd;
    }
    this.followPath(m, p, cmd);
    return cmd;
  }
  followPath(m, p, cmd) {
    const g = m.grid;
    while (this.path.length) {
      const next = this.path[0];
      const nx = next % g.w + 0.5;
      const ny = Math.floor(next / g.w) + 0.5;
      const dx = nx - p.x;
      const dy = ny - p.y;
      if (Math.abs(dx) < 0.06 && Math.abs(dy) < 0.06) {
        this.path.shift();
        continue;
      }
      if (Math.abs(dx) >= Math.abs(dy))
        cmd.mx = Math.sign(dx);
      else
        cmd.my = Math.sign(dy);
      return;
    }
    const cx = Math.floor(p.x) + 0.5;
    const cy = Math.floor(p.y) + 0.5;
    if (Math.abs(cx - p.x) > 0.06)
      cmd.mx = Math.sign(cx - p.x);
    else if (Math.abs(cy - p.y) > 0.06)
      cmd.my = Math.sign(cy - p.y);
  }
  think(m, p) {
    const g = m.grid;
    const myIdx = g.idx(Math.floor(p.x), Math.floor(p.y));
    const danger = computeDanger(m);
    const sloppy = this.rng.chance(this.prof.mistake);
    if (danger.start[myIdx] !== Infinity) {
      if (this.path.length && this.pathSafe(m, p, danger, this.path)) {
        this.lastDecision = "flee";
        return;
      }
      const escape = this.findSafe(m, p, danger, this.prof.margin);
      if (escape) {
        this.path = escape;
        this.lastDecision = "flee";
        return;
      }
      if (p.shieldCharges > 0 && p.shieldTime <= 0 && danger.start[myIdx] < this.prof.shieldSense + 0.2) {
        this.wantShield = true;
      }
      this.path = this.leastBadPath(m, p, danger);
      this.lastDecision = "trapped";
      return;
    }
    if (this.path.length && !this.pathSafe(m, p, danger, this.path) && !sloppy)
      this.path = [];
    const bonusPath = this.findTarget(m, p, danger, this.prof.bonusRadius, (i) => g.bonusAt[i] >= 0);
    if (bonusPath && bonusPath.length > 0) {
      this.path = bonusPath;
      this.lastDecision = "bonus";
      return;
    }
    if (p.activeBombs < p.maxBombs && g.bombAt[myIdx] < 0) {
      const value = this.bombValue(m, p);
      const roll = this.rng.next();
      if (value.enemy && roll < 0.4 + this.prof.aggression * 0.6) {
        if (this.placeIfEscapable(m, p, sloppy))
          return;
      } else if (value.blocks > 0 && roll < 0.55 + this.prof.aggression * 0.4) {
        if (this.placeIfEscapable(m, p, sloppy))
          return;
      } else if (this.prof.trapRadius > 0 && this.enemyNear(m, p, this.prof.trapRadius) && roll < this.prof.aggression * 0.5) {
        if (this.placeIfEscapable(m, p, false))
          return;
      }
    }
    if (this.path.length)
      return;
    if (this.prof.aggression < 0.5 && this.rng.chance(0.25)) {
      const wander = this.findTarget(m, p, danger, 3, () => this.rng.chance(0.3));
      if (wander)
        this.path = wander;
      return;
    }
    const huntEnemies = this.prof.aggression > 0.5 || this.blocksLeft(m) < 6;
    const goal = this.findTarget(m, p, danger, 30, (i) => {
      if (g.bombAt[i] >= 0)
        return false;
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      if (huntEnemies && this.enemyInLine(m, p, x, y, Math.min(p.range, 3)))
        return true;
      for (const [dx, dy] of DIRS)
        if (g.tile(x + dx, y + dy) === TILE.BLOCK)
          return true;
      return false;
    });
    if (goal && goal.length) {
      this.path = goal;
      return;
    }
    const chase = this.pathToNearestEnemy(m, p, danger);
    if (chase)
      this.path = chase;
  }
  blocksLeft(m) {
    let n = 0;
    for (const t of m.grid.tiles)
      if (t === TILE.BLOCK)
        n++;
    return n;
  }
  bombValue(m, p) {
    const g = m.grid;
    const cells = [];
    const bombCells = new Set;
    for (const b of m.bombs.values())
      bombCells.add(g.idx(b.tx, b.ty));
    blastCells(m, Math.floor(p.x), Math.floor(p.y), p.range, bombCells, cells);
    let blocks = 0;
    let enemy = false;
    for (const c of cells) {
      if (g.tiles[c] === TILE.BLOCK)
        blocks++;
      for (const o of m.players) {
        if (o.alive && o.id !== p.id && g.idx(Math.floor(o.x), Math.floor(o.y)) === c && o.shieldTime <= 0)
          enemy = true;
      }
    }
    return { blocks, enemy };
  }
  enemyNear(m, p, r) {
    return m.players.some((o) => o.alive && o.id !== p.id && Math.abs(o.x - p.x) + Math.abs(o.y - p.y) <= r + 0.5);
  }
  enemyInLine(m, p, x, y, r) {
    const g = m.grid;
    for (const o of m.players) {
      if (!o.alive || o.id === p.id)
        continue;
      const ox = Math.floor(o.x);
      const oy = Math.floor(o.y);
      if (ox !== x && oy !== y)
        continue;
      const d = Math.abs(ox - x) + Math.abs(oy - y);
      if (d === 0 || d > r)
        continue;
      const sx = Math.sign(ox - x);
      const sy = Math.sign(oy - y);
      let clear = true;
      for (let k = 1;k < d; k++)
        if (g.isSolid(x + sx * k, y + sy * k))
          clear = false;
      if (clear)
        return true;
    }
    return false;
  }
  placeIfEscapable(m, p, sloppy) {
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (!sloppy) {
      const danger = computeDanger(m, { tx, ty, fuse: RULES.bombFuse, range: p.range });
      const escape = this.findSafe(m, p, danger, this.prof.margin + 0.15, true);
      if (!escape)
        return false;
      let room = 0;
      this.bfs(m, p, danger, this.prof.margin + 0.15, 8, (idx) => {
        if (danger.start[idx] === Infinity)
          room++;
        return false;
      });
      if (room < this.prof.escapeRoom && this.enemyNear(m, p, 4))
        return false;
      this.path = escape;
    } else {
      this.path = [];
    }
    this.wantBomb = true;
    this.lastDecision = sloppy ? "bomb-sloppy" : "bomb";
    return true;
  }
  passable(m, p, idx, startIdx, ignoreOwnBomb) {
    const g = m.grid;
    if (g.tiles[idx] !== TILE.FLOOR || g.isHazard(idx % g.w, Math.floor(idx / g.w)))
      return false;
    if (g.bombAt[idx] >= 0 && idx !== startIdx)
      return false;
    if (ignoreOwnBomb && idx === startIdx)
      return true;
    return true;
  }
  eta(p, steps) {
    return (steps + 0.3) / p.speed;
  }
  cellOkAt(danger, idx, tArrive, tLeave, margin) {
    const s = danger.start[idx];
    if (s === Infinity)
      return true;
    return tLeave < s - margin || tArrive > danger.end[idx] + margin;
  }
  bfs(m, p, danger, margin, maxDist, goal) {
    const g = m.grid;
    const start = g.idx(Math.floor(p.x), Math.floor(p.y));
    const seen = new Map;
    const q = [{ idx: start, dist: 0, prev: -1 }];
    seen.set(start, q[0]);
    const dirs = this.rng.shuffle([...DIRS]);
    let head = 0;
    while (head < q.length) {
      const n = q[head++];
      if (n.dist > 0 && goal(n.idx, n))
        return this.unwind(seen, n);
      if (n.dist === 0 && goal(n.idx, n))
        return [];
      if (n.dist >= maxDist)
        continue;
      const x = n.idx % g.w;
      const y = Math.floor(n.idx / g.w);
      for (const [dx, dy] of dirs) {
        const ni = g.idx(x + dx, y + dy);
        if (seen.has(ni))
          continue;
        if (!this.passable(m, p, ni, start, true))
          continue;
        const tA = this.eta(p, n.dist + 0.5);
        const tL = this.eta(p, n.dist + 1.5);
        if (!this.cellOkAt(danger, ni, tA, tL, margin))
          continue;
        const node = { idx: ni, dist: n.dist + 1, prev: n.idx };
        seen.set(ni, node);
        q.push(node);
      }
    }
    return null;
  }
  unwind(seen, n) {
    const out = [];
    let cur = n;
    while (cur && cur.prev !== -1) {
      out.push(cur.idx);
      cur = seen.get(cur.prev);
    }
    return out.reverse();
  }
  findSafe(m, p, danger, margin, _afterBomb = false) {
    return this.bfs(m, p, danger, margin, 12, (idx) => danger.start[idx] === Infinity);
  }
  findTarget(m, p, danger, radius, pred) {
    return this.bfs(m, p, danger, this.prof.margin, radius, (idx) => danger.start[idx] === Infinity && pred(idx));
  }
  pathSafe(m, p, danger, path) {
    for (let k = 0;k < path.length; k++) {
      const idx = path[k];
      if (m.grid.blocksMove(idx % m.grid.w, Math.floor(idx / m.grid.w)) || m.grid.bombAt[idx] >= 0)
        return false;
      if (!this.cellOkAt(danger, idx, this.eta(p, k + 0.5), this.eta(p, k + 1.5), this.prof.margin))
        return false;
    }
    const last = path[path.length - 1];
    return danger.start[last] === Infinity;
  }
  leastBadPath(m, p, danger) {
    let best = [];
    let bestScore = danger.start[m.grid.idx(Math.floor(p.x), Math.floor(p.y))];
    this.bfs(m, p, danger, -1, 8, (idx, node) => {
      const s = danger.start[idx] - this.eta(p, node.dist);
      if (s > bestScore) {
        bestScore = s;
        best = [idx];
      }
      return false;
    });
    if (best.length) {
      const target = best[0];
      const path = this.bfs(m, p, danger, -1, 8, (idx) => idx === target);
      if (path)
        return path;
    }
    return [];
  }
  pathToNearestEnemy(m, p, danger) {
    const g = m.grid;
    const enemyCells = new Set(m.players.filter((o) => o.alive && o.id !== p.id).map((o) => g.idx(Math.floor(o.x), Math.floor(o.y))));
    const path = this.bfs(m, p, danger, this.prof.margin, 40, (idx) => enemyCells.has(idx));
    if (!path || path.length <= 1)
      return null;
    const trimmed = path.slice(0, Math.max(1, path.length - 2));
    return danger.start[trimmed[trimmed.length - 1]] === Infinity ? trimmed : null;
  }
}

// src/core/bonuses.ts
var BONUSES = {
  bomb: {
    id: "bomb",
    label: "Bombe +1",
    description: "Une bombe de plus en même temps.",
    apply(p) {
      if (p.maxBombs >= RULES.maxBombs)
        return false;
      p.maxBombs++;
      return true;
    }
  },
  flame: {
    id: "flame",
    label: "Flamme +1",
    description: "Portée d'explosion augmentée.",
    apply(p) {
      if (p.range >= RULES.maxRange)
        return false;
      p.range++;
      return true;
    }
  },
  speed: {
    id: "speed",
    label: "Vitesse",
    description: "Tu cours plus vite (permanent).",
    apply(p) {
      if (p.speedLevel >= RULES.maxSpeedLevel)
        return false;
      p.speedLevel++;
      p.speed = RULES.baseSpeed + p.speedLevel * RULES.speedPerLevel;
      return true;
    }
  },
  shield: {
    id: "shield",
    label: "Bouclier",
    description: "Charge un bouclier : bouton \uD83D\uDEE1️ pour 3 s d'invincibilité.",
    apply(p) {
      if (p.shieldCharges >= RULES.maxShieldCharges)
        return false;
      p.shieldCharges++;
      return true;
    }
  }
};

// src/core/movement.ts
var EPS = 0.0001;
function stepAxis(p, horizontal, dir, dist, canEnter) {
  let a = horizontal ? p.x : p.y;
  let b = horizontal ? p.y : p.x;
  const lane = Math.floor(b);
  const off = b - (lane + 0.5);
  const cell = Math.floor(a);
  const cellC = cell + 0.5;
  const ahead = (laneIdx) => horizontal ? canEnter(cell + dir, laneIdx) : canEnter(laneIdx, cell + dir);
  const side = (laneIdx) => horizontal ? canEnter(cell, laneIdx) : canEnter(laneIdx, cell);
  let used = 0;
  if (Math.abs(off) > EPS) {
    const sOff = Math.sign(off);
    const adj = lane + sOff;
    if (ahead(lane)) {
      const s = Math.min(dist, Math.abs(off));
      b -= sOff * s;
      used += s;
    } else if (Math.abs(off) > 0.5 - RULES.cornerAssist && ahead(adj) && side(adj)) {
      const target = adj + 0.5;
      const s = Math.min(dist, Math.abs(target - b));
      b += sOff * s;
      used += s;
    } else {
      const s = Math.min(dist, Math.abs(off));
      b -= sOff * s;
      used += s;
    }
  }
  const rem = dist - used;
  const aligned = Math.abs(b - (Math.floor(b) + 0.5)) <= EPS;
  if (rem > 0 && aligned) {
    let na = a + dir * rem;
    if (!ahead(Math.floor(b))) {
      const past = (a - cellC) * dir;
      if (past >= 0)
        na = a;
      else if ((na - cellC) * dir > 0)
        na = cellC;
    }
    used += Math.abs(na - a);
    a = na;
  }
  if (horizontal) {
    p.x = a;
    p.y = b;
  } else {
    p.y = a;
    p.x = b;
  }
  return used;
}
function movePlayer(p, mx, my, dt, canEnter) {
  const ax = Math.abs(mx);
  const ay = Math.abs(my);
  if (Math.max(ax, ay) < 0.25) {
    p.moving = false;
    return;
  }
  const dist = p.speed * dt;
  const horizontalFirst = ax >= ay;
  const pDir = horizontalFirst ? Math.sign(mx) : Math.sign(my);
  const used1 = stepAxis(p, horizontalFirst, pDir, dist, canEnter);
  let used2 = 0;
  let sDir = 0;
  const secMag = horizontalFirst ? ay : ax;
  if (used1 < dist * 0.5 && secMag > 0.3) {
    sDir = horizontalFirst ? Math.sign(my) : Math.sign(mx);
    used2 = stepAxis(p, !horizontalFirst, sDir, dist - used1, canEnter);
  }
  const used = used1 + used2;
  p.moving = used > EPS;
  if (!p.moving)
    return;
  if (used2 > used1) {
    p.faceX = horizontalFirst ? 0 : sDir;
    p.faceY = horizontalFirst ? sDir : 0;
  } else {
    p.faceX = horizontalFirst ? pDir : 0;
    p.faceY = horizontalFirst ? 0 : pDir;
  }
  p.walkPhase += used * 2.2;
}

// src/maps/generator.ts
var TERRAIN_OF = {
  L: TERRAIN.LAVA,
  "~": TERRAIN.WATER,
  I: TERRAIN.ICE,
  i: TERRAIN.ICE,
  V: TERRAIN.VENT
};
var WALKABLE = [".", "_", "S", "s", "I", "i", "V"];
function generateArena(map, playerCount, seed) {
  const rng = new Rng(seed ^ 24301);
  const height = map.layout.length;
  const width = map.layout[0].length;
  const tiles = new Uint8Array(width * height);
  const terrain = new Uint8Array(width * height);
  const hiddenBonus = new Array(width * height).fill(null);
  const at = (x, y) => map.layout[y][x];
  const mainSpawns = [];
  const extraSpawns = [];
  for (let y = 0;y < height; y++)
    for (let x = 0;x < width; x++) {
      const c = at(x, y);
      if (c === "S")
        mainSpawns.push([x, y]);
      if (c === "s")
        extraSpawns.push([x, y]);
    }
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const quad = ([x, y]) => (x < cx ? 0 : 1) + (y < cy ? 0 : 2);
  const order = [0, 3, 1, 2];
  mainSpawns.sort((a, b) => order.indexOf(quad(a)) - order.indexOf(quad(b)));
  const useExtra = playerCount > mainSpawns.length;
  const spawns = [...mainSpawns, ...useExtra ? extraSpawns : []].slice(0, Math.max(playerCount, 1));
  const protectedCells = new Set;
  const open = (x, y) => x > 0 && y > 0 && x < width - 1 && y < height - 1 && WALKABLE.includes(at(x, y));
  const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const hasHideSpot = (cells, range) => {
    for (const b of cells) {
      const bx = b % width;
      const by = Math.floor(b / width);
      const blast = new Set([b]);
      for (const [dx, dy] of DIRS4)
        for (let i = 1;i <= range; i++) {
          if (!open(bx + dx * i, by + dy * i))
            break;
          blast.add((by + dy * i) * width + bx + dx * i);
        }
      const seen = new Set([b]);
      const queue = [b];
      while (queue.length) {
        const c = queue.shift();
        if (!blast.has(c))
          return true;
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
  const clearAround = ([sx, sy]) => {
    const zone = new Set([sy * width + sx]);
    for (const [dx, dy] of DIRS4)
      for (let i = 1;i <= map.spawnClear; i++) {
        if (!open(sx + dx * i, sy + dy * i))
          break;
        zone.add((sy + dy * i) * width + sx + dx * i);
      }
    let guard = 0;
    while (!hasHideSpot(zone, map.startRange) && guard++ < 8) {
      let best = -1;
      let bestD = Infinity;
      for (const c of zone) {
        const cx = c % width;
        const cy = Math.floor(c / width);
        for (const [dx, dy] of DIRS4) {
          const nx = cx + dx;
          const ny = cy + dy;
          const n = ny * width + nx;
          if (!open(nx, ny) || zone.has(n))
            continue;
          const d = Math.abs(nx - sx) + Math.abs(ny - sy) + n % 7 * 0.01;
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
      }
      if (best < 0)
        break;
      zone.add(best);
    }
    for (const c of zone)
      protectedCells.add(c);
  };
  mainSpawns.forEach(clearAround);
  if (useExtra)
    extraSpawns.forEach(clearAround);
  const canon = (x, y) => Math.min(y, height - 1 - y) * width + Math.min(x, width - 1 - x);
  const decision = new Map;
  for (let y = 0;y < height; y++)
    for (let x = 0;x < width; x++) {
      const k = canon(x, y);
      if (decision.has(k))
        continue;
      const block = rng.chance(map.blockDensity);
      const bonus = block && rng.chance(map.bonusChance) ? rng.weighted(map.bonusWeights) : null;
      decision.set(k, { block, bonus });
    }
  for (let y = 0;y < height; y++)
    for (let x = 0;x < width; x++) {
      const i = y * width + x;
      const c = at(x, y);
      let t = TILE.FLOOR;
      terrain[i] = TERRAIN_OF[c] ?? TERRAIN.NONE;
      if (c === "#")
        t = TILE.WALL;
      else if ((c === "." || c === "I" || c === "s" && !useExtra) && !protectedCells.has(i)) {
        const d = decision.get(canon(x, y));
        if (d.block) {
          t = TILE.BLOCK;
          hiddenBonus[i] = d.bonus;
        }
      }
      tiles[i] = t;
    }
  return { width, height, tiles, terrain, hiddenBonus, spawns };
}

// src/core/match.ts
class Match {
  config;
  mode;
  grid;
  players;
  bombs = new Map;
  bonuses = new Map;
  rng;
  phase = "countdown";
  countdown = RULES.countdown;
  time = 0;
  tick = 0;
  winnerId = -1;
  events = [];
  suddenDeath = false;
  sdOrder = [];
  sdIndex = 0;
  sdTimer = 0;
  pendingDrops = [];
  endTimer = 0;
  nextId = 1;
  speedMul = 1;
  bonusBoost = false;
  chaos = null;
  vents = [];
  constructor(config) {
    this.config = config;
    this.mode = getMode(config.modeId);
    this.rng = new Rng(config.seed);
    const arena = generateArena(config.map, config.players.length, config.seed);
    this.grid = new Grid(arena);
    this.players = config.players.map((slot, i) => {
      const [sx, sy] = arena.spawns[i];
      return {
        id: i,
        name: slot.name,
        characterId: slot.characterId,
        skinId: slot.skinId,
        isBot: slot.isBot,
        difficulty: slot.difficulty,
        alive: true,
        x: sx + 0.5,
        y: sy + 0.5,
        faceX: 0,
        faceY: 1,
        moving: false,
        walkPhase: 0,
        slideX: 0,
        slideY: 0,
        speed: RULES.baseSpeed,
        speedLevel: 0,
        maxBombs: RULES.startBombs,
        activeBombs: 0,
        range: RULES.startRange,
        shieldCharges: 0,
        shieldTime: 0,
        deathTime: -1,
        killedBy: -1,
        place: 0,
        stats: { bombsPlaced: 0, kills: 0, blocksDestroyed: 0, bonusesPicked: 0, survivalTime: 0 }
      };
    });
    this.buildSuddenDeathOrder();
    for (let y = 0;y < this.grid.h; y++)
      for (let x = 0;x < this.grid.w; x++)
        if (this.grid.terrainAt(x, y) === TERRAIN.VENT)
          this.vents.push([x, y, this.vents.length * RULES.ventStagger]);
    this.mode.onStart?.(this);
  }
  get timeLeft() {
    return Math.max(0, RULES.matchDuration - this.time);
  }
  get aliveCount() {
    return this.players.reduce((n, p) => n + (p.alive ? 1 : 0), 0);
  }
  step(inputs) {
    this.events = [];
    this.tick++;
    if (this.phase === "over")
      return;
    if (this.phase === "countdown") {
      this.countdown -= DT;
      if (this.countdown <= 0)
        this.phase = "playing";
      return;
    }
    this.time += DT;
    for (const p of this.players) {
      if (!p.alive)
        continue;
      const cmd = inputs[p.id] ?? NO_INPUT;
      this.updatePlayer(p, cmd);
    }
    this.updateBombPassability();
    this.updateBombs();
    this.updateFire();
    this.updateBonuses();
    this.checkPickups();
    this.checkDeaths();
    this.updateSuddenDeath();
    this.updateVents();
    this.mode.onTick?.(this, DT);
    this.updateEnd();
  }
  playerTile(p) {
    return [Math.floor(p.x), Math.floor(p.y)];
  }
  canEnter(p, tx, ty) {
    const g = this.grid;
    if (g.blocksMove(tx, ty))
      return false;
    const b = g.bombAt[g.idx(tx, ty)];
    if (b >= 0) {
      const bomb = this.bombs.get(b);
      if (bomb && !bomb.passable.includes(p.id))
        return false;
    }
    return true;
  }
  updatePlayer(p, cmd) {
    if (p.shieldTime > 0)
      p.shieldTime = Math.max(0, p.shieldTime - DT);
    this.moveWithInput(p, cmd);
    if (cmd.bomb)
      this.tryPlaceBomb(p);
    if (cmd.ability)
      this.tryShield(p);
  }
  moveWithInput(p, cmd) {
    let mx = cmd.mx;
    let my = cmd.my;
    const hasInput = Math.max(Math.abs(mx), Math.abs(my)) >= 0.25;
    const onIce = this.grid.terrainAt(Math.floor(p.x), Math.floor(p.y)) === TERRAIN.ICE;
    if (!hasInput && onIce && (p.slideX || p.slideY)) {
      mx = p.slideX;
      my = p.slideY;
    }
    const bx = p.x;
    const by = p.y;
    const baseSpeed = p.speed;
    p.speed *= this.speedMul;
    movePlayer(p, mx, my, DT, (tx, ty) => this.canEnter(p, tx, ty));
    p.speed = baseSpeed;
    const dx = p.x - bx;
    const dy = p.y - by;
    if (!p.moving) {
      p.slideX = p.slideY = 0;
    } else if (hasInput) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        p.slideX = Math.sign(dx);
        p.slideY = 0;
      } else {
        p.slideX = 0;
        p.slideY = Math.sign(dy);
      }
    }
    if (!onIce && !hasInput)
      p.slideX = p.slideY = 0;
  }
  tryPlaceBomb(p) {
    if (!p.alive || p.activeBombs >= p.maxBombs)
      return false;
    const [tx, ty] = this.playerTile(p);
    const g = this.grid;
    const i = g.idx(tx, ty);
    if (g.bombAt[i] >= 0 || g.tiles[i] !== TILE.FLOOR || g.isHazard(tx, ty))
      return false;
    const passable = this.players.filter((o) => o.alive && Math.floor(o.x) === tx && Math.floor(o.y) === ty).map((o) => o.id);
    const bomb = {
      id: this.nextId++,
      ownerId: p.id,
      tx,
      ty,
      fuse: RULES.bombFuse,
      fuseTotal: RULES.bombFuse,
      range: p.range,
      passable
    };
    this.bombs.set(bomb.id, bomb);
    g.bombAt[i] = bomb.id;
    p.activeBombs++;
    p.stats.bombsPlaced++;
    this.events.push({ t: "bombPlaced", x: tx, y: ty, owner: p.id });
    return true;
  }
  tryShield(p) {
    if (!p.alive || p.shieldCharges <= 0 || p.shieldTime > 0)
      return false;
    p.shieldCharges--;
    p.shieldTime = RULES.shieldDuration;
    this.events.push({ t: "shieldOn", player: p.id });
    return true;
  }
  updateBombPassability() {
    for (const b of this.bombs.values()) {
      if (b.passable.length === 0)
        continue;
      b.passable = b.passable.filter((id) => {
        const p = this.players[id];
        if (!p.alive)
          return false;
        return Math.floor(p.x) === b.tx && Math.floor(p.y) === b.ty;
      });
    }
  }
  updateBombs() {
    const toExplode = [];
    for (const b of this.bombs.values()) {
      b.fuse -= DT;
      if (b.fuse <= 0)
        toExplode.push(b);
    }
    toExplode.sort((a, b) => a.id - b.id);
    for (const b of toExplode)
      if (this.bombs.has(b.id))
        this.detonate(b);
  }
  detonate(first) {
    const queue = [first];
    let chain = 0;
    while (queue.length) {
      const b = queue.shift();
      if (!this.bombs.has(b.id))
        continue;
      this.bombs.delete(b.id);
      const g = this.grid;
      g.bombAt[g.idx(b.tx, b.ty)] = -1;
      const owner = this.players[b.ownerId];
      if (owner)
        owner.activeBombs = Math.max(0, owner.activeBombs - 1);
      let cells = 1;
      this.setFire(b.tx, b.ty, FIRE.CENTER, b.ownerId);
      for (const [dx, dy, bit] of DIRS) {
        const backBit = bit === 1 ? 2 : bit === 2 ? 1 : bit === 4 ? 8 : 4;
        for (let i = 1;i <= b.range; i++) {
          const x = b.tx + dx * i;
          const y = b.ty + dy * i;
          const t = g.tile(x, y);
          if (t === TILE.WALL)
            break;
          const idx = g.idx(x, y);
          const isLast = i === b.range;
          if (t === TILE.BLOCK) {
            this.destroyBlock(x, y, b.ownerId);
            this.setFire(x, y, backBit, b.ownerId);
            cells++;
            break;
          }
          const other = g.bombAt[idx];
          if (other >= 0) {
            const ob = this.bombs.get(other);
            if (ob) {
              queue.push(ob);
              chain++;
            }
            this.setFire(x, y, backBit, b.ownerId);
            cells++;
            break;
          }
          const bonusId = g.bonusAt[idx];
          if (bonusId >= 0) {
            const bonus = this.bonuses.get(bonusId);
            if (bonus && bonus.invuln <= 0) {
              this.removeBonus(bonus);
              this.events.push({ t: "bonusBurned", x, y });
              this.setFire(x, y, backBit, b.ownerId);
              cells++;
              break;
            }
          }
          this.setFire(x, y, isLast ? backBit : backBit | bit, b.ownerId);
          cells++;
        }
      }
      this.events.push({ t: "explode", x: b.tx, y: b.ty, owner: b.ownerId, cells, chain });
    }
  }
  setFire(x, y, shape, owner) {
    const g = this.grid;
    const i = g.idx(x, y);
    if (g.fire[i] <= 0)
      g.fireShape[i] = 0;
    g.fire[i] = RULES.fireDuration;
    g.fireShape[i] |= shape;
    g.fireOwner[i] = owner;
  }
  destroyBlock(x, y, by) {
    const g = this.grid;
    const i = g.idx(x, y);
    g.tiles[i] = TILE.FLOOR;
    if (this.players[by])
      this.players[by].stats.blocksDestroyed++;
    this.events.push({ t: "blockDestroyed", x, y });
    if (!g.hiddenBonus[i] && this.bonusBoost)
      g.hiddenBonus[i] = this.rng.weighted(this.config.map.bonusWeights);
    const hidden = g.hiddenBonus[i];
    if (hidden) {
      g.hiddenBonus[i] = null;
      const bonus = {
        id: this.nextId++,
        type: hidden,
        tx: x,
        ty: y,
        invuln: RULES.fireDuration + 0.05,
        age: 0
      };
      this.bonuses.set(bonus.id, bonus);
      g.bonusAt[i] = bonus.id;
      this.events.push({ t: "bonusSpawn", x, y, type: hidden });
    }
  }
  updateFire() {
    const g = this.grid;
    for (let i = 0;i < g.fire.length; i++) {
      if (g.fire[i] > 0) {
        g.fire[i] -= DT;
        if (g.fire[i] <= 0) {
          g.fire[i] = 0;
          g.fireShape[i] = 0;
          g.fireOwner[i] = -1;
        }
      }
    }
  }
  updateBonuses() {
    for (const b of this.bonuses.values()) {
      b.age += DT;
      if (b.invuln > 0)
        b.invuln -= DT;
    }
  }
  removeBonus(b) {
    this.bonuses.delete(b.id);
    this.grid.bonusAt[this.grid.idx(b.tx, b.ty)] = -1;
  }
  checkPickups() {
    const g = this.grid;
    for (const p of this.players) {
      if (!p.alive)
        continue;
      const [tx, ty] = this.playerTile(p);
      const id = g.bonusAt[g.idx(tx, ty)];
      if (id < 0)
        continue;
      const bonus = this.bonuses.get(id);
      if (!bonus || bonus.invuln > 0.2)
        continue;
      BONUSES[bonus.type]?.apply(p);
      p.stats.bonusesPicked++;
      this.removeBonus(bonus);
      this.events.push({ t: "bonusPicked", x: tx, y: ty, type: bonus.type, player: p.id });
    }
  }
  checkDeaths() {
    const g = this.grid;
    for (const p of this.players) {
      if (!p.alive)
        continue;
      const [tx, ty] = this.playerTile(p);
      const i = g.idx(tx, ty);
      if (g.fire[i] <= 0)
        continue;
      if (p.shieldTime > 0) {
        if (g.fire[i] > RULES.fireDuration - DT * 1.5)
          this.events.push({ t: "shieldBlocked", player: p.id });
        continue;
      }
      this.kill(p, g.fireOwner[i]);
    }
  }
  kill(p, killer) {
    if (!p.alive)
      return;
    p.alive = false;
    p.moving = false;
    p.deathTime = this.time;
    p.killedBy = killer;
    p.stats.survivalTime = this.time;
    if (killer >= 0 && killer !== p.id)
      this.players[killer].stats.kills++;
    this.events.push({ t: "playerDied", player: p.id, killer, x: p.x, y: p.y });
  }
  buildSuddenDeathOrder() {
    const { w, h } = this.grid;
    let x0 = 1, y0 = 1, x1 = w - 2, y1 = h - 2;
    const out = [];
    while (x0 <= x1 && y0 <= y1) {
      for (let x = x0;x <= x1; x++)
        out.push([x, y0]);
      for (let y = y0 + 1;y <= y1; y++)
        out.push([x1, y]);
      if (y1 > y0)
        for (let x = x1 - 1;x >= x0; x--)
          out.push([x, y1]);
      if (x1 > x0)
        for (let y = y1 - 1;y > y0; y--)
          out.push([x0, y]);
      x0++;
      y0++;
      x1--;
      y1--;
    }
    this.sdOrder = out.filter(([x, y]) => this.grid.tile(x, y) !== TILE.WALL && !this.grid.isHazard(x, y));
  }
  updateSuddenDeath() {
    if (!this.suddenDeath && this.timeLeft <= RULES.suddenDeathAt) {
      this.suddenDeath = true;
      this.events.push({ t: "suddenDeath" });
    }
    if (this.suddenDeath && this.phase === "playing") {
      this.sdTimer -= DT;
      while (this.sdTimer <= 0 && this.sdIndex < this.sdOrder.length) {
        this.sdTimer += RULES.suddenDeathInterval;
        const [x, y] = this.sdOrder[this.sdIndex++];
        this.pendingDrops.push([x, y, RULES.suddenDeathWarn]);
        this.events.push({ t: "wallWarn", x, y });
      }
    }
    for (let k = this.pendingDrops.length - 1;k >= 0; k--) {
      const d = this.pendingDrops[k];
      d[2] -= DT;
      if (d[2] <= 0) {
        this.pendingDrops.splice(k, 1);
        this.dropWall(d[0], d[1]);
      }
    }
  }
  isFreeCell(x, y, avoidPlayers = true) {
    const g = this.grid;
    if (g.blocksMove(x, y))
      return false;
    const i = g.idx(x, y);
    if (g.bombAt[i] >= 0 || g.bonusAt[i] >= 0)
      return false;
    if (avoidPlayers && this.players.some((p) => p.alive && Math.floor(p.x) === x && Math.floor(p.y) === y))
      return false;
    return true;
  }
  randomFreeCells(n, avoidPlayers = true) {
    const all = [];
    for (let y = 1;y < this.grid.h - 1; y++)
      for (let x = 1;x < this.grid.w - 1; x++)
        if (this.isFreeCell(x, y, avoidPlayers))
          all.push([x, y]);
    return this.rng.shuffle(all).slice(0, n);
  }
  spawnNeutralBomb(tx, ty, fuse, range) {
    const g = this.grid;
    const i = g.idx(tx, ty);
    if (g.bombAt[i] >= 0 || g.blocksMove(tx, ty))
      return false;
    const bomb = { id: this.nextId++, ownerId: -1, tx, ty, fuse, fuseTotal: fuse, range, passable: [] };
    for (const p of this.players)
      if (p.alive && Math.floor(p.x) === tx && Math.floor(p.y) === ty)
        bomb.passable.push(p.id);
    this.bombs.set(bomb.id, bomb);
    g.bombAt[i] = bomb.id;
    this.events.push({ t: "bombPlaced", x: tx, y: ty, owner: -1 });
    return true;
  }
  spawnBonus(type, tx, ty) {
    const g = this.grid;
    const i = g.idx(tx, ty);
    if (g.bonusAt[i] >= 0 || g.blocksMove(tx, ty))
      return false;
    const bonus = { id: this.nextId++, type, tx, ty, invuln: 0.3, age: 0 };
    this.bonuses.set(bonus.id, bonus);
    g.bonusAt[i] = bonus.id;
    this.events.push({ t: "bonusSpawn", x: tx, y: ty, type });
    return true;
  }
  ignite(x, y, breakBlocks) {
    const g = this.grid;
    const t = g.tile(x, y);
    if (t === TILE.WALL)
      return;
    if (t === TILE.BLOCK) {
      if (!breakBlocks)
        return;
      this.destroyBlock(x, y, -1);
    }
    const i = g.idx(x, y);
    const bo = g.bonusAt[i];
    if (bo >= 0) {
      const bonus = this.bonuses.get(bo);
      if (bonus && bonus.invuln <= 0) {
        this.removeBonus(bonus);
        this.events.push({ t: "bonusBurned", x, y });
      }
    }
    const b = g.bombAt[i];
    if (b >= 0) {
      const bomb = this.bombs.get(b);
      if (bomb)
        bomb.fuse = Math.min(bomb.fuse, DT);
    }
    this.setFire(x, y, FIRE.CENTER, -1);
  }
  ventTimeLeft(v) {
    const P = RULES.ventPeriod;
    const phase = ((this.time + v[2]) % P + P) % P;
    return P - phase;
  }
  ventCells(x, y) {
    const out = [[x, y]];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.grid.isSolid(nx, ny))
        out.push([nx, ny]);
    }
    return out;
  }
  updateVents() {
    if (this.phase !== "playing" || !this.vents.length)
      return;
    for (const v of this.vents) {
      if (this.grid.terrainAt(v[0], v[1]) !== TERRAIN.VENT)
        continue;
      const left = this.ventTimeLeft(v);
      if (left <= RULES.ventWarn && left + DT > RULES.ventWarn)
        this.events.push({ t: "ventWarn", x: v[0], y: v[1] });
      const cycle = Math.floor((this.time + v[2]) / RULES.ventPeriod);
      const prevCycle = Math.floor((this.time - DT + v[2]) / RULES.ventPeriod);
      if (cycle !== prevCycle && this.time > 1) {
        const g = this.grid;
        for (const [cx, cy] of this.ventCells(v[0], v[1])) {
          this.setFire(cx, cy, FIRE.CENTER, -1);
          const b = g.bombAt[g.idx(cx, cy)];
          if (b >= 0) {
            const bomb = this.bombs.get(b);
            if (bomb)
              bomb.fuse = Math.min(bomb.fuse, DT);
          }
        }
        this.events.push({ t: "eruption", x: v[0], y: v[1] });
      }
    }
  }
  upcomingDrops(horizon) {
    const out = [];
    if (!this.suddenDeath && this.timeLeft - horizon > RULES.suddenDeathAt)
      return out;
    const startIn = this.suddenDeath ? Math.max(0, this.sdTimer) : this.timeLeft - RULES.suddenDeathAt;
    for (let k = this.sdIndex;k < this.sdOrder.length; k++) {
      const t = startIn + (k - this.sdIndex) * RULES.suddenDeathInterval + RULES.suddenDeathWarn;
      if (t > horizon)
        break;
      out.push([this.sdOrder[k][0], this.sdOrder[k][1], t]);
    }
    return out;
  }
  dropWall(x, y) {
    const g = this.grid;
    const i = g.idx(x, y);
    g.tiles[i] = TILE.WALL;
    g.terrain[i] = TERRAIN.NONE;
    g.hiddenBonus[i] = null;
    g.fire[i] = 0;
    g.fireShape[i] = 0;
    const b = g.bombAt[i];
    if (b >= 0) {
      const bomb = this.bombs.get(b);
      if (bomb) {
        this.bombs.delete(b);
        const owner = this.players[bomb.ownerId];
        if (owner)
          owner.activeBombs = Math.max(0, owner.activeBombs - 1);
      }
      g.bombAt[i] = -1;
    }
    const bo = g.bonusAt[i];
    if (bo >= 0) {
      const bonus = this.bonuses.get(bo);
      if (bonus)
        this.removeBonus(bonus);
    }
    for (const p of this.players) {
      if (p.alive && Math.floor(p.x) === x && Math.floor(p.y) === y)
        this.kill(p, -1);
    }
    this.events.push({ t: "wallDrop", x, y });
  }
  updateEnd() {
    if (this.phase === "playing") {
      if (this.aliveCount <= 1 || this.timeLeft <= 0) {
        this.phase = "ending";
        this.endTimer = RULES.endDelay;
      }
    } else if (this.phase === "ending") {
      this.endTimer -= DT;
      if (this.endTimer <= 0)
        this.finish();
    }
  }
  finish() {
    this.phase = "over";
    const alive = this.players.filter((p) => p.alive);
    for (const p of alive)
      p.stats.survivalTime = this.time;
    this.winnerId = alive.length === 1 ? alive[0].id : -1;
    const ranked = [...this.players].sort((a, b) => {
      if (a.alive !== b.alive)
        return a.alive ? -1 : 1;
      return b.deathTime - a.deathTime;
    });
    let place = 1;
    ranked.forEach((p, i) => {
      const prev = ranked[i - 1];
      if (i > 0 && !(prev.alive && p.alive) && !(!prev.alive && !p.alive && prev.deathTime === p.deathTime))
        place = i + 1;
      p.place = place;
    });
    this.events.push({ t: "matchEnd", winner: this.winnerId });
  }
}

// src/net/snapshot.ts
var r2 = (v) => Math.round(v * 100) / 100;
function encodeSnapshot(m, acks, events) {
  const g = m.grid;
  const fire = [];
  for (let i = 0;i < g.fire.length; i++)
    if (g.fire[i] > 0)
      fire.push([i, r2(g.fire[i]), g.fireShape[i], g.fireOwner[i]]);
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
    chaos: m.chaos ? {
      pending: m.chaos.pending ? [m.chaos.pending.def.id, r2(m.chaos.pendingLeft), m.chaos.pending.zone] : null,
      active: m.chaos.active.map((a) => [a.def.id, r2(a.timer), a.zone])
    } : null,
    events
  };
}

// server/game.ts
var SNAPSHOT_EVERY = 3;
var MAX_QUEUE = 4;
var matchCounter = 0;

class GameRunner {
  send;
  onEnd;
  matchId = ++matchCounter;
  match;
  slots;
  seatOf = new Map;
  queues = [];
  lastCmd = [];
  acks = [];
  bots = [];
  pendingEvents = [];
  timer = null;
  acc = 0;
  last = 0;
  ended = false;
  constructor(seats, opts, send, onEnd) {
    this.send = send;
    this.onEnd = onEnd;
    const used = new Set(seats.map((s) => s.characterId));
    this.slots = seats.map((s, i) => {
      this.seatOf.set(s.token, i);
      return { name: s.name, characterId: s.characterId, skinId: s.skinId, isBot: false, accountId: s.token };
    });
    if (opts.fillBots) {
      const free = CHARACTERS.filter((c) => !used.has(c.id));
      while (this.slots.length < opts.maxPlayers && free.length) {
        const c = free.shift();
        this.slots.push({ name: `${c.name} (bot)`, characterId: c.id, isBot: true, difficulty: "normal" });
      }
    }
    const seed = Math.random() * 2 ** 31 | 0;
    this.match = new Match({ seed, map: pickMap(opts.mapId), modeId: opts.modeId, players: this.slots });
    this.slots.forEach((slot, i) => {
      this.queues.push([]);
      this.lastCmd.push(NO_INPUT);
      this.acks.push(0);
      if (slot.isBot)
        this.bots.push(new BotBrain(i, "normal", seed + i));
    });
  }
  start() {
    for (const [token, you] of this.seatOf)
      this.sendStart(token, you);
    this.last = performance.now();
    this.timer = setInterval(() => this.loop(), 1000 / 120);
  }
  sendStart(token, you = this.seatOf.get(token)) {
    if (you === undefined)
      return;
    const m = this.match;
    this.send(token, {
      t: "matchStart",
      matchId: this.matchId,
      seed: m.config.seed,
      mapId: m.config.map.id,
      modeId: m.config.modeId,
      slots: this.slots,
      you
    });
    this.send(token, { t: "snap", s: encodeSnapshot(m, this.acks, []) });
  }
  input(token, seq, cmd) {
    const i = this.seatOf.get(token);
    if (i === undefined || seq <= this.acks[i])
      return;
    const q = this.queues[i];
    q.push({ seq, cmd: { mx: clamp(cmd.mx), my: clamp(cmd.my), bomb: !!cmd.bomb, ability: !!cmd.ability } });
    while (q.length > MAX_QUEUE) {
      const old = q.shift();
      if (old.cmd.bomb)
        q[0].cmd.bomb = true;
      if (old.cmd.ability)
        q[0].cmd.ability = true;
      this.acks[i] = old.seq;
    }
  }
  loop() {
    const now = performance.now();
    this.acc += Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    while (this.acc >= DT && !this.ended) {
      this.acc -= DT;
      this.tick();
    }
  }
  tick() {
    const m = this.match;
    const inputs = this.slots.map((_, i) => {
      const next = this.queues[i].shift();
      if (next) {
        this.acks[i] = next.seq;
        this.lastCmd[i] = next.cmd;
        return next.cmd;
      }
      const l = this.lastCmd[i];
      return { mx: l.mx, my: l.my, bomb: false, ability: false };
    });
    for (const b of this.bots)
      inputs[b.playerId] = b.update(m, DT);
    m.step(inputs);
    if (m.events.length)
      this.pendingEvents.push(...m.events);
    if (m.tick % SNAPSHOT_EVERY === 0 || m.phase === "over")
      this.broadcastSnap();
    if (m.phase === "over" && !this.ended) {
      this.ended = true;
      this.stop();
      for (const token of this.seatOf.keys())
        this.send(token, { t: "matchEnd", winner: m.winnerId });
      this.onEnd(m.winnerId);
    }
  }
  broadcastSnap() {
    const snap = encodeSnapshot(this.match, this.acks, this.pendingEvents);
    this.pendingEvents = [];
    for (const token of this.seatOf.keys())
      this.send(token, { t: "snap", s: snap });
  }
  freeze(token) {
    const i = this.seatOf.get(token);
    if (i === undefined)
      return;
    this.queues[i] = [];
    this.lastCmd[i] = NO_INPUT;
  }
  stop() {
    if (this.timer)
      clearInterval(this.timer);
    this.timer = null;
  }
}
var clamp = (v) => Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;

// server/lobby.ts
class Lobby {
  hooks;
  rooms = new Map;
  constructor(hooks) {
    this.hooks = hooks;
  }
  view(r) {
    const players = r.members.map((mb) => {
      const c = this.hooks.client(mb.token);
      return {
        id: c.id,
        name: c.name,
        characterId: c.characterId,
        skinId: c.skinId,
        ready: mb.ready,
        connected: mb.connected,
        isHost: mb.token === r.hostToken
      };
    });
    return {
      code: r.code,
      name: r.name,
      hostId: this.hooks.client(r.hostToken)?.id ?? "",
      modeId: r.modeId,
      mapId: r.mapId,
      fillBots: r.fillBots,
      state: r.game ? "playing" : "lobby",
      maxPlayers: MAX_ROOM_PLAYERS,
      players
    };
  }
  broadcast(r) {
    const room = this.view(r);
    for (const mb of r.members)
      this.hooks.send(mb.token, { t: "room", room });
  }
  event(r, kind, name, except) {
    for (const mb of r.members)
      if (mb.token !== except)
        this.hooks.send(mb.token, { t: "roomEvent", kind, name });
  }
  error(token, code, message) {
    this.hooks.send(token, { t: "error", code, message });
  }
  roomOf(c) {
    return c.room ? this.rooms.get(c.room) : undefined;
  }
  peek(code) {
    const r = this.rooms.get(normalizeCode(code));
    if (!r)
      return { code: normalizeCode(code), found: false };
    return {
      code: r.code,
      found: true,
      hostName: this.hooks.client(r.hostToken)?.name ?? "",
      modeId: r.modeId,
      mapId: r.mapId,
      players: r.members.length,
      max: MAX_ROOM_PLAYERS,
      playing: !!r.game
    };
  }
  create(c, isPublic = false) {
    if (c.room)
      this.leave(c);
    let code = generateRoomCode();
    while (this.rooms.has(code))
      code = generateRoomCode();
    const r = {
      code,
      name: `Partie de ${c.name}`,
      hostToken: c.token,
      modeId: "classic",
      mapId: "forest",
      fillBots: false,
      members: [{ token: c.token, ready: true, connected: true, graceTimer: null }],
      game: null,
      isPublic
    };
    this.rooms.set(code, r);
    c.room = code;
    this.broadcast(r);
    return r;
  }
  join(c, rawCode) {
    const code = normalizeCode(rawCode);
    const r = this.rooms.get(code);
    if (!r)
      return this.error(c.token, "not_found", "Cette partie n'existe pas (ou plus). Vérifie le code.");
    const existing = r.members.find((mb) => mb.token === c.token);
    if (existing)
      return this.reconnect(c);
    if (r.game)
      return this.error(c.token, "in_game", "La partie a déjà commencé. Attends la fin de la manche.");
    if (r.members.length >= MAX_ROOM_PLAYERS)
      return this.error(c.token, "full", "La salle est pleine (4 joueurs).");
    if (c.room && c.room !== code)
      this.leave(c);
    r.members.push({ token: c.token, ready: false, connected: true, graceTimer: null });
    c.room = code;
    this.broadcast(r);
    this.event(r, "joined", c.name, c.token);
    const host = r.members.find((mb) => mb.token === r.hostToken);
    if (host && !host.connected)
      this.hooks.notifyOffline([host.token], "Bombe Rush", `\uD83D\uDD25 ${c.name} a rejoint ta partie !`);
  }
  leave(c, kind = "left") {
    const r = this.roomOf(c);
    c.room = null;
    if (!r)
      return;
    const mb = r.members.find((m) => m.token === c.token);
    if (mb?.graceTimer)
      clearTimeout(mb.graceTimer);
    r.members = r.members.filter((m) => m.token !== c.token);
    r.game?.freeze(c.token);
    if (!r.members.length) {
      r.game?.stop();
      this.rooms.delete(r.code);
      return;
    }
    if (r.hostToken === c.token) {
      const next = r.members.find((m) => m.connected) ?? r.members[0];
      r.hostToken = next.token;
      next.ready = true;
      const nc = this.hooks.client(next.token);
      if (nc) {
        r.name = `Partie de ${nc.name}`;
        this.event(r, "host", nc.name);
      }
    }
    this.broadcast(r);
    this.event(r, kind, c.name);
  }
  kick(host, playerId) {
    const r = this.roomOf(host);
    if (!r || r.hostToken !== host.token)
      return this.error(host.token, "not_host", "Seul l'hôte peut exclure un joueur.");
    const target = r.members.map((m) => this.hooks.client(m.token)).find((c) => c.id === playerId);
    if (!target || target.token === host.token)
      return;
    this.hooks.send(target.token, { t: "kicked" });
    this.leave(target, "kicked");
  }
  setReady(c, ready) {
    const r = this.roomOf(c);
    const mb = r?.members.find((m) => m.token === c.token);
    if (!r || !mb || r.game)
      return;
    mb.ready = r.hostToken === c.token ? true : ready;
    this.broadcast(r);
  }
  updateProfile(c) {
    const r = this.roomOf(c);
    if (!r)
      return;
    if (r.hostToken === c.token)
      r.name = `Partie de ${c.name}`;
    this.broadcast(r);
  }
  setSettings(c, s) {
    const r = this.roomOf(c);
    if (!r || r.game)
      return;
    if (r.hostToken !== c.token)
      return this.error(c.token, "not_host", "Seul l'hôte choisit le mode et la carte.");
    if (s.modeId && MODES.some((m) => m.id === s.modeId && m.available))
      r.modeId = s.modeId;
    if (s.mapId && (s.mapId === RANDOM_MAP || MAPS.some((m) => m.id === s.mapId)))
      r.mapId = s.mapId;
    if (typeof s.fillBots === "boolean")
      r.fillBots = s.fillBots;
    this.broadcast(r);
  }
  blocker(r) {
    const humans = r.members.length;
    const total = r.fillBots ? Math.max(humans, MAX_ROOM_PLAYERS) : humans;
    if (total < 2)
      return "Invite au moins un ami (ou ajoute des bots).";
    const notReady = r.members.filter((m) => m.token !== r.hostToken && (!m.ready || !m.connected));
    if (notReady.length)
      return "Tous les joueurs doivent être prêts.";
    return null;
  }
  start(c) {
    const r = this.roomOf(c);
    if (!r || r.game)
      return;
    if (r.hostToken !== c.token)
      return this.error(c.token, "not_host", "Seul l'hôte peut lancer la partie.");
    const why = this.blocker(r);
    if (why)
      return this.error(c.token, "not_ready", why);
    const seats = r.members.map((mb) => {
      const cl = this.hooks.client(mb.token);
      return { token: cl.token, name: cl.name, characterId: cl.characterId, skinId: cl.skinId };
    });
    const taken = new Set;
    for (const s of seats) {
      if (taken.has(s.characterId)) {
        const alt = CHARACTERS.find((ch) => !taken.has(ch.id) && !seats.some((o) => o.characterId === ch.id));
        if (alt) {
          s.characterId = alt.id;
          s.skinId = undefined;
        }
      }
      taken.add(s.characterId);
    }
    r.game = new GameRunner(seats, { mapId: r.mapId, modeId: r.modeId, fillBots: r.fillBots, maxPlayers: MAX_ROOM_PLAYERS }, this.hooks.send, () => this.endGame(r));
    for (const mb of r.members)
      if (mb.token !== r.hostToken)
        mb.ready = false;
    this.broadcast(r);
    r.game.start();
    const offline = r.members.filter((m) => !m.connected).map((m) => m.token);
    if (offline.length)
      this.hooks.notifyOffline(offline, "Bombe Rush", "\uD83D\uDCA3 La partie commence ! Reviens vite.");
  }
  endGame(r) {
    setTimeout(() => {
      r.game = null;
      if (this.rooms.has(r.code))
        this.broadcast(r);
    }, 1500);
  }
  input(c, seq, cmd) {
    this.roomOf(c)?.game?.input(c.token, seq, cmd);
  }
  disconnected(c) {
    const r = this.roomOf(c);
    const mb = r?.members.find((m) => m.token === c.token);
    if (!r || !mb)
      return;
    mb.connected = false;
    r.game?.freeze(c.token);
    this.broadcast(r);
    this.event(r, "disconnected", c.name, c.token);
    mb.graceTimer = setTimeout(() => {
      if (!mb.connected && c.room === r.code)
        this.leave(c);
    }, RECONNECT_GRACE_S * 1000);
  }
  reconnect(c) {
    const r = this.roomOf(c);
    const mb = r?.members.find((m) => m.token === c.token);
    if (!r || !mb) {
      c.room = null;
      this.hooks.send(c.token, { t: "room", room: null });
      return;
    }
    if (mb.graceTimer)
      clearTimeout(mb.graceTimer);
    mb.graceTimer = null;
    const was = mb.connected;
    mb.connected = true;
    this.broadcast(r);
    if (!was)
      this.event(r, "reconnected", c.name, c.token);
    r.game?.sendStart(c.token);
  }
}

// server/matchmaking.ts
class Matchmaker {
  lobby;
  opts;
  queue = [];
  waitingSince = new Map;
  constructor(lobby, opts = { minPlayers: 2, maxPlayers: 4, maxWaitS: 20 }) {
    this.lobby = lobby;
    this.opts = opts;
  }
  enqueue(c) {
    if (this.queue.some((q) => q.token === c.token))
      return;
    this.queue.push(c);
    this.waitingSince.set(c.token, Date.now());
  }
  dequeue(c) {
    this.queue = this.queue.filter((q) => q.token !== c.token);
    this.waitingSince.delete(c.token);
  }
  tick() {
    this.queue = this.queue.filter((c) => c.connected && !c.room);
    const oldest = this.queue[0] ? (Date.now() - (this.waitingSince.get(this.queue[0].token) ?? Date.now())) / 1000 : 0;
    const enough = this.queue.length >= this.opts.maxPlayers || this.queue.length >= this.opts.minPlayers && oldest > this.opts.maxWaitS;
    if (!enough)
      return;
    const group = this.queue.splice(0, this.opts.maxPlayers);
    const room = this.lobby.create(group[0], true);
    for (const c of group.slice(1))
      this.lobby.join(c, room.code);
    for (const c of group)
      this.waitingSince.delete(c.token);
  }
  get size() {
    return this.queue.length;
  }
}

// server/push.ts
import { createSign } from "node:crypto";

class PushService {
  tokens = new Map;
  account = null;
  projectId = process.env.FCM_PROJECT_ID ?? "";
  accessToken = "";
  accessExp = 0;
  constructor() {
    const raw = process.env.FCM_SERVICE_ACCOUNT;
    if (raw && this.projectId) {
      try {
        this.account = JSON.parse(raw);
      } catch {
        console.warn("[push] FCM_SERVICE_ACCOUNT n'est pas un JSON valide");
      }
    }
    console.log(this.account ? "[push] FCM configuré" : "[push] non configuré : notifications push désactivées");
  }
  get enabled() {
    return !!this.account;
  }
  register(clientToken, platform, token) {
    this.tokens.set(clientToken, { platform, token });
  }
  async notify(clientTokens, title, body) {
    if (!this.account)
      return;
    for (const ct of clientTokens) {
      const t = this.tokens.get(ct);
      if (!t)
        continue;
      try {
        await this.send(t.token, title, body);
      } catch (e) {
        console.warn("[push] échec d'envoi", e.message);
      }
    }
  }
  async bearer() {
    if (this.accessToken && Date.now() < this.accessExp - 60000)
      return this.accessToken;
    const a = this.account;
    const now = Math.floor(Date.now() / 1000);
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
      iss: a.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    })}`;
    const sig = createSign("RSA-SHA256").update(unsigned).sign(a.private_key, "base64url");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${sig}`
    });
    const json = await res.json();
    this.accessToken = json.access_token;
    this.accessExp = Date.now() + json.expires_in * 1000;
    return this.accessToken;
  }
  async send(token, title, body) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${await this.bearer()}`, "content-type": "application/json" },
      body: JSON.stringify({ message: { token, notification: { title, body }, android: { priority: "high" } } })
    });
    if (!res.ok)
      throw new Error(`FCM ${res.status}`);
  }
}

// server/ws.ts
import { createHash } from "node:crypto";
var GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

class WsConn {
  socket;
  buf = Buffer.alloc(0);
  frag = [];
  alive = true;
  closed = false;
  onMessage = () => {};
  onClose = () => {};
  ip;
  constructor(socket, ip) {
    this.socket = socket;
    this.ip = ip;
    socket.on("data", (d) => this.onData(d));
    socket.on("close", () => this.finish());
    socket.on("end", () => this.finish());
    socket.on("error", () => this.finish());
  }
  finish() {
    if (this.closed)
      return;
    this.closed = true;
    this.socket.destroy();
    this.onClose();
  }
  onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.buf.length >= 2) {
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const fin = (b0 & 128) !== 0;
      const op = b0 & 15;
      const masked = (b1 & 128) !== 0;
      let len = b1 & 127;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4)
          return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10)
          return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(1 << 20))
          return this.close(1009);
        len = Number(big);
        off = 10;
      }
      if (!masked)
        return this.close(1002);
      if (this.buf.length < off + 4 + len)
        return;
      const mask = this.buf.subarray(off, off + 4);
      const payload = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0;i < payload.length; i++)
        payload[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      this.handle(op, fin, payload);
      if (this.closed)
        return;
    }
  }
  handle(op, fin, payload) {
    switch (op) {
      case 0:
      case 1:
      case 2:
        this.frag.push(payload);
        if (fin) {
          const msg = Buffer.concat(this.frag).toString("utf8");
          this.frag = [];
          this.onMessage(msg);
        }
        break;
      case 8:
        this.close(1000);
        break;
      case 9:
        this.frame(10, payload);
        break;
      case 10:
        this.alive = true;
        break;
    }
  }
  frame(op, payload) {
    if (this.closed)
      return;
    const len = payload.length;
    let head;
    if (len < 126)
      head = Buffer.from([128 | op, len]);
    else if (len < 65536) {
      head = Buffer.alloc(4);
      head[0] = 128 | op;
      head[1] = 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 128 | op;
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(len), 2);
    }
    this.socket.write(Buffer.concat([head, payload]));
  }
  send(text) {
    this.frame(1, Buffer.from(text, "utf8"));
  }
  heartbeat() {
    if (!this.alive)
      return this.finish();
    this.alive = false;
    this.frame(9, Buffer.alloc(0));
  }
  close(code = 1000) {
    if (this.closed)
      return;
    const p = Buffer.alloc(2);
    p.writeUInt16BE(code, 0);
    try {
      this.frame(8, p);
    } catch {}
    this.finish();
  }
}
function acceptUpgrade(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string" || req.headers.upgrade?.toLowerCase() !== "websocket") {
    socket.end(`HTTP/1.1 400 Bad Request\r
\r
`);
    return null;
  }
  const accept = createHash("sha1").update(key + GUID).digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r
` + `Upgrade: websocket\r
` + `Connection: Upgrade\r
` + `Sec-WebSocket-Accept: ${accept}\r
\r
`);
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
  return new WsConn(socket, ip);
}

// server/index.ts
var PORT = Number(process.env.PORT ?? 8787);
var HERE = dirname(fileURLToPath(import.meta.url));
var STATIC_DIR = process.env.STATIC_DIR ? resolve(process.env.STATIC_DIR) : existsSync(join(HERE, "www", "index.html")) ? join(HERE, "www") : join(process.cwd(), "dist", "www");
var clients = new Map;
var conns = new Map;
var push = new PushService;
var send = (token, msg) => {
  const c = conns.get(token);
  if (c && !c.closed)
    c.send(JSON.stringify(msg));
};
var lobby = new Lobby({
  send,
  client: (token) => clients.get(token),
  notifyOffline: (tokens, title, body) => void push.notify(tokens, title, body)
});
var matchmaker = new Matchmaker(lobby);
setInterval(() => matchmaker.tick(), 1000);
var cleanName = (n) => String(n ?? "").replace(/[<>&"]/g, "").trim().slice(0, 16) || "Joueur";
var MAX_MSG_PER_SEC = 150;
var MAX_ROOMS = 2000;
function onMessage(conn, raw, state) {
  const now = Date.now();
  if (now - state.win > 1000) {
    state.win = now;
    state.count = 0;
  }
  if (++state.count > MAX_MSG_PER_SEC || raw.length > 4096) {
    conn.close(4008);
    return;
  }
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.t === "hello") {
    const token = typeof msg.token === "string" && msg.token.length >= 16 ? msg.token.slice(0, 64) : randomBytes(16).toString("hex");
    let c = clients.get(token);
    if (!c) {
      c = { token, id: randomBytes(5).toString("hex"), name: "", characterId: "renard", room: null, connected: true };
      clients.set(token, c);
    }
    const old = conns.get(token);
    if (old && old !== conn)
      old.close(4000);
    conns.set(token, conn);
    state.token = token;
    c.connected = true;
    c.name = cleanName(msg.name);
    c.characterId = String(msg.characterId || "renard");
    c.skinId = msg.skinId ? String(msg.skinId) : undefined;
    send(token, { t: "welcome", you: c.id, v: PROTOCOL_VERSION });
    if (c.room)
      lobby.reconnect(c);
    else
      send(token, { t: "room", room: null });
    return;
  }
  const c = state.token ? clients.get(state.token) : undefined;
  if (!c)
    return;
  switch (msg.t) {
    case "ping":
      send(c.token, { t: "pong" });
      break;
    case "createRoom":
      if (lobby.rooms.size >= MAX_ROOMS) {
        send(c.token, { t: "error", code: "busy", message: "Le serveur est plein pour le moment, réessaie dans un instant." });
        break;
      }
      lobby.create(c);
      break;
    case "peek":
      send(c.token, { t: "peek", ...lobby.peek(String(msg.code ?? "")) });
      break;
    case "joinRoom":
      lobby.join(c, String(msg.code ?? ""));
      break;
    case "leaveRoom":
      lobby.leave(c);
      send(c.token, { t: "room", room: null });
      break;
    case "setReady":
      lobby.setReady(c, !!msg.ready);
      break;
    case "setName":
      c.name = cleanName(msg.name);
      lobby.updateProfile(c);
      break;
    case "setLook":
      c.characterId = String(msg.characterId || c.characterId);
      c.skinId = msg.skinId ? String(msg.skinId) : undefined;
      lobby.updateProfile(c);
      break;
    case "setSettings":
      lobby.setSettings(c, msg);
      break;
    case "kick":
      lobby.kick(c, String(msg.playerId));
      break;
    case "start":
      lobby.start(c);
      break;
    case "input":
      if (msg.cmd)
        lobby.input(c, Number(msg.seq) || 0, msg.cmd);
      break;
    case "pushToken":
      push.register(c.token, msg.platform, String(msg.token));
      break;
  }
}
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".json": "application/json",
  ".apk": "application/vnd.android.package-archive"
};
var server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ ok: true, rooms: lobby.rooms.size, players: conns.size, push: push.enabled, v: PROTOCOL_VERSION }));
    return;
  }
  if (url.pathname === "/.well-known/assetlinks.json" && process.env.ANDROID_PACKAGE && process.env.ANDROID_SHA256) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: process.env.ANDROID_PACKAGE, sha256_cert_fingerprints: [process.env.ANDROID_SHA256] }
      }
    ]));
    return;
  }
  const invite = url.pathname.match(/^\/(?:j|join)\/([A-Za-z0-9]+)\/?$/);
  let path = invite || url.pathname === "/" ? "/index.html" : url.pathname;
  path = normalize(path).replace(/^(\.\.[/\\])+/, "");
  try {
    let data = await readFile(join(STATIC_DIR, path));
    if (path === "/index.html") {
      const origin = `${req.headers["x-forwarded-proto"]?.split(",")[0] || "http"}://${req.headers.host}`;
      let html = data.toString("utf8").replaceAll("__ORIGIN__", origin);
      if (invite) {
        const p = lobby.peek(invite[1]);
        const who = p.found && p.hostName ? `${p.hostName} t'invite` : "On t'invite";
        const mode = p.found && p.modeId === "chaos" ? " en mode CHAOS \uD83D\uDC80" : "";
        html = html.replace(/(<meta property="og:title" content=")[^"]*/, `$1\uD83C\uDFAE ${who} sur BOMBE RUSH${mode}`).replace(/(<meta property="og:description" content=")[^"]*/, `$1Clique pour rejoindre la partie privée ${invite[1].toUpperCase()} — aucune installation, ça se joue dans le navigateur.`);
      }
      data = html;
    }
    const ext = extname(path);
    const immutable = ext === ".png" || ext === ".ico" || ext === ".svg";
    res.writeHead(200, {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": immutable ? "public, max-age=86400" : "no-cache"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Introuvable");
  }
});
server.on("upgrade", (req, socket) => {
  if (!req.url?.startsWith("/ws")) {
    socket.destroy();
    return;
  }
  const conn = acceptUpgrade(req, socket);
  if (!conn)
    return;
  const state = { token: null, win: 0, count: 0 };
  conn.onMessage = (raw) => onMessage(conn, raw, state);
  conn.onClose = () => {
    if (!state.token || conns.get(state.token) !== conn)
      return;
    conns.delete(state.token);
    const c = clients.get(state.token);
    if (!c)
      return;
    c.connected = false;
    lobby.disconnected(c);
  };
});
setInterval(() => {
  for (const c of conns.values())
    c.heartbeat();
}, 4000);
server.listen(PORT, () => {
  console.log(`BOMBE RUSH — serveur prêt sur http://localhost:${PORT}  (jeu : ${STATIC_DIR})`);
});
