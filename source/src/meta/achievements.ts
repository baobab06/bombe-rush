/**
 * SUCCÈS — uniquement des objectifs mesurables à partir du profil.
 * Un succès débloqué l'est pour toujours ; sa récompense se récupère une
 * seule fois (bouton RÉCUPÉRER dans le profil).
 */
import { CATALOG } from "./catalog";
import { grantAll, type Granted } from "./grants";
import { bestMastery, charactersPlayed } from "./mastery";
import { ACHIEVEMENTS, type AchStat, type AchievementDef } from "./progress-config";
import type { Profile } from "./profile";
import { rankIndex } from "./rank";
import { owns } from "./store";

export function achStat(p: Profile, s: AchStat): number {
  switch (s) {
    case "played": return p.played;
    case "wins": return p.wins;
    case "kills": return p.kills;
    case "blocks": return p.blocksDestroyed;
    case "bombs": return p.bombsPlaced;
    case "bonuses": return p.bonusesPicked;
    case "coinsEarned": return p.coinsEarned;
    case "level": return p.level;
    case "bestStreak": return Math.max(p.stats.bestWinStreak, p.winStreak);
    case "bestMastery": return bestMastery(p);
    case "charsPlayed": return charactersPlayed(p);
    case "owned": return CATALOG.filter((i) => !i.free && owns(p, i.id)).length;
    case "chests": return p.stats.chestsOpened;
    case "missions": return p.stats.missionsClaimed;
    case "expertWins": return p.stats.expertWins;
    case "chaos": return p.stats.chaosPlayed;
    case "online": return p.stats.onlinePlayed;
    case "rank": return Math.max(p.rank.best, rankIndex(p.rank.points));
    case "loginDays": return p.stats.loginDays;
  }
}

export const achDesc = (a: AchievementDef) => a.desc.replace("{n}", a.goal.toLocaleString("fr-FR").replace(/ | /g, " "));

export interface AchView {
  def: AchievementDef;
  value: number;
  unlocked: boolean;
  claimed: boolean;
  at?: number;
}
export function achievementList(p: Profile): AchView[] {
  return ACHIEVEMENTS.map((def) => {
    const st = p.achievements[def.id];
    return { def, value: Math.min(def.goal, achStat(p, def.stat)), unlocked: !!st, claimed: !!st?.claimed, at: st?.at };
  });
}

/** Débloque les succès atteints ; renvoie les NOUVEAUX. */
export function checkAchievements(p: Profile, now = Date.now()): AchievementDef[] {
  const fresh: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (p.achievements[def.id]) continue;
    if (achStat(p, def.stat) >= def.goal) {
      p.achievements[def.id] = { at: now, claimed: false };
      fresh.push(def);
    }
  }
  return fresh;
}

/** Récupère la récompense d'un succès (une seule fois). */
export function claimAchievement(p: Profile, id: string): Granted[] | null {
  const st = p.achievements[id];
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!st || !def || st.claimed) return null;
  st.claimed = true;
  return grantAll(p, def.reward, [], `Succès ${def.name}`);
}

export function achievementsToClaim(p: Profile): number {
  return Object.values(p.achievements).filter((a) => !a.claimed).length;
}
