/**
 * DISTRIBUTION DES RÉCOMPENSES — un seul chemin pour tout ce qui se gagne :
 * pièces, XP (et niveaux), objets, coffres. Les doublons sont remplacés par
 * des pièces. Ouverture des coffres (tirage + ajout immédiat au profil).
 *
 * Fonctions pures sur le profil (aucun DOM) : l'interface sauvegarde juste
 * après chaque appel, AVANT de lancer les animations.
 */
import { RARITY_LABEL, RARITY_ORDER, type Rarity } from "../core/characters";
import { CATALOG, getItem, type CatalogItem } from "./catalog";
import {
  CHESTS, CHEST_ORDER, DUPLICATE_COINS, LEVEL_MAX, LEVEL_REWARDS, LEVEL_UP_COINS, levelXp,
  type ChestTier, type Reward,
} from "./progress-config";
import type { Profile } from "./profile";

/** Ce qui a réellement été donné (pour l'affichage). */
export interface Granted {
  reward: Reward;
  /** texte court : « +250 pièces », « Coffre rare », « Titre : Artificier » */
  label: string;
  icon: string;
  /** pièces réellement ajoutées (doublon compris) */
  coins: number;
  itemId?: string;
  rarity?: Rarity;
  /** objet déjà possédé → converti en pièces */
  duplicate?: boolean;
  chest?: ChestTier;
  /** d'où vient la récompense (niveau 10, maîtrise…) */
  source?: string;
}

const KIND_LABEL: Record<string, string> = {
  skin: "Skin", accessory: "Accessoire", trail: "Effet", emote: "Emote", boom: "Explosion", title: "Titre", character: "Personnage",
};
export const itemLabel = (it: CatalogItem) => `${KIND_LABEL[it.kind] ?? "Objet"} : ${it.name}`;
export const fmtN = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ");

export function addCoins(p: Profile, amount: number): number {
  const n = Math.max(0, Math.floor(amount));
  p.coins += n;
  p.coinsEarned += n;
  return n;
}

function hasItem(p: Profile, it: CatalogItem): boolean {
  if (it.kind === "character") return p.ownedCharacters.includes(it.characterId!);
  return it.free || p.owned.includes(it.id);
}

/** Donne une récompense ; les résultats (et niveaux gagnés en chemin) vont dans `out`. */
export function grant(p: Profile, r: Reward, out: Granted[] = [], source?: string): Granted[] {
  switch (r.kind) {
    case "coins": {
      const n = addCoins(p, r.amount);
      if (n) out.push({ reward: r, label: `+${fmtN(n)} pièces`, icon: "🪙", coins: n, source });
      break;
    }
    case "xp":
      if (r.amount > 0) {
        out.push({ reward: r, label: `+${fmtN(r.amount)} XP`, icon: "✨", coins: 0, source });
        addXp(p, r.amount, out);
      }
      break;
    case "chest": {
      const n = Math.max(1, r.count ?? 1);
      p.chests[r.tier] = (p.chests[r.tier] ?? 0) + n;
      out.push({ reward: r, label: `${n > 1 ? `${n} × ` : ""}${CHESTS[r.tier].name}`, icon: "🎁", coins: 0, chest: r.tier, source });
      break;
    }
    case "item": {
      const it = getItem(r.id);
      if (!it) break;
      if (hasItem(p, it)) {
        const n = addCoins(p, DUPLICATE_COINS[it.rarity]);
        out.push({ reward: r, label: `${it.name} (doublon) → +${fmtN(n)} pièces`, icon: "🔁", coins: n, itemId: it.id, rarity: it.rarity, duplicate: true, source });
      } else {
        if (it.kind === "character") p.ownedCharacters.push(it.characterId!);
        else p.owned.push(it.id);
        out.push({ reward: r, label: itemLabel(it), icon: "🎉", coins: 0, itemId: it.id, rarity: it.rarity, source });
      }
      break;
    }
  }
  return out;
}

export function grantAll(p: Profile, list: Reward[], out: Granted[] = [], source?: string): Granted[] {
  for (const r of list) grant(p, r, out, source);
  return out;
}

// ------------------------------------------------------------- niveaux
/** XP du compte ; chaque niveau gagné donne ses récompenses (une seule fois). */
export function addXp(p: Profile, amount: number, out: Granted[] = []): Granted[] {
  if (amount <= 0) return out;
  p.xp += Math.floor(amount);
  while (p.level < LEVEL_MAX && p.xp >= levelXp(p.level)) {
    p.xp -= levelXp(p.level);
    p.level++;
  }
  if (p.level >= LEVEL_MAX) p.xp = Math.min(p.xp, levelXp(LEVEL_MAX) - 1);
  grantLevelRewards(p, out);
  return out;
}

