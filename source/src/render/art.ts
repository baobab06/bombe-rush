/**
 * Direction artistique de chaque map. Le renderer ne connaît que cette
 * interface : ajouter une map = ajouter un `Art` ici.
 */
import { TERRAIN } from "../core/types";
import { CHAOS_ARENA } from "../maps/chaos-arena";
import { LABYRINTH } from "../maps/labyrinth";
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
  /** couleurs des étincelles d'éruption (cheminée / faille) */
  eruption?: string[];
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


// ========================================================== LABYRINTHE
/** Horloge pour les petites animations (torches, cristaux) des éléments redessinés à chaque image. */
const now = () => (typeof performance !== "undefined" ? performance.now() / 1000 : 0);
/** Coordonnées « miroir » : la déco reste symétrique comme le plan. */
function canon(layout: string[], tx: number, ty: number): [number, number] {
  const w = layout[0].length;
  const h = layout.length;
  return [Math.min(tx, w - 1 - tx), Math.min(ty, h - 1 - ty)];
}
const cell = (layout: string[], tx: number, ty: number) => layout[ty]?.[tx] ?? "#";

function stroke(ctx: Ctx, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
}

/** Flamme de torche animée (lueur + flamme), centrée en (x, y). */
function flame(ctx: Ctx, x: number, y: number, s: number, seed: number, big = false) {
  const t = now();
  const f = 0.85 + 0.15 * Math.sin(t * 11 + seed * 7) + 0.08 * Math.sin(t * 23 + seed * 3);
  const k = big ? 1.6 : 1;
  circle(ctx, x, y, s * 0.34 * k * f, "rgba(255,170,60,0.13)");
  circle(ctx, x, y, s * 0.2 * k * f, "rgba(255,190,80,0.22)");
  ctx.fillStyle = "#ff7a1a";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.09 * k, y + s * 0.04 * k);
  ctx.quadraticCurveTo(x - s * 0.1 * k, y - s * 0.1 * k, x + (Math.sin(t * 9 + seed) * s * 0.03), y - s * 0.24 * k * f);
  ctx.quadraticCurveTo(x + s * 0.1 * k, y - s * 0.1 * k, x + s * 0.09 * k, y + s * 0.04 * k);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, x, y - s * 0.03 * k, s * 0.05 * k, s * 0.1 * k * f, "#ffe27a");
}

/** Dalles de pierre (4 carreaux par case) ou de sable dans les coins de départ. */
function labFloor(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const L = LABYRINTH.layout;
  const [cx, cy] = canon(L, tx, ty);
  const sand = cx <= 2 && cy <= 2 && !(cx === 2 && cy === 2);
  const center = cx >= 4 && cy >= 3;
  g.fillStyle = sand ? ((tx + ty) % 2 ? "#d9b47e" : "#d0aa73") : center ? ((tx + ty) % 2 ? "#3f4658" : "#3a4153") : (tx + ty) % 2 ? "#3a404d" : "#353b47";
  g.fillRect(px, py, s, s);
  // joints entre les dalles
  const half = s / 2;
  g.fillStyle = sand ? "rgba(255,240,210,0.16)" : "rgba(255,255,255,0.05)";
  for (const [ox, oy] of [[0, 0], [half, 0], [0, half], [half, half]]) g.fillRect(px + ox + s * 0.04, py + oy + s * 0.04, half - s * 0.08, s * 0.035);
  stroke(g, sand ? "rgba(130,90,45,0.4)" : "rgba(12,14,22,0.6)", Math.max(1, s * 0.03));
  g.beginPath();
  g.moveTo(px + half, py);
  g.lineTo(px + half, py + s);
  g.moveTo(px, py + half);
  g.lineTo(px + s, py + half);
  g.stroke();
  g.strokeRect(px, py, s, s);
  const h = hash(cx, cy, 31);
  if (!sand && h < 0.22) {
    // mousse au coin d'une dalle
    ellipse(g, px + s * (h < 0.11 ? 0.18 : 0.82), py + s * 0.82, s * 0.16, s * 0.07, "rgba(96,150,70,0.55)");
  } else if (!sand && h < 0.32) {
    stroke(g, "rgba(10,12,18,0.55)", Math.max(1, s * 0.02));
    g.beginPath();
    g.moveTo(px + s * 0.6, py + s * 0.55);
    g.lineTo(px + s * 0.7, py + s * 0.7);
    g.lineTo(px + s * 0.66, py + s * 0.88);
    g.stroke();
  } else if (sand && h < 0.25) {
    circle(g, px + s * 0.3, py + s * 0.7, s * 0.03, "#b8935e");
    circle(g, px + s * 0.72, py + s * 0.3, s * 0.025, "#b8935e");
  }
  // pont de bois au-dessus des canaux (case libre entre deux cases d'eau)
  const c = cell(L, tx, ty);
  const water = (x: number, y: number) => cell(L, x, y) === "~";
  if (c === "_" && (water(tx - 1, ty) || water(tx + 1, ty) || water(tx, ty - 1) || water(tx, ty + 1))) {
    const vertical = water(tx - 1, ty) || water(tx + 1, ty);
    g.fillStyle = "#2a5d7a";
    g.fillRect(px, py, s, s);
    g.save();
    g.translate(px + half, py + half);
    if (!vertical) g.rotate(Math.PI / 2);
    rr(g, -s * 0.42, -s * 0.5, s * 0.84, s, s * 0.04, "#7a4a24");
    for (let k = 0; k < 4; k++) rr(g, -s * 0.4, -s * 0.48 + k * s * 0.245, s * 0.8, s * 0.2, s * 0.03, k % 2 ? "#c98a4b" : "#d89a58");
    rr(g, -s * 0.46, -s * 0.5, s * 0.08, s, s * 0.03, "#5a3418");
    rr(g, s * 0.38, -s * 0.5, s * 0.08, s, s * 0.03, "#5a3418");
    g.restore();
  }
}

