import { BONUSES } from "./bonuses";
import { DIRS, Grid } from "./grid";
import { getMode, type ModeDef } from "./modes";
import { movePlayer } from "./movement";
import { Rng } from "./rng";
import { DT, RULES } from "./rules";
import {
  FIRE,
  NO_INPUT,
  TERRAIN,
  TILE,
  type BombState,
  type BonusState,
  type InputCmd,
  type MatchPhase,
  type PlayerSlot,
  type PlayerState,
  type SimEvent,
} from "./types";
import { generateArena } from "../maps/generator";
import type { MapDef } from "../maps/types";

export interface MatchConfig {
  seed: number;
  map: MapDef;
  modeId: string;
  players: PlayerSlot[];
}

/**
 * Simulation complète d'une partie, à pas de temps fixe.
 * Entrées : une InputCmd par joueur et par tick. Sorties : l'état + des
 * événements (sons, particules…). Totalement déterministe.
 */
export class Match {
  readonly config: MatchConfig;
  readonly mode: ModeDef;
  readonly grid: Grid;
  readonly players: PlayerState[];
  readonly bombs = new Map<number, BombState>();
  readonly bonuses = new Map<number, BonusState>();
  readonly rng: Rng;

  phase: MatchPhase = "countdown";
  countdown: number = RULES.countdown;
  /** temps de jeu écoulé (hors compte à rebours) */
  time = 0;
  tick = 0;
  winnerId = -1;
  events: SimEvent[] = [];

  suddenDeath = false;
  private sdOrder: [number, number][] = [];
  private sdIndex = 0;
  private sdTimer = 0;
  /** cases sur le point de recevoir un mur : [x, y, temps restant] */
  readonly pendingDrops: [number, number, number][] = [];
  private endTimer = 0;
  private nextId = 1;
  /** multiplicateur de vitesse global (mode Chaos) */
  speedMul = 1;
  /** mode Chaos : chaque bloc détruit lâche un bonus */
  bonusBoost = false;
  /** état du mode Chaos (null en Classique) */
  chaos: import("./chaos").ChaosDirector | null = null;
  /** cheminées volcaniques : [x, y, décalage de phase] */
  readonly vents: [number, number, number][] = [];

  constructor(config: MatchConfig) {
    this.config = config;
    this.mode = getMode(config.modeId);
    this.rng = new Rng(config.seed);
    const arena = generateArena(config.map, config.players.length, config.seed);
    this.grid = new Grid(arena);
    this.players = config.players.map((slot, i) => {
      const [sx, sy] = arena.spawns[i];
      return {
        id: i,
        name: slot.name,
        characterId: slot.characterId,
        skinId: slot.skinId,
        accessoryId: slot.accessoryId,
        trailId: slot.trailId,
        isBot: slot.isBot,
        difficulty: slot.difficulty,
        alive: true,
        x: sx + 0.5,
        y: sy + 0.5,
        faceX: 0,
        faceY: 1,
        moving: false,
        walkPhase: 0,
        slideX: 0,
        slideY: 0,
        speed: RULES.baseSpeed,
        speedLevel: 0,
        maxBombs: RULES.startBombs,
        activeBombs: 0,
        range: RULES.startRange,
        shieldCharges: 0,
        shieldTime: 0,
        deathTime: -1,
        killedBy: -1,
        place: 0,
        stats: { bombsPlaced: 0, kills: 0, blocksDestroyed: 0, bonusesPicked: 0, survivalTime: 0 },
      };
    });
    this.buildSuddenDeathOrder();
    for (let y = 0; y < this.grid.h; y++)
      for (let x = 0; x < this.grid.w; x++)
        if (this.grid.terrainAt(x, y) === TERRAIN.VENT) this.vents.push([x, y, this.vents.length * RULES.ventStagger]);
    this.mode.onStart?.(this);
  }

  get isOver(): boolean {
    return this.phase === "over";
  }

