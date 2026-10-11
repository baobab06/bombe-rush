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
  spawnClear: 1,
  startRange: 1,
  available: true,
};
