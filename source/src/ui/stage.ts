/**
 * « Scène » des menus : un personnage en grand sur un piédestal, avec son
 * aura, sa traînée, ses réactions et ses emotes. Utilisée par l'accueil,
 * l'écran Personnage, la boutique, la collection et les résultats.
 */
import type { Rarity } from "../core/characters";
import { getEmote, getTrail, type EmoteDef } from "../core/cosmetics";
import { drawCharacter, headTopOffset, lookOf, type CharPose, type Expr } from "../render/bodies";
import { abilityBurst, emitAura, emitTrail } from "../render/charfx";
import { EMOTE_DURATION, drawEmoteBubble } from "../render/emote";
import { Particles } from "../render/particles";

export interface StageLook {
  characterId: string;
  skinId?: string;
  accessoryId?: string | null;
  trailId?: string;
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#9fb3c8",
  rare: "#3fa2ff",
  epic: "#b05cff",
  legend: "#ffc83d",
};

type Mode = "idle" | "run" | "win" | "sad";

export class Stage {
  private P = new Particles();
  private raf = 0;
  private t = Math.random() * 10;
  private last = 0;
  private look: StageLook = { characterId: "renard" };
  private rarity: Rarity | null = null;
  private mode: Mode = "idle";
  private emote: { def: EmoteDef; at: number; loop: boolean } | null = null;
  private actAt = -10;
  private act: "wave" | "hop" | "spin" | null = null;
  private nextAct = 3;
  private face = 0;
  private flashAt = -10;
  private auraAcc = { a: 0 };
  private trailAcc = { t: 0, step: 0 };
  /** emotes que le personnage peut lancer tout seul (accueil) */
  idleEmotes: string[] = [];

  constructor(
    readonly canvas: HTMLCanvasElement,
    private opts: { pedestal?: boolean; scale?: number; y?: number; spotlight?: boolean } = {},
  ) {
    canvas.addEventListener("pointerdown", () => this.poke());
  }

  set(look: StageLook, rarity: Rarity | null = null) {
    const changed = look.characterId !== this.look.characterId || look.skinId !== this.look.skinId || look.accessoryId !== this.look.accessoryId || look.trailId !== this.look.trailId;
    this.look = { ...look };
    this.rarity = rarity;
    if (changed) this.P.clear();
    this.start();
  }

  setMode(m: Mode) {
    this.mode = m;
    this.start();
  }

  /** Affiche une emote (en boucle pour l'aperçu en boutique). */
  showEmote(id: string | null, loop = false) {
    const def = getEmote(id);
    this.emote = def ? { def, at: this.t, loop } : null;
    if (def?.anim === "party") this.P.confetti(0, -1.2, 30);
  }

