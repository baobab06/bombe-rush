/**
 * Règles de la boutique, de l'équipement et des récompenses.
 * Fonctions pures sur le profil (aucun DOM) : testables et réutilisables
 * plus tard côté serveur pour valider les achats.
 */
import { EMOTE_SLOTS, getEmote } from "../core/cosmetics";
import { CATALOG, characterItemId, getItem, isBuyable, type CatalogItem, type ItemKind } from "./catalog";
import { trustedNow } from "./clock";
import { FEATURED, MISSIONS, MISSIONS_PER_DAY, NAME_CHANGE_PRICE, NAME_MAX, NAME_MIN, STARTER_GIFT, type MissionDef } from "./economy";
import { grant, grantAll, type Granted } from "./grants";
import { DAILY_MISSION_XP, LOGIN_REWARDS, type Reward } from "./progress-config";
import type { Profile } from "./profile";

// ----------------------------------------------------------------- dates
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dayDiff(a: string, b: string): number {
  const pa = a.split("-").map(Number);
  const pb = b.split("-").map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
/** Petit hasard déterministe (même sélection pour tout le monde le même jour). */
export function seeded(seedStr: string) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -------------------------------------------------------------- possession
export function owns(p: Profile, id: string): boolean {
  const it = getItem(id);
  if (!it) return false;
  if (it.kind === "character") return p.ownedCharacters.includes(it.characterId!);
  return it.free || p.owned.includes(id);
}

/** Un skin n'est utilisable que si on possède aussi son personnage. */
export function usable(p: Profile, id: string): boolean {
  const it = getItem(id);
  if (!it || !owns(p, id)) return false;
  return it.kind !== "skin" || p.ownedCharacters.includes(it.characterId!);
}

// ------------------------------------------------------------- à la une
export interface Featured {
  items: CatalogItem[];
  /** objet en promotion du jour */
  dealId: string;
  /** millisecondes avant le renouvellement */
  refreshIn: number;
}
export function featured(now = new Date()): Featured {
  const rnd = seeded("shop-" + dayKey(now));
  const pool = CATALOG.filter((i) => isBuyable(i) && (i.kind !== "skin" || i.characterId !== "pingo"));
  const picks: CatalogItem[] = [];
  // une pièce maîtresse épique/légendaire + des objets variés
  const big = pool.filter((i) => i.rarity === "legend" || i.rarity === "epic");
  picks.push(big[Math.floor(rnd() * big.length)]);
  while (picks.length < FEATURED.count) {
    const it = pool[Math.floor(rnd() * pool.length)];
    if (!picks.some((p) => p.id === it.id || (p.kind === it.kind && p.kind !== "skin"))) picks.push(it);
  }
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return { items: picks, dealId: picks[0].id, refreshIn: midnight.getTime() - now.getTime() };
}

export function priceOf(id: string, now = new Date()): { price: number; full: number; deal: boolean } {
  const it = getItem(id);
  if (!it) return { price: 0, full: 0, deal: false };
  const f = featured(now);
  if (f.dealId === id) return { price: Math.round((it.price * (1 - FEATURED.dealDiscount)) / 10) * 10, full: it.price, deal: true };
  return { price: it.price, full: it.price, deal: false };
}

// ---------------------------------------------------------------- achat
export type BuyResult = { ok: true; item: CatalogItem; price: number } | { ok: false; reason: "unknown" | "owned" | "coins" | "character" | "exclusive"; missing?: number };

export function buy(p: Profile, id: string, now = new Date()): BuyResult {
  const it = getItem(id);
  if (!it) return { ok: false, reason: "unknown" };
  if (owns(p, id)) return { ok: false, reason: "owned" };
  if (it.exclusive) return { ok: false, reason: "exclusive" };
  if (it.kind === "skin" && !p.ownedCharacters.includes(it.characterId!)) return { ok: false, reason: "character" };
  const { price } = priceOf(id, now);
  if (p.coins < price) return { ok: false, reason: "coins", missing: price - p.coins };
  p.coins -= price;
  if (it.kind === "character") p.ownedCharacters.push(it.characterId!);
  else p.owned.push(id);
  return { ok: true, item: it, price };
}

// ------------------------------------------------------------ équipement
export function isEquipped(p: Profile, id: string): boolean {
  const it = getItem(id);
  if (!it) return false;
  switch (it.kind) {
    case "skin":
      return equippedSkin(p, it.characterId!) === id;
    case "accessory":
      return p.equipped.accessory === id;
    case "trail":
      return p.equipped.trail === id;
    case "emote":
      return p.equipped.emotes.includes(id);
    case "boom":
      return p.equipped.boom === id;
    case "title":
      return p.equipped.title === id;
    case "character":
      return p.characterId === it.characterId;
  }
}

export function equippedSkin(p: Profile, characterId: string): string {
  const id = p.equippedSkins[characterId];
  return id && getItem(id)?.characterId === characterId && owns(p, id) ? id : characterId;
}

/**
 * Équipe un objet possédé. Accessoire / emote : un second appui retire.
 * Renvoie false si l'objet n'est pas utilisable.
 */
export function equip(p: Profile, id: string, opts: { toggle?: boolean } = {}): boolean {
  const it = getItem(id);
  if (!it || !usable(p, id)) return false;
  switch (it.kind) {
    case "skin":
      p.equippedSkins[it.characterId!] = id;
      p.characterId = it.characterId!;
      break;
    case "accessory":
      p.equipped.accessory = opts.toggle && p.equipped.accessory === id ? null : id;
      break;
    case "trail":
      p.equipped.trail = id;
      break;
    case "emote": {
      const list = p.equipped.emotes;
      const at = list.indexOf(id);
      if (at >= 0) {
        if (opts.toggle && list.length > 1) list.splice(at, 1);
      } else {
        if (list.length >= EMOTE_SLOTS) list.shift();
        list.push(id);
      }
      break;
    }
    case "boom":
      p.equipped.boom = id;
      break;
    case "title":
      p.equipped.title = id;
      break;
    case "character":
      p.characterId = it.characterId!;
      break;
  }
  return true;
}

export function countOwned(p: Profile, kind?: ItemKind): { owned: number; total: number } {
  const list = CATALOG.filter((i) => !kind || i.kind === kind);
  return { owned: list.filter((i) => owns(p, i.id)).length, total: list.length };
}

// --------------------------------------------------- cadeau de bienvenue
export function grantStarterGift(p: Profile): number {
  if (p.starterGift) return 0;
  p.starterGift = true;
  p.coins += STARTER_GIFT;
  p.coinsEarned += STARTER_GIFT;
  return STARTER_GIFT;
}

// --------------------------------------------- connexion quotidienne
export interface DailyState {
  available: boolean;
  /** jour du cycle qui sera (ou a été) réclamé aujourd'hui (0..6) */
  index: number;
  rewards: Reward[];
  /** jours déjà réclamés au total */
  streak: number;
}
/**
 * Cycle de 7 jours (LOGIN_REWARDS). Rater un jour ne remet rien à zéro :
 * on reprend le cycle là où on en était. Une seule fois par jour, et
 * reculer l'heure du téléphone ne rouvre pas un jour passé (trustedNow).
 */
export function dailyState(p: Profile, now?: Date): DailyState {
  const today = dayKey(trustedNow(p, now));
  const last = p.daily.last;
  const n = LOGIN_REWARDS.length;
  const claimedToday = last !== null && (last === today || dayDiff(last, today) <= 0);
  if (claimedToday) {
    const idx = (Math.max(1, p.daily.streak) - 1) % n;
    return { available: false, index: idx, rewards: LOGIN_REWARDS[idx], streak: p.daily.streak };
  }
  const idx = p.daily.streak % n;
  return { available: true, index: idx, rewards: LOGIN_REWARDS[idx], streak: p.daily.streak };
}
export function claimDaily(p: Profile, now?: Date): Granted[] | null {
  const st = dailyState(p, now);
  if (!st.available) return null;
  p.daily = { last: dayKey(trustedNow(p, now)), streak: st.streak + 1 };
  p.stats.loginDays++;
  return grantAll(p, st.rewards, [], "Connexion du jour");
}

// ---------------------------------------------------------------- missions
export function missionDef(id: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id);
}
export function missionLabel(d: MissionDef): string {
  return d.label.replace("{n}", String(d.goal));
}
/** Missions du jour (renouvelées à minuit). */
export function ensureMissions(p: Profile, now?: Date) {
  const today = dayKey(trustedNow(p, now));
  if (p.missions.day === today && p.missions.list.length) return p.missions.list;
  const rnd = seeded("missions-" + today + p.name);
  const pool = [...MISSIONS];
  const list: Profile["missions"]["list"] = [];
  while (list.length < MISSIONS_PER_DAY && pool.length) {
    const d = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    // pas deux missions sur la même statistique
    if (list.some((m) => missionDef(m.id)?.stat === d.stat)) continue;
    list.push({ id: d.id, progress: 0, claimed: false });
  }
  p.missions = { day: today, list };
  return list;
}

