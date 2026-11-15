/**
 * PASS DE SAISON — 100 paliers, ligne gratuite + ligne Premium.
 *
 *  - on gagne des ÉTOILES ⭐ en jouant (victoire, 2e place, partie jouée)
 *    et en réussissant des missions ; 50 ⭐ = 1 palier ;
 *  - ligne gratuite : une récompense un palier sur deux ;
 *  - ligne Premium (450 bombers) : une récompense à chaque palier, dont les
 *    objets exclusifs de la saison et 300 bombers rendus ;
 *  - une saison suit les mois de la Compétition (`PASS_SEASONS`) ; à la fin,
 *    les récompenses atteintes mais pas récupérées sont données d'office.
 */
import { defaultPass, type Profile } from "./profile";
import { grant, type Granted } from "./grants";
import type { ChestTier, Reward } from "./progress-config";

export const PASS_RULES = {
  tiers: 100,
  starsPerTier: 50,
  /** prix du Premium en bombers */
  premiumPrice: 450,
  /** étoiles par partie terminée selon la place */
  win: 30,
  second: 20,
  played: 10,
  /** mission du jour / de la semaine réussie */
  missionStars: 50,
  weeklyStars: 100,
};

// ------------------------------------------------------------- saisons
export interface PassSeasonDef {
  id: string;
  name: string;
  emoji: string;
  /** mois UTC couverts (« 2026-12 ») */
  months: string[];
  /** objets exclusifs (ligne Premium sauf `freeTitle`) */
  exclusives?: {
    emote: string; // palier 1
    trail: string; // palier 20
    boom: string; // palier 60
    title: string; // palier 80
    theme: string; // palier 100 : skin pour tous les persos
    freeTitle?: string; // palier 50, ligne gratuite
  };
}

export const PASS_SEASONS: PassSeasonDef[] = [
  {
    // première saison : de la sortie du pass jusqu'à fin décembre
    id: "hiver-2026",
    name: "Hiver",
    emoji: "❄️",
    months: ["2026-11", "2026-12"],
    exclusives: { emote: "emo-snowman", trail: "fx-frost", boom: "boom-snowball", title: "title-winter", theme: "lutin", freeTitle: "title-frosty" },
  },
];

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const monthOf = (now: number) => new Date(now).toISOString().slice(0, 7);

/** Saison du moment (une saison générique par mois s'il n'y en a pas de prévue). */
export function passSeason(now: number = Date.now()): PassSeasonDef {
  const m = monthOf(now);
  const def = PASS_SEASONS.find((s) => s.months.includes(m));
  if (def) return def;
  const name = MONTHS[Number(m.slice(5, 7)) - 1] ?? "";
  return { id: `s-${m}`, name: name.charAt(0).toUpperCase() + name.slice(1), emoji: "⭐", months: [m] };
}

/** Fin de la saison (ms) : début du mois qui suit le dernier mois couvert. */
export function passSeasonEnd(now: number = Date.now()): number {
  const s = passSeason(now);
  const last = [...s.months].sort().pop()!;
  const [y, mo] = last.split("-").map(Number);
  return Date.UTC(y, mo, 1);
}

// ----------------------------------------------------------- récompenses
export interface PassTrack {
  /** index 1..100 (0 inutilisé) ; null = rien sur ce palier */
  free: (Reward | null)[];
  prem: Reward[];
}

const chest = (tier: ChestTier): Reward => ({ kind: "chest", tier });

/** Barème des 100 paliers d'une saison. */
export function passTrack(season: PassSeasonDef = passSeason()): PassTrack {
  const free: (Reward | null)[] = [null];
  const prem: Reward[] = [{ kind: "coins", amount: 0 }];
  const ex = season.exclusives;
  for (let t = 1; t <= PASS_RULES.tiers; t++) {
    // ---- gratuit : un palier sur deux
    let f: Reward | null = null;
    if (t % 2 === 0) {
      if (t === 100) f = chest("epic");
      else if (t === 50) f = ex?.freeTitle ? { kind: "item", id: ex.freeTitle } : chest("rare");
      else if (t % 20 === 0) f = chest("rare");
      else if (t % 10 === 0) f = chest("common");
      else if (t % 24 === 0) f = { kind: "bombers", amount: 10 };
      else f = { kind: "coins", amount: 100 + Math.floor(t / 10) * 20 };
    }
    free.push(f);
    // ---- Premium : chaque palier
    let r: Reward;
    if (t === 1) r = ex ? { kind: "item", id: ex.emote } : chest("rare");
    else if (t === 20) r = ex ? { kind: "item", id: ex.trail } : chest("epic");
    else if (t === 60) r = ex ? { kind: "item", id: ex.boom } : chest("epic");
    else if (t === 80) r = ex ? { kind: "item", id: ex.title } : chest("legend");
    else if (t === 100) r = ex ? { kind: "theme", id: ex.theme } : chest("legend");
    else if (t === 50 || t === 90) r = chest("legend");
    else if (t === 25 || t === 45 || t === 65 || t === 85) r = chest("epic");
    else if (t % 10 === 5) r = { kind: "bombers", amount: 50 }; // 5, 15, 35, 55, 75, 95 : 300 bombers
    else if (t % 10 === 8) r = chest("rare");
    else r = { kind: "coins", amount: 150 + Math.floor(t / 20) * 50 };
    prem.push(r);
  }
  return { free, prem };
}

