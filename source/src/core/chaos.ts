import type { Match } from "./match";
import { BOMB_KINDS } from "./bombs";
import { LOOT } from "./loot";
import { TILE } from "./types";

/**
 * Mode CHAOS — directeur des MALUS.
 *
 * Chronologie (temps de jeu réel de la partie, en secondes de simulation :
 * il s'arrête quand la partie est en pause et n'existe pas dans les menus) :
 *   0 → 14,99 s : rien ; 15 s : premier malus ; puis 20 s, 25 s, 30 s…
 *   jusqu'à la fin de la partie. Réglages : CHAOS_SCHEDULE.
 *
 * Équité :
 *  - un malus dangereux (zones, bombes) est TOUJOURS annoncé avec un délai de
 *    réaction (compte à rebours + cases marquées) ;
 *  - jamais deux malus dangereux en même temps, jamais le même malus deux
 *    fois de suite, chaque malus a un temps de recharge ;
 *  - les zones sont dimensionnées d'après la taille de la carte (une part
 *    limitée des cases praticables) pour qu'il reste toujours de quoi fuir ;
 *  - les malus montent doucement en intensité au fil de la partie.
 *
 * Tout passe par le rng de la partie : le serveur et les clients obtiennent
 * exactement les mêmes malus, aux mêmes cases.
 * Ajouter un malus = ajouter une entrée dans CHAOS_EVENTS.
 */
export interface ChaosEventDef {
  id: string;
  label: string;
  emoji: string;
  /** phrase courte affichée sous le titre */
  hint: string;
  /** dangereux (peut éliminer) → annoncé avec délai de réaction, un seul à la fois */
  danger: boolean;
  /** compte à rebours d'alerte avant le déclenchement (0 = immédiat) */
  countdown: number;
  /** durée de l'effet une fois déclenché */
  duration: number;
  /** poids pour le tirage au sort (0 = jamais tiré, seulement via trigger()) */
  weight: number;
  /** délai minimal (s) avant de pouvoir retomber sur ce malus */
  cooldown: number;
  /** préparation pendant l'alerte (ex. choisir les zones) */
  prepare?(m: Match, run: ChaosRun): void;
  start(m: Match, run: ChaosRun): void;
  tick?(m: Match, run: ChaosRun, dt: number): void;
  end?(m: Match, run: ChaosRun): void;
}

export interface ChaosRun {
  def: ChaosEventDef;
  /** cases marquées (zone dangereuse annoncée, puis en feu) */
  zone: number[];
  timer: number;
  data: Record<string, number>;
  /** événement tiré par « 🎲 aléatoire » (ancien mode, gardé pour compatibilité) */
  via?: string;
}

/** Réglages du mode CHAOS (tout est modifiable ici). */
export const CHAOS_SCHEDULE = {
  /** premier malus (secondes de jeu) */
  first: 15,
  /** puis un nouveau malus toutes les N secondes */
  every: 5,
  /** effets actifs au maximum en même temps (alerte comprise) */
  maxActive: 3,
  /** part maximale des cases praticables touchée par une zone */
  maxZoneShare: 0.2,
  /** montée en puissance : +X % d'intensité par malus déjà joué (plafonné) */
  rampPerEvent: 0.06,
  rampMax: 0.6,
};

const burnZone = (m: Match, run: ChaosRun, breakBlocks: boolean) => {
  for (const i of run.zone) m.ignite(i % m.grid.w, Math.floor(i / m.grid.w), breakBlocks);
};

/** Cases praticables (sol sans mur ni bloc) : sert à dimensionner les zones. */
export function walkableCount(m: Match): number {
  const g = m.grid;
  let n = 0;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (!g.blocksMove(x, y)) n++;
  return n;
}

/** Intensité 1 → 1 + rampMax selon le nombre de malus déjà joués. */
const ramp = (m: Match) => 1 + Math.min(CHAOS_SCHEDULE.rampMax, (m.chaos?.count ?? 0) * CHAOS_SCHEDULE.rampPerEvent);

