// server/index.ts
import { randomBytes as randomBytes3 } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { existsSync as existsSync2 } from "node:fs";
import { dirname, extname, join as join2, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// src/core/characters.ts
var CHARACTERS = [
  { id: "renard", name: "Flamme", kind: "fox", tagline: "Renard malin", bio: "Toujours un coup d'avance… et une bombe dans la poche." },
  { id: "boulon", name: "Boulon", kind: "robot", tagline: "Robot de chantier", bio: "Programmé pour tout démolir. Bloc par bloc." },
  { id: "rainette", name: "Rainette", kind: "frog", tagline: "Grenouille sauteuse", bio: "Elle saute de joie à chaque explosion." },
  { id: "kage", name: "Kage", kind: "ninja", tagline: "Ninja discret", bio: "On ne l'entend jamais arriver. Sa bombe, si." },
  { id: "champi", name: "Champi", kind: "mushroom", tagline: "Champignon têtu", bio: "Petit, têtu, et franchement explosif." },
  { id: "bruno", name: "Bruno", kind: "bear", tagline: "Ourson costaud", bio: "Un gros câlin, puis un gros BOUM." },
  { id: "pingo", name: "Pingo", kind: "penguin", tagline: "Pingouin glisseur", bio: "Il glisse partout, même là où il n'y a pas de glace.", locked: true, rarity: "epic" }
];
var P = (main, dark, light, accent) => ({ main, dark, light, accent });
var CLASSIC = {
  renard: { name: "Classique", palette: P("#ff8a2b", "#c4520c", "#fff1df", "#3a2418"), aura: "leaves" },
  boulon: { name: "Classique", palette: P("#5aa0ff", "#2c5fb8", "#d6e8ff", "#ffd23f") },
  rainette: { name: "Classique", palette: P("#4fd46a", "#22893c", "#e8ffd0", "#1f6e33") },
  kage: { name: "Classique", palette: P("#3b3f6b", "#1e2140", "#ffd9b8", "#ff4b4b") },
  champi: { name: "Classique", palette: P("#ff4d4d", "#b81c2a", "#fff3e0", "#ffffff") },
  bruno: { name: "Classique", palette: P("#a8693a", "#6b3e1c", "#f2d2a8", "#3a2414") },
  pingo: { name: "Classique", palette: P("#2f3e5c", "#18223a", "#ffffff", "#ffb020"), wear: ["scarf"] }
};
var LEGACY = [
  { id: "renard-arctique", characterId: "renard", name: "Arctique", rarity: "rare", palette: P("#e9f4ff", "#9cb8d6", "#ffffff", "#3e5f8a"), wear: ["scarf"], aura: "snow" },
  { id: "renard-ombre", characterId: "renard", name: "Ombre", rarity: "epic", palette: P("#5b3d8f", "#341f5c", "#d8c9ff", "#ff5fa2"), wear: ["glasses"], aura: "smoke" },
  { id: "boulon-rouille", characterId: "boulon", name: "Rouille", rarity: "rare", palette: P("#c8743f", "#7f4120", "#f2cfae", "#5fe0c0"), pattern: "spots" },
  { id: "boulon-neon", characterId: "boulon", name: "Néon", rarity: "epic", palette: P("#2a2a3d", "#141422", "#5d5d80", "#ff3fb4"), wear: ["headphones"], aura: "bolts" },
  { id: "rainette-tropic", characterId: "rainette", name: "Tropicale", rarity: "rare", palette: P("#2fb7ff", "#1470b8", "#fff27a", "#ff8a1f"), wear: ["flower"], aura: "bubbles" },
  { id: "rainette-lave", characterId: "rainette", name: "Lave", rarity: "epic", palette: P("#ff4b3a", "#a8180f", "#ffd06a", "#2a1010"), aura: "embers" },
  { id: "rainette-royale", characterId: "rainette", name: "Royale", rarity: "legend", palette: P("#9a5cff", "#5c2bb8", "#f0e2ff", "#ffcc33"), wear: ["crown"], aura: "sparkle" },
  { id: "kage-neige", characterId: "kage", name: "Neige", rarity: "rare", palette: P("#eef2f7", "#a9b4c4", "#ffd9b8", "#3fa2ff"), aura: "snow" },
  { id: "kage-sakura", characterId: "kage", name: "Sakura", rarity: "epic", palette: P("#ff86b8", "#c4467c", "#ffe0cc", "#ffffff"), wear: ["flower"], aura: "petals" },
  { id: "champi-cepe", characterId: "champi", name: "Cèpe", rarity: "rare", palette: P("#9a5a2c", "#5e3214", "#fff0d6", "#d9a76b"), aura: "leaves" },
  { id: "champi-lumi", characterId: "champi", name: "Lumi", rarity: "epic", palette: P("#3fe0e0", "#14808f", "#f2ffff", "#d8ff5a"), wear: ["glasses"], aura: "sparkle" },
  { id: "bruno-panda", characterId: "bruno", name: "Panda", rarity: "rare", palette: P("#f6f6f2", "#2b2b2b", "#ffffff", "#2b2b2b"), pattern: "panda", aura: "leaves" },
  { id: "bruno-polaire", characterId: "bruno", name: "Polaire", rarity: "epic", palette: P("#e8f6ff", "#9cc4dc", "#ffffff", "#2a3a4a"), wear: ["scarf"], aura: "snow" }
];
var THEMES = [
  {
    id: "plage",
    name: "Plage",
    rarity: "common",
    desc: "Lunettes de soleil, collier de fleurs et bulles de mer.",
    palette: P("#2ec4b6", "#178a80", "#fff3c4", "#ff6b6b"),
    wear: ["shades", "lei"],
    pattern: "none",
    aura: "bubbles"
  },
  {
    id: "cartoon",
    name: "Cartoon",
    rarity: "common",
    desc: "Grands yeux, gros contours, zéro sérieux.",
    palette: P("#ff7eb6", "#d14f8a", "#ffffff", "#4cc9f0"),
    wear: ["bow"],
    pattern: "spots",
    aura: "hearts",
    eyes: "cartoon"
  },
  {
    id: "pirate",
    name: "Pirate",
    rarity: "rare",
    desc: "Tricorne, cache-œil et marinière. À l'abordage !",
    palette: P("#3d5a80", "#24344d", "#f4e1c1", "#e63946"),
    wear: ["pirate", "eyepatch"],
    pattern: "stripes",
    aura: "none"
  },
  {
    id: "ninja",
    name: "Ninja",
    rarity: "rare",
    desc: "Masque de l'ombre et nuage de fumée.",
    palette: P("#2b2d42", "#14151f", "#ffd9b8", "#e63946"),
    perKind: { ninja: { main: "#1a1a24", accent: "#9b5de5" } },
    wear: ["bandana"],
    pattern: "none",
    aura: "smoke"
  },
  {
    id: "robot",
    name: "Mécano",
    rarity: "rare",
    desc: "Carrosserie chromée et petits éclairs.",
    palette: P("#b8c4cf", "#6c7a89", "#eef3f7", "#00d4ff"),
    perKind: { robot: { main: "#ffb703", dark: "#b86e00" } },
    wear: ["helmet"],
    pattern: "circuit",
    aura: "bolts"
  },
  {
    id: "futur",
    name: "Futuriste",
    rarity: "epic",
    desc: "Visière néon et circuits lumineux venus de l'an 3000.",
    palette: P("#1b1f3b", "#0b0d1f", "#7df9ff", "#ff2bd6"),
    wear: ["visor"],
    pattern: "circuit",
    aura: "bolts",
    eyes: "glow"
  },
  {
    id: "volcan",
    name: "Volcan",
    rarity: "epic",
    desc: "Une peau de roche fissurée de lave… et des braises partout.",
    palette: P("#3a1c1c", "#1e0e0e", "#ffb347", "#ff4d00"),
    wear: ["horns"],
    pattern: "cracks",
    aura: "embers"
  },
  {
    id: "glace",
    name: "Glacé",
    rarity: "epic",
    desc: "Givré de la tête aux pieds. Attention, ça glisse.",
    palette: P("#bde0fe", "#7fa7d6", "#ffffff", "#3a86ff"),
    wear: ["beanie"],
    pattern: "frost",
    aura: "snow"
  },
  {
    id: "or",
    name: "Doré",
    rarity: "legend",
    desc: "Or massif, couronne et éclats scintillants.",
    palette: P("#ffcc33", "#c98a10", "#fff4c2", "#8a5a00"),
    wear: ["crown"],
    pattern: "none",
    aura: "sparkle",
    special: "shimmer"
  },
  {
    id: "galaxie",
    name: "Galaxie",
    rarity: "legend",
    desc: "Skin spécial : un ciel étoilé vivant et une auréole cosmique.",
    palette: P("#2a1b5c", "#120a2e", "#c8b6ff", "#ff7ad9"),
    wear: ["halo"],
    pattern: "galaxy",
    aura: "cosmos",
    eyes: "glow",
    special: "rainbow"
  }
];
function buildSkins() {
  const out = [];
  for (const c of CHARACTERS) {
    const base = CLASSIC[c.id];
    out.push({
      id: c.id,
      characterId: c.id,
      name: base.name,
      theme: "classique",
      rarity: "common",
      free: true,
      palette: base.palette,
      wear: base.wear ?? [],
      pattern: base.pattern ?? "none",
      aura: base.aura ?? "none",
      desc: "La tenue d'origine."
    });
    for (const l of LEGACY.filter((s) => s.characterId === c.id)) {
      out.push({
        id: l.id,
        characterId: c.id,
        name: l.name,
        theme: "collection",
        rarity: l.rarity,
        palette: l.palette,
        wear: l.wear ?? [],
        pattern: l.pattern ?? "none",
        aura: l.aura ?? "none",
        desc: "Édition originale.",
        special: l.rarity === "legend" ? "shimmer" : undefined
      });
    }
    for (const t of THEMES) {
      out.push({
        id: `${c.id}-${t.id}`,
        characterId: c.id,
        name: t.name,
        theme: t.id,
        rarity: t.rarity,
        palette: { ...t.palette, ...t.perKind?.[c.kind] ?? {} },
        wear: [...t.wear],
        pattern: t.pattern,
        aura: t.aura,
        eyes: t.eyes,
        special: t.special,
        desc: t.desc
      });
    }
    out.push({
      id: `${c.id}-maitre`,
      characterId: c.id,
      name: "Maître",
      theme: "maitrise",
      rarity: "legend",
      palette: { ...base.palette, accent: "#ffd23f" },
      wear: ["crown"],
      pattern: "stripes",
      aura: "stars",
      eyes: "glow",
      special: "shimmer",
      desc: `Exclusif : atteins le niveau 30 de maîtrise avec ${c.name}.`,
      exclusive: "mastery"
    });
  }
  return out;
}
var SKINS = buildSkins();

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

// src/core/bombs.ts
var BOMB_KINDS = {
  standard: { id: "standard", name: "Bombe", fuse: 1.4, warn: 0.55 },
  rain: { id: "rain", name: "Bombe du ciel", fuse: 1.6, warn: 0.55 }
};
var THROW = {
  maxDist: 3,
  flightBase: 0.12,
  flightPerCell: 0.11,
  arcHeight: 0.9
};
var BIG = {
  rangeMul: 1.75,
  minExtra: 2,
  maxRange: 9,
  scale: 1.3
};
var SHOCK = {
  stun: 1,
  radius: 2,
  immunity: 0.75
};
var FREEZE = {
  slow: 0.4,
  duration: 2.5,
  radius: 2,
  immunity: 1
};
var TOXIC = {
  duration: 3,
  doseEvery: 0.5,
  lethalDoses: 3,
  recoverEvery: 1,
  maxZones: 8
};
var CHAIN = {
  radius: 3,
  step: 0.09,
  maxDepth: 6,
  maxLinks: 12
};
var REMOTE = {
  maxFuse: 8,
  armDelay: 0.2
};
function bigRange(range) {
  return Math.min(BIG.maxRange, Math.max(range + BIG.minExtra, Math.round(range * BIG.rangeMul)));
}
var BOMB_WARN = Math.max(...Object.values(BOMB_KINDS).map((k) => k.warn));

// src/core/loot.ts
var LOOT = {
  dropChance: 0.42,
  weights: { bomb: 34, flame: 30, speed: 18, shield: 18 },
  maxOnBoard: 6,
  maxPerMatch: { bomb: 14, flame: 12, speed: 6, shield: 5 },
  quadrantLead: 3,
  boostExtraOnBoard: 6
};

class LootTable {
  w;
  h;
  cfg;
  perType = {};
  perQuadrant = [0, 0, 0, 0];
  homes;
  constructor(w, h, spawns = [], cfg = LOOT) {
    this.w = w;
    this.h = h;
    this.cfg = cfg;
    const set = new Set(spawns.map(([x, y]) => this.quadrant(x, y)));
    this.homes = set.size >= 2 ? [...set] : [0, 1, 2, 3];
  }
  quadrant(x, y) {
    return (x < (this.w - 1) / 2 ? 0 : 1) + (y < (this.h - 1) / 2 ? 0 : 2);
  }
  available() {
    const out = {};
    for (const [id, wgt] of Object.entries(this.cfg.weights)) {
      const max = this.cfg.maxPerMatch[id];
      if (wgt > 0 && (max === undefined || (this.perType[id] ?? 0) < max))
        out[id] = wgt;
    }
    return out;
  }
  roll(rng, x, y, onBoard, boost = false) {
    const lucky = rng.chance(this.cfg.dropChance);
    if (!boost && !lucky)
      return null;
    if (onBoard >= this.cfg.maxOnBoard + (boost ? this.cfg.boostExtraOnBoard : 0))
      return null;
    const q = this.quadrant(x, y);
    if (!boost && this.homes.includes(q)) {
      const min = Math.min(...this.homes.map((h) => this.perQuadrant[h]));
      if (this.perQuadrant[q] - min >= this.cfg.quadrantLead)
        return null;
    }
    const pool = this.available();
    if (!Object.keys(pool).length)
      return null;
    const type = rng.weighted(pool);
    this.record(type, x, y);
    return type;
  }
  record(type, x, y) {
    this.perType[type] = (this.perType[type] ?? 0) + 1;
    this.perQuadrant[this.quadrant(x, y)]++;
  }
}

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
var CHAOS_SCHEDULE = {
  first: 15,
  every: 5,
  maxActive: 3,
  maxZoneShare: 0.2,
  rampPerEvent: 0.06,
  rampMax: 0.6
};
var burnZone = (m, run, breakBlocks) => {
  for (const i of run.zone)
    m.ignite(i % m.grid.w, Math.floor(i / m.grid.w), breakBlocks);
};
function walkableCount(m) {
  const g = m.grid;
  let n = 0;
  for (let y = 0;y < g.h; y++)
    for (let x = 0;x < g.w; x++)
      if (!g.blocksMove(x, y))
        n++;
  return n;
}
var ramp = (m) => 1 + Math.min(CHAOS_SCHEDULE.rampMax, (m.chaos?.count ?? 0) * CHAOS_SCHEDULE.rampPerEvent);
function pickRect(m, run, wantW, wantH) {
  const g = m.grid;
  const budget = Math.max(4, Math.floor(walkableCount(m) * CHAOS_SCHEDULE.maxZoneShare));
  let w = Math.min(wantW, g.w - 2);
  let h = Math.min(wantH, g.h - 2);
  while (w * h > budget * 1.6 && (w > 2 || h > 2)) {
    if (w >= h)
      w--;
    else
      h--;
  }
  const x0 = 1 + m.rng.int(Math.max(1, g.w - 1 - w));
  const y0 = 1 + m.rng.int(Math.max(1, g.h - 1 - h));
  run.zone = [];
  for (let y = y0;y < y0 + h; y++)
    for (let x = x0;x < x0 + w; x++)
      if (g.inside(x, y) && g.tile(x, y) !== TILE.WALL)
        run.zone.push(g.idx(x, y));
  run.zone = run.zone.slice(0, budget);
  run.data.cx = x0 + (w - 1) / 2;
  run.data.cy = y0 + (h - 1) / 2;
}
var CHAOS_EVENTS = [
  {
    id: "zone",
    label: "ZONE INTERDITE",
    emoji: "\uD83D\uDEAB",
    hint: "Sors de la zone rouge !",
    danger: true,
    countdown: 2.5,
    duration: 3,
    weight: 3,
    cooldown: 10,
    prepare(m, run) {
      const big = walkableCount(m) > 90;
      pickRect(m, run, big ? 4 : 3, 3);
    },
    start(m, run) {
      burnZone(m, run, false);
    },
    tick(m, run) {
      burnZone(m, run, false);
    }
  },
  {
    id: "fog",
    label: "BROUILLARD",
    emoji: "\uD83C\uDF2B️",
    hint: "Tu ne vois plus que près de toi",
    danger: false,
    countdown: 0,
    duration: 6,
    weight: 2,
    cooldown: 15,
    start(m) {
      m.fog = true;
    },
    end(m) {
      m.fog = false;
    }
  },
  {
    id: "slow",
    label: "RALENTISSEMENT",
    emoji: "\uD83D\uDC0C",
    hint: "Tout le monde avance au ralenti",
    danger: false,
    countdown: 0,
    duration: 5,
    weight: 2,
    cooldown: 12,
    start(m) {
      m.speedMul = 0.6;
    },
    end(m) {
      m.speedMul = 1;
    }
  },
  {
    id: "bombRain",
    label: "PLUIE DE BOMBES",
    emoji: "\uD83D\uDCA3",
    hint: "Des bombes tombent du ciel !",
    danger: true,
    countdown: 2,
    duration: 4,
    weight: 3,
    cooldown: 10,
    start(_m, run) {
      run.data.next = 0;
    },
    tick(m, run, dt) {
      run.data.next -= dt;
      if (run.data.next > 0)
        return;
      run.data.next = Math.max(0.24, 0.4 / ramp(m));
      const cells = m.randomFreeCells(8, true);
      const far = cells.find(([x, y]) => m.players.every((p) => !p.alive || Math.abs(Math.floor(p.x) - x) + Math.abs(Math.floor(p.y) - y) >= 2));
      const c = far ?? cells[0];
      if (c)
        m.spawnNeutralBomb(c[0], c[1], BOMB_KINDS.rain.fuse, 2);
    }
  },
  {
    id: "flameStorm",
    label: "SOL INSTABLE",
    emoji: "\uD83D\uDD73️",
    hint: "Les cases marquées vont s'effondrer en flammes",
    danger: true,
    countdown: 2.5,
    duration: 2.5,
    weight: 3,
    cooldown: 10,
    prepare(m, run) {
      const budget = Math.floor(walkableCount(m) * CHAOS_SCHEDULE.maxZoneShare);
      const n = Math.min(budget, Math.round(9 * ramp(m)));
      run.zone = m.randomFreeCells(n, true).map(([x, y]) => m.grid.idx(x, y));
    },
    start(m, run) {
      burnZone(m, run, false);
    },
    tick(m, run) {
      burnZone(m, run, false);
    }
  },
  {
    id: "overheat",
    label: "SURCHAUFFE",
    emoji: "\uD83C\uDF21️",
    hint: "Nouvelles bombes : +1 portée, mèche plus courte",
    danger: false,
    countdown: 0,
    duration: 6,
    weight: 2,
    cooldown: 15,
    start(m) {
      m.rangeBonus = 1;
      m.fuseMul = 0.8;
    },
    end(m) {
      m.rangeBonus = 0;
      m.fuseMul = 1;
    }
  },
  {
    id: "megaBlast",
    label: "EXPLOSION GÉANTE",
    emoji: "\uD83D\uDCA5",
    hint: "Éloigne-toi de la zone !",
    danger: true,
    countdown: 3,
    duration: 0.9,
    weight: 1,
    cooldown: 20,
    prepare(m, run) {
      const g = m.grid;
      const small = walkableCount(m) < 110;
      const cx = 3 + m.rng.int(Math.max(1, g.w - 6));
      const cy = 3 + m.rng.int(Math.max(1, g.h - 6));
      run.zone = [];
      for (let y = cy - 2;y <= cy + 2; y++)
        for (let x = cx - 2;x <= cx + 2; x++) {
          if (small && Math.abs(x - cx) + Math.abs(y - cy) > 2)
            continue;
          if (g.inside(x, y) && g.tile(x, y) !== TILE.WALL)
            run.zone.push(g.idx(x, y));
        }
      run.data.cx = cx;
      run.data.cy = cy;
    },
    start(m, run) {
      burnZone(m, run, true);
    },
    tick(m, run) {
      burnZone(m, run, false);
    }
  },
  {
    id: "overload",
    label: "SURCHARGE",
    emoji: "⚡",
    hint: "Chaque bloc lâche un bonus",
    danger: false,
    countdown: 0,
    duration: 8,
    weight: 0,
    cooldown: 20,
    start(m) {
      m.bonusBoost = true;
      for (const [x, y] of m.randomFreeCells(4, true))
        m.spawnBonus(m.rng.weighted(LOOT.weights), x, y);
    },
    end(m) {
      m.bonusBoost = false;
    }
  },
  {
    id: "speedChaos",
    label: "SPEED CHAOS",
    emoji: "\uD83C\uDFC3",
    hint: "Tout le monde court plus vite",
    danger: false,
    countdown: 0,
    duration: 7,
    weight: 0,
    cooldown: 20,
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
    hint: "Des boucliers apparaissent",
    danger: false,
    countdown: 0,
    duration: 0.1,
    weight: 0,
    cooldown: 20,
    start(m) {
      for (const [x, y] of m.randomFreeCells(3, true))
        m.spawnBonus("shield", x, y);
    }
  }
];
var chaosDef = (id) => CHAOS_EVENTS.find((e) => e.id === id);

class ChaosDirector {
  m;
  nextAt = CHAOS_SCHEDULE.first;
  pending = null;
  pendingLeft = 0;
  active = [];
  count = 0;
  lastAt = {};
  lastId = "";
  constructor(m) {
    this.m = m;
  }
  get nextIn() {
    return Math.max(0, this.nextAt - this.m.time);
  }
  dangerZones() {
    if (!this.pending)
      return [];
    return this.pending.zone.map((i) => [i, this.pendingLeft]);
  }
  get dangerBusy() {
    return !!this.pending || this.active.some((r) => r.def.danger);
  }
  candidates() {
    const t = this.m.time;
    const busy = this.dangerBusy;
    const activeIds = new Set(this.active.map((r) => r.def.id));
    return CHAOS_EVENTS.filter((e) => e.weight > 0 && e.id !== this.lastId && !activeIds.has(e.id) && !(busy && e.danger) && t - (this.lastAt[e.id] ?? -1e9) >= e.cooldown);
  }
  pick() {
    const list = this.candidates();
    if (!list.length)
      return null;
    const pool = {};
    for (const e of list)
      pool[e.id] = e.weight;
    const id = this.m.rng.weighted(pool);
    return list.find((e) => e.id === id) ?? null;
  }
  trigger(id) {
    const def = chaosDef(id);
    if (def)
      this.launch(def);
  }
  launch(def) {
    const m = this.m;
    const run = { def, zone: [], timer: def.duration, data: {} };
    this.count++;
    this.lastAt[def.id] = m.time;
    this.lastId = def.id;
    def.prepare?.(m, run);
    if (def.countdown > 0) {
      if (this.pending)
        this.begin(this.pending);
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
    if (m.time + 0.000001 < this.nextAt)
      return;
    this.nextAt += CHAOS_SCHEDULE.every;
    if (m.aliveCount <= 1)
      return;
    if (this.active.length + (this.pending ? 1 : 0) >= CHAOS_SCHEDULE.maxActive) {
      m.events.push({ t: "chaosSkip" });
      return;
    }
    const def = this.pick();
    if (def)
      this.launch(def);
  }
}

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
  bombFuse: BOMB_KINDS.standard.fuse,
  bombWarn: BOMB_WARN,
  fireDuration: 0.55,
  shieldDuration: 3,
  maxShieldCharges: 1,
  ventPeriod: 9,
  ventStagger: 3,
  ventWarn: 1.6,
  cornerAssist: 0.42
};
var DT = 1 / RULES.tickRate;

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

// src/core/specials.ts
var SPECIALS = [
  { id: "throw", field: "throwCharges", label: "Bombe à lancer" },
  { id: "big", field: "bigCharges", label: "Grosse bombe" },
  { id: "elec", field: "elecCharges", label: "Bombe électrique" },
  { id: "freeze", field: "freezeCharges", label: "Bombe gelante" },
  { id: "toxic", field: "toxicCharges", label: "Bombe toxique" },
  { id: "chain", field: "chainCharges", label: "Réaction en chaîne" },
  { id: "remote", field: "remoteCharges", label: "Bombe télécommandée" }
];
var SPECIAL_BY_ID = Object.fromEntries(SPECIALS.map((s) => [s.id, s]));
var SPECIAL_RULES = {
  maxHeld: 2
};
function heldCount(p) {
  let n = 0;
  for (const s of SPECIALS)
    if (p[s.field] > 0)
      n++;
  return n;
}
function refuseReason(p, id) {
  const def = SPECIAL_BY_ID[id];
  if (!def)
    return null;
  if (p[def.field] > 0)
    return "same";
  if (heldCount(p) >= SPECIAL_RULES.maxHeld)
    return "full";
  return null;
}
function clearAbilities(p) {
  for (const s of SPECIALS)
    p[s.field] = 0;
  p.stunTime = 0;
  p.stunImmune = 0;
  p.slowTime = 0;
  p.slowImmune = 0;
  p.toxDose = 0;
  p.toxTick = 0;
  p.toxRecover = 0;
}
var ALL_WEIGHTS = { throw: 16, big: 16, elec: 14, freeze: 14, toxic: 14, chain: 12, remote: 14 };
var ALL_QUOTAS = { throw: 4, big: 4, elec: 4, freeze: 4, toxic: 4, chain: 4, remote: 4 };
var SPECIAL_SPAWN = {
  firstAt: 12,
  opening: 0,
  openingEvery: 2,
  interval: [10, 15],
  chance: 0.6,
  maxOnBoard: 1,
  weights: ALL_WEIGHTS,
  maxPerMatch: ALL_QUOTAS,
  repeatPenalty: 0.25,
  minPlayerDist: 3,
  minAlive: 2,
  fairGap: 2
};
var ACCESS_COST = { block: 4, bomb: 2 };

class SpecialSpawner {
  m;
  cfg;
  nextIn;
  disabled = false;
  openingLeft;
  spawned = {};
  lastType = "";
  lastCell = -1;
  log = [];
  constructor(m, cfg = {}) {
    this.m = m;
    this.cfg = { ...SPECIAL_SPAWN, ...cfg };
    this.nextIn = this.cfg.firstAt;
    this.openingLeft = this.cfg.opening;
  }
  onBoard() {
    let n = 0;
    for (const b of this.m.bonuses.values())
      if (SPECIAL_BY_ID[b.type])
        n++;
    return n;
  }
  update() {
    const m = this.m;
    if (this.disabled || m.phase !== "playing")
      return;
    this.nextIn -= DT;
    if (this.nextIn > 0)
      return;
    const opening = this.openingLeft > 0;
    if (opening) {
      this.openingLeft--;
      this.nextIn = this.openingLeft > 0 ? this.cfg.openingEvery : this.rollInterval();
    } else
      this.nextIn = this.rollInterval();
    const lucky = m.rng.chance(this.cfg.chance);
    if (!opening && !lucky)
      return;
    this.trySpawn();
  }
  rollInterval() {
    const [a, b] = this.cfg.interval;
    return a + (b - a) * this.m.rng.next();
  }
  trySpawn() {
    const m = this.m;
    const alive = m.players.filter((p) => p.alive);
    if (alive.length < this.cfg.minAlive)
      return null;
    if (this.onBoard() >= this.cfg.maxOnBoard)
      return null;
    const type = this.pickType();
    if (!type)
      return null;
    const cell = this.pickCell();
    if (!cell)
      return null;
    if (!m.spawnBonus(type, cell[0], cell[1]))
      return null;
    this.spawned[type] = (this.spawned[type] ?? 0) + 1;
    this.lastType = type;
    this.lastCell = m.grid.idx(cell[0], cell[1]);
    this.log.push({ t: m.time, type, x: cell[0], y: cell[1] });
    return type;
  }
  pickType() {
    const pool = {};
    const onBoard = new Set([...this.m.bonuses.values()].map((b) => b.type));
    for (const [id, w0] of Object.entries(this.cfg.weights)) {
      if (!SPECIAL_BY_ID[id] || w0 <= 0)
        continue;
      const max = this.cfg.maxPerMatch[id];
      const n = this.spawned[id] ?? 0;
      if (max !== undefined && n >= max)
        continue;
      if (onBoard.has(id))
        continue;
      let w = w0 / (1 + n);
      if (id === this.lastType)
        w *= this.cfg.repeatPenalty;
      pool[id] = w;
    }
    if (!Object.keys(pool).length)
      return null;
    return this.m.rng.weighted(pool);
  }
  pickCell() {
    const m = this.m;
    const g = m.grid;
    const alive = m.players.filter((p) => p.alive);
    const dists = alive.map((p) => this.walkDist(Math.floor(p.x), Math.floor(p.y)));
    const zone = m.hill?.cellSet;
    const teams = m.teams;
    const cands = [];
    for (let y = 1;y < g.h - 1; y++)
      for (let x = 1;x < g.w - 1; x++) {
        const i = g.idx(x, y);
        if (!m.isFreeCell(x, y, true) || g.isHazard(x, y))
          continue;
        if (g.terrainAt(x, y) === TERRAIN.VENT)
          continue;
        if (g.fire[i] > 0 || m.gasAt(i) || zone?.has(i) || i === this.lastCell)
          continue;
        if (alive.some((p) => Math.abs(Math.floor(p.x) - x) + Math.abs(Math.floor(p.y) - y) < this.cfg.minPlayerDist))
          continue;
        const d = dists.map((arr) => arr[i]);
        let gap;
        if (teams) {
          const best = new Map;
          alive.forEach((p, k) => {
            const t = teams[p.id];
            best.set(t, Math.min(best.get(t) ?? Infinity, d[k]));
          });
          const vals = [...best.values()];
          if (vals.length < 2 || vals.some((v) => v === Infinity))
            continue;
          gap = Math.max(...vals) - Math.min(...vals);
        } else {
          const reach = d.filter((v) => v !== Infinity).sort((a, b) => a - b);
          if (reach.length < Math.min(2, alive.length))
            continue;
          gap = reach.length >= 2 ? reach[1] - reach[0] : 0;
        }
        cands.push({ x, y, gap });
      }
    if (!cands.length)
      return null;
    const minGap = Math.min(...cands.map((c) => c.gap));
    const fair = cands.filter((c) => c.gap <= Math.max(minGap, this.cfg.fairGap));
    const c = fair[Math.floor(m.rng.next() * fair.length)];
    return [c.x, c.y];
  }
  walkDist(sx, sy) {
    const g = this.m.grid;
    const dist = new Float32Array(g.w * g.h).fill(Infinity);
    const start = g.idx(sx, sy);
    dist[start] = 0;
    const buckets = [[start]];
    for (let d = 0;d < buckets.length; d++) {
      const bucket = buckets[d];
      if (!bucket)
        continue;
      for (const c of bucket) {
        if (dist[c] !== d)
          continue;
        const x = c % g.w;
        const y = (c - x) / g.w;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          const t = g.tile(nx, ny);
          if (t === TILE.WALL || g.isHazard(nx, ny))
            continue;
          const n = g.idx(nx, ny);
          const cost = t === TILE.BLOCK ? ACCESS_COST.block : g.bombAt[n] >= 0 ? ACCESS_COST.bomb : 1;
          const nd = d + cost;
          if (nd >= dist[n])
            continue;
          dist[n] = nd;
          (buckets[nd] ??= []).push(n);
        }
      }
    }
    return dist;
  }
}

