/**
 * PROGRESSION — tous les chiffres de la longévité du jeu sont ici.
 *
 * Niveau de compte, maîtrise des personnages, missions de la semaine,
 * connexion quotidienne, séries de victoires, succès, coffres et rangs.
 * Changer un nombre ici suffit : écrans et règles suivent tout seuls.
 * (Prix boutique, barème des pièces et missions du jour : economy.ts)
 */
import type { Rarity } from "../core/characters";
import type { StakeId } from "./economy";

// ------------------------------------------------------------ récompenses
/** Une récompense, quelle que soit sa source (niveau, mission, coffre…). */
export type Reward =
  | { kind: "coins"; amount: number }
  | { kind: "xp"; amount: number }
  | { kind: "item"; id: string }
  | { kind: "chest"; tier: ChestTier; count?: number };

// ------------------------------------------------------------- niveau
/** XP de fin de partie selon la place (colonne du barème : 1er, 2e, 3e, 4e). */
export const XP_BY_PLACE = [100, 70, 50, 35];
/** Égalité pour la 1re place : XP de la colonne « 2e ». */
export const XP_DRAW_COLUMN = 2;

/** Niveau maximum du compte. */
export const LEVEL_MAX = 100;
/**
 * XP pour passer du niveau `level` au suivant : rapide au début, plus lent
 * ensuite. Niveau 2 = 1 victoire ; niveau 10 ≈ 30 parties ; niveau 50 ≈ 900.
 */
export function levelXp(level: number): number {
  const k = level - 1;
  return Math.round((100 + 20 * k + 0.9 * k * k) / 5) * 5;
}
/** Pièces offertes à chaque niveau gagné. */
export const LEVEL_UP_COINS = 100;
/** Récompenses spéciales de certains niveaux (en plus des pièces). */
export const LEVEL_REWARDS: Record<number, Reward[]> = {
  3: [{ kind: "chest", tier: "common" }],
  5: [{ kind: "chest", tier: "common" }],
  8: [{ kind: "chest", tier: "rare" }],
  10: [{ kind: "item", id: "title-artificer" }, { kind: "chest", tier: "rare" }],
  15: [{ kind: "chest", tier: "rare" }],
  20: [{ kind: "chest", tier: "epic" }],
  25: [{ kind: "item", id: "title-veteran" }, { kind: "chest", tier: "rare" }],
  30: [{ kind: "chest", tier: "epic" }],
  35: [{ kind: "chest", tier: "rare" }],
  40: [{ kind: "chest", tier: "epic" }],
  45: [{ kind: "chest", tier: "rare" }],
  50: [{ kind: "item", id: "title-legend" }, { kind: "chest", tier: "legend" }],
  60: [{ kind: "chest", tier: "epic" }],
  70: [{ kind: "chest", tier: "epic" }],
  75: [{ kind: "chest", tier: "legend" }],
  80: [{ kind: "chest", tier: "epic" }],
  90: [{ kind: "chest", tier: "epic" }],
  100: [{ kind: "item", id: "title-centurion" }, { kind: "chest", tier: "legend" }],
};

// ------------------------------------------------------------ maîtrise
/** Maîtrise d'un personnage : progresse seulement avec le personnage joué. */
export const MASTERY_MAX = 50;
export function masteryXp(level: number): number {
  const k = level - 1;
  return Math.round((60 + 8 * k + 0.35 * k * k) / 5) * 5;
}
/** XP de maîtrise par partie = XP de place + bonus par élimination. */
export const MASTERY_PER_KILL = 5;
/** Paliers de maîtrise (identiques pour chaque personnage, cosmétiques uniquement). */
export function masteryRewards(characterId: string): Record<number, Reward[]> {
  return {
    5: [{ kind: "coins", amount: 250 }],
    10: [{ kind: "item", id: `title-m10-${characterId}` }],
    15: [{ kind: "chest", tier: "rare" }],
    20: [{ kind: "item", id: `title-m20-${characterId}` }, { kind: "coins", amount: 500 }],
    30: [{ kind: "item", id: `${characterId}-maitre` }],
    40: [{ kind: "chest", tier: "epic" }],
    50: [{ kind: "item", id: `title-m50-${characterId}` }, { kind: "chest", tier: "legend" }],
  };
}
export const MASTERY_STEPS = [5, 10, 15, 20, 30, 40, 50];

