import { BEACH } from "./beach";
import { CASTLE } from "./castle";
import { FOREST } from "./forest";
import { ICE } from "./ice";
import { LABYRINTH } from "./labyrinth";
import { TEMPLE } from "./temple";
import { VOLCANO } from "./volcano";
import type { MapDef } from "./types";

/** Maps jouables. Ajouter une map = un fichier ici + un thème dans render/art.ts. */
export const MAPS: MapDef[] = [FOREST, VOLCANO, ICE, BEACH, LABYRINTH, TEMPLE, CASTLE];

/** Modes d'une carte (par défaut : Classique et Chaos). */
const DEFAULT_MODES = ["classic", "chaos"];
export function mapAllows(map: MapDef, modeId: string): boolean {
  return (map.modes ?? DEFAULT_MODES).includes(modeId);
}
/** Cartes jouables dans un mode (Domination : seulement ses cartes à elle). */
export function mapsFor(modeId: string): MapDef[] {
  const list = MAPS.filter((m) => mapAllows(m, modeId));
  return list.length ? list : MAPS.filter((m) => !m.modes);
}

export const RANDOM_MAP = "random";

export function getMap(id: string): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

export function pickMap(id: string, rand: () => number = Math.random, modeId?: string): MapDef {
  const pool = modeId ? mapsFor(modeId) : MAPS.filter((m) => !m.modes);
  // carte inconnue, retirée, ou pas faite pour ce mode : au hasard parmi celles du mode
  if (id === RANDOM_MAP || !pool.some((m) => m.id === id)) return pool[Math.floor(rand() * pool.length)];
  return getMap(id);
}
