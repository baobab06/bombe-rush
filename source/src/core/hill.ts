/**
 * Mode « Roi de la colline ».
 *
 * - Une colline (au plus 3×3 cases au centre de la carte, sans les murs ni
 *   l'eau / la lave) est dégagée au début de la partie.
 * - Un joueur SEUL sur la colline marque 1 point par seconde. À deux ou plus,
 *   la colline est disputée : personne ne marque.
 * - Un joueur éliminé réapparaît après quelques secondes, loin des autres,
 *   protégé par un bouclier, avec ses pouvoirs de départ.
 * - Le premier à HILL_RULES.target points gagne. Au bout du temps, le meilleur
 *   score gagne (égalité possible). Pas de mort subite dans ce mode.
 *
 * Tout est déterministe (rng de la partie) : le serveur et les téléphones
 * calculent la même chose ; l'état est aussi recopié dans les instantanés.
 */
import type { Match } from "./match";
import { DT, RULES } from "./rules";
import { TILE, type PlayerState } from "./types";

export const HILL_RULES = {
  /** points pour gagner (1 point = 1 seconde seul sur la colline) */
  target: 25,
  /** délai avant de réapparaître (s) */
  respawnDelay: 3,
  /** bouclier à la réapparition (s) */
  respawnShield: 2.5,
  /** distance minimale (cases) entre la réapparition et la colline */
  respawnHillGap: 3,
} as const;

export class HillState {
  /** cases de la colline (index de grille) */
  readonly cells: number[];
  readonly cellSet: Set<number>;
  readonly center: [number, number];
  /** points de chaque joueur (secondes passées seul sur la colline) */
  readonly scores: number[];
  /** temps restant avant la réapparition de chaque joueur (≤ 0 = rien en attente) */
  readonly respawnIn: number[];
  /** joueur qui marque en ce moment (-1 = personne) */
  holder = -1;
  /** au moins deux joueurs sur la colline */
  contested = false;

  constructor(private m: Match) {
    const g = m.grid;
    const cx = Math.floor((g.w - 1) / 2);
    const cy = Math.floor((g.h - 1) / 2);
    this.center = [cx, cy];
    const usable = (x: number, y: number) => x > 0 && y > 0 && x < g.w - 1 && y < g.h - 1 && g.tile(x, y) !== TILE.WALL && !g.isHazard(x, y);
    let cells: number[] = [];
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (usable(x, y)) cells.push(g.idx(x, y));
    if (cells.length < 3) {
      // centre occupé (lagon, autel…) : les cases praticables les plus proches du
      // centre, toutes à la même distance (la carte étant symétrique, c'est équitable)
      for (let d = 1; d < g.w + g.h; d++) {
        const ring: number[] = [];
        for (let y = 1; y < g.h - 1; y++)
          for (let x = 1; x < g.w - 1; x++) if (Math.abs(x - cx) + Math.abs(y - cy) === d && usable(x, y)) ring.push(g.idx(x, y));
        if (ring.length >= 2) {
          cells = ring;
          break;
        }
      }
    }
    // la colline est dégagée dès le départ
    for (const i of cells)
      if (g.tiles[i] === TILE.BLOCK) {
        g.tiles[i] = TILE.FLOOR;
        g.hiddenBonus[i] = null;
      }
    this.cells = cells;
    this.cellSet = new Set(cells);
    this.scores = m.players.map(() => 0);
    this.respawnIn = m.players.map(() => 0);
  }

  isHill(x: number, y: number): boolean {
    return this.cellSet.has(this.m.grid.idx(x, y));
  }

  /** Points arrondis pour l'affichage. */
  points(id: number): number {
    return Math.floor(this.scores[id] + 1e-6);
  }

  onDeath(p: PlayerState): void {
    this.respawnIn[p.id] = HILL_RULES.respawnDelay;
  }