  get timeLeft(): number {
    return Math.max(0, RULES.matchDuration - this.time);
  }
  get aliveCount(): number {
    return this.players.reduce((n, p) => n + (p.alive ? 1 : 0), 0);
  }

  // ---------------------------------------------------------------- tick
  step(inputs: InputCmd[]): void {
    this.events = [];
    this.tick++;
    if (this.phase === "over") return;
    if (this.phase === "countdown") {
      this.countdown -= DT;
      if (this.countdown <= 0) this.phase = "playing";
      return;
    }
    this.time += DT;

    for (const p of this.players) {
      if (!p.alive) continue;
      const cmd = inputs[p.id] ?? NO_INPUT;
      this.updatePlayer(p, cmd);
    }
    this.updateBombPassability();
    this.updateBombs();
    this.updateFire();
    this.updateBonuses();
    this.checkPickups();
    this.checkDeaths();
    this.updateSuddenDeath();
    this.updateVents();
    this.mode.onTick?.(this, DT);
    this.updateEnd();
  }

  // ------------------------------------------------------------- joueurs
  playerTile(p: PlayerState): [number, number] {
    return [Math.floor(p.x), Math.floor(p.y)];
  }

  /** case franchissable pour ce joueur ? (les bombes bloquent, sauf celle qu'on vient de poser) */
  canEnter(p: PlayerState, tx: number, ty: number): boolean {
    const g = this.grid;
    if (g.blocksMove(tx, ty)) return false;
    const b = g.bombAt[g.idx(tx, ty)];
    if (b >= 0) {
      const bomb = this.bombs.get(b);
      if (bomb && !bomb.passable.includes(p.id)) return false;
    }
    return true;
  }

  private updatePlayer(p: PlayerState, cmd: InputCmd): void {
    if (p.shieldTime > 0) p.shieldTime = Math.max(0, p.shieldTime - DT);
    this.moveWithInput(p, cmd);
    if (cmd.bomb) this.tryPlaceBomb(p);
    if (cmd.ability) this.tryShield(p);
  }

  /** Déplacement seul (glace et vitesse comprises) : sert aussi à la prédiction en ligne. */
  moveWithInput(p: PlayerState, cmd: InputCmd): void {
    let mx = cmd.mx;
    let my = cmd.my;
    const hasInput = Math.max(Math.abs(mx), Math.abs(my)) >= 0.25;
    const onIce = this.grid.terrainAt(Math.floor(p.x), Math.floor(p.y)) === TERRAIN.ICE;
    // glace : sans commande, on continue de glisser dans la dernière direction
    if (!hasInput && onIce && (p.slideX || p.slideY)) {
      mx = p.slideX;
      my = p.slideY;
    }
    const bx = p.x;
    const by = p.y;
    const baseSpeed = p.speed;
    p.speed *= this.speedMul;
    movePlayer(p, mx, my, DT, (tx, ty) => this.canEnter(p, tx, ty));
    p.speed = baseSpeed;
    const dx = p.x - bx;
    const dy = p.y - by;
    if (!p.moving) {
      p.slideX = p.slideY = 0;
    } else if (hasInput) {
      // on mémorise l'axe principal du dernier déplacement voulu
      if (Math.abs(dx) >= Math.abs(dy)) {
        p.slideX = Math.sign(dx);
        p.slideY = 0;
      } else {
        p.slideX = 0;
        p.slideY = Math.sign(dy);
      }
    }
    if (!onIce && !hasInput) p.slideX = p.slideY = 0;
  }

