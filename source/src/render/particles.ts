/** Système de particules léger (pool fixe, aucune allocation en jeu). */

export type ParticleKind =
  | "chip"
  | "smoke"
  | "spark"
  | "star"
  | "ring"
  | "leaf"
  // particules « flottantes » (sans gravité) : auras, traînées, ambiance
  | "bubble"
  | "flake"
  | "heart"
  | "note"
  | "bolt"
  | "petal"
  | "ember"
  | "glow"
  | "twinkle"
  | "confetti"
  | "streak";

const FLOAT = new Set<ParticleKind>(["bubble", "flake", "heart", "note", "bolt", "petal", "ember", "glow", "twinkle", "streak"]);

interface P {
  active: boolean;
  kind: ParticleKind;
  x: number; // en cases
  y: number;
  z: number; // hauteur (cases)
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

/** Traces au sol (brûlures, empreintes) : dessinées sous les personnages. */
export interface Mark {
  x: number;
  y: number;
  kind: "scorch" | "print" | "frost" | "glow";
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
}

const MAX = 700;
const MAX_MARKS = 160;

export class Particles {
  private pool: P[] = Array.from({ length: MAX }, () => ({
    active: false, kind: "chip", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.1, color: "#fff", rot: 0, vr: 0,
  }));
  private cursor = 0;
  texts: FloatText[] = [];
  marks: Mark[] = [];
  private time = 0;

  clear() {
    for (const p of this.pool) p.active = false;
    this.texts = [];
    this.marks = [];
  }

  spawn(kind: ParticleKind, x: number, y: number, o: Partial<Omit<P, "active" | "kind" | "x" | "y">> = {}) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.z = o.z ?? 0;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.vz = o.vz ?? 0;
    p.max = p.life = o.life ?? 0.6;
    p.size = o.size ?? 0.1;
    p.color = o.color ?? "#fff";
    p.rot = o.rot ?? Math.random() * 6;
    p.vr = o.vr ?? (Math.random() - 0.5) * 10;
  }

  mark(kind: Mark["kind"], x: number, y: number, o: Partial<Omit<Mark, "kind" | "x" | "y">> = {}) {
    if (this.marks.length >= MAX_MARKS) this.marks.shift();
    const life = o.life ?? 4;
    this.marks.push({ kind, x, y, life, max: life, size: o.size ?? 0.4, color: o.color ?? "#000", rot: o.rot ?? Math.random() * 6 });
  }

  text(x: number, y: number, text: string, color: string) {
    this.texts.push({ x, y, text, color, life: 1.1 });
  }

