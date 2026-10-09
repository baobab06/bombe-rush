/**
 * FIN DE PARTIE — orchestre tout ce qu'une partie rapporte, UNE seule fois :
 * pièces (rewards.ts), XP du compte et niveaux, maîtrise du personnage joué,
 * rang, série, missions du jour et de la semaine, succès.
 */
import { checkAchievements } from "./achievements";
import { addXp, type Granted } from "./grants";
import { addMastery, type MasteryGain } from "./mastery";
import { LEVEL_MAX, XP_BY_PLACE, XP_DRAW_COLUMN, levelXp } from "./progress-config";
import type { AchievementDef } from "./progress-config";
import type { MissionDef } from "./economy";
import type { WeeklyDef } from "./progress-config";
import type { Profile } from "./profile";
import { settleMatch, type CoinTransaction, type MatchContext, type Placement } from "./rewards";
import { progressMissions } from "./store";
import { progressWeekly } from "./weekly";

/** XP nécessaire pour passer du niveau `level` au suivant (voir progress-config). */
export const xpToNext = (level: number) => levelXp(Math.min(level, LEVEL_MAX));

export interface MatchOutcome {
  won: boolean;
  draw: boolean;
  place: number;
  players: number;
  kills: number;
  bombsPlaced: number;
  blocksDestroyed?: number;
  bonusesPicked?: number;
  survivalTime: number;
  modeId?: string;
  /** personnage joué (maîtrise) */
  characterId?: string;
}

export interface XpLine {
  label: string;
  xp: number;
}

export interface RewardSummary {
  /** XP de la partie (place) */
  xp: number;
  lines: XpLine[];
  levelBefore: number;
  xpBefore: number;
  levelAfter: number;
  xpAfter: number;
  levelsGained: number;
  /** la transaction de pièces (unique) de cette partie */
  tx: CoinTransaction;
  mastery: MasteryGain | null;
  /** récompenses gagnées (niveaux, maîtrise, rang, série) */
  granted: Granted[];
  missionsDone: MissionDef[];
  weeklyDone: WeeklyDef[];
  achievements: AchievementDef[];
}

/** XP de la partie selon la place (colonne du barème). */
export function placeXp(column: number, draw = false): number {
  if (column <= 0) return 0;
  return XP_BY_PLACE[(draw ? XP_DRAW_COLUMN : column) - 1] ?? 0;
}

/** Place finale (barème des pièces) à partir du résultat de la partie. */
export function placementOf(o: MatchOutcome): Placement {
  return { place: o.won ? 1 : Math.max(1, o.place), players: o.players, draw: o.draw };
}

const ORD = ["1re place", "2e place", "3e place", "4e place"];

/**
 * Fin de partie : pièces (une seule transaction), XP, statistiques, missions.
 * Renvoie null si cette partie a déjà été réglée (aucun double gain possible).
 */
export function applyMatch(p: Profile, o: MatchOutcome, ctx: MatchContext, now = new Date()): RewardSummary | null {
  const levelBefore = p.level;
  const xpBefore = p.xp;
  const tx = settleMatch(p, ctx, placementOf(o), now);
  if (!tx) return null;
  const granted: Granted[] = [...(tx.streakBonus ?? []), ...(tx.rank?.granted ?? [])];
  const xp = placeXp(tx.column, o.draw);
  const lines: XpLine[] = [{ label: o.draw ? "Égalité" : ORD[tx.column - 1] ?? "Partie", xp }];
  const streakXp = tx.streakBonus?.find((g) => g.reward.kind === "xp");
  if (streakXp && streakXp.reward.kind === "xp") lines.push({ label: `Série de ${tx.streak}`, xp: streakXp.reward.amount });
  // statistiques
  p.played++;
  if (o.won) p.wins++;
  else p.losses++;
  p.kills += o.kills;
  p.bombsPlaced += o.bombsPlaced;
  p.blocksDestroyed += o.blocksDestroyed ?? 0;
  p.bonusesPicked += o.bonusesPicked ?? 0;
  p.bestSurvival = Math.max(p.bestSurvival, o.survivalTime);
  const hard = ctx.stake === "hard" || ctx.stake === "expert";
  if (o.won && ctx.stake === "expert" && !ctx.online) p.stats.expertWins++;
  if (o.won && hard && !ctx.online) p.stats.hardWins++;
  if ((o.modeId ?? ctx.modeId) === "chaos") p.stats.chaosPlayed++;
  if (ctx.online) p.stats.onlinePlayed++;
  // maîtrise : seulement le personnage joué
  const mastery = o.characterId ? addMastery(p, o.characterId, xp, o.kills, o.won) : null;
  if (mastery) granted.push(...mastery.granted);
  // XP du compte (+ récompenses de niveau)
  addXp(p, xp, granted);
  const facts = { won: o.won, kills: o.kills, blocks: o.blocksDestroyed ?? 0, bonuses: o.bonusesPicked ?? 0, bombs: o.bombsPlaced, survival: o.survivalTime, modeId: o.modeId ?? ctx.modeId ?? "classic" };
  const missionsDone = progressMissions(p, facts, now);
  const weeklyDone = progressWeekly(
    p,
    { won: o.won, place: o.draw ? 1 : tx.place, kills: o.kills, blocks: facts.blocks, bonuses: facts.bonuses, hard: hard && !ctx.online, chaos: facts.modeId === "chaos", online: !!ctx.online },
    now,
  );
  const achievements = checkAchievements(p, now.getTime());
  return {
    xp: xp + (streakXp && streakXp.reward.kind === "xp" ? streakXp.reward.amount : 0),
    lines,
    levelBefore,
    xpBefore,
    levelAfter: p.level,
    xpAfter: p.xp,
    levelsGained: p.level - levelBefore,
    tx,
    mastery,
    granted,
    missionsDone,
    weeklyDone,
    achievements,
  };
}
