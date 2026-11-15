import type { MapDef } from "./types";

/**
 * Far West (Ruée vers l'or) : ville de chercheurs d'or en plein désert.
 * - deux rangées de maisons (murs) de part et d'autre de la GRAND-RUE ;
 * - « $ » = FILON D'OR (rocher doré : grosse pépite garantie, repousse) ;
 *   le plus gros au milieu de la grand-rue, deux dans chaque coin de ville ;
 * - tonneaux et caisses assez espacés pour courir.
 * Plan symétrique (gauche/droite et haut/bas).
 */
export const WESTERN: MapDef = {
  id: "western",
  name: "Far West",
  subtitle: "Ville des chercheurs d'or",
  theme: "western",
  layout: [
    "#############",
    "#S..#._.#..S#",
    "#.$.#...#.$.#",
    "#...........#",
    "##.##.$.##.##",
    "#s____$____s#",
    "##.##.$.##.##",
    "#...........#",
    "#.$.#...#.$.#",
    "#S..#._.#..S#",
    "#############",
  ],
  blockDensity: 0.5,
  spawnClear: 1,
  startRange: 1,
  available: true,
  modes: ["gold"],
};
