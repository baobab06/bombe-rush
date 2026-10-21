import type { MapDef } from "./types";

/**
 * Arène Chaos : plateforme futuriste au-dessus du vide.
 * - grand espace central ouvert pour les combats, autour d'un cristal-pylône ;
 * - gouffres d'énergie (infranchissables, les flammes passent) qui créent
 *   des passages étroits sur les côtés ;
 * - amas de cristaux répartis de façon irrégulière dans chaque quart,
 *   mais en miroir pour rester équitable ;
 * - 4 failles d'énergie (mécanisme des cheminées) qui clignotent avant d'éclater.
 */
export const CHAOS_ARENA: MapDef = {
  id: "chaos_arena",
  name: "Arène Chaos",
  subtitle: "Cristaux et failles",
  theme: "chaos_arena",
  layout: [
    "#############",
    "#S.._..._..S#",
    "#.##..#..##.#",
    "#...V._.V...#",
    "#.~~._._.~~.#",
    "#._.._#_.._.#",
    "#.~~._._.~~.#",
    "#...V._.V...#",
    "#.##..#..##.#",
    "#S.._..._..S#",
    "#############",
  ],
  blockDensity: 0.62,
  spawnClear: 1,
  startRange: 1,
  available: true,
};
