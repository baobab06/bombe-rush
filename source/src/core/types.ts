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
  /** lancer la prochaine bombe (front montant) ; absent = non */
  throw?: boolean;
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
  /** temps (s) avant de pouvoir reposer une bombe (délai entre deux poses) */
  bombCooldown: number;
  /** capacité « bombe à lancer » (0 ou 1) : la prochaine bombe peut être lancée */
  throwCharges: number;
  /** capacité « grosse bombe » (0 ou 1) : la prochaine bombe a une portée bien plus grande */
  bigCharges: number;
  /** capacité « bombe électrique » (0 ou 1) : la prochaine bombe paralyse autour d'elle */
  elecCharges: number;
  /** > 0 : paralysé (ne bouge pas, ne pose pas de bombe) pendant ce temps */
  stunTime: number;
  /** > 0 : vient d'être paralysé, ne peut pas l'être de nouveau tout de suite */
  stunImmune: number;
  /** capacité « bombe gelante » (0 ou 1) : la prochaine bombe ralentit autour d'elle */
  freezeCharges: number;
  /** > 0 : gelé (ralenti) pendant ce temps — la vitesse de base n'est pas touchée */
  slowTime: number;
  /** > 0 : vient d'être gelé, ne peut pas l'être de nouveau tout de suite */
  slowImmune: number;
  /** capacité « bombe toxique » (0 ou 1) : la prochaine bombe laisse un nuage toxique */
  toxicCharges: number;
  /** capacité « réaction en chaîne » (0 ou 1) : la prochaine bombe déclenche les bombes proches */
  chainCharges: number;
  /** doses de gaz reçues (à TOXIC.lethalDoses : éliminé) */
  toxDose: number;
  /** temps avant la prochaine dose possible dans le nuage (s) */
  toxTick: number;
  /** temps passé hors du nuage depuis la dernière dose perdue (s) */
  toxRecover: number;
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
  /**
   * Bombe lancée encore en l'air : partie de (fromX, fromY), elle atterrit sur
   * (tx, ty) après `dur` secondes. En l'air : pas sur la grille, pas de compte
   * à rebours, rien ne peut la faire sauter. Absent = posée au sol.
   */
  flight?: { fromX: number; fromY: number; t: number; dur: number };
  /** grosse bombe (bonus) : portée augmentée, dessin et explosion plus imposants */
  big?: boolean;
  /** bombe électrique (bonus) : décharge paralysante à l'explosion */
  elec?: boolean;
  /** bombe gelante (bonus) : souffle glacé ralentissant à l'explosion */
  freeze?: boolean;
  /** bombe toxique (bonus) : laisse un nuage toxique sur les cases touchées */
  toxic?: boolean;
  /**
   * Réaction en chaîne : 0 = bombe « réaction en chaîne » du bonus ;
   * 1, 2… = bombe déclenchée par la chaîne (relais de niveau n). Absent = bombe normale.
   */
  chainDepth?: number;
  /** déjà déclenchée par une réaction en chaîne (ne sera plus jamais re-déclenchée) */
  chainArmed?: boolean;
}

/** Nuage toxique : effet temporaire indépendant de la grille (le sol n'est pas modifié). */
export interface ToxicZone {
  id: number;
  owner: number;
  cells: number[];
  timeLeft: number;
  duration: number;
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
  | { t: "bombThrown"; x: number; y: number; toX: number; toY: number; owner: number }
  | { t: "bombLanded"; x: number; y: number; owner: number }
  | { t: "explode"; x: number; y: number; owner: number; cells: number; chain: number; big?: boolean }
  | { t: "blockDestroyed"; x: number; y: number }
  /** décharge d'une bombe électrique : cases touchées (indices de grille) */
  | { t: "shock"; x: number; y: number; owner: number; cells: number[] }
  | { t: "stunned"; player: number; by: number; dur: number }
  /** souffle glacé d'une bombe gelante : cases touchées (indices de grille) */
  | { t: "frost"; x: number; y: number; owner: number; cells: number[] }
  | { t: "frozen"; player: number; by: number; dur: number }
  /** nuage toxique posé / dose reçue */
  | { t: "gas"; x: number; y: number; owner: number; cells: number[] }
  | { t: "poisoned"; player: number; dose: number }
  /** réaction en chaîne : la bombe en (x, y) déclenche celle en (toX, toY) dans `delay` s */
  | { t: "chainLink"; x: number; y: number; toX: number; toY: number; delay: number }
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
  | { t: "chaosSkip" }
  | { t: "hillTaken"; player: number }
  | { t: "hillPoints"; player: number; points: number }
  | { t: "hillWarn"; x: number; y: number }
  | { t: "hillMoved"; x: number; y: number }
  | { t: "respawn"; player: number; x: number; y: number }
  | { t: "eruption"; x: number; y: number }
  | { t: "matchEnd"; winner: number };

export type MatchPhase = "countdown" | "playing" | "ending" | "over";