// src/core/hill.ts
var HILL_RULES = {
  target: 25,
  respawnDelay: 3,
  respawnShield: 2.5,
  respawnHillGap: 3,
  moveMin: 10,
  moveMax: 15,
  moveWarn: 3,
  spawnGap: 3,
  minJump: 3,
  memory: 4,
  fairGap: 4,
  liveFairGap: 3
};

class HillState {
  m;
  sites;
  site = 0;
  next = -1;
  moveIn = HILL_RULES.moveMin;
  recent = [];
  lean = 0;
  scores;
  respawnIn;
  holder = -1;
  contested = false;
  constructor(m) {
    this.m = m;
    const g = m.grid;
    const cx = Math.floor((g.w - 1) / 2);
    const cy = Math.floor((g.h - 1) / 2);
    const qx = Math.round((g.w - 1) * 0.25);
    const qy = Math.round((g.h - 1) * 0.3);
    const centers = [
      [cx, cy],
      [qx, qy],
      [g.w - 1 - qx, qy],
      [qx, g.h - 1 - qy],
      [g.w - 1 - qx, g.h - 1 - qy]
    ];
    this.sites = [];
    const drawn = HillState.drawnSites(m);
    if (drawn.length) {
      drawn.sort((a, b) => Math.abs(a.center[0] - cx) + Math.abs(a.center[1] - cy) - (Math.abs(b.center[0] - cx) + Math.abs(b.center[1] - cy)));
      this.sites.push(...drawn);
    }
    if (!this.sites.length)
      for (const c of centers) {
        const cells = HillState.cellsAround(m, c[0], c[1]);
        if (cells.length >= 2 && !this.sites.some((o) => o.center[0] === c[0] && o.center[1] === c[1]))
          this.sites.push({ center: c, cells, set: new Set(cells) });
      }
    if (!this.sites.length) {
      const cells = HillState.cellsAround(m, cx, cy);
      this.sites.push({ center: [cx, cy], cells, set: new Set(cells) });
    }
    const usable = (x, y) => x > 0 && y > 0 && x < g.w - 1 && y < g.h - 1 && g.tile(x, y) !== TILE.WALL && !g.isHazard(x, y);
    const single = [];
    for (const st of this.sites) {
      const [x0, y0] = st.center;
      let pick = usable(x0, y0) ? [x0, y0] : null;
      const onCenter = x0 === cx && y0 === cy;
      if (!pick && !onCenter) {
        const sx = Math.sign(cx - x0);
        const sy = Math.sign(cy - y0);
        const cand = [];
        for (let dy = -3;dy <= 3; dy++)
          for (let dx = -3;dx <= 3; dx++) {
            const d = Math.abs(dx) + Math.abs(dy);
            if (d === 0 || d > 3)
              continue;
            if (dx !== 0 && Math.sign(dx) !== sx || dy !== 0 && Math.sign(dy) !== sy)
              continue;
            if (usable(x0 + dx, y0 + dy))
              cand.push([d * 100 + Math.abs(dy) * 10 + Math.abs(dx), x0 + dx, y0 + dy]);
          }
        cand.sort((a, b) => a[0] - b[0]);
        if (cand.length)
          pick = [cand[0][1], cand[0][2]];
      }
      if (!pick)
        continue;
      const ci = g.idx(pick[0], pick[1]);
      if (!single.some((o) => o.cells[0] === ci))
        single.push({ center: pick, cells: [ci], set: new Set([ci]) });
    }
    if (!single.length) {
      const st = this.sites[0];
      const ci = st.cells[0];
      single.push({ center: [ci % g.w, Math.floor(ci / g.w)], cells: [ci], set: new Set([ci]) });
    }
    this.sites = single;
    this.clearBlocks(this.sites[0]);
    this.sites.push(...this.buildPool());
    this.moveIn = this.rollInterval();
    this.scores = m.teams ? [0, 0] : m.players.map(() => 0);
    this.respawnIn = m.players.map(() => 0);
  }
  rollInterval() {
    return HILL_RULES.moveMin + (HILL_RULES.moveMax - HILL_RULES.moveMin) * this.m.rng.next();
  }
  buildPool() {
    const m = this.m;
    const g = m.grid;
    const plan = m.config.map.layout;
    const starts = m.players.map((p) => [Math.floor(p.x), Math.floor(p.y), m.teamOf(p.id)]);
    const fromTeam = (team) => this.walkCost(starts.filter((s) => m.teams === null || s[2] === team).map((s) => g.idx(s[0], s[1])));
    const dA = m.teams ? fromTeam(0) : null;
    const dB = m.teams ? fromTeam(1) : null;
    const first = this.sites[0]?.cells[0];
    const out = [];
    for (let y = 1;y < g.h - 1; y++)
      for (let x = 1;x < g.w - 1; x++) {
        const i = g.idx(x, y);
        if (i === first)
          continue;
        if (plan[y]?.[x] === "#" || g.tile(x, y) === TILE.WALL || g.isHazard(x, y) || g.terrainAt(x, y) === TERRAIN.VENT)
          continue;
        if (starts.some((s) => Math.abs(s[0] - x) + Math.abs(s[1] - y) < HILL_RULES.spawnGap))
          continue;
        if (dA && dB) {
          if (!isFinite(dA[i]) || !isFinite(dB[i]) || Math.abs(dA[i] - dB[i]) > HILL_RULES.fairGap)
            continue;
        }
        out.push({ center: [x, y], cells: [i], set: new Set([i]), lean: dA && dB ? dA[i] - dB[i] : 0 });
      }
    return out;
  }
  walkCost(from) {
    const g = this.m.grid;
    const dist = new Float32Array(g.w * g.h).fill(Infinity);
    const buckets = [[]];
    for (const i of from) {
      dist[i] = 0;
      buckets[0].push(i);
    }
    for (let d = 0;d < buckets.length; d++) {
      for (const c of buckets[d] ?? []) {
        if (dist[c] !== d)
          continue;
        const x = c % g.w;
        const y = (c - x) / g.w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const t = g.tile(x + dx, y + dy);
          if (t === TILE.WALL || g.isHazard(x + dx, y + dy))
            continue;
          const n = g.idx(x + dx, y + dy);
          const nd = d + (t === TILE.BLOCK ? 3 : 1);
          if (nd >= dist[n])
            continue;
          dist[n] = nd;
          (buckets[nd] ??= []).push(n);
        }
      }
    }
    return dist;
  }
  pickNext() {
    const m = this.m;
    const g = m.grid;
    const [cx, cy] = this.center;
    const occupied = new Set(m.players.filter((p) => p.alive).map((p) => g.idx(Math.floor(p.x), Math.floor(p.y))));
    const free = (k, strict) => {
      if (k === this.site)
        return false;
      const i = this.sites[k].cells[0];
      const [x, y] = this.sites[k].center;
      if (g.tiles[i] !== TILE.FLOOR || g.bombAt[i] >= 0 || g.fire[i] > 0 || g.bonusAt[i] >= 0 || m.gasAt(i) || occupied.has(i))
        return false;
      if (strict && (this.recent.includes(k) || Math.abs(x - cx) + Math.abs(y - cy) < HILL_RULES.minJump))
        return false;
      return true;
    };
    let cands = this.sites.map((_, k) => k).filter((k) => free(k, true));
    if (!cands.length)
      cands = this.sites.map((_, k) => k).filter((k) => free(k, false));
    if (!cands.length)
      return -1;
    if (m.teams) {
      const balanced = cands.filter((k) => Math.abs(this.lean + (this.sites[k].lean ?? 0)) <= HILL_RULES.fairGap);
      if (balanced.length)
        cands = balanced;
      const alive = (team) => m.players.filter((p) => p.alive && m.teamOf(p.id) === team).map((p) => g.idx(Math.floor(p.x), Math.floor(p.y)));
      const a = alive(0);
      const b = alive(1);
      if (a.length && b.length) {
        const dA = this.walkCost(a);
        const dB = this.walkCost(b);
        const gap = (k) => Math.abs(dA[this.sites[k].cells[0]] - dB[this.sites[k].cells[0]]);
        const best = Math.min(...cands.map(gap));
        const fair = cands.filter((k) => gap(k) <= Math.max(best, HILL_RULES.liveFairGap));
        if (fair.length)
          cands = fair;
      }
    }
    return cands[Math.floor(m.rng.next() * cands.length)];
  }
  slot(id) {
    return this.m.teams ? this.m.teams[id] : id;
  }
  teamPoints(team) {
    return Math.floor((this.scores[team] ?? 0) + 0.000001);
  }
  static drawnSites(m) {
    const layout = m.config.map.layout;
    const g = m.grid;
    const seen = new Set;
    const out = [];
    for (let y = 0;y < g.h; y++)
      for (let x = 0;x < g.w; x++) {
        const i0 = g.idx(x, y);
        if (layout[y]?.[x] !== "z" || seen.has(i0))
          continue;
        const cells = [];
        const q = [[x, y]];
        seen.add(i0);
        while (q.length) {
          const [qx, qy] = q.pop();
          cells.push(g.idx(qx, qy));
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = qx + dx;
            const ny = qy + dy;
            const n = g.idx(nx, ny);
            if (layout[ny]?.[nx] === "z" && !seen.has(n)) {
              seen.add(n);
              q.push([nx, ny]);
            }
          }
        }
        const mx = cells.reduce((a, i) => a + i % g.w, 0) / cells.length;
        const my = cells.reduce((a, i) => a + Math.floor(i / g.w), 0) / cells.length;
        let best = cells[0];
        for (const i of cells)
          if (Math.hypot(i % g.w - mx, Math.floor(i / g.w) - my) < Math.hypot(best % g.w - mx, Math.floor(best / g.w) - my))
            best = i;
        cells.sort((a, b) => a - b);
        out.push({ center: [best % g.w, Math.floor(best / g.w)], cells, set: new Set(cells) });
      }
    return out;
  }
  static cellsAround(m, cx, cy) {
    const g = m.grid;
    const usable = (x, y) => x > 0 && y > 0 && x < g.w - 1 && y < g.h - 1 && g.tile(x, y) !== TILE.WALL && !g.isHazard(x, y);
    let cells = [];
    for (let y = cy - 1;y <= cy + 1; y++)
      for (let x = cx - 1;x <= cx + 1; x++)
        if (usable(x, y))
          cells.push(g.idx(x, y));
    if (cells.length < 3) {
      for (let d = 1;d < 4; d++) {
        const ring = [];
        for (let y = 1;y < g.h - 1; y++)
          for (let x = 1;x < g.w - 1; x++)
            if (Math.abs(x - cx) + Math.abs(y - cy) === d && usable(x, y))
              ring.push(g.idx(x, y));
        if (ring.length >= 2) {
          cells = ring;
          break;
        }
      }
    }
    return cells;
  }
  clearBlocks(site) {
    const g = this.m.grid;
    const around = [];
    for (const i of site.cells) {
      around.push(i);
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (x + dx > 0 && y + dy > 0 && x + dx < g.w - 1 && y + dy < g.h - 1)
          around.push(g.idx(x + dx, y + dy));
    }
    for (const i of around)
      if (g.tiles[i] === TILE.BLOCK) {
        g.tiles[i] = TILE.FLOOR;
        g.hiddenBonus[i] = null;
      }
  }
  get cells() {
    return this.sites[this.site].cells;
  }
  get cellSet() {
    return this.sites[this.site].set;
  }
  get center() {
    return this.sites[this.site].center;
  }
  get nextCells() {
    return this.next >= 0 ? this.sites[this.next].cells : [];
  }
  get nextSet() {
    return this.next >= 0 ? this.sites[this.next].set : null;
  }
  isHill(x, y) {
    return this.cellSet.has(this.m.grid.idx(x, y));
  }
  points(id) {
    return Math.floor(this.scores[this.slot(id)] + 0.000001);
  }
  onDeath(p) {
    this.respawnIn[p.id] = HILL_RULES.respawnDelay;
  }
  update() {
    const m = this.m;
    if (m.phase !== "playing") {
      this.holder = -1;
      this.contested = false;
      return;
    }
    const on = m.players.filter((p) => p.alive && this.cellSet.has(m.grid.idx(Math.floor(p.x), Math.floor(p.y))));
    const sides = new Set(on.map((p) => this.slot(p.id)));
    this.contested = sides.size > 1;
    const prev = this.holder;
    const prevSlot = prev >= 0 ? this.slot(prev) : -1;
    this.holder = sides.size === 1 ? on.find((p) => p.id === prev)?.id ?? on[0].id : -1;
    if (this.holder >= 0) {
      const k = this.slot(this.holder);
      const before = this.points(this.holder);
      this.scores[k] = Math.min(HILL_RULES.target, this.scores[k] + DT);
      const after = this.points(this.holder);
      if (after !== before && after % 10 === 0)
        m.events.push({ t: "hillPoints", player: this.holder, points: after });
    }
    if (this.holder >= 0 && this.slot(this.holder) !== prevSlot)
      m.events.push({ t: "hillTaken", player: this.holder });
    if (this.sites.length > 1) {
      this.moveIn -= DT;
      if (this.next < 0 && this.moveIn <= HILL_RULES.moveWarn) {
        const k = this.pickNext();
        if (k < 0)
          this.moveIn = HILL_RULES.moveWarn + 1;
        else {
          this.next = k;
          m.events.push({ t: "hillWarn", x: this.sites[k].center[0], y: this.sites[k].center[1] });
        }
      }
      if (this.moveIn <= 0 && this.next >= 0) {
        const from = this.center;
        this.recent.push(this.site);
        this.lean += this.sites[this.next].lean ?? 0;
        if (this.recent.length > HILL_RULES.memory)
          this.recent.shift();
        this.site = this.next;
        this.next = -1;
        this.moveIn = this.rollInterval();
        for (let k = 0;k < this.scores.length; k++)
          this.scores[k] = Math.floor(this.scores[k] + 0.000001);
        this.holder = -1;
        this.contested = false;
        m.events.push({ t: "hillMoved", x: this.center[0], y: this.center[1], fromX: from[0], fromY: from[1] });
      }
    }
    const n = m.players.length;
    for (let k = 0;k < n; k++) {
      const p = m.players[(k + m.tick) % n];
      if (p.alive || this.respawnIn[p.id] <= 0)
        continue;
      this.respawnIn[p.id] -= DT;
      if (this.respawnIn[p.id] <= 0)
        this.respawn(p);
    }
  }
  get reached() {
    return this.scores.some((s) => s >= HILL_RULES.target - 0.000001);
  }
  leader() {
    const pts = (k) => Math.floor(this.scores[k] + 0.000001);
    const best = Math.max(...this.scores.map((_, k) => pts(k)));
    const top = this.scores.map((_, k) => k).filter((k) => pts(k) === best);
    if (top.length !== 1)
      return -1;
    return this.m.teams ? this.m.players.find((p) => this.slot(p.id) === top[0])?.id ?? -1 : top[0];
  }
  respawn(p) {
    const m = this.m;
    const g = m.grid;
    const others = m.players.filter((o) => m.isFoe(p, o));
    const team = m.teamOf(p.id);
    let best = null;
    let bestScore = -Infinity;
    for (let y = 1;y < g.h - 1; y++)
      for (let x = 1;x < g.w - 1; x++) {
        if (!m.isFreeCell(x, y, true) || g.fire[g.idx(x, y)] > 0 || m.gasAt(g.idx(x, y)))
          continue;
        if (this.inBlast(x, y))
          continue;
        const hill = Math.abs(x - this.center[0]) + Math.abs(y - this.center[1]);
        if (hill < HILL_RULES.respawnHillGap)
          continue;
        let exits = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
          if (!g.blocksMove(x + dx, y + dy))
            exits++;
        if (!exits)
          continue;
        const near = others.length ? Math.min(...others.map((o) => Math.abs(o.x - 0.5 - x) + Math.abs(o.y - 0.5 - y))) : 10;
        const home = team < 0 ? 0 : (team === 0 ? x < (g.w - 1) / 2 : x > (g.w - 1) / 2) ? 200 : 0;
        const score = home + Math.min(near, 8) * 10 + exits + m.rng.next();
        if (score > bestScore) {
          bestScore = score;
          best = [x, y];
        }
      }
    if (!best) {
      this.respawnIn[p.id] = 0.5;
      return;
    }
    p.x = best[0] + 0.5;
    p.y = best[1] + 0.5;
    p.alive = true;
    p.moving = false;
    p.slideX = 0;
    p.slideY = 0;
    p.faceX = 0;
    p.faceY = 1;
    p.speed = RULES.baseSpeed;
    p.speedLevel = 0;
    p.maxBombs = m.bombRules.startBombs;
    clearAbilities(p);
    p.range = m.bombRules.startRange;
    p.bombCooldown = 0;
    p.activeBombs = Math.min(p.activeBombs, p.maxBombs);
    p.shieldTime = HILL_RULES.respawnShield;
    p.killedBy = -1;
    this.respawnIn[p.id] = 0;
    m.events.push({ t: "respawn", player: p.id, x: best[0], y: best[1] });
  }
  inBlast(x, y) {
    for (const b of this.m.bombs.values()) {
      if (b.tx === x && Math.abs(b.ty - y) <= b.range)
        return true;
      if (b.ty === y && Math.abs(b.tx - x) <= b.range)
        return true;
    }
    return false;
  }
}

// src/core/training.ts
var TRAINING_CRATES = [
  [4, 1, "flame"],
  [1, 3, "bomb"],
  [5, 3, "speed"],
  [8, 1, "shield"],
  [3, 5, "throw"],
  [7, 3, null],
  [9, 3, "bomb"],
  [7, 5, null]
];
var TRAINING_SPAWNS = [
  [1, 1],
  [11, 5]
];
var RESPAWN = 1.5;
var CRATES_BACK = 4;

class TrainingState {
  m;
  respawnIn;
  refill = -1;
  constructor(m) {
    this.m = m;
    this.respawnIn = m.players.map(() => 0);
    this.placeCrates();
    m.players.forEach((p, i) => {
      const [x, y] = TRAINING_SPAWNS[i] ?? TRAINING_SPAWNS[0];
      p.x = x + 0.5;
      p.y = y + 0.5;
    });
  }
  placeCrates() {
    const g = this.m.grid;
    for (const [x, y, bonus] of TRAINING_CRATES) {
      const i = g.idx(x, y);
      if (g.tiles[i] !== TILE.FLOOR || g.bombAt[i] >= 0 || g.bonusAt[i] >= 0 || g.fire[i] > 0)
        continue;
      if (this.m.players.some((p) => p.alive && Math.floor(p.x) === x && Math.floor(p.y) === y))
        continue;
      g.tiles[i] = TILE.BLOCK;
      g.hiddenBonus[i] = bonus;
    }
  }
  onDeath(id) {
    this.respawnIn[id] = RESPAWN;
  }
  update(dt) {
    const m = this.m;
    for (const p of m.players) {
      if (p.alive)
        continue;
      if (this.respawnIn[p.id] <= 0)
        this.respawnIn[p.id] = RESPAWN;
      this.respawnIn[p.id] -= dt;
      if (this.respawnIn[p.id] > 0)
        continue;
      const [x, y] = TRAINING_SPAWNS[p.id] ?? TRAINING_SPAWNS[0];
      const i = m.grid.idx(x, y);
      if (m.grid.fire[i] > 0 || m.grid.bombAt[i] >= 0)
        continue;
      p.x = x + 0.5;
      p.y = y + 0.5;
      p.alive = true;
      p.moving = false;
      p.slideX = 0;
      p.slideY = 0;
      p.faceX = 0;
      p.faceY = 1;
      clearAbilities(p);
      p.bombCooldown = 0;
      p.shieldTime = 1.5;
      m.events.push({ t: "respawn", player: p.id, x: p.x, y: p.y });
    }
    const left = TRAINING_CRATES.some(([x, y]) => m.grid.tiles[m.grid.idx(x, y)] === TILE.BLOCK);
    if (left)
      this.refill = -1;
    else if (this.refill < 0)
      this.refill = CRATES_BACK;
    else if ((this.refill -= dt) <= 0) {
      this.refill = -1;
      this.placeCrates();
    }
  }
}