// --------------------------------------------------- missions de la semaine
export type WeeklyStat = "played" | "wins" | "kills" | "blocks" | "bonuses" | "top2" | "hardwins" | "chaos" | "online";
export interface WeeklyDef {
  id: string;
  stat: WeeklyStat;
  goal: number;
  coins: number;
  xp: number;
  chest?: ChestTier;
  label: string; // {n} = objectif
  icon: string;
}
export const WEEKLY_MISSIONS: WeeklyDef[] = [
  { id: "w-play20", stat: "played", goal: 20, coins: 600, xp: 250, label: "Joue {n} parties", icon: "🎮" },
  { id: "w-play35", stat: "played", goal: 35, coins: 900, xp: 350, chest: "rare", label: "Joue {n} parties", icon: "🎮" },
  { id: "w-win8", stat: "wins", goal: 8, coins: 800, xp: 300, chest: "rare", label: "Gagne {n} parties", icon: "🏆" },
  { id: "w-kills25", stat: "kills", goal: 25, coins: 700, xp: 300, label: "Élimine {n} adversaires", icon: "💥" },
  { id: "w-blocks300", stat: "blocks", goal: 300, coins: 600, xp: 250, label: "Détruis {n} blocs", icon: "🧱" },
  { id: "w-bonus50", stat: "bonuses", goal: 50, coins: 600, xp: 250, label: "Ramasse {n} bonus", icon: "⭐" },
  { id: "w-top2", stat: "top2", goal: 12, coins: 700, xp: 300, label: "Finis {n} fois 1er ou 2e", icon: "🥈" },
  { id: "w-hard3", stat: "hardwins", goal: 3, coins: 1000, xp: 400, chest: "epic", label: "Gagne {n} parties en Difficile ou Expert", icon: "🔥" },
  { id: "w-chaos6", stat: "chaos", goal: 6, coins: 700, xp: 300, label: "Joue {n} parties en mode Chaos", icon: "💀" },
];
export const WEEKLY_PER_WEEK = 3;
/** XP donnée par chaque mission du jour réclamée (en plus de ses pièces). */
export const DAILY_MISSION_XP = 60;

// ------------------------------------------------- connexion quotidienne
/**
 * Cycle de 7 jours. Rater un jour ne remet PAS la série à zéro : on reprend
 * simplement le cycle là où on l'avait laissé (jamais deux fois le même jour).
 */
export const LOGIN_REWARDS: Reward[][] = [
  [{ kind: "coins", amount: 50 }],
  [{ kind: "coins", amount: 75 }],
  [{ kind: "coins", amount: 100 }],
  [{ kind: "coins", amount: 100 }],
  [{ kind: "coins", amount: 150 }],
  [{ kind: "coins", amount: 200 }],
  [{ kind: "chest", tier: "rare" }],
];

// ------------------------------------------------------ séries de victoires
/** Bonus versés UNE fois quand la série atteint ce nombre de victoires d'affilée. */
export const STREAK_BONUSES: Record<number, { coins: number; xp: number; chest?: ChestTier }> = {
  3: { coins: 50, xp: 25 },
  5: { coins: 100, xp: 50 },
  10: { coins: 250, xp: 100, chest: "rare" },
};

// ---------------------------------------------------------------- coffres
export type ChestTier = "common" | "rare" | "epic" | "legend";
export interface ChestDef {
  name: string;
  /** pièces toujours incluses : [min, max] */
  coins: [number, number];
  /** nombre d'objets tirés */
  drops: number;
  /** probabilité (en %) de la rareté de chaque objet tiré — total 100 */
  odds: Record<Rarity, number>;
  color: string;
}
export const CHEST_ORDER: ChestTier[] = ["common", "rare", "epic", "legend"];
export const CHESTS: Record<ChestTier, ChestDef> = {
  common: { name: "Coffre commun", coins: [60, 120], drops: 1, odds: { common: 80, rare: 18, epic: 2, legend: 0 }, color: "#9bb4c9" },
  rare: { name: "Coffre rare", coins: [150, 250], drops: 1, odds: { common: 40, rare: 45, epic: 13, legend: 2 }, color: "#3fa2ff" },
  epic: { name: "Coffre épique", coins: [300, 450], drops: 2, odds: { common: 10, rare: 45, epic: 35, legend: 10 }, color: "#b05cff" },
  legend: { name: "Coffre légendaire", coins: [600, 900], drops: 2, odds: { common: 0, rare: 20, epic: 45, legend: 35 }, color: "#ffb020" },
};
/** Objet déjà possédé : remplacé par des pièces selon sa rareté. */
export const DUPLICATE_COINS: Record<Rarity, number> = { common: 100, rare: 250, epic: 500, legend: 1000 };

