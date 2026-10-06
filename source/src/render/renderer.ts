import type { Match } from "../core/match";
import { drawCharacter, headTopOffset, lookOf, type Expr } from "./bodies";
import { abilityBurst, emitAura, emitTrail, speedLines } from "./charfx";
import { getEmote } from "../core/cosmetics";
import { EMOTE_DURATION, drawEmoteBubble } from "./emote";
import { RULES } from "../core/rules";
import { TERRAIN, TILE, type SimEvent } from "../core/types";
import { Particles } from "./particles";
import {
  BONUS_COLORS,
  LIFT,
  drawBomb,
  drawBonus,
  drawFire,
  drawShield,
} from "./sprites";
import { getArt, type Art } from "./art";
import { CHAOS_EVENTS } from "../core/chaos";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BONUS_TEXT: Record<string, string> = {
  bomb: "+1 BOMBE",
  flame: "+1 PORTÉE",
  speed: "VITESSE !",
  shield: "BOUCLIER",
};

interface Dying {
  id: number;
  x: number;
  y: number;
  t: number;
}

/** État d'animation propre à l'affichage (jamais lu par la simulation). */
interface PlayerFx {
  aura: { a: number };
  trail: { t: number; step: number };
  actionAt: number;
  hurtAt: number;
  happyAt: number;
  emote: { id: string; at: number; burst?: boolean } | null;
}

