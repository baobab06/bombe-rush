/**
 * MODE COMPÉTITION — trophées, ligues et divisions.
 *
 * On démarre à 0 trophée. Chaque partie de Compétition (mode de jeu tiré au
 * hasard, toujours 4 joueurs) fait gagner ou perdre des trophées selon la
 * place : +20 / +10 / −10 / −20 (RANK_RULES). Les trophées donnent une ligue
 * (Bronze → Élite), chacune découpée en divisions I, II, III ; plus on monte,
 * plus les adversaires sont forts.
 *
 * Le classement mondial (server/leaderboard.ts) applique exactement ce barème
 * sur des parties rejouées et vérifiées par le serveur.
 */
import type { Difficulty } from "../core/types";
import { grant, grantAll, type Granted } from "./grants";
import { RANKS, RANK_RULES, type RankDef, type Reward } from "./progress-config";
import type { Profile, RankEntry } from "./profile";
import type { StakeId } from "./economy";

/** Ligue (0 = Bronze). */
export function rankIndex(points: number): number {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (points >= RANKS[k].min) i = k;
  return i;
}
export const rankOf = (points: number): RankDef => RANKS[rankIndex(points)];

/** Un échelon = une division d'une ligue (« Or II »). */
export interface RankStep {
  /** rang dans l'échelle complète (0 = Bronze I) */
  index: number;
  league: number;
  /** 1, 2 ou 3 */
  div: number;
  id: string;
  name: string;
  min: number;
  rank: RankDef;
  /** récompense donnée la première fois qu'on l'atteint */
  reward: Reward[];
}
const ROMAN = ["I", "II", "III", "IV", "V"];
export const STEPS: RankStep[] = RANKS.flatMap((r, li) => {
  const span = (RANKS[li + 1]?.min ?? r.min + RANK_RULES.lastSpan) - r.min;
  return Array.from({ length: RANK_RULES.divisions }, (_, d) => ({
    index: li * RANK_RULES.divisions + d,
    league: li,
    div: d + 1,
    id: d === 0 ? r.id : `${r.id}-${d + 1}`,
    name: `${r.name} ${ROMAN[d]}`,
    min: r.min + Math.round((span * d) / RANK_RULES.divisions / 10) * 10,
    rank: r,
    reward: RANK_RULES.stepRewards[li * RANK_RULES.divisions + d] ?? [],
  }));
});

export function stepIndex(points: number): number {
  let i = 0;
  for (let k = 0; k < STEPS.length; k++) if (points >= STEPS[k].min) i = k;
  return i;
}
export const stepOf = (points: number): RankStep => STEPS[stepIndex(points)];

/** Progression vers la division suivante (0..1) et trophées manquants. */
export function rankProgress(points: number): { rank: RankDef; step: RankStep; next: RankStep | null; ratio: number; missing: number } {
  const step = stepOf(points);
  const next = STEPS[step.index + 1] ?? null;
  if (!next) return { rank: step.rank, step, next, ratio: 1, missing: 0 };
  return { rank: step.rank, step, next, ratio: Math.min(1, (points - step.min) / (next.min - step.min)), missing: next.min - points };
}

export const isTeamMode = (modeId: string | undefined) => RANK_RULES.teamModes.includes(modeId ?? "");

/**
 * Trophées gagnés ou perdus. `column` : colonne du barème (1 à 4, voir
 * columnOf) ; en équipe : 1 = victoire, égalité, sinon défaite.
 * Sous `softUnder` trophées, les pertes sont réduites de moitié.
 */
export function trophyDelta(column: number, points: number, modeId?: string, draw = false): number {
  const c = Math.min(4, Math.max(1, Math.round(column)));
  let d: number;
  if (isTeamMode(modeId)) d = draw ? RANK_RULES.team.draw : c === 1 ? RANK_RULES.team.win : RANK_RULES.team.loss;
  else d = RANK_RULES.places[c - 1];
  if (d < 0 && points < RANK_RULES.softUnder) d = -Math.round(-d * RANK_RULES.softFactor);
  return Math.max(-points, d);
}