  update(): void {
    const m = this.m;
    if (m.phase !== "playing") {
      this.holder = -1;
      this.contested = false;
      return;
    }
    // qui est sur la colline ?
    const on = m.players.filter((p) => p.alive && this.cellSet.has(m.grid.idx(Math.floor(p.x), Math.floor(p.y))));
    this.contested = on.length > 1;
    const prev = this.holder;
    this.holder = on.length === 1 ? on[0].id : -1;
    if (this.holder >= 0) {
      const before = this.points(this.holder);
      this.scores[this.holder] = Math.min(HILL_RULES.target, this.scores[this.holder] + DT);
      const after = this.points(this.holder);
      if (after !== before && after % 10 === 0) m.events.push({ t: "hillPoints", player: this.holder, points: after });
    }
    if (this.holder !== prev && this.holder >= 0) m.events.push({ t: "hillTaken", player: this.holder });
    // réapparitions
    // ordre tournant : à réapparition simultanée, personne ne choisit toujours sa case en premier
    const n = m.players.length;
    for (let k = 0; k < n; k++) {
      const p = m.players[(k + m.tick) % n];
      if (p.alive || this.respawnIn[p.id] <= 0) continue;
      this.respawnIn[p.id] -= DT;
      if (this.respawnIn[p.id] <= 0) this.respawn(p);
    }
  }

  /** Un joueur a atteint le score à atteindre. */
  get reached(): boolean {
    return this.scores.some((s) => s >= HILL_RULES.target - 1e-6);
  }

  /** Meilleur score unique (-1 = égalité). */
  leader(): number {
    const best = Math.max(...this.scores.map((_, i) => this.points(i)));
    const top = this.scores.map((_, i) => i).filter((i) => this.points(i) === best);
    return top.length === 1 ? top[0] : -1;
  }

  /** Réapparition sur une case sûre, la plus loin possible des autres joueurs. */
  private respawn(p: PlayerState): void {
    const m = this.m;
    const g = m.grid;
    const others = m.players.filter((o) => o.alive && o.id !== p.id);
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    for (let y = 1; y < g.h - 1; y++)
      for (let x = 1; x < g.w - 1; x++) {
        if (!m.isFreeCell(x, y, true) || g.fire[g.idx(x, y)] > 0) continue;
        if (this.inBlast(x, y)) continue;
        const hill = Math.abs(x - this.center[0]) + Math.abs(y - this.center[1]);
        if (hill < HILL_RULES.respawnHillGap) continue;
        // au moins une case libre à côté (pas emmuré)
        let exits = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!g.blocksMove(x + dx, y + dy)) exits++;
        if (!exits) continue;
        const near = others.length ? Math.min(...others.map((o) => Math.abs(o.x - 0.5 - x) + Math.abs(o.y - 0.5 - y))) : 10;
        // loin des autres avant tout, puis hasard (déterministe) pour départager
        const score = Math.min(near, 8) * 10 + exits + m.rng.next();
        if (score > bestScore) {
          bestScore = score;
          best = [x, y];
        }
      }
    if (!best) {
      // aucune case sûre pour l'instant : on réessaie un peu plus tard
      this.respawnIn[p.id] = 0.5;
      return;
    }
    p.x = best[0] + 0.5;
    p.y = best[1] + 0.5;
    p.alive = true;
    p.moving = false;
    p.slideX = 0;
    p.slideY = 0;
    p.faceX = 0;
    p.faceY = 1;
    p.speed = RULES.baseSpeed;
    p.speedLevel = 0;
    p.maxBombs = RULES.startBombs;
    p.range = RULES.startRange;
    p.activeBombs = Math.min(p.activeBombs, p.maxBombs);
    p.shieldTime = HILL_RULES.respawnShield;
    p.killedBy = -1;
    this.respawnIn[p.id] = 0;
    m.events.push({ t: "respawn", player: p.id, x: best[0], y: best[1] });
  }

  /** La case est-elle sur la ligne d'une bombe posée ? */
  private inBlast(x: number, y: number): boolean {
    for (const b of this.m.bombs.values()) {
      if (b.tx === x && Math.abs(b.ty - y) <= b.range) return true;
      if (b.ty === y && Math.abs(b.tx - x) <= b.range) return true;
    }
    return false;
  }
}
