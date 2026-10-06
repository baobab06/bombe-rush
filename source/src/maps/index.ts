import { BEACH } from "./beach";
import { FOREST } from "./forest";
import { ICE } from "./ice";
import { VOLCANO } from "./volcano";
import type { MapDef } from "./types";

/** Maps jouables. Ajouter une map = un fichier ici + un thème dans render/art.ts. */
export const MAPS: MapDef[] = [FOREST, VOLCANO, ICE, BEACH];

export const RANDOM_MAP = "random";

export function getMap(id: string): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

export function pickMap(id: string, rand: () => number = Math.random): MapDef {
  if (id === RANDOM_MAP) return MAPS[Math.floor(rand() * MAPS.length)];
  return getMap(id);
}
