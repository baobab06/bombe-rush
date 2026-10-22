import type { Match } from "./match";
import { ChaosDirector } from "./chaos";
import { HillState } from "./hill";

/**
 * Modes de jeu : des crochets appelés par la simulation.
 * Le mode Chaos branche son directeur d'événements (core/chaos.ts) ici,
 * sans modifier le cœur du jeu.
 */
export interface ModeDef {
  id: string;
  name: string;
  tagline: string;
  available: boolean;
  /** emoji affiché sur les boutons du mode */
  emoji?: string;
  /** false : pas de mort subite (murs qui tombent) dans ce mode */
  suddenDeath?: boolean;
  onStart?(m: Match): void;
  onTick?(m: Match, dt: number): void;
}

export const MODES: ModeDef[] = [
  {
    id: "classic",
    name: "Classique",
    emoji: "🎮",
    tagline: "Le dernier debout gagne.",
    available: true,
  },
  {
    id: "chaos",
    name: "Chaos",
    emoji: "💀",
    tagline: "Pluie de bombes, tempêtes, explosions géantes…",
    available: true,
    onStart(m) {
      m.chaos = new ChaosDirector(m);
    },
    onTick(m, dt) {
      m.chaos?.update(dt);
    },
  },
  {
    id: "koth",
    name: "Domination",
    tagline: "Reste seul dans la zone pour marquer. Premier à 25 points !",
    available: true,
    emoji: "👑",
    suddenDeath: false,
    onStart(m) {
      m.hill = new HillState(m);
    },
    onTick(m) {
      m.hill?.update();
    },
  },
];

export function getMode(id: string): ModeDef {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}
