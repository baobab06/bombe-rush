import type { Match } from "../core/match";
import { DIRS } from "../core/grid";
import { RULES } from "../core/rules";
import { TILE, type Difficulty, type InputCmd, type PlayerState } from "../core/types";
import { Rng } from "../core/rng";
import { HILL_RULES } from "../core/hill";
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
  /** Domination : probabilité, à chaque réflexion, d'oublier un moment l'objectif (bots faciles) */
  distract: number;
  /** Domination : avance (s) prise pour rejoindre la prochaine zone annoncée */
  lead: number;
}

const PROFILES: Record<Difficulty, Profile> = {
  easy: { think: 0.5, margin: 0.12, bonusRadius: 4, aggression: 0.25, mistake: 0.08, reflex: false, trapRadius: 0, shieldSense: 0.12, escapeRoom: 1, distract: 0.15, lead: 0 },
  normal: { think: 0.22, margin: 0.22, bonusRadius: 7, aggression: 0.6, mistake: 0.012, reflex: true, trapRadius: 1, shieldSense: 0.25, escapeRoom: 2, distract: 0.008, lead: 0.6 },
  hard: { think: 0.1, margin: 0.25, bonusRadius: 11, aggression: 0.9, mistake: 0, reflex: true, trapRadius: 2, shieldSense: 0.35, escapeRoom: 3, distract: 0, lead: 1 },
  expert: { think: 0.06, margin: 0.28, bonusRadius: 14, aggression: 1, mistake: 0, reflex: true, trapRadius: 3, shieldSense: 0.45, escapeRoom: 3, distract: 0, lead: 1.3 },
};

