import type { Match } from "../core/match";
import { DIRS } from "../core/grid";
import { RULES } from "../core/rules";
import { TILE, type Difficulty, type InputCmd, type PlayerState } from "../core/types";
import { Rng } from "../core/rng";
import { blastCells, computeDanger, type DangerMap } from "./danger";

interface Profile {
  think: number; // intervalle de réflexion (s)
  margin: number; // marge de sécurité temporelle (s)
  bonusRadius: number;
  aggression: number; // 0..1
  mistake: number; // probabilité d'une décision bâclée
  reflex: boolean; // revérifie le danger à chaque tick
  trapRadius: number; // distance à laquelle il tente de piéger
  shieldSense: number; // seuil de danger pour activer le bouclier
  escapeRoom: number; // nb de cases sûres exigées avant de poser (évite les culs-de-sac)
}

const PROFILES: Record<Difficulty, Profile> = {
  easy: { think: 0.5, margin: 0.12, bonusRadius: 4, aggression: 0.25, mistake: 0.08, reflex: false, trapRadius: 0, shieldSense: 0.12, escapeRoom: 1 },
  normal: { think: 0.22, margin: 0.22, bonusRadius: 7, aggression: 0.6, mistake: 0.012, reflex: true, trapRadius: 1, shieldSense: 0.25, escapeRoom: 2 },
  hard: { think: 0.1, margin: 0.25, bonusRadius: 11, aggression: 0.9, mistake: 0, reflex: true, trapRadius: 2, shieldSense: 0.35, escapeRoom: 3 },
  expert: { think: 0.06, margin: 0.28, bonusRadius: 14, aggression: 1, mistake: 0, reflex: true, trapRadius: 3, shieldSense: 0.45, escapeRoom: 3 },
};

interface Node {
  idx: number;
  dist: number;
  prev: number;
}

/**
 * Bot : il produit des InputCmd, exactement comme un joueur humain.
 * Il ne triche pas (mêmes règles, même vitesse, même déplacement).
 */
export class BotBrain {
  readonly playerId: number;
  private readonly prof: Profile;
  private readonly rng: Rng;
  private thinkTimer: number;
  private path: number[] = [];
  private wantBomb = false;
  private wantShield = false;
  /** dernière décision (débogage) */
  lastDecision = "";

  constructor(playerId: number, difficulty: Difficulty, seed: number) {
    this.playerId = playerId;
    this.prof = PROFILES[difficulty];
    this.rng = new Rng(seed * 7919 + playerId * 104729);
    this.thinkTimer = this.rng.next() * this.prof.think;
  }

  update(m: Match, dt: number): InputCmd {
    const p = m.players[this.playerId];
    const cmd: InputCmd = { mx: 0, my: 0, bomb: false, ability: false };
    if (!p.alive || m.phase !== "playing" && m.phase !== "ending") return cmd;

    this.thinkTimer -= dt;
    let mustThink = this.thinkTimer <= 0;
    if (!mustThink && this.prof.reflex && this.path.length) {
      // réflexe : la prochaine case est-elle devenue mortelle ?
      const next = this.path[0];
      if (m.grid.fire[next] > 0 || m.grid.blocksMove(next % m.grid.w, Math.floor(next / m.grid.w))) mustThink = true;
    }
    if (mustThink) {
      this.thinkTimer = this.prof.think * (0.8 + this.rng.next() * 0.4);
      this.think(m, p);
    }

    if (this.wantShield) {
      cmd.ability = true;
      this.wantShield = false;
    }
    if (this.wantBomb) {
      // on pose sans bouger ce tick : la bombe tombe sur la case prévue
      cmd.bomb = true;
      this.wantBomb = false;
      return cmd;
    }
    this.followPath(m, p, cmd);
    return cmd;
  }

