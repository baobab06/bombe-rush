/**
 * Définition déclarative d'une map. Ajouter une map = ajouter un fichier
 * comme forest.ts + un thème de rendu dans render/themes.ts.
 *
 * Légende du plan :
 *   #  mur indestructible
 *   .  case pouvant recevoir un bloc destructible
 *   _  case toujours vide (clairière, chemin…)
 *   S  spawn principal (joueurs 1-4)
 *   s  spawn supplémentaire (joueurs 5-6)
 *   L  lave (infranchissable, les flammes passent)
 *   ~  eau  (infranchissable, les flammes passent)
 *   I  glace pouvant recevoir un bloc     i  glace toujours libre
 *   V  cheminée volcanique (éruptions périodiques)
 */
export interface MapDef {
  id: string;
  name: string;
  subtitle: string;
  theme: string;
  layout: string[];
  blockDensity: number; // 0..1 sur les cases '.'
  /** distance (en cases) dégagée autour de chaque spawn */
  spawnClear: number;
  /** portée de bombe au départ (sert à garantir une cachette au spawn) */
  startRange: number;
  available: boolean;
  /**
   * Modes où la carte est jouable (absent = Classique et Chaos).
   * Les cartes Domination listent "koth" et dessinent leurs zones avec des
   * dalles « z » : chaque groupe de dalles connexe = un emplacement de zone.
   */
  modes?: string[];
  /** départs toujours aux positions S / s du plan (pas de tirage au sort) */
  fixedSpawns?: boolean;
}
