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
  /** bouton « lancer » (visible seulement avec la capacité) */
  throw: Circle;
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
    throw: { x: 720, y: 180, r: 36 },
  };
  /** le joueur a la capacité de lancer : le bouton existe (sinon ni dessiné ni cliquable) */
  throwReady = false;
  private throwPointer: number | null = null;
  private throwEdge = false;
  private throwPressT = 0;
  /** moment où la capacité est apparue (petite animation d'arrivée du bouton) */
  private throwSince = 0;
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
    // bouton « lancer » : juste au-dessus de la bombe (le bouclier est côté arène)
    const tr = br * 0.7;
    let tx = Math.min(w - safe.r - tr - 8, bx + br * 0.2);
    let ty = by - br - tr - Math.max(24, h * 0.07);
    if (sx - sr < arenaRight) {
      sx = Math.max(bx, arenaRight + sr + 6);
      sy = by - br - sr - Math.max(12, h * 0.035);
      // colonne étroite : le bouclier est au-dessus de la bombe, « lancer » au-dessus du bouclier
      tx = sx;
      ty = sy - sr - tr - Math.max(10, h * 0.03);
    }
    ty = Math.max(safe.t + tr + 8, ty);
    this.layout = {
      joyHome: { x: jx, y: jy, r: jr },
      joyZone: { x0: 0, y0: h * 0.24, x1: Math.max(w * 0.42, arena.x + arena.w * 0.3), y1: h },
      bomb: { x: bx, y: by, r: br },
      shield: { x: sx, y: sy, r: sr },
      throw: { x: tx, y: ty, r: tr },
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
    if (this.throwReady && this.hit(L.throw, x, y, 1.2)) {
      this.throwPointer = e.pointerId;
      this.throwEdge = true;
      this.throwPressT = performance.now();
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
    if (e.pointerId === this.throwPointer) this.throwPointer = null;
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
    if ((k === "f" || k === "v") && this.throwReady) {
      this.throwEdge = true;
      this.throwPressT = performance.now();
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
    this.joyPointer = this.bombPointer = this.shieldPointer = this.throwPointer = null;
    this.bombEdge = this.shieldEdge = this.throwEdge = false;
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
    if (this.throwEdge) cmd.throw = true;
    this.bombEdge = false;
    this.shieldEdge = false;
    this.throwEdge = false;
    return cmd;
  }

  // ---------------------------------------------------------------- dessin
  draw(ctx: CanvasRenderingContext2D, shieldCharges: number, shieldActive: number, bombsLeft: number, maxBombs: number, throwCharges = 0, bigCharges = 0, elecCharges = 0, stunTime = 0, freezeCharges = 0, toxicCharges = 0) {
    const L = this.layout;
    const now = performance.now();
    // la capacité vient d'apparaître / de disparaître
    const canThrow = throwCharges > 0;
    if (canThrow && !this.throwReady) this.throwSince = now;
    this.throwReady = canThrow;
    if (!canThrow) this.throwPointer = null;
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

    // bouton bombe (grosse bombe prête : halo rouge qui pulse, bombe plus grosse, étiquette XL)
    const big = bigCharges > 0;
    const elec = elecCharges > 0;
    const frz = freezeCharges > 0;
    const tox = toxicCharges > 0;
    if (big) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      ctx.save();
      const halo = ctx.createRadialGradient(L.bomb.x, L.bomb.y, L.bomb.r * 0.8, L.bomb.x, L.bomb.y, L.bomb.r * (1.35 + pulse * 0.12));
      halo.addColorStop(0, "rgba(255,60,70,0.55)");
      halo.addColorStop(1, "rgba(255,60,70,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(L.bomb.x, L.bomb.y, L.bomb.r * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const bp = this.bombPointer !== null || now - this.bombPressT < 120;
    if (elec) this.drawElecHalo(ctx, L.bomb, now);
    if (frz) this.drawFrostHalo(ctx, L.bomb, now);
    if (tox) this.drawToxicHalo(ctx, L.bomb, now);
    this.button(ctx, L.bomb, big ? "#ff3d4f" : elec ? "#2f8dff" : frz ? "#5fd3f0" : tox ? "#6fd13a" : "#ff6a2b", big ? "#a3101f" : elec ? "#1546a8" : frz ? "#1f7f9e" : tox ? "#3b7a1a" : "#b8380c", bp, bombsLeft > 0 && stunTime <= 0, (x, y, r) => {
      ctx.fillStyle = "#1b1c33";
      ctx.beginPath();
      ctx.arc(x - r * 0.06, y + r * 0.08, r * (big ? 0.5 : 0.42), 0, Math.PI * 2);
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
    if (big) this.badge(ctx, L.bomb.x - L.bomb.r * 0.7, L.bomb.y - L.bomb.r * 0.86, "XL", "#d61f33");
    if (elec) this.badge(ctx, L.bomb.x - L.bomb.r * 0.95, L.bomb.y + (big ? -L.bomb.r * 0.2 : -L.bomb.r * 0.86), "⚡", "#1546a8");
    if (tox) this.badge(ctx, L.bomb.x + L.bomb.r * 0.95, L.bomb.y + L.bomb.r * 0.1, "☣", "#3b7a1a");
    if (frz) this.badge(ctx, L.bomb.x - L.bomb.r * 0.95, L.bomb.y + L.bomb.r * (elec ? 0.45 : big ? -0.2 : -0.86), "❄", "#1f7f9e");
    if (stunTime > 0) {
      // paralysé : jauge bleue autour du bouton bombe (les commandes reviennent à la fin)
      ctx.save();
      ctx.strokeStyle = "#7fd4ff";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(L.bomb.x, L.bomb.y, L.bomb.r + 7, -Math.PI / 2, -Math.PI / 2 + Math.min(1, stunTime / 1) * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

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
    if (this.throwReady) this.drawThrow(ctx, now, bombsLeft > 0);
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

  /** Bouton « lancer » : apparaît en rebondissant, halo doré qui pulse (capacité prête). */
  private drawThrow(ctx: CanvasRenderingContext2D, now: number, canUse: boolean) {
    const c = this.layout.throw;
    const age = (now - this.throwSince) / 1000;
    const pop = age < 0.35 ? 0.4 + 0.6 * Math.sin((age / 0.35) * Math.PI * 0.5) + Math.sin((age / 0.35) * Math.PI) * 0.15 : 1;
    const r = c.r * pop;
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    ctx.save();
    // halo
    const g = ctx.createRadialGradient(c.x, c.y, r * 0.8, c.x, c.y, r * 1.6);
    g.addColorStop(0, `rgba(255,200,40,${0.45 + pulse * 0.3})`);
    g.addColorStop(1, "rgba(255,200,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const pressed = this.throwPointer !== null || now - this.throwPressT < 120;
    this.button(ctx, { x: c.x, y: c.y, r }, "#ffb31a", "#c7700a", pressed, canUse, (x, y, rr) => {
      // bombe + arc en pointillés + flèche
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = rr * 0.1;
      ctx.lineCap = "round";
      ctx.setLineDash([rr * 0.12, rr * 0.12]);
      ctx.beginPath();
      ctx.moveTo(x - rr * 0.45, y + rr * 0.25);
      ctx.quadraticCurveTo(x - rr * 0.05, y - rr * 0.75, x + rr * 0.42, y - rr * 0.05);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(x + rr * 0.55, y + rr * 0.08);
      ctx.lineTo(x + rr * 0.25, y - rr * 0.02);
      ctx.lineTo(x + rr * 0.45, y - rr * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1b1c33";
      ctx.beginPath();
      ctx.arc(x - rr * 0.18, y + rr * 0.2, rr * 0.28, 0, Math.PI * 2);
      ctx.fill();
    });
    // étiquette « LANCER »
    ctx.save();
    ctx.font = `900 ${Math.round(Math.max(11, r * 0.36))}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#1b1c33";
    ctx.strokeText("LANCER", c.x, c.y + r + Math.max(10, r * 0.38));
    ctx.fillStyle = "#ffd23f";
    ctx.fillText("LANCER", c.x, c.y + r + Math.max(10, r * 0.38));
    ctx.restore();
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

  /** Bombe électrique prête : petits éclairs bleus/jaunes autour du bouton bombe. */
  private drawElecHalo(ctx: CanvasRenderingContext2D, c: Circle, now: number) {
    ctx.save();
    const halo = ctx.createRadialGradient(c.x, c.y, c.r * 0.8, c.x, c.y, c.r * 1.45);
    halo.addColorStop(0, "rgba(80,170,255,0.5)");
    halo.addColorStop(1, "rgba(80,170,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    const seed = Math.floor(now / 70);
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    for (let k = 0; k < 3; k++) {
      const a = ((seed * 7 + k * 131) % 360) * (Math.PI / 180);
      ctx.strokeStyle = k % 2 ? "#ffe45c" : "#9fe0ff";
      ctx.beginPath();
      for (let j = 0; j <= 4; j++) {
        const rr = c.r * (1.02 + j * 0.09);
        const aa = a + (j % 2 ? 0.12 : -0.12);
        const px = c.x + Math.cos(aa) * rr;
        const py = c.y + Math.sin(aa) * rr;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Bombe gelante prête : halo glacé + petits flocons qui tournent autour du bouton bombe. */
  private drawFrostHalo(ctx: CanvasRenderingContext2D, c: Circle, now: number) {
    ctx.save();
    const halo = ctx.createRadialGradient(c.x, c.y, c.r * 0.8, c.x, c.y, c.r * 1.45);
    halo.addColorStop(0, "rgba(170,235,255,0.5)");
    halo.addColorStop(1, "rgba(170,235,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e8fbff";
    ctx.lineWidth = 1.8;
    for (let k = 0; k < 4; k++) {
      const a = now / 1400 + (k * Math.PI) / 2;
      const x = c.x + Math.cos(a) * c.r * 1.18;
      const y = c.y + Math.sin(a) * c.r * 1.18;
      for (let j = 0; j < 3; j++) {
        const b = (j * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(b) * 5, y - Math.sin(b) * 5);
        ctx.lineTo(x + Math.cos(b) * 5, y + Math.sin(b) * 5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Bombe toxique prête : halo vert et bulles violettes qui montent autour du bouton bombe. */
  private drawToxicHalo(ctx: CanvasRenderingContext2D, c: Circle, now: number) {
    ctx.save();
    const halo = ctx.createRadialGradient(c.x, c.y, c.r * 0.8, c.x, c.y, c.r * 1.45);
    halo.addColorStop(0, "rgba(120,220,70,0.5)");
    halo.addColorStop(1, "rgba(120,220,70,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 5; k++) {
      const ph = ((now / 1600 + k / 5) % 1);
      const a = -Math.PI / 2 + (k - 2) * 0.55;
      const x = c.x + Math.cos(a) * c.r * (1.05 + ph * 0.3);
      const y = c.y + Math.sin(a) * c.r * (1.05 + ph * 0.3);
      ctx.globalAlpha = 1 - ph;
      ctx.fillStyle = k % 2 ? "#b36bff" : "#8fe85a";
      ctx.beginPath();
      ctx.arc(x, y, 3 + ph * 3, 0, Math.PI * 2);
      ctx.fill();
    }
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
