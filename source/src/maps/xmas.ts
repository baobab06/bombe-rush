import type { MapDef } from "./types";

/**
 * Village de Noël : rues enneigées, sapins décorés, cadeaux à faire sauter.
 * Au centre, le grand sapin du village (indestructible) et sa place.
 */
export const XMAS: MapDef = {
  id: "xmas",
  name: "Village de Noël",
  subtitle: "Des cadeaux… explosifs",
  theme: "xmas",
  layout: [
    "###############",
    "#S.....s.....S#",
    "#.#.#.#.#.#.#.#",
    "#.....#.#.....#",
    "#.#.#.....#.#.#",
    "#s..._.#._...s#",
    "#.#.#.....#.#.#",
    "#.....#.#.....#",
    "#.#.#.#.#.#.#.#",
    "#S.....s.....S#",
    "###############",
  ],
  blockDensity: 0.65,
  spawnClear: 1,
  startRange: 1,
  available: true,
};