/** Ce que contient la ligne Premium (pour l'écran d'achat). */
export function premiumSummary(track: PassTrack = passTrack()) {
  let coins = 0;
  let bombers = 0;
  const chests: Record<ChestTier, number> = { common: 0, rare: 0, epic: 0, legend: 0 };
  for (const r of track.prem.slice(1)) {
    if (r.kind === "coins") coins += r.amount;
    else if (r.kind === "bombers") bombers += r.amount;
    else if (r.kind === "chest") chests[r.tier] += r.count ?? 1;
  }
  return { coins, bombers, chests };
}

// ---------------------------------------------------------------- état
export const passTier = (p: Profile) => Math.min(PASS_RULES.tiers, Math.floor(Math.max(0, p.pass.stars) / PASS_RULES.starsPerTier));
/** étoiles dans le palier en cours (0..49) ; 50 au palier max */
export const passStarsInTier = (p: Profile) => (passTier(p) >= PASS_RULES.tiers ? PASS_RULES.starsPerTier : p.pass.stars % PASS_RULES.starsPerTier);

/** Étoiles d'une partie selon la place (égalité = 2e). */
export function passStarsFor(place: number, draw = false): number {
  if (draw) return PASS_RULES.second;
  if (place === 1) return PASS_RULES.win;
  if (place === 2) return PASS_RULES.second;
  return PASS_RULES.played;
}

/** Récompenses atteintes et pas encore récupérées. */
export function passClaimable(p: Profile, track: PassTrack = passTrack()): { line: "free" | "prem"; tier: number; reward: Reward }[] {
  const out: { line: "free" | "prem"; tier: number; reward: Reward }[] = [];
  const max = passTier(p);
  for (let t = 1; t <= max; t++) {
    const f = track.free[t];
    if (f && !p.pass.free.includes(t)) out.push({ line: "free", tier: t, reward: f });
    if (p.pass.premium && !p.pass.prem.includes(t)) out.push({ line: "prem", tier: t, reward: track.prem[t] });
  }
  return out;
}
export const passToClaim = (p: Profile) => passClaimable(p).length;

/**
 * Nouvelle saison ? Donne d'office ce qui était atteint et pas récupéré, puis
 * remet le pass à zéro. Renvoie la saison terminée et ce qui a été donné.
 */
export function ensurePass(p: Profile, now: number = Date.now()): { ended: string; granted: Granted[] } | null {
  const cur = passSeason(now);
  if (p.pass.season === cur.id) return null;
  const old = p.pass.season;
  const granted: Granted[] = [];
  if (old) {
    const def = PASS_SEASONS.find((s) => s.id === old) ?? ({ id: old, name: "", emoji: "", months: [] } as PassSeasonDef);
    for (const c of passClaimable(p, passTrack(def))) grant(p, c.reward, granted, "Fin de saison du pass");
  }
  p.pass = { ...defaultPass(), season: cur.id };
  return old ? { ended: old, granted } : null;
}

/** Ajoute des étoiles ; renvoie les paliers avant / après. */
export function addPassStars(p: Profile, n: number, now: number = Date.now()): { before: number; after: number; stars: number } {
  ensurePass(p, now);
  const before = passTier(p);
  const add = Math.max(0, Math.floor(n));
  p.pass.stars = Math.min(PASS_RULES.tiers * PASS_RULES.starsPerTier, p.pass.stars + add);
  return { before, after: passTier(p), stars: add };
}

/** Récupère une récompense (ou toutes si `tier` est omis). */
export function claimPass(p: Profile, line?: "free" | "prem", tier?: number): Granted[] {
  const out: Granted[] = [];
  for (const c of passClaimable(p)) {
    if (line && (c.line !== line || c.tier !== tier)) continue;
    (c.line === "free" ? p.pass.free : p.pass.prem).push(c.tier);
    grant(p, c.reward, out, `Pass · palier ${c.tier}`);
  }
  return out;
}

/** Achat du Premium avec des bombers. */
export function buyPremium(p: Profile): { ok: true } | { ok: false; reason: "owned" | "bombers"; missing?: number } {
  if (p.pass.premium) return { ok: false, reason: "owned" };
  if (p.bombers < PASS_RULES.premiumPrice) return { ok: false, reason: "bombers", missing: PASS_RULES.premiumPrice - p.bombers };
  p.bombers -= PASS_RULES.premiumPrice;
  p.pass.premium = true;
  return { ok: true };
}