  tryPlaceBomb(p: PlayerState): boolean {
    if (!p.alive || p.activeBombs >= p.maxBombs) return false;
    const [tx, ty] = this.playerTile(p);
    const g = this.grid;
    const i = g.idx(tx, ty);
    if (g.bombAt[i] >= 0 || g.tiles[i] !== TILE.FLOOR || g.isHazard(tx, ty)) return false;
    const passable = this.players
      .filter((o) => o.alive && Math.floor(o.x) === tx && Math.floor(o.y) === ty)
      .map((o) => o.id);
    const bomb: BombState = {
      id: this.nextId++,
      ownerId: p.id,
      tx,
      ty,
      fuse: RULES.bombFuse,
      fuseTotal: RULES.bombFuse,
      range: p.range,
      passable,
    };
    this.bombs.set(bomb.id, bomb);
    g.bombAt[i] = bomb.id;
    p.activeBombs++;
    p.stats.bombsPlaced++;
    this.events.push({ t: "bombPlaced", x: tx, y: ty, owner: p.id });
    return true;
  }

  tryShield(p: PlayerState): boolean {
    if (!p.alive || p.shieldCharges <= 0 || p.shieldTime > 0) return false;
    p.shieldCharges--;
    p.shieldTime = RULES.shieldDuration;
    this.events.push({ t: "shieldOn", player: p.id });
    return true;
  }

  private updateBombPassability(): void {
    for (const b of this.bombs.values()) {
      if (b.passable.length === 0) continue;
      b.passable = b.passable.filter((id) => {
        const p = this.players[id];
        if (!p.alive) return false;
        // on peut sortir de la case de la bombe qu'on vient de poser, mais dès
        // qu'on l'a quittée elle devient solide : impossible de la retraverser
        return Math.floor(p.x) === b.tx && Math.floor(p.y) === b.ty;
      });
    }
  }

  // ------------------------------------------------------ bombes & feu
  private updateBombs(): void {
    const toExplode: BombState[] = [];
    for (const b of this.bombs.values()) {
      b.fuse -= DT;
      if (b.fuse <= 0) toExplode.push(b);
    }
    // ordre déterministe : par id
    toExplode.sort((a, b) => a.id - b.id);
    for (const b of toExplode) if (this.bombs.has(b.id)) this.detonate(b);
  }

  /**
   * Cases que touchera l'explosion d'une bombe posée en (tx, ty) — mêmes
   * règles que detonate(), sans rien modifier (alerte visuelle, IA…).
   */
  blastCells(tx: number, ty: number, range: number): number[] {
    const g = this.grid;
    const out = [g.idx(tx, ty)];
    for (const [dx, dy] of DIRS) {
      for (let i = 1; i <= range; i++) {
        const x = tx + dx * i;
        const y = ty + dy * i;
        const t = g.tile(x, y);
        if (t === TILE.WALL) break;
        const idx = g.idx(x, y);
        out.push(idx);
        if (t === TILE.BLOCK || g.bombAt[idx] >= 0) break;
        const bo = g.bonusAt[idx];
        if (bo >= 0 && (this.bonuses.get(bo)?.invuln ?? 1) <= 0) break;
      }
    }
    return out;
  }

  /** Fait exploser une bombe et, en chaîne, toutes celles touchées. */
  detonate(first: BombState): void {
    const queue: BombState[] = [first];
    let chain = 0;
    while (queue.length) {
      const b = queue.shift()!;
      if (!this.bombs.has(b.id)) continue;
      this.bombs.delete(b.id);
      const g = this.grid;
      g.bombAt[g.idx(b.tx, b.ty)] = -1;
      const owner = this.players[b.ownerId];
      if (owner) owner.activeBombs = Math.max(0, owner.activeBombs - 1);

      let cells = 1;
      this.setFire(b.tx, b.ty, FIRE.CENTER, b.ownerId);
      for (const [dx, dy, bit] of DIRS) {
        // bit du bras qui « revient » vers le centre
        const backBit = bit === 1 ? 2 : bit === 2 ? 1 : bit === 4 ? 8 : 4;
        for (let i = 1; i <= b.range; i++) {
          const x = b.tx + dx * i;
          const y = b.ty + dy * i;
          const t = g.tile(x, y);
          if (t === TILE.WALL) break;
          const idx = g.idx(x, y);
          const isLast = i === b.range;
          if (t === TILE.BLOCK) {
            this.destroyBlock(x, y, b.ownerId);
            this.setFire(x, y, backBit, b.ownerId);
            cells++;
            break;
          }
          const other = g.bombAt[idx];
          if (other >= 0) {
            const ob = this.bombs.get(other);
            if (ob) {
              queue.push(ob);
              chain++;
            }
            this.setFire(x, y, backBit, b.ownerId);
            cells++;
            break;
          }
          const bonusId = g.bonusAt[idx];
          if (bonusId >= 0) {
            const bonus = this.bonuses.get(bonusId);
            if (bonus && bonus.invuln <= 0) {
              this.removeBonus(bonus);
              this.events.push({ t: "bonusBurned", x, y });
              this.setFire(x, y, backBit, b.ownerId);
              cells++;
              break;
            }
          }
          this.setFire(x, y, isLast ? backBit : backBit | bit, b.ownerId);
          cells++;
        }
      }
      this.events.push({ t: "explode", x: b.tx, y: b.ty, owner: b.ownerId, cells, chain });
    }
  }