/** Mur de pierre taillée (2.5D), parfois gravé, parfois porteur d'une torche. */
function labWall(ctx: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const L = LABYRINTH.layout;
  const [cx, cy] = canon(L, tx, ty);
  const lift = s * LIFT;
  const pad = s * 0.03;
  const altar = cx === 6 && cy === 5;
  rr(ctx, px + pad + s * 0.06, py + s * 0.12, s - pad * 2, s - pad * 2, s * 0.08, "rgba(5,8,14,0.45)");
  // face avant
  rr(ctx, px + pad, py - lift + pad, s - pad * 2, s - pad, s * 0.1, "#4f5664");
  // dessus en blocs de pierre
  const top = py - lift + pad;
  const w = s - pad * 2;
  const hTop = s - pad * 2 - lift * 0.15;
  rr(ctx, px + pad, top, w, hTop, s * 0.1, altar ? "#a39484" : "#9aa2ad");
  stroke(ctx, "rgba(40,45,58,0.55)", Math.max(1, s * 0.028));
  ctx.beginPath();
  ctx.moveTo(px + pad + w * 0.06, top + hTop * 0.5);
  ctx.lineTo(px + pad + w * 0.94, top + hTop * 0.5);
  ctx.moveTo(px + pad + w * 0.5, top + hTop * 0.06);
  ctx.lineTo(px + pad + w * 0.5, top + hTop * 0.5);
  ctx.moveTo(px + pad + w * 0.3, top + hTop * 0.5);
  ctx.lineTo(px + pad + w * 0.3, top + hTop * 0.94);
  ctx.moveTo(px + pad + w * 0.75, top + hTop * 0.5);
  ctx.lineTo(px + pad + w * 0.75, top + hTop * 0.94);
  ctx.stroke();
  // arête éclairée
  rr(ctx, px + pad + s * 0.06, top + s * 0.04, w - s * 0.12, s * 0.06, s * 0.03, "rgba(255,255,255,0.28)");
  // briques de la face avant
  stroke(ctx, "rgba(20,24,34,0.5)", Math.max(1, s * 0.022));
  ctx.beginPath();
  ctx.moveTo(px + pad + w * 0.33, top + hTop + s * 0.01);
  ctx.lineTo(px + pad + w * 0.33, py + s - pad);
  ctx.moveTo(px + pad + w * 0.66, top + hTop + s * 0.01);
  ctx.lineTo(px + pad + w * 0.66, py + s - pad);
  ctx.stroke();
  // contour net (lisibilité)
  stroke(ctx, "#1a1e28", Math.max(1, s * 0.035));
  ctx.beginPath();
  ctx.roundRect(px + pad, py - lift + pad, s - pad * 2, s - pad, s * 0.1);
  ctx.stroke();
  const h = hash(cx, cy, 13);
  if (altar) {
    // autel : vasque de feu
    ellipse(ctx, px + s / 2, top + hTop * 0.55, s * 0.3, s * 0.18, "#5a4636");
    ellipse(ctx, px + s / 2, top + hTop * 0.5, s * 0.24, s * 0.13, "#2a1d16");
    flame(ctx, px + s / 2, top + hTop * 0.42, s, tx + ty, true);
  } else if (h < 0.45) {
    // torche sur le mur
    rr(ctx, px + s * 0.44, top + hTop * 0.42, s * 0.12, s * 0.2, s * 0.03, "#5a3a1e");
    ellipse(ctx, px + s * 0.5, top + hTop * 0.42, s * 0.11, s * 0.05, "#2b2b2b");
    flame(ctx, px + s * 0.5, top + hTop * 0.32, s, tx * 3 + ty);
  } else if (h < 0.75) {
    // glyphe gravé (spirale carrée)
    stroke(ctx, "rgba(55,62,78,0.75)", Math.max(1, s * 0.035));
    const gx = px + s / 2;
    const gy = top + hTop * 0.5;
    const r = s * 0.17;
    ctx.beginPath();
    ctx.moveTo(gx - r, gy + r);
    ctx.lineTo(gx - r, gy - r);
    ctx.lineTo(gx + r, gy - r);
    ctx.lineTo(gx + r, gy + r * 0.5);
    ctx.lineTo(gx - r * 0.45, gy + r * 0.5);
    ctx.lineTo(gx - r * 0.45, gy - r * 0.4);
    ctx.lineTo(gx + r * 0.4, gy - r * 0.4);
    ctx.stroke();
  } else {
    ellipse(ctx, px + s * (0.3 + h * 0.3), top + s * 0.1, s * 0.2, s * 0.07, "#5e9a45");
  }
}

