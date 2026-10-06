/**
 * Sprites procéduraux (aucune image externe). Chaque fonction dessine
 * un élément à une taille de case `s` donnée. Pour remplacer un
 * personnage ou un bloc par une vraie illustration plus tard, il suffit
 * de remplacer la fonction correspondante par un drawImage.
 */
import { FIRE } from "../core/types";
import type { Theme } from "./themes";

type Ctx = CanvasRenderingContext2D;

export const LIFT = 0.24; // hauteur « 2.5D » des blocs, en fraction de case

export function hash(x: number, y: number, k = 0): number {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ------------------------------------------------------------------ sol
export function drawGrassTile(ctx: Ctx, px: number, py: number, s: number, tx: number, ty: number, th: Theme) {
  ctx.fillStyle = (tx + ty) % 2 === 0 ? th.grassA : th.grassB;
  ctx.fillRect(px, py, s, s);
  // touffes d'herbe
  ctx.strokeStyle = th.grassDetail;
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.lineCap = "round";
  const n = 2 + Math.floor(hash(tx, ty) * 3);
  for (let i = 0; i < n; i++) {
    const gx = px + s * (0.15 + hash(tx, ty, i * 3 + 1) * 0.7);
    const gy = py + s * (0.2 + hash(tx, ty, i * 3 + 2) * 0.7);
    const g = s * 0.09;
    ctx.beginPath();
    ctx.moveTo(gx - g * 0.6, gy);
    ctx.lineTo(gx - g * 0.9, gy - g);
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, gy - g * 1.25);
    ctx.moveTo(gx + g * 0.6, gy);
    ctx.lineTo(gx + g * 0.9, gy - g);
    ctx.stroke();
  }
  // petite fleur de temps en temps
  if (hash(tx, ty, 99) < 0.18) {
    const fx = px + s * (0.25 + hash(tx, ty, 7) * 0.5);
    const fy = py + s * (0.25 + hash(tx, ty, 8) * 0.5);
    const c = th.flowerColors[Math.floor(hash(tx, ty, 9) * th.flowerColors.length)];
    const r = s * 0.055;
    ctx.fillStyle = c;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(fx + Math.cos(a) * r, fy + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffb52e";
    ctx.beginPath();
    ctx.arc(fx, fy, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Bordure de l'arène : une haie d'arbres vus de dessus. */
export function drawBorderTree(ctx: Ctx, px: number, py: number, s: number, tx: number, ty: number, th: Theme) {
  const cx = px + s / 2 + (hash(tx, ty, 1) - 0.5) * s * 0.18;
  const cy = py + s / 2 + (hash(tx, ty, 2) - 0.5) * s * 0.18;
  const r = s * (0.62 + hash(tx, ty, 3) * 0.14);
  ctx.fillStyle = th.border.leafDark;
  ctx.beginPath();
  ctx.arc(cx, cy + s * 0.08, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = th.border.leafMid;
  ctx.beginPath();
  ctx.arc(cx - s * 0.05, cy - s * 0.02, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = th.border.leafLight;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.arc(
      cx - s * 0.18 + hash(tx, ty, 10 + k) * s * 0.3,
      cy - s * 0.2 + hash(tx, ty, 20 + k) * s * 0.25,
      r * (0.22 + hash(tx, ty, 30 + k) * 0.12),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

// --------------------------------------------------------------- blocs
/** Pierre indestructible (pilier) avec mousse. (px,py) = coin haut-gauche de la case. */
export function drawStone(ctx: Ctx, px: number, py: number, s: number, th: Theme, seed: number) {
  const lift = s * LIFT;
  const pad = s * 0.04;
  // ombre portée
  ctx.fillStyle = th.shadow;
  rr(ctx, px + pad + s * 0.06, py + pad + s * 0.08, s - pad * 2, s - pad * 2, s * 0.22);
  ctx.fill();
  // face avant
  ctx.fillStyle = th.stone.side;
  rr(ctx, px + pad, py - lift + pad, s - pad * 2, s - pad, s * 0.24);
  ctx.fill();
  // dessus
  ctx.fillStyle = th.stone.top;
  rr(ctx, px + pad, py - lift + pad, s - pad * 2, s - pad * 2 - lift * 0.2, s * 0.24);
  ctx.fill();
  // reflet
  ctx.fillStyle = th.stone.light;
  rr(ctx, px + s * 0.2, py - lift + s * 0.14, s * 0.32, s * 0.12, s * 0.06);
  ctx.fill();
  // grain de la pierre
  ctx.fillStyle = th.stone.side;
  for (let k = 0; k < 4; k++) {
    const gx = px + s * (0.22 + hash(k, seed * 1000, 1) * 0.56);
    const gy = py - lift + s * (0.36 + hash(k, seed * 1000, 2) * 0.36);
    ctx.beginPath();
    ctx.arc(gx, gy, s * (0.025 + hash(k, seed * 1000, 3) * 0.025), 0, Math.PI * 2);
    ctx.fill();
  }
  // mousse
  ctx.fillStyle = th.stone.moss;
  ctx.beginPath();
  ctx.ellipse(px + s * (0.3 + seed * 0.3), py - lift + s * 0.12, s * 0.2, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Caisse en bois destructible. */
export function drawCrate(ctx: Ctx, px: number, py: number, s: number, th: Theme) {
  const lift = s * LIFT;
  const pad = s * 0.07;
  const w = s - pad * 2;
  ctx.fillStyle = th.shadow;
  rr(ctx, px + pad + s * 0.06, py + pad + s * 0.06, w, w, s * 0.08);
  ctx.fill();
  ctx.fillStyle = th.crate.side;
  rr(ctx, px + pad, py - lift + pad, w, w + lift * 0.9, s * 0.1);
  ctx.fill();
  ctx.fillStyle = th.crate.top;
  rr(ctx, px + pad, py - lift + pad, w, w - lift * 0.1, s * 0.1);
  ctx.fill();
  // planches
  ctx.strokeStyle = th.crate.plank;
  ctx.lineWidth = Math.max(1, s * 0.04);
  for (let k = 1; k < 3; k++) {
    const yy = py - lift + pad + (w * k) / 3;
    ctx.beginPath();
    ctx.moveTo(px + pad + s * 0.05, yy);
    ctx.lineTo(px + pad + w - s * 0.05, yy);
    ctx.stroke();
  }
  // croisillon
  ctx.strokeStyle = th.crate.band;
  ctx.lineWidth = Math.max(1.5, s * 0.075);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px + pad + s * 0.1, py - lift + pad + s * 0.1);
  ctx.lineTo(px + pad + w - s * 0.1, py - lift + pad + w - s * 0.12);
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  rr(ctx, px + pad + s * 0.03, py - lift + pad + s * 0.03, w - s * 0.06, w - s * 0.08, s * 0.08);
  ctx.stroke();
}

/** Buisson / petit arbre destructible. */
export function drawBush(ctx: Ctx, px: number, py: number, s: number, th: Theme, seed: number) {
  const lift = s * LIFT;
  const cx = px + s / 2;
  const cy = py + s / 2 - lift * 0.6;
  ctx.fillStyle = th.shadow;
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.06, py + s * 0.62, s * 0.42, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = th.bush.side;
  ctx.beginPath();
  ctx.arc(cx, cy + lift * 0.5, s * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = th.bush.top;
  const lobes: [number, number, number][] = [
    [-0.18, -0.06, 0.26],
    [0.17, -0.08, 0.25],
    [0, -0.22, 0.24],
    [0, 0.08, 0.27],
  ];
  for (const [dx, dy, r] of lobes) {
    ctx.beginPath();
    ctx.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = th.bush.light;
  ctx.beginPath();
  ctx.arc(cx - s * 0.12, cy - s * 0.2, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
  if (seed > 0.45) {
    ctx.fillStyle = th.bush.berry;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(cx + (hash(k, seed * 100) - 0.5) * s * 0.5, cy + (hash(seed * 100, k) - 0.4) * s * 0.4, s * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawShield(ctx: Ctx, cx: number, cy: number, s: number, t: number, remaining: number) {
  const blink = remaining < 0.8 ? (Math.sin(t * 30) > 0 ? 1 : 0.35) : 1;
  const r = s * (0.52 + Math.sin(t * 6) * 0.02);
  const y = cy - s * 0.02;
  ctx.save();
  ctx.globalAlpha = 0.9 * blink;
  const g = ctx.createRadialGradient(cx - r * 0.3, y - r * 0.4, r * 0.1, cx, y, r);
  g.addColorStop(0, "rgba(255,255,255,0.55)");
  g.addColorStop(0.55, "rgba(120,220,255,0.18)");
  g.addColorStop(1, "rgba(90,200,255,0.5)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(170,240,255,0.95)";
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.setLineDash([s * 0.18, s * 0.1]);
  ctx.lineDashOffset = -t * s * 1.2;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- bombe
export function drawBomb(ctx: Ctx, cx: number, cy: number, s: number, fuseRatio: number, t: number, spawnT: number, fuseLeft = 9, warn = 0.55) {
  // pulsation qui s'accélère quand la mèche raccourcit
  const urgency = 1 - fuseRatio;
  // phase d'alerte : 0 → 1 pendant les dernières `warn` secondes
  const alarm = fuseLeft < warn ? 1 - Math.max(0, fuseLeft) / warn : 0;
  const freq = 5 + urgency * 22 + alarm * 26;
  const pulse = 1 + Math.sin(t * freq) * (0.04 + urgency * 0.06) + alarm * 0.14;
  const pop = spawnT < 0.15 ? 0.6 + (spawnT / 0.15) * 0.4 + Math.sin((spawnT / 0.15) * Math.PI) * 0.2 : 1;
  const r = s * 0.33 * pulse * pop;
  // la bombe tremble juste avant d'exploser
  if (alarm > 0) {
    cx += (Math.random() - 0.5) * s * 0.06 * alarm;
    cy += (Math.random() - 0.5) * s * 0.04 * alarm;
  }
  const by = cy + s * 0.04;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.32, s * 0.3, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  // halo rouge d'alerte
  if (alarm > 0) {
    const hr = r * (1.6 + alarm * 0.6);
    const hg = ctx.createRadialGradient(cx, by, r * 0.6, cx, by, hr);
    hg.addColorStop(0, `rgba(255,60,40,${0.55 * alarm * (0.7 + 0.3 * Math.sin(t * 40))})`);
    hg.addColorStop(1, "rgba(255,60,40,0)");
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(cx, by, hr, 0, Math.PI * 2);
    ctx.fill();
  }
  // alerte : toujours rouge, éclairs blancs de plus en plus fréquents
  const flash = alarm > 0 || (fuseRatio < 0.45 && Math.sin(t * freq) > 0.3);
  const white = alarm > 0.2 && Math.sin(t * freq) > 0.55 - alarm * 0.4;
  const g = ctx.createRadialGradient(cx - r * 0.35, by - r * 0.4, r * 0.1, cx, by, r);
  g.addColorStop(0, white ? "#ffffff" : flash ? "#ff8a7a" : "#5b5f8a");
  g.addColorStop(1, white ? "#ffb0a0" : flash ? "#c2182b" : "#1b1c33");
  ctx.fillStyle = g;
  ctx.strokeStyle = "#0e0f1d";
  ctx.lineWidth = Math.max(1.2, s * 0.045);
  ctx.beginPath();
  ctx.arc(cx, by, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // bouchon
  ctx.fillStyle = "#8b8fb3";
  ctx.beginPath();
  ctx.roundRect(cx + r * 0.25, by - r * 1.08, r * 0.45, r * 0.32, r * 0.08);
  ctx.fill();
  ctx.stroke();
  // mèche
  const fl = 0.15 + fuseRatio * 0.3;
  ctx.strokeStyle = "#e8d8b0";
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.beginPath();
  const fx0 = cx + r * 0.48;
  const fy0 = by - r * 1.05;
  const fx1 = fx0 + s * fl * 0.6;
  const fy1 = fy0 - s * fl * 0.7;
  ctx.moveTo(fx0, fy0);
  ctx.quadraticCurveTo(fx0 + s * 0.02, fy1, fx1, fy1);
  ctx.stroke();
  // étincelle
  const sp = s * (0.07 + Math.random() * 0.04) * (1 + alarm * 0.9);
  ctx.fillStyle = "#fff6b0";
  ctx.beginPath();
  ctx.arc(fx1, fy1, sp * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffb020";
  ctx.lineWidth = Math.max(1, s * 0.03);
  for (let k = 0; k < 4; k++) {
    const a = t * 20 + (k * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(fx1 + Math.cos(a) * sp * 0.5, fy1 + Math.sin(a) * sp * 0.5);
    ctx.lineTo(fx1 + Math.cos(a) * sp * 1.4, fy1 + Math.sin(a) * sp * 1.4);
    ctx.stroke();
  }
  // reflet
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.38, by - r * 0.38, r * 0.2, r * 0.13, -0.7, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------- bonus
export const BONUS_COLORS: Record<string, [string, string]> = {
  bomb: ["#5d6cff", "#2f3bb8"],
  flame: ["#ff7a2e", "#c4400f"],
  speed: ["#3fd17a", "#1c8c4a"],
  shield: ["#3fc6ff", "#1a7fb8"],
};

export function drawBonusIcon(ctx: Ctx, cx: number, cy: number, s: number, type: string) {
  const ink = "#1b1b2e";
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.strokeStyle = ink;
  ctx.lineJoin = "round";
  switch (type) {
    case "bomb": {
      ctx.fillStyle = "#23243d";
      ctx.beginPath();
      ctx.arc(cx - s * 0.02, cy + s * 0.04, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.1, cy - s * 0.12);
      ctx.quadraticCurveTo(cx + s * 0.16, cy - s * 0.24, cx + s * 0.24, cy - s * 0.22);
      ctx.stroke();
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.arc(cx + s * 0.25, cy - s * 0.23, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.arc(cx - s * 0.09, cy - s * 0.03, s * 0.05, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "flame": {
      const flame = (k: number, col: string) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.28 * k);
        ctx.bezierCurveTo(cx + s * 0.22 * k, cy - s * 0.05 * k, cx + s * 0.2 * k, cy + s * 0.22 * k, cx, cy + s * 0.24 * k);
        ctx.bezierCurveTo(cx - s * 0.2 * k, cy + s * 0.22 * k, cx - s * 0.22 * k, cy - s * 0.02 * k, cx - s * 0.06 * k, cy - s * 0.12 * k);
        ctx.quadraticCurveTo(cx - s * 0.02 * k, cy - s * 0.04 * k, cx, cy - s * 0.28 * k);
        ctx.fill();
      };
      flame(1, "#fff1a8");
      ctx.save();
      ctx.translate(cx, cy + s * 0.06);
      ctx.translate(-cx, -cy);
      flame(0.6, "#ffb020");
      ctx.restore();
      break;
    }
    case "speed": {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.2, cy + s * 0.14);
      ctx.lineTo(cx - s * 0.16, cy - s * 0.16);
      ctx.lineTo(cx + s * 0.02, cy - s * 0.16);
      ctx.lineTo(cx + s * 0.04, cy - s * 0.02);
      ctx.quadraticCurveTo(cx + s * 0.24, cy + s * 0.0, cx + s * 0.25, cy + s * 0.14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ff5a4f";
      ctx.fillRect(cx - s * 0.2, cy + s * 0.08, s * 0.45, s * 0.06);
      // traits de vitesse
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(1, s * 0.04);
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.36, cy - s * 0.08 + k * s * 0.12);
        ctx.lineTo(cx - s * 0.26, cy - s * 0.08 + k * s * 0.12);
        ctx.stroke();
      }
      break;
    }
    case "shield": {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.25);
      ctx.lineTo(cx + s * 0.2, cy - s * 0.17);
      ctx.quadraticCurveTo(cx + s * 0.2, cy + s * 0.14, cx, cy + s * 0.26);
      ctx.quadraticCurveTo(cx - s * 0.2, cy + s * 0.14, cx - s * 0.2, cy - s * 0.17);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#3fc6ff";
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.16);
      ctx.lineTo(cx + s * 0.11, cy - s * 0.11);
      ctx.quadraticCurveTo(cx + s * 0.11, cy + s * 0.08, cx, cy + s * 0.16);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
}

export function drawBonus(ctx: Ctx, cx: number, cy: number, s: number, type: string, t: number, age: number) {
  const [c1, c2] = BONUS_COLORS[type] ?? ["#ccc", "#888"];
  const appear = Math.min(1, age / 0.25);
  const sc = appear < 1 ? appear * (1 + Math.sin(appear * Math.PI) * 0.35) : 1;
  const bob = Math.sin(t * 4 + cx) * s * 0.04;
  const w = s * 0.66 * sc;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.3, s * 0.26 * sc, s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  const y = cy - s * 0.04 + bob;
  ctx.fillStyle = c2;
  rr(ctx, cx - w / 2, y - w / 2 + s * 0.05, w, w, w * 0.28);
  ctx.fill();
  ctx.fillStyle = c1;
  rr(ctx, cx - w / 2, y - w / 2, w, w, w * 0.28);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(1, s * 0.04);
  rr(ctx, cx - w / 2 + s * 0.04, y - w / 2 + s * 0.04, w - s * 0.08, w - s * 0.08, w * 0.22);
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (sc > 0.3) drawBonusIcon(ctx, cx, y, s * 0.85 * sc, type);
  // éclat
  const glint = (t * 0.7 + cx * 0.01) % 2;
  if (glint < 0.25) {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.arc(cx + w * 0.3, y - w * 0.3, s * 0.05 * (1 - Math.abs(glint - 0.125) * 8), 0, Math.PI * 2);
    ctx.fill();
  }
}

// ------------------------------------------------------------------ feu
/** Flamme d'une case. intensity 1 → 0 au fil de sa durée. */
export function drawFire(ctx: Ctx, px: number, py: number, s: number, mask: number, intensity: number, t: number, layer: 0 | 1 | 2) {
  const cx = px + s / 2;
  const cy = py + s / 2;
  // épaisseur : forte au début, s'amincit en fin de vie
  const life = Math.min(1, intensity * 1.6);
  const flick = 1 + Math.sin(t * 40 + px * 0.3 + py * 0.2) * 0.06;
  const widths = [0.86, 0.6, 0.3];
  const colors = ["#ff5a1f", "#ffc23d", "#fffbe6"];
  const w = s * widths[layer] * life * flick;
  ctx.fillStyle = colors[layer];
  const isCenter = (mask & FIRE.CENTER) !== 0;
  const h = (mask & (FIRE.L | FIRE.R)) !== 0;
  const v = (mask & (FIRE.U | FIRE.D)) !== 0;
  ctx.beginPath();
  if (isCenter) {
    ctx.arc(cx, cy, w * 0.62, 0, Math.PI * 2);
  }
  // bras horizontaux
  if (h) {
    const x0 = mask & FIRE.L ? px - 0.5 : cx - w / 2;
    const x1 = mask & FIRE.R ? px + s + 0.5 : cx + w / 2;
    ctx.roundRect(x0, cy - w / 2, x1 - x0, w, w / 2);
  }
  if (v) {
    const y0 = mask & FIRE.U ? py - 0.5 : cy - w / 2;
    const y1 = mask & FIRE.D ? py + s + 0.5 : cy + w / 2;
    ctx.roundRect(cx - w / 2, y0, w, y1 - y0, w / 2);
  }
  ctx.fill();
}
