import type { Match } from "./match";
import type { BombRules } from "./bombs";
import { ChaosDirector } from "./chaos";
import { HillState } from "./hill";

/**
 * Modes de jeu : des crochets appelés par la simulation.
 * Le mode Chaos branche son directeur d'événements (core/chaos.ts) ici,
 * sans modifier le cœur du jeu.
 */
export interface ModeDef {
  id: string;
  name: string;
  tagline: string;
  available: boolean;
  /** emoji affiché sur les boutons du mode */
  emoji?: string;
  /** false : pas de mort subite (murs qui tombent) dans ce mode */
  suddenDeath?: boolean;
  /** règles de bombes propres au mode (sinon celles du jeu) */
  bombRules?: Partial<BombRules>;
  /** butin propre au mode : poids et quotas ajoutés à ceux du jeu (core/loot.ts) */
  loot?: { weights: Record<string, number>; maxPerMatch: Record<string, number> };
  onStart?(m: Match): void;
  onTick?(m: Match, dt: number): void;
}

export const MODES: ModeDef[] = [
  {
    id: "classic",
    name: "Classique",
    emoji: "🎮",
    tagline: "Le dernier debout gagne.",
    available: true,
  },
  {
    id: "chaos",
    name: "Chaos",
    emoji: "💀",
    tagline: "Pluie de bombes, tempêtes, explosions géantes…",
    available: true,
    onStart(m) {
      m.chaos = new ChaosDirector(m);
    },
    onTick(m, dt) {
      m.chaos?.update(dt);
    },
  },
  {
    id: "koth",
    name: "Domination",
    tagline: "2 contre 2 : tenez la zone en équipe. Première équipe à 25 points !",
    available: true,
    emoji: "👑",
    suddenDeath: false,
    // 2 contre 2 : bombes plus lisibles (mèche 2,5 s, portée 2, explosion brève)
    bombRules: { fuse: 2.5, warn: 0.8, startRange: 2, startBombs: 1, fireDuration: 0.4, cooldown: 0.5 },
    // bombe à lancer : seulement en Domination (dans les caisses + apparitions régulières, voir hill.ts)
    loot: { weights: { throw: 14 }, maxPerMatch: { throw: 4, big: 5, elec: 5 } },
    onStart(m) {
      // équipes rouges / bleues dès qu'il y a au moins 2 joueurs
      if (m.players.length >= 2) m.setTeams();
      m.hill = new HillState(m);
    },
    onTick(m) {
      m.hill?.update();
    },
  },
];

export function getMode(id: string): ModeDef {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}