/** Caisse en bois clouée (destructible) : bien orange pour se détacher des murs gris. */
function labCrate(ctx: Ctx, px: number, py: number, s: number) {
  const lift = s * LIFT;
  const pad = s * 0.08;
  const w = s - pad * 2;
  rr(ctx, px + pad + s * 0.06, py + pad + s * 0.08, w, w, s * 0.06, "rgba(5,8,14,0.4)");
  rr(ctx, px + pad, py - lift + pad, w, w + lift * 0.9, s * 0.07, "#9a5424");
  const top = py - lift + pad;
  rr(ctx, px + pad, top, w, w - lift * 0.1, s * 0.07, "#e0904a");
  // cadre
  stroke(ctx, "#b8682c", Math.max(1.5, s * 0.07));
  ctx.beginPath();
  ctx.roundRect(px + pad + s * 0.05, top + s * 0.05, w - s * 0.1, w - lift * 0.1 - s * 0.1, s * 0.04);
  ctx.stroke();
  // croix
  stroke(ctx, "#a85a22", Math.max(1.5, s * 0.07));
  ctx.beginPath();
  ctx.moveTo(px + pad + s * 0.12, top + s * 0.12);
  ctx.lineTo(px + pad + w - s * 0.12, top + w - lift * 0.1 - s * 0.12);
  ctx.moveTo(px + pad + w - s * 0.12, top + s * 0.12);
  ctx.lineTo(px + pad + s * 0.12, top + w - lift * 0.1 - s * 0.12);
  ctx.stroke();
  rr(ctx, px + pad + s * 0.08, top + s * 0.06, w * 0.5, s * 0.04, s * 0.02, "rgba(255,230,180,0.45)");
  for (const [ax, ay] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.86], [0.9, 0.86]]) circle(ctx, px + pad + w * ax, top + (w - lift * 0.1) * ay, s * 0.025, "#5a3010");
  stroke(ctx, "#3a1e0a", Math.max(1, s * 0.035));
  ctx.beginPath();
  ctx.roundRect(px + pad, py - lift + pad, w, w + lift * 0.9, s * 0.07);
  ctx.stroke();
}

