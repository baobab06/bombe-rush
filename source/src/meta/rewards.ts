/**
 * MOTEUR DE RÉCOMPENSES — toutes les pièces de fin de partie passent ici.
 *
 * Règles :
 *  - la récompense dépend de la PLACE FINALE (1er, 2e, 3e, 4e) et de la
 *    difficulté : barème STAKES dans economy.ts (seul endroit à modifier) ;
 *  - une partie = UNE transaction (identifiant de partie mémorisé : impossible
 *    de la régler deux fois, même après rechargement ou retour au menu) ;
 *  - les gains positifs passent ensuite par GAIN_MODIFIERS (événements…) ;
 *  - une perte ne fait jamais descendre le solde sous 0 ;
 *  - une partie commencée est notée « en cours » : quitter, recharger ou
 *    fermer l'appli pendant la partie = dernière place (pas d'esquive).
 *
 * Pour ajouter plus tard un bonus (série de victoires, première victoire du
 * jour, multiplicateur temporaire, coffre…) : ajouter une fonction dans
 * GAIN_MODIFIERS. Rien d'autre à toucher.
 */
import { DRAW_COLUMN, PLACE_COLUMNS, STAKES, VOID_COINS, activeEvents, type StakeId } from "./economy";
import type { Profile } from "./profile";

/** Résumé de l'issue (pour l'historique et les statistiques). */
export type Outcome = "win" | "place" | "loss" | "draw" | "abandon" | "void";

/** Place finale du joueur dans une partie. */
export interface Placement {
  /** 1 = premier */
  place: number;
  /** nombre de joueurs au départ */
  players: number;
  /** égalité pour la 1re place (personne ne gagne) */
  draw?: boolean;
  /** partie quittée en cours */
  abandon?: boolean;
  /** partie annulée (ni gain ni perte) */
  void?: boolean;
}

export interface MatchContext {
  matchId: string;
  stake: StakeId;
  modeId: string;
  online?: boolean;
  /** joueurs au départ (4 par défaut) */
  players?: number;
}

export interface CoinLine {
  label: string;
  amount: number;
  icon?: string;
}

export interface CoinTransaction {
  matchId: string;
  outcome: Outcome;
  stake: StakeId;
  place: number;
  players: number;
  /** colonne du barème appliquée (1 à 4) */
  column: number;
  /** montant du barème (+ ou −) */
  base: number;
  /** bonus appliqués aux gains */
  modifiers: CoinLine[];
  /** montant demandé (barème + bonus) */
  requested: number;
  /** montant réellement appliqué au solde (borné à 0 en cas de perte) */
  applied: number;
  before: number;
  after: number;
  at: number;
}

export interface ModifierInput {
  profile: Profile;
  ctx: MatchContext;
  placement: Placement;
  base: number;
  now: Date;
}
export type GainModifier = (m: ModifierInput) => CoinLine | null;

/** Bonus appliqués aux gains positifs (1er, 2e…). */
export const GAIN_MODIFIERS: GainModifier[] = [
  // événements « ×N pièces » (voir EVENTS dans economy.ts)
  ({ ctx, base, now }) => {
    let extra = 0;
    let name = "";
    for (const e of activeEvents(now)) {
      if (e.modeId && e.modeId !== ctx.modeId) continue;
      extra += Math.round(base * (e.coinMultiplier - 1));
      name = name ? `${name} + ${e.name}` : e.name;
    }
    return extra > 0 ? { label: name, amount: extra, icon: "🎉" } : null;
  },
  // exemples prêts à activer :
  // ({ profile, placement, base }) => placement.place === 1 && profile.winStreak >= 2 ? { label: "Série de victoires", amount: Math.round(base * 0.2), icon: "🔥" } : null,
  // ({ profile, placement, now }) => placement.place === 1 && firstWinToday(profile, now) ? { label: "1re victoire du jour", amount: 50, icon: "☀️" } : null,
];

const MAX_REMEMBERED = 200;

export function stakeOf(id: string | undefined): (typeof STAKES)[StakeId] {
  return STAKES[(id as StakeId) in STAKES ? (id as StakeId) : "normal"];
}

