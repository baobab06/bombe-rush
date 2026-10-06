import type { MapDef } from "./types";

/** Banquise : plaques de glace où l'on glisse tant qu'on ne change pas de direction. */
export const ICE: MapDef = {
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
    "#############",
  ],
  blockDensity: 1,
  bonusChance: 0.5,
  bonusWeights: { bomb: 60, flame: 18, speed: 12, shield: 10 },
  spawnClear: 1,
  startRange: 1,
  available: true,
};
