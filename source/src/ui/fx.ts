/**
 * Effets de l'interface (au-dessus des menus) : pièces qui volent jusqu'au
 * porte-monnaie, confettis, étincelles. Un seul canvas plein écran, animé
 * uniquement quand il y a quelque chose à montrer.
 */
import { audio } from "../audio/audio";
import { viewport } from "../platform/viewport";

interface Bit {
  kind: "coin" | "confetti" | "spark" | "shard";
  lost?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
  size: number;
  color: string;
  // pièces : trajectoire courbe vers la cible
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  delay?: number;
  onArrive?: () => void;
}

const COLORS = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#ff7ad9", "#ffffff", "#6a4c93"];

export class UiFx {
  private bits: Bit[] = [];
  private raf = 0;
  private last = 0;
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  /** Centre d'un élément dans le repère de l'application (gère la rotation portrait). */
  center(el: Element): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return viewport.toLocal(r.left + r.width / 2, r.top + r.height / 2);
  }

  confetti(x: number, y: number, n = 60, spread = 1) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2 * spread;
      const sp = 260 + Math.random() * 420;
      this.bits.push({
        kind: "confetti", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18,
        life: 1.6 + Math.random() * 0.8, max: 2.4, size: 5 + Math.random() * 5, color: COLORS[i % COLORS.length],
      });
    }
    this.run();
  }

  sparkle(x: number, y: number, n = 16, color = "#fff3b0") {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = 120 + Math.random() * 160;
      this.bits.push({ kind: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: 0, vr: 0, life: 0.6, max: 0.6, size: 4 + Math.random() * 4, color });
    }
    this.run();
  }

  /**
   * Pièces qui s'envolent de `from` vers `to`. `onEach` est appelé à chaque
   * pièce arrivée (pour faire monter le compteur pièce par pièce).
   */
  coins(from: { x: number; y: number }, to: { x: number; y: number }, n: number, onEach?: (i: number, n: number) => void, onDone?: () => void) {
    n = Math.max(1, Math.min(24, n));
    let arrived = 0;
    for (let i = 0; i < n; i++) {
      this.bits.push({
        kind: "coin", x: from.x, y: from.y, vx: 0, vy: 0, rot: Math.random() * 6, vr: 8 + Math.random() * 6, life: 0.85, max: 0.85, size: 11,
        color: "#ffd23f", from: { x: from.x + (Math.random() - 0.5) * 90, y: from.y + (Math.random() - 0.5) * 60 }, to, delay: i * 0.045,
        onArrive: () => {
          arrived++;
          audio.play("coin", 0.7);
          onEach?.(arrived, n);
          if (arrived === n) onDone?.();
        },
      });
    }
    this.run();
  }

  /**
   * Perte : des pièces ternies quittent le porte-monnaie (`from`) vers la
   * perte affichée (`to`), puis se brisent en éclats rouges qui tombent.
   */
  coinsLost(from: { x: number; y: number }, to: { x: number; y: number }, n: number, onEach?: (i: number, n: number) => void, onDone?: () => void) {
    n = Math.max(1, Math.min(14, n));
    let arrived = 0;
    for (let i = 0; i < n; i++) {
      this.bits.push({
        kind: "coin", lost: true, x: from.x, y: from.y, vx: 0, vy: 0, rot: Math.random() * 6, vr: 6 + Math.random() * 6, life: 0.7, max: 0.7, size: 10,
        color: "#c9b27a", from: { x: from.x + (Math.random() - 0.5) * 30, y: from.y + (Math.random() - 0.5) * 20 }, to: { x: to.x + (Math.random() - 0.5) * 40, y: to.y + (Math.random() - 0.5) * 16 }, delay: i * 0.06,
        onArrive: () => {
          arrived++;
          audio.play("thud", 0.25);
          this.shatter(to.x + (Math.random() - 0.5) * 40, to.y);
          onEach?.(arrived, n);
          if (arrived === n) onDone?.();
        },
      });
    }
    this.run();
  }

  /** Éclats rouges et gris qui tombent. */
  shatter(x: number, y: number, n = 7) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 90 + Math.random() * 160;
      this.bits.push({
        kind: "shard", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20,
        life: 0.9 + Math.random() * 0.4, max: 1.3, size: 3 + Math.random() * 4, color: i % 3 === 0 ? "#8d8aa8" : i % 2 ? "#ff5a4f" : "#c9282d",
      });
    }
    this.run();
  }

  private run() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const cv = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const b of this.bits) {
      if (b.delay && b.delay > 0) {
        b.delay -= dt;
        continue;
      }
      b.life -= dt;
      b.rot += b.vr * dt;
      if (b.kind === "coin" && b.from && b.to) {
        const k = 1 - Math.max(0, b.life) / b.max;
        const e = k * k * (3 - 2 * k);
        const mx = (b.from.x + b.to.x) / 2;
        const my = Math.min(b.from.y, b.to.y) - 80;
        const u = 1 - e;
        b.x = u * u * b.from.x + 2 * u * e * mx + e * e * b.to.x;
        b.y = u * u * b.from.y + 2 * u * e * my + e * e * b.to.y;
        if (b.life <= 0 && b.onArrive) {
          const f = b.onArrive;
          b.onArrive = undefined;
          f();
        }
      } else {
        b.vy += (b.kind === "confetti" ? 520 : b.kind === "shard" ? 900 : 0) * dt;
        if (b.kind === "confetti" || b.kind === "shard") {
          b.vx *= 0.985;
          b.vy = Math.min(b.vy, 260);
        } else {
          b.vx *= 0.92;
          b.vy *= 0.92;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      this.drawBit(ctx, b);
    }
    this.bits = this.bits.filter((b) => b.life > 0 || (b.delay ?? 0) > 0);
    if (this.bits.length) this.raf = requestAnimationFrame(this.frame);
    else {
      this.raf = 0;
      ctx.clearRect(0, 0, W, H);
    }
  };

  private drawBit(ctx: CanvasRenderingContext2D, b: Bit) {
    const a = Math.min(1, b.life / Math.min(0.4, b.max));
    ctx.globalAlpha = Math.max(0, a);
    if (b.kind === "coin") {
      ctx.globalAlpha = 1;
      const sx = Math.abs(Math.cos(b.rot)) * 0.8 + 0.2;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(sx, 1);
      const g = ctx.createRadialGradient(-b.size * 0.3, -b.size * 0.35, 1, 0, 0, b.size);
      g.addColorStop(0, b.lost ? "#e8dcc0" : "#fff6b8");
      g.addColorStop(0.5, b.lost ? "#b8a06a" : "#ffd23f");
      g.addColorStop(1, b.lost ? "#7a6234" : "#d48b00");
      ctx.fillStyle = g;
      ctx.strokeStyle = "#7a4a00";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, b.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(122,74,0,.55)";
      ctx.fillRect(-b.size * 0.15, -b.size * 0.45, b.size * 0.3, b.size * 0.9);
      ctx.restore();
    } else if (b.kind === "shard") {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(-b.size, -b.size * 0.4);
      ctx.lineTo(b.size, -b.size * 0.7);
      ctx.lineTo(b.size * 0.3, b.size * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (b.kind === "confetti") {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.size / 2, (-b.size / 4) * Math.abs(Math.cos(b.rot * 1.7)), b.size, (b.size / 2) * Math.abs(Math.cos(b.rot * 1.7)) + 1);
      ctx.restore();
    } else {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      const r = b.size * (b.life / b.max);
      ctx.moveTo(b.x, b.y - r * 2);
      ctx.lineTo(b.x + r * 0.5, b.y);
      ctx.lineTo(b.x, b.y + r * 2);
      ctx.lineTo(b.x - r * 0.5, b.y);
      ctx.closePath();
      ctx.moveTo(b.x - r * 2, b.y);
      ctx.lineTo(b.x, b.y - r * 0.5);
      ctx.lineTo(b.x + r * 2, b.y);
      ctx.lineTo(b.x, b.y + r * 0.5);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
