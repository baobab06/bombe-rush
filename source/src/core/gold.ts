/**
 * Mode « Ruée vers l'or ».
 *
 * - Des PÉPITES apparaissent sur l'arène : quelques-unes au départ, puis une
 *   toutes les 2 s (une GROSSE pépite de temps en temps). Les caisses qui
 *   sautent en lâchent aussi. On les ramasse en marchant dessus.
 * - Touché par une explosion : on PERD LA MOITIÉ de son or, qui s'éparpille
 *   autour de soi (les autres peuvent le ramasser), puis on réapparaît après
 *   quelques secondes, protégé par un bouclier.
 * - RUÉE FINALE : pendant les 30 dernières secondes, l'or tombe deux fois plus
 *   vite et vaut double.
 * - À la fin du temps, le plus riche gagne (égalité possible). Pas de mort
 *   subite.
 *
 * Déterministe (rng de la partie) : serveur et téléphones calculent la même
 * chose ; l'état est aussi recopié dans les instantanés (multijoueur).
 */
import type { Match } from "./match";
import { clearAbilities } from "./specials";
import { DT, RULES } from "./rules";
import { TILE, type PlayerState } from "./types";

export const GOLD_RULES = {
  /** pépites posées au départ */
  start: 10,
  /** une nouvelle pépite toutes les … s */
  spawnEvery: 2,
  /** pas plus de … pépites par terre en même temps */
  maxOnBoard: 16,
  /** valeur d'une pépite, d'une grosse pépite */
  value: 1,
  bigValue: 5,
  /** chance qu'une pépite qui apparaît soit une grosse */
  bigChance: 0.12,
  /** chance qu'une caisse qui saute lâche une pépite */
  crateDrop: 0.4,
  /** part de son or perdue quand on est touché */
  lossShare: 0.5,
  /** l'or perdu s'éparpille en … tas au plus */
  maxDrops: 6,
  /** ruée finale : les … dernières secondes */
  rushAt: 30,
  rushSpawnEvery: 1,
  rushMul: 2,
  /** réapparition */
  respawnDelay: 3,
  respawnShield: 2.5,
  /** une pépite ne peut pas valoir plus que … (tas fusionnés) */
  maxStack: 99,
  /** part des caisses retirées au départ : arène plus ouverte pour courir après l'or */
  openUp: 0.3,
} as const;

export class GoldState {
  /** or de chaque joueur */
  readonly scores: number[];
  /** temps avant réapparition de chaque joueur (≤ 0 = rien en attente) */
  readonly respawnIn: number[];
  /** pépites par terre : case → valeur */
  readonly nuggets = new Map<number, number>();
  /** temps avant la prochaine pépite */
  spawnIn: number = GOLD_RULES.spawnEvery;
  /** ruée finale annoncée */
  rush = false;