/**
 * Rendu Canvas 2D de la partie. Lit l'état de la simulation sans jamais
 * le modifier ; les effets visuels sont pilotés par les événements.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly particles = new Particles();
  private art: Art = getArt("forest");
  private dpr = 1;
  private viewW = 0;
  private viewH = 0;
  /** taille d'une case en pixels CSS */
  s = 32;
  ox = 0;
  oy = 0;
  private gw = 13;
  private gh = 11;
  private ground: HTMLCanvasElement | null = null;
  private groundKey = "";
  private time = 0;
  private shake = 0;
  private flash = 0;
  private bombBorn = new Map<number, number>();
  private dying: Dying[] = [];
  private breaking: { x: number; y: number; t: number }[] = [];
  private landed = new Map<number, number>();
  private boomAt = -10;
  private pfx = new Map<number, PlayerFx>();
  private ambientAcc = 0;
  localPlayer = -1;
  reducedMotion = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
  }

  reset(m: Match) {
    this.art = getArt(m.config.map.theme);
    this.particles.clear();
    this.bombBorn.clear();
    this.dying = [];
    this.breaking = [];
    this.landed.clear();
    this.pfx.clear();
    this.shake = 0;
    this.flash = 0;
    this.groundKey = "";
  }

  resize(w: number, h: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewW = w;
    this.viewH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.groundKey = "";
  }

  /**
   * Place l'arène au mieux dans le rectangle donné (zoom automatique).
   * `crop` : fraction de la haie de bordure autorisée hors cadre, pour
   * agrandir les cases sur petit écran. `top` : colle l'arène en haut.
   */
  fit(m: Match, area: Rect, crop = 0.4, top = false) {
    const { w, h } = m.grid;
    this.gw = w;
    this.gh = h;
    const cols = w - crop * 2;
    const rows = h - crop * 2 + LIFT;
    const s = Math.max(12, Math.floor(Math.min(area.w / cols, area.h / rows)));
    this.s = s;
    this.ox = Math.round(area.x + (area.w - w * s) / 2);
    const used = rows * s;
    const y0 = top ? area.y : area.y + (area.h - used) / 2;
    this.oy = Math.round(y0 - crop * s + LIFT * s);
  }

  // ------------------------------------------------------------ événements
  onEvents(m: Match, events: SimEvent[]) {
    const P = this.particles;
    for (const e of events) {
      switch (e.t) {
        case "bombPlaced": {
          for (const b of m.bombs.values()) if (!this.bombBorn.has(b.id)) this.bombBorn.set(b.id, this.time);
          const o = m.players[e.owner];
          if (o) {
            this.fx(o.id).actionAt = this.time;
            abilityBurst(P, o.trailId, e.x + 0.5, e.y + 0.5);
          }
          break;
        }
        case "explode":
          P.explosion(e.x + 0.5, e.y + 0.5);
          this.shake = Math.min(1, this.shake + 0.35 + e.cells * 0.02);
          this.flash = Math.min(0.5, this.flash + 0.18);
          break;
        case "blockDestroyed": {
          this.breaking.push({ x: e.x, y: e.y, t: 0 });
          P.blockBreak(e.x + 0.5, e.y + 0.5, this.art.debris(e.x, e.y));
          break;
        }
        case "bonusPicked": {
          const col = BONUS_COLORS[e.type]?.[0] ?? "#fff";
          P.pickup(e.x + 0.5, e.y + 0.5, col);
          const p = m.players[e.player];
          P.text(p.x, p.y - 0.9, BONUS_TEXT[e.type] ?? e.type, col);
          this.fx(p.id).happyAt = this.time;
          break;
        }
        case "bonusBurned":
          P.dust(e.x + 0.5, e.y + 0.5);
          break;
        case "playerDied": {
          this.dying.push({ id: e.player, x: e.x, y: e.y, t: 0 });
          { const dp = m.players[e.player]; P.death(e.x, e.y, lookOf(dp.characterId, dp.skinId).palette.main); }
          if (e.player === this.localPlayer) this.shake = 1;
          if (e.killer >= 0 && e.killer !== e.player) this.fx(e.killer).happyAt = this.time + 0.6;
          this.fx(e.player).emote = null;
          break;
        }
        case "shieldBlocked": {
          const p = m.players[e.player];
          P.spawn("ring", p.x, p.y, { life: 0.35, size: 0.4, color: "#9ae8ff" });
          this.fx(p.id).hurtAt = this.time;
          break;
        }
        case "shieldOn": {
          const p = m.players[e.player];
          for (let k = 0; k < 10; k++) P.spawn("twinkle", p.x + (Math.random() - 0.5) * 0.9, p.y + (Math.random() - 0.5) * 0.5, { z: 0.2 + Math.random() * 0.8, vz: 0.5, life: 0.6, size: 0.09, color: "#bdf2ff" });
          P.spawn("ring", p.x, p.y, { life: 0.4, size: 0.2, color: "#9ae8ff" });
          this.fx(p.id).actionAt = this.time;
          break;
        }
        case "chaosStart":
          if (CHAOS_EVENTS.find((d) => d.id === e.id)?.countdown) {
            this.boomAt = this.time;
            this.shake = 1;
            this.flash = 0.5;
          }
          break;
        case "eruption":
          P.explosion(e.x + 0.5, e.y + 0.5);
          for (let k = 0; k < 10; k++)
            P.spawn("spark", e.x + 0.5, e.y + 0.5, { vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: 5 + Math.random() * 4, life: 0.8, size: 0.09, color: Math.random() < 0.5 ? "#ffcf4a" : "#ff5a1f" });
          this.shake = Math.min(1, this.shake + 0.4);
          this.flash = Math.min(0.5, this.flash + 0.12);
          break;
        case "wallDrop":
          this.landed.set(m.grid.idx(e.x, e.y), this.time);
          P.dust(e.x + 0.5, e.y + 0.5);
          this.shake = Math.min(1, this.shake + 0.15);
          break;
      }
    }
  }

  private fx(id: number): PlayerFx {
    let f = this.pfx.get(id);
    if (!f) {
      f = { aura: { a: Math.random() }, trail: { t: 0, step: 0 }, actionAt: -10, hurtAt: -10, happyAt: -10, emote: null };
      this.pfx.set(id, f);
    }
    return f;
  }

  /** Affiche une emote au-dessus d'un joueur. */
  showEmote(playerId: number, emoteId: string) {
    const def = getEmote(emoteId);
    if (!def) return;
    this.fx(playerId).emote = { id: emoteId, at: this.time };
  }

  /** Particules d'ambiance propres à chaque carte. */
  private ambient(m: Match, dt: number) {
    if (this.reducedMotion || dt <= 0) return;
    const { w, h } = m.grid;
    this.ambientAcc += dt * 5;
    const P = this.particles;
    const theme = m.config.map.theme;
    while (this.ambientAcc >= 1) {
      this.ambientAcc -= 1;
      const x = 1 + Math.random() * (w - 2);
      const y = 1 + Math.random() * (h - 2);
      switch (theme) {
        case "volcano":
          if (Math.random() < 0.6) P.spawn("ember", x, y, { z: 0.1, vz: 0.5 + Math.random() * 0.6, vx: 0.15, life: 1.6, size: 0.035, color: Math.random() < 0.5 ? "#ff8a2a" : "#ffcf4a" });
          else P.spawn("flake", x, y, { z: 1.4, vz: -0.3, vx: 0.2, life: 3, size: 0.04, color: "#8a7d76", vr: 1 });
          break;
        case "ice":
          P.spawn("flake", x, y, { z: 1.6, vz: -0.45, vx: 0.15, life: 3.2, size: 0.05 + Math.random() * 0.03, color: "#ffffff", vr: 1.5 });
          break;
        case "beach":
          if (Math.random() < 0.5) P.spawn("twinkle", x, y, { z: 0.05, life: 0.9, size: 0.07, color: "#fff8d6" });
          else if (Math.random() < 0.3) P.spawn("petal", x, y, { z: 1.4, vz: -0.25, vx: 0.4, life: 3, size: 0.05, color: "#ffe1a8", vr: 3 });
          break;
        default:
          // forêt : lucioles et feuilles qui tombent
          if (Math.random() < 0.55) P.spawn("glow", x, y, { z: 0.3 + Math.random() * 0.8, vz: 0.08, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.3, life: 2.4, size: 0.05, color: "#d9ff7a" });
          else if (Math.random() < 0.4) P.spawn("petal", x, y, { z: 1.6, vz: -0.35, vx: 0.25, life: 3.5, size: 0.065, color: Math.random() < 0.5 ? "#9bd35d" : "#e3b448", vr: 3 });
      }
    }
  }

  /** Une bombe va bientôt sauter tout près : petite tête inquiète. */
  private inDanger(m: Match, x: number, y: number): boolean {
    for (const b of m.bombs.values()) {
      if (b.fuse > 1.1) continue;
      const dx = Math.abs(b.tx + 0.5 - x);
      const dy = Math.abs(b.ty + 0.5 - y);
      if ((dx < 0.6 && dy <= b.range + 0.5) || (dy < 0.6 && dx <= b.range + 0.5)) return true;
    }
    return false;
  }

  /** Lumière d'ambiance (rayons de soleil, vignette) par-dessus l'arène. */
  private drawLight(theme: string) {
    const ctx = this.ctx;
    const W = this.viewW;
    const H = this.viewH;
    const t = this.time;
    if (theme === "forest" || theme === "beach") {
      // deux rayons de soleil très légers qui glissent lentement
      for (let i = 0; i < 2; i++) {
        const x = ((i * 0.5 + t * 0.012) % 1.3) * W - W * 0.15;
        const a = 0.045 + 0.02 * Math.sin(t * 0.6 + i * 2);
        ctx.fillStyle = theme === "beach" ? `rgba(255,240,200,${a})` : `rgba(255,250,200,${a})`;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + W * 0.1, 0);
        ctx.lineTo(x + W * 0.32, H);
        ctx.lineTo(x + W * 0.18, H);
        ctx.closePath();
        ctx.fill();
      }
    } else if (theme === "volcano") {
      const a = 0.06 + 0.03 * Math.sin(t * 1.3);
      const g = ctx.createLinearGradient(0, H, 0, H * 0.4);
      g.addColorStop(0, `rgba(255,90,20,${a})`);
      g.addColorStop(1, "rgba(255,90,20,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else if (theme === "ice") {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.5);
      g.addColorStop(0, "rgba(200,235,255,0.07)");
      g.addColorStop(1, "rgba(200,235,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ------------------------------------------------------------------ sol
  /** Bornes (en cases) de la zone de forêt couvrant tout l'écran. */
  private groundX0 = -1;
  private groundY0 = -1;
  private groundCols = 0;
  private groundRows = 0;

  private bakeGround(m: Match) {
    const key = `${this.s}|${this.dpr}|${m.config.seed}|${this.ox}|${this.oy}|${this.viewW}|${this.viewH}`;
    if (key === this.groundKey && this.ground) return;
    this.groundKey = key;
    const { w, h } = m.grid;
    const s = this.s;
    // la forêt déborde de l'arène jusqu'aux bords de l'écran (+1 case pour le tremblement)
    const x0 = Math.min(-1, Math.floor(-this.ox / s) - 1);
    const y0 = Math.min(-1, Math.floor(-this.oy / s) - 1);
    const x1 = Math.max(w, Math.ceil((this.viewW - this.ox) / s) + 1);
    const y1 = Math.max(h, Math.ceil((this.viewH - this.oy) / s) + 1);
    this.groundX0 = x0;
    this.groundY0 = y0;
    this.groundCols = x1 - x0 + 1;
    this.groundRows = y1 - y0 + 1;
    const c = document.createElement("canvas");
    c.width = Math.ceil(this.groundCols * s * this.dpr);
    c.height = Math.ceil(this.groundRows * s * this.dpr);
    const g = c.getContext("2d")!;
    g.scale(this.dpr, this.dpr);
    g.translate(-x0 * s, -y0 * s);
    const art = this.art;
    const g0 = m.grid;
    // fond
    g.fillStyle = art.background;
    g.fillRect(x0 * s, y0 * s, this.groundCols * s, this.groundRows * s);
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        art.floor(g, x * s, y * s, s, x, y);
        const k = g0.terrainAt(x, y);
        if (k !== TERRAIN.NONE) art.terrain(g, k, x * s, y * s, s, x, y);
      }
    // ombre intérieure le long de la bordure
    const grad = (gx0: number, gy0: number, gx1: number, gy1: number) => {
      const gr = g.createLinearGradient(gx0, gy0, gx1, gy1);
      gr.addColorStop(0, "rgba(0,0,0,0.25)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      return gr;
    };
    g.fillStyle = grad(0, s, 0, s * 1.5);
    g.fillRect(s, s, (w - 2) * s, s * 0.5);
    g.fillStyle = grad(s, 0, s * 1.4, 0);
    g.fillRect(s, s, s * 0.4, (h - 2) * s);
    // décor lointain (hors arène), assombri
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const outside = x < 0 || y < 0 || x > w - 1 || y > h - 1;
        if (outside) art.border(g, x * s, y * s, s, x, y, false);
      }
    // voile : l'œil reste sur l'arène, les commandes restent lisibles
    g.save();
    g.beginPath();
    g.rect(x0 * s, y0 * s, this.groundCols * s, this.groundRows * s);
    g.roundRect(-s * 0.2, -s * 0.2, (w + 0.4) * s, (h + 0.4) * s, s * 0.6);
    g.fillStyle = art.farVeil;
    g.fill("evenodd");
    g.restore();
    // bordure de l'arène, en pleine lumière
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        if (border) art.border(g, x * s, y * s, s, x, y, true);
      }
    this.ground = c;
  }

  // ------------------------------------------------------------------ draw
  draw(m: Match, dt: number, prev: Float32Array | null, alpha: number) {
    this.time += dt;
    const ctx = this.ctx;
    const s = this.s;
    const art = this.art;
    const { w, h } = m.grid;
    const t = this.time;
    this.particles.update(dt);
    for (const d of this.dying) d.t += dt;
    this.dying = this.dying.filter((d) => d.t < 1.4);
    for (const b of this.breaking) b.t += dt;
    this.breaking = this.breaking.filter((b) => b.t < 0.35);

    this.bakeGround(m);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = art.background;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // tremblement de caméra
    this.shake = Math.max(0, this.shake - dt * 2.8);
    const amp = this.reducedMotion ? 0 : this.shake * this.shake * s * 0.22;
    const sx = (Math.random() - 0.5) * 2 * amp;
    const sy = (Math.random() - 0.5) * 2 * amp;
    const ox = this.ox + sx;
    const oy = this.oy + sy;
    ctx.save();
    ctx.translate(ox, oy);

    if (this.ground)
      ctx.drawImage(this.ground, this.groundX0 * s, this.groundY0 * s, this.groundCols * s, this.groundRows * s);

    // sols animés (lave, eau, glace, cheminées)
    if (art.animate) {
      const gr = m.grid;
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const k = gr.terrainAt(x, y);
          if (k === TERRAIN.NONE || gr.tiles[gr.idx(x, y)] === TILE.WALL) continue;
          let warn = 0;
          if (k === TERRAIN.VENT) {
            const v = m.vents.find((vv) => vv[0] === x && vv[1] === y);
            if (v && m.phase === "playing" && m.ventTimeLeft(v) <= RULES.ventWarn) warn = 1;
          }
          art.animate(ctx, k, x * s, y * s, s, x, y, t, warn);
        }
    }

    // traces au sol (brûlures, empreintes)
    this.particles.drawMarks(ctx, s);
    this.ambient(m, dt);

    const ch = m.chaos;
    // Speed chaos : traînées de poussière derrière les joueurs qui courent
    if (m.speedMul > 1 && Math.random() < 0.6) {
      for (const p of m.players) if (p.alive && p.moving) this.particles.spawn("smoke", p.x - p.faceX * 0.3, p.y + 0.25 - p.faceY * 0.3, { life: 0.35, size: 0.12, color: "#ffffff" });
    }

    // avertissements de mort subite
    for (const [x, y, left] of m.pendingDrops) {
      const k = 1 - left / RULES.suddenDeathWarn;
      ctx.fillStyle = `rgba(255,40,40,${0.18 + 0.25 * Math.abs(Math.sin(t * 14))})`;
      ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(x * s + s / 2, y * s + s * 0.6, s * 0.45 * k, s * 0.3 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // index des joueurs par rangée (position interpolée)
    const px = (i: number) => (prev ? prev[i * 2] + (m.players[i].x - prev[i * 2]) * alpha : m.players[i].x);
    const py = (i: number) => (prev ? prev[i * 2 + 1] + (m.players[i].y - prev[i * 2 + 1]) * alpha : m.players[i].y);
    const rows: number[][] = Array.from({ length: h }, () => []);
    for (const p of m.players) if (p.alive) rows[Math.min(h - 1, Math.max(0, Math.floor(py(p.id))))].push(p.id);
    // auras, traînées et lignes de vitesse
    if (dt > 0)
      for (const p of m.players) {
        if (!p.alive) continue;
        const f = this.fx(p.id);
        const x = px(p.id);
        const y = py(p.id);
        const look = lookOf(p.characterId, p.skinId, p.accessoryId);
        emitAura(this.particles, look.aura, x, y - 0.25, look.palette, dt, f.aura, this.reducedMotion ? 0.3 : 1);
        if (p.moving) {
          const fast = p.speedLevel >= 2 || m.speedMul > 1;
          emitTrail(this.particles, p.trailId, x, y, p.faceX, p.faceY, dt, f.trail, fast);
          if (fast) speedLines(this.particles, x, y, p.faceX, p.faceY);
        }
      }

    const g = m.grid;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = g.idx(x, y);
        const tile = g.tiles[i];
        const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        const X = x * s;
        const Y = y * s;
        if (tile === TILE.WALL && !border) {
          const landedAt = this.landed.get(i);
          if (landedAt !== undefined && t - landedAt < 0.2) {
            const k = (t - landedAt) / 0.2;
            ctx.save();
            ctx.translate(X + s / 2, Y + s);
            ctx.scale(1 + (1 - k) * 0.15, 1 - (1 - k) * 0.2);
            art.pillar(ctx, -s / 2, -s, s, x, y);
            ctx.restore();
          } else art.pillar(ctx, X, Y, s, x, y);
        } else if (tile === TILE.BLOCK) {
          art.block(ctx, X, Y, s, x, y);
        }
        const bonusId = g.bonusAt[i];
        if (bonusId >= 0) {
          const b = m.bonuses.get(bonusId);
          if (b) drawBonus(ctx, X + s / 2, Y + s / 2, s, b.type, t, b.age);
        }
        const bombId = g.bombAt[i];
        if (bombId >= 0) {
          const b = m.bombs.get(bombId);
          if (b) {
            if (!this.bombBorn.has(b.id)) this.bombBorn.set(b.id, t);
            drawBomb(ctx, X + s / 2, Y + s / 2, s, b.fuse / b.fuseTotal, t, t - this.bombBorn.get(b.id)!);
          }
        }
      }
      // blocs en train d'éclater
      for (const b of this.breaking) {
        if (b.y !== y) continue;
        const k = b.t / 0.35;
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.translate(b.x * s + s / 2, b.y * s + s / 2);
        ctx.scale(1 + k * 0.4, 1 - k * 0.6);
        art.block(ctx, -s / 2, -s / 2, s, b.x, b.y);
        ctx.restore();
      }
      // joueurs de la rangée, triés en profondeur
      rows[y].sort((a, b) => py(a) - py(b));
      for (const id of rows[y]) this.drawPlayer(m, id, px(id), py(id));
      for (const d of this.dying) if (Math.floor(d.y) === y) this.drawDying(m, d);
    }

    // mode Chaos : zones annoncées (rayures rouges qui pulsent)
    if (ch?.pending) {
      const urgency = 1 - ch.pendingLeft / Math.max(0.1, ch.pending.def.countdown);
      const pulse = 0.45 + 0.4 * Math.abs(Math.sin(t * (6 + urgency * 14)));
      for (const i of ch.pending.zone) {
        const X = (i % w) * s;
        const Y = Math.floor(i / w) * s;
        ctx.save();
        ctx.beginPath();
        ctx.rect(X + 1, Y + 1, s - 2, s - 2);
        ctx.clip();
        ctx.fillStyle = `rgba(255,40,40,${pulse * 0.55})`;
        ctx.fillRect(X, Y, s, s);
        ctx.strokeStyle = `rgba(255,60,60,${pulse})`;
        ctx.lineWidth = Math.max(2, s * 0.06);
        ctx.strokeRect(X + 2, Y + 2, s - 4, s - 4);
        ctx.strokeStyle = `rgba(255,220,220,${pulse})`;
        ctx.lineWidth = s * 0.08;
        for (let k = -1; k < 3; k++) {
          ctx.beginPath();
          ctx.moveTo(X + k * s * 0.5 - ((t * s) % (s * 0.5)), Y + s);
          ctx.lineTo(X + k * s * 0.5 + s - ((t * s) % (s * 0.5)), Y);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // murs de mort subite en chute
    for (const [x, y, left] of m.pendingDrops) {
      const k = left / RULES.suddenDeathWarn;
      const fall = k * k * s * 4;
      art.pillar(ctx, x * s, y * s - fall, s, x, y);
    }

    // feu (3 couches pour des flammes bien lisibles)
    for (const layer of [0, 1, 2] as const) {
      for (let i = 0; i < g.fire.length; i++) {
        const f = g.fire[i];
        if (f <= 0) continue;
        const x = i % w;
        const y = Math.floor(i / w);
        drawFire(ctx, x * s, y * s, s, g.fireShape[i], f / RULES.fireDuration, t, layer);
      }
    }

    this.particles.draw(ctx, 0, 0, s);
    for (const p of m.players) if (p.alive) this.drawEmote(p.id, px(p.id), py(p.id), headTopOffset(lookOf(p.characterId).kind));

    // repère « TOI » en début de partie
    const me = m.players[this.localPlayer];
    if (me && me.alive && m.time < 3) {
      const a = m.phase === "countdown" ? 1 : Math.max(0, 1 - m.time / 3);
      const x = px(me.id) * s;
      // repère au-dessus du perso, ou en dessous s'il sortirait de l'écran
      const above = oy + py(me.id) * s - s * 1.6 > 0;
      const y = above
        ? py(me.id) * s - s * 1.05 + Math.sin(t * 6) * s * 0.06
        : py(me.id) * s + s * 0.95 + Math.sin(t * 6) * s * 0.06;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      const dir = above ? 1 : -1;
      ctx.moveTo(x - s * 0.16, y - s * 0.1 * dir);
      ctx.lineTo(x + s * 0.16, y - s * 0.1 * dir);
      ctx.lineTo(x, y + s * 0.12 * dir);
      ctx.closePath();
      ctx.fill();
      ctx.font = `800 ${Math.round(s * 0.36)}px "Baloo 2", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = Math.max(2, s * 0.1);
      ctx.strokeStyle = "#1a1626";
      const ty = above ? y - s * 0.35 : y + s * 0.38;
      ctx.strokeText("TOI", x, ty);
      ctx.fillText("TOI", x, ty);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
    this.drawLight(m.config.map.theme);

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,236,190,${this.flash * (this.reducedMotion ? 0.3 : 1)})`;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }

    // Chaos : bord de l'écran rouge, compte à rebours, puis BOOM
    if (ch?.pending) {
      const a = 0.25 + 0.2 * Math.sin(t * 10);
      const gr = ctx.createRadialGradient(this.viewW / 2, this.viewH / 2, Math.min(this.viewW, this.viewH) * 0.35, this.viewW / 2, this.viewH / 2, Math.max(this.viewW, this.viewH) * 0.7);
      gr.addColorStop(0, "rgba(255,0,0,0)");
      gr.addColorStop(1, `rgba(255,30,30,${a})`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      if (ch.pending.def.countdown > 0) {
        const n = Math.max(1, Math.ceil(ch.pendingLeft));
        const frac = ch.pendingLeft - Math.floor(ch.pendingLeft);
        this.bigText(String(n), 0.8 + frac * 0.5, Math.min(1, frac * 3 + 0.3), "#ff5a4f");
      }
    } else if (this.time - this.boomAt < 0.8) {
      const k = (this.time - this.boomAt) / 0.8;
      this.bigText("BOOM !", 1 + k * 0.5, 1 - k, "#ff9a3d");
    }

    // compte à rebours
    if (m.phase === "countdown") {
      const n = Math.ceil(m.countdown);
      const frac = m.countdown - Math.floor(m.countdown);
      this.bigText(n > 0 ? String(n) : "GO !", 1 + frac * 0.35, Math.min(1, frac * 3 + 0.2));
    } else if (m.time < 0.7) {
      this.bigText("GO !", 1 + m.time * 0.6, 1 - m.time / 0.7);
    }
  }

  private bigText(text: string, scale: number, alpha: number, color = "#ffd23f") {
    const ctx = this.ctx;
    const cx = this.ox + (this.s * this.gw) / 2;
    const cy = this.oy + (this.s * this.gh) / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.font = `${Math.round(this.s * 2)}px "Dela Gothic One", "Arial Black", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = this.s * 0.35;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1626";
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  private drawPlayer(m: Match, id: number, x: number, y: number) {
    const p = m.players[id];
    const s = this.s;
    const ctx = this.ctx;
    const c = lookOf(p.characterId, p.skinId, p.accessoryId);
    const cx = x * s;
    const cy = y * s;
    const f = this.fx(id);
    const t = this.time;
    const hurt = t - f.hurtAt < 0.45 ? (t - f.hurtAt) / 0.45 : undefined;
    const action = t - f.actionAt < 0.35 ? (t - f.actionAt) / 0.35 : undefined;
    const won = (m.phase === "over" || m.phase === "ending") && m.winnerId === id;
    let expr: Expr = "normal";
    if (hurt !== undefined) expr = "scared";
    else if (won || (t - f.happyAt < 0.8 && t >= f.happyAt)) expr = "happy";
    else if (this.inDanger(m, p.x, p.y)) expr = "scared";
    else if (f.emote && getEmote(f.emote.id)?.emoji === "😡" && t - f.emote.at < 2) expr = "angry";
    // anneau de couleur au sol : chaque joueur se repère d'un coup d'œil
    ctx.lineWidth = Math.max(1.5, s * (id === this.localPlayer ? 0.065 : 0.045));
    ctx.strokeStyle = id === this.localPlayer ? "rgba(255,255,255,0.9)" : c.palette.main;
    ctx.globalAlpha = id === this.localPlayer ? 1 : 0.7;
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.32, s * 0.34, s * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawCharacter(ctx, cx, cy, s, c, {
      faceX: p.faceX,
      faceY: p.faceY,
      walk: p.walkPhase,
      moving: p.moving,
      t: t + id * 1.7,
      action,
      hurt,
      expr,
      celebrate: won,
    }, this.art.ink);
    if (p.shieldTime > 0) drawShield(ctx, cx, cy - s * 0.12, s, t, p.shieldTime);
  }

  private drawEmote(id: number, x: number, y: number, head: number) {
    const f = this.pfx.get(id);
    if (!f?.emote) return;
    const def = getEmote(f.emote.id);
    const age = this.time - f.emote.at;
    if (!def || age > EMOTE_DURATION) {
      f.emote = null;
      return;
    }
    if (def.anim === "party" && !f.emote.burst) {
      f.emote.burst = true;
      this.particles.confetti(x, y - head - 0.4, 26);
    }
    // bulle au-dessus de la tête, ou sur le côté si elle sortirait de l'écran
    let bx = x * this.s;
    let by = (y - head - 0.62) * this.s;
    if (this.oy + by - this.s * 0.45 < 0) {
      bx += this.s * 0.95;
      by = (y - 0.55) * this.s;
    }
    drawEmoteBubble(this.ctx, bx, by, this.s, def, age);
  }

  private drawDying(m: Match, d: Dying) {
    const p = m.players[d.id];
    const c = lookOf(p.characterId, p.skinId, p.accessoryId);
    const s = this.s;
    const ctx = this.ctx;
    const cx = d.x * s;
    const cy = d.y * s;
    if (d.t < 0.45) {
      const k = d.t / 0.45;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(k * Math.PI * 3);
      ctx.scale(1 - k * 0.7, 1 - k * 0.7);
      ctx.globalAlpha = 1 - k * 0.3;
      drawCharacter(ctx, 0, 0, s, c, { faceX: 0, faceY: 1, walk: 0, moving: false, t: this.time, squash: 1, expr: "dizzy", hurt: Math.floor(d.t * 20) % 2 === 0 ? 0 : 0.9 }, this.art.ink);
      ctx.restore();
    } else {
      // petit fantôme qui s'envole
      const k = (d.t - 0.45) / 0.95;
      const gy = cy - k * s * 1.4;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.fillStyle = c.palette.light;
      ctx.beginPath();
      ctx.arc(cx, gy - s * 0.1, s * 0.22, Math.PI, 0);
      ctx.lineTo(cx + s * 0.22, gy + s * 0.15);
      for (let i = 0; i < 4; i++) {
        const xx = cx + s * 0.22 - (i + 0.5) * s * 0.11;
        ctx.lineTo(xx, gy + s * (i % 2 ? 0.15 : 0.08) + Math.sin(this.time * 10 + i) * s * 0.02);
      }
      ctx.lineTo(cx - s * 0.22, gy + s * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = this.art.ink;
      ctx.beginPath();
      ctx.arc(cx - s * 0.07, gy - s * 0.1, s * 0.03, 0, Math.PI * 2);
      ctx.arc(cx + s * 0.07, gy - s * 0.1, s * 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