/** Zone rectangulaire tirée au hasard, bornée à une part des cases praticables. */
function pickRect(m: Match, run: ChaosRun, wantW: number, wantH: number) {
  const g = m.grid;
  const budget = Math.max(4, Math.floor(walkableCount(m) * CHAOS_SCHEDULE.maxZoneShare));
  let w = Math.min(wantW, g.w - 2);
  let h = Math.min(wantH, g.h - 2);
  while (w * h > budget * 1.6 && (w > 2 || h > 2)) {
    if (w >= h) w--;
    else h--;
  }
  const x0 = 1 + m.rng.int(Math.max(1, g.w - 1 - w));
  const y0 = 1 + m.rng.int(Math.max(1, g.h - 1 - h));
  run.zone = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (g.inside(x, y) && g.tile(x, y) !== TILE.WALL) run.zone.push(g.idx(x, y));
  run.zone = run.zone.slice(0, budget);
  run.data.cx = x0 + (w - 1) / 2;
  run.data.cy = y0 + (h - 1) / 2;
}

export const CHAOS_EVENTS: ChaosEventDef[] = [
  {
    id: "zone",
    label: "ZONE INTERDITE",
    emoji: "🚫",
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
    },
  },
  {
    id: "fog",
    label: "BROUILLARD",
    emoji: "🌫️",
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
    },
  },
  {
    id: "slow",
    label: "RALENTISSEMENT",
    emoji: "🐌",
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
    },
  },
  {
    id: "bombRain",
    label: "PLUIE DE BOMBES",
    emoji: "💣",
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
      if (run.data.next > 0) return;
      run.data.next = Math.max(0.24, 0.4 / ramp(m));
      // jamais sur un joueur ni juste à côté : la bombe elle-même sert d'alerte
      const cells = m.randomFreeCells(8, true);
      const far = cells.find(([x, y]) => m.players.every((p) => !p.alive || Math.abs(Math.floor(p.x) - x) + Math.abs(Math.floor(p.y) - y) >= 2));
      const c = far ?? cells[0];
      if (c) m.spawnNeutralBomb(c[0], c[1], BOMB_KINDS.rain.fuse, 2);
    },
  },
  {
    id: "flameStorm",
    label: "SOL INSTABLE",
    emoji: "🕳️",
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
    },
  },
  {
    id: "overheat",
    label: "SURCHAUFFE",
    emoji: "🌡️",
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
    },
  },
  {
    id: "megaBlast",
    label: "EXPLOSION GÉANTE",
    emoji: "💥",
    hint: "Éloigne-toi de la zone !",
    danger: true,
    countdown: 3,
    duration: 0.9,
    weight: 1,
    cooldown: 20,
    prepare(m, run) {
      const g = m.grid;
      // 5×5 sur les grandes cartes, losange plus petit sur les petites
      const small = walkableCount(m) < 110;
      const cx = 3 + m.rng.int(Math.max(1, g.w - 6));
      const cy = 3 + m.rng.int(Math.max(1, g.h - 6));
      run.zone = [];
      for (let y = cy - 2; y <= cy + 2; y++)
        for (let x = cx - 2; x <= cx + 2; x++) {
          if (small && Math.abs(x - cx) + Math.abs(y - cy) > 2) continue;
          if (g.inside(x, y) && g.tile(x, y) !== TILE.WALL) run.zone.push(g.idx(x, y));
        }
      run.data.cx = cx;
      run.data.cy = cy;
    },
    start(m, run) {
      burnZone(m, run, true);
    },
    tick(m, run) {
      burnZone(m, run, false);
    },
  },
  // ---- anciens événements « bonus » : gardés (tests, débogage) mais hors rotation
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
      for (const [x, y] of m.randomFreeCells(4, true)) m.spawnBonus(m.rng.weighted(LOOT.weights), x, y);
    },
    end(m) {
      m.bonusBoost = false;
    },
  },
  {
    id: "speedChaos",
    label: "SPEED CHAOS",
    emoji: "🏃",
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
    },
  },
  {
    id: "shields",
    label: "BOUCLIERS",
    emoji: "🛡️",
    hint: "Des boucliers apparaissent",
    danger: false,
    countdown: 0,
    duration: 0.1,
    weight: 0,
    cooldown: 20,
    start(m) {
      for (const [x, y] of m.randomFreeCells(3, true)) m.spawnBonus("shield", x, y);
    },
  },
];

export const chaosDef = (id: string) => CHAOS_EVENTS.find((e) => e.id === id);