  // ----------------------------------------------------------- exécution
  private followPath(m: Match, p: PlayerState, cmd: InputCmd): void {
    const g = m.grid;
    while (this.path.length) {
      const next = this.path[0];
      const nx = (next % g.w) + 0.5;
      const ny = Math.floor(next / g.w) + 0.5;
      const dx = nx - p.x;
      const dy = ny - p.y;
      if (Math.abs(dx) < 0.06 && Math.abs(dy) < 0.06) {
        this.path.shift();
        continue;
      }
      if (Math.abs(dx) >= Math.abs(dy)) cmd.mx = Math.sign(dx);
      else cmd.my = Math.sign(dy);
      return;
    }
    // pas de chemin : se recentrer sur la case
    const cx = Math.floor(p.x) + 0.5;
    const cy = Math.floor(p.y) + 0.5;
    if (Math.abs(cx - p.x) > 0.06) cmd.mx = Math.sign(cx - p.x);
    else if (Math.abs(cy - p.y) > 0.06) cmd.my = Math.sign(cy - p.y);
  }

  // ------------------------------------------------------------ décision
  private think(m: Match, p: PlayerState): void {
    const g = m.grid;
    const myIdx = g.idx(Math.floor(p.x), Math.floor(p.y));
    const danger = computeDanger(m);
    const sloppy = this.rng.chance(this.prof.mistake);

    // 1. Danger sur ma case : fuir
    if (danger.start[myIdx] !== Infinity) {
      // on s'engage sur une fuite tant qu'elle reste valable (pas d'hésitation)
      if (this.path.length && this.pathSafe(m, p, danger, this.path)) {
        this.lastDecision = "flee";
        return;
      }
      const escape = this.findSafe(m, p, danger, this.prof.margin);
      if (escape) {
        this.path = escape;
        this.lastDecision = "flee";
        return;
      }
      if (p.shieldCharges > 0 && p.shieldTime <= 0 && danger.start[myIdx] < this.prof.shieldSense + 0.2) {
        this.wantShield = true;
      }
      // pas d'issue parfaite : on va vers la case qui explose le plus tard
      this.path = this.leastBadPath(m, p, danger);
      this.lastDecision = "trapped";
      return;
    }

    // 2. Ma case est sûre. Chemin en cours encore valable ?
    if (this.path.length && !this.pathSafe(m, p, danger, this.path) && !sloppy) this.path = [];

    // 3. Bonus proche
    const bonusPath = this.findTarget(m, p, danger, this.prof.bonusRadius, (i) => g.bonusAt[i] >= 0);
    if (bonusPath && bonusPath.length > 0) {
      this.path = bonusPath;
      this.lastDecision = "bonus";
      return;
    }

    // 4. Poser une bombe utile ?
    if (p.activeBombs < p.maxBombs && g.bombAt[myIdx] < 0) {
      const value = this.bombValue(m, p);
      const roll = this.rng.next();
      if (value.enemy && roll < 0.4 + this.prof.aggression * 0.6) {
        if (this.placeIfEscapable(m, p, sloppy)) return;
      } else if (value.blocks > 0 && roll < 0.55 + this.prof.aggression * 0.4) {
        if (this.placeIfEscapable(m, p, sloppy)) return;
      } else if (this.prof.trapRadius > 0 && this.enemyNear(m, p, this.prof.trapRadius) && roll < this.prof.aggression * 0.5) {
        if (this.placeIfEscapable(m, p, false)) return;
      }
    }

    if (this.path.length) return;

    // 5. Les bots faciles flânent parfois
    if (this.prof.aggression < 0.5 && this.rng.chance(0.25)) {
      const wander = this.findTarget(m, p, danger, 3, () => this.rng.chance(0.3));
      if (wander) this.path = wander;
      return;
    }

    // 6. Aller vers une case utile : à côté d'un bloc, ou en ligne avec un ennemi
    const huntEnemies = this.prof.aggression > 0.5 || this.blocksLeft(m) < 6;
    const goal = this.findTarget(m, p, danger, 30, (i) => {
      if (g.bombAt[i] >= 0) return false;
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      if (huntEnemies && this.enemyInLine(m, p, x, y, Math.min(p.range, 3))) return true;
      for (const [dx, dy] of DIRS) if (g.tile(x + dx, y + dy) === TILE.BLOCK) return true;
      return false;
    });
    if (goal && goal.length) {
      this.path = goal;
      return;
    }
    // 7. Rien à faire : se rapprocher de l'ennemi le plus proche
    const chase = this.pathToNearestEnemy(m, p, danger);
    if (chase) this.path = chase;
  }