// src/core/modes.ts
var MODES = [
  {
    id: "classic",
    name: "Classique",
    emoji: "\uD83C\uDFAE",
    tagline: "Le dernier debout gagne.",
    available: true,
    specials: { firstAt: 12, interval: [10, 15], chance: 0.6, maxOnBoard: 1 }
  },
  {
    id: "chaos",
    name: "Chaos",
    emoji: "\uD83D\uDC80",
    tagline: "Pluie de bombes, tempêtes, explosions géantes…",
    available: true,
    specials: { firstAt: 8, interval: [10, 14], chance: 0.75, maxOnBoard: 2 },
    onStart(m) {
      m.chaos = new ChaosDirector(m);
    },
    onTick(m, dt) {
      m.chaos?.update(dt);
    }
  },
  {
    id: "koth",
    name: "Domination",
    tagline: "2 contre 2 : tenez la zone en équipe. Première équipe à 25 points !",
    available: true,
    emoji: "\uD83D\uDC51",
    suddenDeath: false,
    bombRules: { fuse: 2.5, warn: 0.8, startRange: 2, startBombs: 1, fireDuration: 0.4, cooldown: 0.5 },
    specials: {
      firstAt: 3,
      opening: 2,
      openingEvery: 2,
      interval: [10, 15],
      chance: 0.8,
      maxOnBoard: 2,
      maxPerMatch: { throw: 5, big: 5, elec: 5, freeze: 5, toxic: 5, chain: 5, remote: 5 }
    },
    onStart(m) {
      if (m.players.length >= 2)
        m.setTeams();
      m.hill = new HillState(m);
    },
    onTick(m) {
      m.hill?.update();
    }
  },
  {
    id: "training",
    name: "Entraînement",
    tagline: "Apprends à bouger, poser des bombes et ramasser des bonus, sans risque.",
    available: true,
    hidden: true,
    endless: true,
    emoji: "\uD83C\uDFAF",
    suddenDeath: false,
    specials: null,
    onStart(m) {
      m.training = new TrainingState(m);
    },
    onTick(m, dt) {
      m.training?.update(dt);
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
  spawnClear: 1,
  startRange: 1,
  available: true
};

// src/maps/castle.ts
var CASTLE = {
  id: "castle",
  name: "Château",
  subtitle: "Cour royale",
  theme: "castle",
  layout: [
    "#############",
    "#s..._S_...s#",
    "#.#z#._.#z#.#",
    "#.zzz...zzz.#",
    "#.#z##z##z#.#",
    "#S_..zzz.._S#",
    "#.#z##z##z#.#",
    "#.zzz...zzz.#",
    "#.#z#._.#z#.#",
    "#s..._S_...s#",
    "#############"
  ],
  blockDensity: 0.72,
  spawnClear: 1,
  startRange: 1,
  available: true,
  modes: [],
  fixedSpawns: true
};

// src/maps/factory.ts
var FACTORY = {
  id: "factory",
  name: "Usine",
  subtitle: "Zone de conflit",
  theme: "factory",
  layout: [
    "###############",
    "##____#_#____##",
    "##_#.__s__.#_##",
    "##.__.___.__.##",
    "#___#__#__#___#",
    "#__#_______#__#",
    "#S_____z_____S#",
    "#__#_______#__#",
    "#___#__#__#___#",
    "##.__.___.__.##",
    "##_#.__s__.#_##",
    "##____#_#____##",
    "###############"
  ],
  blockDensity: 1,
  spawnClear: 1,
  startRange: 2,
  available: true,
  modes: ["koth"],
  fixedSpawns: true,
  teamSpawns: { 1: [[1, 6]], 2: [[1, 5], [1, 7]], 3: [[1, 6], [1, 4], [1, 8]] }
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
  modes: [],
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
  spawnClear: 1,
  startRange: 1,
  available: true
};

// src/maps/labyrinth.ts
var LABYRINTH = {
  id: "labyrinth",
  name: "Labyrinthe",
  subtitle: "Temple aux torches",
  theme: "labyrinth",
  layout: [
    "#############",
    "#S_..#.#.._S#",
    "#_##.#.#.##_#",
    "#..#.....#..#",
    "#.##.~_~.##.#",
    "#...._#_....#",
    "#.##.~_~.##.#",
    "#..#.....#..#",
    "#_##.#.#.##_#",
    "#S_..#.#.._S#",
    "#############"
  ],
  blockDensity: 0.72,
  spawnClear: 1,
  startRange: 1,
  available: true
};

// src/maps/temple.ts
var TEMPLE = {
  id: "temple",
  name: "Temple du Roi",
  subtitle: "Ruines dorées",
  theme: "temple",
  layout: [
    "#############",
    "#S_..#z#.._S#",
    "#_.#.zzz.#._#",
    "#.#..#.#..#.#",
    "##z#.#z#.#z##",
    "#zzz.zzz.zzz#",
    "##z#.#z#.#z##",
    "#.#..#.#..#.#",
    "#_.#.zzz.#._#",
    "#S_..#z#.._S#",
    "#############"
  ],
  blockDensity: 0.8,
  spawnClear: 1,
  startRange: 1,
  available: true,
  modes: []
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
  spawnClear: 1,
  startRange: 1,
  available: true
};

// src/maps/index.ts
var MAPS = [FOREST, VOLCANO, ICE, BEACH, LABYRINTH, TEMPLE, CASTLE, FACTORY];
var DEFAULT_MODES = ["classic", "chaos"];
function mapAllows(map, modeId) {
  return (map.modes ?? DEFAULT_MODES).includes(modeId);
}
function mapsFor(modeId) {
  const list = MAPS.filter((m) => mapAllows(m, modeId));
  return list.length ? list : MAPS.filter((m) => !m.modes);
}
var RANDOM_MAP = "random";
function getMap(id) {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
function pickMap(id, rand = Math.random, modeId) {
  const pool = modeId ? mapsFor(modeId) : MAPS.filter((m) => !m.modes);
  if (id === RANDOM_MAP || !pool.some((m) => m.id === id))
    return pool[Math.floor(rand() * pool.length)];
  return getMap(id);
}

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
var REMOTE_THREAT = 0.6;
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
function computeDanger(m, extra, viewer) {
  const g = m.grid;
  const n = g.w * g.h;
  const start = new Float32Array(n).fill(Infinity);
  const end = new Float32Array(n).fill(-Infinity);
  const list = [];
  for (const b of m.bombs.values())
    list.push({ tx: b.tx, ty: b.ty, fuse: b.remote ? Math.min(b.fuse, REMOTE_THREAT) : b.fuse, range: b.range, toxic: b.toxic, chain: b.chainDepth !== undefined && b.chainDepth < CHAIN.maxDepth && !b.flight, owner: b.ownerId });
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
  const chainHits = list.map((b) => {
    if (!b.chain)
      return [];
    const out = [];
    for (const [c, d] of m.chainReach(b.tx, b.ty))
      if (d > 0 && cellToBomb.has(c))
        out.push(c);
    return out;
  });
  const isChain = list.map((b) => !!b.chain);
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
      for (const c of chainHits[a]) {
        const j = cellToBomb.get(c);
        const tj = t[a] + CHAIN.step;
        if (t[j] > tj) {
          t[j] = tj;
          changed = true;
        }
        if (!isChain[j]) {
          isChain[j] = true;
          const out = [];
          for (const [cc, d] of m.chainReach(list[j].tx, list[j].ty))
            if (d > 0 && cellToBomb.has(cc))
              out.push(cc);
          chainHits[j] = out;
          changed = true;
        }
      }
    }
  }
  const harmless = (owner) => viewer !== undefined && owner !== undefined && m.sameTeam(viewer, owner);
  for (let a = 0;a < list.length; a++) {
    if (harmless(list[a].owner))
      continue;
    for (const c of blasts[a]) {
      if (t[a] < start[c])
        start[c] = t[a];
      const e = t[a] + (list[a].toxic ? Math.max(m.bombRules.fireDuration, TOXIC.duration) : m.bombRules.fireDuration);
      if (e > end[c])
        end[c] = e;
    }
  }
  for (let i = 0;i < n; i++) {
    if (g.fire[i] > 0 && !harmless(g.fireOwner[i])) {
      start[i] = 0;
      end[i] = Math.max(end[i], g.fire[i]);
    }
  }
  for (const z of m.toxicZones) {
    if (harmless(z.owner))
      continue;
    for (const i of z.cells) {
      start[i] = 0;
      end[i] = Math.max(end[i], z.timeLeft);
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
      end[i] = Math.max(end[i], left + dur + m.bombRules.fireDuration);
    }
  }
  for (const run of m.chaos?.active ?? []) {
    for (const i of run.zone) {
      start[i] = 0;
      end[i] = Math.max(end[i], run.timer + m.bombRules.fireDuration);
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
      end[i] = Math.max(end[i], left + m.bombRules.fireDuration);
    }
  }
  return { start, end };
}

// src/ai/bot.ts
var AI_PROFILES = {
  easy: { think: 0.5, reactDelay: 0.15, reflex: 0, margin: 0.12, bonusRadius: 4, aggression: 0.3, hesitate: 0.3, misaim: 0.2, mistake: 0.05, pause: 0.03, wander: 0.25, trapRadius: 0, shieldSense: 0.1, escapeRoom: 1, distract: 0.15, lead: 0 },
  normal: { think: 0.28, reactDelay: 0.12, reflex: 0.6, margin: 0.18, bonusRadius: 6, aggression: 0.45, hesitate: 0.3, misaim: 0.1, mistake: 0.015, pause: 0.02, wander: 0.05, trapRadius: 1, shieldSense: 0.22, escapeRoom: 2, distract: 0.035, lead: 0.3 },
  hard: { think: 0.1, reactDelay: 0, reflex: 1, margin: 0.25, bonusRadius: 11, aggression: 0.9, hesitate: 0, misaim: 0, mistake: 0, pause: 0, wander: 0, trapRadius: 2, shieldSense: 0.35, escapeRoom: 3, distract: 0, lead: 1 },
  expert: { think: 0.06, reactDelay: 0, reflex: 1, margin: 0.28, bonusRadius: 14, aggression: 1, hesitate: 0, misaim: 0, mistake: 0, pause: 0, wander: 0, trapRadius: 3, shieldSense: 0.45, escapeRoom: 3, distract: 0, lead: 1.3 }
};
var FIELDS = new WeakMap;

class BotBrain {
  playerId;
  prof;
  rng;
  thinkTimer;
  path = [];
  wantBomb = false;
  wantShield = false;
  lastDecision = "";
  constructor(playerId, difficulty, seed, tune) {
    this.playerId = playerId;
    this.prof = tune ? { ...AI_PROFILES[difficulty], ...tune } : AI_PROFILES[difficulty];
    this.rng = new Rng(seed * 7919 + playerId * 104729);
    this.thinkTimer = this.rng.next() * this.prof.think;
  }
  speedNow = 0;
  update(m, dt) {
    const p = m.players[this.playerId];
    const cmd = { mx: 0, my: 0, bomb: false, ability: false };
    if (!p.alive || m.phase !== "playing" && m.phase !== "ending")
      return cmd;
    this.speedNow = m.effectiveSpeed(p);
    this.thinkTimer -= dt;
    let mustThink = this.thinkTimer <= 0;
    if (!mustThink && this.prof.reflex > 0 && this.path.length) {
      const next = this.path[0];
      if (m.grid.fire[next] > 0 || m.grid.blocksMove(next % m.grid.w, Math.floor(next / m.grid.w))) {
        if (this.prof.reflex >= 1 || this.rng.chance(this.prof.reflex))
          mustThink = true;
      }
    }
    if (mustThink) {
      this.thinkTimer = this.prof.think * (0.8 + this.rng.next() * 0.4);
      this.think(m, p);
    }
    if (this.wantShield) {
      cmd.ability = true;
      this.wantShield = false;
    }
    if (this.shouldDetonate(m, p))
      cmd.remote = true;
    if (this.wantThrow) {
      const [dx, dy] = this.wantThrow;
      this.wantThrow = null;
      if (p.throwCharges > 0) {
        cmd.mx = dx;
        cmd.my = dy;
        cmd.throw = true;
        return cmd;
      }
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
  wantThrow = null;
  shouldDetonate(m, p) {
    const mine = m.remoteBombsOf(p);
    if (!mine.length)
      return false;
    const g = m.grid;
    const me = g.idx(Math.floor(p.x), Math.floor(p.y));
    let foeIn = false;
    let old = false;
    for (const b of mine) {
      const cells = new Set(m.blastCells(b.tx, b.ty, b.range));
      if (cells.has(me))
        return false;
      for (const o of m.players)
        if (m.isFoe(p, o) && o.shieldTime <= 0 && cells.has(g.idx(Math.floor(o.x), Math.floor(o.y))))
          foeIn = true;
      if (b.fuseTotal - b.fuse > 2.5 + this.prof.margin * 2)
        old = true;
    }
    return foeIn || old;
  }
  planThrow(m, p) {
    if (p.throwCharges <= 0 || p.activeBombs >= p.maxBombs || p.bombCooldown > 0)
      return false;
    if (!this.rng.chance(0.25 + this.prof.aggression * 0.5))
      return false;
    const px = Math.floor(p.x);
    const py = Math.floor(p.y);
    for (const [dx, dy] of DIRS) {
      const to = m.throwTarget(px, py, dx, dy);
      if (!to)
        continue;
      const dist = Math.abs(to[0] - px) + Math.abs(to[1] - py);
      if (dist <= m.nextBombRange(p))
        continue;
      const cells = new Set(m.blastCells(to[0], to[1], m.nextBombRange(p)));
      if (m.players.some((o) => m.isFoe(p, o) && o.shieldTime <= 0 && cells.has(m.grid.idx(Math.floor(o.x), Math.floor(o.y))))) {
        this.wantThrow = [dx, dy];
        this.lastDecision = "throw";
        return true;
      }
    }
    return false;
  }
  think(m, p) {
    const g = m.grid;
    const myIdx = g.idx(Math.floor(p.x), Math.floor(p.y));
    const danger = computeDanger(m, undefined, p.id);
    const sloppy = this.rng.chance(this.prof.mistake);
    if (danger.start[myIdx] === Infinity)
      this.dangerSince = -1;
    else if (this.prof.reactDelay > 0) {
      if (this.dangerSince < 0)
        this.dangerSince = m.time;
      if (m.time - this.dangerSince < this.prof.reactDelay) {
        this.lastDecision = "unaware";
        return;
      }
    }
    if (this.prof.pause > 0 && danger.start[myIdx] === Infinity && this.rng.chance(this.prof.pause)) {
      this.path = [];
      this.lastDecision = "pause";
      return;
    }
    if (danger.start[myIdx] !== Infinity && m.hill && this.holdUnderFire(m, p, danger, myIdx))
      return;
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
    if (this.planThrow(m, p))
      return;
    if (m.hill && this.playDomination(m, p, danger, sloppy))
      return;
    const bonusPath = this.findTarget(m, p, danger, this.prof.bonusRadius, (i) => g.bonusAt[i] >= 0);
    if (bonusPath && bonusPath.length > 0) {
      this.path = bonusPath;
      this.lastDecision = "bonus";
      return;
    }
    if (p.activeBombs < p.maxBombs && g.bombAt[myIdx] < 0) {
      const value = this.bombValue(m, p);
      const roll = this.rng.next();
      const enemy = this.readyToAttack(m, value.enemy);
      const misaim = !value.enemy && this.prof.misaim > 0 && this.enemyNear(m, p, 2) && this.rng.chance(this.prof.misaim);
      if ((enemy || misaim) && roll < 0.4 + this.prof.aggression * 0.6) {
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
    if (this.prof.wander > 0 && this.rng.chance(this.prof.wander)) {
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
  role = "";
  goalKey = "";
  distractedUntil = -1;
  progress = { key: "", best: 1e9, since: 0 };
  playDomination(m, p, danger, sloppy) {
    const h = m.hill;
    const g = m.grid;
    const px = Math.floor(p.x);
    const py = Math.floor(p.y);
    const here = g.idx(px, py);
    const cellOf = (o) => g.idx(Math.floor(o.x), Math.floor(o.y));
    if (m.time < this.distractedUntil)
      return false;
    if (this.prof.distract > 0 && this.rng.chance(this.prof.distract)) {
      this.distractedUntil = m.time + 1 + this.rng.next() * 1.5;
      this.goalKey = "";
      return false;
    }
    const speed = this.speedNow > 0 ? this.speedNow : p.speed;
    let target = h.cellSet;
    let next = false;
    const nextSet = h.nextSet;
    if (nextSet) {
      const etaNext = this.zoneField(m, nextSet)[here] / speed;
      const onCur = target.has(here);
      const holding = onCur && !h.contested && h.holder >= 0;
      const leaveAt = holding ? etaNext - 0.5 : etaNext + this.prof.lead;
      const curEta = this.zoneField(m, target)[here] / speed;
      if (h.moveIn <= Math.max(0.15, leaveAt) || !onCur && curEta >= h.moveIn - 0.3) {
        target = nextSet;
        next = true;
      }
    }
    const field = this.zoneField(m, target);
    const myD = field[here];
    const onZone = target.has(here);
    const team = m.teamOf(p.id);
    const mates = m.players.filter((o) => o.alive && m.sameTeam(p.id, o.id));
    const foes = m.players.filter((o) => m.isFoe(p, o));
    const mySlot = h.slot(p.id);
    const myPts = h.scores[mySlot] ?? 0;
    const foePts = Math.max(0, ...h.scores.filter((_, k) => k !== mySlot));
    const foesOnZone = foes.filter((o) => target.has(cellOf(o)));
    const matesOnZone = mates.filter((o) => target.has(cellOf(o)));
    const enemyHolds = !next && h.holder >= 0 && h.slot(h.holder) !== mySlot;
    const late = m.timeLeft < 35 && myPts <= foePts;
    const danger2win = foePts >= HILL_RULES.target - 6;
    let role;
    if (team < 0 || !mates.length)
      role = "rush";
    else if (enemyHolds || foesOnZone.length && !matesOnZone.length || late || danger2win)
      role = "rush";
    else {
      const mate = mates.reduce((a, b) => field[cellOf(a)] <= field[cellOf(b)] ? a : b);
      const mateD = field[cellOf(mate)];
      const meFirst = matesOnZone.length ? false : myD < mateD || myD === mateD && p.id < mate.id;
      role = onZone && !matesOnZone.length ? "cap" : meFirst ? "cap" : "guard";
      if (onZone && matesOnZone.length && p.id < matesOnZone[0].id)
        role = "cap";
    }
    if (role !== this.role)
      this.goalKey = "";
    this.role = role;
    const range = m.nextBombRange(p);
    const canBomb = p.activeBombs < p.maxBombs && g.bombAt[here] < 0 && p.bombCooldown <= 0;
    const bombVal = canBomb ? this.bombValue(m, p) : { blocks: 0, enemy: false };
    const hurtsHold = (() => {
      if (foesOnZone.length)
        return false;
      const cells = [];
      const bombCells = new Set;
      for (const b of m.bombs.values())
        bombCells.add(g.idx(b.tx, b.ty));
      blastCells(m, px, py, range, bombCells, cells);
      if (!cells.some((c) => target.has(c)))
        return false;
      return matesOnZone.length > 0 || myPts >= foePts || !this.rng.chance(0.25);
    })();
    const attack = (chance) => canBomb && this.readyToAttack(m, bombVal.enemy) && !hurtsHold && this.rng.chance(chance) && this.placeIfEscapable(m, p, sloppy);
    if (onZone && role !== "guard") {
      if (h.contested || foesOnZone.length) {
        if (attack(0.45 + this.prof.aggression * 0.5))
          return this.mark("zone-fight");
      } else if (!mates.length && foes.some((o) => field[cellOf(o)] <= 2) && attack(0.2 + this.prof.aggression * 0.4)) {
        return this.mark("zone-defend");
      }
      this.path = [];
      this.goalKey = "hold";
      return this.mark("hold");
    }
    if (role === "guard") {
      const threat = foes.filter((o) => field[cellOf(o)] <= 5).sort((a, b) => field[cellOf(a)] - field[cellOf(b)]);
      if (threat.length && attack(0.5 + this.prof.aggression * 0.5))
        return this.mark("guard-bomb");
      if (onZone && matesOnZone.some((o) => o.id !== p.id)) {
        this.goalKey = "";
      }
      if (threat.length && canBomb) {
        const foe = threat[0];
        const aim = this.findTarget(m, p, danger, 6, (i) => {
          if (g.bombAt[i] >= 0 || target.has(i))
            return false;
          const x = i % g.w;
          const y = Math.floor(i / g.w);
          return this.inLineWith(m, foe, x, y, range) && field[i] <= 4;
        });
        if (aim && aim.length)
          return this.go(aim, "guard-aim:" + foe.id, "guard-intercept");
      }
      if (this.grabBonus(m, p, danger, 3))
        return true;
      const mateCells = new Set(mates.map(cellOf));
      const post = this.bestPost(m, p, danger, target, field, foes, mateCells);
      if (post) {
        if (post.length === 0) {
          this.path = [];
          return this.mark("guard-post");
        }
        return this.go(post, "post:" + post[post.length - 1], "guard-post");
      }
    }
    if (role === "cap" && !next && !h.contested && this.grabBonus(m, p, danger, 2))
      return true;
    if (bombVal.enemy && attack(role === "rush" ? 0.35 + this.prof.aggression * 0.4 : 0.2 + this.prof.aggression * 0.3))
      return this.mark("rush-bomb");
    const key = (next ? "next:" : "cur:") + [...target][0];
    this.trackProgress(m, key, myD);
    const toZone = this.bfs(m, p, danger, this.prof.margin, 40, (i, node) => target.has(i) && g.bombAt[i] < 0 && (danger.start[i] === Infinity || danger.start[i] - this.eta(p, node.dist) > 1.4 + this.prof.think * 2));
    if (toZone && toZone.length && !this.stalled(m))
      return this.go(toZone, key, role + (next ? "-next" : ""));
    const wait = this.findTarget(m, p, danger, 12, (i) => field[i] <= 2 && !target.has(i) && g.bombAt[i] < 0 && this.exits(m, i) >= 2);
    if (wait && !this.stalled(m) && field[here] > 2)
      return this.go(wait, key + ":wait", "zone-wait");
    if (field[here] <= 2 && !this.stalled(m)) {
      this.path = [];
      return this.mark("zone-wait");
    }
    const mine = field[here];
    if (canBomb && bombVal.blocks > 0) {
      const cells = [];
      blastCells(m, px, py, range, new Set, cells);
      if (cells.some((c) => g.tiles[c] === TILE.BLOCK && field[c] < mine) && this.placeIfEscapable(m, p, sloppy))
        return this.mark("zone-break");
    }
    const brk = this.findTarget(m, p, danger, 30, (i) => {
      if (g.bombAt[i] >= 0)
        return false;
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      for (const [dx, dy] of DIRS) {
        const n = g.idx(x + dx, y + dy);
        if (g.tile(x + dx, y + dy) === TILE.BLOCK && field[n] < mine)
          return true;
      }
      return false;
    });
    if (brk && brk.length)
      return this.go(brk, key + ":break", "zone-break");
    this.progress.since = m.time;
    return false;
  }
  holdUnderFire(m, p, danger, myIdx) {
    if (!m.hill.cellSet.has(myIdx) || this.prof.distract > 0.02)
      return false;
    for (const b of m.bombs.values())
      if (b.ownerId === p.id && m.blastCells(b.tx, b.ty, b.range).includes(myIdx))
        return false;
    const escape = this.findSafe(m, p, danger, this.prof.margin);
    if (!escape)
      return false;
    const need = this.eta(p, escape.length) + this.prof.margin;
    const buffer = this.prof.think * 2 + 0.4;
    if (danger.start[myIdx] - need <= buffer)
      return false;
    this.path = [];
    this.goalKey = "hold";
    this.lastDecision = "hold-risk";
    return true;
  }
  exits(m, i) {
    const g = m.grid;
    const x = i % g.w;
    const y = Math.floor(i / g.w);
    let n = 0;
    for (const [dx, dy] of DIRS)
      if (!g.blocksMove(x + dx, y + dy) && g.bombAt[g.idx(x + dx, y + dy)] < 0)
        n++;
    return n;
  }
  readyToAttack(m, enemyInBlast) {
    if (!enemyInBlast) {
      this.enemySince = -1;
      return false;
    }
    if (this.prof.hesitate <= 0)
      return true;
    if (this.enemySince < 0)
      this.enemySince = m.time;
    return m.time - this.enemySince >= this.prof.hesitate;
  }
  enemySince = -1;
  dangerSince = -1;
  mark(d) {
    this.lastDecision = d;
    return true;
  }
  go(path, key, decision) {
    const keep = this.goalKey === key && this.path.length > 0 && this.path[this.path.length - 1] === path[path.length - 1];
    if (!keep)
      this.path = path;
    this.goalKey = key;
    this.lastDecision = decision;
    return true;
  }
  grabBonus(m, p, danger, radius) {
    const bonusPath = this.findTarget(m, p, danger, radius, (i) => m.grid.bonusAt[i] >= 0);
    if (!bonusPath || !bonusPath.length)
      return false;
    return this.go(bonusPath, "bonus:" + bonusPath[bonusPath.length - 1], "bonus");
  }
  trackProgress(m, key, d) {
    const pr = this.progress;
    if (pr.key !== key || d < pr.best) {
      pr.key = key;
      pr.best = d;
      pr.since = m.time;
    }
  }
  stalled(m) {
    return m.time - this.progress.since > 2.5;
  }
  inLineWith(m, o, x, y, r) {
    const g = m.grid;
    const ox = Math.floor(o.x);
    const oy = Math.floor(o.y);
    if (ox !== x && oy !== y)
      return false;
    const d = Math.abs(ox - x) + Math.abs(oy - y);
    if (d === 0 || d > r)
      return false;
    const sx = Math.sign(ox - x);
    const sy = Math.sign(oy - y);
    for (let k = 1;k < d; k++)
      if (g.isSolid(x + sx * k, y + sy * k))
        return false;
    return true;
  }
  bestPost(m, p, danger, target, field, foes, mateCells) {
    const g = m.grid;
    const here = g.idx(Math.floor(p.x), Math.floor(p.y));
    const foeCells = foes.map((o) => [Math.floor(o.x), Math.floor(o.y)]);
    let best = -1;
    let bestScore = Infinity;
    const score = (i) => {
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      let near = 20;
      for (const [fx, fy] of foeCells)
        near = Math.min(near, Math.abs(fx - x) + Math.abs(fy - y));
      return field[i] * 1.5 + near + (i === here ? -0.8 : 0);
    };
    this.bfs(m, p, danger, this.prof.margin, 10, (i) => {
      if (target.has(i) || mateCells.has(i) || g.bombAt[i] >= 0 || danger.start[i] !== Infinity)
        return false;
      if (field[i] < 1 || field[i] > 3)
        return false;
      const s = score(i);
      if (s < bestScore) {
        bestScore = s;
        best = i;
      }
      return false;
    });
    if (best < 0)
      return null;
    if (best === here)
      return [];
    return this.findTarget(m, p, danger, 12, (i) => i === best);
  }
  zoneField(m, target) {
    let per = FIELDS.get(m);
    if (!per || per.tick !== m.tick) {
      per = { tick: m.tick, map: new Map };
      FIELDS.set(m, per);
    }
    const hit = per.map.get(target);
    if (hit)
      return hit;
    const g = m.grid;
    const dist = new Int16Array(g.w * g.h).fill(32000);
    const buckets = [[]];
    for (const c of target) {
      dist[c] = 0;
      buckets[0].push(c);
    }
    for (let d = 0;d < buckets.length; d++) {
      const bucket = buckets[d];
      if (!bucket)
        continue;
      for (let k = 0;k < bucket.length; k++) {
        const c = bucket[k];
        if (dist[c] !== d)
          continue;
        const x = c % g.w;
        const y = Math.floor(c / g.w);
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          const t = g.tile(nx, ny);
          if (t === TILE.WALL || g.isHazard(nx, ny))
            continue;
          if (t !== TILE.FLOOR && t !== TILE.BLOCK)
            continue;
          const n = g.idx(nx, ny);
          const nd = d + (t === TILE.BLOCK ? 4 : 1);
          if (nd < dist[n]) {
            dist[n] = nd;
            (buckets[nd] ??= []).push(n);
          }
        }
      }
    }
    per.map.set(target, dist);
    return dist;
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
    blastCells(m, Math.floor(p.x), Math.floor(p.y), m.nextBombRange(p), bombCells, cells);
    let blocks = 0;
    let enemy = false;
    for (const c of cells) {
      if (g.tiles[c] === TILE.BLOCK)
        blocks++;
      for (const o of m.players) {
        if (m.isFoe(p, o) && g.idx(Math.floor(o.x), Math.floor(o.y)) === c && o.shieldTime <= 0)
          enemy = true;
      }
    }
    return { blocks, enemy };
  }
  enemyNear(m, p, r) {
    return m.players.some((o) => m.isFoe(p, o) && Math.abs(o.x - p.x) + Math.abs(o.y - p.y) <= r + 0.5);
  }
  enemyInLine(m, p, x, y, r) {
    const g = m.grid;
    for (const o of m.players) {
      if (!m.isFoe(p, o))
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
      const danger = computeDanger(m, { tx, ty, fuse: m.bombRules.fuse * m.fuseMul, range: m.nextBombRange(p), toxic: p.toxicCharges > 0, chain: p.chainCharges > 0, owner: p.id }, p.id);
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
    return (steps + 0.3) / (p.id === this.playerId && this.speedNow > 0 ? this.speedNow : p.speed);
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
    const enemyCells = new Set(m.players.filter((o) => m.isFoe(p, o)).map((o) => g.idx(Math.floor(o.x), Math.floor(o.y))));
    const path = this.bfs(m, p, danger, this.prof.margin, 40, (idx) => enemyCells.has(idx));
    if (!path || path.length <= 1)
      return null;
    const trimmed = path.slice(0, Math.max(1, path.length - 2));
    return danger.start[trimmed[trimmed.length - 1]] === Infinity ? trimmed : null;
  }
}

// src/core/bonuses.ts
var SPECIAL_TEXT = {
  throw: "Ta prochaine bombe peut être lancée à 3 cases (bouton LANCER).",
  big: "Ta prochaine bombe explose beaucoup plus loin.",
  elec: "Ta prochaine bombe paralyse les adversaires proches (1 s).",
  freeze: "Ta prochaine bombe ralentit les adversaires proches (−40 %, 2,5 s).",
  toxic: "Ta prochaine bombe laisse un nuage toxique pendant 3 s.",
  chain: "Ta prochaine bombe fait sauter en cascade les bombes proches.",
  remote: "Ta prochaine bombe saute quand tu veux (bouton BOUM)."
};
var SPECIAL_BONUSES = Object.fromEntries(SPECIALS.map((sp) => [
  sp.id,
  {
    id: sp.id,
    label: sp.label,
    description: SPECIAL_TEXT[sp.id] ?? sp.label,
    special: true,
    apply(p) {
      if (refuseReason(p, sp.id))
        return false;
      p[sp.field] = 1;
      return true;
    }
  }
]));
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
  },
  ...SPECIAL_BONUSES
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
var WALKABLE = [".", "_", "S", "s", "I", "i", "V", "z"];
var SPAWN_RULES = {
  minDistance: [5, 4, 3, 2],
  noDeadEnd: true,
  ventMargin: 2
};
var ALWAYS_FREE = ["_", "i", "z"];
var SPAWNABLE = [".", "_", "S", "s"];
function generateArena(map, playerCount, seed) {
  const rng = new Rng(seed ^ 24301);
  const height = map.layout.length;
  const width = map.layout[0].length;
  const tiles = new Uint8Array(width * height);
  const terrain = new Uint8Array(width * height);
  const hiddenBonus = new Array(width * height).fill(null);
  const at = (x, y) => map.layout[y][x];
  const count = Math.max(playerCount, 1);
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
  const zoneAround = ([sx, sy]) => {
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
    return zone;
  };
  const plan = pickSpawns(map, count, seed, { open, zoneAround, hasHideSpot });
  const spawns = plan.spawns;
  if (spawns.length < count)
    throw new Error(`Map « ${map.id} » trop petite pour ${count} joueurs`);
  const protectedCells = new Set;
  for (const z of plan.zones)
    for (const c of z)
      protectedCells.add(c);
  const extraIsFloor = plan.fixed && plan.useExtra;
  const canon = (x, y) => Math.min(y, height - 1 - y) * width + Math.min(x, width - 1 - x);
  const decision = new Map;
  for (let y = 0;y < height; y++)
    for (let x = 0;x < width; x++) {
      const k = canon(x, y);
      if (decision.has(k))
        continue;
      const block = rng.chance(map.blockDensity);
      decision.set(k, { block, bonus: null });
    }
  for (let y = 0;y < height; y++)
    for (let x = 0;x < width; x++) {
      const i = y * width + x;
      const c = at(x, y);
      let t = TILE.FLOOR;
      terrain[i] = TERRAIN_OF[c] ?? TERRAIN.NONE;
      if (c === "#")
        t = TILE.WALL;
      else if ((c === "." || c === "I" || c === "s" && !extraIsFloor || c === "S" && !plan.fixed) && !protectedCells.has(i)) {
        const d = decision.get(canon(x, y));
        if (d.block) {
          t = TILE.BLOCK;
          hiddenBonus[i] = d.bonus;
        }
      }
      tiles[i] = t;
    }
  const blockable = (x, y) => {
    const c = at(x, y);
    return c === "." || c === "I" || c === "s" && !extraIsFloor || c === "S" && !plan.fixed;
  };
  for (const zone of plan.zones) {
    const area = reachFree(map.layout, zone);
    for (const c of area) {
      const x = c % width;
      const y = Math.floor(c / width);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const n = ny * width + nx;
        if (area.has(n) || protectedCells.has(n))
          continue;
        if (tiles[n] === TILE.FLOOR && blockable(nx, ny))
          tiles[n] = TILE.BLOCK;
      }
    }
  }
  return { width, height, tiles, terrain, hiddenBonus, spawns };
}
function reachFree(layout, zone) {
  const height = layout.length;
  const width = layout[0].length;
  const free = (x, y) => x > 0 && y > 0 && x < width - 1 && y < height - 1 && ALWAYS_FREE.includes(layout[y][x]);
  const out = new Set(zone);
  const queue = [...zone];
  while (queue.length) {
    const c = queue.pop();
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
var manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
function pickSpawns(map, count, seed, tools) {
  const rng = new Rng((seed ^ 1511506142) >>> 0);
  const layout = map.layout;
  const height = layout.length;
  const width = layout[0].length;
  const at = (x, y) => layout[y][x];
  const idx = (x, y) => y * width + x;
  const symmetric = width % 2 === 1 && height % 2 === 1 && isMirrorSymmetric(layout);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const vents = [];
  for (let y = 0;y < height; y++)
    for (let x = 0;x < width; x++)
      if (at(x, y) === "V")
        vents.push([x, y]);
  const nearVent = (x, y, d) => vents.some((v) => manhattan(v, [x, y]) <= d);
  const spawnable = (x, y) => x > 0 && y > 0 && x < width - 1 && y < height - 1 && SPAWNABLE.includes(at(x, y)) && !nearVent(x, y, SPAWN_RULES.ventMargin);
  const mirroredZone = ([x, y]) => {
    const fx = x > cx;
    const fy = y > cy;
    const base = tools.zoneAround([fx ? width - 1 - x : x, fy ? height - 1 - y : y]);
    const out = new Set;
    for (const c of base) {
      const bx = c % width;
      const by = Math.floor(c / width);
      out.add(idx(fx ? width - 1 - bx : bx, fy ? height - 1 - by : by));
    }
    return out;
  };
  const zoneCache = new Map;
  const zoneOf = (s) => {
    const k = idx(s[0], s[1]);
    if (!zoneCache.has(k)) {
      const z = symmetric ? mirroredZone(s) : tools.zoneAround(s);
      const ok = tools.hasHideSpot(z, map.startRange) && [...z].every((c) => !nearVent(c % width, Math.floor(c / width), 1));
      zoneCache.set(k, ok ? z : null);
    }
    return zoneCache.get(k);
  };
  if (map.fixedSpawns)
    return fixedSpawns(map, count, rng, zoneOf);
  const reach = (zone) => reachFree(layout, zone);
  const separated = (zonesIn) => {
    const zones = zonesIn.map(reach);
    const all = new Map;
    for (let zi = 0;zi < zones.length; zi++)
      for (const c of zones[zi]) {
        if (all.has(c))
          return false;
        all.set(c, zi);
      }
    for (const [c, zi] of all) {
      const x = c % width;
      const y = Math.floor(c / width);
      for (const n of [idx(x + 1, y), idx(x - 1, y), idx(x, y + 1), idx(x, y - 1)]) {
        const o = all.get(n);
        if (o !== undefined && o !== zi)
          return false;
      }
    }
    return true;
  };
  const roomy = (s, zone) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => zone.has(idx(s[0] + dx, s[1] + dy))).length >= 2;
  const groupOk = (cells, minD) => {
    for (let i = 0;i < cells.length; i++) {
      if (!spawnable(cells[i][0], cells[i][1]))
        return null;
      for (let j = i + 1;j < cells.length; j++)
        if (manhattan(cells[i], cells[j]) < minD)
          return null;
    }
    const zones = [];
    for (const c of cells) {
      const z = zoneOf(c);
      if (!z || SPAWN_RULES.noDeadEnd && !roomy(c, z))
        return null;
      zones.push(z);
    }
    return separated(zones) ? zones : null;
  };
  if (symmetric) {
    const mirror4 = (x, y) => [
      [x, y],
      [width - 1 - x, height - 1 - y],
      [width - 1 - x, y],
      [x, height - 1 - y]
    ];
    for (const minD of SPAWN_RULES.minDistance) {
      const options = [];
      const corners = [];
      for (let y = 1;y < cy; y++)
        for (let x = 1;x < cx; x++)
          if (groupOk(mirror4(x, y), minD))
            corners.push(mirror4(x, y));
      if (count <= 4) {
        for (const c of corners)
          options.push({ cells: c, zones: groupOk(c, minD) });
      } else {
        const axisPairs = [];
        for (let y = 1;y < cy; y++)
          axisPairs.push([[cx, y], [cx, height - 1 - y]]);
        for (let x = 1;x < cx; x++)
          axisPairs.push([[x, cy], [width - 1 - x, cy]]);
        for (const c of corners)
          for (const a of axisPairs) {
            const cells = [...c, ...a];
            const zones = groupOk(cells, minD);
            if (zones)
              options.push({ cells, zones });
          }
      }
      if (!options.length)
        continue;
      const choice = rng.pick(options);
      let cells = choice.cells.slice(0, 4);
      if (count === 2)
        cells = rng.chance(0.5) ? [cells[0], cells[1]] : [cells[2], cells[3]];
      else if (count === 3)
        cells = rng.shuffle(cells).slice(0, 3);
      else if (count === 5)
        cells = [...cells, rng.pick(choice.cells.slice(4))];
      else if (count >= 6)
        cells = choice.cells.slice(0, 6);
      if (count === 1)
        cells = [rng.pick(cells)];
      return {
        spawns: rng.shuffle(cells.slice()),
        zones: choice.zones,
        fixed: false,
        useExtra: count > 4
      };
    }
  }
  return fixedSpawns(map, count, rng, zoneOf);
}
function isMirrorSymmetric(layout) {
  const h = layout.length;
  const w = layout[0].length;
  for (let y = 0;y < h; y++) {
    if (layout[y].length !== w)
      return false;
    for (let x = 0;x < w; x++) {
      const c = layout[y][x];
      if (layout[y][w - 1 - x] !== c || layout[h - 1 - y][x] !== c)
        return false;
    }
  }
  return true;
}
function fixedSpawns(map, count, rng, zoneOf) {
  const layout = map.layout;
  const height = layout.length;
  const width = layout[0].length;
  const main = [];
  const extra = [];
  const free = [];
  for (let y = 1;y < height - 1; y++)
    for (let x = 1;x < width - 1; x++) {
      const c = layout[y][x];
      if (c === "S")
        main.push([x, y]);
      else if (c === "s")
        extra.push([x, y]);
      else if (SPAWNABLE.includes(c))
        free.push([x, y]);
    }
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const quad = ([x, y]) => (x < cx ? 0 : 1) + (y < cy ? 0 : 2);
  const order = [0, 3, 1, 2];
  main.sort((a, b) => order.indexOf(quad(a)) - order.indexOf(quad(b)));
  extra.sort((a, b) => order.indexOf(quad(a)) - order.indexOf(quad(b)));
  const useExtra = count > main.length;
  if (count === 2 && main.length >= 2) {
    const a = main[Math.floor(rng.next() * main.length)];
    const b = main.filter((c) => c !== a).sort((p, q) => manhattan(a, q) - manhattan(a, p))[0];
    main.splice(0, main.length, a, b, ...main.filter((c) => c !== a && c !== b));
  }
  const chosen = [...main, ...useExtra ? extra : []].slice(0, count);
  while (chosen.length < count && free.length) {
    let best = 0;
    let bestD = -1;
    for (let i = 0;i < free.length; i++) {
      const d = chosen.length ? Math.min(...chosen.map((c) => manhattan(c, free[i]))) : 0;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    chosen.push(free.splice(best, 1)[0]);
  }
  const zones = [];
  for (const s of [...main, ...useExtra ? extra : [], ...chosen.slice(main.length + (useExtra ? extra.length : 0))]) {
    const z = zoneOf(s);
    zones.push(z ?? new Set([s[1] * width + s[0]]));
  }
  return { spawns: rng.shuffle(chosen.slice()), zones, fixed: true, useExtra };
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
  specials;
  refused = new Map;
  toxicZones = [];
  speedMul = 1;
  bonusBoost = false;
  loot;
  rangeBonus = 0;
  fuseMul = 1;
  fog = false;
  chaos = null;
  hill = null;
  training = null;
  teams = null;
  vents = [];
  bombRules;
  constructor(config) {
    this.config = config;
    this.mode = getMode(config.modeId);
    this.bombRules = {
      fuse: RULES.bombFuse,
      warn: RULES.bombWarn,
      startRange: RULES.startRange,
      startBombs: RULES.startBombs,
      fireDuration: RULES.fireDuration,
      cooldown: 0,
      ...this.mode.bombRules ?? {}
    };
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
        accessoryId: slot.accessoryId,
        trailId: slot.trailId,
        boomId: slot.boomId,
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
        maxBombs: this.bombRules.startBombs,
        activeBombs: 0,
        range: this.bombRules.startRange,
        bombCooldown: 0,
        throwCharges: 0,
        bigCharges: 0,
        elecCharges: 0,
        stunTime: 0,
        stunImmune: 0,
        freezeCharges: 0,
        slowTime: 0,
        slowImmune: 0,
        toxicCharges: 0,
        chainCharges: 0,
        remoteCharges: 0,
        toxDose: 0,
        toxTick: 0,
        toxRecover: 0,
        shieldCharges: 0,
        shieldTime: 0,
        deathTime: -1,
        killedBy: -1,
        place: 0,
        stats: { bombsPlaced: 0, kills: 0, blocksDestroyed: 0, bonusesPicked: 0, survivalTime: 0 }
      };
    });
    const ml = this.mode.loot;
    this.loot = new LootTable(this.grid.w, this.grid.h, arena.spawns.slice(0, config.players.length), ml ? { ...LOOT, weights: { ...LOOT.weights, ...ml.weights }, maxPerMatch: { ...LOOT.maxPerMatch, ...ml.maxPerMatch } } : LOOT);
    this.buildSuddenDeathOrder();
    for (let y = 0;y < this.grid.h; y++)
      for (let x = 0;x < this.grid.w; x++)
        if (this.grid.terrainAt(x, y) === TERRAIN.VENT)
          this.vents.push([x, y, this.vents.length * RULES.ventStagger]);
    this.mode.onStart?.(this);
    this.specials = new SpecialSpawner(this, this.mode.specials ?? {});
    if (this.mode.specials === null)
      this.specials.disabled = true;
  }
  setTeams() {
    this.teams = this.players.map((p) => p.id % 2);
    const plan = this.config.map.teamSpawns;
    if (!plan)
      return;
    const w = this.grid.w;
    for (const team of [0, 1]) {
      const members = this.players.filter((p) => this.teams[p.id] === team);
      const cells = plan[members.length] ?? plan[Object.keys(plan).length] ?? [];
      members.forEach((p, k) => {
        const c = cells[k];
        if (!c)
          return;
        const x = team === 0 ? c[0] : w - 1 - c[0];
        if (this.grid.blocksMove(x, c[1]))
          return;
        p.x = x + 0.5;
        p.y = c[1] + 0.5;
        p.faceX = team === 0 ? 1 : -1;
        p.faceY = 0;
      });
    }
  }
  teamOf(id) {
    return this.teams?.[id] ?? -1;
  }
  sameTeam(a, b) {
    return a !== b && this.teams !== null && this.teams[a] === this.teams[b];
  }
  isFoe(p, o) {
    return o.alive && o.id !== p.id && !this.sameTeam(p.id, o.id);
  }
  get isOver() {
    return this.phase === "over";
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
    this.updateToxic();
    this.updateBonuses();
    this.specials.update();
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
    if (p.bombCooldown > 0)
      p.bombCooldown = Math.max(0, p.bombCooldown - DT);
    if (p.stunImmune > 0)
      p.stunImmune = Math.max(0, p.stunImmune - DT);
    if (p.slowImmune > 0)
      p.slowImmune = Math.max(0, p.slowImmune - DT);
    if (p.slowTime > 0) {
      p.slowTime = Math.max(0, p.slowTime - DT);
      if (p.slowTime <= 0)
        p.slowImmune = FREEZE.immunity;
    }
    if (p.stunTime > 0) {
      p.stunTime = Math.max(0, p.stunTime - DT);
      if (p.stunTime <= 0)
        p.stunImmune = SHOCK.immunity;
    }
    if (p.stunTime > 0) {
      this.moveWithInput(p, cmd);
      if (cmd.ability)
        this.tryShield(p);
      return;
    }
    this.moveWithInput(p, cmd);
    if (cmd.bomb)
      this.tryPlaceBomb(p);
    if (cmd.throw)
      this.tryThrowBomb(p);
    if (cmd.remote)
      this.tryRemote(p);
    if (cmd.ability)
      this.tryShield(p);
  }
  effectiveSpeed(p) {
    return p.speed * this.speedMul * (p.slowTime > 0 ? 1 - FREEZE.slow : 1);
  }
  moveWithInput(p, cmd) {
    if (p.stunTime > 0) {
      p.moving = false;
      p.slideX = p.slideY = 0;
      return;
    }
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
    p.speed = this.effectiveSpeed(p);
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
  canHoldBomb(tx, ty) {
    const g = this.grid;
    if (tx < 1 || ty < 1 || tx > g.w - 2 || ty > g.h - 2)
      return false;
    const i = g.idx(tx, ty);
    if (g.bombAt[i] >= 0 || g.tiles[i] !== TILE.FLOOR || g.isHazard(tx, ty))
      return false;
    for (const b of this.bombs.values())
      if (b.flight && b.tx === tx && b.ty === ty)
        return false;
    return true;
  }
  canUseBomb(p) {
    return p.alive && p.activeBombs < p.maxBombs && p.bombCooldown <= 0;
  }
  nextBombRange(p) {
    const r = p.range + this.rangeBonus;
    return p.bigCharges > 0 ? bigRange(r) : r;
  }
  makeBomb(p, tx, ty, flight) {
    const big = p.bigCharges > 0;
    if (big)
      p.bigCharges = 0;
    const elec = p.elecCharges > 0;
    if (elec)
      p.elecCharges = 0;
    const freeze = p.freezeCharges > 0;
    if (freeze)
      p.freezeCharges = 0;
    const toxic = p.toxicCharges > 0;
    if (toxic)
      p.toxicCharges = 0;
    const chain = p.chainCharges > 0;
    if (chain)
      p.chainCharges = 0;
    const remote = p.remoteCharges > 0;
    if (remote)
      p.remoteCharges = 0;
    const bomb = {
      id: this.nextId++,
      ownerId: p.id,
      tx,
      ty,
      fuse: this.bombRules.fuse * this.fuseMul,
      fuseTotal: this.bombRules.fuse * this.fuseMul,
      range: big ? bigRange(p.range + this.rangeBonus) : p.range + this.rangeBonus,
      passable: [],
      flight
    };
    if (big)
      bomb.big = true;
    if (elec)
      bomb.elec = true;
    if (freeze)
      bomb.freeze = true;
    if (toxic)
      bomb.toxic = true;
    if (chain)
      bomb.chainDepth = 0;
    if (remote) {
      bomb.remote = true;
      bomb.fuse = bomb.fuseTotal = REMOTE.maxFuse;
    }
    this.bombs.set(bomb.id, bomb);
    p.activeBombs++;
    p.bombCooldown = this.bombRules.cooldown;
    p.stats.bombsPlaced++;
    return bomb;
  }
  groundBomb(b) {
    const g = this.grid;
    b.passable = this.players.filter((o) => o.alive && Math.floor(o.x) === b.tx && Math.floor(o.y) === b.ty).map((o) => o.id);
    g.bombAt[g.idx(b.tx, b.ty)] = b.id;
  }
  tryPlaceBomb(p) {
    if (!this.canUseBomb(p))
      return false;
    const [tx, ty] = this.playerTile(p);
    if (!this.canHoldBomb(tx, ty))
      return false;
    const bomb = this.makeBomb(p, tx, ty);
    this.groundBomb(bomb);
    this.events.push({ t: "bombPlaced", x: tx, y: ty, owner: p.id });
    return true;
  }
  throwTarget(x, y, dx, dy) {
    if (!dx && !dy)
      return null;
    const g = this.grid;
    let best = null;
    for (let d = 1;d <= THROW.maxDist; d++) {
      const cx = x + dx * d;
      const cy = y + dy * d;
      if (g.tile(cx, cy) === TILE.WALL)
        break;
      if (this.canHoldBomb(cx, cy))
        best = [cx, cy];
    }
    return best;
  }
  tryThrowBomb(p) {
    if (p.throwCharges <= 0 || !this.canUseBomb(p))
      return false;
    const [px, py] = this.playerTile(p);
    const dx = Math.sign(p.faceX);
    const dy = dx ? 0 : Math.sign(p.faceY);
    const to = this.throwTarget(px, py, dx, dy);
    if (!to)
      return false;
    const dist = Math.abs(to[0] - px) + Math.abs(to[1] - py);
    this.makeBomb(p, to[0], to[1], { fromX: px, fromY: py, t: 0, dur: THROW.flightBase + THROW.flightPerCell * dist });
    p.throwCharges = 0;
    this.events.push({ t: "bombThrown", x: px, y: py, toX: to[0], toY: to[1], owner: p.id });
    return true;
  }
  remoteBombsOf(p) {
    const out = [];
    for (const b of this.bombs.values())
      if (b.remote && b.ownerId === p.id && !b.flight)
        out.push(b);
    return out;
  }
  tryRemote(p) {
    if (!p.alive)
      return false;
    const list = this.remoteBombsOf(p).filter((b) => b.fuseTotal - b.fuse >= REMOTE.armDelay - 0.000000001);
    if (!list.length)
      return false;
    list.sort((a, b) => a.id - b.id);
    for (const b of list) {
      if (!this.bombs.has(b.id))
        continue;
      this.events.push({ t: "remoteDetonate", player: p.id, x: b.tx, y: b.ty });
      this.detonate(b);
    }
    return true;
  }
  defuseRemote(b) {
    if (!b.remote)
      return;
    b.remote = false;
    b.fuse = Math.min(b.fuse, this.bombRules.fuse * this.fuseMul);
    b.fuseTotal = Math.max(b.fuse, 0.01);
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
      if (b.flight) {
        b.flight.t += DT;
        if (b.flight.t >= b.flight.dur - 0.000000001)
          this.land(b);
        continue;
      }
      b.fuse -= DT;
      if (b.fuse <= 0)
        toExplode.push(b);
    }
    toExplode.sort((a, b) => a.id - b.id);
    for (const b of toExplode)
      if (this.bombs.has(b.id))
        this.detonate(b);
  }
  land(b) {
    b.flight = undefined;
    const g = this.grid;
    const i = g.idx(b.tx, b.ty);
    if (g.tiles[i] !== TILE.FLOOR || g.bombAt[i] >= 0) {
      this.events.push({ t: "bombLanded", x: b.tx, y: b.ty, owner: b.ownerId });
      if (g.bombAt[i] < 0)
        this.detonate(b);
      else {
        this.bombs.delete(b.id);
        const o = this.players[b.ownerId];
        if (o)
          o.activeBombs = Math.max(0, o.activeBombs - 1);
      }
      return;
    }
    this.groundBomb(b);
    this.events.push({ t: "bombLanded", x: b.tx, y: b.ty, owner: b.ownerId });
  }
  blastCells(tx, ty, range) {
    const g = this.grid;
    const out = [g.idx(tx, ty)];
    for (const [dx, dy] of DIRS) {
      for (let i = 1;i <= range; i++) {
        const x = tx + dx * i;
        const y = ty + dy * i;
        const t = g.tile(x, y);
        if (t === TILE.WALL)
          break;
        const idx = g.idx(x, y);
        out.push(idx);
        if (t === TILE.BLOCK || g.bombAt[idx] >= 0)
          break;
        const bo = g.bonusAt[idx];
        if (bo >= 0 && (this.bonuses.get(bo)?.invuln ?? 1) <= 0)
          break;
      }
    }
    return out;
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
      const shockZone = b.elec ? this.shockCells(b.tx, b.ty, b.range) : null;
      const frostZone = b.freeze ? this.shockCells(b.tx, b.ty, b.range, FREEZE.radius) : null;
      const gasZone = b.toxic ? this.blastCells(b.tx, b.ty, b.range) : null;
      const chainReach = b.chainDepth !== undefined && b.chainDepth < CHAIN.maxDepth ? this.chainReach(b.tx, b.ty) : null;
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
      if (shockZone)
        this.discharge(b, shockZone);
      if (frostZone)
        this.frostBlast(b, frostZone);
      if (gasZone)
        this.addToxicZone(b, gasZone);
      if (chainReach)
        this.propagateChain(b, chainReach, queue);
      this.events.push(b.big ? { t: "explode", x: b.tx, y: b.ty, owner: b.ownerId, cells, chain, big: true } : { t: "explode", x: b.tx, y: b.ty, owner: b.ownerId, cells, chain });
    }
  }
  shockCells(tx, ty, range, radius = SHOCK.radius) {
    const g = this.grid;
    const set = new Set(this.blastCells(tx, ty, range));
    const start = g.idx(tx, ty);
    const dist = new Map([[start, 0]]);
    const q = [start];
    while (q.length) {
      const c = q.shift();
      const d = dist.get(c);
      set.add(c);
      if (d >= radius)
        continue;
      const x = c % g.w;
      const y = (c - x) / g.w;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        const t = g.tile(nx, ny);
        if (t === TILE.WALL || t === TILE.BLOCK)
          continue;
        const n = g.idx(nx, ny);
        if (dist.has(n))
          continue;
        dist.set(n, d + 1);
        q.push(n);
      }
    }
    return [...set];
  }
  discharge(b, cells) {
    const g = this.grid;
    const zone = new Set(cells);
    this.events.push({ t: "shock", x: b.tx, y: b.ty, owner: b.ownerId, cells });
    for (const p of this.players) {
      if (!p.alive || !zone.has(g.idx(Math.floor(p.x), Math.floor(p.y))))
        continue;
      if (this.sameTeam(p.id, b.ownerId))
        continue;
      if (p.shieldTime > 0) {
        this.events.push({ t: "shieldBlocked", player: p.id });
        continue;
      }
      if (p.stunTime > 0 || p.stunImmune > 0)
        continue;
      this.stun(p, b.ownerId, SHOCK.stun);
    }
  }
  frostBlast(b, cells) {
    const g = this.grid;
    const zone = new Set(cells);
    this.events.push({ t: "frost", x: b.tx, y: b.ty, owner: b.ownerId, cells });
    for (const p of this.players) {
      if (!p.alive || !zone.has(g.idx(Math.floor(p.x), Math.floor(p.y))))
        continue;
      if (this.sameTeam(p.id, b.ownerId))
        continue;
      if (p.shieldTime > 0) {
        this.events.push({ t: "shieldBlocked", player: p.id });
        continue;
      }
      if (p.slowTime > 0 || p.slowImmune > 0)
        continue;
      this.slow(p, b.ownerId, FREEZE.duration);
    }
  }
  slow(p, by, dur) {
    p.slowTime = Math.min(FREEZE.duration, Math.max(0, dur));
    this.events.push({ t: "frozen", player: p.id, by, dur: p.slowTime });
  }
  chainReach(tx, ty) {
    const g = this.grid;
    const start = g.idx(tx, ty);
    const dist = new Map([[start, 0]]);
    const q = [start];
    while (q.length) {
      const c = q.shift();
      const d = dist.get(c);
      if (d >= CHAIN.radius)
        continue;
      const x = c % g.w;
      const y = (c - x) / g.w;
      for (const [dx, dy] of DIRS) {
        const t = g.tile(x + dx, y + dy);
        if (t === TILE.WALL || t === TILE.BLOCK)
          continue;
        const n = g.idx(x + dx, y + dy);
        if (dist.has(n))
          continue;
        dist.set(n, d + 1);
        q.push(n);
      }
    }
    return dist;
  }
  propagateChain(b, reach, exploding) {
    const g = this.grid;
    const busy = new Set(exploding.map((q) => q.id));
    const targets = [];
    for (const o of this.bombs.values()) {
      if (o.flight || busy.has(o.id))
        continue;
      const d = reach.get(g.idx(o.tx, o.ty));
      if (d === undefined || d === 0)
        continue;
      if (o.chainArmed)
        continue;
      targets.push({ o, d });
    }
    targets.sort((p, q) => p.d - q.d || p.o.id - q.o.id);
    let rank = 0;
    for (const { o } of targets.slice(0, CHAIN.maxLinks)) {
      rank++;
      const delay = CHAIN.step * rank;
      if (delay < o.fuse)
        o.fuse = delay;
      o.chainArmed = true;
      const depth = b.chainDepth + 1;
      if (o.chainDepth === undefined || depth < o.chainDepth)
        o.chainDepth = depth;
      this.events.push({ t: "chainLink", x: b.tx, y: b.ty, toX: o.tx, toY: o.ty, delay: o.fuse });
    }
  }
  addToxicZone(b, cells) {
    const g = this.grid;
    const list = cells.filter((i) => g.tiles[i] !== TILE.WALL);
    this.toxicZones.push({ id: this.nextId++, owner: b.ownerId, cells: list, timeLeft: TOXIC.duration, duration: TOXIC.duration });
    while (this.toxicZones.length > TOXIC.maxZones)
      this.toxicZones.shift();
    this.events.push({ t: "gas", x: b.tx, y: b.ty, owner: b.ownerId, cells: list });
  }
  hostileGasAt(p, i) {
    for (let k = this.toxicZones.length - 1;k >= 0; k--) {
      const z = this.toxicZones[k];
      if (z.cells.includes(i) && !this.sameTeam(p.id, z.owner))
        return z.owner;
    }
    return null;
  }
  gasAt(i) {
    return this.toxicZones.some((z) => z.cells.includes(i));
  }
  updateToxic() {
    for (const z of this.toxicZones)
      z.timeLeft -= DT;
    if (this.toxicZones.some((z) => z.timeLeft <= 0))
      this.toxicZones = this.toxicZones.filter((z) => z.timeLeft > 0);
    const g = this.grid;
    for (const p of this.players) {
      if (!p.alive)
        continue;
      const owner = this.toxicZones.length ? this.hostileGasAt(p, g.idx(Math.floor(p.x), Math.floor(p.y))) : null;
      if (owner !== null) {
        p.toxRecover = 0;
        if (p.shieldTime > 0)
          continue;
        if (p.toxTick > 0) {
          p.toxTick = Math.max(0, p.toxTick - DT);
          continue;
        }
        p.toxDose++;
        p.toxTick = TOXIC.doseEvery;
        this.events.push({ t: "poisoned", player: p.id, dose: p.toxDose });
        if (p.toxDose >= TOXIC.lethalDoses)
          this.kill(p, owner);
      } else {
        if (p.toxTick > 0)
          p.toxTick = Math.max(0, p.toxTick - DT);
        if (p.toxDose > 0) {
          p.toxRecover += DT;
          if (p.toxRecover >= TOXIC.recoverEvery) {
            p.toxDose--;
            p.toxRecover = 0;
          }
        } else
          p.toxRecover = 0;
      }
    }
  }
  endOfRoundCleanup() {
    for (const b of [...this.bonuses.values()])
      this.removeBonus(b);
    for (const p of this.players)
      clearAbilities(p);
    for (const b of this.bombs.values())
      this.defuseRemote(b);
    this.clearToxic();
    this.specials.disabled = true;
  }
  clearToxic() {
    this.toxicZones = [];
    for (const p of this.players) {
      p.toxDose = 0;
      p.toxTick = 0;
      p.toxRecover = 0;
    }
  }
  stun(p, by, dur) {
    p.stunTime = Math.min(SHOCK.stun, Math.max(0, dur));
    p.moving = false;
    p.slideX = p.slideY = 0;
    this.events.push({ t: "stunned", player: p.id, by, dur: p.stunTime });
  }
  setFire(x, y, shape, owner) {
    const g = this.grid;
    const i = g.idx(x, y);
    if (g.fire[i] <= 0)
      g.fireShape[i] = 0;
    g.fire[i] = this.bombRules.fireDuration;
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
    if (g.hiddenBonus[i])
      this.loot.record(g.hiddenBonus[i], x, y);
    else
      g.hiddenBonus[i] = this.loot.roll(this.rng, x, y, this.bonuses.size, this.bonusBoost);
    const hidden = g.hiddenBonus[i];
    if (hidden && this.phase !== "playing")
      g.hiddenBonus[i] = null;
    else if (hidden) {
      g.hiddenBonus[i] = null;
      const bonus = {
        id: this.nextId++,
        type: hidden,
        tx: x,
        ty: y,
        invuln: this.bombRules.fireDuration + 0.05,
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
      const def = BONUSES[bonus.type];
      if (!def) {
        this.removeBonus(bonus);
        continue;
      }
      if (def.special) {
        const why = refuseReason(p, bonus.type);
        if (why) {
          if (this.refused.get(p.id) !== bonus.id) {
            this.refused.set(p.id, bonus.id);
            this.events.push({ t: "bonusRefused", player: p.id, type: bonus.type, reason: why, x: tx, y: ty });
          }
          continue;
        }
      }
      def.apply(p);
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
        if (g.fire[i] > this.bombRules.fireDuration - DT * 1.5)
          this.events.push({ t: "shieldBlocked", player: p.id });
        continue;
      }
      if (this.sameTeam(p.id, g.fireOwner[i]))
        continue;
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
    clearAbilities(p);
    for (const b of this.bombs.values())
      if (b.remote && b.ownerId === p.id)
        this.defuseRemote(b);
    p.stats.survivalTime = this.time;
    if (killer >= 0 && killer !== p.id)
      this.players[killer].stats.kills++;
    this.events.push({ t: "playerDied", player: p.id, killer, x: p.x, y: p.y });
    this.hill?.onDeath(p);
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
    if (this.mode.suddenDeath === false)
      return;
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
    if (this.mode.suddenDeath === false)
      return out;
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
    if (this.mode.endless)
      return;
    if (this.phase === "playing") {
      const done = this.hill ? this.hill.reached || this.timeLeft <= 0 : this.aliveCount <= 1 || this.timeLeft <= 0;
      if (done) {
        this.endOfRoundCleanup();
        this.phase = "ending";
        this.endTimer = RULES.endDelay;
      }
    } else if (this.phase === "ending") {
      this.endTimer -= DT;
      if (this.endTimer <= 0)
        this.finish();
    }
  }
  standings() {
    const over = this.phase === "over";
    const hill = this.hill;
    if (hill) {
      const ranked = [...this.players].sort((a, b) => hill.points(b.id) - hill.points(a.id) || a.id - b.id);
      let place = 1;
      return ranked.map((p, i) => {
        if (i > 0 && hill.points(ranked[i - 1].id) !== hill.points(p.id))
          place = i + 1;
        return { id: p.id, place, alive: p.alive, decided: over };
      });
    }
    const ranked = [...this.players].sort((a, b) => {
      if (a.alive !== b.alive)
        return a.alive ? -1 : 1;
      if (a.alive)
        return a.id - b.id;
      return b.deathTime - a.deathTime || a.id - b.id;
    });
    let place = 1;
    return ranked.map((p, i) => {
      const prev = ranked[i - 1];
      if (i > 0 && !(prev.alive && p.alive) && !(!prev.alive && !p.alive && prev.deathTime === p.deathTime))
        place = i + 1;
      return { id: p.id, place, alive: p.alive, decided: over || !p.alive };
    });
  }
  finish() {
    this.phase = "over";
    this.endOfRoundCleanup();
    const alive = this.players.filter((p) => p.alive);
    for (const p of alive)
      p.stats.survivalTime = this.time;
    this.winnerId = this.hill ? this.hill.leader() : alive.length === 1 ? alive[0].id : -1;
    for (const st of this.standings())
      this.players[st.id].place = st.place;
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
    bombs: [...m.bombs.values()].map((b) => [b.id, b.ownerId, b.tx, b.ty, r2(b.fuse), b.range, b.passable, b.fuseTotal, b.flight ? [b.flight.fromX, b.flight.fromY, r2(b.flight.t), r2(b.flight.dur)] : null, b.big ? 1 : 0, b.elec ? 1 : 0, b.freeze ? 1 : 0, b.toxic ? 1 : 0, b.chainDepth ?? -1, b.remote ? 1 : 0]),
    toxic: m.toxicZones.map((z) => [z.id, z.owner, z.cells, r2(z.timeLeft), z.duration]),
    bonuses: [...m.bonuses.values()].map((b) => [b.id, b.type, b.tx, b.ty, r2(b.invuln), r2(b.age)]),
    pending: m.pendingDrops.map(([x, y, l]) => [x, y, r2(l)]),
    hill: m.hill ? { scores: m.hill.scores.map(r2), respawn: m.hill.respawnIn.map(r2), holder: m.hill.holder, contested: m.hill.contested, site: m.hill.site, next: m.hill.next, moveIn: r2(m.hill.moveIn), siteCell: m.hill.cells[0], nextCell: m.hill.next >= 0 ? m.hill.sites[m.hill.next].cells[0] : -1 } : null,
    chaos: m.chaos ? {
      pending: m.chaos.pending ? [m.chaos.pending.def.id, r2(m.chaos.pendingLeft), m.chaos.pending.zone] : null,
      active: m.chaos.active.map((a) => [a.def.id, r2(a.timer), a.zone]),
      nextAt: m.chaos.nextAt,
      fog: m.fog,
      rangeBonus: m.rangeBonus,
      fuseMul: m.fuseMul
    } : null,
    events
  };
}

// server/game.ts
var SNAPSHOT_EVERY = 3;
var MAX_QUEUE = 4;
var matchCounter = 0;

class GameRunner {
  opts;
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
    this.opts = opts;
    this.send = send;
    this.onEnd = onEnd;
    const used = new Set(seats.map((s) => s.characterId));
    this.slots = seats.map((s, i) => {
      this.seatOf.set(s.token, i);
      return { name: s.name, characterId: s.characterId, skinId: s.skinId, accessoryId: s.accessoryId, trailId: s.trailId, boomId: s.boomId, isBot: false, accountId: s.token };
    });
    if (opts.fillBots) {
      const free = CHARACTERS.filter((c) => !used.has(c.id));
      while (this.slots.length < opts.maxPlayers && free.length) {
        const c = free.shift();
        this.slots.push({ name: `${c.name} (bot)`, characterId: c.id, isBot: true, difficulty: "normal" });
      }
    }
    const seed = Math.random() * 2 ** 31 | 0;
    this.match = new Match({ seed, map: pickMap(opts.modeId === "classic" ? RANDOM_MAP : opts.mapId, Math.random, opts.modeId), modeId: opts.modeId, players: this.slots });
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
      you,
      spectate: !!this.opts.spectators
    });
    this.send(token, { t: "snap", s: encodeSnapshot(m, this.acks, []) });
  }
  input(token, seq, cmd) {
    const i = this.seatOf.get(token);
    if (i === undefined || seq <= this.acks[i])
      return;
    const q = this.queues[i];
    q.push({ seq, cmd: { mx: clamp(cmd.mx), my: clamp(cmd.my), bomb: !!cmd.bomb, ability: !!cmd.ability, throw: !!cmd.throw, remote: !!cmd.remote } });
    while (q.length > MAX_QUEUE) {
      const old = q.shift();
      if (old.cmd.bomb)
        q[0].cmd.bomb = true;
      if (old.cmd.ability)
        q[0].cmd.ability = true;
      if (old.cmd.throw)
        q[0].cmd.throw = true;
      if (old.cmd.remote)
        q[0].cmd.remote = true;
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
  lastEmote = new Map;
  emote(token, id) {
    const i = this.seatOf.get(token);
    if (i === undefined || !/^emo-[a-z0-9-]{1,24}$/.test(id) || !this.match.players[i]?.alive)
      return;
    const now = performance.now();
    if (now - (this.lastEmote.get(token) ?? 0) < 1000)
      return;
    this.lastEmote.set(token, now);
    for (const t of this.seatOf.keys())
      this.send(t, { t: "emote", player: i, id });
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
        accessoryId: c.accessoryId,
        trailId: c.trailId,
        boomId: c.boomId,
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
    if (s.modeId && MODES.some((m) => m.id === s.modeId && m.available && !m.hidden))
      r.modeId = s.modeId;
    if (s.mapId && (s.mapId === RANDOM_MAP || MAPS.some((m) => m.id === s.mapId)))
      r.mapId = s.mapId;
    if (typeof s.fillBots === "boolean")
      r.fillBots = s.fillBots;
    const mp = MAPS.find((m) => m.id === r.mapId);
    if (mp && !mapAllows(mp, r.modeId))
      r.mapId = RANDOM_MAP;
    this.broadcast(r);
  }
  blocker(r) {
    const humans = r.members.length;
    const fill = r.fillBots || r.modeId === "koth";
    const total = fill ? Math.max(humans, MAX_ROOM_PLAYERS) : humans;
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
      return { token: cl.token, name: cl.name, characterId: cl.characterId, skinId: cl.skinId, accessoryId: cl.accessoryId, trailId: cl.trailId, boomId: cl.boomId };
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
    r.game = new GameRunner(seats, { mapId: r.mapId, modeId: r.modeId, fillBots: r.fillBots || r.modeId === "koth", maxPlayers: MAX_ROOM_PLAYERS, spectators: !r.isPublic }, this.hooks.send, () => this.endGame(r));
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
  emote(c, id) {
    this.roomOf(c)?.game?.emote(c.token, id);
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
var MAX_MESSAGE = 64 * 1024;
var GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

class WsConn {
  socket;
  buf = Buffer.alloc(0);
  frag = [];
  fragSize = 0;
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
        if (big > BigInt(MAX_MESSAGE))
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
        this.fragSize += payload.length;
        if (this.fragSize > MAX_MESSAGE)
          return this.close(1009);
        this.frag.push(payload);
        if (fin) {
          const msg = Buffer.concat(this.frag).toString("utf8");
          this.frag = [];
          this.fragSize = 0;
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

// server/accounts.ts
import { createHash as createHash2, createPublicKey, createVerify, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

class MemoryStore {
  kind = "memory";
  m = new Map;
  async get(k) {
    const e = this.m.get(k);
    if (!e)
      return null;
    if (e.exp && e.exp < Date.now()) {
      this.m.delete(k);
      return null;
    }
    return e.v;
  }
  async set(k, v, ttl) {
    this.m.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 });
  }
  async setNX(k, v) {
    const e = this.m.get(k);
    if (e && (!e.exp || e.exp >= Date.now()))
      return false;
    this.m.set(k, { v, exp: 0 });
    this.written();
    return true;
  }
  written() {}
  async del(k) {
    this.m.delete(k);
  }
}

class FileStore extends MemoryStore {
  kind = "file";
  file;
  timer = null;
  constructor(dir) {
    super();
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "accounts.json");
    if (existsSync(this.file)) {
      const data = JSON.parse(readFileSync(this.file, "utf8"));
      for (const [k, e] of Object.entries(data))
        this.m.set(k, e);
    }
  }
  written() {
    this.flush();
  }
  flush() {
    if (this.timer)
      return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const tmp = this.file + ".tmp";
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.m)));
      renameSync(tmp, this.file);
    }, 50);
  }
  async set(k, v, ttl) {
    await super.set(k, v, ttl);
    this.flush();
  }
  async del(k) {
    await super.del(k);
    this.flush();
  }
}