export interface MatchFacts {
  won: boolean;
  kills: number;
  blocks: number;
  bonuses: number;
  bombs: number;
  survival: number;
  modeId: string;
}
/** Fait avancer les missions ; renvoie celles qui viennent d'être terminées. */
export function progressMissions(p: Profile, f: MatchFacts, now?: Date): MissionDef[] {
  const done: MissionDef[] = [];
  for (const m of ensureMissions(p, now)) {
    const d = missionDef(m.id);
    if (!d || m.claimed) continue;
    const before = m.progress;
    const add: Record<MissionDef["stat"], number> = {
      played: 1,
      wins: f.won ? 1 : 0,
      kills: f.kills,
      blocks: f.blocks,
      bonuses: f.bonuses,
      bombs: f.bombs,
      survive: f.survival >= 60 ? 1 : 0,
      chaos: f.modeId === "chaos" ? 1 : 0,
    };
    m.progress = Math.min(d.goal, m.progress + add[d.stat]);
    if (before < d.goal && m.progress >= d.goal) done.push(d);
  }
  return done;
}
/** Récupère une mission du jour terminée : pièces + XP, une seule fois. */
export function claimMission(p: Profile, id: string): Granted[] | null {
  const m = p.missions.list.find((x) => x.id === id);
  const d = missionDef(id);
  if (!m || !d || m.claimed || m.progress < d.goal) return null;
  m.claimed = true;
  p.stats.missionsClaimed++;
  const out: Granted[] = [];
  grant(p, { kind: "coins", amount: d.reward }, out, "Mission du jour");
  grant(p, { kind: "xp", amount: DAILY_MISSION_XP }, out, "Mission du jour");
  return out;
}
export function missionsToClaim(p: Profile): number {
  return p.missions.list.filter((m) => !m.claimed && m.progress >= (missionDef(m.id)?.goal ?? Infinity)).length;
}

/** Emote valide et possédée (pour l'envoi en partie). */
export function canUseEmote(p: Profile, id: string): boolean {
  return !!getEmote(id) && owns(p, id);
}

export { characterItemId };

// ------------------------------------------------------------------ pseudo
/** Nettoie un pseudo saisi (espaces, longueur max). */
export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, NAME_MAX);
}

/** Prix pour passer à ce pseudo : gratuit la première fois ou s'il ne change pas. */
export function renameCost(p: Profile, raw: string): number {
  return !p.named || cleanName(raw) === p.name ? 0 : NAME_CHANGE_PRICE;
}

export type RenameResult = { ok: true; cost: number } | { ok: false; reason: "short" | "same" | "coins"; missing?: number };

/** Change le pseudo et débite le prix (jamais de solde négatif). */
export function rename(p: Profile, raw: string): RenameResult {
  const v = cleanName(raw);
  if (v.length < NAME_MIN) return { ok: false, reason: "short" };
  if (p.named && v === p.name) return { ok: false, reason: "same" };
  const cost = renameCost(p, v);
  if (p.coins < cost) return { ok: false, reason: "coins", missing: cost - p.coins };
  p.coins -= cost;
  p.name = v;
  p.named = true;
  return { ok: true, cost };
}