/** Tonneau (destructible). */
function labBarrel(ctx: Ctx, px: number, py: number, s: number) {
  const lift = s * LIFT;
  const cx = px + s / 2;
  ellipse(ctx, cx + s * 0.06, py + s * 0.78, s * 0.36, s * 0.14, "rgba(5,8,14,0.4)");
  rr(ctx, px + s * 0.16, py - lift + s * 0.3, s * 0.68, s * 0.5 + lift * 0.4, s * 0.12, "#8a4e22");
  for (const y of [0.42, 0.66]) rr(ctx, px + s * 0.15, py - lift + s * y + lift * 0.4, s * 0.7, s * 0.06, s * 0.02, "#4a4a52");
  ellipse(ctx, cx, py - lift + s * 0.3, s * 0.34, s * 0.2, "#c98448");
  ellipse(ctx, cx, py - lift + s * 0.3, s * 0.26, s * 0.14, "#a86a34");
  stroke(ctx, "#6a3a18", Math.max(1, s * 0.02));
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.18, py - lift + s * 0.3);
  ctx.lineTo(cx + s * 0.18, py - lift + s * 0.3);
  ctx.stroke();
  stroke(ctx, "#3a1e0a", Math.max(1, s * 0.035));
  ctx.beginPath();
  ctx.ellipse(cx, py - lift + s * 0.3, s * 0.34, s * 0.2, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** Buisson taillé (destructible). */
function labHedge(ctx: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const lift = s * LIFT;
  rr(ctx, px + s * 0.12, py + s * 0.16, s * 0.82, s * 0.76, s * 0.2, "rgba(5,8,14,0.4)");
  rr(ctx, px + s * 0.08, py - lift + s * 0.12, s * 0.84, s * 0.78 + lift * 0.6, s * 0.24, "#2c7a2e");
  rr(ctx, px + s * 0.08, py - lift + s * 0.08, s * 0.84, s * 0.7, s * 0.24, "#45a83c");
  for (let k = 0; k < 5; k++) circle(ctx, px + s * (0.22 + hash(tx, ty, k) * 0.56), py - lift + s * (0.2 + hash(tx, ty, k + 5) * 0.44), s * 0.09, k % 2 ? "#62c24c" : "#3a9434");
  stroke(ctx, "#163d17", Math.max(1, s * 0.035));
  ctx.beginPath();
  ctx.roundRect(px + s * 0.08, py - lift + s * 0.08, s * 0.84, s * 0.82 + lift * 0.6, s * 0.24);
  ctx.stroke();
}

/** Mur d'enceinte (anneau extérieur) avec torches, portes et tours. */
function labRing(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const L = LABYRINTH.layout;
  const W = L[0].length;
  const H = L.length;
  const [cx, cy] = canon(L, tx, ty);
  g.fillStyle = "#4b525e";
  g.fillRect(px, py, s, s);
  g.fillStyle = "#8e96a2";
  g.fillRect(px + s * 0.04, py + s * 0.04, s * 0.92, s * 0.78);
  stroke(g, "rgba(30,34,46,0.6)", Math.max(1, s * 0.03));
  g.beginPath();
  g.moveTo(px, py + s * 0.42);
  g.lineTo(px + s, py + s * 0.42);
  g.moveTo(px + s * (tx % 2 ? 0.3 : 0.7), py + s * 0.04);
  g.lineTo(px + s * (tx % 2 ? 0.3 : 0.7), py + s * 0.42);
  g.moveTo(px + s * (tx % 2 ? 0.7 : 0.3), py + s * 0.42);
  g.lineTo(px + s * (tx % 2 ? 0.7 : 0.3), py + s * 0.82);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.22)";
  g.fillRect(px + s * 0.06, py + s * 0.06, s * 0.88, s * 0.05);
  const gateX = (tx === Math.floor(W / 2) && (ty === 0 || ty === H - 1));
  const gateY = (ty === Math.floor(H / 2) && (tx === 0 || tx === W - 1));
  if (gateX || gateY) {
    // porte voûtée, lueur chaude
    rr(g, px + s * 0.18, py + s * 0.2, s * 0.64, s * 0.62, s * 0.3, "#1c140f");
    rr(g, px + s * 0.26, py + s * 0.36, s * 0.48, s * 0.46, s * 0.22, "rgba(255,140,50,0.55)");
    stroke(g, "#5a4a3c", Math.max(1, s * 0.05));
    g.beginPath();
    g.roundRect(px + s * 0.18, py + s * 0.2, s * 0.64, s * 0.62, s * 0.3);
    g.stroke();
  } else if (hash(cx, cy, 61) < 0.4 || (cx === 0 && cy === 0)) {
    rr(g, px + s * 0.42, py + s * 0.3, s * 0.16, s * 0.3, s * 0.04, "#5a3a1e");
    circle(g, px + s * 0.5, py + s * 0.3, s * 0.3, "rgba(255,170,60,0.18)");
    flame(g, px + s * 0.5, py + s * 0.28, s, tx + ty * 5);
  }
}

