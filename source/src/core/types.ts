/** Types partagés de la simulation. Aucun accès au DOM ici : ce code doit
 *  pouvoir tourner sur un serveur Node pour le multijoueur. */

export const TILE = { FLOOR: 0, WALL: 1, BLOCK: 2 } as const;

/** Sol spécial sous une case (indépendant des blocs). */
export const TERRAIN = {
  NONE: 0,
  LAVA: 1, // infranchissable à pied, les flammes passent au-dessus
  WATER: 2, // idem
  ICE: 3, // glissant : on continue sur sa lancée
  VENT: 4, // cheminée volcanique : entre en éruption périodiquement
} as const;
export type TileType = (typeof TILE)[keyof typeof TILE];

export type Difficulty = "easy" | "normal" | "hard" | "expert";

/** Commande d'entrée d'un joueur pour un tick. C'est ce qui transitera
 *  sur le réseau (quelques octets par tick). */
export interface InputCmd {
  mx: number; // -1..1
  my: number; // -1..1
  bomb: boolean; // appui (front montant)
  ability: boolean; // appui (front montant)
}
export const NO_INPUT: InputCmd = { mx: 0, my: 0, bomb: false, ability: false };

export interface PlayerSlot {
  name: string;
  characterId: string;
  /** cosmétique uniquement (aucun effet sur la simulation) */
  skinId?: string;
  /** accessoire et effet équipés (cosmétiques) */
  accessoryId?: string;
  trailId?: string;
  /** effet d'explosion équipé (cosmétique) */
  boomId?: string;
  isBot: boolean;
  difficulty?: Difficulty;
  /** identifiant réseau/compte, plus tard */
  accountId?: string;
}

export interface PlayerStats {
  bombsPlaced: number;
  kills: number;
  blocksDestroyed: number;
  bonusesPicked: number;
  survivalTime: number;
}

export interface PlayerState {
  id: number;
  name: string;
  characterId: string;
  skinId?: string;
  accessoryId?: string;
  trailId?: string;
  /** effet d'explosion équipé (cosmétique) */
  boomId?: string;
  isBot: boolean;
  difficulty?: Difficulty;
  alive: boolean;
  x: number; // centre, en unités de case (case i => centre à i + 0.5)
  y: number;
  faceX: number;
  faceY: number;
  moving: boolean;
  walkPhase: number;
  /** direction de glissade sur la glace (0,0 = aucune) */
  slideX: number;
  slideY: number;
  speed: number; // cases / seconde
  speedLevel: number;
  maxBombs: number;
  activeBombs: number;
  range: number;
  shieldCharges: number;
  shieldTime: number; // > 0 : bouclier actif
  deathTime: number; // temps de match à la mort
  killedBy: number; // id du tueur, -1 = aucun / environnement
  place: number; // 1 = vainqueur, 0 = non déterminé
  stats: PlayerStats;
}

export interface BombState {
  id: number;
  ownerId: number;
  tx: number;
  ty: number;
  fuse: number; // secondes restantes
  fuseTotal: number;
  range: number;
  /** joueurs encore debout sur la bombe au moment de la pose : ils peuvent en sortir */
  passable: number[];
}

export interface BonusState {
  id: number;
  type: string; // clé du registre de bonus
  tx: number;
  ty: number;
  invuln: number; // protection contre la flamme qui vient de le révéler
  age: number;
}

/** Bits de forme de flamme (pour le rendu des bras / extrémités). */
export const FIRE = { L: 1, R: 2, U: 4, D: 8, CENTER: 16 } as const;

export type SimEvent =
  | { t: "bombPlaced"; x: number; y: number; owner: number }
  | { t: "explode"; x: number; y: number; owner: number; cells: number; chain: number }
  | { t: "blockDestroyed"; x: number; y: number }
  | { t: "bonusSpawn"; x: number; y: number; type: string }
  | { t: "bonusPicked"; x: number; y: number; type: string; player: number }
  | { t: "bonusBurned"; x: number; y: number }
  | { t: "playerDied"; player: number; killer: number; x: number; y: number }
  | { t: "shieldOn"; player: number }
  | { t: "shieldBlocked"; player: number }
  | { t: "suddenDeath" }
  | { t: "wallWarn"; x: number; y: number }
  | { t: "wallDrop"; x: number; y: number }
  | { t: "ventWarn"; x: number; y: number }
  | { t: "chaosWarn"; id: string; label: string; emoji: string; seconds: number }
  | { t: "chaosStart"; id: string; label: string; emoji: string; via?: string }
  | { t: "chaosEnd"; id: string }
  | { t: "eruption"; x: number; y: number }
  | { t: "matchEnd"; winner: number };

export type MatchPhase = "countdown" | "playing" | "ending" | "over";
