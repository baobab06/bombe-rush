import type { MapDef } from "./types";

/** Volcan : bassins de lave infranchissables + cheminées qui entrent en éruption. */
export const VOLCANO: MapDef = {
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
    "#############",
  ],
  blockDensity: 1,
  bonusChance: 0.5,
  bonusWeights: { bomb: 60, flame: 18, speed: 12, shield: 10 },
  spawnClear: 1,
  startRange: 1,
  available: true,
};
