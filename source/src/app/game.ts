import { audio } from "../audio/audio";
import { CHARACTERS, getCharacter, skinsOf } from "../core/characters";
import { CHAOS_EVENTS } from "../core/chaos";
import { ACCESSORIES, EMOTES, BOOMS, TRAILS } from "../core/cosmetics";
import { lookOf } from "../render/bodies";
import { DT, RULES } from "../core/rules";
import { NO_INPUT, type Difficulty, type PlayerSlot, type SimEvent } from "../core/types";
import { Controls } from "../input/controls";
import { getMap, pickMap } from "../maps";
import { LocalSession, type GameSession } from "../net/session";
import { haptics } from "../platform/haptics";
import { Renderer, type Rect } from "../render/renderer";
import { BONUS_COLORS, LIFT } from "../render/sprites";
import { viewport } from "../platform/viewport";

export interface GameSetup {
  mapId: string;
  modeId: string;
  botCount: number;
  difficulty: Difficulty;
  characterId: string;
  skinId?: string;
  accessoryId?: string;
  trailId?: string;
  boomId?: string;
  playerName: string;
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/** Tenue aléatoire pour les bots et la démo : montre la variété des cosmétiques. */
function randomLook(characterId: string, flashy: boolean) {
  const sk = skinsOf(characterId);
  return {
    skinId: flashy || Math.random() < 0.6 ? pick(sk).id : sk[0].id,
    trailId: flashy || Math.random() < 0.5 ? pick(TRAILS).id : undefined,
    accessoryId: Math.random() < (flashy ? 0.4 : 0.2) ? pick(ACCESSORIES).id : undefined,
    boomId: flashy || Math.random() < 0.35 ? pick(BOOMS.filter((b) => !b.exclusive)).id : undefined,
  };
}

/** Une ligne du classement final (calculé par la simulation, pas l'affichage). */
export interface StandingRow {
  id: number;
  name: string;
  characterId: string;
  skinId?: string;
  accessoryId?: string;
  place: number;
  /** place définitive (un joueur encore en vie attend la fin de la partie) */
  decided: boolean;
  alive: boolean;
  kills: number;
  me: boolean;
}

export interface GameResult {
  won: boolean;
  draw: boolean;
  place: number;
  players: number;
  kills: number;
  bombsPlaced: number;
  blocksDestroyed: number;
  bonusesPicked: number;
  survivalTime: number;
  characterId: string;
  skinId?: string;
  modeId: string;
  /** classement de tous les joueurs au moment du résultat */
  standings: StandingRow[];
}


/**
 * Écran de jeu : boucle à pas fixe (60 Hz) + rendu interpolé.
 * Sert aussi de « démo » animée derrière les menus (bots seuls).
 */
export class GameScreen {
  readonly renderer: Renderer;
  readonly controls: Controls;
  session: GameSession | null = null;
  setup: GameSetup | null = null;
  demo = false;
  paused = false;

  onFinished: ((r: GameResult) => void) | null = null;
  onHud: (() => void) | null = null;
  onBanner: ((kicker: string, text: string) => void) | null = null;

  private acc = 0;
  private last = 0;
  private prev: Float32Array | null = null;
  private raf = 0;
  private finishTimer = -1;
  private tickTimer = 0;
  private countdownShown = -1;
  private viewW = 0;
  private viewH = 0;
  private finished = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.controls = new Controls(canvas);
    this.renderer.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    viewport.onChange(() => this.resize());
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------- parties
  startDemo() {
    this.demo = true;
    const ids = [...CHARACTERS].sort(() => Math.random() - 0.5).slice(0, 4).map((c) => c.id);
    // démo : skins tirés au hasard, pour montrer la variété
    const players: PlayerSlot[] = ids.map((id) => ({ name: getCharacter(id).name, characterId: id, ...randomLook(id, true), isBot: true, difficulty: "normal" }));
    // la démo derrière les menus passe d'une map à l'autre
    this.begin(players, pickMap("random").id, "classic", -1, (Math.random() * 1e9) | 0);
  }