// ------------------------------------------------------- rang compétitif
export interface RankDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** points nécessaires */
  min: number;
  /** récompense donnée la 1re fois que ce rang est atteint */
  reward: Reward[];
}
export const RANKS: RankDef[] = [
  { id: "bronze", name: "Bronze", icon: "🥉", color: "#d08a4c", min: 0, reward: [] },
  { id: "argent", name: "Argent", icon: "🥈", color: "#c9d6e3", min: 150, reward: [{ kind: "chest", tier: "rare" }] },
  { id: "or", name: "Or", icon: "🥇", color: "#ffd23f", min: 400, reward: [{ kind: "chest", tier: "rare" }, { kind: "coins", amount: 300 }] },
  { id: "platine", name: "Platine", icon: "💠", color: "#5fe0d0", min: 800, reward: [{ kind: "chest", tier: "epic" }] },
  { id: "diamant", name: "Diamant", icon: "💎", color: "#7cc7ff", min: 1300, reward: [{ kind: "item", id: "title-diamond" }, { kind: "chest", tier: "epic" }] },
  { id: "elite", name: "Élite", icon: "👑", color: "#ff5fa2", min: 2000, reward: [{ kind: "item", id: "title-elite" }, { kind: "item", id: "boom-gold" }, { kind: "chest", tier: "legend" }] },
];
export const RANK_RULES = {
  /** points selon la colonne du barème : [1er, 2e, 3e, 4e] */
  places: [20, 8, -4, -10],
  /** multiplicateur selon la difficulté des bots */
  difficulty: { easy: 0.5, normal: 1, hard: 1.5, expert: 2 } as Record<StakeId, number>,
  /**
   * moins d'adversaires = moins de points (1 bot : ×⅓, 2 bots : ×⅔, 3 bots : ×1)
   * → impossible de monter vite en jouant à 1 contre 1.
   */
  perOpponent: 1 / 3,
  /** pas de perte de points tant qu'on est dans ces rangs (débutants) */
  protectedRanks: ["bronze"],
  /** parties classées : contre les bots (résultat calculé sur l'appareil) */
  solo: true,
  /**
   * Parties privées en ligne : NON classées tant que le serveur ne valide
   * pas lui-même les résultats (sinon on pourrait gonfler son rang entre amis).
   */
  online: false,
  historySize: 15,
};

// ----------------------------------------------------------------- succès
/** Statistiques mesurées pour les succès (voir achievements.ts). */
export type AchStat =
  | "played" | "wins" | "kills" | "blocks" | "bombs" | "bonuses" | "coinsEarned" | "level"
  | "bestStreak" | "bestMastery" | "charsPlayed" | "owned" | "chests" | "missions" | "expertWins"
  | "chaos" | "online" | "rank" | "loginDays";
