import type { InputCmd } from "../core/types";
import { viewport, type Insets } from "../platform/viewport";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface ControlsLayout {
  joyHome: Circle;
  joyZone: { x0: number; y0: number; x1: number; y1: number };
  bomb: Circle;
  shield: Circle;
}

/**
 * Commandes tactiles (joystick dynamique + 2 gros boutons) et clavier.
 * Multi-touch via Pointer Events : on peut courir et poser une bombe
 * en même temps.
 */
export class Controls {
  layout: ControlsLayout = {
    joyHome: { x: 100, y: 300, r: 60 },
    joyZone: { x0: 0, y0: 0, x1: 300, y1: 600 },
    bomb: { x: 700, y: 300, r: 50 },
    shield: { x: 600, y: 340, r: 36 },
  };
  private joyPointer: number | null = null;
  private joyBase = { x: 0, y: 0 };
  private joyKnob = { x: 0, y: 0 };
  private bombPointer: number | null = null;
  private shieldPointer: number | null = null;
  private bombEdge = false;
  private shieldEdge = false;
  private keys = new Set<string>();
  private bombPressT = 0;
  private shieldPressT = 0;
  enabled = true;
  onPause: (() => void) | null = null;
  onAnyInput: (() => void) | null = null;

  private target: HTMLElement;

  constructor(target: HTMLElement) {
    this.target = target;
    target.addEventListener("pointerdown", this.down, { passive: false });
    window.addEventListener("pointermove", this.move, { passive: false });
    window.addEventListener("pointerup", this.up);
    window.addEventListener("pointercancel", this.up);
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", () => this.releaseAll());
  }

  /**
   * Disposition paysage : joystick dans la colonne gauche, bombe + bouclier
   * dans la colonne droite, à hauteur des pouces. Tout est calculé à partir
   * de la hauteur d'écran, des zones de sécurité (encoche) et de l'arène.
   */
  setLayout(w: number, h: number, safe: Insets, arena: { x: number; y: number; w: number; h: number }) {
    const leftCol = Math.max(0, arena.x - safe.l);
    const rightCol = Math.max(0, w - safe.r - (arena.x + arena.w));
    const jr = clamp(h * 0.145, 44, 80);
    const br = clamp(h * 0.135, 42, 74);
    const sr = br * 0.62;
    const bottom = h - safe.b;
    // joystick : centré dans la colonne gauche, au tiers bas de l'écran
    const jx = safe.l + clamp(leftCol * 0.5, jr + 14, Math.max(jr + 14, leftCol - jr * 0.6));
    const jy = bottom - jr - Math.max(14, h * 0.07);
    // bombe : coin bas-droit, là où le pouce droit tombe naturellement
    const bx = w - safe.r - clamp(rightCol * 0.42, br + 16, Math.max(br + 16, rightCol - br * 0.5));
    const by = bottom - br - Math.max(16, h * 0.08);
    // bouclier : en arc au-dessus et vers l'intérieur… sauf si la colonne
    // est trop étroite (16:9, tablette) : il passe alors juste au-dessus,
    // pour ne jamais masquer une case jouable.
    const arenaRight = arena.x + arena.w - h * 0.035;
    let sx = bx - br * 1.05;
    let sy = by - br * 1.55;
    if (sx - sr < arenaRight) {
      sx = Math.max(bx, arenaRight + sr + 6);
      sy = by - br - sr - Math.max(12, h * 0.035);
    }
    this.layout = {
      joyHome: { x: jx, y: jy, r: jr },
      joyZone: { x0: 0, y0: h * 0.24, x1: Math.max(w * 0.42, arena.x + arena.w * 0.3), y1: h },
      bomb: { x: bx, y: by, r: br },
      shield: { x: sx, y: sy, r: sr },
    };
    if (this.joyPointer === null) this.resetJoy();
  }

  private resetJoy() {
    this.joyBase = { x: this.layout.joyHome.x, y: this.layout.joyHome.y };
    this.joyKnob = { ...this.joyBase };
  }

  private local(e: PointerEvent) {
    return viewport.toLocal(e.clientX, e.clientY);
  }