const LETTER: Record<string, Difficulty> = { e: "easy", n: "normal", h: "hard", x: "expert" };
/** Niveau des adversaires en Compétition selon les trophées. */
export function compBots(points: number): Difficulty[] {
  const t = RANK_RULES.botsByStep;
  const row = t[Math.min(stepIndex(points), t.length - 1)];
  return [...row].slice(0, RANK_RULES.bots).map((c) => LETTER[c] ?? "normal");
}
/** Barème de pièces utilisé en Compétition : celui du niveau le plus fréquent en face. */
export function compStake(points: number): StakeId {
  const b = compBots(points);
  return b[1] as StakeId;
}
/** Mode de jeu tiré au hasard. */
export function compMode(rand: () => number = Math.random): string {
  const m = RANK_RULES.modes;
  return m[Math.min(m.length - 1, Math.floor(rand() * m.length))];
}

// ------------------------------------------------------------- saisons
/** Saison = mois (UTC) : « 2026-11 ». Chaque mois, tout le monde repart de 0 trophée. */
export const seasonId = (now: number = Date.now()): string => new Date(now).toISOString().slice(0, 7);
/** Début de la saison suivante (ms). */
export function seasonEnd(now: number = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}
export interface SeasonEnd {
  month: string;
  points: number;
  step: RankStep;
  granted: Granted[];
}
/**
 * Nouvelle saison ? Remet les trophées à 0, rend toutes les récompenses
 * d'échelon regagnables et offre la prime de fin de saison. Renvoie la saison
 * terminée (pour l'annoncer), ou null si rien n'a changé.
 */
export function rollSeason(p: Profile, now: number = Date.now()): SeasonEnd | null {
  const id = seasonId(now);
  if (p.rank.month === id) return null;
  const first = !p.rank.month;
  const month = p.rank.month ?? id;
  p.rank.month = id;
  if (first) return null;
  const points = p.rank.points;
  const step = stepOf(points);
  const granted: Granted[] = [];
  if (step.index > 0) grantAll(p, [{ kind: "coins", amount: step.index * RANK_RULES.seasonEndCoins }], granted, "Fin de saison");
  p.rank.last = { month, points };
  p.rank.points = 0;
  p.rank.history = [];
  p.rank.rewarded = [STEPS[0].id];
  return points > 0 ? { month, points, step, granted } : null;
}

export interface RankResult {
  delta: number;
  before: number;
  after: number;
  /** ligue avant / après */
  tierBefore: number;
  tierAfter: number;
  /** échelon (division) avant / après */
  stepBefore: number;
  stepAfter: number;
  /** perte réduite (débutant) */
  protected: boolean;
  granted: Granted[];
}

/** Applique une partie de Compétition réglée (appelé une seule fois par partie, par settleMatch). */
export function applyRank(p: Profile, column: number, place: number, players: number, at: number, modeId?: string, draw = false): RankResult {
  rollSeason(p, at);
  const before = p.rank.points;
  const tierBefore = rankIndex(before);
  const stepBefore = stepIndex(before);
  const delta = column > 0 ? trophyDelta(column, before, modeId, draw) : 0;
  const after = Math.max(0, before + delta);
  p.rank.points = after;
  const tierAfter = rankIndex(after);
  const stepAfter = stepIndex(after);
  const granted: Granted[] = [];
  // récompense d'un échelon : la 1re fois seulement
  for (let i = 1; i <= stepAfter; i++) {
    const s = STEPS[i];
    if (p.rank.rewarded.includes(s.id)) continue;
    p.rank.rewarded.push(s.id);
    grantAll(p, s.reward, granted, s.name);
  }
  p.rank.best = Math.max(p.rank.best, tierAfter);
  p.rank.bestPoints = Math.max(p.rank.bestPoints ?? 0, after);
  const entry: RankEntry = { at, place, players, stake: compStake(before), mode: modeId, delta: after - before, points: after };
  p.rank.history.push(entry);
  if (p.rank.history.length > RANK_RULES.historySize) p.rank.history.splice(0, p.rank.history.length - RANK_RULES.historySize);
  return { delta: after - before, before, after, tierBefore, tierAfter, stepBefore, stepAfter, protected: delta < 0 && before < RANK_RULES.softUnder, granted };
}

/**
 * Personnages ajoutés aux paliers après coup : on les donne tout de suite à
 * ceux qui ont déjà passé ce palier pendant la saison en cours.
 */
export function catchUpRankCharacters(p: Profile): Granted[] {
  const out: Granted[] = [];
  for (const s of STEPS) {
    if (!p.rank.rewarded.includes(s.id)) continue;
    for (const r of s.reward)
      if (r.kind === "item" && r.id.startsWith("chr-") && !p.ownedCharacters.includes(r.id.slice(4))) grant(p, r, out, s.name);
  }
  return out;
}