/** Récompenses des niveaux atteints mais pas encore payés (idempotent). */
export function grantLevelRewards(p: Profile, out: Granted[] = []): Granted[] {
  while (p.levelRewardsUpTo < p.level) {
    const lvl = ++p.levelRewardsUpTo;
    grant(p, { kind: "coins", amount: LEVEL_UP_COINS }, out, `Niveau ${lvl}`);
    grantAll(p, LEVEL_REWARDS[lvl] ?? [], out, `Niveau ${lvl}`);
  }
  return out;
}

/** Prochain niveau qui donne une récompense spéciale. */
export function nextLevelReward(p: Profile): { level: number; rewards: Reward[] } | null {
  for (let l = p.level + 1; l <= LEVEL_MAX; l++) if (LEVEL_REWARDS[l]) return { level: l, rewards: LEVEL_REWARDS[l] };
  return null;
}

export function rewardText(r: Reward): string {
  switch (r.kind) {
    case "coins":
      return `${fmtN(r.amount)} pièces`;
    case "xp":
      return `${fmtN(r.amount)} XP`;
    case "chest":
      return CHESTS[r.tier].name;
    case "item": {
      const it = getItem(r.id);
      return it ? itemLabel(it) : "Objet";
    }
  }
}
export function rewardIcon(r: Reward): string {
  return r.kind === "coins" ? "🪙" : r.kind === "xp" ? "✨" : r.kind === "chest" ? "🎁" : "🎉";
}

// ------------------------------------------------------------- coffres
export function chestCount(p: Profile): number {
  return CHEST_ORDER.reduce((a, t) => a + (p.chests[t] ?? 0), 0);
}

/** Objets qu'un coffre peut donner (rien d'exclusif sauf les titres « coffre »). */
export function chestPool(p: Profile, rarity: Rarity): CatalogItem[] {
  return CATALOG.filter(
    (i) =>
      i.rarity === rarity &&
      !i.free &&
      i.kind !== "character" &&
      (!i.exclusive || i.exclusive === "chest") &&
      (i.kind !== "skin" || p.ownedCharacters.includes(i.characterId!)),
  );
}

/** Tire la rareté d'un objet selon les probabilités du coffre. */
export function rollRarity(tier: ChestTier, rnd: () => number): Rarity {
  const odds = CHESTS[tier].odds;
  const total = RARITY_ORDER.reduce((a, r) => a + odds[r], 0);
  let x = rnd() * total;
  for (const r of RARITY_ORDER) {
    x -= odds[r];
    if (x < 0 && odds[r] > 0) return r;
  }
  return [...RARITY_ORDER].reverse().find((r) => odds[r] > 0) ?? "common";
}

export interface ChestOpening {
  tier: ChestTier;
  coins: number;
  items: Granted[];
  at: number;
}

/**
 * Ouvre un coffre : il est retiré de la réserve, le contenu est tiré et
 * AJOUTÉ AU PROFIL immédiatement. L'interface sauvegarde avant l'animation :
 * recharger la page ne peut ni relancer le tirage ni faire perdre le contenu.
 */
export function openChest(p: Profile, tier: ChestTier, rnd: () => number = Math.random): ChestOpening | null {
  if ((p.chests[tier] ?? 0) <= 0) return null;
  p.chests[tier]--;
  const def = CHESTS[tier];
  const coins = addCoins(p, def.coins[0] + Math.floor(rnd() * (def.coins[1] - def.coins[0] + 1)));
  const items: Granted[] = [];
  for (let i = 0; i < def.drops; i++) {
    let rarity = rollRarity(tier, rnd);
    let pool = chestPool(p, rarity);
    // rareté vide (cas improbable) : on descend d'un cran
    while (!pool.length && RARITY_ORDER.indexOf(rarity) > 0) {
      rarity = RARITY_ORDER[RARITY_ORDER.indexOf(rarity) - 1];
      pool = chestPool(p, rarity);
    }
    if (!pool.length) continue;
    // on évite de donner deux fois le même objet dans un coffre
    const fresh = pool.filter((x) => !items.some((g) => g.itemId === x.id));
    const pick = (fresh.length ? fresh : pool)[Math.floor(rnd() * (fresh.length ? fresh : pool).length)];
    grant(p, { kind: "item", id: pick.id }, items, def.name);
  }
  p.stats.chestsOpened++;
  return { tier, coins, items, at: Date.now() };
}

export const rarityLabel = (r: Rarity) => RARITY_LABEL[r];