  private hit(c: Circle, x: number, y: number, slack = 1.3) {
    return Math.hypot(x - c.x, y - c.y) <= c.r * slack;
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    this.onAnyInput?.();
    const { x, y } = this.local(e);
    const L = this.layout;
    if (this.hit(L.bomb, x, y)) {
      this.bombPointer = e.pointerId;
      this.bombEdge = true;
      this.bombPressT = performance.now();
      return;
    }
    if (this.hit(L.shield, x, y)) {
      this.shieldPointer = e.pointerId;
      this.shieldEdge = true;
      this.shieldPressT = performance.now();
      return;
    }
    const z = L.joyZone;
    if (this.joyPointer === null && x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) {
      this.joyPointer = e.pointerId;
      this.joyBase = { x, y };
      this.joyKnob = { x, y };
      return;
    }
    // ailleurs à droite : un tap pose une bombe (pratique sur grands écrans)
    if (x > viewport.w * 0.58 && y > viewport.h * 0.3) {
      this.bombEdge = true;
      this.bombPressT = performance.now();
    }
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.joyPointer) return;
    e.preventDefault();
    const { x, y } = this.local(e);
    const r = this.layout.joyHome.r;
    let dx = x - this.joyBase.x;
    let dy = y - this.joyBase.y;
    const d = Math.hypot(dx, dy);
    if (d > r) {
      // la base suit le doigt : pas besoin de revenir au centre
      const over = d - r;
      this.joyBase.x += (dx / d) * over;
      this.joyBase.y += (dy / d) * over;
      dx = (dx / d) * r;
      dy = (dy / d) * r;
    }
    this.joyKnob = { x: this.joyBase.x + dx, y: this.joyBase.y + dy };
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId === this.joyPointer) {
      this.joyPointer = null;
      this.resetJoy();
    }
    if (e.pointerId === this.bombPointer) this.bombPointer = null;
    if (e.pointerId === this.shieldPointer) this.shieldPointer = null;
  };

  private keyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    if (!this.enabled) {
      if (k === "escape" || k === "p") this.onPause?.();
      return;
    }
    this.onAnyInput?.();
    this.keys.add(k);
    if (k === " " || k === "x" || k === "enter") {
      this.bombEdge = true;
      this.bombPressT = performance.now();
    }
    if (k === "shift" || k === "e" || k === "c") {
      this.shieldEdge = true;
      this.shieldPressT = performance.now();
    }
    if (k === "escape" || k === "p") this.onPause?.();
  };

  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  releaseAll() {
    this.keys.clear();
    this.joyPointer = this.bombPointer = this.shieldPointer = null;
    this.bombEdge = this.shieldEdge = false;
    this.resetJoy();
  }

  /** Lit la commande du tick (les appuis sont consommés une seule fois). */
  read(): InputCmd {
    let mx = 0;
    let my = 0;
    const k = this.keys;
    if (k.has("arrowleft") || k.has("a") || k.has("q")) mx -= 1;
    if (k.has("arrowright") || k.has("d")) mx += 1;
    if (k.has("arrowup") || k.has("w") || k.has("z")) my -= 1;
    if (k.has("arrowdown") || k.has("s")) my += 1;
    if (this.joyPointer !== null) {
      const r = this.layout.joyHome.r;
      const dx = (this.joyKnob.x - this.joyBase.x) / r;
      const dy = (this.joyKnob.y - this.joyBase.y) / r;
      if (Math.hypot(dx, dy) > 0.28) {
        mx = dx;
        my = dy;
      }
    }
    const cmd: InputCmd = { mx, my, bomb: this.bombEdge, ability: this.shieldEdge };
    this.bombEdge = false;
    this.shieldEdge = false;
    return cmd;
  }

  // ---------------------------------------------------------------- dessin
  draw(ctx: CanvasRenderingContext2D, shieldCharges: number, shieldActive: number, bombsLeft: number, maxBombs: number) {
    const L = this.layout;
    const now = performance.now();
    // joystick
    const active = this.joyPointer !== null;
    ctx.save();
    ctx.globalAlpha = active ? 0.95 : 0.55;
    ctx.fillStyle = "rgba(10, 20, 14, 0.35)";
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.joyBase.x, this.joyBase.y, L.joyHome.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // repères directionnels
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const rx = this.joyBase.x + Math.cos(a) * L.joyHome.r * 0.78;
      const ry = this.joyBase.y + Math.sin(a) * L.joyHome.r * 0.78;
      ctx.beginPath();
      ctx.moveTo(rx + Math.cos(a) * 7, ry + Math.sin(a) * 7);
      ctx.lineTo(rx + Math.cos(a + 2.3) * 7, ry + Math.sin(a + 2.3) * 7);
      ctx.lineTo(rx + Math.cos(a - 2.3) * 7, ry + Math.sin(a - 2.3) * 7);
      ctx.fill();
    }
    const kr = L.joyHome.r * 0.48;
    const kg = ctx.createRadialGradient(this.joyKnob.x - kr * 0.3, this.joyKnob.y - kr * 0.4, kr * 0.1, this.joyKnob.x, this.joyKnob.y, kr);
    kg.addColorStop(0, "#ffffff");
    kg.addColorStop(1, "#d8e6dc");
    ctx.globalAlpha = active ? 1 : 0.75;
    ctx.fillStyle = kg;
    ctx.beginPath();
    ctx.arc(this.joyKnob.x, this.joyKnob.y, kr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // bouton bombe
    const bp = this.bombPointer !== null || now - this.bombPressT < 120;
    this.button(ctx, L.bomb, "#ff6a2b", "#b8380c", bp, bombsLeft > 0, (x, y, r) => {
      ctx.fillStyle = "#1b1c33";
      ctx.beginPath();
      ctx.arc(x - r * 0.06, y + r * 0.08, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff3d0";
      ctx.lineWidth = r * 0.09;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + r * 0.2, y - r * 0.28);
      ctx.quadraticCurveTo(x + r * 0.3, y - r * 0.5, x + r * 0.46, y - r * 0.46);
      ctx.stroke();
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.arc(x + r * 0.48, y - r * 0.47, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
    });
    // compteur de bombes disponibles
    this.badge(ctx, L.bomb.x + L.bomb.r * 0.62, L.bomb.y - L.bomb.r * 0.86, `${bombsLeft}/${maxBombs}`, "#1b1c33");

    // bouton bouclier
    const sp = this.shieldPointer !== null || now - this.shieldPressT < 120;
    const ready = shieldCharges > 0 && shieldActive <= 0;
    this.button(ctx, L.shield, "#3fc6ff", "#1a7fb8", sp, ready, (x, y, r) => {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.5);
      ctx.lineTo(x + r * 0.4, y - r * 0.34);
      ctx.quadraticCurveTo(x + r * 0.4, y + r * 0.28, x, y + r * 0.52);
      ctx.quadraticCurveTo(x - r * 0.4, y + r * 0.28, x - r * 0.4, y - r * 0.34);
      ctx.closePath();
      ctx.fill();
    });
    if (shieldActive > 0) {
      // jauge de durée restante
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(L.shield.x, L.shield.y, L.shield.r + 6, -Math.PI / 2, -Math.PI / 2 + (shieldActive / 3) * Math.PI * 2);
      ctx.stroke();
    } else if (shieldCharges > 0) {
      this.badge(ctx, L.shield.x + L.shield.r * 0.7, L.shield.y - L.shield.r * 0.7, String(shieldCharges), "#1a7fb8");
    }
  }

  private button(
    ctx: CanvasRenderingContext2D,
    c: Circle,
    col: string,
    dark: string,
    pressed: boolean,
    enabled: boolean,
    icon: (x: number, y: number, r: number) => void,
  ) {
    const depth = c.r * 0.12;
    const press = pressed ? depth * 0.8 : 0;
    ctx.save();
    ctx.globalAlpha = enabled ? 1 : 0.42;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.arc(c.x, c.y + depth + 3, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(c.x, c.y + depth, c.r, 0, Math.PI * 2);
    ctx.fill();
    const y = c.y + press;
    const g = ctx.createLinearGradient(c.x, y - c.r, c.x, y + c.r);
    g.addColorStop(0, enabled ? col : "#9aa3a0");
    g.addColorStop(1, enabled ? dark : "#6b7471");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, y, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c.x, y, c.r - 4, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    icon(c.x, y, c.r);
    ctx.restore();
  }

  private badge(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, col: string) {
    ctx.font = `800 14px "Baloo 2", system-ui, sans-serif`;
    const w = Math.max(24, ctx.measureText(text).width + 12);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 11, w, 22, 11);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 1);
  }
}
