/**
 * TYPES DE BOMBES — délais avant explosion, modifiables ici et nulle part
 * ailleurs.
 *
 *  - fuse : secondes entre la pose et l'explosion ;
 *  - warn : dernières secondes « d'alerte » (bombe rouge qui clignote vite,
 *    zone de l'explosion affichée au sol, tic-tac rapide).
 *
 * Pour ajouter plus tard un type de bombe (mèche courte, bombe à effet
 * spécial…) : ajouter une entrée ici, puis la poser avec son identifiant.
 */
export interface BombKind {
  id: string;
  name: string;
  fuse: number;
  warn: number;
}

export const BOMB_KINDS = {
  /** bombe posée par les joueurs (V1 : 2,0 s → 1,4 s, partie plus nerveuse) */
  standard: { id: "standard", name: "Bombe", fuse: 1.4, warn: 0.55 },
  /** bombes qui tombent du ciel (mode Chaos) : un poil plus longues, on ne les voit pas venir */
  rain: { id: "rain", name: "Bombe du ciel", fuse: 1.6, warn: 0.55 },
} satisfies Record<string, BombKind>;

export type BombKindId = keyof typeof BOMB_KINDS;

/** BOMBE À LANCER — réglages du lancer. */
export const THROW = {
  /** distance maximale (cases) */
  maxDist: 3,
  /** temps de vol (s) : base + par case parcourue */
  flightBase: 0.12,
  flightPerCell: 0.11,
  /** hauteur de l'arc à l'écran (en cases) */
  arcHeight: 0.9,
} as const;

/**
 * GROSSE BOMBE — réglages. La prochaine bombe posée (ou lancée) après le
 * bonus a une portée multipliée : portée = max(portée + minExtra,
 * arrondi(portée × rangeMul)), plafonnée à maxRange. Ex. portée 2 → 4,
 * portée 3 → 5. Le reste (murs, caisses, chaînes, dégâts) ne change pas.
 */
export const BIG = {
  /** multiplicateur de portée (≈ 1,5 à 2) */
  rangeMul: 1.75,
  /** au moins +2 cases par rapport à la bombe normale */
  minExtra: 2,
  /** portée maximale d'une grosse bombe */
  maxRange: 9,
  /** taille à l'écran (1 = bombe normale) */
  scale: 1.3,
} as const;

/**
 * BOMBE ÉLECTRIQUE — réglages. À l'explosion (dégâts habituels, inchangés),
 * une décharge part du centre : elle couvre la croix de l'explosion + toutes
 * les cases à `radius` pas au plus (elle contourne les coins mais ne traverse
 * ni les murs ni les caisses). Les joueurs touchés (sauf coéquipiers du
 * poseur et joueurs sous bouclier) sont paralysés `stun` secondes.
 *  - pas de cumul : un joueur déjà paralysé n'est pas re-paralysé ;
 *  - après une paralysie, `immunity` secondes de protection (pas de
 *    paralysie en boucle par des décharges qui s'enchaînent).
 */
export const SHOCK = {
  /** durée de la paralysie (s) */
  stun: 1.0,
  /** portée de la décharge autour du centre (pas, contourne les coins) */
  radius: 2,
  /** protection contre une nouvelle paralysie juste après (s) */
  immunity: 0.75,
} as const;

/** Portée d'une grosse bombe à partir de la portée normale du joueur. */
export function bigRange(range: number): number {
  return Math.min(BIG.maxRange, Math.max(range + BIG.minExtra, Math.round(range * BIG.rangeMul)));
}

/** Durée d'alerte la plus longue (sert aux indices visuels et sonores). */
export const BOMB_WARN = Math.max(...Object.values(BOMB_KINDS).map((k) => k.warn));

/** 0 = vient d'être posée … 1 = explose maintenant. */
export function bombProgress(fuse: number, fuseTotal: number): number {
  return fuseTotal > 0 ? Math.min(1, Math.max(0, 1 - fuse / fuseTotal)) : 1;
}

/**
 * RÈGLES DES BOMBES d'une partie (valeurs de départ). Par défaut celles du
 * jeu (rules.ts / BOMB_KINDS) ; un mode peut en changer certaines
 * (ex. Domination 2 contre 2 : mèche plus longue, portée 2).
 */
export interface BombRules {
  /** délai avant explosion (s) */
  fuse: number;
  /** alerte avant l'explosion (s) : clignotement rouge, tic-tac */
  warn: number;
  /** portée de départ (cases dans chaque direction) */
  startRange: number;
  /** bombes simultanées au départ */
  startBombs: number;
  /** durée de l'explosion à l'écran et au sol (s) */
  fireDuration: number;
  /** délai minimum entre deux poses du même joueur (s) */
  cooldown: number;
}
