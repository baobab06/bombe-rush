import type { MapDef } from "./types";

/**
 * Château (Domination) : cour de château, tapis royaux.
 * 5 zones en X (centre + 4 tours), chacune en « + » entre des piliers.
 * Départs au milieu des 4 bords : chaque joueur a deux zones de coin à
 * la même distance. Plan symétrique (gauche/droite, haut/bas).
 * À 5-6 joueurs, départs en plus dans les coins (s), en diagonale.
 */
export const CASTLE: MapDef = {
  id: "castle",
  name: "Château",
  subtitle: "Cour royale",
  theme: "castle",
  layout: [
    "#############",
    "#s..._S_...s#",
    "#.#z#._.#z#.#",
    "#.zzz...zzz.#",
    "#.#z##z##z#.#",
    "#S_..zzz.._S#",
    "#.#z##z##z#.#",
    "#.zzz...zzz.#",
    "#.#z#._.#z#.#",
    "#s..._S_...s#",
    "#############",
  ],
  blockDensity: 0.72,
  spawnClear: 1,
  startRange: 1,
  available: true,
  // remplacée par l'Usine (26/10) : retirée de tous les modes, on la garde en réserve
  modes: [],
  fixedSpawns: true,
};
