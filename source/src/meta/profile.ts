/**
 * Profil joueur sauvegardé localement. Le format est versionné pour
 * permettre les migrations (et plus tard une synchro serveur).
 */
import { DEFAULT_BOOM, DEFAULT_EMOTES, DEFAULT_TITLE, DEFAULT_TRAIL } from "../core/cosmetics";
import type { ChestTier } from "./progress-config";

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

/** Maîtrise d'un personnage. */
export interface MasteryState {
  level: number;
  xp: number;
  games: number;
  kills: number;
  wins: number;
}

/** Une partie classée (historique du rang). */
export interface RankEntry {
  at: number;
  place: number;
  players: number;
  stake: string;
  delta: number;
  points: number;
}

/** Statistiques supplémentaires (succès, profil). */
export interface ExtraStats {
  bestWinStreak: number;
  expertWins: number;
  hardWins: number;
  chaosPlayed: number;
  onlinePlayed: number;
  chestsOpened: number;
  missionsClaimed: number;
  loginDays: number;
}

export interface Profile {
  version: 3;
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
  equipped: { accessory: string | null; trail: string; emotes: string[]; boom: string; title: string };
  /** tout ce qui a été acheté (skins, accessoires, effets, emotes, persos) */
  owned: string[];
  ownedCharacters: string[];
  /** connexion quotidienne : dernier jour réclamé (AAAA-MM-JJ) + jours réclamés (position dans le cycle de 7) */
  daily: { last: string | null; streak: number };
  missions: { day: string; list: MissionState[] };
  /** missions de la semaine (clé = lundi de la semaine) */
  weekly: { week: string; list: MissionState[] };
  /** maîtrise par personnage */
  mastery: Record<string, MasteryState>;
  /** succès débloqués (date) et récompense récupérée */
  achievements: Record<string, { at: number; claimed: boolean }>;
  /** coffres en réserve */
  chests: Record<ChestTier, number>;
  /** rang compétitif local */
  rank: { points: number; best: number; rewarded: string[]; history: RankEntry[] };
  stats: ExtraStats;
  /** niveaux dont la récompense a déjà été donnée */
  levelRewardsUpTo: number;
  /** horloge : plus grande date vue (l'heure ne peut pas reculer) + décalage avec le serveur */
  clock: { max: number; offset: number };
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
    version: 3,
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
    equipped: { accessory: null, trail: DEFAULT_TRAIL, emotes: [...DEFAULT_EMOTES], boom: DEFAULT_BOOM, title: DEFAULT_TITLE },
    owned: [],
    ownedCharacters: [...DEFAULT_CHARACTERS],
    daily: { last: null, streak: 0 },
    missions: { day: "", list: [] },
    weekly: { week: "", list: [] },
    mastery: {},
    achievements: {},
    chests: { common: 0, rare: 0, epic: 0, legend: 0 },
    rank: { points: 0, best: 0, rewarded: ["bronze"], history: [] },
    stats: { bestWinStreak: 0, expertWins: 0, hardWins: 0, chaosPlayed: 0, onlinePlayed: 0, chestsOpened: 0, missionsClaimed: 0, loginDays: 0 },
    levelRewardsUpTo: 1,
    clock: { max: 0, offset: 0 },
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