  start(setup: GameSetup) {
    this.demo = false;
    this.setup = setup;
    const others = CHARACTERS.filter((c) => c.id !== setup.characterId)
      .map((c) => c.id)
      .sort(() => Math.random() - 0.5);
    const players: PlayerSlot[] = [
      { name: setup.playerName, characterId: setup.characterId, skinId: setup.skinId, accessoryId: setup.accessoryId, trailId: setup.trailId, boomId: setup.boomId, isBot: false },
      ...others.slice(0, setup.botCount).map((id) => ({
        name: getCharacter(id).name, characterId: id, ...randomLook(id, false), isBot: true, difficulty: setup.difficulty,
      })),
    ];
    this.begin(players, pickMap(setup.mapId).id, setup.modeId, 0, (Math.random() * 1e9) | 0);
  }

  restart() {
    if (this.setup) this.start(this.setup);
  }

  private begin(players: PlayerSlot[], mapId: string, modeId: string, local: number, seed: number) {
    this.attach(new LocalSession({ seed, map: getMap(mapId), modeId, players }, Math.max(0, local)), local);
  }

  /** Partie en ligne : la simulation fait autorité sur le serveur. */
  startOnline(session: GameSession) {
    this.demo = false;
    this.setup = null;
    this.attach(session, session.localPlayer);
  }

  get online(): boolean {
    return !!(this.session as { online?: boolean } | null)?.online;
  }

  private attach(session: GameSession, local: number) {
    this.session?.dispose();
    this.session = session;
    this.renderer.localPlayer = local;
    this.renderer.reset(this.session.match);
    this.controls.releaseAll();
    this.controls.enabled = !this.demo;
    this.acc = 0;
    this.prev = null;
    this.finishTimer = -1;
    this.finished = false;
    this.result = null;
    this.endingSignaled = false;
    this.matchKey = this.demo ? "" : session instanceof LocalSession ? `L-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}` : `O-${session.match.config.seed}-${(session as { matchId?: number }).matchId ?? 0}`;
    this.countdownShown = -1;
    this.paused = false;
    if (this.demo) this.session.match.countdown = 0;
    this.resize();
    audio.setIntensity(0);
    this.onHud?.();
  }

  stop() {
    this.session?.dispose();
    this.session = null;
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.controls.releaseAll();
    this.controls.enabled = !p && !this.demo;
    this.last = performance.now();
  }

  // ---------------------------------------------------------------- mise en page
  /** Rectangle visible de l'arène (en px logiques), pour le HUD. */
  arenaRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  onLayout: ((arena: Rect) => void) | null = null;

  resize() {
    const w = viewport.w;
    const h = viewport.h;
    const safe = viewport.safe;
    this.viewW = w;
    this.viewH = h;
    this.renderer.resize(w, h);
    const m = this.session?.match;
    if (!m) return;
    const crop = 0.4;
    if (this.demo) {
      // démo derrière les menus : arène pleine hauteur, forêt tout autour
      this.renderer.fit(m, { x: 0, y: 0, w, h }, crop);
      return;
    }
    // Paysage : l'arène prend toute la hauteur ; deux colonnes latérales
    // (largeur mini garantie) accueillent HUD et commandes sous les pouces.
    // zoom : la haie de bordure sort presque entièrement de l'écran, l'aire de
    // jeu gagne ~10 %; les colonnes latérales n'accueillent plus que chrono,
    // pouvoirs et commandes
    const zoomCrop = 0.85;
    const minSide = Math.min(Math.max(w * 0.135, 104), 260);
    const area: Rect = {
      x: safe.l + minSide,
      y: safe.t + 2,
      w: Math.max(100, w - safe.l - safe.r - minSide * 2),
      h: h - safe.t - safe.b - 4,
    };
    this.renderer.fit(m, area, zoomCrop);
    const s = this.renderer.s;
    this.arenaRect = {
      x: this.renderer.ox + zoomCrop * s,
      y: this.renderer.oy - LIFT * s + zoomCrop * s,
      w: (m.grid.w - zoomCrop * 2) * s,
      h: (m.grid.h - zoomCrop * 2 + LIFT) * s,
    };
    this.controls.setLayout(w, h, safe, this.arenaRect);
    this.onLayout?.(this.arenaRect);
  }