  constructor(private m: Match) {
    this.scores = m.players.map(() => 0);
    this.respawnIn = m.players.map(() => 0);
    // arène plus ouverte : une partie des caisses est retirée (tirage de la partie)
    const g = m.grid;
    const blocks: number[] = [];
    for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === TILE.BLOCK) blocks.push(i);
    for (const i of m.rng.shuffle(blocks).slice(0, Math.round(blocks.length * GOLD_RULES.openUp))) {
      g.tiles[i] = TILE.FLOOR;
      g.hiddenBonus[i] = null;
    }
    for (const [x, y] of m.randomFreeCells(GOLD_RULES.start, true)) this.place(x, y, this.roll());
  }

  /** Or d'un joueur (affichage, classement). */
  points(id: number): number {
    return this.scores[id] ?? 0;
  }

  /** valeur d'une nouvelle pépite */
  private roll(): number {
    const base = this.m.rng.chance(GOLD_RULES.bigChance) ? GOLD_RULES.bigValue : GOLD_RULES.value;
    return this.rush ? base * GOLD_RULES.rushMul : base;
  }

  private place(x: number, y: number, value: number): void {
    const i = this.m.grid.idx(x, y);
    this.nuggets.set(i, Math.min(GOLD_RULES.maxStack, (this.nuggets.get(i) ?? 0) + value));
  }

  /** Une caisse a sauté (et n'a pas lâché de bonus) : peut-être une pépite. */
  onBlockBroken(x: number, y: number, hadBonus: boolean): void {
    if (this.m.phase !== "playing" || hadBonus) return;
    if (!this.m.rng.chance(GOLD_RULES.crateDrop)) return;
    const v = this.roll();
    this.place(x, y, v);
    this.m.events.push({ t: "goldSpawn", x, y, value: v });
  }

  /** Touché : la moitié de son or s'éparpille autour de lui. */
  onDeath(p: PlayerState): void {
    const m = this.m;
    this.respawnIn[p.id] = GOLD_RULES.respawnDelay;
    const have = this.scores[p.id];
    const lost = Math.ceil(have * GOLD_RULES.lossShare);
    if (lost <= 0) return;
    this.scores[p.id] = have - lost;
    // cases voisines praticables (la sienne d'abord), au plus 2 cases autour
    const g = m.grid;
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const cells: [number, number][] = [];
    for (let r = 0; r <= 2 && cells.length < GOLD_RULES.maxDrops; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || cells.length >= GOLD_RULES.maxDrops) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (g.inside(x, y) && !g.blocksMove(x, y)) cells.push([x, y]);
        }
    if (!cells.length) cells.push([cx, cy]);
    const k = Math.min(cells.length, lost);
    for (let j = 0; j < k; j++) {
      // partage équitable : les premiers tas reçoivent le reste
      const v = Math.floor(lost / k) + (j < lost % k ? 1 : 0);
      this.place(cells[j][0], cells[j][1], v);
    }
    m.events.push({ t: "goldDrop", player: p.id, amount: lost, x: p.x, y: p.y });
  }

  update(): void {
    const m = this.m;
    if (m.phase !== "playing") return;
    // ruée finale
    if (!this.rush && m.timeLeft <= GOLD_RULES.rushAt) {
      this.rush = true;
      this.spawnIn = Math.min(this.spawnIn, GOLD_RULES.rushSpawnEvery);
      m.events.push({ t: "goldRush" });
    }
    // ramassage
    const g = m.grid;
    for (const p of m.players) {
      if (!p.alive) continue;
      const i = g.idx(Math.floor(p.x), Math.floor(p.y));
      const v = this.nuggets.get(i);
      if (!v) continue;
      this.nuggets.delete(i);
      this.scores[p.id] += v;
      m.events.push({ t: "goldPick", player: p.id, value: v, x: i % g.w, y: Math.floor(i / g.w) });
    }
    // apparitions
    this.spawnIn -= DT;
    if (this.spawnIn <= 0) {
      this.spawnIn = this.rush ? GOLD_RULES.rushSpawnEvery : GOLD_RULES.spawnEvery;
      if (this.nuggets.size < GOLD_RULES.maxOnBoard) {
        const free = m.randomFreeCells(8, true).filter(([x, y]) => !this.nuggets.has(g.idx(x, y)) && g.fire[g.idx(x, y)] <= 0);
        const c = free[0];
        if (c) {
          const v = this.roll();
          this.place(c[0], c[1], v);
          m.events.push({ t: "goldSpawn", x: c[0], y: c[1], value: v });
        }
      }
    }
    // réapparitions (ordre tournant : personne ne choisit toujours en premier)
    const n = m.players.length;
    for (let k = 0; k < n; k++) {
      const p = m.players[(k + m.tick) % n];
      if (p.alive || this.respawnIn[p.id] <= 0) continue;
      this.respawnIn[p.id] -= DT;
      if (this.respawnIn[p.id] <= 0) this.respawn(p);
    }
  }

  /** Le plus riche (-1 = égalité). */
  leader(): number {
    const best = Math.max(...this.scores);
    const top = this.scores.map((s, k) => (s === best ? k : -1)).filter((k) => k >= 0);
    return top.length === 1 ? top[0] : -1;
  }

  /** Réapparition sur une case sûre, la plus loin possible des autres. */
  private respawn(p: PlayerState): void {
    const m = this.m;
    const g = m.grid;
    const others = m.players.filter((o) => o.id !== p.id && o.alive);
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    for (let y = 1; y < g.h - 1; y++)
      for (let x = 1; x < g.w - 1; x++) {
        if (!m.isFreeCell(x, y, true) || g.fire[g.idx(x, y)] > 0 || m.gasAt(g.idx(x, y))) continue;
        if (this.inBlast(x, y)) continue;
        let exits = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!g.blocksMove(x + dx, y + dy)) exits++;
        if (!exits) continue;
        const near = others.length ? Math.min(...others.map((o) => Math.abs(o.x - 0.5 - x) + Math.abs(o.y - 0.5 - y))) : 10;
        const score = Math.min(near, 8) * 10 + exits + m.rng.next();
        if (score > bestScore) {
          bestScore = score;
          best = [x, y];
        }
      }
    if (!best) {
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
    clearAbilities(p);
    p.range = m.bombRules.startRange;
    p.bombCooldown = 0;
    p.activeBombs = Math.min(p.activeBombs, p.maxBombs);
    p.shieldTime = GOLD_RULES.respawnShield;
    p.killedBy = -1;
    this.respawnIn[p.id] = 0;
    m.events.push({ t: "respawn", player: p.id, x: best[0], y: best[1] });
  }

  private inBlast(x: number, y: number): boolean {
    for (const b of this.m.bombs.values()) {
      if (b.tx === x && Math.abs(b.ty - y) <= b.range) return true;
      if (b.ty === y && Math.abs(b.tx - x) <= b.range) return true;
    }
    return false;
  }
}
