import type { MapDef } from "./types";

/**
 * Usine (Domination) : arène industrielle vue de dessus.
 * Point de capture unique au centre (case « z »), encadré par deux blocs
 * d'acier. Départs côté gauche (plots rouges) et côté droit (plots bleus).
 * Caisses en bois sur une partie des cases « . » (tirage symétrique).
 * Plan symétrique (gauche/droite, haut/bas) : aucun joueur n'est avantagé.
 *
 * Le look de chaque mur (acier, ventilation, tonneaux, machine) est choisi
 * dans render/maps-factory.ts selon sa position : TOUS bloquent pareil.
 */
export const FACTORY: MapDef = {
  id: "factory",
  name: "Usine",
  subtitle: "Zone de conflit",
  theme: "factory",
  layout: [
    "#############",
    "#_..#._.#.._#",
    "#S#.._#_..#S#",
    "#_._#._.#_._#",
    "#..#._._.#..#",
    "#_._.#z#._._#",
    "#..#._._.#..#",
    "#_._#._.#_._#",
    "#S#.._#_..#S#",
    "#_..#._.#.._#",
    "#############",
  ],
  blockDensity: 0.55,
  spawnClear: 1,
  startRange: 1,
  available: true,
  modes: ["koth"],
  fixedSpawns: true,
};
