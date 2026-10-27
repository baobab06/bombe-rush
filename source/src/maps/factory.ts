import type { MapDef } from "./types";

/**
 * Usine (Domination) : arène industrielle vue de dessus, reprise case par
 * case du plan de la planche de référence (13 × 11 cases jouables, entourées
 * d'un mur technique). Arène très ouverte : quelques obstacles d'usine, 12
 * caisses à des places fixes, point de capture unique au centre.
 * Départs : plot rouge à gauche, plot bleu à droite (2 joueurs) ; à 3-4
 * joueurs, deux départs de plus sur les grilles en haut et en bas.
 * Plan symétrique (gauche/droite, haut/bas).
 */
export const FACTORY: MapDef = {
  id: "factory",
  name: "Usine",
  subtitle: "Zone de conflit",
  theme: "factory",
  layout: [
    "###############",
    "##____#_#____##",
    "##_#.__s__.#_##",
    "##.__.___.__.##",
    "#___#__#__#___#",
    "#__#_______#__#",
    "#S_____z_____S#",
    "#__#_______#__#",
    "#___#__#__#___#",
    "##.__.___.__.##",
    "##_#.__s__.#_##",
    "##____#_#____##",
    "###############",
  ],
  blockDensity: 1,
  spawnClear: 1,
  startRange: 2, // portée des bombes en Domination (cachette garantie au départ)
  available: true,
  modes: ["koth"],
  fixedSpawns: true,
  // 2 contre 2 : rouges à gauche sur le plot et ses deux repères, bleus en miroir à droite
  teamSpawns: { 1: [[1, 6]], 2: [[1, 5], [1, 7]], 3: [[1, 6], [1, 4], [1, 8]] },
};

/**
 * Look de chaque case (même grille que le plan), pour le dessin seulement :
 * G bloc d'acier, F ventilation, V mur à grille, R tonneau. Tous bloquent
 * pareil (ce sont des « # » dans le plan). « s » = grille au sol (praticable).
 */
export const FACTORY_LOOK: string[] = [
  "###############",
  "#V____G_G____V#",
  "#G_F.__s__.F_G#",
  "#F.__.___.__.F#",
  "#___R__G__R___#",
  "#__G_______G__#",
  "#S_____z_____S#",
  "#__G_______G__#",
  "#___R__G__R___#",
  "#F.__.___.__.F#",
  "#G_F.__s__.F_G#",
  "#V____G_G____V#",
  "###############",
];
