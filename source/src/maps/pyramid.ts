import type { MapDef } from "./types";

/**
 * Pyramide (Ruée vers l'or) : tombeau de pharaon, couloirs de pierre.
 * - au centre, la CHAMBRE DU TRÉSOR (murs, deux entrées gauche/droite) avec
 *   un sarcophage en or (« $ ») ;
 * - deux sarcophages pris dans les murs en haut et en bas, deux sur les côtés,
 *   quatre aux coins de la grande salle (9 en tout) ;
 * - grande arène (15 × 11), couloirs en anneau tout autour.
 * Plan symétrique (gauche/droite et haut/bas).
 */
export const PYRAMID: MapDef = {
  id: "pyramid",
  name: "Pyramide",
  subtitle: "Tombeau du pharaon",
  theme: "pyramid",
  layout: [
    "###############",
    "#.............#",
    "#.##.##$##.##.#",
    "#.#..$...$..#.#",
    "#...#.###.#...#",
    "#.$..._$_...$.#",
    "#...#.###.#...#",
    "#.#..$...$..#.#",
    "#.##.##$##.##.#",
    "#.............#",
    "###############",
  ],
  blockDensity: 0.6,
  spawnClear: 1,
  startRange: 1,
  available: true,
  modes: ["gold"],
};