class UpstashStore {
  url;
  token;
  kind = "upstash";
  constructor(url, token) {
    this.url = url;
    this.token = token;
  }
  async cmd(args) {
    const r = await fetch(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(args)
    });
    if (!r.ok)
      throw new Error(`stockage ${r.status}`);
    const j = await r.json();
    if (j.error)
      throw new Error(j.error);
    return j.result;
  }
  async get(k) {
    return await this.cmd(["GET", k]) ?? null;
  }
  async set(k, v, ttl) {
    await this.cmd(ttl ? ["SET", k, v, "EX", ttl] : ["SET", k, v]);
  }
  async setNX(k, v) {
    return await this.cmd(["SET", k, v, "NX"]) === "OK";
  }
  async del(k) {
    await this.cmd(["DEL", k]);
  }
}
function storeFromEnv(env = process.env) {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
    return new UpstashStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  if (env.ACCOUNTS_DATA_DIR)
    return new FileStore(env.ACCOUNTS_DATA_DIR);
  return null;
}

class GoogleVerifier {
  clientIds;
  jwksUrl;
  fetchJson;
  now;
  keys = new Map;
  keysUntil = 0;
  constructor(clientIds, jwksUrl = "https://www.googleapis.com/oauth2/v3/certs", fetchJson = async (url) => {
    const r = await fetch(url);
    if (!r.ok)
      throw new Error("clés Google indisponibles");
    const m = /max-age=(\d+)/.exec(r.headers.get("cache-control") ?? "");
    return { keys: (await r.json()).keys, maxAge: m ? Number(m[1]) : 3600 };
  }, now = () => Date.now()) {
    this.clientIds = clientIds;
    this.jwksUrl = jwksUrl;
    this.fetchJson = fetchJson;
    this.now = now;
  }
  async key(kid) {
    if (this.now() > this.keysUntil || !this.keys.has(kid)) {
      const { keys, maxAge } = await this.fetchJson(this.jwksUrl);
      this.keys = new Map(keys.map((k) => [k.kid, k]));
      this.keysUntil = this.now() + Math.min(maxAge, 24 * 3600) * 1000;
    }
    return this.keys.get(kid);
  }
  async verify(idToken) {
    if (typeof idToken !== "string" || idToken.length > 4096)
      throw new Error("jeton invalide");
    const parts = idToken.split(".");
    if (parts.length !== 3)
      throw new Error("jeton invalide");
    const dec = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    let header;
    let payload;
    try {
      header = dec(parts[0]);
      payload = dec(parts[1]);
    } catch {
      throw new Error("jeton invalide");
    }
    if (header.alg !== "RS256" || !header.kid)
      throw new Error("jeton invalide");
    const jwk = await this.key(header.kid);
    if (!jwk)
      throw new Error("clé inconnue");
    const pub = createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: "jwk" });
    const ok = createVerify("RSA-SHA256").update(`${parts[0]}.${parts[1]}`).verify(pub, Buffer.from(parts[2], "base64url"));
    if (!ok)
      throw new Error("signature invalide");
    if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com")
      throw new Error("émetteur invalide");
    if (!payload.aud || !this.clientIds.includes(payload.aud))
      throw new Error("audience invalide");
    const nowSec = Math.floor(this.now() / 1000);
    if (!payload.exp || payload.exp < nowSec - 30)
      throw new Error("jeton expiré");
    if (payload.iat && payload.iat > nowSec + 300)
      throw new Error("jeton invalide");
    if (!payload.sub || !/^[0-9A-Za-z_-]{1,255}$/.test(payload.sub))
      throw new Error("jeton invalide");
    return { sub: payload.sub, email: payload.email, name: payload.name };
  }
}
var SESSION_TTL = 180 * 24 * 3600;
var MAX_SAVE_BYTES = 256 * 1024;
var BACKUPS = 5;
var sha = (s) => createHash2("sha256").update(s).digest("hex");

