import { BEACH } from "./beach";
import { FOREST } from "./forest";
import { ICE } from "./ice";
import { LABYRINTH } from "./labyrinth";
import { VOLCANO } from "./volcano";
import type { MapDef } from "./types";

/** Maps jouables. Ajouter une map = un fichier ici + un thème dans render/art.ts. */
export const MAPS: MapDef[] = [FOREST, VOLCANO, ICE, BEACH, LABYRINTH];

export const RANDOM_MAP = "random";

export function getMap(id: string): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

export function pickMap(id: string, rand: () => number = Math.random): MapDef {
  // carte inconnue (ex. une map retirée, encore mémorisée dans un profil) : au hasard
  if (id === RANDOM_MAP || !MAPS.some((m) => m.id === id)) return MAPS[Math.floor(rand() * MAPS.length)];
  return getMap(id);
}
