import { CHARACTERS } from "../core/characters";
import { EMOTE_SLOTS, getBoom, getEmote, getTitle, getTrail } from "../core/cosmetics";
import { CHEST_ORDER, LEVEL_MAX, levelXp, MASTERY_MAX, masteryXp } from "./progress-config";
import { getItem } from "./catalog";
import { DEFAULT_CHARACTERS, defaultProfile, type Profile } from "./profile";

/**
 * Sauvegarde locale. Tout passe par cette interface : on pourra brancher
 * plus tard un stockage natif ou un compte en ligne.
 */
export interface SaveBackend {
  load(key: string): string | null;
  store(key: string, value: string): void;
  remove(key: string): void;
}

const memory = new Map<string, string>();

export const localBackend: SaveBackend = {
  load(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  store(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      memory.delete(key);
    }
  },
};

export const memoryBackend = (): SaveBackend => {
  const m = new Map<string, string>();
  return {
    load: (k) => m.get(k) ?? null,
    store: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
};

const KEY = "bomberush.profile";

/** Remet d'aplomb un profil (ancien format, champs manquants, objets disparus). */
export function migrate(data: Partial<Profile> & { ownedSkins?: string[]; version?: number }): Profile {
  const base = defaultProfile();
  const p: Profile = {
    ...base,
    ...data,
    version: 3,
    settings: { ...base.settings, ...(data.settings ?? {}) },
    lastSetup: { ...base.lastSetup, ...(data.lastSetup ?? {}) },
    equippedSkins: { ...(data.equippedSkins ?? {}) },
    equipped: { ...base.equipped, ...(data.equipped ?? {}) },
    daily: { ...base.daily, ...(data.daily ?? {}) },
    missions: data.missions && Array.isArray(data.missions.list) ? data.missions : base.missions,
    weekly: data.weekly && Array.isArray(data.weekly.list) ? data.weekly : base.weekly,
    mastery: { ...(data.mastery ?? {}) },
    achievements: { ...(data.achievements ?? {}) },
    chests: { ...base.chests, ...(data.chests ?? {}) },
    rank: { ...base.rank, ...(data.rank ?? {}) },
    stats: { ...base.stats, ...(data.stats ?? {}) },
    clock: { ...base.clock, ...(data.clock ?? {}) },
  };
  // v1 : les skins achetés étaient dans ownedSkins
  const owned = new Set<string>([...(data.owned ?? []), ...(data.ownedSkins ?? [])]);
  p.owned = [...owned].filter((id) => !!getItem(id));
  delete (p as { ownedSkins?: unknown }).ownedSkins;
  const chars = new Set([...DEFAULT_CHARACTERS, ...(data.ownedCharacters ?? [])]);
  p.ownedCharacters = [...chars].filter((id) => CHARACTERS.some((c) => c.id === id));
  if (!p.ownedCharacters.includes(p.characterId)) p.characterId = base.characterId;
  // anciens profils : un pseudo déjà personnalisé compte comme choisi
  if (data.named === undefined) p.named = !!p.name && p.name !== "Joueur" && !/^Joueur \d+$/.test(p.name);
  // équipement : uniquement des objets possédés
  const has = (id: string) => {
    const it = getItem(id);
    return !!it && (it.free || p.owned.includes(id));
  };
  for (const [cid, sid] of Object.entries(p.equippedSkins)) if (!has(sid) || getItem(sid)?.characterId !== cid) delete p.equippedSkins[cid];
  if (p.equipped.accessory && !has(p.equipped.accessory)) p.equipped.accessory = null;
  if (!has(p.equipped.trail)) p.equipped.trail = getTrail(null).id;
  p.equipped.emotes = (p.equipped.emotes ?? []).filter((id) => getEmote(id) && has(id)).slice(0, EMOTE_SLOTS);
  if (!p.equipped.emotes.length) p.equipped.emotes = [...base.equipped.emotes];
  if (!getBoom(p.equipped.boom) || getBoom(p.equipped.boom).id !== p.equipped.boom || !has(p.equipped.boom)) p.equipped.boom = base.equipped.boom;
  if (!getTitle(p.equipped.title) || !has(p.equipped.title)) p.equipped.title = base.equipped.title;
  // ---- progression (v3)
  p.level = Math.min(LEVEL_MAX, Math.max(1, Math.floor(p.level)));
  // ancien barème d'XP : on garde le niveau, l'XP restante ne dépasse pas le palier
  p.xp = Math.min(Math.floor(p.xp), levelXp(p.level) - 1);
  // pas de récompenses rétroactives pour les niveaux déjà atteints
  if (!Number.isFinite(data.levelRewardsUpTo)) p.levelRewardsUpTo = p.level;
  for (const [cid, m] of Object.entries(p.mastery)) {
    if (!CHARACTERS.some((c) => c.id === cid) || !m || typeof m !== "object") {
      delete p.mastery[cid];
      continue;
    }
    const lvl = Math.min(MASTERY_MAX, Math.max(1, Math.floor(m.level || 1)));
    p.mastery[cid] = { level: lvl, xp: Math.max(0, Math.min(Math.floor(m.xp || 0), masteryXp(lvl) - 1)), games: m.games | 0, kills: m.kills | 0, wins: m.wins | 0 };
  }
  for (const t of CHEST_ORDER) p.chests[t] = Math.max(0, Math.floor(Number(p.chests[t]) || 0));
  if (!Array.isArray(p.rank.history)) p.rank.history = [];
  if (!Array.isArray(p.rank.rewarded)) p.rank.rewarded = ["bronze"];
  p.rank.points = Math.max(0, Math.floor(Number(p.rank.points) || 0));
  for (const k of Object.keys(base.stats) as (keyof typeof base.stats)[]) p.stats[k] = Math.max(0, Math.floor(Number(p.stats[k]) || 0));
  p.stats.bestWinStreak = Math.max(p.stats.bestWinStreak, Math.floor(Number(data.winStreak) || 0));
  if (data.stats === undefined) p.stats.loginDays = Math.max(p.stats.loginDays, Math.floor(Number(p.daily.streak) || 0));
  if (!Number.isFinite(p.clock.max)) p.clock.max = 0;
  if (!Number.isFinite(p.clock.offset) || Math.abs(p.clock.offset) > 400 * 86400000) p.clock.offset = 0;
  for (const k of ["coins", "coinsEarned", "level", "xp"] as const) if (!Number.isFinite(p[k]) || p[k] < 0) p[k] = base[k];
  p.coins = Math.floor(p.coins);
  if (!Array.isArray(p.settled)) p.settled = [];
  if (!Array.isArray(p.ledger)) p.ledger = [];
  if (!p.pending || typeof p.pending.matchId !== "string") p.pending = null;
  if (!Number.isFinite(p.winStreak)) p.winStreak = 0;
  if (!["easy", "normal", "hard", "expert"].includes(p.lastSetup.difficulty)) p.lastSetup.difficulty = "normal";
  return p;
}

export class SaveSystem {
  constructor(private backend: SaveBackend = localBackend) {}

  load(): Profile {
    const raw = this.backend.load(KEY);
    if (!raw) return defaultProfile();
    try {
      return migrate(JSON.parse(raw));
    } catch {
      return defaultProfile();
    }
  }

  save(p: Profile) {
    this.backend.store(KEY, JSON.stringify(p));
  }

  reset(): Profile {
    this.backend.remove(KEY);
    return defaultProfile();
  }
}