class Accounts {
  store;
  verifier;
  sanitize;
  constructor(store, verifier, sanitize = (d) => d) {
    this.store = store;
    this.verifier = verifier;
    this.sanitize = sanitize;
  }
  async signIn(idToken) {
    const id = await this.verifier.verify(idToken);
    const accKey = `acct:${sha("google:" + id.sub)}`;
    let profileId = await this.store.get(accKey);
    let created = false;
    if (!profileId) {
      const fresh = randomBytes(12).toString("hex");
      if (await this.store.setNX(accKey, fresh)) {
        profileId = fresh;
        created = true;
        await this.store.set(`prof:${fresh}`, JSON.stringify({ rev: 0, updatedAt: Date.now(), data: null }));
        await this.store.set(`prof:${fresh}:acct`, accKey);
      } else
        profileId = await this.store.get(accKey);
    }
    const pid = profileId;
    const session = randomBytes(32).toString("base64url");
    await this.store.set(`sess:${sha(session)}`, pid, SESSION_TTL);
    return { session, profileId: pid, created, email: id.email, name: id.name, cloud: await this.load(pid) };
  }
  async profileOf(session) {
    if (typeof session !== "string" || session.length < 20 || session.length > 100)
      return null;
    return this.store.get(`sess:${sha(session)}`);
  }
  async signOut(session) {
    await this.store.del(`sess:${sha(session)}`);
  }
  async deleteAccount(profileId, session) {
    const cur = await this.load(profileId);
    for (let r = Math.max(0, cur.rev - 10);r <= cur.rev; r++)
      await this.store.del(`prof:${profileId}:backup:${r}`);
    const acc = await this.store.get(`prof:${profileId}:acct`);
    if (acc)
      await this.store.del(acc);
    await this.store.del(`prof:${profileId}:acct`);
    await this.store.del(`prof:${profileId}`);
    await this.store.del(`sess:${sha(session)}`);
  }
  async load(profileId) {
    const raw = await this.store.get(`prof:${profileId}`);
    return raw ? JSON.parse(raw) : { rev: 0, updatedAt: 0, data: null };
  }
  async save(profileId, data, baseRev, force = false) {
    const size = Buffer.byteLength(JSON.stringify(data ?? null));
    if (!data || typeof data !== "object" || Array.isArray(data) || size > MAX_SAVE_BYTES)
      throw new Error("sauvegarde invalide");
    const clean = this.sanitize(data);
    const cur = await this.load(profileId);
    if (!force && baseRev !== cur.rev)
      return { ok: false, cloud: cur };
    if (force && cur.data) {
      await this.store.set(`prof:${profileId}:backup:${cur.rev}`, JSON.stringify(cur), 90 * 24 * 3600);
      await this.store.del(`prof:${profileId}:backup:${cur.rev - BACKUPS}`);
    }
    const next = { rev: cur.rev + 1, updatedAt: Date.now(), data: clean };
    await this.store.set(`prof:${profileId}`, JSON.stringify(next));
    return { ok: true, rev: next.rev, updatedAt: next.updatedAt };
  }
}
function allowedOrigin(origin, host) {
  if (!origin)
    return null;
  if (origin === "https://appassets.androidplatform.net")
    return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
    return origin;
  if (host && (origin === `https://${host}` || origin === `http://${host}`))
    return origin;
  const extra = (process.env.ACCOUNTS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin) ? origin : null;
}

