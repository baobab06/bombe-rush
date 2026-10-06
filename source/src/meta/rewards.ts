/**
 * MOTEUR DE RÉCOMPENSES — toutes les pièces de fin de partie passent ici.
 *
 * Règles :
 *  - une partie = UNE transaction (identifiant de partie mémorisé : impossible
 *    de la régler deux fois, même après rechargement ou retour au menu) ;
 *  - victoire : +mise de la difficulté, puis modificateurs (événements…) ;
 *  - défaite ou abandon : −mise, jamais en dessous de 0 pièce ;
 *  - une partie commencée est notée « en cours » : quitter, recharger ou
 *    fermer l'appli pendant la partie = défaite (pas d'esquive possible).
 *
 * Pour ajouter plus tard un bonus (série de victoires, première victoire du
 * jour, multiplicateur temporaire, coffre…) : ajouter une fonction dans
 * WIN_MODIFIERS. Rien d'autre à toucher.
 */
import { DRAW_COINS, STAKES, activeEvents, type StakeId } from "./economy";
import type { Profile } from "./profile";

export type Outcome = "win" | "loss" | "draw" | "abandon";

export interface MatchContext {
  matchId: string;
  stake: StakeId;
  modeId: string;
  online?: boolean;
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
  /** mise de base (+ ou −) */
  base: number;
  /** bonus appliqués aux victoires */
  modifiers: CoinLine[];
  /** montant demandé (base + bonus) */
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
  base: number;
  now: Date;
}
export type WinModifier = (m: ModifierInput) => CoinLine | null;

/** Bonus de victoire (multiplicateurs d'événements…). */
export const WIN_MODIFIERS: WinModifier[] = [
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
  // ({ profile, base }) => profile.winStreak >= 3 ? { label: "Série de victoires", amount: Math.round(base * 0.2), icon: "🔥" } : null,
  // ({ profile, now }) => firstWinToday(profile, now) ? { label: "1re victoire du jour", amount: 50, icon: "☀️" } : null,
];

const MAX_REMEMBERED = 200;

export function stakeOf(id: string | undefined): (typeof STAKES)[StakeId] {
  return STAKES[(id as StakeId) in STAKES ? (id as StakeId) : "normal"];
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
 * Règle une partie : ajoute ou retire les pièces, UNE seule fois.
 * Renvoie null si la partie a déjà été réglée.
 */
export function settleMatch(p: Profile, ctx: MatchContext, outcome: Outcome, now = new Date()): CoinTransaction | null {
  if (!ctx.matchId || isSettled(p, ctx.matchId)) return null;
  const st = stakeOf(ctx.stake);
  const before = p.coins;
  let base = 0;
  const modifiers: CoinLine[] = [];
  if (outcome === "win") {
    base = st.win;
    for (const mod of WIN_MODIFIERS) {
      const line = mod({ profile: p, ctx, base, now });
      if (line && line.amount) modifiers.push(line);
    }
  } else if (outcome === "draw") base = DRAW_COINS;
  else base = -st.loss;
  const requested = base + modifiers.reduce((a, l) => a + l.amount, 0);
  // protection du solde : jamais négatif
  const after = Math.max(0, before + requested);
  p.coins = after;
  if (requested > 0) p.coinsEarned += requested;
  p.winStreak = outcome === "win" ? (p.winStreak ?? 0) + 1 : outcome === "draw" ? p.winStreak ?? 0 : 0;
  p.settled.push(ctx.matchId);
  if (p.settled.length > MAX_REMEMBERED) p.settled.splice(0, p.settled.length - MAX_REMEMBERED);
  if (p.pending?.matchId === ctx.matchId) p.pending = null;
  const tx: CoinTransaction = { matchId: ctx.matchId, outcome, stake: ctx.stake, base, modifiers, requested, applied: after - before, before, after, at: now.getTime() };
  p.ledger.push(tx);
  if (p.ledger.length > 30) p.ledger.splice(0, p.ledger.length - 30);
  return tx;
}

/** Partie restée « en cours » (rechargement, appli fermée…) : comptée comme abandon. */
export function settleAbandoned(p: Profile, now = new Date()): CoinTransaction | null {
  const pend = p.pending;
  if (!pend) return null;
  // quitté pendant les 2 s de fin de manche, encore debout : ni gain ni perte
  const tx = settleMatch(p, pend, pend.ending ? "draw" : "abandon", now);
  p.pending = null;
  return tx;
}

export function newMatchId(prefix = "L"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
