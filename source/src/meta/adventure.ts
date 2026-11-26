/**
 * Mode AVENTURE : 4 mondes de 10 niveaux (le 10e est un boss), des étoiles
 * à gagner, des récompenses au premier passage et aux paliers d'étoiles.
 * Règles de jeu des objectifs : core/adventure.ts.
 */
import type { AdventureRules, AdvGoal, BossRules } from "../core/adventure";
import type { Difficulty, PlayerSlot } from "../core/types";
import type { MatchConfig } from "../core/match";
import { getCharacter } from "../core/characters";
import { getMap } from "../maps";
import type { Profile } from "./profile";
import type { ChestTier, Reward } from "./progress-config";

export interface AdvLevel {
  /** « 1-3 » = monde 1, niveau 3 */
  id: string;
  world: number;
  n: number;
  goal: AdvGoal;
  modeId: "classic" | "chaos" | "gold";
  mapId: string;
  bots: Difficulty[];
  rules: AdventureRules;
  /** boss : personnage, tenue, nom */
  boss?: { characterId: string; skinId?: string; name: string; difficulty: Difficulty };
}

export interface AdvWorld {
  n: number;
  name: string;
  emoji: string;
  /** couleurs de la carte du monde */
  sky: [string, string];
  ground: string;
  levels: AdvLevel[];
  /** récompense du premier passage (niveaux normaux) */
  coins: number;
  /** coffre du boss */
  bossChest: ChestTier;
}

type Row = [AdvGoal, string, Difficulty[], number, number, [number, number]] | [AdvGoal, string, Difficulty[], number, number, [number, number], "chaos"];
// [objectif, carte, adversaires, temps limite (s), but, étoiles 2/3]
const W: { name: string; emoji: string; sky: [string, string]; ground: string; coins: number; chest: ChestTier; rows: Row[]; boss: { map: string; characterId: string; skinId?: string; name: string; difficulty: Difficulty; rules: BossRules; minions: Difficulty[]; stars: [number, number] } }[] = [
  {
    name: "Forêt enchantée", emoji: "🌲", sky: ["#7fd6ff", "#c9f3ff"], ground: "#5fbf4a", coins: 50, chest: "rare",
    rows: [
      ["crates", "forest", [], 60, 8, [35, 22]],
      ["win", "forest", ["easy"], 120, 0, [70, 40]],
      ["gold", "forest", ["easy"], 90, 12, [60, 40]],
      ["crates", "forest", ["easy"], 90, 14, [60, 40]],
      ["win", "labyrinth", ["easy", "easy"], 120, 0, [80, 50]],
      ["survive", "forest", ["easy", "easy"], 45, 45, [1, 2], "chaos"],
      ["gold", "mine", ["easy", "easy"], 100, 20, [70, 45]],
      ["win", "forest", ["easy", "easy", "easy"], 150, 0, [90, 60]],
      ["crates", "forest", ["easy", "easy"], 100, 18, [70, 50]],
    ],
    boss: { map: "forest", characterId: "bruno", name: "Bruno le Colosse", difficulty: "normal", rules: { hp: 3, bombs: 3, range: 3, speed: 0.2 }, minions: [], stars: [80, 50] },
  },
  {
    name: "Plage aux trésors", emoji: "🏖️", sky: ["#5ec8ff", "#bff0ff"], ground: "#f2d48a", coins: 75, chest: "epic",
    rows: [
      ["win", "beach", ["normal"], 120, 0, [60, 35]],
      ["gold", "island", ["easy", "normal"], 100, 20, [65, 45]],
      ["crates", "beach", ["normal"], 90, 18, [60, 40]],
      ["survive", "beach", ["normal", "easy"], 60, 60, [1, 2], "chaos"],
      ["win", "beach", ["normal", "normal"], 120, 0, [80, 50]],
      ["gold", "island", ["normal", "normal"], 110, 28, [80, 55]],
      ["crates", "beach", ["normal", "normal"], 100, 20, [75, 50]],
      ["win", "beach", ["normal", "normal", "easy"], 150, 0, [90, 60]],
      ["survive", "island", ["normal", "normal", "normal"], 75, 75, [1, 3], "chaos"],
    ],
    boss: { map: "beach", characterId: "rainette", skinId: "rainette-royale", name: "Reine Rainette", difficulty: "normal", rules: { hp: 4, bombs: 3, range: 4, speed: 0.25 }, minions: [], stars: [90, 55] },
  },
  {
    name: "Village enneigé", emoji: "❄️", sky: ["#9fd8ff", "#eef8ff"], ground: "#dff2ff", coins: 100, chest: "epic",
    rows: [
      ["win", "xmas", ["hard"], 150, 0, [70, 45]],
      ["crates", "xmas", ["normal"], 90, 20, [65, 45]],
      ["gold", "xmas", ["normal", "hard"], 110, 22, [75, 55]],
      ["survive", "xmas", ["hard", "normal"], 60, 60, [1, 2], "chaos"],
      ["win", "castle", ["hard", "normal"], 150, 0, [80, 50]],
      ["gold", "pyramid", ["hard", "hard"], 110, 30, [80, 55]],
      ["crates", "xmas", ["hard"], 100, 22, [75, 50]],
      ["win", "xmas", ["hard", "normal", "normal"], 150, 0, [95, 65]],
      ["survive", "castle", ["hard", "hard", "hard"], 75, 75, [1, 3], "chaos"],
    ],
    boss: { map: "xmas", characterId: "pingo", name: "Pingo l'Impitoyable", difficulty: "normal", rules: { hp: 4, bombs: 4, range: 4, speed: 0.3 }, minions: [], stars: [100, 65] },
  },
  {
    name: "Volcan infernal", emoji: "🌋", sky: ["#3a1530", "#ff7a3c"], ground: "#5a2a22", coins: 150, chest: "legend",
    rows: [
      ["win", "volcano", ["expert"], 120, 0, [60, 35]],
      ["gold", "vault", ["hard", "expert"], 100, 28, [75, 50]],
      ["crates", "volcano", ["hard"], 100, 20, [70, 50]],
      ["survive", "volcano", ["expert", "hard"], 60, 60, [1, 2], "chaos"],
      ["win", "temple", ["expert", "hard"], 150, 0, [80, 55]],
      ["gold", "western", ["expert", "expert"], 110, 32, [85, 60]],
      ["crates", "volcano", ["hard", "normal"], 110, 18, [80, 55]],
      ["win", "factory", ["expert", "expert", "hard"], 150, 0, [100, 70]],
      ["survive", "volcano", ["expert", "expert", "expert"], 90, 90, [1, 3], "chaos"],
    ],
    boss: { map: "volcano", characterId: "drako", name: "Drako le Dragon", difficulty: "normal", rules: { hp: 5, bombs: 4, range: 5, speed: 0.3 }, minions: [], stars: [110, 70] },
  },
];

