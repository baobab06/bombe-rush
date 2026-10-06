import type { Match } from "./match";
import { RULES } from "./rules";
import { TILE } from "./types";

/**
 * Mode CHAOS — directeur d'événements.
 *
 * Tout passe par le rng de la partie : le serveur et les clients obtiennent
 * exactement les mêmes événements, aux mêmes cases.
 *
 * Ajouter un événement = ajouter une entrée dans CHAOS_EVENTS.
 */
export interface ChaosEventDef {
  id: string;
  label: string;
  emoji: string;
  /** compte à rebours d'alerte avant le déclenchement (0 = immédiat) */
  countdown: number;
  /** durée de l'effet une fois déclenché */
  duration: number;
  /** poids pour le tirage au sort */
  weight: number;
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
  /** événement tiré par « 🎲 aléatoire » */
  via?: string;
}

const burnZone = (m: Match, run: ChaosRun, breakBlocks: boolean) => {
  for (const i of run.zone) m.ignite(i % m.grid.w, Math.floor(i / m.grid.w), breakBlocks);
};

export const CHAOS_EVENTS: ChaosEventDef[] = [
  {
    id: "bombRain",
    label: "PLUIE DE BOMBES",
    emoji: "💣",
    countdown: 3,
    duration: 4,
    weight: 3,
    start(_m, run) {
      run.data.next = 0;
    },
    tick(m, run, dt) {
      run.data.next -= dt;
      if (run.data.next > 0) return;
      run.data.next = 0.38;
      const [c] = m.randomFreeCells(1, true);
      if (c) m.spawnNeutralBomb(c[0], c[1], RULES.bombFuse, 2);
    },
  },
  {
    id: "flameStorm",
    label: "TEMPÊTE DE FLAMMES",
    emoji: "🔥",
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
      // les zones restent en feu pendant toute la tempête
      burnZone(m, run, false);
    },
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
      for (const [x, y] of m.randomFreeCells(4, true)) m.spawnBonus(m.rng.weighted(m.config.map.bonusWeights), x, y);
    },
    end(m) {
      m.bonusBoost = false;
    },
  },
  {
    id: "speedChaos",
    label: "SPEED CHAOS",
    emoji: "🏃",
    countdown: 0,
    duration: 7,
    weight: 2,
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
    countdown: 0,
    duration: 0.1,
    weight: 2,
    start(m) {
      for (const [x, y] of m.randomFreeCells(3, true)) m.spawnBonus("shield", x, y);
    },
  },
  {
    id: "megaBlast",
    label: "EXPLOSION GÉANTE",
    emoji: "💥",
    countdown: 3,
    duration: 0.9,
    weight: 2,
    prepare(m, run) {
      const g = m.grid;
      // centre au hasard dans l'arène, zone de 5×5
      const cx = 3 + m.rng.int(g.w - 6);
      const cy = 3 + m.rng.int(g.h - 6);
      run.zone = [];
      for (let y = cy - 2; y <= cy + 2; y++)
        for (let x = cx - 2; x <= cx + 2; x++) if (g.inside(x, y) && g.tile(x, y) !== TILE.WALL) run.zone.push(g.idx(x, y));
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
];

/** « 🎲 Événement aléatoire » : annonce la surprise puis tire un événement. */
export const RANDOM_EVENT = { id: "random", label: "ÉVÉNEMENT ALÉATOIRE", emoji: "🎲", weight: 2 };

export const CHAOS_TIMING = {
  firstEvent: [9, 13] as const, // premier événement entre 9 et 13 s
  gap: [11, 17] as const, // puis toutes les 11 à 17 s après la fin du précédent
};

export class ChaosDirector {
  /** temps avant le prochain tirage */
  nextIn: number;
  /** événement annoncé, en compte à rebours */
  pending: ChaosRun | null = null;
  pendingLeft = 0;
  /** événements en cours */
  active: ChaosRun[] = [];
  count = 0;

  constructor(private m: Match) {
    const [a, b] = CHAOS_TIMING.firstEvent;
    this.nextIn = a + m.rng.next() * (b - a);
  }

  /** Cases dangereuses annoncées (pour l'affichage et les bots) : [idx, secondes avant le feu]. */
  dangerZones(): [number, number][] {
    if (!this.pending) return [];
    return this.pending.zone.map((i) => [i, this.pendingLeft] as [number, number]);
  }

  private pick(): { def: ChaosEventDef; via?: string } {
    const m = this.m;
    const pool: Record<string, number> = {};
    for (const e of CHAOS_EVENTS) pool[e.id] = e.weight;
    pool[RANDOM_EVENT.id] = RANDOM_EVENT.weight;
    const id = m.rng.weighted(pool);
    if (id === RANDOM_EVENT.id) {
      const inner: Record<string, number> = {};
      for (const e of CHAOS_EVENTS) inner[e.id] = 1;
      const innerId = m.rng.weighted(inner);
      return { def: CHAOS_EVENTS.find((e) => e.id === innerId)!, via: RANDOM_EVENT.id };
    }
    return { def: CHAOS_EVENTS.find((e) => e.id === id)! };
  }

  /** Force un événement (tests, débogage). */
  trigger(id: string) {
    const def = CHAOS_EVENTS.find((e) => e.id === id);
    if (def) this.launch({ def });
  }

  private launch({ def, via }: { def: ChaosEventDef; via?: string }) {
    const m = this.m;
    const run: ChaosRun = { def, zone: [], timer: def.duration, data: {}, via };
    this.count++;
    def.prepare?.(m, run);
    if (def.countdown > 0) {
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
    // prochain tirage (pas pendant un autre événement, ni quand la partie se joue à un)
    if (this.pending || this.active.length || m.aliveCount <= 1) return;
    this.nextIn -= dt;
    if (this.nextIn > 0) return;
    const [a, b] = CHAOS_TIMING.gap;
    this.nextIn = a + m.rng.next() * (b - a);
    this.launch(this.pick());
  }
}

