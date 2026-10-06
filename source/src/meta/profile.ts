/**
 * Profil joueur sauvegardé localement. Le format est versionné pour
 * permettre les migrations (et plus tard une synchro serveur).
 */
import { DEFAULT_EMOTES, DEFAULT_TRAIL } from "../core/cosmetics";

export interface Settings {
  music: boolean;
  sfx: boolean;
  vibration: boolean;
}

export interface MissionState {
  id: string;
  progress: number;
  claimed: boolean;
}

export interface Profile {
  version: 2;
  name: string;
  /** le joueur a choisi lui-même son pseudo */
  named: boolean;
  level: number;
  xp: number; // XP dans le niveau courant
  /** monnaie virtuelle (PIÈCES) */
  coins: number;
  /** total gagné depuis le début (statistique) */
  coinsEarned: number;
  wins: number;
  losses: number;
  played: number;
  kills: number;
  bombsPlaced: number;
  blocksDestroyed: number;
  bonusesPicked: number;
  bestSurvival: number;
  characterId: string;
  /** skin équipé par personnage (id de personnage → id de skin) */
  equippedSkins: Record<string, string>;
  /** accessoire, effet et emotes équipés (communs à tous les personnages) */
  equipped: { accessory: string | null; trail: string; emotes: string[] };
  /** tout ce qui a été acheté (skins, accessoires, effets, emotes, persos) */
  owned: string[];
  ownedCharacters: string[];
  /** récompense quotidienne : dernier jour réclamé (AAAA-MM-JJ) + série */
  daily: { last: string | null; streak: number };
  missions: { day: string; list: MissionState[] };
  /** cadeau de bienvenue de la V2 déjà donné */
  starterGift: boolean;
  /** objets déjà vus en boutique (pastille « NOUVEAU ») */
  seen: string[];
  /** parties déjà réglées (anti double récompense) */
  settled: string[];
  /** partie commencée mais pas encore réglée (abandon si on quitte) */
  pending: { matchId: string; stake: "easy" | "normal" | "hard" | "expert"; modeId: string; online?: boolean; players?: number; startedAt: number; ending?: boolean } | null;
  /** dernières transactions de pièces (historique) */
  ledger: import("./rewards").CoinTransaction[];
  winStreak: number;
  lastSetup: { botCount: number; difficulty: "easy" | "normal" | "hard" | "expert"; mapId: string; modeId: string };
  settings: Settings;
}

export const DEFAULT_CHARACTERS = ["renard", "boulon", "rainette", "kage", "champi", "bruno"];

export function defaultProfile(): Profile {
  return {
    version: 2,
    name: "Joueur",
    named: false,
    level: 1,
    xp: 0,
    coins: 0,
    coinsEarned: 0,
    wins: 0,
    losses: 0,
    played: 0,
    kills: 0,
    bombsPlaced: 0,
    blocksDestroyed: 0,
    bonusesPicked: 0,
    bestSurvival: 0,
    characterId: "renard",
    equippedSkins: {},
    equipped: { accessory: null, trail: DEFAULT_TRAIL, emotes: [...DEFAULT_EMOTES] },
    owned: [],
    ownedCharacters: [...DEFAULT_CHARACTERS],
    daily: { last: null, streak: 0 },
    missions: { day: "", list: [] },
    starterGift: false,
    seen: [],
    settled: [],
    pending: null,
    ledger: [],
    winStreak: 0,
    lastSetup: { botCount: 3, difficulty: "normal", mapId: "forest", modeId: "classic" },
    settings: { music: true, sfx: true, vibration: true },
  };
}