  // ---------------------------------------------------------------- boucle
  private loop(now: number) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    const s = this.session;
    if (!s) return;
    const m = s.match;
    // en ligne, le menu pause n'arrête pas la partie (les autres jouent)
    if (!this.paused || this.online) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= DT && steps < 6) {
        if (!this.prev || this.prev.length !== m.players.length * 2) this.prev = new Float32Array(m.players.length * 2);
        for (const p of m.players) {
          this.prev[p.id * 2] = p.x;
          this.prev[p.id * 2 + 1] = p.y;
        }
        const input = this.demo || this.paused ? NO_INPUT : this.controls.read();
        s.step(input);
        this.handleEvents(m.events);
        this.acc -= DT;
        steps++;
      }
      if (steps === 6) this.acc = 0;
      // joueur éliminé, écran de résultats affiché : en solo, la fin de la
      // partie entre bots est jouée en accéléré (sans son) pour établir le
      // vrai classement final en une ou deux secondes
      if (this.finished && !this.online && m.phase !== "over") for (let k = 0; k < 90 && !m.isOver; k++) s.step(NO_INPUT);
      this.afterSteps(dt);
    }
    const frozen = this.paused && !this.online;
    // démo derrière les menus (voilée) : 30 images/s suffisent, on économise la batterie
    if (this.demo && this.background) {
      this.skipDt += dt;
      if ((this.frameNo = (this.frameNo + 1) % 2) === 1) return;
      this.renderer.draw(m, this.skipDt, this.prev, Math.min(1, this.acc / DT));
      this.skipDt = 0;
      return;
    }
    this.renderer.draw(m, frozen ? 0 : dt, this.prev, frozen ? 1 : Math.min(1, this.acc / DT));
    if (!this.demo && !this.finished) {
      const me = m.players[s.localPlayer];
      this.controls.draw(this.renderer.ctx, me.shieldCharges, me.shieldTime, me.maxBombs - me.activeBombs, me.maxBombs);
    }
  }

  private afterSteps(dt: number) {
    const s = this.session!;
    const m = s.match;
    if (this.demo) {
      if (m.phase === "over") this.startDemo();
      return;
    }
    // compte à rebours sonore
    if (m.phase === "countdown") {
      const n = Math.ceil(m.countdown);
      if (n !== this.countdownShown) {
        this.countdownShown = n;
        audio.play("count");
      }
    } else if (this.countdownShown !== 0) {
      this.countdownShown = 0;
      audio.play("go");
    }
    // mode Chaos : bip à chaque seconde du compte à rebours
    const ch = m.chaos;
    const cd = ch?.pending && ch.pending.def.countdown > 0 ? Math.ceil(ch.pendingLeft) : 0;
    if (cd !== this.chaosCount) {
      if (cd > 0) audio.play("count");
      this.chaosCount = cd;
    }
    // tic-tac quand une bombe va exploser : de plus en plus rapide
    this.tickTimer -= dt;
    let soonest = Infinity;
    for (const b of m.bombs.values()) soonest = Math.min(soonest, b.fuse);
    if (!this.finished && soonest < RULES.bombWarn + 0.35 && this.tickTimer <= 0) {
      const k = Math.max(0, Math.min(1, soonest / (RULES.bombWarn + 0.35)));
      audio.play("tick", 0.95 - k * 0.4);
      this.tickTimer = 0.055 + k * 0.15;
    }
    audio.setIntensity(m.suddenDeath ? 1 : m.aliveCount <= 2 ? 0.5 : 0);

    // fin de partie pour le joueur local
    const me = m.players[s.localPlayer];
    if (!this.endingSignaled && !this.result && me.alive && m.phase === "ending") {
      this.endingSignaled = true;
      this.onEnding?.();
    }
    if (!this.finished && this.finishTimer < 0) {
      if (!me.alive) this.finishTimer = 1.8;
      else if (m.phase === "over") this.finishTimer = 1.0;
      // l'issue est connue : on la règle tout de suite (avant même l'écran
      // de résultats), pour qu'un rechargement ne puisse rien changer
      if (this.finishTimer >= 0) {
        this.result = this.computeResult();
        this.onOutcome?.(this.result);
      }
    }
    if (this.finishTimer >= 0 && !this.finished) {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) this.finish();
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      this.onHud?.();
    }
  }
  private hudTimer = 0;
  /** la démo tourne derrière un menu opaque */
  background = false;
  private skipDt = 0;
  private frameNo = 0;
  private chaosCount = 0;

  /** Résultat de la partie pour le joueur local, dès qu'il est connu. */
  result: GameResult | null = null;
  /** fin de manche en cours, joueur encore debout */
  onEnding: (() => void) | null = null;
  private endingSignaled = false;
  /** l'issue vient d'être connue (règlement des pièces) */
  onOutcome: ((r: GameResult) => void) | null = null;

  /** Partie réelle en cours dont l'issue n'est pas encore connue. */
  get live(): boolean {
    return !!this.session && !this.demo && !this.result;
  }

  /** Identifiant unique de la partie (sert à ne la régler qu'une fois). */
  matchKey = "";

  /** Classement actuel de la partie (se complète tant qu'elle continue). */
  standings(): StandingRow[] {
    const s = this.session;
    if (!s) return [];
    const m = s.match;
    return m.standings().map((st) => {
      const p = m.players[st.id];
      return {
        id: p.id,
        name: p.name,
        characterId: p.characterId,
        skinId: p.skinId,
        accessoryId: p.accessoryId,
        place: st.place,
        decided: st.decided,
        alive: st.alive,
        kills: p.stats.kills,
        me: p.id === s.localPlayer,
      };
    });
  }

  private computeResult(): GameResult {
    const s = this.session!;
    const m = s.match;
    const me = m.players[s.localPlayer];
    // place réelle d'après la simulation (morts simultanées = ex aequo)
    const standings = this.standings();
    const place = standings.find((r) => r.me)?.place ?? m.players.length;
    const won = m.phase === "over" && m.winnerId === me.id;
    // 1re place partagée (temps écoulé, ou derniers morts ensemble) : égalité
    const draw = place === 1 && !won;
    return {
      won,
      draw,
      place,
      players: m.players.length,
      kills: me.stats.kills,
      bombsPlaced: me.stats.bombsPlaced,
      blocksDestroyed: me.stats.blocksDestroyed,
      bonusesPicked: me.stats.bonusesPicked,
      survivalTime: me.alive ? m.time : me.stats.survivalTime,
      characterId: me.characterId,
      skinId: me.skinId,
      modeId: m.config.modeId,
      standings,
    };
  }

  private finish() {
    this.finished = true;
    const r = this.result ?? this.computeResult();
    audio.play(r.won ? "win" : "lose");
    this.onFinished?.(r);
  }

  // ---------------------------------------------------------- événements
  private handleEvents(events: SimEvent[]) {
    if (!events.length || this.finished) return;
    const s = this.session!;
    const m = s.match;
    this.renderer.onEvents(m, events);
    if (!this.online) this.botEmotes(events);
    if (this.demo) return;
    const me = m.players[s.localPlayer];
    const near = (x: number, y: number) => Math.max(0.15, 1 - Math.hypot(x - me.x, y - me.y) / 11);
    let explodeVol = 0;
    for (const e of events) {
      switch (e.t) {
        case "bombPlaced":
          audio.play("place", near(e.x + 0.5, e.y + 0.5));
          if (e.owner === me.id) haptics.bomb();
          break;
        case "explode": {
          const v = near(e.x + 0.5, e.y + 0.5);
          explodeVol = Math.max(explodeVol, v);
          if (me.alive && Math.hypot(e.x + 0.5 - me.x, e.y + 0.5 - me.y) < 3.5) haptics.explosionNear();
          break;
        }
        case "blockDestroyed":
          audio.play("break", near(e.x + 0.5, e.y + 0.5) * 0.7);
          break;
        case "bonusPicked":
          if (e.player === me.id) audio.play("pickup");
          else audio.play("pickup", 0.25);
          break;
        case "playerDied":
          audio.play("death", e.player === me.id ? 1 : 0.6);
          if (e.player === me.id) haptics.death();
          this.onHud?.();
          break;
        case "shieldOn":
          audio.play("shield", e.player === me.id ? 1 : 0.4);
          break;
        case "shieldBlocked":
          audio.play("shieldHit");
          break;
        case "suddenDeath":
          audio.play("alarm");
          this.onBanner?.("⚠️ ATTENTION", "MORT SUBITE !");
          break;
        case "wallDrop":
          audio.play("thud", near(e.x + 0.5, e.y + 0.5) * 0.5);
          break;
        case "chaosWarn":
          audio.play("alarm");
          this.onBanner?.("⚠️ CHAOS IMMINENT !", `${e.emoji} ${e.label}`);
          break;
        case "chaosStart": {
          const def = CHAOS_EVENTS.find((d) => d.id === e.id);
          if (def && def.countdown > 0) {
            audio.play("explode", 1);
            haptics.explosionNear();
          } else {
            audio.play("levelup");
            this.onBanner?.(e.via ? "🎲 ÉVÉNEMENT ALÉATOIRE" : "💀 CHAOS", `${e.emoji} ${e.label} !`);
          }
          break;
        }
        case "ventWarn":
          audio.play("rumble", near(e.x + 0.5, e.y + 0.5));
          break;
        case "eruption":
          audio.play("eruption", near(e.x + 0.5, e.y + 0.5));
          if (me.alive && Math.hypot(e.x + 0.5 - me.x, e.y + 0.5 - me.y) < 3) haptics.explosionNear();
          break;
      }
    }
    if (explodeVol > 0) audio.play("explode", explodeVol);
  }

  // ------------------------------------------------------------ emotes
  /** Envoi d'une emote réseau (fourni par l'application en ligne). */
  sendEmote: ((id: string) => void) | null = null;
  private lastEmoteAt = 0;

  /** Le joueur local lance une emote. */
  emote(id: string): boolean {
    const s = this.session;
    if (!s || this.demo || this.finished) return false;
    const me = s.match.players[s.localPlayer];
    if (!me?.alive) return false;
    const now = performance.now();
    if (now - this.lastEmoteAt < 1000) return false;
    this.lastEmoteAt = now;
    this.renderer.showEmote(me.id, id);
    if (this.online) this.sendEmote?.(id);
    audio.play("click", 0.6);
    return true;
  }

  /** Emote reçue du serveur. */
  remoteEmote(player: number, id: string) {
    const s = this.session;
    if (!s || player === s.localPlayer) return;
    if (s.match.players[player]?.alive) this.renderer.showEmote(player, id);
  }

  /** Les bots ont un peu de caractère. */
  private botEmotes(events: SimEvent[]) {
    const m = this.session!.match;
    const say = (id: number, list: string[], chance: number) => {
      const p = m.players[id];
      if (p?.isBot && p.alive && Math.random() < chance) {
        const e = EMOTES.find((x) => x.id === pick(list));
        if (e) window.setTimeout(() => p.alive && this.renderer.showEmote(id, e.id), 250 + Math.random() * 400);
      }
    };
    for (const e of events) {
      if (e.t === "playerDied" && e.killer >= 0 && e.killer !== e.player) say(e.killer, ["emo-lol", "emo-cool", "emo-gg", "emo-fire", "emo-tongue", "emo-missed", "emo-clown", "emo-snail"], 0.5);
      if (e.t === "matchEnd" && e.winner >= 0) say(e.winner, ["emo-party", "emo-crown", "emo-cool", "emo-dance", "emo-yawn"], 0.9);
      if (e.t === "shieldBlocked") say(e.player, ["emo-angry", "emo-ghost", "emo-chicken", "emo-tongue"], 0.45);
    }
  }

  // ---------------------------------------------------------------- HUD
  hudState() {
    const s = this.session;
    if (!s || this.demo) return null;
    const m = s.match;
    const me = m.players[s.localPlayer];
    const tl = m.phase === "countdown" ? RULES.matchDuration : m.timeLeft;
    const mm = Math.floor(tl / 60);
    const ss = Math.floor(tl % 60);
    return {
      timer: `${mm}:${String(ss).padStart(2, "0")}`,
      hot: m.suddenDeath,
      chaos: m.config.modeId === "chaos",
      players: m.players.map((p) => ({ color: lookOf(p.characterId, p.skinId).palette.main, alive: p.alive, me: p.id === me.id, name: p.name })),
      powers: [
        { type: "bomb", color: BONUS_COLORS.bomb[0], label: "bombes", value: me.maxBombs },
        { type: "flame", color: BONUS_COLORS.flame[0], label: "portée", value: me.range },
        { type: "speed", color: BONUS_COLORS.speed[0], label: "vitesse", value: me.speedLevel + 1 },
      ],
    };
  }

  get size() {
    return { w: this.viewW, h: this.viewH };
  }
}