export const ADV_WORLDS: AdvWorld[] = W.map((w, wi) => {
  const world = wi + 1;
  const levels: AdvLevel[] = w.rows.map((r, i) => {
    const [goal, mapId, bots, duration, target, stars, mode] = r;
    return {
      id: `${world}-${i + 1}`, world, n: i + 1, goal, mapId, bots,
      modeId: goal === "gold" ? "gold" : mode === "chaos" ? "chaos" : "classic",
      rules: { goal, duration, target: target || undefined, stars },
    };
  });
  const b = w.boss;
  levels.push({
    id: `${world}-10`, world, n: 10, goal: "boss", mapId: b.map, bots: b.minions, modeId: "classic",
    rules: { goal: "boss", duration: 180, stars: b.stars, boss: b.rules },
    boss: { characterId: b.characterId, skinId: b.skinId, name: b.name, difficulty: b.difficulty },
  });
  return { n: world, name: w.name, emoji: w.emoji, sky: w.sky, ground: w.ground, levels, coins: w.coins, bossChest: w.chest };
});

export const ADV_LEVELS: AdvLevel[] = ADV_WORLDS.flatMap((w) => w.levels);
export const ADV_MAX_STARS = ADV_LEVELS.length * 3;

export function advLevel(id: string): AdvLevel | undefined {
  return ADV_LEVELS.find((l) => l.id === id);
}
export function nextLevel(id: string): AdvLevel | undefined {
  const i = ADV_LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? ADV_LEVELS[i + 1] : undefined;
}

/** Paliers d'étoiles (total) et leur récompense. */
export const ADV_MILESTONES: { stars: number; reward: Reward }[] = [
  { stars: 10, reward: { kind: "chest", tier: "rare" } },
  { stars: 20, reward: { kind: "coins", amount: 300 } },
  { stars: 30, reward: { kind: "item", id: "title-explorer" } },
  { stars: 45, reward: { kind: "chest", tier: "epic" } },
  { stars: 60, reward: { kind: "bombers", amount: 30 } },
  { stars: 75, reward: { kind: "chest", tier: "epic" } },
  { stars: 90, reward: { kind: "coins", amount: 1000 } },
  { stars: 105, reward: { kind: "chest", tier: "legend" } },
  { stars: 120, reward: { kind: "item", id: "title-hero" } },
];

/** Étoiles du Pass à chaque niveau réussi. */
export const ADV_PASS_STARS = 10;

export interface AdvState {
  /** meilleures étoiles par niveau */
  stars: Record<string, number>;
  /** meilleur temps (s) par niveau */
  best: Record<string, number>;
  /** paliers d'étoiles récupérés */
  claimed: number[];
}
export const defaultAdv = (): AdvState => ({ stars: {}, best: {}, claimed: [] });