class RateLimit {
  max;
  windowMs;
  hits = new Map;
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
  }
  allow(key) {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || now - h.t > this.windowMs) {
      this.hits.set(key, { n: 1, t: now });
      if (this.hits.size > 1e4)
        this.hits.clear();
      return true;
    }
    return ++h.n <= this.max;
  }
}
async function body(req, max = MAX_SAVE_BYTES + 4096) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > max)
      throw new Error("trop gros");
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function accountRoutes(accounts, webClientId, outdated = () => false) {
  const authLimit = new RateLimit(20, 60000);
  const saveLimit = new RateLimit(60, 60000);
  return async (req, res, path) => {
    if (!path.startsWith("/api/"))
      return false;
    const origin = allowedOrigin(req.headers.origin, req.headers.host);
    const headers = { "content-type": "application/json", "cache-control": "no-store" };
    if (origin) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-headers"] = "authorization, content-type, x-bomberush-version";
      headers["access-control-allow-methods"] = "GET, POST, PUT, OPTIONS";
      headers["vary"] = "origin";
    }
    const reply = (status, obj) => {
      res.writeHead(status, headers);
      res.end(JSON.stringify(obj));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(origin ? 204 : 403, headers);
      res.end();
      return true;
    }
    if (path === "/api/config" && req.method === "GET") {
      reply(200, { accounts: !!accounts && !!webClientId, googleClientId: webClientId ?? null });
      return true;
    }
    const writes = path === "/api/auth/google" && req.method === "POST" || path === "/api/profile" && req.method === "PUT";
    if (writes && outdated(req)) {
      reply(426, { error: "Mise à jour obligatoire : mets le jeu à jour pour synchroniser ta progression.", code: "update_required" });
      return true;
    }
    if (!accounts || !webClientId) {
      reply(503, { error: "Les comptes ne sont pas encore activés sur le serveur." });
      return true;
    }
    const ip = (req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?").split(",")[0].trim();
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    try {
      if (path === "/api/auth/google" && req.method === "POST") {
        if (!authLimit.allow(ip))
          return reply(429, { error: "Trop de tentatives, réessaie dans une minute." }), true;
        const b = await body(req, 8192);
        try {
          const r = await accounts.signIn(String(b.idToken ?? ""));
          reply(200, r);
        } catch (e) {
          reply(401, { error: "Connexion Google refusée (" + e.message + ")." });
        }
        return true;
      }
      const profileId = await accounts.profileOf(bearer);
      if (!profileId)
        return reply(401, { error: "Session expirée, reconnecte-toi." }), true;
      if (path === "/api/auth/logout" && req.method === "POST") {
        await accounts.signOut(bearer);
        reply(200, { ok: true });
        return true;
      }
      if (path === "/api/account/delete" && req.method === "POST") {
        await accounts.deleteAccount(profileId, bearer);
        reply(200, { ok: true });
        return true;
      }
      if (path === "/api/profile" && req.method === "GET") {
        reply(200, await accounts.load(profileId));
        return true;
      }
      if (path === "/api/profile" && req.method === "PUT") {
        if (!saveLimit.allow(profileId))
          return reply(429, { error: "Trop de sauvegardes, patiente un peu." }), true;
        const b = await body(req);
        const r = await accounts.save(profileId, b.data, Number(b.baseRev ?? -1), b.force === true);
        reply(r.ok ? 200 : 409, r);
        return true;
      }
      reply(404, { error: "Introuvable" });
    } catch (e) {
      reply(400, { error: "Requête invalide (" + e.message + ")." });
    }
    return true;
  };
}

// server/updates.ts
import { createHash as createHash3, timingSafeEqual } from "node:crypto";

// src/net/update-policy.ts
var STORE_URL = "https://play.google.com/store/apps/details?id=com.bomberush.game";
var LEGACY_VERSION = "1.11.5";
var DEFAULT_UPDATE = {
  enabled: false,
  latestVersion: "1.0.0",
  minVersion: "1.0.0",
  mandatory: false,
  title: "Nouvelle mise à jour !",
  description: "Une nouvelle version de Bombe Rush est disponible.",
  notes: [],
  storeUrl: STORE_URL,
  updatedAt: 0
};
var VERSION_RE = /^\d{1,4}(\.\d{1,4}){0,3}$/;
function isVersion(v) {
  return typeof v === "string" && VERSION_RE.test(v.trim());
}
function compareVersions(a, b) {
  const pa = a.trim().split(".").map((n) => Number(n) || 0);
  const pb = b.trim().split(".").map((n) => Number(n) || 0);
  for (let i = 0;i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d)
      return d;
  }
  return 0;
}
function requiredVersion(c) {
  return c.mandatory && compareVersions(c.latestVersion, c.minVersion) > 0 ? c.latestVersion : c.minVersion;
}
function updateStatus(c, version) {
  if (!c.enabled)
    return "ok";
  const v = isVersion(version) ? version : LEGACY_VERSION;
  if (compareVersions(v, requiredVersion(c)) < 0)
    return "mandatory";
  if (compareVersions(v, c.latestVersion) < 0)
    return "optional";
  return "ok";
}
var clip = (s, n) => typeof s === "string" ? s.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, n) : "";
function sanitizeUpdate(raw, now = Date.now()) {
  const r = raw ?? {};
  const latest = typeof r.latestVersion === "string" ? r.latestVersion.trim() : "";
  const min = typeof r.minVersion === "string" ? r.minVersion.trim() : "";
  if (!isVersion(latest))
    return { ok: false, error: "Dernière version invalide (exemple : 1.12.0)." };
  if (!isVersion(min))
    return { ok: false, error: "Version minimale invalide (exemple : 1.11.0)." };
  if (compareVersions(min, latest) > 0)
    return { ok: false, error: "La version minimale ne peut pas dépasser la dernière version." };
  let storeUrl = clip(r.storeUrl, 300) || STORE_URL;
  try {
    const u = new URL(storeUrl);
    if (u.protocol !== "https:" || !/(^|\.)play\.google\.com$/.test(u.hostname))
      return { ok: false, error: "Le lien doit pointer vers le Google Play Store (https://play.google.com/…)." };
    storeUrl = u.toString();
  } catch {
    return { ok: false, error: "Lien Play Store invalide." };
  }
  const notes = [];
  if (Array.isArray(r.notes)) {
    for (const n of r.notes.slice(0, 60)) {
      if (notes.length >= 20)
        break;
      const nn = n ?? {};
      const kind = nn.kind === "fix" || nn.kind === "improve" ? nn.kind : "new";
      const text = clip(nn.text, 160);
      if (text)
        notes.push({ kind, text });
    }
  }
  let push = null;
  const rp = r.push ?? null;
  if (rp && typeof rp === "object") {
    const title = clip(rp.title, 60);
    const body = clip(rp.body, 200);
    if (title && body)
      push = { id: (clip(rp.id, 40) || String(now)).replace(/[^A-Za-z0-9_-]/g, "") || String(now), title, body };
  }
  return {
    ok: true,
    config: {
      push,
      enabled: r.enabled === true,
      latestVersion: latest,
      minVersion: min,
      mandatory: r.mandatory === true,
      title: clip(r.title, 80) || DEFAULT_UPDATE.title,
      description: clip(r.description, 600),
      notes,
      storeUrl,
      updatedAt: now
    }
  };
}

// server/updates.ts
var KEY = "cfg:update";
var CACHE_MS = 30000;

class UpdateService {
  store;
  now;
  cache = { ...DEFAULT_UPDATE };
  loadedAt = 0;
  loading = null;
  constructor(store = new MemoryStore, now = Date.now) {
    this.store = store;
    this.now = now;
  }
  async get() {
    if (this.now() - this.loadedAt > CACHE_MS) {
      this.loading ??= this.refresh().finally(() => this.loading = null);
      await this.loading;
    }
    return this.cache;
  }
  get current() {
    if (this.now() - this.loadedAt > CACHE_MS && !this.loading)
      this.get();
    return this.cache;
  }
  async refresh() {
    try {
      const raw = await this.store.get(KEY);
      if (raw) {
        const s = sanitizeUpdate(JSON.parse(raw), 0);
        if (s.ok)
          this.cache = { ...s.config, updatedAt: JSON.parse(raw).updatedAt ?? 0 };
      }
      this.loadedAt = this.now();
    } catch (e) {
      console.warn("mises à jour : lecture impossible", e.message);
      this.loadedAt = this.now() - CACHE_MS + 5000;
    }
  }
  async save(raw) {
    const s = sanitizeUpdate(raw, this.now());
    if (!s.ok)
      return s;
    await this.store.set(KEY, JSON.stringify(s.config));
    this.cache = s.config;
    this.loadedAt = this.now();
    return s;
  }
  async applyBundled(b) {
    const rev = typeof b?.rev === "string" ? b.rev.slice(0, 64) : "";
    if (!rev || !b?.config)
      return false;
    try {
      if (await this.store.get(KEY + ":rev") === rev)
        return false;
      const r = await this.save(b.config);
      if (!r.ok) {
        console.warn("mises à jour : annonce du serveur invalide —", r.error);
        return false;
      }
      await this.store.set(KEY + ":rev", rev);
      console.log(`mises à jour : annonce « ${rev} » publiée (dernière ${r.config.latestVersion})`);
      return true;
    } catch (e) {
      console.warn("mises à jour : annonce non appliquée", e.message);
      return false;
    }
  }
  statusOf(version, config = this.current) {
    return updateStatus(config, version);
  }
}

class RateLimit2 {
  max;
  windowMs;
  hits = new Map;
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
  }
  allow(key) {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.until < now) {
      if (this.hits.size > 5000)
        this.hits.clear();
      this.hits.set(key, { n: 1, until: now + this.windowMs });
      return true;
    }
    return ++h.n <= this.max;
  }
}
var digest = (s) => createHash3("sha256").update(s).digest();
function adminOk(header, token) {
  if (!token || token.length < 24)
    return false;
  const given = /^Bearer (.+)$/.exec(header ?? "")?.[1] ?? "";
  return timingSafeEqual(digest(given), digest(token));
}
async function readJson(req, max = 32768) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > max)
      throw new Error("trop gros");
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function updateRoutes(svc, adminToken, corsOrigin) {
  const checkLimit = new RateLimit2(30, 60000);
  const adminLimit = new RateLimit2(20, 60000);
  return async (req, res, path, query) => {
    if (path !== "/api/update" && path !== "/api/admin/update")
      return false;
    const headers = { "content-type": "application/json", "cache-control": "no-store" };
    const origin = corsOrigin(req);
    if (origin) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-headers"] = "authorization, content-type";
      headers["access-control-allow-methods"] = "GET, PUT, OPTIONS";
      headers["vary"] = "origin";
    }
    const reply = (status, obj) => {
      res.writeHead(status, headers);
      res.end(JSON.stringify(obj));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(origin ? 204 : 403, headers);
      res.end();
      return true;
    }
    const ip = (req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?").split(",")[0].trim();
    if (path === "/api/update") {
      if (req.method !== "GET")
        return reply(405, { error: "Méthode non autorisée" }), true;
      if (!checkLimit.allow(ip))
        return reply(429, { error: "Trop de requêtes" }), true;
      const v = query.get("v");
      const config = await svc.get();
      const current = isVersion(v) ? v : "";
      reply(200, { status: svc.statusOf(current || null, config), current, config });
      return true;
    }
    if (!adminLimit.allow(ip))
      return reply(429, { error: "Trop de tentatives, réessaie dans une minute." }), true;
    if (!adminOk(req.headers.authorization, adminToken)) {
      reply(adminToken && adminToken.length >= 24 ? 401 : 503, { error: adminToken && adminToken.length >= 24 ? "Clé d'administration incorrecte." : "Administration désactivée : variable ADMIN_TOKEN absente sur le serveur." });
      return true;
    }
    try {
      if (req.method === "GET")
        return reply(200, await svc.get()), true;
      if (req.method === "PUT") {
        const r = await svc.save(await readJson(req));
        if (!r.ok)
          return reply(400, { error: r.error }), true;
        console.log(`mises à jour : configuration enregistrée (dernière ${r.config.latestVersion}, minimum ${r.config.minVersion}, ${r.config.mandatory ? "obligatoire" : "facultative"}, ${r.config.enabled ? "active" : "désactivée"})`);
        return reply(200, r.config), true;
      }
      reply(405, { error: "Méthode non autorisée" });
    } catch (e) {
      reply(400, { error: "Requête invalide (" + e.message + ")." });
    }
    return true;
  };
}

// server/leaderboard.ts
import { createHash as createHash4, randomBytes as randomBytes2, timingSafeEqual as timingSafeEqual2 } from "node:crypto";