  setFire(x: number, y: number, shape: number, owner: number): void {
    const g = this.grid;
    const i = g.idx(x, y);
    if (g.fire[i] <= 0) g.fireShape[i] = 0;
    g.fire[i] = RULES.fireDuration;
    g.fireShape[i] |= shape;
    g.fireOwner[i] = owner;
  }

  destroyBlock(x: number, y: number, by: number): void {
    const g = this.grid;
    const i = g.idx(x, y);
    g.tiles[i] = TILE.FLOOR;
    if (this.players[by]) this.players[by].stats.blocksDestroyed++;
    this.events.push({ t: "blockDestroyed", x, y });
    // mode Chaos « Surcharge » : chaque bloc détruit lâche un bonus
    if (!g.hiddenBonus[i] && this.bonusBoost) g.hiddenBonus[i] = this.rng.weighted(this.config.map.bonusWeights);
    const hidden = g.hiddenBonus[i];
    if (hidden) {
      g.hiddenBonus[i] = null;
      const bonus: BonusState = {
        id: this.nextId++,
        type: hidden,
        tx: x,
        ty: y,
        invuln: RULES.fireDuration + 0.05,
        age: 0,
      };
      this.bonuses.set(bonus.id, bonus);
      g.bonusAt[i] = bonus.id;
      this.events.push({ t: "bonusSpawn", x, y, type: hidden });
    }
  }

  private updateFire(): void {
    const g = this.grid;
    for (let i = 0; i < g.fire.length; i++) {
      if (g.fire[i] > 0) {
        g.fire[i] -= DT;
        if (g.fire[i] <= 0) {
          g.fire[i] = 0;
          g.fireShape[i] = 0;
          g.fireOwner[i] = -1;
        }
      }
    }
  }

  // ------------------------------------------------------------- bonus
  private updateBonuses(): void {
    for (const b of this.bonuses.values()) {
      b.age += DT;
      if (b.invuln > 0) b.invuln -= DT;
    }
  }

  private removeBonus(b: BonusState): void {
    this.bonuses.delete(b.id);
    this.grid.bonusAt[this.grid.idx(b.tx, b.ty)] = -1;
  }

  private checkPickups(): void {
    const g = this.grid;
    for (const p of this.players) {
      if (!p.alive) continue;
      const [tx, ty] = this.playerTile(p);
      const id = g.bonusAt[g.idx(tx, ty)];
      if (id < 0) continue;
      const bonus = this.bonuses.get(id);
      if (!bonus || bonus.invuln > 0.2) continue;
      BONUSES[bonus.type]?.apply(p);
      p.stats.bonusesPicked++;
      this.removeBonus(bonus);
      this.events.push({ t: "bonusPicked", x: tx, y: ty, type: bonus.type, player: p.id });
    }
  }