export function advStars(p: Profile, id?: string): number {
  if (id) return p.adv.stars[id] ?? 0;
  return Object.values(p.adv.stars).reduce((a, b) => a + b, 0);
}
export function worldStars(p: Profile, w: number): number {
  return ADV_WORLDS[w - 1].levels.reduce((a, l) => a + advStars(p, l.id), 0);
}
/** Niveau jouable : le premier, ou le précédent réussi. */
export function levelOpen(p: Profile, id: string): boolean {
  const i = ADV_LEVELS.findIndex((l) => l.id === id);
  return i === 0 || (i > 0 && advStars(p, ADV_LEVELS[i - 1].id) > 0);
}
export function worldOpen(p: Profile, w: number): boolean {
  return levelOpen(p, `${w}-1`);
}
/** Prochain niveau à faire (le premier pas encore réussi). */
export function currentLevel(p: Profile): AdvLevel {
  return ADV_LEVELS.find((l) => !advStars(p, l.id)) ?? ADV_LEVELS[ADV_LEVELS.length - 1];
}

/** Récompense du premier passage d'un niveau. */
export function firstClearReward(l: AdvLevel): Reward[] {
  const w = ADV_WORLDS[l.world - 1];
  if (l.goal !== "boss") return [{ kind: "coins", amount: w.coins }];
  const out: Reward[] = [{ kind: "coins", amount: w.coins * 4 }, { kind: "chest", tier: w.bossChest }];
  if (l.world === ADV_WORLDS.length) out.push({ kind: "item", id: "title-bossbuster" });
  return out;
}

export interface AdvOutcome {
  won: boolean;
  stars: number;
  /** étoiles en plus par rapport au record */
  newStars: number;
  first: boolean;
  time: number;
  record: boolean;
  rewards: Reward[];
}

/** Enregistre un niveau joué ; renvoie ce qu'il rapporte (à donner avec grantAll). */
export function recordLevel(p: Profile, l: AdvLevel, won: boolean, stars: number, time: number): AdvOutcome {
  const before = advStars(p, l.id);
  const first = won && before === 0;
  const s = won ? Math.max(1, Math.min(3, stars)) : 0;
  let record = false;
  if (won) {
    p.adv.stars[l.id] = Math.max(before, s);
    const prev = p.adv.best[l.id];
    if (l.goal !== "survive" && (prev === undefined || time < prev)) {
      p.adv.best[l.id] = Math.round(time * 10) / 10;
      record = prev !== undefined;
    }
  }
  return { won, stars: s, newStars: Math.max(0, s - before), first, time, record, rewards: first ? firstClearReward(l) : [] };
}

/** Paliers d'étoiles atteints mais pas encore récupérés. */
export function advClaimable(p: Profile): { stars: number; reward: Reward }[] {
  const n = advStars(p);
  return ADV_MILESTONES.filter((m) => m.stars <= n && !p.adv.claimed.includes(m.stars));
}
export function nextMilestone(p: Profile): { stars: number; reward: Reward } | undefined {
  return ADV_MILESTONES.find((m) => !p.adv.claimed.includes(m.stars));
}

/** Texte de l'objectif. */
export function goalText(l: AdvLevel): string {
  const r = l.rules;
  const n = l.bots.length;
  switch (l.goal) {
    case "crates":
      return `Casse ${r.target} caisses`;
    case "gold":
      return `Ramasse ${r.target} pièces d'or`;
    case "survive":
      return `Survis ${r.target} secondes au Chaos`;
    case "boss":
      return `Bats ${l.boss!.name}`;
    default:
      return n === 1 ? "Élimine ton adversaire" : `Élimine tes ${n} adversaires`;
  }
}
export const GOAL_ICON: Record<AdvGoal, string> = { crates: "🧱", gold: "💰", survive: "⏱️", boss: "👹", win: "💥" };

/** Conditions des étoiles 2 et 3. */
export function starTexts(l: AdvLevel): [string, string, string] {
  const [a, b] = l.rules.stars;
  if (l.goal === "survive") return ["Survivre", `+ éliminer ${a} adversaire${a > 1 ? "s" : ""}`, `+ éliminer ${b} adversaires`];
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return ["Réussir", `en moins de ${mmss(a)}`, `en moins de ${mmss(b)}`];
}

/** Adversaires d'un niveau : personnages tirés de la graine, le boss en premier. */
const FOES = ["kage", "boulon", "champi", "rainette", "bruno", "renard", "bulle", "pingo"];
export function advMatchConfig(l: AdvLevel, me: PlayerSlot, seed: number): MatchConfig {
  const pool = FOES.filter((c) => c !== me.characterId && c !== l.boss?.characterId);
  let k = seed % pool.length;
  const players: PlayerSlot[] = [{ ...me, isBot: false }];
  if (l.boss) players.push({ name: l.boss.name, characterId: l.boss.characterId, skinId: l.boss.skinId, isBot: true, difficulty: l.boss.difficulty });
  for (const d of l.bots) {
    const id = pool[k++ % pool.length];
    players.push({ name: getCharacter(id).name, characterId: id, isBot: true, difficulty: d });
  }
  return { seed, map: getMap(l.mapId), modeId: l.modeId, players, adventure: l.rules };
}
