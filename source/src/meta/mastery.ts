/**
 * MAÎTRISE DES PERSONNAGES — seul le personnage joué progresse.
 * Paliers 5/10/15/20/30/40/50 : récompenses cosmétiques (aucun avantage en
 * partie), données une seule fois (le niveau ne redescend jamais).
 */
import { getCharacter } from "../core/characters";
import { grantAll, type Granted } from "./grants";
import { MASTERY_MAX, MASTERY_PER_KILL, MASTERY_STEPS, masteryRewards, masteryXp, type Reward } from "./progress-config";
import type { MasteryState, Profile } from "./profile";

export function masteryOf(p: Profile, characterId: string): MasteryState {
  return p.mastery[characterId] ?? { level: 1, xp: 0, games: 0, kills: 0, wins: 0 };
}

export interface MasteryGain {
  characterId: string;
  xp: number;
  levelBefore: number;
  xpBefore: number;
  levelAfter: number;
  xpAfter: number;
  granted: Granted[];
}

/** Partie terminée avec ce personnage. */
export function addMastery(p: Profile, characterId: string, placeXp: number, kills: number, won: boolean): MasteryGain {
  const m = { ...masteryOf(p, characterId) };
  const before = { level: m.level, xp: m.xp };
  const xp = Math.max(0, Math.floor(placeXp + kills * MASTERY_PER_KILL));
  m.games++;
  m.kills += kills;
  if (won) m.wins++;
  m.xp += xp;
  const granted: Granted[] = [];
  const rewards = masteryRewards(characterId);
  const name = getCharacter(characterId).name;
  while (m.level < MASTERY_MAX && m.xp >= masteryXp(m.level)) {
    m.xp -= masteryXp(m.level);
    m.level++;
    if (rewards[m.level]) grantAll(p, rewards[m.level], granted, `Maîtrise ${name} ${m.level}`);
  }
  if (m.level >= MASTERY_MAX) m.xp = Math.min(m.xp, masteryXp(MASTERY_MAX) - 1);
  p.mastery[characterId] = m;
  return { characterId, xp, levelBefore: before.level, xpBefore: before.xp, levelAfter: m.level, xpAfter: m.xp, granted };
}

/** Prochain palier de maîtrise et sa récompense. */
export function nextMasteryStep(p: Profile, characterId: string): { level: number; rewards: Reward[] } | null {
  const lvl = masteryOf(p, characterId).level;
  const step = MASTERY_STEPS.find((s) => s > lvl);
  return step ? { level: step, rewards: masteryRewards(characterId)[step] } : null;
}

export function bestMastery(p: Profile): number {
  return Math.max(1, ...Object.values(p.mastery).map((m) => m.level));
}
export function charactersPlayed(p: Profile): number {
  return Object.values(p.mastery).filter((m) => m.games > 0).length;
}
