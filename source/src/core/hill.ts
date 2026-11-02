/**
 * Mode « Roi de la colline ».
 *
 * - La zone (une case) commence au centre puis SE DÉPLACE toutes les 10 à 15 s
 *   (HILL_RULES.moveMin/moveMax, tirage au rng de la partie) vers une case
 *   tirée au sort parmi les cases autorisées : jamais un mur, une caisse, un
 *   obstacle, le bord ou une case dangereuse ; loin des départs des équipes ;
 *   jamais une des dernières positions ; à distance de marche équitable pour
 *   les deux équipes. Le nouvel emplacement est annoncé moveWarn s avant.
 *   Au déplacement : la progression en cours (fraction de point) repart de
 *   zéro, les points gagnés restent ; l'ancienne zone ne compte plus, la
 *   nouvelle se prend avec les règles habituelles (une seule équipe dessus =
 *   elle marque, deux équipes = disputée). Plus aucun déplacement une fois la
 *   partie terminée.
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
import { clearAbilities } from "./specials";
import { DT, RULES } from "./rules";
import { TERRAIN, TILE, type PlayerState } from "./types";

export const HILL_RULES = {
  /** points pour gagner (1 point = 1 seconde seul sur la colline) */
  target: 25,
  /** délai avant de réapparaître (s) */
  respawnDelay: 3,
  /** bouclier à la réapparition (s) */
  respawnShield: 2.5,
  /** distance minimale (cases) entre la réapparition et la colline */
  respawnHillGap: 3,
  /** la zone change de place toutes les moveMin à moveMax secondes (tirage à chaque fois) */
  moveMin: 10,
  moveMax: 15,
  /** annonce (contour + compte à rebours) avant le déplacement */
  moveWarn: 3,
  /** distance minimale (cases) entre la zone et les départs des équipes */
  spawnGap: 3,
  /** distance minimale (cases) entre l'ancienne et la nouvelle position */
  minJump: 3,
  /** positions récentes à ne pas reprendre */
  memory: 4,
  /** équité : écart maximal de distance de marche entre les deux équipes (départs), et avantage cumulé maximal */
  fairGap: 4,
  /** équité au moment du tirage (positions actuelles des joueurs) */
  liveFairGap: 3,
} as const;

interface Site {
  center: [number, number];
  cells: number[];
  set: Set<number>;
  /** Avance d'une équipe (marche des rouges − marche des bleus depuis leurs départs). */
  lean?: number;
}