/** Décor lointain : jungle, palmiers, eau et cascades lumineuses. */
function labFar(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const d = hash(tx, ty, 71);
  g.fillStyle = d < 0.18 ? "#0f4f6e" : (tx + ty) % 2 ? "#163b2a" : "#183f2d";
  g.fillRect(px - 0.5, py - 0.5, s + 1, s + 1);
  if (d < 0.18) {
    stroke(g, "rgba(120,220,255,0.55)", Math.max(1, s * 0.05));
    g.beginPath();
    g.moveTo(px + s * 0.3, py);
    g.lineTo(px + s * 0.3, py + s);
    g.moveTo(px + s * 0.62, py);
    g.lineTo(px + s * 0.62, py + s);
    g.stroke();
  } else if (d < 0.5) {
    // palmier vu de dessus
    const cx = px + s * 0.5;
    const cy = py + s * 0.5;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + d * 4;
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      ellipse(g, s * 0.3, 0, s * 0.32, s * 0.1, k % 2 ? "#2f8a3a" : "#3fa848");
      g.restore();
    }
    circle(g, cx, cy, s * 0.07, "#6b4a26");
  } else if (d < 0.62) {
    ellipse(g, px + s * 0.5, py + s * 0.55, s * 0.36, s * 0.26, "#5a5e66");
    ellipse(g, px + s * 0.45, py + s * 0.45, s * 0.28, s * 0.18, "#7a808a");
  } else if (d < 0.7) {
    for (let k = 0; k < 3; k++) circle(g, px + s * (0.25 + k * 0.25), py + s * (0.4 + (k % 2) * 0.2), s * 0.06, ["#ff7aa8", "#ffd84a", "#c58bff"][k]);
  }
}

const LABYRINTH_ART: Art = {
  id: "labyrinth",
  background: "#12301f",
  ink: "#1a1e28",
  farVeil: "rgba(4, 12, 10, 0.5)",
  floor: labFloor,
  border: (g, px, py, s, tx, ty, ring) => (ring ? labRing(g, px, py, s, tx, ty) : labFar(g, px, py, s, tx, ty)),
  terrain: (g, kind, px, py, s, tx, ty) => {
    if (kind !== TERRAIN.WATER) return;
    // canal : rebords de pierre, eau turquoise lumineuse, nénuphars
    g.fillStyle = "#4b525e";
    g.fillRect(px, py, s, s);
    const grd = g.createLinearGradient(px, py, px + s, py + s);
    grd.addColorStop(0, "#35c2f0");
    grd.addColorStop(1, "#1678b8");
    g.fillStyle = grd;
    g.fillRect(px + s * 0.08, py + s * 0.08, s * 0.84, s * 0.84);
    stroke(g, "rgba(255,255,255,0.45)", Math.max(1, s * 0.03));
    g.beginPath();
    g.moveTo(px + s * 0.2, py + s * 0.35);
    g.quadraticCurveTo(px + s * 0.35, py + s * 0.28, px + s * 0.5, py + s * 0.35);
    g.stroke();
    if (hash(tx, ty, 3) < 0.7) {
      ellipse(g, px + s * 0.66, py + s * 0.66, s * 0.14, s * 0.1, "#3c9a46");
      circle(g, px + s * 0.66, py + s * 0.62, s * 0.05, "#ff8ac6");
    }
  },
  animate: (ctx, kind, px, py, s, tx, ty, t) => {
    if (kind !== TERRAIN.WATER) return;
    ctx.fillStyle = `rgba(200,245,255,${0.08 + 0.08 * Math.sin(t * 2.2 + tx + ty * 0.7)})`;
    ctx.fillRect(px + s * 0.08, py + s * 0.08, s * 0.84, s * 0.84);
  },
  pillar: labWall,
  block: (ctx, px, py, s, tx, ty) => {
    const [cx, cy] = canon(LABYRINTH.layout, tx, ty);
    const h = hash(cx, cy, 5);
    if (h < 0.58) labCrate(ctx, px, py, s);
    else if (h < 0.78) labBarrel(ctx, px, py, s);
    else labHedge(ctx, px, py, s, tx, ty);
  },
  debris: (tx, ty) => {
    const [cx, cy] = canon(LABYRINTH.layout, tx, ty);
    const h = hash(cx, cy, 5);
    return h < 0.78 ? ["#e0904a", "#9a5424", "#c98448"] : ["#45a83c", "#2c7a2e", "#62c24c"];
  },
  eruption: ["#ffcf4a", "#ff5a1f"],
};

