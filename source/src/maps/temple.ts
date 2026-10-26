import type { MapDef } from "./types";

/**
 * Temple du Roi (Domination) : ruines dorées dans la jungle.
 * 5 zones en croix (centre, haut, bas, gauche, droite), chacune en forme de
 * « + » entourée de 4 piliers pour se protéger des bombes. Un couloir dégagé
 * traverse la carte au milieu. Départs dans les 4 coins, à égale distance
 * des zones. Plan symétrique (gauche/droite, haut/bas).
 */
export const TEMPLE: MapDef = {
  id: "temple",
  name: "Temple du Roi",
  subtitle: "Ruines dorées",
  theme: "temple",
  layout: [
    "#############",
    "#S_..#z#.._S#",
    "#_.#.zzz.#._#",
    "#.#..#.#..#.#",
    "##z#.#z#.#z##",
    "#zzz.zzz.zzz#",
    "##z#.#z#.#z##",
    "#.#..#.#..#.#",
    "#_.#.zzz.#._#",
    "#S_..#z#.._S#",
    "#############",
  ],
  blockDensity: 0.8,
  spawnClear: 1,
  startRange: 1,
  available: true,
  // remplacée par l'Usine (26/10) : retirée de tous les modes, on la garde en réserve
  modes: [],
};
