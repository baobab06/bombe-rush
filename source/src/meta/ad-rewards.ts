/**
 * Récompenses des pubs : règles pures sur le profil (testables).
 * Une récompense n'est donnée QUE lorsque la régie confirme que la pub
 * récompensée a été regardée jusqu'au bout (voir src/ads/service.ts).
 */
import { ADS } from "../ads/config";
import { trustedNow } from "./clock";
import { grant, type Granted } from "./grants";
import type { Profile } from "./profile";
import { dayKey } from "./store";
import type { CoinTransaction } from "./rewards";

export interface AdState {
  day: string;
  coins: number;
  freeChest: number;
  /** parties dont les pièces ont déjà été doublées */
  doubled: string[];
  /** dernière pub affichée (ms) et parties jouées depuis */
  lastAdAt: number;
  gamesSinceAd: number;
  /** consentement : null = pas encore demandé */
  personalized: boolean | null;
}

export const defaultAdState = (): AdState => ({ day: "", coins: 0, freeChest: 0, doubled: [], lastAdAt: 0, gamesSinceAd: 0, personalized: null });

function today(p: Profile, now?: Date): AdState {
  const st = p.ads;
  const d = dayKey(trustedNow(p, now));
  if (st.day !== d) {
    st.day = d;
    st.coins = 0;
    st.freeChest = 0;
  }
  return st;
}

export function coinsAdLeft(p: Profile, now?: Date): number {
  return Math.max(0, ADS.rewarded.coins.perDay - today(p, now).coins);
}
export function freeChestAdLeft(p: Profile, now?: Date): number {
  return Math.max(0, ADS.rewarded.freeChest.perDay - today(p, now).freeChest);
}

/** Bonus possible pour doubler cette partie (0 = impossible). */
export function doubleAmount(p: Profile, tx: CoinTransaction | null): number {
  if (!tx || tx.applied <= 0 || p.ads.doubled.includes(tx.matchId)) return 0;
  return Math.min(tx.applied, ADS.rewarded.double.maxBonus);
}

/** À appeler UNIQUEMENT après confirmation « pub vue jusqu'au bout ». */
export function grantAdReward(p: Profile, placement: "coins" | "freeChest" | "double", tx?: CoinTransaction | null, now?: Date): Granted[] | null {
  const st = today(p, now);
  st.lastAdAt = Date.now();
  st.gamesSinceAd = 0;
  if (placement === "coins") {
    if (coinsAdLeft(p, now) <= 0) return null;
    st.coins++;
    return grant(p, { kind: "coins", amount: ADS.rewarded.coins.amount }, [], "Vidéo récompensée");
  }
  if (placement === "freeChest") {
    if (freeChestAdLeft(p, now) <= 0) return null;
    st.freeChest++;
    return grant(p, { kind: "chest", tier: ADS.rewarded.freeChest.tier }, [], "Vidéo récompensée");
  }
  const amount = doubleAmount(p, tx ?? null);
  if (!amount || !tx) return null;
  st.doubled.push(tx.matchId);
  if (st.doubled.length > 50) st.doubled.splice(0, st.doubled.length - 50);
  return grant(p, { kind: "coins", amount }, [], "Gains doublés");
}

/** Une partie vient de se terminer (compteur des pubs entre deux parties). */
export function noteGamePlayed(p: Profile) {
  p.ads.gamesSinceAd++;
}

/** Peut-on proposer une pub entre deux parties maintenant ? (jamais pendant un combat : appelé hors partie) */
export function interstitialDue(p: Profile, sessionGames: number, nowMs = Date.now()): boolean {
  const c = ADS.interstitial;
  if (sessionGames < c.graceGames) return false;
  if (p.ads.gamesSinceAd < c.minGamesBetween) return false;
  return nowMs - p.ads.lastAdAt >= c.minSecondsBetween * 1000;
}

export function noteInterstitialShown(p: Profile, nowMs = Date.now()) {
  p.ads.lastAdAt = nowMs;
  p.ads.gamesSinceAd = 0;
}
