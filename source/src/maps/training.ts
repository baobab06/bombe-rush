import type { MapDef } from "./types";

/**
 * Terrain d'entraînement (tutoriel) : petite arène de forêt, sans danger.
 * Les caisses et leurs bonus sont posés par le mode « training »
 * (core/training.ts) pour que chaque nouveau joueur vive la même leçon.
 * Absente de MAPS : jamais tirée au sort, jamais proposée en partie.
 */
export const TRAINING: MapDef = {
  id: "training",
  name: "Terrain d'entraînement",
  subtitle: "Pour apprendre sans risque",
  theme: "forest",
  layout: [
    "#############",
    "#S__________#",
    "#_#_#_#_#_#_#",
    "#___________#",
    "#_#_#_#_#_#_#",
    "#__________S#",
    "#############",
  ],
  blockDensity: 0,
  spawnClear: 1,
  startRange: 2,
  available: false,
  modes: ["training"],
  fixedSpawns: true,
};