// ========================================================= ARÈNE CHAOS
/** Sol violet à panneaux, filets de lumière cyan / rose. */
function arenaFloor(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const L = CHAOS_ARENA.layout;
  const [cx, cy] = canon(L, tx, ty);
  const open = cell(L, tx, ty) === "_";
  g.fillStyle = (tx + ty) % 2 ? "#2a1846" : "#25153f";
  g.fillRect(px, py, s, s);
  // panneau biseauté
  rr(g, px + s * 0.06, py + s * 0.06, s * 0.88, s * 0.88, s * 0.12, open ? "#3a2163" : "#2f1b52");
  rr(g, px + s * 0.06, py + s * 0.06, s * 0.88, s * 0.05, s * 0.03, "rgba(255,255,255,0.07)");
  // circuits lumineux
  const h = hash(cx, cy, 41);
  stroke(g, h < 0.5 ? "rgba(70,230,255,0.38)" : "rgba(255,90,200,0.32)", Math.max(1, s * 0.025));
  g.beginPath();
  if (h < 0.33) {
    g.moveTo(px + s * 0.15, py + s * 0.5);
    g.lineTo(px + s * 0.42, py + s * 0.5);
    g.lineTo(px + s * 0.55, py + s * 0.32);
    g.lineTo(px + s * 0.85, py + s * 0.32);
  } else if (h < 0.66) {
    g.moveTo(px + s * 0.5, py + s * 0.12);
    g.lineTo(px + s * 0.5, py + s * 0.4);
    g.lineTo(px + s * 0.7, py + s * 0.6);
    g.lineTo(px + s * 0.7, py + s * 0.88);
  }
  g.stroke();
  if (h < 0.66) circle(g, px + s * (h < 0.33 ? 0.85 : 0.7), py + s * (h < 0.33 ? 0.32 : 0.88), s * 0.035, h < 0.5 ? "#7df3ff" : "#ff8ad8");
  if (open) {
    // aire de combat : liseré cyan
    stroke(g, "rgba(90,235,255,0.3)", Math.max(1, s * 0.025));
    g.beginPath();
    g.roundRect(px + s * 0.1, py + s * 0.1, s * 0.8, s * 0.8, s * 0.1);
    g.stroke();
  }
}

/** Amas de cristaux magenta (indestructible). Le pylône central est plus grand, cœur cyan. */
function crystal(ctx: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const L = CHAOS_ARENA.layout;
  const [cx, cy] = canon(L, tx, ty);
  const pylon = cx === 6 && cy === 5;
  const lift = s * LIFT;
  const t = now();
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + cx + cy * 2);
  // socle hexagonal sombre
  ellipse(ctx, px + s * 0.55, py + s * 0.8, s * 0.42, s * 0.14, "rgba(0,0,0,0.45)");
  ctx.fillStyle = "#1c0f30";
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    ctx.lineTo(px + s / 2 + Math.cos(a) * s * 0.44, py + s * 0.62 + Math.sin(a) * s * 0.26);
  }
  ctx.closePath();
  ctx.fill();
  stroke(ctx, "rgba(255,90,210,0.6)", Math.max(1, s * 0.03));
  ctx.stroke();
  // lueur
  circle(ctx, px + s / 2, py + s * 0.35 - lift * 0.5, s * (0.42 + pulse * 0.06), pylon ? `rgba(90,230,255,${0.14 + pulse * 0.1})` : `rgba(255,70,200,${0.12 + pulse * 0.08})`);
  // éclats de cristal
  const shards: [number, number, number][] = pylon
    ? [[0.5, 0.95, 0.24], [0.28, 0.6, 0.14], [0.72, 0.62, 0.14]]
    : [[0.5, 0.8, 0.2], [0.3, 0.55, 0.13], [0.7, 0.5 + hash(cx, cy, 2) * 0.15, 0.13]];
  for (const [x, hgt, wd] of shards) {
    const bx = px + s * x;
    const by = py + s * 0.66;
    const tip = by - s * hgt - lift * 0.4;
    ctx.fillStyle = pylon ? "#1aa6d6" : "#b0157e";
    ctx.beginPath();
    ctx.moveTo(bx - s * wd, by);
    ctx.lineTo(bx - s * wd * 0.7, tip + s * 0.12);
    ctx.lineTo(bx, tip);
    ctx.lineTo(bx + s * wd * 0.7, tip + s * 0.12);
    ctx.lineTo(bx + s * wd, by);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pylon ? "#6ff0ff" : "#ff4fc3";
    ctx.beginPath();
    ctx.moveTo(bx - s * wd * 0.7, tip + s * 0.12);
    ctx.lineTo(bx, tip);
    ctx.lineTo(bx + s * wd * 0.15, by);
    ctx.lineTo(bx - s * wd, by);
    ctx.closePath();
    ctx.fill();
    stroke(ctx, pylon ? "#063a52" : "#3d0630", Math.max(1, s * 0.03));
    ctx.beginPath();
    ctx.moveTo(bx - s * wd, by);
    ctx.lineTo(bx - s * wd * 0.7, tip + s * 0.12);
    ctx.lineTo(bx, tip);
    ctx.lineTo(bx + s * wd * 0.7, tip + s * 0.12);
    ctx.lineTo(bx + s * wd, by);
    ctx.stroke();
    // reflet
    stroke(ctx, `rgba(255,255,255,${0.55 + pulse * 0.35})`, Math.max(1, s * 0.025));
    ctx.beginPath();
    ctx.moveTo(bx - s * wd * 0.35, tip + s * 0.12);
    ctx.lineTo(bx - s * wd * 0.1, tip + s * 0.03);
    ctx.stroke();
  }
}