// src/core/cosmetics.ts
var ACCESSORIES = [
  { id: "acc-cap", wear: "cap", name: "Casquette", rarity: "common", desc: "Visière vers l'avant, comme un pro." },
  { id: "acc-shades", wear: "shades", name: "Lunettes de soleil", rarity: "common", desc: "Trop cool pour regarder les explosions." },
  { id: "acc-scarf", wear: "scarf", name: "Écharpe", rarity: "common", desc: "Toute douce, elle flotte quand tu cours." },
  { id: "acc-bow", wear: "bow", name: "Gros nœud", rarity: "common", desc: "Mignon. Dangereux." },
  { id: "acc-beanie", wear: "beanie", name: "Bonnet", rarity: "common", desc: "Avec un pompon qui rebondit." },
  { id: "acc-flower", wear: "flower", name: "Fleur", rarity: "common", desc: "Une petite fleur qui tourne au vent." },
  { id: "acc-headphones", wear: "headphones", name: "Casque audio", rarity: "rare", desc: "Le son des bombes, en stéréo." },
  { id: "acc-pirate", wear: "pirate", name: "Tricorne", rarity: "rare", desc: "Le chapeau du capitaine." },
  { id: "acc-lei", wear: "lei", name: "Collier hawaïen", rarity: "rare", desc: "Aloha… BOUM." },
  { id: "acc-tophat", wear: "tophat", name: "Haut-de-forme", rarity: "epic", desc: "Pour exploser avec classe." },
  { id: "acc-horns", wear: "horns", name: "Cornes", rarity: "epic", desc: "Un petit air de démon." },
  { id: "acc-visor", wear: "visor", name: "Visière néon", rarity: "epic", desc: "Elle brille dans le noir." },
  { id: "acc-halo", wear: "halo", name: "Auréole", rarity: "legend", desc: "Un ange… qui pose des bombes." },
  { id: "acc-crown", wear: "crown", name: "Couronne", rarity: "legend", desc: "Réservée aux rois de l'arène." }
];
var TRAILS = [
  { id: "fx-dust", kind: "dust", name: "Poussière", rarity: "common", desc: "Le petit nuage classique.", colors: ["#e8dcc4", "#cbbd9f"], free: true },
  { id: "fx-sparks", kind: "sparks", name: "Étincelles", rarity: "common", desc: "Des étincelles à chaque pas.", colors: ["#ffe066", "#ff9f1c"] },
  { id: "fx-leaves", kind: "leaves", name: "Feuilles", rarity: "common", desc: "Un tourbillon de feuilles.", colors: ["#7bd389", "#3fa34d", "#c9e265"] },
  { id: "fx-bubbles", kind: "bubbles", name: "Bulles", rarity: "rare", desc: "Des bulles de savon qui flottent.", colors: ["#a0e7ff", "#ffffff"] },
  { id: "fx-snow", kind: "snow", name: "Flocons", rarity: "rare", desc: "Il neige sur ton passage.", colors: ["#ffffff", "#cfe8ff"] },
  { id: "fx-hearts", kind: "hearts", name: "Cœurs", rarity: "rare", desc: "Tout le monde t'aime (sauf tes ennemis).", colors: ["#ff5d8f", "#ffb3c6"] },
  { id: "fx-fire", kind: "fire", name: "Flammes", rarity: "epic", desc: "Tes pas laissent des flammèches.", colors: ["#ffcf4a", "#ff6a1f", "#ff2e2e"] },
  { id: "fx-bolts", kind: "bolts", name: "Éclairs", rarity: "epic", desc: "Électrique !", colors: ["#7df9ff", "#ffffff", "#4361ee"] },
  { id: "fx-notes", kind: "notes", name: "Musique", rarity: "epic", desc: "Tu danses en esquivant.", colors: ["#c77dff", "#ffd60a", "#4cc9f0"] },
  { id: "fx-rainbow", kind: "rainbow", name: "Arc-en-ciel", rarity: "legend", desc: "Une traînée arc-en-ciel éclatante.", colors: ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"] },
  { id: "fx-stardust", kind: "stardust", name: "Poussière d'étoiles", rarity: "legend", desc: "Des étoiles filantes te suivent.", colors: ["#fff3b0", "#ffd60a", "#ffffff"] }
];
var EMOTES = [
  { id: "emo-hello", emoji: "\uD83D\uDC4B", name: "Salut !", rarity: "common", anim: "shake", free: true },
  { id: "emo-gg", emoji: "\uD83D\uDC4D", name: "GG", rarity: "common", anim: "bounce", free: true },
  { id: "emo-lol", emoji: "\uD83D\uDE02", name: "MDR", rarity: "common", anim: "bounce" },
  { id: "emo-cool", emoji: "\uD83D\uDE0E", name: "Trop facile", rarity: "common", anim: "pop" },
  { id: "emo-angry", emoji: "\uD83D\uDE21", name: "Grrr !", rarity: "common", anim: "shake" },
  { id: "emo-cry", emoji: "\uD83D\uDE2D", name: "Snif…", rarity: "common", anim: "bounce" },
  { id: "emo-love", emoji: "\uD83D\uDE0D", name: "Trop beau", rarity: "rare", anim: "pop" },
  { id: "emo-bomb", emoji: "\uD83D\uDCA3", name: "Attention !", rarity: "rare", anim: "shake" },
  { id: "emo-ghost", emoji: "\uD83D\uDC7B", name: "Bouh !", rarity: "rare", anim: "spin" },
  { id: "emo-fire", emoji: "\uD83D\uDD25", name: "En feu", rarity: "epic", anim: "bounce" },
  { id: "emo-crown", emoji: "\uD83D\uDC51", name: "Le roi", rarity: "epic", anim: "spin" },
  { id: "emo-party", emoji: "\uD83C\uDF89", name: "La fête !", rarity: "legend", anim: "party" },
  { id: "emo-tongue", emoji: "\uD83D\uDE1C", name: "Nananère !", rarity: "common", anim: "shake", taunt: true },
  { id: "emo-missed", emoji: "\uD83E\uDD2D", name: "Raté !", rarity: "common", anim: "laugh", taunt: true },
  { id: "emo-snail", emoji: "\uD83D\uDC0C", name: "Trop lent !", rarity: "rare", anim: "bounce", taunt: true },
  { id: "emo-clown", emoji: "\uD83E\uDD21", name: "Le clown !", rarity: "rare", anim: "laugh", taunt: true },
  { id: "emo-yawn", emoji: "\uD83E\uDD71", name: "Je m'ennuie…", rarity: "rare", anim: "pop", taunt: true },
  { id: "emo-chicken", emoji: "\uD83D\uDC14", name: "Poule mouillée !", rarity: "epic", anim: "shake", taunt: true },
  { id: "emo-baby", emoji: "\uD83C\uDF7C", name: "Petit joueur", rarity: "epic", anim: "spin", taunt: true },
  { id: "emo-dance", emoji: "\uD83D\uDD7A", name: "Danse de la victoire", rarity: "legend", anim: "dance", taunt: true }
];
var BOOMS = [
  { id: "boom-classic", name: "Classique", rarity: "common", desc: "La bonne vieille explosion orange.", spark: ["#ffe066", "#ff8a2a"], smoke: ["#e9e2d6", "#bdb4a6"], ring: "#ffb347", glow: "#fffbe0", free: true, bomb: { body: ["#5b5f8a", "#1b1c33"], cap: "#8b8fb3" } },
  { id: "boom-confetti", name: "Confettis", rarity: "common", desc: "Boum… et c'est la fête !", spark: ["#ff5d8f", "#ffd60a", "#4cc9f0", "#8ac926"], smoke: ["#fff0f6", "#e8e2ff"], ring: "#ff9ec4", glow: "#ffffff", extra: "confetti", bomb: { body: ["#ffffff", "#ff8ab8"], cap: "#ffd60a", deco: "dots" } },
  { id: "boom-fire", name: "Feu", rarity: "rare", desc: "Une bombe rouge en flammes, et un souffle brûlant.", spark: ["#ffd23f", "#ff6a1f", "#ff2e2e"], smoke: ["#5a2a1a", "#2a1410"], ring: "#ff6a1f", glow: "#fff0c0", bomb: { body: ["#ff8a5a", "#9a1010"], cap: "#ffb020", deco: "flame", aura: "#ff6a1f" } },
  { id: "boom-toxic", name: "Toxique", rarity: "rare", desc: "Un nuage vert qui pique les yeux.", spark: ["#b8ff3a", "#4cd137"], smoke: ["#9be15d", "#5f8f3a"], ring: "#7bff6a", glow: "#eaffd0", extra: "bubbles", bomb: { body: ["#8dff6a", "#1f7a2a"], cap: "#2a3a2a", deco: "skull", aura: "#7bff6a" } },
  { id: "boom-ice", name: "Glace", rarity: "rare", desc: "Une explosion glaciale pleine de flocons.", spark: ["#ffffff", "#9ad7ff"], smoke: ["#e6f4ff", "#b6d4ee"], ring: "#8fd3ff", glow: "#f2fbff", extra: "snow", bomb: { body: ["#e6f7ff", "#2f8fe0"], cap: "#bfe8ff", deco: "ice", aura: "#8fd3ff" } },
  { id: "boom-love", name: "Coup de cœur", rarity: "epic", desc: "Ça explose… d'amour.", spark: ["#ff5d8f", "#ffb3c6"], smoke: ["#ffe0ea", "#ffc2d4"], ring: "#ff5d8f", glow: "#fff0f5", extra: "hearts", bomb: { body: ["#ffc2d4", "#e0306a"], cap: "#ffffff", deco: "hearts" } },
  { id: "boom-neon", name: "Néon", rarity: "epic", desc: "Rose et bleu électrique, comme en boîte.", spark: ["#ff3fb4", "#3ff0ff"], smoke: ["#3a2a5c", "#25204a"], ring: "#ff3fb4", glow: "#d6fbff", bomb: { body: ["#5a3a8f", "#1b1035"], cap: "#3ff0ff", deco: "stripes", aura: "#ff3fb4" } },
  { id: "boom-cosmic", name: "Galaxie", rarity: "legend", desc: "Une bombe-planète et une supernova en miniature.", spark: ["#c77dff", "#ffd60a", "#ffffff"], smoke: ["#2a1b5c", "#4b2a8f"], ring: "#c77dff", glow: "#fff3b0", extra: "stars", bomb: { body: ["#b07dff", "#2a1065"], cap: "#ffd60a", deco: "ring", aura: "#c77dff" } },
  { id: "boom-gold", name: "Pluie d'or", rarity: "legend", desc: "Réservé aux meilleurs : une explosion en or massif.", spark: ["#ffd23f", "#fff4c2", "#c98a10"], smoke: ["#fff1c4", "#e8c56a"], ring: "#ffd23f", glow: "#fffbe0", extra: "stars", exclusive: "rank", bomb: { body: ["#fff1a8", "#c98a10"], cap: "#fff8dc", deco: "stars", aura: "#ffd23f" } },
  { id: "boom-veteran", name: "Vétéran", rarity: "epic", desc: "Pour ceux qui ont joué des centaines de parties.", spark: ["#ff6a1f", "#ffcf4a", "#ffffff"], smoke: ["#5a5a5a", "#3a3a3a"], ring: "#ff6a1f", glow: "#fff0d0", exclusive: "achievement", bomb: { body: ["#7a7a7a", "#2a2a2a"], cap: "#ff6a1f", deco: "stripes" } }
];
var DEFAULT_BOOM = "boom-classic";
var getBoom = (id) => BOOMS.find((b) => b.id === id) ?? BOOMS[0];
var TITLES = [
  { id: "title-rookie", name: "Petit nouveau", rarity: "common", desc: "Tout le monde commence quelque part.", free: true },
  { id: "title-artificer", name: "Artificier", rarity: "rare", desc: "Atteins le niveau 10.", exclusive: "level" },
  { id: "title-veteran", name: "Vétéran", rarity: "epic", desc: "Atteins le niveau 25.", exclusive: "level" },
  { id: "title-legend", name: "Légende de l'arène", rarity: "legend", desc: "Atteins le niveau 50.", exclusive: "level" },
  { id: "title-centurion", name: "Centurion", rarity: "legend", desc: "Atteins le niveau 100.", exclusive: "level" },
  { id: "title-regular", name: "Habitué", rarity: "common", desc: "Joue 100 parties.", exclusive: "achievement" },
  { id: "title-champion", name: "Champion", rarity: "epic", desc: "Gagne 50 parties.", exclusive: "achievement" },
  { id: "title-unbeatable", name: "Invincible", rarity: "legend", desc: "Gagne 200 parties.", exclusive: "achievement" },
  { id: "title-demolisher", name: "Démolisseur", rarity: "rare", desc: "Détruis 5 000 blocs.", exclusive: "achievement" },
  { id: "title-hunter", name: "Chasseur", rarity: "rare", desc: "Élimine 250 adversaires.", exclusive: "achievement" },
  { id: "title-unstoppable", name: "Inarrêtable", rarity: "epic", desc: "Gagne 10 parties d'affilée.", exclusive: "achievement" },
  { id: "title-expert", name: "Expert", rarity: "epic", desc: "Gagne 10 parties en Expert.", exclusive: "achievement" },
  { id: "title-collector", name: "Collectionneur", rarity: "epic", desc: "Possède 60 objets.", exclusive: "achievement" },
  { id: "title-jack", name: "Touche-à-tout", rarity: "rare", desc: "Joue avec les 7 personnages.", exclusive: "achievement" },
  { id: "title-elite", name: "Élite", rarity: "legend", desc: "Atteins le rang Élite.", exclusive: "rank" },
  { id: "title-diamond", name: "Diamant brut", rarity: "epic", desc: "Atteins le rang Diamant.", exclusive: "rank" },
  { id: "title-lucky", name: "Chanceux", rarity: "rare", desc: "Trouvé uniquement dans les coffres.", exclusive: "chest" },
  { id: "title-boom", name: "Boum Boum", rarity: "common", desc: "Trouvé uniquement dans les coffres.", exclusive: "chest" },
  { id: "title-chaos", name: "Agent du chaos", rarity: "epic", desc: "Trouvé uniquement dans les coffres.", exclusive: "chest" },
  { id: "title-king", name: "Roi de la mèche", rarity: "legend", desc: "Trouvé uniquement dans les coffres.", exclusive: "chest" },
  ...CHARACTERS.flatMap((c) => [
    { id: `title-m10-${c.id}`, name: `${c.name} confirmé`, rarity: "rare", desc: `Maîtrise ${c.name} niveau 10.`, exclusive: "mastery" },
    { id: `title-m20-${c.id}`, name: `As de ${c.name}`, rarity: "epic", desc: `Maîtrise ${c.name} niveau 20.`, exclusive: "mastery" },
    { id: `title-m50-${c.id}`, name: `Maître ${c.name}`, rarity: "legend", desc: `Maîtrise ${c.name} niveau 50.`, exclusive: "mastery" }
  ])
];
var DEFAULT_TITLE = "title-rookie";
var getTitle = (id) => TITLES.find((t) => t.id === id);
var getTrail = (id) => TRAILS.find((t) => t.id === id) ?? TRAILS[0];
var getEmote = (id) => EMOTES.find((e) => e.id === id);
var DEFAULT_TRAIL = "fx-dust";
var DEFAULT_EMOTES = ["emo-hello", "emo-gg"];
var EMOTE_SLOTS = 4;

// src/meta/economy.ts
var PRICES = {
  common: 500,
  rare: 1500,
  epic: 3000,
  legend: 5000
};
var EMOTE_PRICES = {
  common: 250,
  rare: 600,
  epic: 1200,
  legend: 2500
};
var CHARACTER_PRICES = {
  pingo: 4000
};
var BOMBER_PRICES = {
  common: 50,
  rare: 150,
  epic: 300,
  legend: 500
};
var BOMBER_EMOTE_PRICES = {
  common: 25,
  rare: 60,
  epic: 120,
  legend: 250
};
var BOMBER_CHARACTER_PRICES = {
  pingo: 400
};
var PLACE_COLUMNS = {
  2: [1, 4],
  3: [1, 2, 4],
  4: [1, 2, 3, 4]
};
var DRAW_COLUMN = 2;

// src/meta/catalog.ts
function build() {
  const out = [];
  for (const s of SKINS)
    out.push({
      id: s.id,
      kind: "skin",
      name: s.name,
      rarity: s.rarity,
      price: s.free || s.exclusive ? 0 : s.price ?? PRICES[s.rarity],
      desc: s.desc ?? "",
      free: !!s.free,
      characterId: s.characterId,
      theme: s.theme,
      exclusive: s.exclusive
    });
  for (const a of ACCESSORIES)
    out.push({ id: a.id, kind: "accessory", name: a.name, rarity: a.rarity, price: PRICES[a.rarity], desc: a.desc, free: false });
  for (const t of TRAILS)
    out.push({ id: t.id, kind: "trail", name: t.name, rarity: t.rarity, price: t.free ? 0 : PRICES[t.rarity], desc: t.desc, free: !!t.free });
  for (const e of EMOTES)
    out.push({ id: e.id, kind: "emote", name: e.name, rarity: e.rarity, price: e.free ? 0 : EMOTE_PRICES[e.rarity], desc: e.taunt ? `Moquerie ${e.emoji} « ${e.name} »` : `Emote ${e.emoji}`, free: !!e.free });
  for (const b of BOOMS)
    out.push({ id: b.id, kind: "boom", name: b.name, rarity: b.rarity, price: b.free || b.exclusive ? 0 : PRICES[b.rarity], desc: b.desc, free: !!b.free, exclusive: b.exclusive });
  for (const t of TITLES)
    out.push({ id: t.id, kind: "title", name: t.name, rarity: t.rarity, price: 0, desc: t.desc, free: !!t.free, exclusive: t.exclusive ?? (t.free ? undefined : "chest") });
  for (const c of CHARACTERS)
    out.push({
      id: `chr-${c.id}`,
      kind: "character",
      name: c.name,
      rarity: c.rarity ?? "common",
      price: c.locked ? CHARACTER_PRICES[c.id] ?? PRICES.epic : 0,
      desc: c.bio,
      free: !c.locked,
      characterId: c.id
    });
  return out;
}
function withBomberPrice(it) {
  let bomberPrice = 0;
  if (it.price > 0) {
    const table = it.kind === "emote" ? BOMBER_EMOTE_PRICES : BOMBER_PRICES;
    const standard = it.kind === "emote" ? EMOTE_PRICES[it.rarity] : PRICES[it.rarity];
    if (it.kind === "character")
      bomberPrice = BOMBER_CHARACTER_PRICES[it.characterId] ?? Math.round(it.price / 10);
    else
      bomberPrice = it.price === standard ? table[it.rarity] : Math.max(5, Math.round(it.price / 50) * 5);
  }
  return { ...it, bomberPrice };
}
var CATALOG = build().map(withBomberPrice);
var byId = new Map(CATALOG.map((i) => [i.id, i]));
function getItem(id) {
  return id ? byId.get(id) : undefined;
}

// src/meta/progress-config.ts
var LEVEL_MAX = 100;
function levelXp(level) {
  const k = level - 1;
  return Math.round((100 + 20 * k + 0.9 * k * k) / 5) * 5;
}
var MASTERY_MAX = 50;
function masteryXp(level) {
  const k = level - 1;
  return Math.round((60 + 8 * k + 0.35 * k * k) / 5) * 5;
}
var CHEST_ORDER = ["common", "rare", "epic", "legend"];
var RANKS = [
  { id: "bronze", name: "Bronze", icon: "\uD83E\uDD49", color: "#d08a4c", min: 0, reward: [] },
  { id: "argent", name: "Argent", icon: "\uD83E\uDD48", color: "#c9d6e3", min: 200, reward: [{ kind: "chest", tier: "rare" }] },
  { id: "or", name: "Or", icon: "\uD83E\uDD47", color: "#ffd23f", min: 450, reward: [{ kind: "chest", tier: "rare" }, { kind: "coins", amount: 300 }] },
  { id: "platine", name: "Platine", icon: "\uD83D\uDCA0", color: "#5fe0d0", min: 800, reward: [{ kind: "chest", tier: "epic" }] },
  { id: "diamant", name: "Diamant", icon: "\uD83D\uDC8E", color: "#7cc7ff", min: 1200, reward: [{ kind: "item", id: "title-diamond" }, { kind: "chest", tier: "epic" }] },
  { id: "elite", name: "Élite", icon: "\uD83D\uDC51", color: "#ff5fa2", min: 1700, reward: [{ kind: "item", id: "title-elite" }, { kind: "item", id: "boom-gold" }, { kind: "chest", tier: "legend" }] }
];
var RANK_RULES = {
  places: [20, 10, -10, -20],
  team: { win: 15, loss: -15, draw: 0 },
  softUnder: 100,
  softFactor: 0.5,
  divisions: 3,
  lastSpan: 450,
  stepRewards: [
    [],
    [{ kind: "coins", amount: 100 }],
    [{ kind: "coins", amount: 150 }, { kind: "xp", amount: 100 }],
    [{ kind: "chest", tier: "rare" }],
    [{ kind: "coins", amount: 250 }],
    [{ kind: "chest", tier: "rare" }, { kind: "coins", amount: 150 }],
    [{ kind: "chest", tier: "rare" }, { kind: "coins", amount: 300 }],
    [{ kind: "coins", amount: 400 }, { kind: "bombers", amount: 5 }],
    [{ kind: "chest", tier: "epic" }],
    [{ kind: "chest", tier: "epic" }, { kind: "coins", amount: 300 }],
    [{ kind: "coins", amount: 600 }, { kind: "bombers", amount: 10 }],
    [{ kind: "chest", tier: "epic" }, { kind: "coins", amount: 500 }],
    [{ kind: "item", id: "title-diamond" }, { kind: "chest", tier: "epic" }],
    [{ kind: "coins", amount: 800 }, { kind: "bombers", amount: 15 }],
    [{ kind: "chest", tier: "legend" }],
    [{ kind: "item", id: "title-elite" }, { kind: "item", id: "boom-gold" }, { kind: "chest", tier: "legend" }],
    [{ kind: "coins", amount: 1500 }, { kind: "bombers", amount: 25 }],
    [{ kind: "chest", tier: "legend", count: 2 }, { kind: "coins", amount: 2000 }]
  ],
  seasonEndCoins: 60,
  modes: ["classic", "chaos", "koth"],
  teamModes: ["koth"],
  bots: 3,
  botsByStep: [
    "eee",
    "eee",
    "een",
    "enn",
    "nnn",
    "nnh",
    "nhh",
    "hhh",
    "hhx",
    "hxx",
    "xxx"
  ],
  historySize: 15,
  season: 2
};
var A = (id, icon, name, desc, stat, goal, ...reward) => ({ id, icon, name, desc, stat, goal, reward });
var C = (amount) => ({ kind: "coins", amount });
var CH = (tier) => ({ kind: "chest", tier });
var IT = (id) => ({ kind: "item", id });
var ACHIEVEMENTS = [
  A("first-game", "\uD83C\uDFAE", "Premier pas", "Joue ta première partie", "played", 1, C(50)),
  A("played-25", "\uD83C\uDFAE", "On y prend goût", "Joue {n} parties", "played", 25, C(200)),
  A("played-100", "\uD83C\uDFAE", "Habitué", "Joue {n} parties", "played", 100, IT("title-regular"), C(400)),
  A("played-500", "\uD83C\uDFAE", "Pilier de l'arène", "Joue {n} parties", "played", 500, IT("boom-veteran"), CH("epic")),
  A("first-win", "\uD83C\uDFC6", "Première victoire", "Gagne ta première partie", "wins", 1, C(100)),
  A("wins-10", "\uD83C\uDFC6", "Gagnant", "Gagne {n} parties", "wins", 10, C(250)),
  A("wins-50", "\uD83C\uDFC6", "Champion", "Gagne {n} parties", "wins", 50, IT("title-champion"), CH("rare")),
  A("wins-200", "\uD83C\uDFC6", "Invincible", "Gagne {n} parties", "wins", 200, IT("title-unbeatable"), CH("legend")),
  A("kills-25", "\uD83D\uDCA5", "Pas de pitié", "Élimine {n} adversaires", "kills", 25, C(150)),
  A("kills-250", "\uD83D\uDCA5", "Chasseur", "Élimine {n} adversaires", "kills", 250, IT("title-hunter"), CH("rare")),
  A("blocks-500", "\uD83E\uDDF1", "Bûcheron", "Détruis {n} blocs", "blocks", 500, C(150)),
  A("blocks-5000", "\uD83E\uDDF1", "Démolisseur", "Détruis {n} blocs", "blocks", 5000, IT("title-demolisher"), CH("rare")),
  A("bombs-1000", "\uD83D\uDCA3", "Artificier fou", "Pose {n} bombes", "bombs", 1000, CH("rare")),
  A("bonus-200", "⭐", "Ramasse-tout", "Ramasse {n} bonus", "bonuses", 200, C(250)),
  A("streak-3", "\uD83D\uDD25", "En forme", "Gagne {n} parties d'affilée", "bestStreak", 3, C(100)),
  A("streak-5", "\uD83D\uDD25", "En feu", "Gagne {n} parties d'affilée", "bestStreak", 5, CH("rare")),
  A("streak-10", "\uD83D\uDD25", "Inarrêtable", "Gagne {n} parties d'affilée", "bestStreak", 10, IT("title-unstoppable"), CH("epic")),
  A("level-10", "⬆️", "Niveau 10", "Atteins le niveau {n}", "level", 10, C(200)),
  A("level-25", "⬆️", "Niveau 25", "Atteins le niveau {n}", "level", 25, CH("epic")),
  A("level-50", "⬆️", "Niveau 50", "Atteins le niveau {n}", "level", 50, CH("legend")),
  A("mastery-10", "\uD83C\uDF96️", "Spécialiste", "Monte un personnage au niveau de maîtrise {n}", "bestMastery", 10, C(300)),
  A("mastery-30", "\uD83C\uDF96️", "Virtuose", "Monte un personnage au niveau de maîtrise {n}", "bestMastery", 30, CH("epic")),
  A("chars-7", "\uD83E\uDDD1‍\uD83E\uDD1D‍\uD83E\uDDD1", "Touche-à-tout", "Joue avec {n} personnages différents", "charsPlayed", 7, IT("title-jack"), C(300)),
  A("owned-25", "\uD83C\uDF92", "Garde-robe", "Possède {n} objets", "owned", 25, C(300)),
  A("owned-60", "\uD83C\uDF92", "Collectionneur", "Possède {n} objets", "owned", 60, IT("title-collector"), CH("epic")),
  A("chests-10", "\uD83C\uDF81", "Chasseur de trésors", "Ouvre {n} coffres", "chests", 10, CH("rare")),
  A("missions-20", "\uD83C\uDFAF", "Appliqué", "Récupère {n} missions", "missions", 20, C(400)),
  A("expert-1", "\uD83D\uDC80", "Sans peur", "Gagne une partie en Expert", "expertWins", 1, C(300)),
  A("expert-10", "\uD83D\uDC80", "Expert", "Gagne {n} parties en Expert", "expertWins", 10, IT("title-expert"), CH("epic")),
  A("chaos-10", "\uD83C\uDF2A️", "Amateur de chaos", "Joue {n} parties en mode Chaos", "chaos", 10, C(250)),
  A("online-5", "\uD83C\uDF10", "Entre amis", "Joue {n} parties privées en ligne", "online", 5, C(250)),
  A("rank-or", "\uD83E\uDD47", "Doré", "Atteins le rang Or", "rank", 2, C(300)),
  A("rank-diamant", "\uD83D\uDC8E", "Brillant", "Atteins le rang Diamant", "rank", 4, CH("epic")),
  A("login-7", "\uD83D\uDCC5", "Fidèle", "Connecte-toi {n} jours", "loginDays", 7, C(200)),
  A("login-30", "\uD83D\uDCC5", "Inséparable", "Connecte-toi {n} jours", "loginDays", 30, CH("epic")),
  A("rich", "\uD83E\uDE99", "Fortune", "Gagne {n} pièces au total", "coinsEarned", 20000, CH("rare"))
];

// src/meta/rank.ts
function rankIndex(points) {
  let i = 0;
  for (let k = 0;k < RANKS.length; k++)
    if (points >= RANKS[k].min)
      i = k;
  return i;
}
var ROMAN = ["I", "II", "III", "IV", "V"];
var STEPS = RANKS.flatMap((r, li) => {
  const span = (RANKS[li + 1]?.min ?? r.min + RANK_RULES.lastSpan) - r.min;
  return Array.from({ length: RANK_RULES.divisions }, (_, d) => ({
    index: li * RANK_RULES.divisions + d,
    league: li,
    div: d + 1,
    id: d === 0 ? r.id : `${r.id}-${d + 1}`,
    name: `${r.name} ${ROMAN[d]}`,
    min: r.min + Math.round(span * d / RANK_RULES.divisions / 10) * 10,
    rank: r,
    reward: RANK_RULES.stepRewards[li * RANK_RULES.divisions + d] ?? []
  }));
});
function stepIndex(points) {
  let i = 0;
  for (let k = 0;k < STEPS.length; k++)
    if (points >= STEPS[k].min)
      i = k;
  return i;
}
var isTeamMode = (modeId) => RANK_RULES.teamModes.includes(modeId ?? "");
function trophyDelta(column, points, modeId, draw = false) {
  const c = Math.min(4, Math.max(1, Math.round(column)));
  let d;
  if (isTeamMode(modeId))
    d = draw ? RANK_RULES.team.draw : c === 1 ? RANK_RULES.team.win : RANK_RULES.team.loss;
  else
    d = RANK_RULES.places[c - 1];
  if (d < 0 && points < RANK_RULES.softUnder)
    d = -Math.round(-d * RANK_RULES.softFactor);
  return Math.max(-points, d);
}
var LETTER = { e: "easy", n: "normal", h: "hard", x: "expert" };
function compBots(points) {
  const t = RANK_RULES.botsByStep;
  const row = t[Math.min(stepIndex(points), t.length - 1)];
  return [...row].slice(0, RANK_RULES.bots).map((c) => LETTER[c] ?? "normal");
}
function compMode(rand = Math.random) {
  const m = RANK_RULES.modes;
  return m[Math.min(m.length - 1, Math.floor(rand() * m.length))];
}
var seasonId = (now = Date.now()) => new Date(now).toISOString().slice(0, 7);
function seasonEnd(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

// src/meta/rewards.ts
function columnOf(pl) {
  const n = Math.max(2, pl.players);
  if (pl.draw)
    return DRAW_COLUMN;
  if (pl.abandon)
    return 4;
  const place = Math.min(Math.max(1, Math.round(pl.place)), n);
  const table = PLACE_COLUMNS[n];
  if (table)
    return table[place - 1];
  if (place === 1)
    return 1;
  if (place === n)
    return 4;
  return place <= n / 2 ? 2 : 3;
}

// src/net/replay.ts
var Q = 32;
var RANKED_MODES = ["classic", "chaos", "koth"];
var DIFFICULTIES = ["easy", "normal", "hard", "expert"];
var MAX_TICKS = 60 * 60 * 8;
function checkSpec(s, expect) {
  if (!s || typeof s !== "object")
    return "partie illisible";
  if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed > 2 ** 31)
    return "graine";
  if (!RANKED_MODES.includes(s.modeId) || !MODES.some((m) => m.id === s.modeId && !m.hidden))
    return "mode";
  const map = MAPS.find((m) => m.id === s.mapId);
  if (!map || !mapAllows(map, s.modeId))
    return "carte";
  const ps = s.players;
  if (!Array.isArray(ps) || ps.length < 2 || ps.length > 4)
    return "joueurs";
  if (s.modeId === "koth" && ps.length !== 4)
    return "joueurs";
  const ids = new Set;
  for (let i = 0;i < ps.length; i++) {
    const p = ps[i];
    if (!p || !CHARACTERS.some((c) => c.id === p.characterId) || ids.has(p.characterId))
      return "personnages";
    ids.add(p.characterId);
    if (p.isBot !== i > 0)
      return "joueurs";
    if (i > 0 && !DIFFICULTIES.includes(p.difficulty))
      return "difficulté";
  }
  if (expect) {
    if (expect.modeId !== s.modeId)
      return "mode";
    if (expect.bots.length !== ps.length - 1)
      return "joueurs";
    for (let i = 1;i < ps.length; i++)
      if (ps[i].difficulty !== expect.bots[i - 1])
        return "difficulté";
  }
  return null;
}
function specSlots(s) {
  return s.players.map((p) => ({ name: p.isBot ? "bot" : "joueur", characterId: p.characterId, isBot: p.isBot, difficulty: p.isBot ? p.difficulty : undefined }));
}
function outcomeOf(m, me) {
  const st = m.standings();
  const place = st.find((r) => r.id === me)?.place ?? m.players.length;
  const won = m.phase === "over" && m.winnerId >= 0 && (m.winnerId === me || m.sameTeam(m.winnerId, me));
  return { place, players: m.players.length, won, draw: place === 1 && !won };
}

class Replay {
  log;
  match;
  bots = [];
  i = 0;
  left = 0;
  cmd = { mx: 0, my: 0, bomb: false, ability: false };
  ticks = 0;
  error = null;
  constructor(spec, log) {
    this.log = log;
    const players = specSlots(spec);
    this.match = new Match({ seed: spec.seed, map: getMap(spec.mapId), modeId: spec.modeId, players });
    players.forEach((p, i) => {
      if (p.isBot)
        this.bots.push(new BotBrain(i, p.difficulty ?? "normal", spec.seed + i));
    });
    if (!Array.isArray(log) || log.length % 4 !== 0 || log.length > 4 * MAX_TICKS)
      this.error = "journal";
    else {
      let total = 0;
      for (let k = 0;k < log.length; k += 4) {
        const [n, x, y, f] = [log[k], log[k + 1], log[k + 2], log[k + 3]];
        if (![n, x, y, f].every(Number.isInteger) || n < 1 || n > 65535 || Math.abs(x) > Q || Math.abs(y) > Q || f < 0 || f > 15) {
          this.error = "journal";
          break;
        }
        total += n;
      }
      if (total > MAX_TICKS)
        this.error = "partie trop longue";
    }
  }
  run(maxSteps) {
    if (this.error)
      return { complete: false, place: this.match.players.length, players: this.match.players.length, won: false, draw: false, ticks: this.ticks };
    const m = this.match;
    for (let s = 0;s < maxSteps; s++) {
      if (this.left === 0) {
        if (this.i >= this.log.length)
          return this.finish();
        const L = this.log;
        this.left = L[this.i];
        const f = L[this.i + 3];
        this.cmd = { mx: L[this.i + 1] / Q, my: L[this.i + 2] / Q, bomb: !!(f & 1), ability: !!(f & 2), throw: !!(f & 4), remote: !!(f & 8) };
        this.i += 4;
      }
      this.left--;
      const inputs = m.players.map(() => ({ mx: 0, my: 0, bomb: false, ability: false }));
      inputs[0] = this.cmd;
      for (const b of this.bots)
        inputs[b.playerId] = b.update(m, DT);
      m.step(inputs);
      this.ticks++;
    }
    return null;
  }
  finish() {
    const m = this.match;
    const me = m.players[0];
    const complete = !me.alive && !m.hill || m.phase === "over";
    return { complete, ticks: this.ticks, ...outcomeOf(m, 0) };
  }
}

// server/leaderboard.ts
var KEY2 = "lb:v2";
function weekOf(t) {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}
function weekEnd(t) {
  return Date.parse(weekOf(t) + "T00:00:00Z") + 7 * 86400000;
}
var sha2 = (s) => createHash4("sha256").update(s).digest("hex").slice(0, 40);
var sameHash = (a, b) => a.length === b.length && timingSafeEqual2(Buffer.from(a), Buffer.from(b));
var cleanLbName = (n) => String(n ?? "").replace(/[<>&"'`\u0000-\u001f​-‏‪-‮]/g, "").replace(/\s+/g, " ").trim().slice(0, 16) || "Joueur";
var ABANDON_AFTER_MS = 20000;
var CLOCK_SLACK_MS = 4000;

class LeaderboardService {
  store;
  now;
  chunk;
  doc = { v: 1, players: {} };
  loading = null;
  loaded = false;
  saveTimer = null;
  queue = [];
  busy = false;
  sorted = { all: null, week: null, wk: "" };
  constructor(store = new MemoryStore, now = Date.now, chunk = 1500) {
    this.store = store;
    this.now = now;
    this.chunk = chunk;
  }
  async ready() {
    if (this.loaded)
      return;
    this.loading ??= (async () => {
      try {
        const raw = await this.store.get(KEY2);
        if (raw) {
          const d = JSON.parse(raw);
          if (d && d.v === 1 && d.players && typeof d.players === "object")
            this.doc = d;
        }
      } catch (e) {
        console.warn("classement : lecture impossible", e.message);
      }
      this.loaded = true;
    })();
    await this.loading;
  }
  touch() {
    this.sorted.all = this.sorted.week = null;
    if (this.saveTimer)
      return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 1500);
  }
  async flush() {
    if (this.saveTimer)
      clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      await this.store.set(KEY2, JSON.stringify(this.doc));
    } catch (e) {
      console.warn("classement : écriture impossible", e.message);
    }
  }
  rollWeek() {
    const month = seasonId(this.now());
    if (this.doc.month !== month) {
      if (this.doc.month)
        for (const p of Object.values(this.doc.players))
          p.p = 0;
      this.doc.month = month;
      this.touch();
    }
    const prev = weekOf(this.now() - 7 * 86400000);
    if (this.doc.last?.week === prev)
      return;
    const top = Object.entries(this.doc.players).filter(([, p]) => !p.x && p.wk === prev && p.w > 0).sort((a, b) => b[1].w - a[1].w || a[1].s - b[1].s).slice(0, 10).map(([id]) => id);
    this.doc.last = { week: prev, top };
    this.touch();
  }
  player(id, secret) {
    if (typeof id !== "string" || typeof secret !== "string" || secret.length > 80)
      return null;
    const p = this.doc.players[id];
    return p && sameHash(p.h, sha2(secret)) ? p : null;
  }
  create(name) {
    let id;
    do
      id = randomBytes2(6).toString("base64url");
    while (this.doc.players[id]);
    const secret = randomBytes2(24).toString("base64url");
    const t = this.now();
    const p = { n: name, h: sha2(secret), p: 0, w: 0, wk: weekOf(t), g: 0, v: 0, c: t, s: t };
    this.doc.players[id] = p;
    return { id, secret, p };
  }
  score(p, column, mode, won, draw = false) {
    const wk = weekOf(this.now());
    if (p.wk !== wk) {
      p.wk = wk;
      p.w = 0;
    }
    const delta = trophyDelta(column, p.p, mode, draw);
    const before = p.p;
    p.p = Math.max(0, p.p + delta);
    p.w = Math.max(0, p.w + delta);
    p.g++;
    if (won)
      p.v++;
    p.s = this.now();
    this.touch();
    return p.p - before;
  }
  settleOpen(p) {
    const t = p.t;
    if (!t)
      return;
    p.t = null;
    if (this.now() - t.at < ABANDON_AFTER_MS)
      return;
    this.score(p, 4, t.mode, false);
  }
  async ticket(b, canCreate) {
    await this.ready();
    this.rollWeek();
    if (b.comp !== 2)
      return { error: "Mets le jeu à jour pour jouer en Compétition.", status: 400 };
    let id = typeof b.id === "string" ? b.id : "";
    let secret;
    let p = this.player(b.id, b.secret);
    if (!p) {
      if (!canCreate())
        return { error: "Trop de nouveaux joueurs depuis cette adresse.", status: 429 };
      const c = this.create(cleanLbName(b.name));
      ({ id, secret, p } = c);
    }
    p.n = cleanLbName(b.name ?? p.n);
    this.settleOpen(p);
    const local = Math.max(0, Math.min(1e5, Math.floor(Number(b.pts) || 0)));
    const t = { id: randomBytes2(8).toString("base64url"), seed: randomBytes2(4).readUInt32BE(0) >>> 1, at: this.now(), mode: compMode(() => randomBytes2(4).readUInt32BE(0) / 2 ** 32), bots: compBots(Math.max(p.p, local)) };
    p.t = t;
    p.s = this.now();
    this.touch();
    return { id, secret, ticket: t.id, seed: t.seed, modeId: t.mode, bots: t.bots, points: p.p };
  }
  async cancel(b) {
    await this.ready();
    const p = this.player(b.id, b.secret);
    if (p?.t && p.t.id === b.ticket && this.now() - p.t.at < 90000) {
      p.t = null;
      this.touch();
    }
    return { ok: true };
  }
  async submit(b) {
    await this.ready();
    this.rollWeek();
    const p = this.player(b.id, b.secret);
    if (!p)
      return { ok: false, error: "joueur inconnu", status: 401 };
    const t = p.t;
    if (!t || t.id !== b.ticket)
      return { ok: false, error: "ticket inconnu ou déjà utilisé", status: 409 };
    const spec = b.spec;
    const bad = checkSpec(spec, { modeId: t.mode, bots: t.bots });
    if (bad || spec.seed !== t.seed) {
      p.t = null;
      this.score(p, 4, t.mode, false);
      return { ok: false, error: "partie invalide (" + (bad ?? "graine") + ")", status: 400 };
    }
    if (this.queue.length > 40)
      return { ok: false, error: "serveur occupé, réessaie plus tard", status: 503 };
    p.t = null;
    this.touch();
    const out = await this.enqueue(spec, Array.isArray(b.log) ? b.log : []);
    const elapsed = this.now() - t.at;
    let pl;
    let won = false;
    let note;
    if (!out.complete) {
      pl = { place: out.players, players: out.players, abandon: true };
      note = "partie incomplète : comptée comme abandon";
    } else if (out.ticks * DT * 1000 > elapsed + CLOCK_SLACK_MS) {
      pl = { place: out.players, players: out.players, abandon: true };
      note = "partie envoyée trop vite : refusée";
    } else {
      pl = { place: out.won ? 1 : Math.max(1, out.place), players: out.players, draw: out.draw };
      won = out.won;
    }
    if (b.name !== undefined)
      p.n = cleanLbName(b.name);
    const delta = this.score(p, columnOf(pl), t.mode, won, !!pl.draw);
    return { ok: true, delta, points: p.p, week: p.w, place: pl.abandon ? null : pl.place, draw: !!pl.draw, note, pos: this.position(b.id, "all"), weekPos: this.position(b.id, "week") };
  }
  enqueue(spec, log) {
    return new Promise((resolve) => {
      this.queue.push(async () => {
        const r = new Replay(spec, log);
        let out = null;
        while (!(out = r.run(this.chunk)))
          await new Promise((ok) => setImmediate(ok));
        resolve(out);
      });
      this.drain();
    });
  }
  async drain() {
    if (this.busy)
      return;
    this.busy = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      try {
        await job();
      } catch (e) {
        console.warn("classement : rejeu impossible", e.message);
      }
    }
    this.busy = false;
  }
  ranking(board) {
    const wk = weekOf(this.now());
    if (this.sorted.wk !== wk)
      this.sorted = { all: null, week: null, wk };
    const cached = this.sorted[board];
    if (cached)
      return cached;
    const P = this.doc.players;
    const ids = board === "all" ? Object.keys(P).filter((id) => !P[id].x && P[id].p > 0).sort((a, b) => P[b].p - P[a].p || P[a].s - P[b].s) : Object.keys(P).filter((id) => !P[id].x && P[id].wk === wk && P[id].w > 0).sort((a, b) => P[b].w - P[a].w || P[a].s - P[b].s);
    this.sorted[board] = ids;
    return ids;
  }
  position(id, board) {
    const i = this.ranking(board).indexOf(id);
    return i < 0 ? null : i + 1;
  }
  async top(board, id, limit) {
    await this.ready();
    this.rollWeek();
    const P = this.doc.players;
    const ids = this.ranking(board);
    const pts = (pid) => board === "all" ? P[pid].p : P[pid].w;
    const entries = ids.slice(0, limit).map((pid) => ({ n: P[pid].n, p: pts(pid), r: rankIndex(P[pid].p), ...pid === id ? { me: true } : {} }));
    const me = id && P[id] ? { pos: this.position(id, board), p: board === "all" ? P[id].p : P[id].wk === weekOf(this.now()) ? P[id].w : 0, r: rankIndex(P[id].p), n: P[id].n } : null;
    const last = this.doc.last;
    const lastPos = id && last ? last.top.indexOf(id) : -1;
    return {
      board,
      entries,
      total: ids.length,
      me,
      weekEnds: weekEnd(this.now()),
      seasonEnds: seasonEnd(this.now()),
      last: last ? { week: last.week, pos: lastPos >= 0 ? lastPos + 1 : null } : null
    };
  }
  async hide(id, hidden) {
    await this.ready();
    const p = this.doc.players[id];
    if (!p)
      return false;
    if (hidden)
      p.x = 1;
    else
      delete p.x;
    this.touch();
    return true;
  }
}

