import type { Match } from "./match";
import { ChaosDirector } from "./chaos";

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
  onStart?(m: Match): void;
  onTick?(m: Match, dt: number): void;
}

export const MODES: ModeDef[] = [
  {
    id: "classic",
    name: "Classique",
    tagline: "Le dernier debout gagne.",
    available: true,
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
    },
  },
];

export function getMode(id: string): ModeDef {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}
