import type { MapDef } from "./types";

/**
 * Coffre-fort (Ruée vers l'or) : la salle des coffres d'une banque.
 * - au centre, la SALLE FORTE (murs d'acier, ouverte à gauche et à droite)
 *   avec une pile de lingots d'or (« $ ») ;
 * - lingots aussi en haut, en bas, sur les côtés et devant les portes
 *   de la salle forte (9 piles en tout) ;
 * - petits couloirs de service (« _ ») qui ne reçoivent jamais de bloc.
 * Plan symétrique (gauche/droite et haut/bas).
 */
export const VAULT: MapDef = {
  id: "vault",
  name: "Coffre-fort",
  subtitle: "Salle des lingots",
  theme: "vault",
  layout: [
    "#############",
    "#.....$.....#",
    "#.#_#.#.#_#.#",
    "#.._.$.$._..#",
    "#.#.#####.#.#",
    "#$..._$_...$#",
    "#.#.#####.#.#",
    "#.._.$.$._..#",
    "#.#_#.#.#_#.#",
    "#.....$.....#",
    "#############",
  ],
  blockDensity: 0.6,
  spawnClear: 1,
  startRange: 1,
  available: true,
  modes: ["gold"],
};
