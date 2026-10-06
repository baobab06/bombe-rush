/**
 * ÉCONOMIE DU JEU — tous les chiffres modifiables sont ici.
 *
 * Prix, gains de fin de partie, récompenses quotidiennes, missions et
 * événements. Changer un nombre ici suffit : boutique, collection et
 * écrans de résultats se mettent à jour tout seuls.
 */
import type { Rarity } from "../core/characters";

/** Monnaie virtuelle (une seule pour l'instant ; la structure en accepte d'autres). */
export const CURRENCIES = {
  coins: { id: "coins", name: "Pièces", short: "🪙" },
} as const;
export type CurrencyId = keyof typeof CURRENCIES;

// ------------------------------------------------------------------ prix
/** Prix par rareté (skins, accessoires, effets). */
export const PRICES: Record<Rarity, number> = {
  common: 500,
  rare: 1500,
  epic: 3000,
  legend: 5000,
};
/** Les emotes coûtent moins cher que les skins. */
export const EMOTE_PRICES: Record<Rarity, number> = {
  common: 250,
  rare: 600,
  epic: 1200,
  legend: 2500,
};
/** Personnages à débloquer. */
export const CHARACTER_PRICES: Record<string, number> = {
  pingo: 4000,
};

/** « À la une » : sélection du jour dans la boutique. */
export const FEATURED = {
  count: 4,
  /** réduction de l'offre du jour (0.3 = −30 %) */
  dealDiscount: 0.3,
};

// ------------------------------------------------ RISQUE / RÉCOMPENSE
/**
 * BARÈME DE FIN DE PARTIE — C'EST LE SEUL ENDROIT À MODIFIER.
 *
 * Pièces gagnées (+) ou perdues (−) selon la PLACE FINALE du joueur, pour
 * chaque difficulté : [1er, 2e, 3e, 4e].
 * Ajouter une difficulté = ajouter une ligne (et son profil de bot dans
 * src/ai/bot.ts).
 */
export const STAKES = {
  easy: { label: "Facile", emoji: "🟢", tag: "Tranquille", places: [50, 20, -10, -25] },
  normal: { label: "Normal", emoji: "🔵", tag: "Équilibré", places: [100, 40, -15, -30] },
  hard: { label: "Difficile", emoji: "🔥", tag: "Gros gains", places: [175, 70, -25, -50] },
  expert: { label: "Expert", emoji: "💀", tag: "Tout ou rien", places: [300, 120, -50, -100] },
} as const;
export type StakeId = keyof typeof STAKES;
export const STAKE_ORDER: StakeId[] = ["easy", "normal", "hard", "expert"];
/** Parties en ligne entre amis : barème de cette difficulté. */
export const ONLINE_STAKE: StakeId = "normal";

/**
 * Parties à moins de 4 joueurs : quelle colonne du barème s'applique à
 * chaque place (1 = colonne « 1er », 4 = colonne « 4e »).
 * Le dernier prend toujours la perte maximale.
 * Plus de 4 joueurs : le 1er gagne le gros lot, le dernier perd le maximum,
 * la 1re moitié du classement touche la colonne « 2e », le reste la « 3e ».
 */
export const PLACE_COLUMNS: Record<number, number[]> = {
  2: [1, 4],
  3: [1, 2, 4],
  4: [1, 2, 3, 4],
};
/**
 * Égalité pour la 1re place (les derniers sautent en même temps, ou temps
 * écoulé avec plusieurs survivants) : personne ne gagne, les ex aequo
 * touchent la colonne « 2e ».
 */
export const DRAW_COLUMN = 2;
/** Partie annulée (exclu par l'hôte…) : ni gain ni perte. */
export const VOID_COINS = 0;

export const PLACE_NAMES = ["1er", "2e", "3e", "4e"];
export const PLACE_MEDALS = ["🥇", "🥈", "🥉", "💀"];
/** « 1er », « 2e »… (au-delà de 4 aussi) */
export const placeName = (place: number) => (place === 1 ? "1er" : `${place}e`);
/** médaille d'une place (le dernier a toujours 💀) */
export const placeMedal = (place: number, players: number) => (place >= players && players > 1 ? "💀" : PLACE_MEDALS[Math.min(place, 3) - 1] ?? "💀");

