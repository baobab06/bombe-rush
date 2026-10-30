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

/**
 * BOMBE GELANTE — réglages. À l'explosion (dégâts habituels, inchangés),
 * un souffle glacé couvre la croix de l'explosion + les cases à `radius`
 * pas au plus (il contourne les coins, s'arrête aux murs et aux caisses).
 * Les joueurs touchés (sauf coéquipiers du poseur et joueurs sous bouclier)
 * sont ralentis : vitesse × (1 − slow) pendant `duration` secondes.
 * La vitesse de base n'est jamais modifiée (le ralentissement est appliqué
 * au moment du déplacement), donc elle revient d'elle-même à la fin.
 *  - pas de cumul ni de prolongation : déjà gelé = rien de plus ;
 *  - après un gel, `immunity` secondes de protection (pas de gel sans fin).
 */
export const FREEZE = {
  /** réduction de vitesse (0,4 = −40 %) */
  slow: 0.4,
  /** durée du ralentissement (s) */
  duration: 2.5,
  /** portée du souffle glacé autour du centre (pas) */
  radius: 2,
  /** protection contre un nouveau gel juste après (s) */
  immunity: 1.0,
} as const;

/**
 * BOMBE TOXIQUE — réglages. À l'explosion (dégâts habituels, inchangés),
 * un nuage toxique reste sur les cases touchées par l'explosion pendant
 * `duration` secondes, comme un effet indépendant (il ne modifie pas le sol).
 *
 * Le jeu n'a pas de points de vie (un coup = éliminé) : le gaz agit donc par
 * DOSES. Un adversaire dans le nuage prend 1 dose en entrant puis 1 toutes
 * les `doseEvery` s (jamais à chaque image) ; à `lethalDoses` doses il est
 * éliminé. Hors du nuage, il perd 1 dose toutes les `recoverEvery` s.
 * → traverser vite une case : survivable ; rester dedans ≈ 1 s : éliminé.
 *  - chaque nuage a sa propre durée : un nuage qui en chevauche un autre ne
 *    prolonge rien ; au plus `maxZones` nuages (le plus ancien disparaît) ;
 *  - plusieurs nuages superposés ne donnent jamais plus d'une dose à la fois.
 */
export const TOXIC = {
  /** durée d'un nuage (s) */
  duration: 3,
  /** une dose toutes les N secondes passées dans le nuage */
  doseEvery: 0.5,
  /** doses qui éliminent */
  lethalDoses: 3,
  /** hors du nuage : une dose en moins toutes les N secondes */
  recoverEvery: 1,
  /** nuages actifs au maximum sur la carte */
  maxZones: 8,
} as const;

/**
 * BOMBE À RÉACTION EN CHAÎNE — réglages. À l'explosion, elle cherche les
 * bombes dans sa zone d'influence (`radius` pas autour d'elle, en contournant
 * les coins ; murs et caisses bloquent) et les déclenche en cascade rapide :
 * la plus proche saute après `step` s, la suivante après 2 × `step`…
 * Les bombes ainsi déclenchées deviennent des RELAIS : elles cherchent à
 * leur tour les bombes autour d'elles, jusqu'à `maxDepth` relais.
 * Sécurité : une bombe n'explose qu'une fois (elle quitte la carte à
 * l'explosion), un déclenchement ne peut qu'AVANCER une explosion (jamais la
 * retarder), une bombe déjà déclenchée n'est pas re-déclenchée, au plus
 * `maxLinks` bombes déclenchées par explosion. Les bombes en vol (lancées)
 * ne peuvent pas être déclenchées ; les bombes spéciales gardent leurs effets.
 */
export const CHAIN = {
  /** zone d'influence (pas autour de la bombe) */
  radius: 3,
  /** délai entre deux explosions de la cascade (s) */
  step: 0.09,
  /** nombre maximal de relais successifs */
  maxDepth: 6,
  /** bombes déclenchées au plus par une explosion */
  maxLinks: 12,
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