class Limit {
  max;
  windowMs;
  hits = new Map;
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
  }
  allow(key) {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || now - h.t > this.windowMs) {
      this.hits.set(key, { n: 1, t: now });
      if (this.hits.size > 1e4)
        this.hits.clear();
      return true;
    }
    return ++h.n <= this.max;
  }
}
async function readJson2(req, max) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > max)
      throw new Error("trop gros");
    chunks.push(c);
  }
  const v = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  return v && typeof v === "object" ? v : {};
}
function leaderboardRoutes(svc, adminToken, corsOrigin) {
  const ticketLimit = new Limit(40, 60000);
  const createLimit = new Limit(12, 86400000);
  const submitLimit = new Limit(40, 60000);
  const readLimit = new Limit(60, 60000);
  return async (req, res, path, query) => {
    if (!path.startsWith("/api/lb/") && path !== "/api/admin/lb/hide")
      return false;
    const headers = { "content-type": "application/json", "cache-control": "no-store" };
    const origin = corsOrigin(req);
    if (origin) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-headers"] = "authorization, content-type";
      headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
      headers["vary"] = "origin";
    }
    const reply = (status, obj) => {
      res.writeHead(status, headers);
      res.end(JSON.stringify(obj));
      return true;
    };
    if (req.method === "OPTIONS") {
      res.writeHead(origin ? 204 : 403, headers);
      res.end();
      return true;
    }
    const ip = (req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?").split(",")[0].trim();
    try {
      if (path === "/api/lb/top" && req.method === "GET") {
        if (!readLimit.allow(ip))
          return reply(429, { error: "Trop de requêtes" });
        const board = query.get("board") === "all" ? "all" : "week";
        const limit = Math.max(1, Math.min(100, Number(query.get("limit")) || 50));
        return reply(200, await svc.top(board, query.get("id"), limit));
      }
      if (path === "/api/lb/ticket" && req.method === "POST") {
        if (!ticketLimit.allow(ip))
          return reply(429, { error: "Trop de requêtes" });
        const r = await svc.ticket(await readJson2(req, 4096), () => createLimit.allow(ip));
        return "error" in r ? reply(r.status ?? 400, { error: r.error }) : reply(200, r);
      }
      if (path === "/api/lb/cancel" && req.method === "POST")
        return reply(200, await svc.cancel(await readJson2(req, 4096)));
      if (path === "/api/lb/submit" && req.method === "POST") {
        if (!submitLimit.allow(ip))
          return reply(429, { error: "Trop de requêtes" });
        const r = await svc.submit(await readJson2(req, 1200000));
        return reply(r.ok ? 200 : r.status ?? 400, r);
      }
      if (path === "/api/admin/lb/hide" && req.method === "POST") {
        if (!adminOk(req.headers.authorization, adminToken))
          return reply(401, { error: "Clé d'administration incorrecte." });
        const b = await readJson2(req, 4096);
        return reply(200, { ok: await svc.hide(String(b.id ?? ""), b.hidden !== false) });
      }
      return reply(404, { error: "Introuvable" });
    } catch (e) {
      return reply(400, { error: "Requête invalide (" + e.message + ")." });
    }
  };
}
// server/announce.json
var announce_default = {
  rev: "2026-11-09-v1.12.1",
  config: {
    enabled: true,
    latestVersion: "1.12.1",
    minVersion: "1.0.0",
    mandatory: false,
    title: "Nouvelle mise à jour !",
    description: "La version 1.12.1 de Bombe Rush est disponible sur le Play Store.",
    notes: [
      { kind: "new", text: "Tutoriel pour les nouveaux joueurs, avec un terrain d'entraînement." },
      { kind: "fix", text: "Vidéos récompensées réparées : tu peux de nouveau gagner des pièces en regardant une vidéo." },
      { kind: "improve", text: "Bots plus malins (surtout en Domination) et niveaux de difficulté rééquilibrés." },
      { kind: "improve", text: "Menus mieux affichés sur tous les écrans." }
    ],
    storeUrl: "https://play.google.com/store/apps/details?id=com.bomberush.game",
    push: null
  }
};

// src/meta/profile.ts
var DEFAULT_CHARACTERS = ["renard", "boulon", "rainette", "kage", "champi", "bruno"];
function defaultProfile() {
  return {
    version: 3,
    name: "Joueur",
    named: false,
    level: 1,
    xp: 0,
    coins: 0,
    coinsEarned: 0,
    bombers: 0,
    bomberGift: false,
    purchases: [],
    wins: 0,
    losses: 0,
    played: 0,
    kills: 0,
    bombsPlaced: 0,
    blocksDestroyed: 0,
    bonusesPicked: 0,
    bestSurvival: 0,
    characterId: "renard",
    equippedSkins: {},
    equipped: { accessory: null, trail: DEFAULT_TRAIL, emotes: [...DEFAULT_EMOTES], boom: DEFAULT_BOOM, title: DEFAULT_TITLE },
    owned: [],
    ownedCharacters: [...DEFAULT_CHARACTERS],
    daily: { last: null, streak: 0 },
    missions: { day: "", list: [] },
    weekly: { week: "", list: [] },
    mastery: {},
    achievements: {},
    chests: { common: 0, rare: 0, epic: 0, legend: 0 },
    rank: { points: 0, best: 0, bestPoints: 0, rewarded: ["bronze"], history: [], season: 2 },
    stats: { bestWinStreak: 0, expertWins: 0, hardWins: 0, chaosPlayed: 0, onlinePlayed: 0, chestsOpened: 0, missionsClaimed: 0, loginDays: 0 },
    levelRewardsUpTo: 1,
    clock: { max: 0, offset: 0 },
    ads: { day: "", coins: 0, freeChest: 0, doubled: [], lastAdAt: 0, gamesSinceAd: 0, personalized: null },
    starterGift: false,
    tutorial: { state: "new", at: 0 },
    notifyAsks: 0,
    world: { id: "", secret: "", points: 0, pos: 0, claimed: "" },
    seen: [],
    settled: [],
    pending: null,
    ledger: [],
    winStreak: 0,
    lastSetup: { botCount: 3, difficulty: "normal", mapId: "forest", modeId: "classic", comp: true },
    settings: { music: true, sfx: true, vibration: true }
  };
}

// src/meta/save.ts
var memory = new Map;
function migrate(data) {
  const base = defaultProfile();
  const p = {
    ...base,
    ...data,
    version: 3,
    settings: { ...base.settings, ...data.settings ?? {} },
    lastSetup: { ...base.lastSetup, ...data.lastSetup ?? {} },
    equippedSkins: { ...data.equippedSkins ?? {} },
    equipped: { ...base.equipped, ...data.equipped ?? {} },
    daily: { ...base.daily, ...data.daily ?? {} },
    missions: data.missions && Array.isArray(data.missions.list) ? data.missions : base.missions,
    weekly: data.weekly && Array.isArray(data.weekly.list) ? data.weekly : base.weekly,
    mastery: { ...data.mastery ?? {} },
    achievements: { ...data.achievements ?? {} },
    chests: { ...base.chests, ...data.chests ?? {} },
    rank: { ...base.rank, ...data.rank ?? {} },
    stats: { ...base.stats, ...data.stats ?? {} },
    clock: { ...base.clock, ...data.clock ?? {} },
    ads: { ...base.ads, ...data.ads ?? {} }
  };
  const ts = data.tutorial?.state;
  p.notifyAsks = Math.max(0, Math.min(10, Number(data.notifyAsks) || 0));
  const w = data.world ?? {};
  const str = (v, re) => typeof v === "string" && re.test(v) ? v : "";
  p.world = {
    id: str(w.id, /^[A-Za-z0-9_-]{4,24}$/),
    secret: str(w.secret, /^[A-Za-z0-9_-]{16,64}$/),
    points: Math.max(0, Math.floor(Number(w.points) || 0)),
    pos: Math.max(0, Math.floor(Number(w.pos) || 0)),
    claimed: str(w.claimed, /^\d{4}-\d{2}-\d{2}$/)
  };
  if (!p.world.id || !p.world.secret)
    p.world.id = p.world.secret = "";
  p.tutorial = { state: ts === "offered" || ts === "skipped" || ts === "done" ? ts : "new", at: Math.max(0, Number(data.tutorial?.at) || 0) };
  const owned = new Set([...data.owned ?? [], ...data.ownedSkins ?? []]);
  p.owned = [...owned].filter((id) => !!getItem(id));
  delete p.ownedSkins;
  const chars = new Set([...DEFAULT_CHARACTERS, ...data.ownedCharacters ?? []]);
  p.ownedCharacters = [...chars].filter((id) => CHARACTERS.some((c) => c.id === id));
  if (!p.ownedCharacters.includes(p.characterId))
    p.characterId = base.characterId;
  if (data.named === undefined)
    p.named = !!p.name && p.name !== "Joueur" && !/^Joueur \d+$/.test(p.name);
  const has = (id) => {
    const it = getItem(id);
    return !!it && (it.free || p.owned.includes(id));
  };
  for (const [cid, sid] of Object.entries(p.equippedSkins))
    if (!has(sid) || getItem(sid)?.characterId !== cid)
      delete p.equippedSkins[cid];
  if (p.equipped.accessory && !has(p.equipped.accessory))
    p.equipped.accessory = null;
  if (!has(p.equipped.trail))
    p.equipped.trail = getTrail(null).id;
  p.equipped.emotes = (p.equipped.emotes ?? []).filter((id) => getEmote(id) && has(id)).slice(0, EMOTE_SLOTS);
  if (!p.equipped.emotes.length)
    p.equipped.emotes = [...base.equipped.emotes];
  if (!getBoom(p.equipped.boom) || getBoom(p.equipped.boom).id !== p.equipped.boom || !has(p.equipped.boom))
    p.equipped.boom = base.equipped.boom;
  if (!getTitle(p.equipped.title) || !has(p.equipped.title))
    p.equipped.title = base.equipped.title;
  p.level = Math.min(LEVEL_MAX, Math.max(1, Math.floor(p.level)));
  p.xp = Math.min(Math.floor(p.xp), levelXp(p.level) - 1);
  if (!Number.isFinite(data.levelRewardsUpTo))
    p.levelRewardsUpTo = p.level;
  for (const [cid, m] of Object.entries(p.mastery)) {
    if (!CHARACTERS.some((c) => c.id === cid) || !m || typeof m !== "object") {
      delete p.mastery[cid];
      continue;
    }
    const lvl = Math.min(MASTERY_MAX, Math.max(1, Math.floor(m.level || 1)));
    p.mastery[cid] = { level: lvl, xp: Math.max(0, Math.min(Math.floor(m.xp || 0), masteryXp(lvl) - 1)), games: m.games | 0, kills: m.kills | 0, wins: m.wins | 0 };
  }
  for (const t of CHEST_ORDER)
    p.chests[t] = Math.max(0, Math.floor(Number(p.chests[t]) || 0));
  if (!Array.isArray(p.rank.history))
    p.rank.history = [];
  if (!Array.isArray(p.rank.rewarded))
    p.rank.rewarded = ["bronze"];
  p.rank.points = Math.max(0, Math.floor(Number(p.rank.points) || 0));
  if (data.rank?.season !== RANK_RULES.season) {
    p.rank.season = RANK_RULES.season;
    p.rank.points = 0;
    p.rank.best = 0;
    p.rank.bestPoints = 0;
    p.rank.history = [];
    if (p.lastSetup)
      p.lastSetup.comp = true;
    if (p.world)
      p.world.points = p.world.pos = 0;
  }
  p.rank.bestPoints = Math.max(0, Math.floor(Number(p.rank.bestPoints) || 0), p.rank.points);
  for (const k of Object.keys(base.stats))
    p.stats[k] = Math.max(0, Math.floor(Number(p.stats[k]) || 0));
  p.stats.bestWinStreak = Math.max(p.stats.bestWinStreak, Math.floor(Number(data.winStreak) || 0));
  if (data.stats === undefined)
    p.stats.loginDays = Math.max(p.stats.loginDays, Math.floor(Number(p.daily.streak) || 0));
  if (!Number.isFinite(p.clock.max))
    p.clock.max = 0;
  if (!Array.isArray(p.ads.doubled))
    p.ads.doubled = [];
  for (const k of ["coins", "freeChest", "lastAdAt", "gamesSinceAd"])
    if (!Number.isFinite(p.ads[k]) || p.ads[k] < 0)
      p.ads[k] = 0;
  if (p.ads.personalized !== true && p.ads.personalized !== false)
    p.ads.personalized = null;
  if (!Number.isFinite(p.clock.offset) || Math.abs(p.clock.offset) > 400 * 86400000)
    p.clock.offset = 0;
  for (const k of ["coins", "coinsEarned", "level", "xp"])
    if (!Number.isFinite(p[k]) || p[k] < 0)
      p[k] = base[k];
  p.coins = Math.floor(p.coins);
  p.bombers = Number.isFinite(p.bombers) && p.bombers > 0 ? Math.floor(p.bombers) : 0;
  p.bomberGift = p.bomberGift === true;
  p.purchases = Array.isArray(p.purchases) ? p.purchases.filter((x) => x && typeof x.token === "string").slice(-200) : [];
  if (!Array.isArray(p.settled))
    p.settled = [];
  if (!Array.isArray(p.ledger))
    p.ledger = [];
  if (!p.pending || typeof p.pending.matchId !== "string")
    p.pending = null;
  if (!Number.isFinite(p.winStreak))
    p.winStreak = 0;
  if (!["easy", "normal", "hard", "expert"].includes(p.lastSetup.difficulty))
    p.lastSetup.difficulty = "normal";
  return p;
}

// server/index.ts
var PORT = Number(process.env.PORT ?? 8787);
var HERE = dirname(fileURLToPath(import.meta.url));
var STATIC_DIR = process.env.STATIC_DIR ? resolve(process.env.STATIC_DIR) : existsSync2(join2(HERE, "www", "index.html")) ? join2(HERE, "www") : existsSync2(join2(HERE, "index.html")) ? HERE : join2(process.cwd(), "dist", "www");
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
var cosm = (v) => typeof v === "string" && /^[a-z0-9-]{1,40}$/.test(v) ? v : undefined;
var charId = (v, fallback = "renard") => typeof v === "string" && CHARACTERS.some((c) => c.id === v) ? v : fallback;
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
    if (updates.statusOf(typeof msg.app === "string" ? msg.app.slice(0, 20) : null) === "mandatory") {
      conn.send(JSON.stringify({ t: "error", code: "update_required", message: "Mise à jour obligatoire : mets le jeu à jour pour jouer en ligne." }));
      setTimeout(() => conn.close(4010), 250);
      return;
    }
    const token = typeof msg.token === "string" && msg.token.length >= 16 ? msg.token.slice(0, 64) : randomBytes3(16).toString("hex");
    let c = clients.get(token);
    if (!c) {
      c = { token, id: randomBytes3(5).toString("hex"), name: "", characterId: "renard", room: null, connected: true };
      clients.set(token, c);
    }
    const old = conns.get(token);
    if (old && old !== conn)
      old.close(4000);
    conns.set(token, conn);
    state.token = token;
    c.connected = true;
    c.name = cleanName(msg.name);
    c.characterId = charId(msg.characterId);
    c.skinId = cosm(msg.skinId);
    c.accessoryId = cosm(msg.accessoryId);
    c.trailId = cosm(msg.trailId);
    c.boomId = cosm(msg.boomId);
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
      c.characterId = charId(msg.characterId, c.characterId);
      c.skinId = cosm(msg.skinId);
      c.accessoryId = cosm(msg.accessoryId);
      c.trailId = cosm(msg.trailId);
      c.boomId = cosm(msg.boomId);
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
    case "emote":
      lobby.emote(c, String(msg.id ?? ""));
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
  ".apk": "application/vnd.android.package-archive",
  ".txt": "text/plain; charset=utf-8"
};
var accountStore = storeFromEnv();
var googleClientIds = [process.env.GOOGLE_WEB_CLIENT_ID, ...(process.env.GOOGLE_EXTRA_CLIENT_IDS ?? "").split(",")].map((s) => s?.trim()).filter((s) => !!s);
var accounts = accountStore && googleClientIds.length ? new Accounts(accountStore, new GoogleVerifier(googleClientIds, process.env.GOOGLE_JWKS_URL || undefined), (d) => migrate(d)) : null;
var updates = new UpdateService(accountStore ?? new MemoryStore);
updates.applyBundled(announce_default);
var updateApi = updateRoutes(updates, process.env.ADMIN_TOKEN, (req) => allowedOrigin(req.headers.origin, req.headers.host));
var leaderboard = new LeaderboardService(accountStore ?? new MemoryStore);
var lbApi = leaderboardRoutes(leaderboard, process.env.ADMIN_TOKEN, (req) => allowedOrigin(req.headers.origin, req.headers.host));
leaderboard.ready();
var api = accountRoutes(accounts, process.env.GOOGLE_WEB_CLIENT_ID, (req) => updates.statusOf(String(req.headers["x-bomberush-version"] ?? "") || null) === "mandatory");
console.log(process.env.ADMIN_TOKEN && process.env.ADMIN_TOKEN.length >= 24 ? "Mises à jour : administration activée" : "Mises à jour : administration désactivée (ADMIN_TOKEN à configurer)");
console.log(accounts ? `Comptes : activés (stockage ${accountStore.kind})` : "Comptes : désactivés (GOOGLE_WEB_CLIENT_ID + stockage à configurer)");
var server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (await updateApi(req, res, url.pathname, url.searchParams))
    return;
  if (await lbApi(req, res, url.pathname, url.searchParams))
    return;
  if (await api(req, res, url.pathname))
    return;
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ ok: true, now: Date.now(), rooms: lobby.rooms.size, players: conns.size, push: push.enabled, v: PROTOCOL_VERSION }));
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
    let data = await readFile(join2(STATIC_DIR, path));
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
for (const sig of ["SIGTERM", "SIGINT"])
  process.once(sig, () => {
    leaderboard.flush().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
