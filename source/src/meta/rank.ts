/**
 * RANG COMPÉTITIF (Bronze → Élite).
 *
 * Points gagnés ou perdus selon la place, la difficulté et le nombre
 * d'adversaires (RANK_RULES). Parties classées : contre les bots, résultat
 * calculé sur l'appareil. C'est un rang PERSONNEL : il n'existe pas de
 * classement mondial (il faudrait des comptes et des résultats validés par le
 * serveur). L'interface `Leaderboard` ci-dessous est prête pour ce jour-là.
 */
import { grantAll, type Granted } from "./grants";
import { RANKS, RANK_RULES, type RankDef } from "./progress-config";
import type { Profile, RankEntry } from "./profile";
import type { StakeId } from "./economy";

export function rankIndex(points: number): number {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (points >= RANKS[k].min) i = k;
  return i;
}
export const rankOf = (points: number): RankDef => RANKS[rankIndex(points)];

/** Progression vers le rang suivant (0..1) et points manquants. */
export function rankProgress(points: number): { rank: RankDef; next: RankDef | null; ratio: number; missing: number } {
  const i = rankIndex(points);
  const rank = RANKS[i];
  const next = RANKS[i + 1] ?? null;
  if (!next) return { rank, next, ratio: 1, missing: 0 };
  return { rank, next, ratio: (points - rank.min) / (next.min - rank.min), missing: next.min - points };
}

export interface RankResult {
  delta: number;
  before: number;
  after: number;
  tierBefore: number;
  tierAfter: number;
  /** points négatifs annulés (rang protégé) */
  protected: boolean;
  granted: Granted[];
}

/** La partie compte-t-elle pour le rang ? */
export function isRanked(online: boolean | undefined): boolean {
  return online ? RANK_RULES.online : RANK_RULES.solo;
}

/** Variation de points pour une colonne du barème (1 à 4). */
export function rankDelta(column: number, stake: StakeId, players: number): number {
  const base = RANK_RULES.places[Math.min(4, Math.max(1, column)) - 1];
  const opp = Math.min(1, Math.max(1, players - 1) * RANK_RULES.perOpponent);
  return Math.round(base * (RANK_RULES.difficulty[stake] ?? 1) * opp);
}

/** Applique une partie réglée au rang (appelé une seule fois par partie, par settleMatch). */
export function applyRank(p: Profile, column: number, stake: StakeId, players: number, place: number, at: number): RankResult {
  const before = p.rank.points;
  const tierBefore = rankIndex(before);
  let delta = column > 0 ? rankDelta(column, stake, players) : 0;
  let prot = false;
  if (delta < 0 && RANK_RULES.protectedRanks.includes(RANKS[tierBefore].id)) {
    delta = 0;
    prot = true;
  }
  const after = Math.max(0, before + delta);
  p.rank.points = after;
  const tierAfter = rankIndex(after);
  const granted: Granted[] = [];
  // récompense du rang : la 1re fois seulement
  for (let i = 1; i <= tierAfter; i++) {
    const r = RANKS[i];
    if (p.rank.rewarded.includes(r.id)) continue;
    p.rank.rewarded.push(r.id);
    grantAll(p, r.reward, granted, `Rang ${r.name}`);
  }
  p.rank.best = Math.max(p.rank.best, tierAfter);
  const entry: RankEntry = { at, place, players, stake, delta: after - before, points: after };
  p.rank.history.push(entry);
  if (p.rank.history.length > RANK_RULES.historySize) p.rank.history.splice(0, p.rank.history.length - RANK_RULES.historySize);
  return { delta: after - before, before, after, tierBefore, tierAfter, protected: prot, granted };
}

/**
 * Architecture prête pour un classement en ligne : un fournisseur qui
 * enverrait les résultats VALIDÉS PAR LE SERVEUR et renverrait le top.
 * Aucun n'est branché : le jeu n'affiche donc aucun faux classement mondial.
 */
export interface Leaderboard {
  submit(entry: RankEntry): Promise<void>;
  top(limit: number): Promise<{ name: string; points: number }[]>;
}
export const leaderboard: Leaderboard | null = null;