/** Caisse futuriste (destructible) : métal sombre, arêtes néon cyan ou rose. */
function techCrate(ctx: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const [cx, cy] = canon(CHAOS_ARENA.layout, tx, ty);
  const pink = hash(cx, cy, 9) < 0.5;
  const neon = pink ? "#ff5ccf" : "#4ff0ff";
  const lift = s * LIFT;
  const pad = s * 0.08;
  const w = s - pad * 2;
  rr(ctx, px + pad + s * 0.06, py + pad + s * 0.08, w, w, s * 0.08, "rgba(0,0,0,0.45)");
  rr(ctx, px + pad, py - lift + pad, w, w + lift * 0.9, s * 0.1, pink ? "#5a2366" : "#20456a");
  const top = py - lift + pad;
  const hTop = w - lift * 0.1;
  rr(ctx, px + pad, top, w, hTop, s * 0.1, pink ? "#8a3a9e" : "#2f6aa0");
  rr(ctx, px + pad + s * 0.12, top + s * 0.12, w - s * 0.24, hTop - s * 0.24, s * 0.06, pink ? "#6a2a7e" : "#25578a");
  // néon
  stroke(ctx, neon, Math.max(1.2, s * 0.045));
  ctx.beginPath();
  ctx.roundRect(px + pad + s * 0.04, top + s * 0.04, w - s * 0.08, hTop - s * 0.08, s * 0.08);
  ctx.stroke();
  circle(ctx, px + s / 2, top + hTop / 2, s * 0.09, neon);
  circle(ctx, px + s / 2, top + hTop / 2, s * 0.045, "#ffffff");
  rr(ctx, px + pad + s * 0.1, top + s * 0.06, w * 0.45, s * 0.035, s * 0.02, "rgba(255,255,255,0.35)");
  stroke(ctx, "#10061e", Math.max(1, s * 0.035));
  ctx.beginPath();
  ctx.roundRect(px + pad, py - lift + pad, w, w + lift * 0.9, s * 0.1);
  ctx.stroke();
}

/** Bordure : rail métallique éclairé ; au-delà, le vide étoilé. */
function arenaRing(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const [cx, cy] = canon(CHAOS_ARENA.layout, tx, ty);
  g.fillStyle = "#1a1030";
  g.fillRect(px, py, s, s);
  rr(g, px + s * 0.05, py + s * 0.05, s * 0.9, s * 0.78, s * 0.12, "#3b2a5e");
  rr(g, px + s * 0.05, py + s * 0.05, s * 0.9, s * 0.06, s * 0.03, "rgba(255,255,255,0.18)");
  rr(g, px + s * 0.2, py + s * 0.38, s * 0.6, s * 0.1, s * 0.05, (cx + cy) % 2 ? "#4ff0ff" : "#ff5ccf");
  circle(g, px + s * 0.5, py + s * 0.43, s * 0.26, (cx + cy) % 2 ? "rgba(79,240,255,0.16)" : "rgba(255,92,207,0.16)");
}
function arenaFar(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  g.fillStyle = (tx * 7 + ty * 3) % 5 === 0 ? "#160b29" : "#120822";
  g.fillRect(px - 0.5, py - 0.5, s + 1, s + 1);
  const d = hash(tx, ty, 81);
  if (d < 0.35) circle(g, px + s * hash(tx, ty, 82), py + s * hash(tx, ty, 83), s * (0.02 + d * 0.05), d < 0.12 ? "#ffd1f3" : "#b9f6ff");
  else if (d < 0.45) circle(g, px + s * 0.5, py + s * 0.5, s * 0.7, "rgba(160,50,200,0.12)");
  else if (d < 0.5) {
    // éclat de cristal flottant
    g.fillStyle = "#7a1a62";
    g.beginPath();
    g.moveTo(px + s * 0.5, py + s * 0.15);
    g.lineTo(px + s * 0.7, py + s * 0.5);
    g.lineTo(px + s * 0.5, py + s * 0.85);
    g.lineTo(px + s * 0.3, py + s * 0.5);
    g.closePath();
    g.fill();
  }
}

