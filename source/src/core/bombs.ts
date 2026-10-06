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

/** Durée d'alerte la plus longue (sert aux indices visuels et sonores). */
export const BOMB_WARN = Math.max(...Object.values(BOMB_KINDS).map((k) => k.warn));

/** 0 = vient d'être posée … 1 = explose maintenant. */
export function bombProgress(fuse: number, fuseTotal: number): number {
  return fuseTotal > 0 ? Math.min(1, Math.max(0, 1 - fuse / fuseTotal)) : 1;
}
