/**
 * Direction artistique de chaque map. Le renderer ne connaît que cette
 * interface : ajouter une map = ajouter un `Art` ici.
 */
import { TERRAIN } from "../core/types";
import { LIFT, drawBorderTree, drawBush, drawCrate, drawGrassTile, drawStone, hash } from "./sprites";
import { THEMES, type Theme } from "./themes";

type Ctx = CanvasRenderingContext2D;

export interface Art {
  id: string;
  /** couleur de fond / sous la forêt lointaine */
  background: string;
  ink: string;
  /** voile sur le décor hors arène */
  farVeil: string;
  /** sol praticable (cuit dans la couche de fond) */
  floor(g: Ctx, px: number, py: number, s: number, tx: number, ty: number): void;
  /** bordure de l'arène (ring = anneau extérieur de l'arène, sinon décor lointain) */
  border(g: Ctx, px: number, py: number, s: number, tx: number, ty: number, ring: boolean): void;
  /** sol spécial statique (lave, eau, glace, cheminée) */
  terrain(g: Ctx, kind: number, px: number, py: number, s: number, tx: number, ty: number): void;
  /** animation par-dessus le sol spécial (vagues, bulles, alerte d'éruption) */
  animate?(ctx: Ctx, kind: number, px: number, py: number, s: number, tx: number, ty: number, t: number, warn: number): void;
  pillar(ctx: Ctx, px: number, py: number, s: number, tx: number, ty: number): void;
  block(ctx: Ctx, px: number, py: number, s: number, tx: number, ty: number): void;
  debris(tx: number, ty: number): string[];
}

// ------------------------------------------------------------- outils
function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function circle(ctx: Ctx, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  ctx.fill();
}
function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  ctx.fill();
}

// ============================================================== FORÊT
const forestTheme = THEMES.forest;
const FOREST: Art = {
  id: "forest",
  background: forestTheme.border.leafDark,
  ink: forestTheme.ink,
  farVeil: "rgba(6, 18, 10, 0.5)",
  floor: (g, px, py, s, tx, ty) => drawGrassTile(g, px, py, s, tx, ty, forestTheme),
  border: (g, px, py, s, tx, ty) => drawBorderTree(g, px, py, s, tx, ty, forestTheme),
  terrain: () => {},
  pillar: (ctx, px, py, s, tx, ty) => drawStone(ctx, px, py, s, forestTheme, hash(tx, ty)),
  block: (ctx, px, py, s, tx, ty) => {
    if (hash(tx, ty, 5) < 0.5) drawBush(ctx, px, py, s, forestTheme, hash(tx, ty, 6));
    else drawCrate(ctx, px, py, s, forestTheme);
  },
  debris: (tx, ty) => {
    const t = forestTheme;
    return hash(tx, ty, 5) < 0.5 ? [t.bush.top, t.bush.light, t.bush.side] : [t.crate.top, t.crate.side, t.crate.plank];
  },
};

// ============================================================== VOLCAN
const volcanoTheme: Theme = {
  ...forestTheme,
  id: "volcano",
  shadow: "rgba(10, 0, 0, 0.4)",
  ink: "#1a0f0d",
  stone: { top: "#4a3b3d", side: "#2a1f22", light: "#6d5a5c", moss: "#ff7a2a" },
  crate: { top: "#7a4a32", side: "#4a2a1a", plank: "#5e3624", band: "#2a1610" },
};

