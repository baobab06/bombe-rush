import type { MapDef } from "./types";

/** Banquise : plaques de glace où l'on glisse tant qu'on ne change pas de direction. */
export const ICE: MapDef = {
  id: "ice",
  name: "Banquise",
  subtitle: "Ça glisse !",
  theme: "ice",
  // retirée pour l'instant de tous les modes (demande du 25/10) : remettre en enlevant cette ligne
  modes: [],
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
  spawnClear: 1,
  startRange: 1,
  available: true,
};