  // ------------------------------------------------------------ recettes
  explosion(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.5;
      this.spawn("smoke", x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0.6 + Math.random(), life: 0.7 + Math.random() * 0.5,
        size: 0.25 + Math.random() * 0.2, color: Math.random() < 0.5 ? "#e9e2d6" : "#bdb4a6",
      });
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 5;
      this.spawn("spark", x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 2 + Math.random() * 3, life: 0.35 + Math.random() * 0.3,
        size: 0.06, color: Math.random() < 0.5 ? "#ffe066" : "#ff8a2a",
      });
    }
    for (let i = 0; i < 4; i++)
      this.spawn("ember", x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, {
        vz: 0.8 + Math.random(), vx: (Math.random() - 0.5) * 0.6, life: 0.9 + Math.random() * 0.5, size: 0.05, color: "#ffb347",
      });
    this.spawn("ring", x, y, { life: 0.35, size: 0.3, color: "#fff6c8" });
    // onde de choc plus large + éclair blanc au centre
    this.spawn("ring", x, y, { life: 0.5, size: 0.62, color: "#ffb347" });
    this.spawn("glow", x, y, { z: 0.2, life: 0.2, size: 0.55, color: "#fffbe0" });
    for (let i = 0; i < 4; i++)
      this.spawn("ember", x + (Math.random() - 0.5) * 0.9, y + (Math.random() - 0.5) * 0.9, {
        vz: 1.4 + Math.random() * 1.2, vx: (Math.random() - 0.5) * 1.6, vy: (Math.random() - 0.5) * 1.6, life: 0.6 + Math.random() * 0.4, size: 0.06, color: "#ff6a2a",
      });
    this.mark("scorch", x, y, { life: 6, size: 0.42 + Math.random() * 0.08 });
  }

  blockBreak(x: number, y: number, palette: string[]) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      this.spawn(Math.random() < 0.3 ? "leaf" : "chip", x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 0.3, vz: 2 + Math.random() * 3, life: 0.6 + Math.random() * 0.4,
        size: 0.08 + Math.random() * 0.08, color: palette[Math.floor(Math.random() * palette.length)],
      });
    }
  }

  pickup(x: number, y: number, color: string) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.spawn("star", x, y, {
        vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5, z: 0.3, vz: 1.5, life: 0.5, size: 0.09, color,
      });
    }
    this.spawn("ring", x, y, { life: 0.3, size: 0.2, color });
    for (let i = 0; i < 5; i++) this.spawn("twinkle", x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.6, { z: 0.3 + Math.random() * 0.6, vz: 0.6, life: 0.6, size: 0.08, color: "#ffffff" });
  }

  death(x: number, y: number, color: string) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3;
      this.spawn("star", x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 0.4, vz: 2 + Math.random() * 2, life: 0.7, size: 0.1, color,
      });
    }
  }

  dust(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn("smoke", x, y, {
        vx: Math.cos(a) * 2, vy: Math.sin(a) * 1.2, vz: 0.3, life: 0.5, size: 0.2, color: "#cfc3ad",
      });
    }
  }

  confetti(x: number, y: number, n = 24) {
    const cols = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#ff7ad9", "#ffffff"];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.5;
      this.spawn("confetti", x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, z: 0.8, vz: 3 + Math.random() * 3, life: 1 + Math.random() * 0.6,
        size: 0.06 + Math.random() * 0.04, color: cols[i % cols.length],
      });
    }
  }

  // --------------------------------------------------------------- boucle
  update(dt: number) {
    this.time += dt;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === "smoke") {
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.z += p.vz * dt;
      } else if (FLOAT.has(p.kind)) {
        p.z += p.vz * dt;
        p.vx *= 0.97;
        p.vy *= 0.97;
        if (p.kind === "petal" || p.kind === "flake" || p.kind === "bubble") p.x += Math.sin(this.time * 3 + p.rot) * dt * 0.25;
        if (p.z < 0) p.z = 0;
      } else if (p.kind === "confetti") {
        p.vz -= 7 * dt;
        p.vz = Math.max(p.vz, -1.2);
        p.z += p.vz * dt;
        p.vx *= 0.98;
        if (p.z < 0) {
          p.z = 0;
          p.vx = p.vy = 0;
        }
      } else if (p.kind !== "ring") {
        p.vz -= 14 * dt;
        p.z += p.vz * dt;
        if (p.z < 0) {
          p.z = 0;
          p.vz *= -0.35;
          p.vx *= 0.6;
          p.vy *= 0.6;
        }
      }
    }
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= dt * 0.9;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const m of this.marks) m.life -= dt;
    if (this.marks.length && this.marks[0].life <= 0) this.marks = this.marks.filter((m) => m.life > 0);
  }

  /** Traces au sol : à dessiner avant les blocs et les personnages. */
  drawMarks(ctx: CanvasRenderingContext2D, s: number) {
    for (const m of this.marks) {
      const k = Math.min(1, m.life / Math.min(1.5, m.max));
      const x = m.x * s;
      const y = m.y * s;
      const r = m.size * s;
      switch (m.kind) {
        case "scorch": {
          ctx.globalAlpha = 0.38 * k;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, "#1a1008");
          g.addColorStop(0.6, "rgba(40,24,12,0.7)");
          g.addColorStop(1, "rgba(40,24,12,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.8, m.rot, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "print": {
          ctx.globalAlpha = 0.5 * k;
          ctx.fillStyle = m.color;
          ctx.beginPath();
          ctx.ellipse(x, y, r * 0.5, r * 0.32, m.rot, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "frost": {
          ctx.globalAlpha = 0.55 * k;
          ctx.fillStyle = m.color;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = m.rot + (i * Math.PI) / 3;
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7);
            ctx.lineTo(x + Math.cos(a + 0.4) * r * 0.4, y + Math.sin(a + 0.4) * r * 0.28);
          }
          ctx.fill();
          break;
        }
        case "glow": {
          ctx.globalAlpha = 0.45 * k;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, m.color);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx: CanvasRenderingContext2D, ox: number, oy: number, s: number) {
    for (const p of this.pool) {
      if (!p.active) continue;
      const k = p.life / p.max;
      const x = ox + p.x * s;
      const y = oy + (p.y - p.z) * s;
      switch (p.kind) {
        case "smoke": {
          ctx.globalAlpha = k * 0.7;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, p.size * s * (1.6 - k * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "spark": {
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1.5, p.size * s * 0.8);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - p.vx * s * 0.03, y - (p.vy - p.vz) * s * 0.03);
          ctx.stroke();
          break;
        }
        case "streak": {
          ctx.globalAlpha = k * 0.7;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1.2, p.size * s * 0.5);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - p.vx * s * 0.12, y - p.vy * s * 0.12);
          ctx.stroke();
          break;
        }
        case "ring": {
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(2, s * 0.12 * k);
          ctx.beginPath();
          ctx.arc(x, y, s * (p.size + (1 - k) * 0.9), 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "star":
        case "twinkle": {
          ctx.globalAlpha = p.kind === "twinkle" ? Math.sin(k * Math.PI) : Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.kind === "twinkle" ? 0 : p.rot);
          const r = p.size * s * (p.kind === "twinkle" ? 0.6 + Math.sin(k * Math.PI) * 0.6 : 1);
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            ctx.lineTo(Math.cos(a + Math.PI / 4) * r * 0.35, Math.sin(a + Math.PI / 4) * r * 0.35);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case "chip":
        case "leaf":
        case "petal":
        case "confetti": {
          ctx.globalAlpha = p.kind === "confetti" ? Math.min(1, k * 3) : Math.min(1, k * 2.5);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rot);
          const r = p.size * s;
          if (p.kind === "leaf" || p.kind === "petal") {
            ctx.beginPath();
            ctx.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (p.kind === "confetti") {
            ctx.fillRect(-r, -r * 0.5 * Math.abs(Math.cos(p.rot * 2)), r * 2, r * Math.abs(Math.cos(p.rot * 2)) + 0.5);
          } else ctx.fillRect(-r, -r * 0.6, r * 2, r * 1.2);
          ctx.restore();
          break;
        }
        case "bubble": {
          const r = p.size * s;
          ctx.globalAlpha = Math.min(1, k * 2) * 0.85;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, r * 0.22);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.beginPath();
          ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "flake": {
          const r = p.size * s;
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, r * 0.3);
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const a = p.rot + (i * Math.PI) / 3;
            ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
            ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          }
          ctx.stroke();
          break;
        }
        case "heart": {
          const r = p.size * s;
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(x, y + r * 0.9);
          ctx.bezierCurveTo(x - r * 1.4, y - r * 0.2, x - r * 0.6, y - r * 1.2, x, y - r * 0.4);
          ctx.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.2, x, y + r * 0.9);
          ctx.fill();
          break;
        }
        case "note": {
          const r = p.size * s;
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, r * 0.25);
          ctx.beginPath();
          ctx.ellipse(x, y, r * 0.5, r * 0.38, -0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x + r * 0.45, y);
          ctx.lineTo(x + r * 0.45, y - r * 1.5);
          ctx.lineTo(x + r * 1.0, y - r * 1.1);
          ctx.stroke();
          break;
        }
        case "bolt": {
          const r = p.size * s;
          ctx.globalAlpha = k > 0.5 ? 1 : k * 2;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1.2, r * 0.25);
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(x - r * 0.3, y - r);
          ctx.lineTo(x + r * 0.2, y - r * 0.15);
          ctx.lineTo(x - r * 0.15, y + r * 0.05);
          ctx.lineTo(x + r * 0.3, y + r);
          ctx.stroke();
          break;
        }
        case "ember":
        case "glow": {
          const r = p.size * s;
          ctx.globalAlpha = Math.sin(k * Math.PI) * (p.kind === "glow" ? 0.6 : 1);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, r * (p.kind === "glow" ? 1.6 : 1), 0, Math.PI * 2);
          ctx.fill();
          if (p.kind === "ember") {
            ctx.globalAlpha *= 0.35;
            ctx.beginPath();
            ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    // textes flottants
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of this.texts) {
      const k = Math.min(1, t.life * 3);
      const x = ox + t.x * s;
      const y = oy + t.y * s;
      const pop = t.life > 0.95 ? 1 + (t.life - 0.95) * 4 : 1;
      ctx.globalAlpha = k;
      ctx.font = `800 ${Math.round(s * 0.42 * pop)}px "Baloo 2", system-ui, sans-serif`;
      ctx.lineWidth = Math.max(2, s * 0.12);
      ctx.strokeStyle = "#1a1626";
      ctx.strokeText(t.text, x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
    }
    ctx.globalAlpha = 1;
  }
}