function magmaRock(ctx: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const lift = s * LIFT;
  const cx = px + s / 2;
  ellipse(ctx, cx + s * 0.05, py + s * 0.66, s * 0.44, s * 0.26, "rgba(10,0,0,0.4)");
  // masse rocheuse en 2.5D
  ctx.fillStyle = "#3a2622";
  ctx.beginPath();
  ctx.roundRect(px + s * 0.07, py - lift + s * 0.12, s * 0.86, s * 0.82 + lift * 0.6, s * 0.28);
  ctx.fill();
  ctx.fillStyle = "#5a3a30";
  ctx.beginPath();
  ctx.roundRect(px + s * 0.07, py - lift + s * 0.08, s * 0.86, s * 0.74, s * 0.28);
  ctx.fill();
  // fissures incandescentes
  ctx.strokeStyle = "#ff8a2a";
  ctx.lineWidth = Math.max(1.2, s * 0.05);
  ctx.lineCap = "round";
  ctx.beginPath();
  const a = hash(tx, ty, 2);
  ctx.moveTo(px + s * (0.25 + a * 0.1), py - lift + s * 0.25);
  ctx.lineTo(px + s * 0.45, py - lift + s * 0.45);
  ctx.lineTo(px + s * (0.4 + a * 0.15), py - lift + s * 0.68);
  ctx.moveTo(px + s * 0.45, py - lift + s * 0.45);
  ctx.lineTo(px + s * 0.7, py - lift + s * (0.35 + a * 0.15));
  ctx.stroke();
  ctx.strokeStyle = "#ffd36a";
  ctx.lineWidth = Math.max(0.8, s * 0.02);
  ctx.stroke();
  ellipse(ctx, px + s * 0.3, py - lift + s * 0.18, s * 0.12, s * 0.05, "rgba(255,255,255,0.18)", -0.3);
}