export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  /** {n} = objectif */
  desc: string;
  stat: AchStat;
  goal: number;
  reward: Reward[];
}
const A = (id: string, icon: string, name: string, desc: string, stat: AchStat, goal: number, ...reward: Reward[]): AchievementDef => ({ id, icon, name, desc, stat, goal, reward });
const C = (amount: number): Reward => ({ kind: "coins", amount });
const CH = (tier: ChestTier): Reward => ({ kind: "chest", tier });
const IT = (id: string): Reward => ({ kind: "item", id });
export const ACHIEVEMENTS: AchievementDef[] = [
  A("first-game", "🎮", "Premier pas", "Joue ta première partie", "played", 1, C(50)),
  A("played-25", "🎮", "On y prend goût", "Joue {n} parties", "played", 25, C(200)),
  A("played-100", "🎮", "Habitué", "Joue {n} parties", "played", 100, IT("title-regular"), C(400)),
  A("played-500", "🎮", "Pilier de l'arène", "Joue {n} parties", "played", 500, IT("boom-veteran"), CH("epic")),
  A("first-win", "🏆", "Première victoire", "Gagne ta première partie", "wins", 1, C(100)),
  A("wins-10", "🏆", "Gagnant", "Gagne {n} parties", "wins", 10, C(250)),
  A("wins-50", "🏆", "Champion", "Gagne {n} parties", "wins", 50, IT("title-champion"), CH("rare")),
  A("wins-200", "🏆", "Invincible", "Gagne {n} parties", "wins", 200, IT("title-unbeatable"), CH("legend")),
  A("kills-25", "💥", "Pas de pitié", "Élimine {n} adversaires", "kills", 25, C(150)),
  A("kills-250", "💥", "Chasseur", "Élimine {n} adversaires", "kills", 250, IT("title-hunter"), CH("rare")),
  A("blocks-500", "🧱", "Bûcheron", "Détruis {n} blocs", "blocks", 500, C(150)),
  A("blocks-5000", "🧱", "Démolisseur", "Détruis {n} blocs", "blocks", 5000, IT("title-demolisher"), CH("rare")),
  A("bombs-1000", "💣", "Artificier fou", "Pose {n} bombes", "bombs", 1000, CH("rare")),
  A("bonus-200", "⭐", "Ramasse-tout", "Ramasse {n} bonus", "bonuses", 200, C(250)),
  A("streak-3", "🔥", "En forme", "Gagne {n} parties d'affilée", "bestStreak", 3, C(100)),
  A("streak-5", "🔥", "En feu", "Gagne {n} parties d'affilée", "bestStreak", 5, CH("rare")),
  A("streak-10", "🔥", "Inarrêtable", "Gagne {n} parties d'affilée", "bestStreak", 10, IT("title-unstoppable"), CH("epic")),
  A("level-10", "⬆️", "Niveau 10", "Atteins le niveau {n}", "level", 10, C(200)),
  A("level-25", "⬆️", "Niveau 25", "Atteins le niveau {n}", "level", 25, CH("epic")),
  A("level-50", "⬆️", "Niveau 50", "Atteins le niveau {n}", "level", 50, CH("legend")),
  A("mastery-10", "🎖️", "Spécialiste", "Monte un personnage au niveau de maîtrise {n}", "bestMastery", 10, C(300)),
  A("mastery-30", "🎖️", "Virtuose", "Monte un personnage au niveau de maîtrise {n}", "bestMastery", 30, CH("epic")),
  A("chars-7", "🧑‍🤝‍🧑", "Touche-à-tout", "Joue avec {n} personnages différents", "charsPlayed", 7, IT("title-jack"), C(300)),
  A("owned-25", "🎒", "Garde-robe", "Possède {n} objets", "owned", 25, C(300)),
  A("owned-60", "🎒", "Collectionneur", "Possède {n} objets", "owned", 60, IT("title-collector"), CH("epic")),
  A("chests-10", "🎁", "Chasseur de trésors", "Ouvre {n} coffres", "chests", 10, CH("rare")),
  A("missions-20", "🎯", "Appliqué", "Récupère {n} missions", "missions", 20, C(400)),
  A("expert-1", "💀", "Sans peur", "Gagne une partie en Expert", "expertWins", 1, C(300)),
  A("expert-10", "💀", "Expert", "Gagne {n} parties en Expert", "expertWins", 10, IT("title-expert"), CH("epic")),
  A("chaos-10", "🌪️", "Amateur de chaos", "Joue {n} parties en mode Chaos", "chaos", 10, C(250)),
  A("online-5", "🌐", "Entre amis", "Joue {n} parties privées en ligne", "online", 5, C(250)),
  A("rank-or", "🥇", "Doré", "Atteins le rang Or", "rank", 2, C(300)),
  A("rank-diamant", "💎", "Brillant", "Atteins le rang Diamant", "rank", 4, CH("epic")),
  A("login-7", "📅", "Fidèle", "Connecte-toi {n} jours", "loginDays", 7, C(200)),
  A("login-30", "📅", "Inséparable", "Connecte-toi {n} jours", "loginDays", 30, CH("epic")),
  A("rich", "🪙", "Fortune", "Gagne {n} pièces au total", "coinsEarned", 20000, CH("rare")),
];
