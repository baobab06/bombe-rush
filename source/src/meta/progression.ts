import { MATCH_XP, type MissionDef } from "./economy";
import type { Profile } from "./profile";
import { settleMatch, type CoinTransaction, type MatchContext, type Outcome } from "./rewards";
import { progressMissions } from "./store";

/** XP nécessaire pour passer du niveau `level` au suivant. */
export function xpToNext(level: number): number {
  return 100 + (level - 1) * 40;
}

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
}

export interface XpLine {
  label: string;
  xp: number;
}

export interface RewardSummary {
  xp: number;
  lines: XpLine[];
  levelBefore: number;
  xpBefore: number;
  levelAfter: number;
  xpAfter: number;
  levelsGained: number;
  /** la transaction de pièces (unique) de cette partie */
  tx: CoinTransaction;
  missionsDone: MissionDef[];
}

export function computeXp(o: MatchOutcome): XpLine[] {
  const X = MATCH_XP;
  const lines: XpLine[] = [];
  if (o.won) lines.push({ label: "Victoire", xp: X.win });
  else if (o.draw) lines.push({ label: "Égalité", xp: X.draw });
  lines.push({ label: "Participation", xp: X.participation });
  if (!o.won && !o.draw && o.place === 2 && o.players > 2) lines.push({ label: "2e place", xp: X.second });
  if (o.kills > 0) lines.push({ label: `Éliminations ×${o.kills}`, xp: X.perKill * o.kills });
  return lines;
}

export function outcomeOf(o: MatchOutcome): Outcome {
  return o.won ? "win" : o.draw ? "draw" : "loss";
}

/**
 * Fin de partie : pièces (une seule transaction), XP, statistiques, missions.
 * Renvoie null si cette partie a déjà été réglée (aucun double gain possible).
 */
export function applyMatch(p: Profile, o: MatchOutcome, ctx: MatchContext, now = new Date()): RewardSummary | null {
  const tx = settleMatch(p, ctx, outcomeOf(o), now);
  if (!tx) return null;
  const lines = computeXp(o);
  const xp = lines.reduce((a, l) => a + l.xp, 0);
  const levelBefore = p.level;
  const xpBefore = p.xp;
  p.played++;
  if (o.won) p.wins++;
  else p.losses++;
  p.kills += o.kills;
  p.bombsPlaced += o.bombsPlaced;
  p.blocksDestroyed += o.blocksDestroyed ?? 0;
  p.bonusesPicked += o.bonusesPicked ?? 0;
  p.bestSurvival = Math.max(p.bestSurvival, o.survivalTime);
  p.xp += xp;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
  }
  const missionsDone = progressMissions(
    p,
    {
      won: o.won,
      kills: o.kills,
      blocks: o.blocksDestroyed ?? 0,
      bonuses: o.bonusesPicked ?? 0,
      bombs: o.bombsPlaced,
      survival: o.survivalTime,
      modeId: o.modeId ?? "classic",
    },
    now,
  );
  return { xp, lines, levelBefore, xpBefore, levelAfter: p.level, xpAfter: p.xp, levelsGained: p.level - levelBefore, tx, missionsDone };
}
