import { THROW, type BombRules } from "./bombs";
import { BONUSES } from "./bonuses";
import { DIRS, Grid } from "./grid";
import { LOOT, LootTable } from "./loot";
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
  /** butin des blocs (probabilités et quotas : core/loot.ts) */
  loot: LootTable;
  /** mode Chaos « Surchauffe » : portée en plus et mèche raccourcie pour les nouvelles bombes */
  rangeBonus = 0;
  fuseMul = 1;
  /** mode Chaos « Brouillard » : visibilité réduite (affichage) */
  fog = false;
  /** état du mode Chaos (null en Classique) */
  chaos: import("./chaos").ChaosDirector | null = null;
  /** état du mode Roi de la colline (null sinon) */
  hill: import("./hill").HillState | null = null;
  /**
   * Équipes (Domination 2 contre 2) : équipe de chaque joueur, 0 = rouges
   * (à gauche), 1 = bleus (à droite). null = chacun pour soi.
   */
  teams: number[] | null = null;
  /** cheminées volcaniques : [x, y, décalage de phase] */
  readonly vents: [number, number, number][] = [];

  /** règles des bombes de cette partie (jeu de base, ou réglages du mode) */
  readonly bombRules: BombRules;

  constructor(config: MatchConfig) {
    this.config = config;
    this.mode = getMode(config.modeId);
    this.bombRules = {
      fuse: RULES.bombFuse,
      warn: RULES.bombWarn,
      startRange: RULES.startRange,
      startBombs: RULES.startBombs,
      fireDuration: RULES.fireDuration,
      cooldown: 0,
      ...(this.mode.bombRules ?? {}),
    };
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
        boomId: slot.boomId,
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
        maxBombs: this.bombRules.startBombs,
        activeBombs: 0,
        range: this.bombRules.startRange,
        bombCooldown: 0,
        throwCharges: 0,
        shieldCharges: 0,
        shieldTime: 0,
        deathTime: -1,
        killedBy: -1,
        place: 0,
        stats: { bombsPlaced: 0, kills: 0, blocksDestroyed: 0, bonusesPicked: 0, survivalTime: 0 },
      };
    });
    const ml = this.mode.loot;
    this.loot = new LootTable(
      this.grid.w,
      this.grid.h,
      arena.spawns.slice(0, config.players.length),
      ml ? { ...LOOT, weights: { ...LOOT.weights, ...ml.weights }, maxPerMatch: { ...LOOT.maxPerMatch, ...ml.maxPerMatch } } : LOOT,
    );
    this.buildSuddenDeathOrder();
    for (let y = 0; y < this.grid.h; y++)
      for (let x = 0; x < this.grid.w; x++)
        if (this.grid.terrainAt(x, y) === TERRAIN.VENT) this.vents.push([x, y, this.vents.length * RULES.ventStagger]);
    this.mode.onStart?.(this);
  }

  /** Met les joueurs en deux équipes (1-2-1-2…) et les place sur leurs départs d'équipe. */
  setTeams(): void {
    this.teams = this.players.map((p) => p.id % 2);
    const plan = this.config.map.teamSpawns;
    if (!plan) return;
    const w = this.grid.w;
    for (const team of [0, 1]) {
      const members = this.players.filter((p) => this.teams![p.id] === team);
      const cells = plan[members.length] ?? plan[Object.keys(plan).length] ?? [];
      members.forEach((p, k) => {
        const c = cells[k];
        if (!c) return;
        // côté bleu : miroir du côté rouge
        const x = team === 0 ? c[0] : w - 1 - c[0];
        if (this.grid.blocksMove(x, c[1])) return;
        p.x = x + 0.5;
        p.y = c[1] + 0.5;
        p.faceX = team === 0 ? 1 : -1;
        p.faceY = 0;
      });
    }
  }

  /** Équipe d'un joueur (-1 = pas d'équipes). */
  teamOf(id: number): number {
    return this.teams?.[id] ?? -1;
  }
  /** Deux joueurs (différents) de la même équipe ? */
  sameTeam(a: number, b: number): boolean {
    return a !== b && this.teams !== null && this.teams[a] === this.teams[b];
  }
  /** Adversaire vivant pour `p` (ni lui-même, ni un coéquipier). */
  isFoe(p: { id: number }, o: { id: number; alive: boolean }): boolean {
    return o.alive && o.id !== p.id && !this.sameTeam(p.id, o.id);
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
    if (p.bombCooldown > 0) p.bombCooldown = Math.max(0, p.bombCooldown - DT);
    this.moveWithInput(p, cmd);
    if (cmd.bomb) this.tryPlaceBomb(p);
    if (cmd.throw) this.tryThrowBomb(p);
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

  /** Peut-on poser / faire atterrir une bombe sur cette case ? (mêmes règles pour les deux) */
  canHoldBomb(tx: number, ty: number): boolean {
    const g = this.grid;
    if (tx < 1 || ty < 1 || tx > g.w - 2 || ty > g.h - 2) return false;
    const i = g.idx(tx, ty);
    if (g.bombAt[i] >= 0 || g.tiles[i] !== TILE.FLOOR || g.isHazard(tx, ty)) return false;
    // une autre bombe lancée doit déjà atterrir ici
    for (const b of this.bombs.values()) if (b.flight && b.tx === tx && b.ty === ty) return false;
    return true;
  }

  /** Le joueur peut-il sortir une bombe maintenant ? (vivant, stock, délai entre deux poses) */
  private canUseBomb(p: PlayerState): boolean {
    return p.alive && p.activeBombs < p.maxBombs && p.bombCooldown <= 0;
  }

  /** Crée une bombe du joueur (posée, ou lancée si `flight`). */
  private makeBomb(p: PlayerState, tx: number, ty: number, flight?: BombState["flight"]): BombState {
    const bomb: BombState = {
      id: this.nextId++,
      ownerId: p.id,
      tx,
      ty,
      fuse: this.bombRules.fuse * this.fuseMul,
      fuseTotal: this.bombRules.fuse * this.fuseMul,
      range: p.range + this.rangeBonus,
      passable: [],
      flight,
    };
    this.bombs.set(bomb.id, bomb);
    p.activeBombs++;
    p.bombCooldown = this.bombRules.cooldown;
    p.stats.bombsPlaced++;
    return bomb;
  }

  /** Met une bombe sur la grille (pose ou atterrissage) ; les joueurs dessus peuvent en sortir. */
  private groundBomb(b: BombState): void {
    const g = this.grid;
    b.passable = this.players.filter((o) => o.alive && Math.floor(o.x) === b.tx && Math.floor(o.y) === b.ty).map((o) => o.id);
    g.bombAt[g.idx(b.tx, b.ty)] = b.id;
  }

  tryPlaceBomb(p: PlayerState): boolean {
    if (!this.canUseBomb(p)) return false;
    const [tx, ty] = this.playerTile(p);
    if (!this.canHoldBomb(tx, ty)) return false;
    const bomb = this.makeBomb(p, tx, ty);
    this.groundBomb(bomb);
    this.events.push({ t: "bombPlaced", x: tx, y: ty, owner: p.id });
    return true;
  }

  /**
   * Case d'atterrissage d'une bombe lancée depuis (x, y) vers (dx, dy) :
   * elle survole caisses, bombes, joueurs et bonus, mais pas les murs
   * indestructibles ni le bord de la carte. Elle atterrit sur la case la plus
   * lointaine (3 au plus) où une bombe pourrait être posée. null = impossible.
   */
  throwTarget(x: number, y: number, dx: number, dy: number): [number, number] | null {
    if (!dx && !dy) return null;
    const g = this.grid;
    let best: [number, number] | null = null;
    for (let d = 1; d <= THROW.maxDist; d++) {
      const cx = x + dx * d;
      const cy = y + dy * d;
      if (g.tile(cx, cy) === TILE.WALL) break; // ne traverse pas un mur
      if (this.canHoldBomb(cx, cy)) best = [cx, cy];
    }
    return best;
  }

  /** Lance la prochaine bombe devant soi (capacité « bombe à lancer »). */
  tryThrowBomb(p: PlayerState): boolean {
    if (p.throwCharges <= 0 || !this.canUseBomb(p)) return false;
    const [px, py] = this.playerTile(p);
    // direction : le déplacement en cours, sinon l'orientation
    const dx = Math.sign(p.faceX);
    const dy = dx ? 0 : Math.sign(p.faceY);
    const to = this.throwTarget(px, py, dx, dy);
    if (!to) return false; // rien d'atteignable : on garde la capacité
    const dist = Math.abs(to[0] - px) + Math.abs(to[1] - py);
    this.makeBomb(p, to[0], to[1], { fromX: px, fromY: py, t: 0, dur: THROW.flightBase + THROW.flightPerCell * dist });
    p.throwCharges = 0;
    this.events.push({ t: "bombThrown", x: px, y: py, toX: to[0], toY: to[1], owner: p.id });
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
      if (b.flight) {
        // bombe lancée : le compte à rebours commence à l'atterrissage
        b.flight.t += DT;
        if (b.flight.t >= b.flight.dur - 1e-9) this.land(b);
        continue;
      }
      b.fuse -= DT;
      if (b.fuse <= 0) toExplode.push(b);
    }
    // ordre déterministe : par id
    toExplode.sort((a, b) => a.id - b.id);
    for (const b of toExplode) if (this.bombs.has(b.id)) this.detonate(b);
  }

  /** Atterrissage d'une bombe lancée. */
  private land(b: BombState): void {
    b.flight = undefined;
    const g = this.grid;
    const i = g.idx(b.tx, b.ty);
    // la case d'arrivée est réservée pendant le vol (canHoldBomb) ; si elle est devenue
    // un mur entre-temps (mort subite), la bombe saute à l'impact
    if (g.tiles[i] !== TILE.FLOOR || g.bombAt[i] >= 0) {
      this.events.push({ t: "bombLanded", x: b.tx, y: b.ty, owner: b.ownerId });
      if (g.bombAt[i] < 0) this.detonate(b);
      else {
        // (impossible en pratique) case déjà occupée : la bombe est rendue au joueur
        this.bombs.delete(b.id);
        const o = this.players[b.ownerId];
        if (o) o.activeBombs = Math.max(0, o.activeBombs - 1);
      }
      return;
    }
    this.groundBomb(b);
    this.events.push({ t: "bombLanded", x: b.tx, y: b.ty, owner: b.ownerId });
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
    g.fire[i] = this.bombRules.fireDuration;
    g.fireShape[i] |= shape;
    g.fireOwner[i] = owner;
  }

  destroyBlock(x: number, y: number, by: number): void {
    const g = this.grid;
    const i = g.idx(x, y);
    g.tiles[i] = TILE.FLOOR;
    if (this.players[by]) this.players[by].stats.blocksDestroyed++;
    this.events.push({ t: "blockDestroyed", x, y });
    // butin : tiré maintenant (core/loot.ts) ; un bonus déjà placé (tests, éditeur) est respecté
    if (g.hiddenBonus[i]) this.loot.record(g.hiddenBonus[i]!, x, y);
    else g.hiddenBonus[i] = this.loot.roll(this.rng, x, y, this.bonuses.size, this.bonusBoost);
    const hidden = g.hiddenBonus[i];
    if (hidden) {
      g.hiddenBonus[i] = null;
      const bonus: BonusState = {
        id: this.nextId++,
        type: hidden,
        tx: x,
        ty: y,
        invuln: this.bombRules.fireDuration + 0.05,
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
        if (g.fire[i] > this.bombRules.fireDuration - DT * 1.5)
          this.events.push({ t: "shieldBlocked", player: p.id });
        continue;
      }
      // équipes : pas de tir ami (ses propres bombes restent dangereuses)
      if (this.sameTeam(p.id, g.fireOwner[i])) continue;
      this.kill(p, g.fireOwner[i]);
    }
  }

  kill(p: PlayerState, killer: number): void {
    if (!p.alive) return;
    p.alive = false;
    p.moving = false;
    p.deathTime = this.time;
    p.killedBy = killer;
    p.throwCharges = 0; // la capacité de lancer est perdue à l'élimination
    p.stats.survivalTime = this.time;
    if (killer >= 0 && killer !== p.id) this.players[killer].stats.kills++;
    this.events.push({ t: "playerDied", player: p.id, killer, x: p.x, y: p.y });
    this.hill?.onDeath(p);
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
    if (this.mode.suddenDeath === false) return;
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
    if (this.mode.suddenDeath === false) return out;
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
      // Roi de la colline : on réapparaît, la partie se joue aux points
      const done = this.hill ? this.hill.reached || this.timeLeft <= 0 : this.aliveCount <= 1 || this.timeLeft <= 0;
      if (done) {
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
    const hill = this.hill;
    if (hill) {
      // Roi de la colline : classement aux points (égalité = même place), connu à la fin
      const ranked = [...this.players].sort((a, b) => hill.points(b.id) - hill.points(a.id) || a.id - b.id);
      let place = 1;
      return ranked.map((p, i) => {
        if (i > 0 && hill.points(ranked[i - 1].id) !== hill.points(p.id)) place = i + 1;
        return { id: p.id, place, alive: p.alive, decided: over };
      });
    }
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
    this.winnerId = this.hill ? this.hill.leader() : alive.length === 1 ? alive[0].id : -1;
    for (const st of this.standings()) this.players[st.id].place = st.place;
    this.events.push({ t: "matchEnd", winner: this.winnerId });
  }
}
