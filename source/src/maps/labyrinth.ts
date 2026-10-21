import type { MapDef } from "./types";

/**
 * Labyrinthe : temple de pierre éclairé aux torches.
 * - coins de départ en dalles de sable, fermés par des murs en L ;
 * - deux portes (haut / bas) entre des murs doubles, menant au centre ;
 * - au centre, l'autel enflammé (mur) entouré de canaux d'eau et de 4 ponts ;
 * - couloirs sinueux sur les côtés, caisses moins serrées qu'ailleurs pour
 *   garder plusieurs itinéraires et de quoi esquiver.
 * Le plan est symétrique (gauche/droite et haut/bas) : aucun départ avantagé.
 */
export const LABYRINTH: MapDef = {
  id: "labyrinth",
  name: "Labyrinthe",
  subtitle: "Temple aux torches",
  theme: "labyrinth",
  layout: [
    "#############",
    "#S_..#.#.._S#",
    "#_##.#.#.##_#",
    "#..#.....#..#",
    "#.##.~_~.##.#",
    "#...._#_....#",
    "#.##.~_~.##.#",
    "#..#.....#..#",
    "#_##.#.#.##_#",
    "#S_..#.#.._S#",
    "#############",
  ],
  blockDensity: 0.72,
  spawnClear: 1,
  startRange: 1,
  available: true,
};
