import type { MapDef } from "./types";

/**
 * Mine d'or (Ruée vers l'or) : galeries de mine éclairées aux lanternes.
 * - « $ » = FILON D'OR : un rocher veiné d'or, qui se casse comme une caisse
 *   et donne TOUJOURS une grosse pépite ; il repousse un peu plus tard ;
 * - au centre, le GISEMENT : un filon entouré de sol libre, l'endroit où
 *   tout le monde se retrouve ;
 * - caisses moins serrées qu'ailleurs : on court après l'or.
 * Plan symétrique (gauche/droite et haut/bas) : aucun départ avantagé.
 */
export const MINE: MapDef = {
  id: "mine",
  name: "Mine d'or",
  subtitle: "Galeries aux lanternes",
  theme: "mine",
  layout: [
    "#############",
    "#S_...$..._S#",
    "#_#.#.#.#.#_#",
    "#.....$.....#",
    "#.#.#___#.#.#",
    "#$.s._$_.s.$#",
    "#.#.#___#.#.#",
    "#.....$.....#",
    "#_#.#.#.#.#_#",
    "#S_...$..._S#",
    "#############",
  ],
  blockDensity: 0.55,
  spawnClear: 1,
  startRange: 1,
  available: true,
  modes: ["gold"],
};