const VOLCANO: Art = {
  id: "volcano",
  background: "#1b0d0b",
  ink: "#1a0f0d",
  farVeil: "rgba(20, 4, 2, 0.55)",
  floor: (g, px, py, s, tx, ty) => {
    g.fillStyle = (tx + ty) % 2 === 0 ? "#3d2c2a" : "#372725";
    g.fillRect(px, py, s, s);
    // grain de basalte
    for (let k = 0; k < 3; k++) {
      circle(g, px + s * (0.2 + hash(tx, ty, k) * 0.6), py + s * (0.2 + hash(tx, ty, k + 9) * 0.6), s * 0.03, "#2a1d1c");
    }
    // braises éparses
    if (hash(tx, ty, 40) < 0.2) {
      g.strokeStyle = "rgba(255,110,40,0.55)";
      g.lineWidth = Math.max(1, s * 0.03);
      g.beginPath();
      g.moveTo(px + s * 0.2, py + s * 0.7);
      g.lineTo(px + s * 0.42, py + s * 0.6);
      g.lineTo(px + s * 0.55, py + s * 0.78);
      g.stroke();
    }
  },
  border: (g, px, py, s, tx, ty, ring) => {
    // montagne de roche sombre avec coulées
    const cx = px + s / 2 + (hash(tx, ty, 1) - 0.5) * s * 0.2;
    const cy = py + s / 2 + (hash(tx, ty, 2) - 0.5) * s * 0.2;
    const r = s * (0.62 + hash(tx, ty, 3) * 0.14);
    ellipse(g, cx, cy + s * 0.1, r, r * 0.9, "#1f1312");
    ellipse(g, cx - s * 0.04, cy - s * 0.02, r * 0.8, r * 0.72, "#33221f");
    ellipse(g, cx - s * 0.12, cy - s * 0.14, r * 0.3, r * 0.2, "#4a3430");
    if (ring && hash(tx, ty, 7) < 0.3) {
      g.strokeStyle = "#ff6a2a";
      g.lineWidth = Math.max(1.5, s * 0.06);
      g.beginPath();
      g.moveTo(cx - s * 0.1, cy - s * 0.25);
      g.quadraticCurveTo(cx + s * 0.05, cy, cx - s * 0.05, cy + s * 0.3);
      g.stroke();
    }
  },
  terrain: (g, kind, px, py, s, tx, ty) => {
    if (kind === TERRAIN.LAVA) {
      g.fillStyle = "#c2260f";
      g.fillRect(px, py, s, s);
      const grd = g.createRadialGradient(px + s / 2, py + s / 2, s * 0.05, px + s / 2, py + s / 2, s * 0.7);
      grd.addColorStop(0, "#ffcf4a");
      grd.addColorStop(0.45, "#ff7a1a");
      grd.addColorStop(1, "#c2260f");
      g.fillStyle = grd;
      g.fillRect(px, py, s, s);
      for (let k = 0; k < 3; k++) circle(g, px + s * (0.2 + hash(tx, ty, k) * 0.6), py + s * (0.2 + hash(tx, ty, k + 4) * 0.6), s * 0.06, "#ffe08a");
      // bord rocheux
      g.strokeStyle = "rgba(40,10,5,0.55)";
      g.lineWidth = Math.max(1, s * 0.05);
      g.strokeRect(px + 1, py + 1, s - 2, s - 2);
    } else if (kind === TERRAIN.VENT) {
      ellipse(g, px + s / 2, py + s / 2, s * 0.42, s * 0.36, "#241615");
      ellipse(g, px + s / 2, py + s / 2, s * 0.3, s * 0.25, "#120807");
      ellipse(g, px + s / 2, py + s * 0.52, s * 0.16, s * 0.12, "#7a1a0a");
    }
  },
  animate: (ctx, kind, px, py, s, tx, ty, t, warn) => {
    if (kind === TERRAIN.LAVA) {
      // bulles qui éclosent
      const ph = (t * 0.8 + hash(tx, ty, 9) * 3) % 3;
      if (ph < 1) {
        const k = ph;
        ctx.strokeStyle = `rgba(255,236,160,${1 - k})`;
        ctx.lineWidth = Math.max(1, s * 0.04);
        ctx.beginPath();
        ctx.arc(px + s * (0.3 + hash(tx, ty, 11) * 0.4), py + s * (0.3 + hash(tx, ty, 12) * 0.4), s * (0.05 + k * 0.12), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(255,200,80,${0.12 + 0.1 * Math.sin(t * 3 + tx + ty)})`;
      ctx.fillRect(px, py, s, s);
    } else if (kind === TERRAIN.VENT) {
      // lueur qui monte avant l'éruption
      const glow = warn > 0 ? 0.35 + 0.45 * Math.abs(Math.sin(t * 12)) : 0.15 + 0.08 * Math.sin(t * 2);
      ellipse(ctx, px + s / 2, py + s * 0.52, s * 0.22, s * 0.16, `rgba(255,120,30,${glow})`);
      if (warn > 0) {
        ctx.strokeStyle = `rgba(255,80,40,${0.5 + 0.4 * Math.sin(t * 12)})`;
        ctx.lineWidth = Math.max(1.5, s * 0.06);
        ctx.beginPath();
        ctx.arc(px + s / 2, py + s / 2, s * (0.46 + 0.08 * Math.sin(t * 12)), 0, Math.PI * 2);
        ctx.stroke();
        // fumée
        for (let k = 0; k < 2; k++) {
          const ph = (t * 1.5 + k * 0.5) % 1;
          circle(ctx, px + s / 2 + Math.sin(t * 3 + k) * s * 0.08, py + s * 0.4 - ph * s * 0.6, s * (0.08 + ph * 0.1), `rgba(60,40,40,${0.5 * (1 - ph)})`);
        }
      }
    }
  },
  pillar: (ctx, px, py, s, tx, ty) => drawStone(ctx, px, py, s, volcanoTheme, hash(tx, ty)),
  block: (ctx, px, py, s, tx, ty) => {
    if (hash(tx, ty, 5) < 0.6) magmaRock(ctx, px, py, s, tx, ty);
    else drawCrate(ctx, px, py, s, volcanoTheme);
  },
  debris: (tx, ty) => (hash(tx, ty, 5) < 0.6 ? ["#5a3a30", "#3a2622", "#ff8a2a"] : ["#7a4a32", "#4a2a1a", "#2a1610"]),
};

// ============================================================ BANQUISE
const iceTheme: Theme = {
  ...forestTheme,
  id: "ice",
  shadow: "rgba(30, 60, 90, 0.25)",
  ink: "#1b2b3a",
  stone: { top: "#8fa3b5", side: "#5d7085", light: "#c7d6e3", moss: "#ffffff" },
};

function iceCube(ctx: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const lift = s * LIFT;
  const pad = s * 0.07;
  const w = s - pad * 2;
  rr(ctx, px + pad + s * 0.06, py + pad + s * 0.06, w, w, s * 0.1, "rgba(30,60,90,0.22)");
  rr(ctx, px + pad, py - lift + pad, w, w + lift * 0.9, s * 0.12, "#5fa8d8");
  const grd = ctx.createLinearGradient(px, py - lift, px + s, py + s);
  grd.addColorStop(0, "#e6f7ff");
  grd.addColorStop(1, "#8fd0f5");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.roundRect(px + pad, py - lift + pad, w, w - lift * 0.1, s * 0.12);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px + s * 0.22, py - lift + s * 0.22);
  ctx.lineTo(px + s * 0.42, py - lift + s * 0.22);
  ctx.moveTo(px + s * 0.22, py - lift + s * 0.22);
  ctx.lineTo(px + s * 0.22, py - lift + s * 0.4);
  ctx.stroke();
  // bulle d'air prise dans la glace
  circle(ctx, px + s * (0.55 + hash(tx, ty, 3) * 0.15), py - lift + s * 0.55, s * 0.04, "rgba(255,255,255,0.7)");
}

function snowman(ctx: Ctx, px: number, py: number, s: number) {
  const cx = px + s / 2;
  ellipse(ctx, cx + s * 0.05, py + s * 0.72, s * 0.32, s * 0.12, "rgba(30,60,90,0.25)");
  circle(ctx, cx, py + s * 0.5, s * 0.3, "#f4fbff");
  circle(ctx, cx, py + s * 0.12, s * 0.2, "#ffffff");
  ctx.strokeStyle = "#9cc0d8";
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  ctx.arc(cx, py + s * 0.5, s * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  circle(ctx, cx - s * 0.07, py + s * 0.08, s * 0.03, "#1b2b3a");
  circle(ctx, cx + s * 0.07, py + s * 0.08, s * 0.03, "#1b2b3a");
  ctx.fillStyle = "#ff8a2b";
  ctx.beginPath();
  ctx.moveTo(cx, py + s * 0.13);
  ctx.lineTo(cx + s * 0.14, py + s * 0.16);
  ctx.lineTo(cx, py + s * 0.19);
  ctx.fill();
  rr(ctx, cx - s * 0.2, py + s * 0.25, s * 0.4, s * 0.06, s * 0.03, "#ff4d6d");
}

const ICE: Art = {
  id: "ice",
  background: "#0f2638",
  ink: "#1b2b3a",
  farVeil: "rgba(6, 18, 30, 0.45)",
  floor: (g, px, py, s, tx, ty) => {
    g.fillStyle = (tx + ty) % 2 === 0 ? "#eef6fb" : "#e2eef6";
    g.fillRect(px, py, s, s);
    for (let k = 0; k < 2; k++) {
      ellipse(g, px + s * (0.2 + hash(tx, ty, k) * 0.6), py + s * (0.25 + hash(tx, ty, k + 7) * 0.5), s * 0.12, s * 0.04, "rgba(160,190,215,0.35)");
    }
    if (hash(tx, ty, 30) < 0.25) {
      // flocon scintillant
      const x = px + s * 0.5, y = py + s * 0.5, r = s * 0.06;
      g.strokeStyle = "rgba(150,200,235,0.8)";
      g.lineWidth = Math.max(1, s * 0.02);
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3;
        g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
        g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.stroke();
    }
  },
  border: (g, px, py, s, tx, ty, ring) => {
    // sapins enneigés
    const cx = px + s / 2 + (hash(tx, ty, 1) - 0.5) * s * 0.2;
    const by = py + s * 0.85;
    ellipse(g, cx, by, s * 0.5, s * 0.2, ring ? "#d6e6f2" : "#b9cfe0");
    for (let k = 0; k < 3; k++) {
      const w = s * (0.55 - k * 0.14);
      const y = by - s * (0.15 + k * 0.28);
      g.fillStyle = ring ? "#2b6a55" : "#1f4f40";
      g.beginPath();
      g.moveTo(cx - w, y);
      g.lineTo(cx, y - s * 0.42);
      g.lineTo(cx + w, y);
      g.closePath();
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(cx - w * 0.45, y - s * 0.24);
      g.lineTo(cx, y - s * 0.42);
      g.lineTo(cx + w * 0.45, y - s * 0.24);
      g.closePath();
      g.fill();
    }
  },
  terrain: (g, kind, px, py, s, tx, ty) => {
    if (kind !== TERRAIN.ICE) return;
    const grd = g.createLinearGradient(px, py, px + s, py + s);
    grd.addColorStop(0, "#c9ecff");
    grd.addColorStop(1, "#8fd3f7");
    g.fillStyle = grd;
    g.fillRect(px, py, s, s);
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.lineWidth = Math.max(1, s * 0.035);
    g.lineCap = "round";
    g.beginPath();
    const a = hash(tx, ty, 3) * 0.3;
    g.moveTo(px + s * (0.15 + a), py + s * 0.75);
    g.lineTo(px + s * (0.55 + a), py + s * 0.25);
    g.moveTo(px + s * (0.4 + a), py + s * 0.85);
    g.lineTo(px + s * (0.65 + a), py + s * 0.55);
    g.stroke();
    g.strokeStyle = "rgba(90,160,210,0.35)";
    g.lineWidth = 1;
    g.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  },
  animate: (ctx, kind, px, py, s, tx, ty, t) => {
    if (kind !== TERRAIN.ICE) return;
    // reflet qui balaie la glace
    const ph = (t * 0.35 + hash(tx, ty, 5) * 2) % 2;
    if (ph < 1) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 * Math.sin(ph * Math.PI)})`;
      ctx.fillRect(px + s * ph * 0.8, py, s * 0.18, s);
    }
  },
  pillar: (ctx, px, py, s, tx, ty) => drawStone(ctx, px, py, s, iceTheme, hash(tx, ty)),
  block: (ctx, px, py, s, tx, ty) => {
    if (hash(tx, ty, 5) < 0.82) iceCube(ctx, px, py, s, tx, ty);
    else snowman(ctx, px, py, s);
  },
  debris: () => ["#e6f7ff", "#8fd0f5", "#ffffff"],
};

// =============================================================== PLAGE
const beachTheme: Theme = {
  ...forestTheme,
  id: "beach",
  shadow: "rgba(120, 80, 20, 0.25)",
  ink: "#2b1f14",
  stone: { top: "#b8aa98", side: "#857766", light: "#ddd2c2", moss: "#6fc2a8" },
  crate: { top: "#e0a85e", side: "#a8692c", plank: "#c08440", band: "#7a4a1e" },
};

function palm(ctx: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const cx = px + s / 2;
  ellipse(ctx, cx + s * 0.1, py + s * 0.68, s * 0.38, s * 0.16, "rgba(120,80,20,0.28)");
  // tronc
  ctx.strokeStyle = "#8a5a2b";
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, py + s * 0.62);
  ctx.quadraticCurveTo(cx + s * 0.1, py + s * 0.3, cx + s * 0.02, py - s * 0.05);
  ctx.stroke();
  ctx.strokeStyle = "#6b4220";
  ctx.lineWidth = Math.max(1, s * 0.03);
  for (let k = 0; k < 3; k++) {
    const y = py + s * (0.5 - k * 0.17);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.06, y);
    ctx.lineTo(cx + s * 0.08, y - s * 0.02);
    ctx.stroke();
  }
  // palmes
  const top = py - s * 0.08;
  const rot = hash(tx, ty, 2) * 1.2;
  for (let k = 0; k < 5; k++) {
    const a = rot + (k / 5) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + s * 0.02, top);
    ctx.rotate(a);
    ellipse(ctx, s * 0.24, 0, s * 0.26, s * 0.08, k % 2 ? "#2f9b48" : "#3fbf5a");
    ctx.restore();
  }
  circle(ctx, cx - s * 0.04, top + s * 0.06, s * 0.06, "#7a4a1e");
  circle(ctx, cx + s * 0.06, top + s * 0.07, s * 0.06, "#6b3e18");
}