const CHAOS_ARENA_ART: Art = {
  id: "chaos_arena",
  background: "#120822",
  ink: "#10061e",
  farVeil: "rgba(8, 2, 18, 0.45)",
  floor: arenaFloor,
  border: (g, px, py, s, tx, ty, ring) => (ring ? arenaRing(g, px, py, s, tx, ty) : arenaFar(g, px, py, s, tx, ty)),
  terrain: (g, kind, px, py, s, tx, ty) => {
    if (kind === TERRAIN.WATER) {
      // gouffre d'énergie : vide noir, rebord rose lumineux
      g.fillStyle = "#07020f";
      g.fillRect(px, py, s, s);
      const grd = g.createRadialGradient(px + s / 2, py + s / 2, s * 0.05, px + s / 2, py + s / 2, s * 0.6);
      grd.addColorStop(0, "#3a0f5a");
      grd.addColorStop(1, "#07020f");
      g.fillStyle = grd;
      g.fillRect(px + s * 0.06, py + s * 0.06, s * 0.88, s * 0.88);
      for (let k = 0; k < 3; k++) circle(g, px + s * (0.2 + hash(tx, ty, k) * 0.6), py + s * (0.2 + hash(tx, ty, k + 3) * 0.6), s * 0.02, "#d9c2ff");
      stroke(g, "rgba(255,80,200,0.85)", Math.max(1.2, s * 0.045));
      g.strokeRect(px + s * 0.05, py + s * 0.05, s * 0.9, s * 0.9);
    } else if (kind === TERRAIN.VENT) {
      // faille d'énergie : plateau hexagonal, fissure rose
      g.fillStyle = "#1a0d2e";
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.lineTo(px + s / 2 + Math.cos(a) * s * 0.46, py + s / 2 + Math.sin(a) * s * 0.46);
      }
      g.closePath();
      g.fill();
      stroke(g, "#ff4fc3", Math.max(1.2, s * 0.04));
      g.stroke();
      stroke(g, "#ff9be3", Math.max(1, s * 0.035));
      g.beginPath();
      g.moveTo(px + s * 0.3, py + s * 0.35);
      g.lineTo(px + s * 0.48, py + s * 0.5);
      g.lineTo(px + s * 0.42, py + s * 0.62);
      g.lineTo(px + s * 0.7, py + s * 0.7);
      g.stroke();
    }
  },
  animate: (ctx, kind, px, py, s, tx, ty, t, warn) => {
    if (kind === TERRAIN.WATER) {
      const a = 0.12 + 0.1 * Math.sin(t * 1.6 + tx * 0.8 + ty);
      ctx.fillStyle = `rgba(200,60,255,${a})`;
      ctx.fillRect(px + s * 0.06, py + s * 0.06, s * 0.88, s * 0.88);
    } else if (kind === TERRAIN.VENT) {
      const glow = warn > 0 ? 0.45 + 0.45 * Math.abs(Math.sin(t * 12)) : 0.18 + 0.1 * Math.sin(t * 2.5);
      circle(ctx, px + s / 2, py + s / 2, s * 0.3, `rgba(255,80,210,${glow})`);
      if (warn > 0) {
        // alerte : anneau rouge-rose qui palpite
        stroke(ctx, `rgba(255,60,120,${0.6 + 0.4 * Math.sin(t * 12)})`, Math.max(1.5, s * 0.07));
        ctx.beginPath();
        ctx.arc(px + s / 2, py + s / 2, s * (0.5 + 0.08 * Math.sin(t * 12)), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  },
  pillar: crystal,
  block: techCrate,
  debris: (tx, ty) => {
    const [cx, cy] = canon(CHAOS_ARENA.layout, tx, ty);
    return hash(cx, cy, 9) < 0.5 ? ["#8a3a9e", "#ff5ccf", "#ffffff"] : ["#2f6aa0", "#4ff0ff", "#ffffff"];
  },
  eruption: ["#ff5ccf", "#4ff0ff", "#ffffff"],
};

const ARTS: Record<string, Art> = { forest: FOREST, volcano: VOLCANO, ice: ICE, beach: BEACH, labyrinth: LABYRINTH_ART, chaos_arena: CHAOS_ARENA_ART };


export function getArt(id: string): Art {
  return ARTS[id] ?? FOREST;
}