  // ------------------------------------------------------- éliminations
  /** Touché = la case qui contient le centre du personnage est en feu.
   *  Règle simple, déterministe et cohérente avec ce que l'on voit. */
  private checkDeaths(): void {
    const g = this.grid;
    for (const p of this.players) {
      if (!p.alive) continue;
      const [tx, ty] = this.playerTile(p);
      const i = g.idx(tx, ty);
      if (g.fire[i] <= 0) continue;
      if (p.shieldTime > 0) {
        if (g.fire[i] > RULES.fireDuration - DT * 1.5)
          this.events.push({ t: "shieldBlocked", player: p.id });
        continue;
      }
      this.kill(p, g.fireOwner[i]);
    }
  }

  kill(p: PlayerState, killer: number): void {
    if (!p.alive) return;
    p.alive = false;
    p.moving = false;
    p.deathTime = this.time;
    p.killedBy = killer;
    p.stats.survivalTime = this.time;
    if (killer >= 0 && killer !== p.id) this.players[killer].stats.kills++;
    this.events.push({ t: "playerDied", player: p.id, killer, x: p.x, y: p.y });
  }

  // ------------------------------------------------------- mort subite
  private buildSuddenDeathOrder(): void {
    const { w, h } = this.grid;
    let x0 = 1, y0 = 1, x1 = w - 2, y1 = h - 2;
    const out: [number, number][] = [];
    while (x0 <= x1 && y0 <= y1) {
      for (let x = x0; x <= x1; x++) out.push([x, y0]);
      for (let y = y0 + 1; y <= y1; y++) out.push([x1, y]);
      if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) out.push([x, y1]);
      if (x1 > x0) for (let y = y1 - 1; y > y0; y--) out.push([x0, y]);
      x0++; y0++; x1--; y1--;
    }
    this.sdOrder = out.filter(([x, y]) => this.grid.tile(x, y) !== TILE.WALL && !this.grid.isHazard(x, y));
  }

  private updateSuddenDeath(): void {
    if (!this.suddenDeath && this.timeLeft <= RULES.suddenDeathAt) {
      this.suddenDeath = true;
      this.events.push({ t: "suddenDeath" });
    }
    if (this.suddenDeath && this.phase === "playing") {
      this.sdTimer -= DT;
      while (this.sdTimer <= 0 && this.sdIndex < this.sdOrder.length) {
        this.sdTimer += RULES.suddenDeathInterval;
        const [x, y] = this.sdOrder[this.sdIndex++];
        this.pendingDrops.push([x, y, RULES.suddenDeathWarn]);
        this.events.push({ t: "wallWarn", x, y });
      }
    }
    for (let k = this.pendingDrops.length - 1; k >= 0; k--) {
      const d = this.pendingDrops[k];
      d[2] -= DT;
      if (d[2] <= 0) {
        this.pendingDrops.splice(k, 1);
        this.dropWall(d[0], d[1]);
      }
    }
  }

  // ------------------------------------------------- outils (mode Chaos)
  /** Case libre : sol praticable, sans bloc, bombe, bonus ni joueur. */
  isFreeCell(x: number, y: number, avoidPlayers = true): boolean {
    const g = this.grid;
    if (g.blocksMove(x, y)) return false;
    const i = g.idx(x, y);
    if (g.bombAt[i] >= 0 || g.bonusAt[i] >= 0) return false;
    if (avoidPlayers && this.players.some((p) => p.alive && Math.floor(p.x) === x && Math.floor(p.y) === y)) return false;
    return true;
  }

  /** Tire au sort jusqu'à n cases libres (déterministe : rng de la partie). */
  randomFreeCells(n: number, avoidPlayers = true): [number, number][] {
    const all: [number, number][] = [];
    for (let y = 1; y < this.grid.h - 1; y++)
      for (let x = 1; x < this.grid.w - 1; x++) if (this.isFreeCell(x, y, avoidPlayers)) all.push([x, y]);
    return this.rng.shuffle(all).slice(0, n);
  }

  /** Bombe « neutre » (sans propriétaire) posée par le jeu. */
  spawnNeutralBomb(tx: number, ty: number, fuse: number, range: number): boolean {
    const g = this.grid;
    const i = g.idx(tx, ty);
    if (g.bombAt[i] >= 0 || g.blocksMove(tx, ty)) return false;
    const bomb: BombState = { id: this.nextId++, ownerId: -1, tx, ty, fuse, fuseTotal: fuse, range, passable: [] };
    // un joueur debout dessus peut en sortir
    for (const p of this.players) if (p.alive && Math.floor(p.x) === tx && Math.floor(p.y) === ty) bomb.passable.push(p.id);
    this.bombs.set(bomb.id, bomb);
    g.bombAt[i] = bomb.id;
    this.events.push({ t: "bombPlaced", x: tx, y: ty, owner: -1 });
    return true;
  }

  /** Fait apparaître un bonus visible sur une case libre. */
  spawnBonus(type: string, tx: number, ty: number): boolean {
    const g = this.grid;
    const i = g.idx(tx, ty);
    if (g.bonusAt[i] >= 0 || g.blocksMove(tx, ty)) return false;
    const bonus: BonusState = { id: this.nextId++, type, tx, ty, invuln: 0.3, age: 0 };
    this.bonuses.set(bonus.id, bonus);
    g.bonusAt[i] = bonus.id;
    this.events.push({ t: "bonusSpawn", x: tx, y: ty, type });
    return true;
  }

  /** Met le feu à une case (événements Chaos) : brûle blocs, bonus et déclenche les bombes. */
  ignite(x: number, y: number, breakBlocks: boolean): void {
    const g = this.grid;
    const t = g.tile(x, y);
    if (t === TILE.WALL) return;
    if (t === TILE.BLOCK) {
      if (!breakBlocks) return;
      this.destroyBlock(x, y, -1);
    }
    const i = g.idx(x, y);
    const bo = g.bonusAt[i];
    if (bo >= 0) {
      const bonus = this.bonuses.get(bo);
      if (bonus && bonus.invuln <= 0) {
        this.removeBonus(bonus);
        this.events.push({ t: "bonusBurned", x, y });
      }
    }
    const b = g.bombAt[i];
    if (b >= 0) {
      const bomb = this.bombs.get(b);
      if (bomb) bomb.fuse = Math.min(bomb.fuse, DT);
    }
    this.setFire(x, y, FIRE.CENTER, -1);
  }

  // ------------------------------------------------------- cheminées
  /** Temps (s) avant la prochaine éruption d'une cheminée. */
  ventTimeLeft(v: [number, number, number]): number {
    const P = RULES.ventPeriod;
    const phase = (((this.time + v[2]) % P) + P) % P;
    return P - phase;
  }

  /** Cases touchées par l'éruption d'une cheminée (elle + ses 4 voisines libres). */
  ventCells(x: number, y: number): [number, number][] {
    const out: [number, number][] = [[x, y]];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.grid.isSolid(nx, ny)) out.push([nx, ny]);
    }
    return out;
  }

  private updateVents(): void {
    if (this.phase !== "playing" || !this.vents.length) return;
    for (const v of this.vents) {
      if (this.grid.terrainAt(v[0], v[1]) !== TERRAIN.VENT) continue; // recouverte par la mort subite
      const left = this.ventTimeLeft(v);
      if (left <= RULES.ventWarn && left + DT > RULES.ventWarn) this.events.push({ t: "ventWarn", x: v[0], y: v[1] });
      const cycle = Math.floor((this.time + v[2]) / RULES.ventPeriod);
      const prevCycle = Math.floor((this.time - DT + v[2]) / RULES.ventPeriod);
      if (cycle !== prevCycle && this.time > 1) {
        // éruption : flammes sans propriétaire, déclenche les bombes touchées
        const g = this.grid;
        for (const [cx, cy] of this.ventCells(v[0], v[1])) {
          this.setFire(cx, cy, FIRE.CENTER, -1);
          const b = g.bombAt[g.idx(cx, cy)];
          if (b >= 0) {
            const bomb = this.bombs.get(b);
            if (bomb) bomb.fuse = Math.min(bomb.fuse, DT);
          }
        }
        this.events.push({ t: "eruption", x: v[0], y: v[1] });
      }
    }
  }

  /** Murs de mort subite à venir dans `horizon` secondes : [x, y, délai]. */
  upcomingDrops(horizon: number): [number, number, number][] {
    const out: [number, number, number][] = [];
    if (!this.suddenDeath && this.timeLeft - horizon > RULES.suddenDeathAt) return out;
    const startIn = this.suddenDeath ? Math.max(0, this.sdTimer) : this.timeLeft - RULES.suddenDeathAt;
    for (let k = this.sdIndex; k < this.sdOrder.length; k++) {
      const t = startIn + (k - this.sdIndex) * RULES.suddenDeathInterval + RULES.suddenDeathWarn;
      if (t > horizon) break;
      out.push([this.sdOrder[k][0], this.sdOrder[k][1], t]);
    }
    return out;
  }

  private dropWall(x: number, y: number): void {
    const g = this.grid;
    const i = g.idx(x, y);
    g.tiles[i] = TILE.WALL;
    g.terrain[i] = TERRAIN.NONE;
    g.hiddenBonus[i] = null;
    g.fire[i] = 0;
    g.fireShape[i] = 0;
    const b = g.bombAt[i];
    if (b >= 0) {
      const bomb = this.bombs.get(b);
      if (bomb) {
        this.bombs.delete(b);
        const owner = this.players[bomb.ownerId];
        if (owner) owner.activeBombs = Math.max(0, owner.activeBombs - 1);
      }
      g.bombAt[i] = -1;
    }
    const bo = g.bonusAt[i];
    if (bo >= 0) {
      const bonus = this.bonuses.get(bo);
      if (bonus) this.removeBonus(bonus);
    }
    for (const p of this.players) {
      if (p.alive && Math.floor(p.x) === x && Math.floor(p.y) === y) this.kill(p, -1);
    }
    this.events.push({ t: "wallDrop", x, y });
  }

  // ------------------------------------------------------- fin de match
  private updateEnd(): void {
    if (this.phase === "playing") {
      if (this.aliveCount <= 1 || this.timeLeft <= 0) {
        this.phase = "ending";
        this.endTimer = RULES.endDelay;
      }
    } else if (this.phase === "ending") {
      this.endTimer -= DT;
      if (this.endTimer <= 0) this.finish();
    }
  }

  /**
   * Classement RÉEL de la partie (pas l'ordre d'affichage) : les survivants
   * d'abord, puis les morts du dernier au premier tombé. Morts au même
   * instant = ex aequo (ils partagent la meilleure des deux places).
   * `decided` : place définitive (un joueur encore en vie ne l'est qu'à la fin).
   */
  standings(): { id: number; place: number; alive: boolean; decided: boolean }[] {
    const over = this.phase === "over";
    const ranked = [...this.players].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      if (a.alive) return a.id - b.id;
      return b.deathTime - a.deathTime || a.id - b.id;
    });
    let place = 1;
    return ranked.map((p, i) => {
      const prev = ranked[i - 1];
      if (i > 0 && !(prev.alive && p.alive) && !(!prev.alive && !p.alive && prev.deathTime === p.deathTime)) place = i + 1;
      return { id: p.id, place, alive: p.alive, decided: over || !p.alive };
    });
  }

  private finish(): void {
    this.phase = "over";
    const alive = this.players.filter((p) => p.alive);
    for (const p of alive) p.stats.survivalTime = this.time;
    this.winnerId = alive.length === 1 ? alive[0].id : -1;
    for (const st of this.standings()) this.players[st.id].place = st.place;
    this.events.push({ t: "matchEnd", winner: this.winnerId });
  }
}
