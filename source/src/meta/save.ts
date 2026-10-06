import { CHARACTERS } from "../core/characters";
import { EMOTE_SLOTS, getEmote, getTrail } from "../core/cosmetics";
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
    version: 2,
    settings: { ...base.settings, ...(data.settings ?? {}) },
    lastSetup: { ...base.lastSetup, ...(data.lastSetup ?? {}) },
    equippedSkins: { ...(data.equippedSkins ?? {}) },
    equipped: { ...base.equipped, ...(data.equipped ?? {}) },
    daily: { ...base.daily, ...(data.daily ?? {}) },
    missions: data.missions && Array.isArray(data.missions.list) ? data.missions : base.missions,
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
