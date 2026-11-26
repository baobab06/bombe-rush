/**
 * VILLAGE DE NOËL : neige, sapins décorés, bonshommes de neige, cadeaux.
 * Le dessin seulement (les collisions viennent du plan, src/maps/xmas.ts).
 */
import { XMAS } from "../maps/xmas";
import type { Art } from "./art";
import { LIFT, hash } from "./sprites";

type Ctx = CanvasRenderingContext2D;
const now = () => (typeof performance !== "undefined" ? performance.now() / 1000 : 0);

function rr(g: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  g.fill();
}
function circle(g: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient) {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  g.fill();
}
function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient) {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  g.fill();
}

const INK = "#1d2340";
const BULBS = ["#ff4d6d", "#ffd23f", "#4cc9f0", "#8ae65a", "#ff9f1c"];

/** Sapin décoré (pilier). `big` : le grand sapin de la place, avec son étoile. */
function fir(g: Ctx, px: number, py: number, s: number, tx: number, ty: number, big = false) {
  const cx = px + s / 2;
  const lift = s * LIFT;
  const k = big ? 1.25 : 1;
  ellipse(g, cx + s * 0.05, py + s * 0.86, s * 0.42 * k, s * 0.13, "rgba(40,60,110,0.28)");
  rr(g, cx - s * 0.08, py + s * 0.62, s * 0.16, s * 0.22, s * 0.03, "#7a4a22");
  const tiers = [
    [0.5, 0.88, 0.46],
    [0.24, 0.62, 0.36],
    [0.02, 0.38, 0.26],
  ];
  for (const [top, bot, half] of tiers) {
    const y0 = py - lift * k + s * top * (big ? 0.9 : 1) - (big ? s * 0.18 : 0);
    const y1 = py - lift * 0.3 + s * bot - (big ? s * 0.06 : 0);
    g.fillStyle = "#1f7a46";
    g.beginPath();
    g.moveTo(cx, y0);
    g.lineTo(cx + s * half * k, y1);
    g.lineTo(cx - s * half * k, y1);
    g.closePath();
    g.fill();
    g.fillStyle = "#2fa65f";
    g.beginPath();
    g.moveTo(cx, y0);
    g.lineTo(cx - s * half * k * 0.15, y1);
    g.lineTo(cx - s * half * k, y1);
    g.closePath();
    g.fill();
    // neige sur les branches
    rr(g, cx - s * half * k, y1 - s * 0.04, s * half * k * 2, s * 0.05, s * 0.025, "#f4fbff");
  }
  // boules et guirlande lumineuse qui clignote
  const t = now();
  for (let i = 0; i < (big ? 9 : 5); i++) {
    const a = hash(tx, ty, i + 3);
    const yy = py - lift + s * (0.1 + 0.6 * ((i + 0.5) / (big ? 9 : 5)));
    const spread = (yy - (py - lift)) / s;
    const xx = cx + (a - 0.5) * s * spread * 0.8 * k;
    const on = Math.sin(t * 3 + i * 1.7 + tx) > -0.3;
    circle(g, xx, yy, s * 0.045 * k, on ? BULBS[(i + tx) % BULBS.length] : "#6b6b80");
    if (on) circle(g, xx - s * 0.012, yy - s * 0.012, s * 0.014, "rgba(255,255,255,0.8)");
  }
  // étoile
  const sy = py - lift * k - (big ? s * 0.26 : s * 0.02);
  const sr = s * (big ? 0.16 : 0.08);
  g.save();
  g.translate(cx, sy);
  g.rotate(Math.sin(t * 1.5) * 0.08);
  if (big) {
    const halo = g.createRadialGradient(0, 0, sr * 0.2, 0, 0, sr * 3);
    halo.addColorStop(0, "rgba(255,230,120,0.7)");
    halo.addColorStop(1, "rgba(255,230,120,0)");
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, sr * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#ffd23f";
  g.strokeStyle = "#b87800";
  g.lineWidth = Math.max(1, s * 0.015);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? sr * 0.45 : sr;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

/** Bonhomme de neige (pilier). */
function snowman(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const cx = px + s / 2;
  const lift = s * LIFT;
  ellipse(g, cx + s * 0.05, py + s * 0.86, s * 0.36, s * 0.12, "rgba(40,60,110,0.28)");
  const body = (x: number, y: number, r: number) => {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, "#ffffff");
    gr.addColorStop(1, "#c9dcf0");
    circle(g, x, y, r, gr);
  };
  body(cx, py - lift * 0.3 + s * 0.6, s * 0.3);
  body(cx, py - lift + s * 0.3, s * 0.21);
  // écharpe
  rr(g, cx - s * 0.2, py - lift + s * 0.44, s * 0.4, s * 0.08, s * 0.04, hash(tx, ty) < 0.5 ? "#e63946" : "#2f8fe0");
  rr(g, cx + s * 0.06, py - lift + s * 0.46, s * 0.08, s * 0.18, s * 0.03, hash(tx, ty) < 0.5 ? "#c22d39" : "#2272b8");
  // yeux, carotte, boutons
  circle(g, cx - s * 0.07, py - lift + s * 0.26, s * 0.025, INK);
  circle(g, cx + s * 0.07, py - lift + s * 0.26, s * 0.025, INK);
  g.fillStyle = "#ff8a1f";
  g.beginPath();
  g.moveTo(cx, py - lift + s * 0.31);
  g.lineTo(cx + s * 0.16, py - lift + s * 0.34);
  g.lineTo(cx, py - lift + s * 0.36);
  g.fill();
  for (const k of [0.62, 0.74]) circle(g, cx, py - lift * 0.3 + s * k, s * 0.025, INK);
  // chapeau
  rr(g, cx - s * 0.16, py - lift + s * 0.1, s * 0.32, s * 0.05, s * 0.02, INK);
  rr(g, cx - s * 0.1, py - lift - s * 0.06, s * 0.2, s * 0.18, s * 0.03, INK);
  rr(g, cx - s * 0.1, py - lift + s * 0.04, s * 0.2, s * 0.04, 0, "#e63946");
}

/** Cadeau emballé (bloc destructible). */
const WRAP: [string, string, string][] = [
  ["#e63946", "#a51d2a", "#ffd23f"],
  ["#2fa65f", "#1b7040", "#ffffff"],
  ["#2f8fe0", "#1d5fa0", "#ffd23f"],
  ["#9b5de5", "#6a35b0", "#ffffff"],
  ["#ffd23f", "#c99a10", "#e63946"],
];
function gift(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const lift = s * LIFT;
  const [main, side, ribbon] = WRAP[Math.floor(hash(tx, ty, 9) * WRAP.length)];
  const x = px + s * 0.08;
  const w = s * 0.84;
  rr(g, x + s * 0.04, py + s * 0.12, w, s * 0.84, s * 0.08, "rgba(40,60,110,0.3)");
  // face avant
  rr(g, x, py - lift + s * 0.28, w, s * 0.66 + lift * 0.7, s * 0.07, side);
  rr(g, x, py - lift + s * 0.08, w, s * 0.66, s * 0.08, main);
  // motif (pois)
  g.fillStyle = "rgba(255,255,255,0.22)";
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(x + w * (0.18 + (i % 3) * 0.32), py - lift + s * (0.24 + Math.floor(i / 3) * 0.32), s * 0.04, 0, Math.PI * 2);
    g.fill();
  }
  // ruban
  rr(g, x + w / 2 - s * 0.06, py - lift + s * 0.08, s * 0.12, s * 0.66 + lift * 0.7, 0, ribbon);
  rr(g, x, py - lift + s * 0.34, w, s * 0.11, 0, ribbon);
  // nœud
  const bx = px + s / 2;
  const by = py - lift + s * 0.08;
  g.fillStyle = ribbon;
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = Math.max(1, s * 0.015);
  for (const d of [-1, 1]) {
    g.beginPath();
    g.ellipse(bx + d * s * 0.12, by - s * 0.02, s * 0.12, s * 0.07, d * 0.5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  circle(g, bx, by, s * 0.05, ribbon);
}

/** Maisonnette en pain d'épices avec guirlande (décor du bord). */
function cottage(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const cx = px + s / 2;
  rr(g, px + s * 0.1, py + s * 0.35, s * 0.8, s * 0.58, s * 0.05, "#b5713a");
  g.fillStyle = "#f4fbff";
  g.beginPath();
  g.moveTo(px + s * 0.02, py + s * 0.4);
  g.lineTo(cx, py + s * 0.02);
  g.lineTo(px + s * 0.98, py + s * 0.4);
  g.closePath();
  g.fill();
  rr(g, cx - s * 0.1, py + s * 0.6, s * 0.2, s * 0.33, s * 0.05, "#6b3d1a");
  const t = now();
  const lit = Math.sin(t * 2 + tx * 1.3 + ty) > 0;
  rr(g, px + s * 0.18, py + s * 0.5, s * 0.16, s * 0.14, s * 0.02, lit ? "#ffe27a" : "#ffc94a");
  rr(g, px + s * 0.66, py + s * 0.5, s * 0.16, s * 0.14, s * 0.02, lit ? "#ffc94a" : "#ffe27a");
  for (let i = 0; i < 6; i++) circle(g, px + s * (0.12 + i * 0.15), py + s * 0.38, s * 0.028, BULBS[(i + tx + Math.floor(t * 2)) % BULBS.length]);
}

const isCenter = (tx: number, ty: number) => tx === 7 && ty === 5;

export const XMAS_ART: Art = {
  id: "xmas",
  background: "#bcd6f2",
  ink: INK,
  farVeil: "rgba(40, 70, 130, 0.25)",
  floor: (g, px, py, s, tx, ty) => {
    g.fillStyle = (tx + ty) % 2 ? "#f3f8ff" : "#e9f2fc";
    g.fillRect(px, py, s, s);
    // place du village (autour du grand sapin) : pavés
    const plaza = Math.abs(tx - 7) <= 2 && Math.abs(ty - 5) <= 1;
    if (plaza || XMAS.layout[ty]?.[tx] === "_") {
      g.fillStyle = "#c7d3e3";
      g.fillRect(px, py, s, s);
      g.fillStyle = "#dbe4f0";
      for (let i = 0; i < 4; i++) rr(g, px + s * (0.06 + (i % 2) * 0.48), py + s * (0.06 + Math.floor(i / 2) * 0.48), s * 0.42, s * 0.42, s * 0.08, "#dbe4f0");
      if (hash(tx, ty, 3) < 0.5) ellipse(g, px + s * 0.5, py + s * 0.85, s * 0.3, s * 0.08, "#f4fbff");
      return;
    }
    // neige scintillante, traces de pas
    if (hash(tx, ty, 7) < 0.35) circle(g, px + s * hash(tx, ty, 8), py + s * hash(tx, ty, 9), s * 0.02, "#ffffff");
    if (hash(tx, ty, 10) < 0.15) {
      for (let i = 0; i < 3; i++) ellipse(g, px + s * (0.3 + i * 0.18), py + s * (0.35 + (i % 2) * 0.2), s * 0.035, s * 0.05, "#d6e3f3");
    }
  },
  border: (g, px, py, s, tx, ty, ring) => {
    if (!ring) {
      g.fillStyle = (tx + ty) % 2 ? "#dfeaf7" : "#d8e5f5";
      g.fillRect(px - 1, py - 1, s + 2, s + 2);
      const h = hash(tx, ty, 17);
      if (h < 0.18) fir(g, px, py + s * 0.1, s * 0.8, tx, ty);
      else if (h < 0.26) cottage(g, px, py, s, tx, ty);
      return;
    }
    // muret enneigé avec guirlande lumineuse
    g.fillStyle = "#8a5a3a";
    g.fillRect(px - 1, py - 1, s + 2, s + 2);
    rr(g, px + s * 0.04, py + s * 0.08, s * 0.92, s * 0.86, s * 0.08, "#a36a43");
    rr(g, px, py, s, s * 0.28, s * 0.12, "#f7fbff");
    const t = now();
    const on = Math.sin(t * 2.5 + tx * 0.9 + ty * 0.7) > -0.2;
    circle(g, px + s * 0.5, py + s * 0.4, s * 0.07, on ? BULBS[(tx * 3 + ty) % BULBS.length] : "#5a4a50");
  },
  terrain: () => {},
  pillar: (ctx, px, py, s, tx, ty) => {
    if (isCenter(tx, ty)) return fir(ctx, px, py, s, tx, ty, true);
    if (hash(tx, ty, 4) < 0.3) snowman(ctx, px, py, s, tx, ty);
    else fir(ctx, px, py, s, tx, ty);
  },
  block: (ctx, px, py, s, tx, ty) => gift(ctx, px, py, s, tx, ty),
  debris: (tx, ty) => {
    const [a, , c] = WRAP[Math.floor(hash(tx, ty, 9) * WRAP.length)];
    return [a, c, "#ffffff"];
  },
};
