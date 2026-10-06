import { RULES } from "./rules";
import type { PlayerState } from "./types";

export type CanEnter = (tx: number, ty: number) => boolean;

const EPS = 1e-4;

/**
 * Déplacement sur grille « à l'ancienne » mais tolérant :
 *  - le personnage circule dans des couloirs alignés sur les cases ;
 *  - s'il pousse vers un couloir en étant légèrement décalé, il est
 *    recentré automatiquement (assistance de virage) ;
 *  - il ne peut jamais entrer dans une case bloquante : les collisions
 *    se résolvent sur la grille, donc sans tunnel ni accroche.
 * Retourne la distance réellement parcourue.
 */
function stepAxis(
  p: PlayerState,
  horizontal: boolean,
  dir: number,
  dist: number,
  canEnter: CanEnter,
): number {
  let a = horizontal ? p.x : p.y; // axe du mouvement
  let b = horizontal ? p.y : p.x; // axe transverse
  const lane = Math.floor(b);
  const off = b - (lane + 0.5);
  const cell = Math.floor(a);
  const cellC = cell + 0.5;
  const ahead = (laneIdx: number) =>
    horizontal ? canEnter(cell + dir, laneIdx) : canEnter(laneIdx, cell + dir);
  const side = (laneIdx: number) =>
    horizontal ? canEnter(cell, laneIdx) : canEnter(laneIdx, cell);

  let used = 0;

  if (Math.abs(off) > EPS) {
    const sOff = Math.sign(off);
    const adj = lane + sOff;
    if (ahead(lane)) {
      // recentrage dans le couloir courant
      const s = Math.min(dist, Math.abs(off));
      b -= sOff * s;
      used += s;
    } else if (
      Math.abs(off) > 0.5 - RULES.cornerAssist &&
      ahead(adj) &&
      side(adj)
    ) {
      // le couloir voisin est libre : on glisse vers lui
      const target = adj + 0.5;
      const s = Math.min(dist, Math.abs(target - b));
      b += sOff * s;
      used += s;
    } else {
      // pas de passage : on se recentre quand même pour ne pas rester de travers
      const s = Math.min(dist, Math.abs(off));
      b -= sOff * s;
      used += s;
      // et on avance jusqu'au centre de la case si on n'y est pas
    }
  }

  const rem = dist - used;
  const aligned = Math.abs(b - (Math.floor(b) + 0.5)) <= EPS;
  if (rem > 0 && aligned) {
    let na = a + dir * rem;
    if (!ahead(Math.floor(b))) {
      const past = (a - cellC) * dir;
      if (past >= 0) na = a; // déjà au centre ou au-delà : bloqué
      else if ((na - cellC) * dir > 0) na = cellC;
    }
    used += Math.abs(na - a);
    a = na;
  }

  if (horizontal) {
    p.x = a;
    p.y = b;
  } else {
    p.y = a;
    p.x = b;
  }
  return used;
}

export function movePlayer(
  p: PlayerState,
  mx: number,
  my: number,
  dt: number,
  canEnter: CanEnter,
): void {
  const ax = Math.abs(mx);
  const ay = Math.abs(my);
  if (Math.max(ax, ay) < 0.25) {
    p.moving = false;
    return;
  }
  const dist = p.speed * dt;
  const horizontalFirst = ax >= ay;
  const pDir = horizontalFirst ? Math.sign(mx) : Math.sign(my);
  const used1 = stepAxis(p, horizontalFirst, pDir, dist, canEnter);
  let used2 = 0;
  let sDir = 0;
  // Diagonale, ou axe principal bloqué : on tente l'autre axe avec le reste
  const secMag = horizontalFirst ? ay : ax;
  if (used1 < dist * 0.5 && secMag > 0.3) {
    sDir = horizontalFirst ? Math.sign(my) : Math.sign(mx);
    used2 = stepAxis(p, !horizontalFirst, sDir, dist - used1, canEnter);
  }
  const used = used1 + used2;
  p.moving = used > EPS;
  if (!p.moving) return;
  // orientation : l'axe qui a réellement fait avancer le personnage
  if (used2 > used1) {
    p.faceX = horizontalFirst ? 0 : sDir;
    p.faceY = horizontalFirst ? sDir : 0;
  } else {
    p.faceX = horizontalFirst ? pDir : 0;
    p.faceY = horizontalFirst ? 0 : pDir;
  }
  p.walkPhase += used * 2.2;
}