  private blocksLeft(m: Match): number {
    let n = 0;
    for (const t of m.grid.tiles) if (t === TILE.BLOCK) n++;
    return n;
  }

  private bombValue(m: Match, p: PlayerState): { blocks: number; enemy: boolean } {
    const g = m.grid;
    const cells: number[] = [];
    const bombCells = new Set<number>();
    for (const b of m.bombs.values()) bombCells.add(g.idx(b.tx, b.ty));
    blastCells(m, Math.floor(p.x), Math.floor(p.y), p.range, bombCells, cells);
    let blocks = 0;
    let enemy = false;
    for (const c of cells) {
      if (g.tiles[c] === TILE.BLOCK) blocks++;
      for (const o of m.players) {
        if (o.alive && o.id !== p.id && g.idx(Math.floor(o.x), Math.floor(o.y)) === c && o.shieldTime <= 0) enemy = true;
      }
    }
    return { blocks, enemy };
  }

  private enemyNear(m: Match, p: PlayerState, r: number): boolean {
    return m.players.some(
      (o) => o.alive && o.id !== p.id && Math.abs(o.x - p.x) + Math.abs(o.y - p.y) <= r + 0.5,
    );
  }

  private enemyInLine(m: Match, p: PlayerState, x: number, y: number, r: number): boolean {
    const g = m.grid;
    for (const o of m.players) {
      if (!o.alive || o.id === p.id) continue;
      const ox = Math.floor(o.x);
      const oy = Math.floor(o.y);
      if (ox !== x && oy !== y) continue;
      const d = Math.abs(ox - x) + Math.abs(oy - y);
      if (d === 0 || d > r) continue;
      const sx = Math.sign(ox - x);
      const sy = Math.sign(oy - y);
      let clear = true;
      for (let k = 1; k < d; k++) if (g.isSolid(x + sx * k, y + sy * k)) clear = false;
      if (clear) return true;
    }
    return false;
  }

  private placeIfEscapable(m: Match, p: PlayerState, sloppy: boolean): boolean {
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (!sloppy) {
      const danger = computeDanger(m, { tx, ty, fuse: RULES.bombFuse, range: p.range });
      const escape = this.findSafe(m, p, danger, this.prof.margin + 0.15, true);
      if (!escape) return false;
      let room = 0;
      this.bfs(m, p, danger, this.prof.margin + 0.15, 8, (idx) => {
        if (danger.start[idx] === Infinity) room++;
        return false;
      });
      // exiger de la marge seulement quand un adversaire peut venir nous coincer
      // (en début de partie, la cachette du spawn ne fait qu'une case)
      if (room < this.prof.escapeRoom && this.enemyNear(m, p, 4)) return false;
      this.path = escape;
    } else {
      // décision bâclée (bots faciles) : fuite au hasard
      this.path = [];
    }
    this.wantBomb = true;
    this.lastDecision = sloppy ? "bomb-sloppy" : "bomb";
    return true;
  }

  // ------------------------------------------------------------- chemins
  private passable(m: Match, p: PlayerState, idx: number, startIdx: number, ignoreOwnBomb: boolean): boolean {
    const g = m.grid;
    if (g.tiles[idx] !== TILE.FLOOR || g.isHazard(idx % g.w, Math.floor(idx / g.w))) return false;
    if (g.bombAt[idx] >= 0 && idx !== startIdx) return false;
    if (ignoreOwnBomb && idx === startIdx) return true;
    return true;
  }

  /** Temps (s) pour atteindre une case à `steps` pas d'ici. */
  private eta(p: PlayerState, steps: number): number {
    return (steps + 0.3) / p.speed;
  }

  private cellOkAt(danger: DangerMap, idx: number, tArrive: number, tLeave: number, margin: number): boolean {
    const s = danger.start[idx];
    if (s === Infinity) return true;
    return tLeave < s - margin || tArrive > danger.end[idx] + margin;
  }