/** Domination : cartes de distance à la zone, partagées par les bots d'une partie (une fois par tick). */
const FIELDS = new WeakMap<Match, { tick: number; map: Map<Set<number>, Int16Array> }>();

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

  /** vitesse réelle au moment de réfléchir (ralentissements compris) */
  private speedNow = 0;

  update(m: Match, dt: number): InputCmd {
    const p = m.players[this.playerId];
    const cmd: InputCmd = { mx: 0, my: 0, bomb: false, ability: false };
    if (!p.alive || m.phase !== "playing" && m.phase !== "ending") return cmd;
    // vitesse réelle (gel, Chaos) : les temps de fuite en tiennent compte
    this.speedNow = m.effectiveSpeed(p);

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
    // bombe télécommandée : on la fait sauter quand un adversaire est dedans et qu'on est à l'abri
    if (this.shouldDetonate(m, p)) cmd.remote = true;
    // bombe à lancer : on se tourne vers la cible et on lance dans le même tick
    if (this.wantThrow) {
      const [dx, dy] = this.wantThrow;
      this.wantThrow = null;
      if (p.throwCharges > 0) {
        cmd.mx = dx;
        cmd.my = dy;
        cmd.throw = true;
        return cmd;
      }
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

  /** Lancer prévu au prochain tick : direction (dx, dy). */
  private wantThrow: [number, number] | null = null;

  /** Faire sauter sa bombe télécommandée maintenant ? (on n'est pas dedans ; un adversaire l'est, ou elle attend depuis longtemps) */
  private shouldDetonate(m: Match, p: PlayerState): boolean {
    const mine = m.remoteBombsOf(p);
    if (!mine.length) return false;
    const g = m.grid;
    const me = g.idx(Math.floor(p.x), Math.floor(p.y));
    let foeIn = false;
    let old = false;
    for (const b of mine) {
      const cells = new Set(m.blastCells(b.tx, b.ty, b.range));
      if (cells.has(me)) return false; // jamais sur soi
      // un coéquipier dedans : on attend (pas de tir ami, mais on ne gâche pas la bombe)
      for (const o of m.players) if (m.isFoe(p, o) && o.shieldTime <= 0 && cells.has(g.idx(Math.floor(o.x), Math.floor(o.y)))) foeIn = true;
      if (b.fuseTotal - b.fuse > 2.5 + this.prof.margin * 2) old = true;
    }
    return foeIn || old;
  }

  /**
   * Bombe à lancer : vise un adversaire touché par l'explosion à l'arrivée.
   * On ne lance que si la bombe atterrit hors de sa propre portée (pas de
   * suicide), et pas à chaque occasion (selon l'agressivité du bot).
   */
  private planThrow(m: Match, p: PlayerState): boolean {
    if (p.throwCharges <= 0 || p.activeBombs >= p.maxBombs || p.bombCooldown > 0) return false;
    if (!this.rng.chance(0.25 + this.prof.aggression * 0.5)) return false;
    const px = Math.floor(p.x);
    const py = Math.floor(p.y);
    for (const [dx, dy] of DIRS) {
      const to = m.throwTarget(px, py, dx, dy);
      if (!to) continue;
      const dist = Math.abs(to[0] - px) + Math.abs(to[1] - py);
      if (dist <= m.nextBombRange(p)) continue;
      const cells = new Set(m.blastCells(to[0], to[1], m.nextBombRange(p)));
      if (m.players.some((o) => m.isFoe(p, o) && o.shieldTime <= 0 && cells.has(m.grid.idx(Math.floor(o.x), Math.floor(o.y))))) {
        this.wantThrow = [dx, dy];
        this.lastDecision = "throw";
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------ décision
  private think(m: Match, p: PlayerState): void {
    const g = m.grid;
    const myIdx = g.idx(Math.floor(p.x), Math.floor(p.y));
    // en équipes : le feu d'un coéquipier ne blesse pas, on ne le fuit pas
    const danger = computeDanger(m, undefined, p.id);
    const sloppy = this.rng.chance(this.prof.mistake);

    // 1. Danger sur ma case : fuir
    // (Domination : sur la zone, on tient jusqu'au dernier moment où la fuite reste sûre)
    if (danger.start[myIdx] !== Infinity && m.hill && this.holdUnderFire(m, p, danger, myIdx)) return;
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

    // 2 bis. Bombe à lancer : un adversaire à portée de lancer ?
    if (this.planThrow(m, p)) return;

    // 2 ter. Domination : l'objectif passe avant tout le reste (voir playDomination)
    if (m.hill && this.playDomination(m, p, danger, sloppy)) return;

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

  // ------------------------------------------------------------ Domination
  /** rôle actuel en Domination (débogage, tests) */
  role: "" | "cap" | "guard" | "rush" = "";
  /** objectif du chemin en cours (on garde le chemin tant que l'objectif ne change pas) */
  private goalKey = "";
  /** distraction volontaire (bots faciles) jusqu'à ce moment */
  private distractedUntil = -1;
  /** progression vers la zone : meilleure distance et depuis quand */
  private progress = { key: "", best: 1e9, since: 0 };

  /**
   * Domination (2 contre 2) : tenir la zone est la seule façon de gagner.
   *
   * - Objectif : la zone actuelle, ou la prochaine dès qu'elle est annoncée et
   *   qu'il est temps d'y aller (arrivée calculée sur le temps de marche).
   * - Rôles dans l'équipe : le plus proche de la zone la PREND (« cap ») ; l'autre
   *   la PROTÈGE (« guard ») : il se place entre la zone et les adversaires et
   *   les bombarde quand ils approchent. Les deux FONCENT (« rush ») quand la
   *   zone est prise ou disputée par l'adversaire, quand le coéquipier est mort,
   *   ou quand l'équipe est menée en fin de partie.
   * - Survie : la fuite (danger sur sa case) reste prioritaire (think, étape 1).
   * Renvoie false pour laisser la logique générale décider (bot distrait).
   */
  private playDomination(m: Match, p: PlayerState, danger: DangerMap, sloppy: boolean): boolean {
    const h = m.hill!;
    const g = m.grid;
    const px = Math.floor(p.x);
    const py = Math.floor(p.y);
    const here = g.idx(px, py);
    const cellOf = (o: PlayerState) => g.idx(Math.floor(o.x), Math.floor(o.y));

    // bots faciles : parfois distraits (on s'y tient un moment, pas de va-et-vient)
    if (m.time < this.distractedUntil) return false;
    if (this.prof.distract > 0 && this.rng.chance(this.prof.distract)) {
      this.distractedUntil = m.time + 1 + this.rng.next() * 1.5;
      this.goalKey = "";
      return false;
    }

    // ---- 1. Quelle zone viser ?
    const speed = this.speedNow > 0 ? this.speedNow : p.speed;
    let target = h.cellSet;
    let next = false;
    const nextSet = h.nextSet;
    if (nextSet) {
      const etaNext = this.zoneField(m, nextSet)[here] / speed;
      const onCur = target.has(here);
      const holding = onCur && !h.contested && h.holder >= 0;
      // on tient la zone : on y reste jusqu'au dernier moment utile ; sinon on part en avance
      const leaveAt = holding ? etaNext - 0.5 : etaNext + this.prof.lead;
      const curEta = this.zoneField(m, target)[here] / speed;
      if (h.moveIn <= Math.max(0.15, leaveAt) || (!onCur && curEta >= h.moveIn - 0.3)) {
        target = nextSet;
        next = true;
      }
    }
    const field = this.zoneField(m, target);
    const myD = field[here];
    const onZone = target.has(here);

    // ---- 2. Situation de l'équipe
    const team = m.teamOf(p.id);
    const mates = m.players.filter((o) => o.alive && m.sameTeam(p.id, o.id));
    const foes = m.players.filter((o) => m.isFoe(p, o));
    const mySlot = h.slot(p.id);
    const myPts = h.scores[mySlot] ?? 0;
    const foePts = Math.max(0, ...h.scores.filter((_, k) => k !== mySlot));
    const foesOnZone = foes.filter((o) => target.has(cellOf(o)));
    const matesOnZone = mates.filter((o) => target.has(cellOf(o)));
    const enemyHolds = !next && h.holder >= 0 && h.slot(h.holder) !== mySlot;
    const late = m.timeLeft < 35 && myPts <= foePts;
    const danger2win = foePts >= HILL_RULES.target - 6; // l'adversaire est proche de la victoire

    let role: "cap" | "guard" | "rush";
    if (team < 0 || !mates.length) role = "rush";
    else if (enemyHolds || (foesOnZone.length && !matesOnZone.length) || late || danger2win) role = "rush";
    else {
      // le plus proche de la zone la prend (égalité : le plus petit numéro)
      const mate = mates.reduce((a, b) => (field[cellOf(a)] <= field[cellOf(b)] ? a : b));
      const mateD = field[cellOf(mate)];
      const meFirst = matesOnZone.length ? false : myD < mateD || (myD === mateD && p.id < mate.id);
      role = onZone && !matesOnZone.length ? "cap" : meFirst ? "cap" : "guard";
      if (onZone && matesOnZone.length && p.id < matesOnZone[0].id) role = "cap";
    }
    if (role !== this.role) this.goalKey = "";
    this.role = role;

    const range = m.nextBombRange(p);
    const canBomb = p.activeBombs < p.maxBombs && g.bombAt[here] < 0 && p.bombCooldown <= 0;
    const bombVal = canBomb ? this.bombValue(m, p) : { blocks: 0, enemy: false };
    // Une bombe dont l'explosion couvre la zone la rend intenable ~3 s pour TOUT
    // le monde (et chasse un coéquipier qui la tient). On ne le fait que pour
    // déloger un adversaire qui est dessus, ou, rarement, quand on est mené.
    const hurtsHold = (() => {
      if (foesOnZone.length) return false;
      const cells: number[] = [];
      const bombCells = new Set<number>();
      for (const b of m.bombs.values()) bombCells.add(g.idx(b.tx, b.ty));
      blastCells(m, px, py, range, bombCells, cells);
      if (!cells.some((c) => target.has(c))) return false;
      return matesOnZone.length > 0 || myPts >= foePts || !this.rng.chance(0.25);
    })();
    const attack = (chance: number): boolean =>
      canBomb && bombVal.enemy && !hurtsHold && this.rng.chance(chance) && this.placeIfEscapable(m, p, sloppy);

    // ---- 3. Sur la zone : on la tient
    if (onZone && role !== "guard") {
      if (h.contested || foesOnZone.length) {
        // disputée : rester empêche l'adversaire de marquer ; on bombarde s'il est dans l'axe
        if (attack(0.45 + this.prof.aggression * 0.5)) return this.mark("zone-fight");
      } else if (!mates.length && foes.some((o) => field[cellOf(o)] <= 2) && attack(0.2 + this.prof.aggression * 0.4)) {
        // seul : un adversaire arrive au contact, on le repousse
        return this.mark("zone-defend");
      }
      this.path = [];
      this.goalKey = "hold";
      return this.mark("hold");
    }

    // ---- 4. Protecteur : entre la zone et les adversaires
    if (role === "guard") {
      // un adversaire près de la zone dans l'axe : bombe
      const threat = foes.filter((o) => field[cellOf(o)] <= 5).sort((a, b) => field[cellOf(a)] - field[cellOf(b)]);
      if (threat.length && attack(0.5 + this.prof.aggression * 0.5)) return this.mark("guard-bomb");
      if (onZone && matesOnZone.some((o) => o.id !== p.id)) {
        // deux sur la zone : je laisse la place et je me poste à côté
        this.goalKey = "";
      }
      // se placer dans l'axe de l'adversaire le plus menaçant (sans gêner la zone)
      if (threat.length && canBomb) {
        const foe = threat[0];
        const aim = this.findTarget(m, p, danger, 6, (i) => {
          if (g.bombAt[i] >= 0 || target.has(i)) return false;
          const x = i % g.w;
          const y = Math.floor(i / g.w);
          return this.inLineWith(m, foe, x, y, range) && field[i] <= 4;
        });
        if (aim && aim.length) return this.go(aim, "guard-aim:" + foe.id, "guard-intercept");
      }
      // bonus tout proche : on le prend (le protecteur a le temps)
      if (this.grabBonus(m, p, danger, 3)) return true;
      // poste de garde : près de la zone, du côté des adversaires, pas sur le coéquipier
      const mateCells = new Set(mates.map(cellOf));
      const post = this.bestPost(m, p, danger, target, field, foes, mateCells);
      if (post) {
        if (post.length === 0) {
          this.path = [];
          return this.mark("guard-post");
        }
        return this.go(post, "post:" + post[post.length - 1], "guard-post");
      }
      // aucun poste accessible : on rejoint la zone quand même
    }

    // ---- 5. Prendre la zone (cap / rush)
    // petit bonus sur la route seulement, et jamais quand ça presse
    if (role === "cap" && !next && !h.contested && this.grabBonus(m, p, danger, 2)) return true;
    // un adversaire dans l'axe en chemin : on tente la bombe (plus volontiers en « rush »)
    if (bombVal.enemy && attack(role === "rush" ? 0.35 + this.prof.aggression * 0.4 : 0.2 + this.prof.aggression * 0.3)) return this.mark("rush-bomb");
    const key = (next ? "next:" : "cur:") + [...target][0];
    this.trackProgress(m, key, myD);
    // zone menacée plus tard : on y va quand même s'il reste du temps à y passer
    const toZone = this.bfs(m, p, danger, this.prof.margin, 40, (i, node) => target.has(i) && g.bombAt[i] < 0 && (danger.start[i] === Infinity || danger.start[i] - this.eta(p, node.dist) > 1.4 + this.prof.think * 2));
    if (toZone && toZone.length && !this.stalled(m)) return this.go(toZone, key, role + (next ? "-next" : ""));
    // zone en feu ou bloquée par une bombe : attendre sur la case sûre la plus proche
    const wait = this.findTarget(m, p, danger, 12, (i) => field[i] <= 2 && !target.has(i) && g.bombAt[i] < 0 && this.exits(m, i) >= 2);
    if (wait && !this.stalled(m) && field[here] > 2) return this.go(wait, key + ":wait", "zone-wait");
    if (field[here] <= 2 && !this.stalled(m)) {
      this.path = [];
      return this.mark("zone-wait");
    }
    // chemin bouché par des caisses : casser celle qui rapproche le plus de la zone
    const mine = field[here];
    if (canBomb && bombVal.blocks > 0) {
      const cells: number[] = [];
      blastCells(m, px, py, range, new Set<number>(), cells);
      if (cells.some((c) => g.tiles[c] === TILE.BLOCK && field[c] < mine) && this.placeIfEscapable(m, p, sloppy)) return this.mark("zone-break");
    }
    const brk = this.findTarget(m, p, danger, 30, (i) => {
      if (g.bombAt[i] >= 0) return false;
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      for (const [dx, dy] of DIRS) {
        const n = g.idx(x + dx, y + dy);
        if (g.tile(x + dx, y + dy) === TILE.BLOCK && field[n] < mine) return true;
      }
      return false;
    });
    if (brk && brk.length) return this.go(brk, key + ":break", "zone-break");
    this.progress.since = m.time; // on repart de zéro au prochain essai
    return false;
  }

  /**
   * Sur la zone avec une explosion annoncée : chaque seconde sur la zone vaut
   * un point (ou empêche l'adversaire de marquer). On reste tant qu'il reste
   * le temps de fuir avec une bonne marge (temps de réflexion compris).
   */
  private holdUnderFire(m: Match, p: PlayerState, danger: DangerMap, myIdx: number): boolean {
    if (!m.hill!.cellSet.has(myIdx) || this.prof.distract > 0.02) return false;
    // sa propre bombe : on a choisi de fuir, on fuit
    for (const b of m.bombs.values()) if (b.ownerId === p.id && m.blastCells(b.tx, b.ty, b.range).includes(myIdx)) return false;
    const escape = this.findSafe(m, p, danger, this.prof.margin);
    if (!escape) return false;
    const need = this.eta(p, escape.length) + this.prof.margin;
    const buffer = this.prof.think * 2 + 0.4;
    if (danger.start[myIdx] - need <= buffer) return false;
    this.path = [];
    this.goalKey = "hold";
    this.lastDecision = "hold-risk";
    return true;
  }

  /** Nombre de cases libres autour (une attente dans un cul-de-sac finit mal). */
  private exits(m: Match, i: number): number {
    const g = m.grid;
    const x = i % g.w;
    const y = Math.floor(i / g.w);
    let n = 0;
    for (const [dx, dy] of DIRS) if (!g.blocksMove(x + dx, y + dy) && g.bombAt[g.idx(x + dx, y + dy)] < 0) n++;
    return n;
  }

  private mark(d: string): boolean {
    this.lastDecision = d;
    return true;
  }

  /** Suit `path` ; si l'objectif n'a pas changé et que l'ancien chemin reste valable, on le garde (pas d'hésitation). */
  private go(path: number[], key: string, decision: string): boolean {
    const keep = this.goalKey === key && this.path.length > 0 && this.path[this.path.length - 1] === path[path.length - 1];
    if (!keep) this.path = path;
    this.goalKey = key;
    this.lastDecision = decision;
    return true;
  }

  /** Prend un bonus à `radius` pas au plus. */
  private grabBonus(m: Match, p: PlayerState, danger: DangerMap, radius: number): boolean {
    const bonusPath = this.findTarget(m, p, danger, radius, (i) => m.grid.bonusAt[i] >= 0);
    if (!bonusPath || !bonusPath.length) return false;
    return this.go(bonusPath, "bonus:" + bonusPath[bonusPath.length - 1], "bonus");
  }

  /** Bloqué : la distance à la zone ne baisse plus depuis 2,5 s alors qu'on essaie d'y aller. */
  private trackProgress(m: Match, key: string, d: number): void {
    const pr = this.progress;
    if (pr.key !== key || d < pr.best) {
      pr.key = key;
      pr.best = d;
      pr.since = m.time;
    }
  }
  private stalled(m: Match): boolean {
    return m.time - this.progress.since > 2.5;
  }

  /** L'adversaire o est-il dans l'axe de (x, y), à portée, sans obstacle ? */
  private inLineWith(m: Match, o: PlayerState, x: number, y: number, r: number): boolean {
    const g = m.grid;
    const ox = Math.floor(o.x);
    const oy = Math.floor(o.y);
    if (ox !== x && oy !== y) return false;
    const d = Math.abs(ox - x) + Math.abs(oy - y);
    if (d === 0 || d > r) return false;
    const sx = Math.sign(ox - x);
    const sy = Math.sign(oy - y);
    for (let k = 1; k < d; k++) if (g.isSolid(x + sx * k, y + sy * k)) return false;
    return true;
  }

  /**
   * Poste de garde : une case sûre à 1-3 pas de la zone (hors zone), du côté
   * des adversaires, jamais sur un coéquipier. Renvoie le chemin ([] = on y est).
   */
  private bestPost(m: Match, p: PlayerState, danger: DangerMap, target: Set<number>, field: Int16Array, foes: PlayerState[], mateCells: Set<number>): number[] | null {
    const g = m.grid;
    const here = g.idx(Math.floor(p.x), Math.floor(p.y));
    const foeCells = foes.map((o) => [Math.floor(o.x), Math.floor(o.y)]);
    let best = -1;
    let bestScore = Infinity;
    const score = (i: number) => {
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      // proche de l'adversaire le plus proche = on lui barre la route
      let near = 20;
      for (const [fx, fy] of foeCells) near = Math.min(near, Math.abs(fx - x) + Math.abs(fy - y));
      return field[i] * 1.5 + near + (i === here ? -0.8 : 0);
    };
    this.bfs(m, p, danger, this.prof.margin, 10, (i) => {
      if (target.has(i) || mateCells.has(i) || g.bombAt[i] >= 0 || danger.start[i] !== Infinity) return false;
      if (field[i] < 1 || field[i] > 3) return false;
      const s = score(i);
      if (s < bestScore) {
        bestScore = s;
        best = i;
      }
      return false;
    });
    if (best < 0) return null;
    if (best === here) return [];
    return this.findTarget(m, p, danger, 12, (i) => i === best);
  }

  /**
   * Distance de marche (en pas) de chaque case à la zone. Une caisse coûte 4
   * pas (il faut la casser), les murs et obstacles sont infranchissables.
   * Partagé entre les bots d'une même partie (calculé une fois par tick et par zone).
   */
  private zoneField(m: Match, target: Set<number>): Int16Array {
    let per = FIELDS.get(m);
    if (!per || per.tick !== m.tick) {
      per = { tick: m.tick, map: new Map() };
      FIELDS.set(m, per);
    }
    const hit = per.map.get(target);
    if (hit) return hit;
    const g = m.grid;
    const dist = new Int16Array(g.w * g.h).fill(32000);
    // file à seaux (coûts 1 et 4)
    const buckets: number[][] = [[]];
    for (const c of target) {
      dist[c] = 0;
      buckets[0].push(c);
    }
    for (let d = 0; d < buckets.length; d++) {
      const bucket = buckets[d];
      if (!bucket) continue;
      for (let k = 0; k < bucket.length; k++) {
        const c = bucket[k];
        if (dist[c] !== d) continue;
        const x = c % g.w;
        const y = Math.floor(c / g.w);
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          const t = g.tile(nx, ny);
          if (t === TILE.WALL || g.isHazard(nx, ny)) continue;
          if (t !== TILE.FLOOR && t !== TILE.BLOCK) continue;
          const n = g.idx(nx, ny);
          const nd = d + (t === TILE.BLOCK ? 4 : 1);
          if (nd < dist[n]) {
            dist[n] = nd;
            (buckets[nd] ??= []).push(n);
          }
        }
      }
    }
    per.map.set(target, dist);
    return dist;
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
    blastCells(m, Math.floor(p.x), Math.floor(p.y), m.nextBombRange(p), bombCells, cells);
    let blocks = 0;
    let enemy = false;
    for (const c of cells) {
      if (g.tiles[c] === TILE.BLOCK) blocks++;
      for (const o of m.players) {
        if (m.isFoe(p, o) && g.idx(Math.floor(o.x), Math.floor(o.y)) === c && o.shieldTime <= 0) enemy = true;
      }
    }
    return { blocks, enemy };
  }

  private enemyNear(m: Match, p: PlayerState, r: number): boolean {
    return m.players.some(
      (o) => m.isFoe(p, o) && Math.abs(o.x - p.x) + Math.abs(o.y - p.y) <= r + 0.5,
    );
  }

  private enemyInLine(m: Match, p: PlayerState, x: number, y: number, r: number): boolean {
    const g = m.grid;
    for (const o of m.players) {
      if (!m.isFoe(p, o)) continue;
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
      const danger = computeDanger(m, { tx, ty, fuse: m.bombRules.fuse * m.fuseMul, range: m.nextBombRange(p), toxic: p.toxicCharges > 0, chain: p.chainCharges > 0, owner: p.id }, p.id);
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
    return (steps + 0.3) / (p.id === this.playerId && this.speedNow > 0 ? this.speedNow : p.speed);
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
      m.players.filter((o) => m.isFoe(p, o)).map((o) => g.idx(Math.floor(o.x), Math.floor(o.y))),
    );
    const path = this.bfs(m, p, danger, this.prof.margin, 40, (idx) => enemyCells.has(idx));
    if (!path || path.length <= 1) return null;
    // s'arrêter un peu avant, et sur une case sûre
    const trimmed = path.slice(0, Math.max(1, path.length - 2));
    return danger.start[trimmed[trimmed.length - 1]] === Infinity ? trimmed : null;
  }
}
