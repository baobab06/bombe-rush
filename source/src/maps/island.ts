import type { MapDef } from "./types";

/**
 * Île au trésor (Ruée vers l'or) : un archipel de pirates.
 * - deux bras de mer (« ~ », on ne peut pas y marcher) coupent l'arène en
 *   trois îles reliées par quatre ponts (« _ ») ;
 * - l'île du milieu cache sept COFFRES DE PIRATE (« $ ») : il faut traverser
 *   les ponts pour aller les chercher, et revenir vivant ;
 * - un coffre sur chaque île de côté.
 * Plan symétrique (gauche/droite et haut/bas).
 */
export const ISLAND: MapDef = {
  id: "island",
  name: "Île au trésor",
  subtitle: "Repaire des pirates",
  theme: "island",
  layout: [
    "###############",
    "#...~$...$~...#",
    "#.#.~.#.#.~.#.#",
    "#..._..$.._...#",
    "#.#.~.#.#.~.#.#",
    "#.$.~._$_.~.$.#",
    "#.#.~.#.#.~.#.#",
    "#..._..$.._...#",
    "#.#.~.#.#.~.#.#",
    "#...~$...$~...#",
    "###############",
  ],
  blockDensity: 0.55,
  spawnClear: 1,
  startRange: 1,
  available: true,
  modes: ["gold"],
};