function sandcastle(ctx: Ctx, px: number, py: number, s: number) {
  const lift = s * LIFT;
  const c1 = "#f2c97a";
  const c2 = "#d9a752";
  ellipse(ctx, px + s * 0.55, py + s * 0.72, s * 0.42, s * 0.14, "rgba(120,80,20,0.25)");
  rr(ctx, px + s * 0.12, py + s * 0.2 - lift * 0.3, s * 0.76, s * 0.6, s * 0.06, c2);
  rr(ctx, px + s * 0.12, py + s * 0.14 - lift * 0.3, s * 0.76, s * 0.52, s * 0.06, c1);
  for (const x of [0.12, 0.62]) {
    rr(ctx, px + s * x, py - s * 0.08 - lift * 0.3, s * 0.26, s * 0.4, s * 0.04, c2);
    rr(ctx, px + s * x, py - s * 0.12 - lift * 0.3, s * 0.26, s * 0.34, s * 0.04, c1);
    for (let k = 0; k < 3; k++) rr(ctx, px + s * (x + k * 0.09), py - s * 0.18 - lift * 0.3, s * 0.06, s * 0.07, s * 0.01, c1);
  }
  rr(ctx, px + s * 0.42, py + s * 0.38 - lift * 0.3, s * 0.16, s * 0.2, s * 0.08, "#8a5a2b");
  // fanion
  ctx.strokeStyle = "#5a3a1a";
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath();
  ctx.moveTo(px + s * 0.25, py - s * 0.18 - lift * 0.3);
  ctx.lineTo(px + s * 0.25, py - s * 0.38 - lift * 0.3);
  ctx.stroke();
  ctx.fillStyle = "#ff4d6d";
  ctx.beginPath();
  ctx.moveTo(px + s * 0.25, py - s * 0.38 - lift * 0.3);
  ctx.lineTo(px + s * 0.4, py - s * 0.33 - lift * 0.3);
  ctx.lineTo(px + s * 0.25, py - s * 0.28 - lift * 0.3);
  ctx.fill();
}

