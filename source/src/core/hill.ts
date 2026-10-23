/**
 * Mode « Roi de la colline ».
 *
 * - La zone (au plus 3×3 cases, sans les murs ni l'eau / la lave) commence au
 *   centre puis SE DÉPLACE toutes les HILL_RULES.moveEvery secondes vers un
 *   autre emplacement (centre ou un des 4 quarts, placés en miroir). Le nouvel
 *   emplacement est annoncé moveWarn secondes avant (et dégagé des blocs).
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
  /** la zone change de place toutes les N secondes */
  moveEvery: 20,
  /** annonce (contour + compte à rebours) avant le déplacement */
  moveWarn: 4,
} as const;

interface Site {
  center: [number, number];
  cells: number[];
  set: Set<number>;
}

export class HillState {
  /** emplacements possibles (0 = centre) */
  readonly sites: Site[];
  /** emplacement actuel */
  site = 0;
  /** prochain emplacement annoncé (-1 = pas encore) */
  next = -1;
  /** secondes avant le prochain déplacement */
  moveIn: number = HILL_RULES.moveEvery;
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
    const qx = Math.round((g.w - 1) * 0.25);
    const qy = Math.round((g.h - 1) * 0.3);
    const centers: [number, number][] = [
      [cx, cy],
      [qx, qy],
      [g.w - 1 - qx, qy],
      [qx, g.h - 1 - qy],
      [g.w - 1 - qx, g.h - 1 - qy],
    ];
    this.sites = [];
    // cartes Domination : les zones sont dessinées dans le plan (dalles « z »)
    const drawn = HillState.drawnSites(m);
    if (drawn.length) {
      drawn.sort((a, b) => Math.abs(a.center[0] - cx) + Math.abs(a.center[1] - cy) - (Math.abs(b.center[0] - cx) + Math.abs(b.center[1] - cy)));
      this.sites.push(...drawn);
    }
    if (!this.sites.length) for (const c of centers) {
      const cells = HillState.cellsAround(m, c[0], c[1]);
      if (cells.length >= 2 && !this.sites.some((o) => o.center[0] === c[0] && o.center[1] === c[1])) this.sites.push({ center: c, cells, set: new Set(cells) });
    }
    if (!this.sites.length) {
      const cells = HillState.cellsAround(m, cx, cy);
      this.sites.push({ center: [cx, cy], cells, set: new Set(cells) });
    }
    this.clearBlocks(this.sites[0]);
    this.scores = m.players.map(() => 0);
    this.respawnIn = m.players.map(() => 0);
  }

  /** Groupes de dalles « z » du plan (4-connexes) : un groupe = un emplacement. */
  private static drawnSites(m: Match): Site[] {
    const layout = m.config.map.layout;
    const g = m.grid;
    const seen = new Set<number>();
    const out: Site[] = [];
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const i0 = g.idx(x, y);
        if (layout[y]?.[x] !== "z" || seen.has(i0)) continue;
        const cells: number[] = [];
        const q = [[x, y]];
        seen.add(i0);
        while (q.length) {
          const [qx, qy] = q.pop()!;
          cells.push(g.idx(qx, qy));
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = qx + dx;
            const ny = qy + dy;
            const n = g.idx(nx, ny);
            if (layout[ny]?.[nx] === "z" && !seen.has(n)) {
              seen.add(n);
              q.push([nx, ny]);
            }
          }
        }
        // centre : la case du groupe la plus proche du barycentre
        const mx = cells.reduce((a, i) => a + (i % g.w), 0) / cells.length;
        const my = cells.reduce((a, i) => a + Math.floor(i / g.w), 0) / cells.length;
        let best = cells[0];
        for (const i of cells) if (Math.hypot((i % g.w) - mx, Math.floor(i / g.w) - my) < Math.hypot((best % g.w) - mx, Math.floor(best / g.w) - my)) best = i;
        cells.sort((a, b) => a - b);
        out.push({ center: [best % g.w, Math.floor(best / g.w)], cells, set: new Set(cells) });
      }
    return out;
  }

  /** Cases d'une zone : le 3×3 autour de (cx, cy) ; s'il est trop occupé, l'anneau praticable le plus proche. */
  private static cellsAround(m: Match, cx: number, cy: number): number[] {
    const g = m.grid;
    const usable = (x: number, y: number) => x > 0 && y > 0 && x < g.w - 1 && y < g.h - 1 && g.tile(x, y) !== TILE.WALL && !g.isHazard(x, y);
    let cells: number[] = [];
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (usable(x, y)) cells.push(g.idx(x, y));
    if (cells.length < 3) {
      // centre occupé (lagon, autel…) : les cases praticables les plus proches, toutes à la même distance
      for (let d = 1; d < 4; d++) {
        const ring: number[] = [];
        for (let y = 1; y < g.h - 1; y++)
          for (let x = 1; x < g.w - 1; x++) if (Math.abs(x - cx) + Math.abs(y - cy) === d && usable(x, y)) ring.push(g.idx(x, y));
        if (ring.length >= 2) {
          cells = ring;
          break;
        }
      }
    }
    return cells;
  }

  private clearBlocks(site: Site): void {
    const g = this.m.grid;
    for (const i of site.cells)
      if (g.tiles[i] === TILE.BLOCK) {
        g.tiles[i] = TILE.FLOOR;
        g.hiddenBonus[i] = null;
      }
  }

  get cells(): number[] {
    return this.sites[this.site].cells;
  }
  get cellSet(): Set<number> {
    return this.sites[this.site].set;
  }
  get center(): [number, number] {
    return this.sites[this.site].center;
  }
  /** cases du prochain emplacement annoncé (vide si rien d'annoncé) */
  get nextCells(): number[] {
    return this.next >= 0 ? this.sites[this.next].cells : [];
  }
  get nextSet(): Set<number> | null {
    return this.next >= 0 ? this.sites[this.next].set : null;
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
    // déplacement de la zone
    if (this.sites.length > 1) {
      this.moveIn -= DT;
      if (this.next < 0 && this.moveIn <= HILL_RULES.moveWarn) {
        // tirage déterministe (rng de la partie), jamais le même emplacement
        let k = Math.floor(m.rng.next() * (this.sites.length - 1));
        if (k >= this.site) k++;
        this.next = k;
        this.clearBlocks(this.sites[k]);
        m.events.push({ t: "hillWarn", x: this.sites[k].center[0], y: this.sites[k].center[1] });
      }
      if (this.moveIn <= 0 && this.next >= 0) {
        this.site = this.next;
        this.next = -1;
        this.moveIn = HILL_RULES.moveEvery;
        this.holder = -1;
        this.contested = false;
        m.events.push({ t: "hillMoved", x: this.center[0], y: this.center[1] });
      }
    }
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