  private bfs(
    m: Match,
    p: PlayerState,
    danger: DangerMap,
    margin: number,
    maxDist: number,
    goal: (idx: number, node: Node) => boolean,
  ): number[] | null {
    const g = m.grid;
    const start = g.idx(Math.floor(p.x), Math.floor(p.y));
    const seen = new Map<number, Node>();
    const q: Node[] = [{ idx: start, dist: 0, prev: -1 }];
    seen.set(start, q[0]);
    // ordre de voisins mélangé : comportements moins robotiques
    const dirs = this.rng.shuffle([...DIRS]);
    let head = 0;
    while (head < q.length) {
      const n = q[head++];
      if (n.dist > 0 && goal(n.idx, n)) return this.unwind(seen, n);
      if (n.dist === 0 && goal(n.idx, n)) return [];
      if (n.dist >= maxDist) continue;
      const x = n.idx % g.w;
      const y = Math.floor(n.idx / g.w);
      for (const [dx, dy] of dirs) {
        const ni = g.idx(x + dx, y + dy);
        if (seen.has(ni)) continue;
        if (!this.passable(m, p, ni, start, true)) continue;
        const tA = this.eta(p, n.dist + 0.5);
        const tL = this.eta(p, n.dist + 1.5);
        if (!this.cellOkAt(danger, ni, tA, tL, margin)) continue;
        const node = { idx: ni, dist: n.dist + 1, prev: n.idx };
        seen.set(ni, node);
        q.push(node);
      }
    }
    return null;
  }

  private unwind(seen: Map<number, Node>, n: Node): number[] {
    const out: number[] = [];
    let cur: Node | undefined = n;
    while (cur && cur.prev !== -1) {
      out.push(cur.idx);
      cur = seen.get(cur.prev);
    }
    return out.reverse();
  }

  private findSafe(m: Match, p: PlayerState, danger: DangerMap, margin: number, _afterBomb = false): number[] | null {
    return this.bfs(m, p, danger, margin, 12, (idx) => danger.start[idx] === Infinity);
  }

  private findTarget(
    m: Match,
    p: PlayerState,
    danger: DangerMap,
    radius: number,
    pred: (idx: number) => boolean,
  ): number[] | null {
    // on ne vise que des cases sûres (sinon on y mourrait en attendant)
    return this.bfs(m, p, danger, this.prof.margin, radius, (idx) => danger.start[idx] === Infinity && pred(idx));
  }

  private pathSafe(m: Match, p: PlayerState, danger: DangerMap, path: number[]): boolean {
    for (let k = 0; k < path.length; k++) {
      const idx = path[k];
      if (m.grid.blocksMove(idx % m.grid.w, Math.floor(idx / m.grid.w)) || m.grid.bombAt[idx] >= 0) return false;
      if (!this.cellOkAt(danger, idx, this.eta(p, k + 0.5), this.eta(p, k + 1.5), this.prof.margin)) return false;
    }
    const last = path[path.length - 1];
    return danger.start[last] === Infinity;
  }

  private leastBadPath(m: Match, p: PlayerState, danger: DangerMap): number[] {
    let best: number[] = [];
    let bestScore = danger.start[m.grid.idx(Math.floor(p.x), Math.floor(p.y))];
    this.bfs(m, p, danger, -1, 8, (idx, node) => {
      const s = danger.start[idx] - this.eta(p, node.dist);
      if (s > bestScore) {
        bestScore = s;
        best = [idx];
      }
      return false;
    });
    if (best.length) {
      const target = best[0];
      const path = this.bfs(m, p, danger, -1, 8, (idx) => idx === target);
      if (path) return path;
    }
    return [];
  }

  private pathToNearestEnemy(m: Match, p: PlayerState, danger: DangerMap): number[] | null {
    const g = m.grid;
    const enemyCells = new Set(
      m.players.filter((o) => o.alive && o.id !== p.id).map((o) => g.idx(Math.floor(o.x), Math.floor(o.y))),
    );
    const path = this.bfs(m, p, danger, this.prof.margin, 40, (idx) => enemyCells.has(idx));
    if (!path || path.length <= 1) return null;
    // s'arrêter un peu avant, et sur une case sûre
    const trimmed = path.slice(0, Math.max(1, path.length - 2));
    return danger.start[trimmed[trimmed.length - 1]] === Infinity ? trimmed : null;
  }
}