export class ChaosDirector {
  /** secondes de jeu du prochain malus */
  nextAt: number = CHAOS_SCHEDULE.first;
  /** malus dangereux annoncé, en compte à rebours */
  pending: ChaosRun | null = null;
  pendingLeft = 0;
  /** effets en cours */
  active: ChaosRun[] = [];
  /** malus déclenchés depuis le début */
  count = 0;
  /** dernier déclenchement de chaque malus (secondes de jeu) */
  private lastAt: Record<string, number> = {};
  private lastId = "";

  constructor(private m: Match) {}

  /** Secondes avant le prochain malus (HUD). */
  get nextIn(): number {
    return Math.max(0, this.nextAt - this.m.time);
  }

  /** Cases dangereuses annoncées (pour l'affichage et les bots) : [idx, secondes avant le feu]. */
  dangerZones(): [number, number][] {
    if (!this.pending) return [];
    return this.pending.zone.map((i) => [i, this.pendingLeft] as [number, number]);
  }

  /** Un malus dangereux est-il annoncé ou en cours ? */
  get dangerBusy(): boolean {
    return !!this.pending || this.active.some((r) => r.def.danger);
  }

  /** Malus possibles maintenant (recharges, pas deux dangers, pas le même deux fois de suite). */
  candidates(): ChaosEventDef[] {
    const t = this.m.time;
    const busy = this.dangerBusy;
    const activeIds = new Set(this.active.map((r) => r.def.id));
    return CHAOS_EVENTS.filter(
      (e) =>
        e.weight > 0 &&
        e.id !== this.lastId &&
        !activeIds.has(e.id) &&
        !(busy && e.danger) &&
        t - (this.lastAt[e.id] ?? -1e9) >= e.cooldown,
    );
  }

  private pick(): ChaosEventDef | null {
    const list = this.candidates();
    if (!list.length) return null;
    const pool: Record<string, number> = {};
    for (const e of list) pool[e.id] = e.weight;
    const id = this.m.rng.weighted(pool);
    return list.find((e) => e.id === id) ?? null;
  }

  /** Force un malus (tests, débogage). */
  trigger(id: string) {
    const def = chaosDef(id);
    if (def) this.launch(def);
  }

  private launch(def: ChaosEventDef) {
    const m = this.m;
    const run: ChaosRun = { def, zone: [], timer: def.duration, data: {} };
    this.count++;
    this.lastAt[def.id] = m.time;
    this.lastId = def.id;
    def.prepare?.(m, run);
    if (def.countdown > 0) {
      // un seul malus dangereux annoncé à la fois
      if (this.pending) this.begin(this.pending);
      this.pending = run;
      this.pendingLeft = def.countdown;
      m.events.push({ t: "chaosWarn", id: def.id, label: def.label, emoji: def.emoji, seconds: def.countdown });
    } else this.begin(run);
  }

  private begin(run: ChaosRun) {
    const m = this.m;
    m.events.push({ t: "chaosStart", id: run.def.id, label: run.def.label, emoji: run.def.emoji, via: run.via });
    run.def.start(m, run);
    this.active.push(run);
  }

  update(dt: number) {
    const m = this.m;
    if (m.phase !== "playing") return;
    // alerte en cours
    if (this.pending) {
      this.pendingLeft -= dt;
      if (this.pendingLeft <= 0) {
        const run = this.pending;
        this.pending = null;
        this.begin(run);
      }
    }
    // effets en cours
    for (const run of this.active) {
      run.def.tick?.(m, run, dt);
      run.timer -= dt;
    }
    for (const run of this.active.filter((r) => r.timer <= 0)) {
      run.def.end?.(m, run);
      m.events.push({ t: "chaosEnd", id: run.def.id });
    }
    this.active = this.active.filter((r) => r.timer > 0);
    // horaire fixe : 15 s, 20 s, 25 s… (rien quand il ne reste qu'un joueur)
    if (m.time + 1e-6 < this.nextAt) return;
    this.nextAt += CHAOS_SCHEDULE.every;
    if (m.aliveCount <= 1) return;
    if (this.active.length + (this.pending ? 1 : 0) >= CHAOS_SCHEDULE.maxActive) {
      // trop d'effets en même temps : on attend le prochain créneau
      m.events.push({ t: "chaosSkip" });
      return;
    }
    const def = this.pick();
    if (def) this.launch(def);
  }
}
