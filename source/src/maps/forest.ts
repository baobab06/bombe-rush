import type { MapDef } from "./types";

export const FOREST: MapDef = {
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
    "#############",
  ],
  // arène pleine : chaque case libre reçoit un bloc, sauf la petite
  // cachette garantie autour de chaque spawn
  blockDensity: 1,
  bonusChance: 0.5,
  // le bonus Bombe (+1 bombe simultanée) domine : ~6 bonus sur 10
  bonusWeights: { bomb: 60, flame: 18, speed: 12, shield: 10 },
  spawnClear: 1,
  startRange: 1,
  available: true,
};