function waterTile(g: Ctx, px: number, py: number, s: number, tx: number, ty: number, deep: boolean) {
  g.fillStyle = deep ? "#1f8fb8" : "#3cc6d8";
  g.fillRect(px, py, s, s);
  g.strokeStyle = deep ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.4)";
  g.lineWidth = Math.max(1, s * 0.035);
  g.lineCap = "round";
  for (let k = 0; k < 2; k++) {
    const y = py + s * (0.3 + k * 0.4) + (hash(tx, ty, k) - 0.5) * s * 0.1;
    const x = px + s * (0.15 + hash(tx, ty, k + 3) * 0.3);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + s * 0.12, y - s * 0.07, x + s * 0.24, y);
    g.quadraticCurveTo(x + s * 0.36, y + s * 0.07, x + s * 0.48, y);
    g.stroke();
  }
}

function parasol(g: Ctx, cx: number, cy: number, s: number, hue: string) {
  ellipse(g, cx + s * 0.08, cy + s * 0.12, s * 0.42, s * 0.2, "rgba(120,80,20,0.25)");
  for (let k = 0; k < 8; k++) {
    g.fillStyle = k % 2 ? hue : "#ffffff";
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, s * 0.4, (k / 8) * Math.PI * 2, ((k + 1) / 8) * Math.PI * 2);
    g.closePath();
    g.fill();
  }
  circle(g, cx, cy, s * 0.05, "#7a4a1e");
}

