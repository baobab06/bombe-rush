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
  moveEvery: 10,
  /** annonce (contour + compte à rebours) avant le déplacement */
  moveWarn: 3,
  /** bonus « bombe à lancer » : première apparition, puis intervalle (s) */
  throwFirst: 12,
  throwEvery: 16,
  /** bonus « grosse bombe » : première apparition, puis intervalle (s) */
  bigFirst: 22,
  bigEvery: 18,
} as const;

interface Site {
  center: [number, number];
  cells: number[];
  set: Set<number>;
}

export class HillState {
  /** emplacements possibles (0 = centre) */
  sites: Site[];
  /** emplacement actuel */
  site = 0;
  /** prochain emplacement annoncé (-1 = pas encore) */
  next = -1;
  /** secondes avant le prochain déplacement */
  moveIn: number = HILL_RULES.moveEvery;
  /** points de chaque joueur (secondes passées seul sur la colline) */
  readonly scores: number[];
  /** secondes avant la prochaine apparition d'un bonus « bombe à lancer » */
  throwSpawnIn: number = HILL_RULES.throwFirst;
  /** secondes avant la prochaine apparition d'un bonus « grosse bombe » */
  bigSpawnIn: number = HILL_RULES.bigFirst;
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
    // une zone = UNE seule case : le centre de l'emplacement. S'il n'est pas praticable,
    // la case libre la plus proche EN ALLANT VERS LE MILIEU de la carte (règle en miroir,
    // donc équitable). Le centre de la carte, lui, n'a pas de miroir : on l'oublie s'il est pris.
    const usable = (x: number, y: number) => x > 0 && y > 0 && x < g.w - 1 && y < g.h - 1 && g.tile(x, y) !== TILE.WALL && !g.isHazard(x, y);
    const single: Site[] = [];
    for (const st of this.sites) {
      const [x0, y0] = st.center;
      let pick: [number, number] | null = usable(x0, y0) ? [x0, y0] : null;
      const onCenter = x0 === cx && y0 === cy;
      if (!pick && !onCenter) {
        const sx = Math.sign(cx - x0);
        const sy = Math.sign(cy - y0);
        const cand: [number, number, number][] = [];
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const d = Math.abs(dx) + Math.abs(dy);
            if (d === 0 || d > 3) continue;
            if ((dx !== 0 && Math.sign(dx) !== sx) || (dy !== 0 && Math.sign(dy) !== sy)) continue;
            if (usable(x0 + dx, y0 + dy)) cand.push([d * 100 + Math.abs(dy) * 10 + Math.abs(dx), x0 + dx, y0 + dy]);
          }
        cand.sort((a, b) => a[0] - b[0]);
        if (cand.length) pick = [cand[0][1], cand[0][2]];
      }
      if (!pick) continue;
      const ci = g.idx(pick[0], pick[1]);
      if (!single.some((o) => o.cells[0] === ci)) single.push({ center: pick, cells: [ci], set: new Set([ci]) });
    }
    if (!single.length) {
      const st = this.sites[0];
      const ci = st.cells[0];
      single.push({ center: [ci % g.w, Math.floor(ci / g.w)], cells: [ci], set: new Set([ci]) });
    }
    this.sites = single;
    this.clearBlocks(this.sites[0]);
    // équipes : un score par équipe (rouges, bleus) ; sinon un score par joueur
    this.scores = m.teams ? [0, 0] : m.players.map(() => 0);
    this.respawnIn = m.players.map(() => 0);
  }

  /** Index du score d'un joueur (son équipe en 2 contre 2, sinon lui-même). */
  slot(id: number): number {
    return this.m.teams ? this.m.teams[id] : id;
  }
  /** Points d'une équipe (2 contre 2). */
  teamPoints(team: number): number {
    return Math.floor((this.scores[team] ?? 0) + 1e-6);
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

  /** Dégage la case de la zone et ses 4 voisines (pour qu'on puisse l'atteindre). */
  private clearBlocks(site: Site): void {
    const g = this.m.grid;
    const around: number[] = [];
    for (const i of site.cells) {
      around.push(i);
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (x + dx > 0 && y + dy > 0 && x + dx < g.w - 1 && y + dy < g.h - 1) around.push(g.idx(x + dx, y + dy));
    }
    for (const i of around)
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
    return Math.floor(this.scores[this.slot(id)] + 1e-6);
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
    // en équipes : la zone est tenue si tous ceux qui sont dessus sont de la même équipe
    const sides = new Set(on.map((p) => this.slot(p.id)));
    this.contested = sides.size > 1;
    const prev = this.holder;
    const prevSlot = prev >= 0 ? this.slot(prev) : -1;
    // holder = un joueur de l'équipe qui marque (la couronne s'affiche sur lui)
    this.holder = sides.size === 1 ? (on.find((p) => p.id === prev)?.id ?? on[0].id) : -1;
    if (this.holder >= 0) {
      const k = this.slot(this.holder);
      const before = this.points(this.holder);
      this.scores[k] = Math.min(HILL_RULES.target, this.scores[k] + DT);
      const after = this.points(this.holder);
      if (after !== before && after % 10 === 0) m.events.push({ t: "hillPoints", player: this.holder, points: after });
    }
    if (this.holder >= 0 && this.slot(this.holder) !== prevSlot) m.events.push({ t: "hillTaken", player: this.holder });
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
    this.throwSpawnIn -= DT;
    if (this.throwSpawnIn <= 0) {
      this.throwSpawnIn = HILL_RULES.throwEvery;
      this.spawnSpecialBonus("throw");
    }
    this.bigSpawnIn -= DT;
    if (this.bigSpawnIn <= 0) {
      this.bigSpawnIn = HILL_RULES.bigEvery;
      this.spawnSpecialBonus("big");
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

  /**
   * Bonus spéciaux (« bombe à lancer », « grosse bombe ») : ils apparaissent
   * régulièrement sur une case libre tirée au sort (rng de la partie : même
   * endroit pour tous en ligne, mais jamais deux fois de suite le même),
   * loin de la zone et des joueurs. Un seul de chaque type à la fois sur la
   * carte, dans la limite du quota de la partie.
   */
  private lastSpecialCell: Record<string, number> = {};
  private spawnSpecialBonus(type: string): void {
    const m = this.m;
    if ([...m.bonuses.values()].some((b) => b.type === type)) return;
    const max = m.loot.cfg.maxPerMatch[type];
    if (max !== undefined && (m.loot.perType[type] ?? 0) >= max) return;
    const g = m.grid;
    const [cx, cy] = this.center;
    const last = this.lastSpecialCell[type] ?? -1;
    const cells = m.randomFreeCells(400).filter(([x, y]) => {
      if (g.idx(x, y) === last) return false;
      if (Math.abs(x - cx) + Math.abs(y - cy) < 2) return false;
      if (g.fire[g.idx(x, y)] > 0) return false;
      return m.players.every((p) => !p.alive || Math.abs(Math.floor(p.x) - x) + Math.abs(Math.floor(p.y) - y) >= 2);
    });
    const c = cells[0];
    if (!c) return;
    if (m.spawnBonus(type, c[0], c[1])) {
      m.loot.record(type, c[0], c[1]);
      this.lastSpecialCell[type] = g.idx(c[0], c[1]);
    }
  }

  /** Un joueur a atteint le score à atteindre. */
  get reached(): boolean {
    return this.scores.some((s) => s >= HILL_RULES.target - 1e-6);
  }

  /** Meilleur score unique (-1 = égalité). */
  leader(): number {
    const pts = (k: number) => Math.floor(this.scores[k] + 1e-6);
    const best = Math.max(...this.scores.map((_, k) => pts(k)));
    const top = this.scores.map((_, k) => k).filter((k) => pts(k) === best);
    if (top.length !== 1) return -1;
    // équipes : on renvoie le premier joueur de l'équipe gagnante
    return this.m.teams ? this.m.players.find((p) => this.slot(p.id) === top[0])?.id ?? -1 : top[0];
  }

  /** Réapparition sur une case sûre, la plus loin possible des autres joueurs. */
  private respawn(p: PlayerState): void {
    const m = this.m;
    const g = m.grid;
    // loin des ADVERSAIRES (les coéquipiers ne comptent pas)
    const others = m.players.filter((o) => m.isFoe(p, o));
    const team = m.teamOf(p.id);
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
        // équipes : on réapparaît de son côté (rouges à gauche, bleus à droite)
        const home = team < 0 ? 0 : (team === 0 ? x < (g.w - 1) / 2 : x > (g.w - 1) / 2) ? 200 : 0;
        const score = home + Math.min(near, 8) * 10 + exits + m.rng.next();
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
    p.maxBombs = m.bombRules.startBombs;
    p.throwCharges = 0;
    p.bigCharges = 0;
    p.range = m.bombRules.startRange;
    p.bombCooldown = 0;
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
