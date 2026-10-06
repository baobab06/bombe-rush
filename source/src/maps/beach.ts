import type { MapDef } from "./types";

/** Plage : du sable, un lagon central infranchissable, palmiers et rochers. */
export const BEACH: MapDef = {
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
    "#############",
  ],
  blockDensity: 1,
  bonusChance: 0.5,
  bonusWeights: { bomb: 60, flame: 18, speed: 12, shield: 10 },
  spawnClear: 1,
  startRange: 1,
  available: true,
};