const BEACH: Art = {
  id: "beach",
  background: "#1f8fb8",
  ink: "#2b1f14",
  farVeil: "rgba(5, 40, 60, 0.35)",
  floor: (g, px, py, s, tx, ty) => {
    g.fillStyle = (tx + ty) % 2 === 0 ? "#f6dfa6" : "#f0d697";
    g.fillRect(px, py, s, s);
    for (let k = 0; k < 4; k++) circle(g, px + s * hash(tx, ty, k), py + s * hash(tx, ty, k + 5), s * 0.018, "#d9b872");
    const d = hash(tx, ty, 50);
    if (d < 0.08) {
      // coquillage
      const x = px + s * 0.5, y = py + s * 0.55;
      g.fillStyle = "#ffb3a7";
      g.beginPath();
      g.arc(x, y, s * 0.09, Math.PI, 0);
      g.closePath();
      g.fill();
      g.strokeStyle = "#e07a6a";
      g.lineWidth = Math.max(1, s * 0.015);
      for (let k = -2; k <= 2; k++) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + k * s * 0.035, y - s * 0.085);
        g.stroke();
      }
    } else if (d < 0.14) {
      // étoile de mer
      const x = px + s * 0.45, y = py + s * 0.45, r = s * 0.12;
      g.fillStyle = "#ff8a3d";
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + hash(tx, ty, 2);
        const rr2 = k % 2 ? r * 0.42 : r;
        g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
      }
      g.fill();
    }
  },
  border: (g, px, py, s, tx, ty, ring) => {
    if (!ring) {
      waterTile(g, px, py, s, tx, ty, true);
      return;
    }
    // bande de sable avec parasols, rochers et serviettes
    g.fillStyle = "#f6dfa6";
    g.fillRect(px - 1, py - 1, s + 2, s + 2);
    const d = hash(tx, ty, 8);
    if (d < 0.3) parasol(g, px + s / 2, py + s / 2, s, ["#ff4d6d", "#3fa2ff", "#ffcc33"][Math.floor(hash(tx, ty, 9) * 3)]);
    else if (d < 0.55) {
      ellipse(g, px + s * 0.5, py + s * 0.6, s * 0.36, s * 0.24, "#a89a88");
      ellipse(g, px + s * 0.45, py + s * 0.5, s * 0.3, s * 0.2, "#c9bcaa");
    } else if (d < 0.7) {
      // serviette
      g.save();
      g.translate(px + s / 2, py + s / 2);
      g.rotate((hash(tx, ty, 3) - 0.5) * 0.8);
      for (let k = 0; k < 4; k++) rr(g, -s * 0.38 + k * s * 0.19, -s * 0.22, s * 0.19, s * 0.44, 0, k % 2 ? "#ffffff" : "#3fa2ff");
      g.restore();
    }
  },
  terrain: (g, kind, px, py, s, tx, ty) => {
    if (kind !== TERRAIN.WATER) return;
    waterTile(g, px, py, s, tx, ty, false);
    // bouée sur certaines cases
    if (hash(tx, ty, 21) < 0.25) {
      const cx = px + s / 2, cy = py + s / 2;
      for (let k = 0; k < 8; k++) {
        g.strokeStyle = k % 2 ? "#ff4d4d" : "#ffffff";
        g.lineWidth = s * 0.1;
        g.beginPath();
        g.arc(cx, cy, s * 0.2, (k / 8) * Math.PI * 2, ((k + 1) / 8) * Math.PI * 2);
        g.stroke();
      }
    }
  },
  animate: (ctx, kind, px, py, s, tx, ty, t) => {
    if (kind !== TERRAIN.WATER) return;
    ctx.fillStyle = `rgba(255,255,255,${0.08 + 0.07 * Math.sin(t * 2 + tx * 0.9 + ty * 1.3)})`;
    ctx.fillRect(px, py, s, s);
  },
  pillar: (ctx, px, py, s, tx, ty) => {
    if ((tx + ty) % 4 === 0) palm(ctx, px, py, s, tx, ty);
    else drawStone(ctx, px, py, s, beachTheme, hash(tx, ty));
  },
  block: (ctx, px, py, s, tx, ty) => {
    if (hash(tx, ty, 5) < 0.45) sandcastle(ctx, px, py, s);
    else drawCrate(ctx, px, py, s, beachTheme);
  },
  debris: (tx, ty) => (hash(tx, ty, 5) < 0.45 ? ["#f2c97a", "#d9a752", "#ffe6b0"] : ["#e0a85e", "#a8692c", "#c08440"]),
};

const ARTS: Record<string, Art> = { forest: FOREST, volcano: VOLCANO, ice: ICE, beach: BEACH };

export function getArt(id: string): Art {
  return ARTS[id] ?? FOREST;
}
