/**
 * BANQUE — bombers (monnaie premium) : échange contre des pièces et
 * crédit des achats faits avec de l'argent réel (Google Play).
 * Fonctions pures sur le profil (aucun DOM), comme store.ts.
 */
import { BOMBER_WELCOME_GIFT, EXCHANGES, PACKS, type PackDef } from "./economy";
import { grant, type Granted } from "./grants";
import type { Profile } from "./profile";

export const getPack = (productId: string): PackDef | undefined => PACKS.find((x) => x.id === productId);

/** Cadeau de découverte des bombers (une seule fois). */
export function grantBomberGift(p: Profile): number {
  if (p.bomberGift) return 0;
  p.bomberGift = true;
  p.bombers += BOMBER_WELCOME_GIFT;
  return BOMBER_WELCOME_GIFT;
}

export type ExchangeResult = { ok: true; bombers: number; coins: number } | { ok: false; reason: "unknown" | "bombers"; missing?: number };

/** Échange des bombers contre des pièces. */
export function exchange(p: Profile, exchangeId: string): ExchangeResult {
  const x = EXCHANGES.find((e) => e.id === exchangeId);
  if (!x) return { ok: false, reason: "unknown" };
  if (p.bombers < x.bombers) return { ok: false, reason: "bombers", missing: x.bombers - p.bombers };
  p.bombers -= x.bombers;
  p.coins += x.coins;
  p.coinsEarned += x.coins;
  return { ok: true, bombers: x.bombers, coins: x.coins };
}

/** Cet achat (jeton Google Play) a-t-il déjà été crédité ? */
export const isCredited = (p: Profile, token: string) => p.purchases.some((x) => x.token === token);

/**
 * Crédite un achat en argent réel, UNE SEULE FOIS par jeton d'achat
 * (l'appli peut le signaler plusieurs fois : retour réseau, redémarrage…).
 * Renvoie null si le produit est inconnu ou déjà crédité.
 * À appeler uniquement quand Google Play confirme l'achat (état PURCHASED).
 */
export function creditPurchase(p: Profile, productId: string, token: string, now = Date.now()): Granted[] | null {
  const pack = getPack(productId);
  if (!pack || !token || isCredited(p, token)) return null;
  p.purchases.push({ token, productId, at: now });
  if (p.purchases.length > 200) p.purchases.splice(0, p.purchases.length - 200);
  return grant(p, { kind: pack.currency, amount: pack.amount }, [], "Achat");
}