  /** Petit feu d'artifice (équipement d'un objet). */
  flash() {
    this.flashAt = this.t;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      this.P.spawn("twinkle", Math.cos(a) * 0.55, -0.2 + Math.sin(a) * 0.45, { z: 0.2, vz: 0.6, vx: Math.cos(a) * 0.8, vy: Math.sin(a) * 0.5, life: 0.8, size: 0.09, color: i % 2 ? "#ffffff" : RARITY_COLOR[this.rarity ?? "rare"] });
    }
    this.P.spawn("ring", 0, 0.1, { life: 0.5, size: 0.3, color: "#ffffff" });
    abilityBurst(this.P, this.look.trailId, 0, 0);
    this.act = "hop";
    this.actAt = this.t;
  }

  /** Toucher le personnage : il réagit. */
  poke() {
    const r = Math.random();
    this.act = r < 0.4 ? "hop" : r < 0.75 ? "wave" : "spin";
    this.actAt = this.t;
    if (this.idleEmotes.length && Math.random() < 0.5) this.showEmote(this.idleEmotes[Math.floor(Math.random() * this.idleEmotes.length)]);
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private visible(): boolean {
    return !!this.canvas.offsetParent && this.canvas.clientWidth > 0 && !document.hidden;
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (!this.visible()) return; // relancé par start() au prochain affichage
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    this.draw(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Rendu d'une image (exposé pour les vignettes et les tests). */
  draw(dt: number) {
    const cv = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const s = Math.min(W * 0.7, H * 0.52) * (this.opts.scale ?? 1);
    const cx = W / 2;
    const cy = H * (this.opts.y ?? 0.56);
    const t = this.t;
    const look = lookOf(this.look.characterId, this.look.skinId, this.look.accessoryId);
    const rc = this.rarity ? RARITY_COLOR[this.rarity] : "#ffffff";

    // projecteur
    if (this.opts.spotlight !== false) {
      const R = Math.min(W / 2, cy, H - cy) * 0.98;
      const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
      g.addColorStop(0, this.rarity ? hexA(rc, 0.32) : "rgba(255,255,255,0.18)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (this.rarity === "legend" || this.rarity === "epic") {
        // rayons qui tournent derrière les objets rares
        ctx.save();
        ctx.translate(cx, cy - s * 0.15);
        ctx.rotate(t * 0.25);
        ctx.fillStyle = hexA(rc, this.rarity === "legend" ? 0.16 : 0.1);
        for (let i = 0; i < 12; i++) {
          ctx.rotate((Math.PI * 2) / 12);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-R * 0.1, -R);
          ctx.lineTo(R * 0.1, -R);
          ctx.fill();
        }
        ctx.restore();
      }
    }
    // piédestal
    if (this.opts.pedestal !== false) {
      const py = cy + s * 0.32;
      const pw = s * 0.62;
      const ph = s * 0.17;
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(cx, py + ph * 0.9, pw * 1.05, ph * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      const side = ctx.createLinearGradient(0, py, 0, py + ph * 0.9);
      side.addColorStop(0, "#3a3f8f");
      side.addColorStop(1, "#1d1f52");
      ctx.fillStyle = side;
      ctx.beginPath();
      ctx.ellipse(cx, py + ph * 0.55, pw, ph, 0, 0, Math.PI);
      ctx.lineTo(cx - pw, py);
      ctx.ellipse(cx, py, pw, ph, 0, Math.PI, 0, true);
      ctx.fill();
      const top = ctx.createRadialGradient(cx - pw * 0.3, py - ph * 0.4, 0, cx, py, pw);
      top.addColorStop(0, "#6f78d8");
      top.addColorStop(1, "#3c4196");
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.ellipse(cx, py, pw, ph, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA(rc, 0.55 + 0.25 * Math.sin(t * 2.4));
      ctx.lineWidth = Math.max(2, s * 0.025);
      ctx.beginPath();
      ctx.ellipse(cx, py, pw * 0.94, ph * 0.86, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // comportement
    const sinceAct = t - this.actAt;
    if (this.mode === "idle" && t > this.nextAct) {
      this.nextAct = t + 3.5 + Math.random() * 3;
      const r = Math.random();
      if (r < 0.3) {
        this.act = "wave";
        this.actAt = t;
      } else if (r < 0.55) this.face = Math.random() < 0.5 ? -1 : 1;
      else if (r < 0.7) {
        this.act = "hop";
        this.actAt = t;
      } else if (r < 0.85 && this.idleEmotes.length) this.showEmote(this.idleEmotes[Math.floor(Math.random() * this.idleEmotes.length)]);
      else this.face = 0;
    }
    if (this.act && sinceAct > 1.2) this.act = null;
    const running = this.mode === "run";
    const pose: CharPose = {
      faceX: running ? 1 : this.act === "spin" ? [0, 1, 0, -1][Math.floor(sinceAct * 8) % 4] : this.face,
      faceY: running ? 0 : this.act === "spin" ? [1, 0, -1, 0][Math.floor(sinceAct * 8) % 4] : 1,
      walk: t * 2.4,
      moving: running,
      t,
      expr: this.expr(),
      celebrate: this.mode === "win" || this.act === "hop",
      wave: this.act === "wave" ? Math.min(1, sinceAct / 1.2) : undefined,
    };
    if (this.act === "wave") pose.wave = Math.min(0.999, sinceAct / 1.2);

    // effets
    emitAura(this.P, look.aura, 0, -0.25, look.palette, dt, this.auraAcc, 1.4);
    if (running) emitTrail(this.P, this.look.trailId ?? getTrail(null).id, 0, 0, 1, 0, dt, this.trailAcc, false);
    this.P.update(dt);
    drawCharacter(ctx, cx, cy, s, look, pose, "#1a1626");
    this.P.draw(ctx, cx, cy, s);
    if (this.emote) {
      const age = t - this.emote.at;
      if (!this.emote.loop && age > EMOTE_DURATION) this.emote = null;
      else drawEmoteBubble(ctx, cx + s * 0.42, Math.max(s * 0.45, cy - (headTopOffset(look.kind) + 0.42) * s), s * 0.85, this.emote.def, this.emote.loop ? age % 6 : age, this.emote.loop);
    }
    // éclair d'équipement
    const fl = t - this.flashAt;
    if (fl < 0.35) {
      ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - fl / 0.35)})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy - s * 0.1, s * 0.7, s * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private expr(): Expr {
    if (this.mode === "win") return "happy";
    if (this.mode === "sad") return "dizzy";
    if (this.act === "wave" || this.act === "hop") return "happy";
    return "normal";
  }
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