/** Colonne du barème (1 à 4) pour une place donnée. */
export function columnOf(pl: Placement): number {
  const n = Math.max(2, pl.players);
  if (pl.draw) return DRAW_COLUMN;
  if (pl.abandon) return 4;
  const place = Math.min(Math.max(1, Math.round(pl.place)), n);
  const table = PLACE_COLUMNS[n];
  if (table) return table[place - 1];
  // plus de 4 joueurs
  if (place === 1) return 1;
  if (place === n) return 4;
  return place <= n / 2 ? 2 : 3;
}

/** Montant du barème (avant bonus) pour une place. */
export function placeAmount(stake: string | undefined, pl: Placement): number {
  if (pl.void) return VOID_COINS;
  return stakeOf(stake).places[columnOf(pl) - 1];
}

/** Barème lisible pour un nombre de joueurs : [{ place, amount }] (bandeaux). */
export function stakeTable(stake: string | undefined, players: number): { place: number; amount: number }[] {
  const n = Math.max(2, players);
  return Array.from({ length: n }, (_, i) => ({ place: i + 1, amount: placeAmount(stake, { place: i + 1, players: n }) }));
}

/** Pire perte possible (= dernière place, ou abandon). */
export function maxLoss(stake: string | undefined, players: number): number {
  return -placeAmount(stake, { place: players, players, abandon: true });
}

export function outcomeOf(pl: Placement, base: number): Outcome {
  if (pl.void) return "void";
  if (pl.abandon) return "abandon";
  if (pl.draw) return "draw";
  if (pl.place === 1) return "win";
  return base > 0 ? "place" : "loss";
}

/** Partie déjà réglée ? */
export function isSettled(p: Profile, matchId: string): boolean {
  return p.settled.includes(matchId);
}

/** Note la partie comme « en cours » (avant le compte à rebours). */
export function beginMatch(p: Profile, ctx: MatchContext) {
  p.pending = { ...ctx, startedAt: Date.now() };
}

/**
 * Règle une partie selon la place finale : ajoute ou retire les pièces,
 * UNE seule fois. Renvoie null si la partie a déjà été réglée.
 */
export function settleMatch(p: Profile, ctx: MatchContext, placement: Placement, now = new Date()): CoinTransaction | null {
  if (!ctx.matchId || isSettled(p, ctx.matchId)) return null;
  const pl: Placement = { ...placement, players: Math.max(2, placement.players || ctx.players || 4) };
  const before = p.coins;
  const base = placeAmount(ctx.stake, pl);
  const modifiers: CoinLine[] = [];
  if (base > 0) {
    for (const mod of GAIN_MODIFIERS) {
      const line = mod({ profile: p, ctx, placement: pl, base, now });
      if (line && line.amount) modifiers.push(line);
    }
  }
  const requested = base + modifiers.reduce((a, l) => a + l.amount, 0);
  // protection du solde : jamais négatif
  const after = Math.max(0, before + requested);
  p.coins = after;
  if (requested > 0) p.coinsEarned += requested;
  const outcome = outcomeOf(pl, base);
  p.winStreak = outcome === "win" ? (p.winStreak ?? 0) + 1 : outcome === "draw" || outcome === "void" ? p.winStreak ?? 0 : 0;
  p.settled.push(ctx.matchId);
  if (p.settled.length > MAX_REMEMBERED) p.settled.splice(0, p.settled.length - MAX_REMEMBERED);
  if (p.pending?.matchId === ctx.matchId) p.pending = null;
  const tx: CoinTransaction = {
    matchId: ctx.matchId,
    outcome,
    stake: ctx.stake,
    place: pl.place,
    players: pl.players,
    column: pl.void ? 0 : columnOf(pl),
    base,
    modifiers,
    requested,
    applied: after - before,
    before,
    after,
    at: now.getTime(),
  };
  p.ledger.push(tx);
  if (p.ledger.length > 30) p.ledger.splice(0, p.ledger.length - 30);
  return tx;
}

/**
 * Partie restée « en cours » (rechargement, appli fermée…) : dernière place.
 * Exception : quittée pendant la seconde de fin de manche alors qu'on était
 * encore debout → au pire une égalité pour la 1re place.
 */
export function settleAbandoned(p: Profile, now = new Date()): CoinTransaction | null {
  const pend = p.pending;
  if (!pend) return null;
  const players = Math.max(2, pend.players ?? 4);
  const tx = settleMatch(p, pend, pend.ending ? { place: 1, players, draw: true } : { place: players, players, abandon: true }, now);
  p.pending = null;
  return tx;
}

export function newMatchId(prefix = "L"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