export class HillState {
  /** emplacements possibles (0 = centre) */
  sites: Site[];
  /** emplacement actuel */
  site = 0;
  /** prochain emplacement annoncé (-1 = pas encore) */
  next = -1;
  /** secondes avant le prochain déplacement */
  moveIn: number = HILL_RULES.moveMin;
  /** dernières positions (index d'emplacement), pour ne pas revenir aux mêmes */
  recent: number[] = [];
  /** Avantage cumulé des emplacements tirés (0 = parfaitement équilibré). */
  lean = 0;
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
    // toutes les autres cases autorisées : la zone pourra s'y déplacer
    this.sites.push(...this.buildPool());
    this.moveIn = this.rollInterval();
    // équipes : un score par équipe (rouges, bleus) ; sinon un score par joueur
    this.scores = m.teams ? [0, 0] : m.players.map(() => 0);
    this.respawnIn = m.players.map(() => 0);
  }

  /** Délai avant le prochain déplacement : entre moveMin et moveMax (rng de la partie : identique pour tous). */
  private rollInterval(): number {
    return HILL_RULES.moveMin + (HILL_RULES.moveMax - HILL_RULES.moveMin) * this.m.rng.next();
  }

  /**
   * Emplacements possibles (calculés une fois, à partir du plan : identiques
   * sur le serveur et chez tous les joueurs) : cases intérieures qui ne sont ni
   * un mur / obstacle, ni de la lave, de l'eau ou une cheminée ; loin des
   * départs des équipes ; à distance de marche équitable des deux départs.
   */
  private buildPool(): Site[] {
    const m = this.m;
    const g = m.grid;
    const plan = m.config.map.layout;
    const starts = m.players.map((p) => [Math.floor(p.x), Math.floor(p.y), m.teamOf(p.id)] as const);
    const fromTeam = (team: number) => this.walkCost(starts.filter((s) => m.teams === null || s[2] === team).map((s) => g.idx(s[0], s[1])));
    const dA = m.teams ? fromTeam(0) : null;
    const dB = m.teams ? fromTeam(1) : null;
    const first = this.sites[0]?.cells[0];
    const out: Site[] = [];
    for (let y = 1; y < g.h - 1; y++)
      for (let x = 1; x < g.w - 1; x++) {
        const i = g.idx(x, y);
        if (i === first) continue;
        if (plan[y]?.[x] === "#" || g.tile(x, y) === TILE.WALL || g.isHazard(x, y) || g.terrainAt(x, y) === TERRAIN.VENT) continue;
        if (starts.some((s) => Math.abs(s[0] - x) + Math.abs(s[1] - y) < HILL_RULES.spawnGap)) continue;
        if (dA && dB) {
          if (!isFinite(dA[i]) || !isFinite(dB[i]) || Math.abs(dA[i] - dB[i]) > HILL_RULES.fairGap) continue;
        }
        out.push({ center: [x, y], cells: [i], set: new Set([i]), lean: dA && dB ? dA[i] - dB[i] : 0 });
      }
    return out;
  }

  /** Coût de marche depuis des cases de départ : sol 1, caisse 3 (à casser), murs infranchissables. */
  private walkCost(from: number[]): Float32Array {
    const g = this.m.grid;
    const dist = new Float32Array(g.w * g.h).fill(Infinity);
    const buckets: number[][] = [[]];
    for (const i of from) {
      dist[i] = 0;
      buckets[0].push(i);
    }
    for (let d = 0; d < buckets.length; d++) {
      for (const c of buckets[d] ?? []) {
        if (dist[c] !== d) continue;
        const x = c % g.w;
        const y = (c - x) / g.w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const t = g.tile(x + dx, y + dy);
          if (t === TILE.WALL || g.isHazard(x + dx, y + dy)) continue;
          const n = g.idx(x + dx, y + dy);
          const nd = d + (t === TILE.BLOCK ? 3 : 1);
          if (nd >= dist[n]) continue;
          dist[n] = nd;
          (buckets[nd] ??= []).push(n);
        }
      }
    }
    return dist;
  }

  /**
   * Choix du prochain emplacement (tirage déterministe) : case libre maintenant
   * (sol, sans bombe, feu, gaz, bonus ni joueur), pas une des dernières
   * positions, assez loin de la zone actuelle, et la plus équitable pour les
   * deux équipes vu leurs positions actuelles. -1 = aucune case possible.
   */
  pickNext(): number {
    const m = this.m;
    const g = m.grid;
    const [cx, cy] = this.center;
    const occupied = new Set(m.players.filter((p) => p.alive).map((p) => g.idx(Math.floor(p.x), Math.floor(p.y))));
    const free = (k: number, strict: boolean) => {
      if (k === this.site) return false;
      const i = this.sites[k].cells[0];
      const [x, y] = this.sites[k].center;
      if (g.tiles[i] !== TILE.FLOOR || g.bombAt[i] >= 0 || g.fire[i] > 0 || g.bonusAt[i] >= 0 || m.gasAt(i) || occupied.has(i)) return false;
      if (strict && (this.recent.includes(k) || Math.abs(x - cx) + Math.abs(y - cy) < HILL_RULES.minJump)) return false;
      return true;
    };
    let cands = this.sites.map((_, k) => k).filter((k) => free(k, true));
    if (!cands.length) cands = this.sites.map((_, k) => k).filter((k) => free(k, false));
    if (!cands.length) return -1;
    if (m.teams) {
      // équité dans la durée : une zone plus proche des rouges est suivie d'une zone neutre ou plus proche des bleus
      const balanced = cands.filter((k) => Math.abs(this.lean + (this.sites[k].lean ?? 0)) <= HILL_RULES.fairGap);
      if (balanced.length) cands = balanced;
      // équité en direct : distance de marche du joueur le plus proche de chaque équipe
      const alive = (team: number) => m.players.filter((p) => p.alive && m.teamOf(p.id) === team).map((p) => g.idx(Math.floor(p.x), Math.floor(p.y)));
      const a = alive(0);
      const b = alive(1);
      if (a.length && b.length) {
        const dA = this.walkCost(a);
        const dB = this.walkCost(b);
        const gap = (k: number) => Math.abs(dA[this.sites[k].cells[0]] - dB[this.sites[k].cells[0]]);
        const best = Math.min(...cands.map(gap));
        const fair = cands.filter((k) => gap(k) <= Math.max(best, HILL_RULES.liveFairGap));
        if (fair.length) cands = fair;
      }
    }
    return cands[Math.floor(m.rng.next() * cands.length)];
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
        const k = this.pickNext();
        if (k < 0) this.moveIn = HILL_RULES.moveWarn + 1; // aucune case libre : on réessaie dans 1 s
        else {
          this.next = k;
          m.events.push({ t: "hillWarn", x: this.sites[k].center[0], y: this.sites[k].center[1] });
        }
      }
      if (this.moveIn <= 0 && this.next >= 0) {
        const from = this.center;
        this.recent.push(this.site);
        this.lean += this.sites[this.next].lean ?? 0;
        if (this.recent.length > HILL_RULES.memory) this.recent.shift();
        this.site = this.next;
        this.next = -1;
        this.moveIn = this.rollInterval();
        // la capture en cours repart de zéro (les points entiers déjà gagnés restent)
        for (let k = 0; k < this.scores.length; k++) this.scores[k] = Math.floor(this.scores[k] + 1e-6);
        this.holder = -1;
        this.contested = false;
        m.events.push({ t: "hillMoved", x: this.center[0], y: this.center[1], fromX: from[0], fromY: from[1] });
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
        if (!m.isFreeCell(x, y, true) || g.fire[g.idx(x, y)] > 0 || m.gasAt(g.idx(x, y))) continue;
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
    clearAbilities(p); // capacités et effets subis : remis à zéro (système commun)
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