/** Expérience (progression de niveau) — indépendante des pièces. */
export const MATCH_XP = { win: 80, draw: 40, participation: 20, second: 15, perKill: 15 };

/** Cadeau de bienvenue pour découvrir la boutique (donné une seule fois). */
export const STARTER_GIFT = 1000;
/** Changer de pseudo (le tout premier pseudo est gratuit). */
export const NAME_CHANGE_PRICE = 300;
export const NAME_MIN = 2;
export const NAME_MAX = 16;

// ------------------------------------------------------ récompense du jour
/** Jour 1 → 7, puis on recommence. Rater un jour remet la série à zéro. */
export const DAILY_REWARDS = [100, 150, 200, 300, 400, 500, 1000];

// ----------------------------------------------------------------- missions
export type MissionStat = "played" | "wins" | "kills" | "blocks" | "bonuses" | "bombs" | "survive" | "chaos";
export interface MissionDef {
  id: string;
  stat: MissionStat;
  goal: number;
  reward: number;
  label: string; // {n} = objectif
  icon: string;
}
export const MISSIONS: MissionDef[] = [
  { id: "play3", stat: "played", goal: 3, reward: 150, label: "Joue {n} parties", icon: "🎮" },
  { id: "play5", stat: "played", goal: 5, reward: 250, label: "Joue {n} parties", icon: "🎮" },
  { id: "win1", stat: "wins", goal: 1, reward: 200, label: "Gagne {n} partie", icon: "🏆" },
  { id: "win3", stat: "wins", goal: 3, reward: 450, label: "Gagne {n} parties", icon: "🏆" },
  { id: "kills3", stat: "kills", goal: 3, reward: 200, label: "Élimine {n} adversaires", icon: "💥" },
  { id: "kills6", stat: "kills", goal: 6, reward: 350, label: "Élimine {n} adversaires", icon: "💥" },
  { id: "blocks40", stat: "blocks", goal: 40, reward: 150, label: "Détruis {n} blocs", icon: "🧱" },
  { id: "blocks100", stat: "blocks", goal: 100, reward: 300, label: "Détruis {n} blocs", icon: "🧱" },
  { id: "bonus10", stat: "bonuses", goal: 10, reward: 150, label: "Ramasse {n} bonus", icon: "⭐" },
  { id: "bombs30", stat: "bombs", goal: 30, reward: 150, label: "Pose {n} bombes", icon: "💣" },
  { id: "survive", stat: "survive", goal: 2, reward: 200, label: "Survis 60 s dans {n} parties", icon: "⏱️" },
  { id: "chaos2", stat: "chaos", goal: 2, reward: 250, label: "Joue {n} parties en mode Chaos", icon: "💀" },
];
/** Nombre de missions proposées chaque jour. */
export const MISSIONS_PER_DAY = 3;

// --------------------------------------------------------------- événements
export interface GameEvent {
  id: string;
  name: string;
  desc: string;
  icon: string;
  /** multiplicateur de pièces de fin de partie */
  coinMultiplier: number;
  /** limité à un mode (sinon : tous) */
  modeId?: string;
  /** jours de la semaine actifs (0 = dimanche) ; absent = tous les jours */
  days?: number[];
}
export const EVENTS: GameEvent[] = [
  { id: "launch", name: "Festival Chaos", desc: "Victoires ×1,5 en mode Chaos", icon: "💀", coinMultiplier: 1.5, modeId: "chaos" },
  { id: "weekend", name: "Week-end en or", desc: "Victoires ×2 dans tous les modes", icon: "🪙", coinMultiplier: 2, days: [0, 6] },
];

export function activeEvents(date = new Date()): GameEvent[] {
  return EVENTS.filter((e) => !e.days || e.days.includes(date.getDay()));
}
