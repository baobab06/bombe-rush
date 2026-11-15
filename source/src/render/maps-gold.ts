/**
 * Cartes de la Ruée vers l'or : MINE D'OR et FAR WEST.
 *
 * Le dessin seulement (les collisions viennent du plan, src/maps/*.ts).
 * Les FILONS D'OR (« $ » du plan) ont leur propre rocher doré qui scintille :
 * on les repère d'un coup d'œil, c'est là qu'est la grosse pépite.
 */
import { TERRAIN } from "../core/types";
import { MINE } from "../maps/mine";
import { WESTERN } from "../maps/western";
import type { Art } from "./art";
import { LIFT, drawCrate, drawStone, hash } from "./sprites";
import { THEMES, type Theme } from "./themes";

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
function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0) {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  g.fill();
}
function line(g: Ctx, pts: number[], color: string, width: number) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.stroke();
}
const isVein = (layout: string[], tx: number, ty: number) => layout[ty]?.[tx] === "$";

/** Étoile de scintillement (4 branches). */
function sparkle(g: Ctx, x: number, y: number, r: number, color = "#ffffff") {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - r);
  g.lineTo(x + r * 0.22, y - r * 0.22);
  g.lineTo(x + r, y);
  g.lineTo(x + r * 0.22, y + r * 0.22);
  g.lineTo(x, y + r);
  g.lineTo(x - r * 0.22, y + r * 0.22);
  g.lineTo(x - r, y);
  g.lineTo(x - r * 0.22, y - r * 0.22);
  g.closePath();
  g.fill();
}

/**
 * FILON D'OR : rocher (couleurs `rock`) traversé de veines d'or, pépites
 * incrustées et éclats qui scintillent.
 */
function goldVein(g: Ctx, px: number, py: number, s: number, tx: number, ty: number, rock: { top: string; side: string; light: string }) {
  const lift = s * LIFT;
  const pad = s * 0.04;
  // ombre + halo doré au sol
  const halo = g.createRadialGradient(px + s / 2, py + s * 0.62, s * 0.1, px + s / 2, py + s * 0.62, s * 0.75);
  halo.addColorStop(0, "rgba(255,210,63,0.35)");
  halo.addColorStop(1, "rgba(255,210,63,0)");
  g.fillStyle = halo;
  g.fillRect(px - s * 0.25, py, s * 1.5, s * 1.1);
  rr(g, px + pad + s * 0.06, py + pad + s * 0.08, s - pad * 2, s - pad * 2, s * 0.26, "rgba(0,0,0,0.3)");
  // rocher
  rr(g, px + pad, py - lift + pad, s - pad * 2, s - pad, s * 0.28, rock.side);
  rr(g, px + pad, py - lift + pad, s - pad * 2, s - pad * 2 - lift * 0.2, s * 0.28, rock.top);
  rr(g, px + s * 0.18, py - lift + s * 0.12, s * 0.3, s * 0.1, s * 0.05, rock.light);
  // veines d'or
  const top = py - lift + pad;
  const vw = Math.max(1.5, s * 0.07);
  g.save();
  g.beginPath();
  g.roundRect(px + pad, top, s - pad * 2, s - pad * 2 - lift * 0.2, s * 0.28);
  g.clip();
  line(g, [px + s * 0.08, top + s * 0.62, px + s * 0.34, top + s * 0.48, px + s * 0.52, top + s * 0.56, px + s * 0.92, top + s * 0.3], "#a86a00", vw * 1.6);
  line(g, [px + s * 0.08, top + s * 0.62, px + s * 0.34, top + s * 0.48, px + s * 0.52, top + s * 0.56, px + s * 0.92, top + s * 0.3], "#ffd23f", vw);
  line(g, [px + s * 0.3, top + s * 0.1, px + s * 0.4, top + s * 0.3, px + s * 0.34, top + s * 0.48], "#a86a00", vw * 1.3);
  line(g, [px + s * 0.3, top + s * 0.1, px + s * 0.4, top + s * 0.3, px + s * 0.34, top + s * 0.48], "#ffe680", vw * 0.7);
  g.restore();
  // pépites incrustées
  const nug = (x: number, y: number, r: number) => {
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r * 1.2);
    gr.addColorStop(0, "#fff6b0");
    gr.addColorStop(0.5, "#ffcf2e");
    gr.addColorStop(1, "#b87400");
    circle(g, x, y, r, gr);
    g.strokeStyle = "#5a3500";
    g.lineWidth = Math.max(1, s * 0.03);
    g.stroke();
  };
  nug(px + s * 0.62, top + s * 0.5, s * 0.1);
  nug(px + s * 0.26, top + s * 0.36, s * 0.07);
  nug(px + s * 0.74, top + s * 0.2, s * 0.06);
  // éclats qui scintillent (décalés d'une case à l'autre)
  const t = now();
  for (let k = 0; k < 2; k++) {
    const ph = (t * 0.8 + hash(tx, ty, 30 + k) * 3) % 1;
    if (ph > 0.25) continue;
    const a = Math.sin((ph / 0.25) * Math.PI);
    sparkle(g, px + s * (0.25 + 0.5 * hash(tx, ty, 40 + k)), top + s * (0.15 + 0.4 * hash(tx, ty, 50 + k)), s * 0.14 * a);
  }
}

// ================================================================ MINE
const mineTheme: Theme = {
  ...THEMES.forest,
  id: "mine",
  background: "#140d08",
  shadow: "rgba(0, 0, 0, 0.42)",
  ink: "#1a110a",
  stone: { top: "#7a6552", side: "#4a3a2c", light: "#9c8670", moss: "#6b5644" },
  crate: { top: "#c98a4a", side: "#86542a", plank: "#a76d37", band: "#5c3518" },
};

/** Lanterne de mine accrochée (halo chaud). */
function lantern(g: Ctx, x: number, y: number, s: number) {
  const halo = g.createRadialGradient(x, y, s * 0.05, x, y, s * 0.9);
  halo.addColorStop(0, "rgba(255,190,90,0.55)");
  halo.addColorStop(1, "rgba(255,190,90,0)");
  g.fillStyle = halo;
  g.fillRect(x - s, y - s, s * 2, s * 2);
  line(g, [x, y - s * 0.22, x, y - s * 0.12], "#2a1b10", Math.max(1, s * 0.03));
  rr(g, x - s * 0.08, y - s * 0.12, s * 0.16, s * 0.2, s * 0.04, "#2a1b10");
  rr(g, x - s * 0.055, y - s * 0.09, s * 0.11, s * 0.14, s * 0.03, "#ffd27a");
  circle(g, x, y - s * 0.02, s * 0.03, "#fff6d0");
}

/** Tonneau (bloc destructible). */
function barrel(g: Ctx, px: number, py: number, s: number, wood: string, dark: string, band: string) {
  const lift = s * LIFT;
  const cx = px + s / 2;
  ellipse(g, cx + s * 0.05, py + s * 0.82, s * 0.36, s * 0.12, "rgba(0,0,0,0.3)");
  rr(g, px + s * 0.16, py - lift + s * 0.14, s * 0.68, s * 0.8, s * 0.16, dark);
  rr(g, px + s * 0.18, py - lift + s * 0.12, s * 0.64, s * 0.76, s * 0.16, wood);
  for (const k of [0.28, 0.62]) rr(g, px + s * 0.16, py - lift + s * (0.12 + k * 0.76), s * 0.68, s * 0.07, s * 0.02, band);
  ellipse(g, cx, py - lift + s * 0.16, s * 0.3, s * 0.1, dark);
  ellipse(g, cx, py - lift + s * 0.15, s * 0.26, s * 0.07, wood);
  line(g, [px + s * 0.38, py - lift + s * 0.25, px + s * 0.38, py - lift + s * 0.8], "rgba(0,0,0,0.15)", Math.max(1, s * 0.025));
  line(g, [px + s * 0.62, py - lift + s * 0.25, px + s * 0.62, py - lift + s * 0.8], "rgba(0,0,0,0.15)", Math.max(1, s * 0.025));
}

export const MINE_ART: Art = {
  id: "mine",
  background: "#140d08",
  ink: mineTheme.ink,
  farVeil: "rgba(8, 4, 2, 0.55)",
  floor: (g, px, py, s, tx, ty) => {
    // terre battue de galerie, en damier très doux
    g.fillStyle = (tx + ty) % 2 ? "#6e4d30" : "#674729";
    g.fillRect(px, py, s, s);
    // cailloux et poussière d'or
    for (let k = 0; k < 3; k++) {
      const d = hash(tx, ty, 60 + k);
      if (d < 0.5) ellipse(g, px + s * (0.15 + 0.7 * hash(tx, ty, 70 + k)), py + s * (0.15 + 0.7 * hash(tx, ty, 80 + k)), s * 0.05, s * 0.035, "#55391f");
    }
    if (hash(tx, ty, 90) < 0.35) circle(g, px + s * hash(tx, ty, 91), py + s * hash(tx, ty, 92), s * 0.018, "#f2c94c");
    // rails de wagonnets (rangées 3 et 7) : traverses + deux rails
    if ((ty === 3 || ty === 7) && tx > 0 && tx < MINE.layout[0].length - 1) {
      for (const k of [0.18, 0.5, 0.82]) rr(g, px + s * (k - 0.06), py + s * 0.24, s * 0.12, s * 0.52, s * 0.02, "#5a3a1e");
      g.fillStyle = "#9aa3ab";
      g.fillRect(px, py + s * 0.32, s, s * 0.05);
      g.fillRect(px, py + s * 0.63, s, s * 0.05);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fillRect(px, py + s * 0.32, s, s * 0.015);
      g.fillRect(px, py + s * 0.63, s, s * 0.015);
    }
  },
  border: (g, px, py, s, tx, ty, ring) => {
    // paroi rocheuse
    g.fillStyle = ring ? "#3b2a1c" : "#22170e";
    g.fillRect(px - 1, py - 1, s + 2, s + 2);
    for (let k = 0; k < 3; k++)
      ellipse(g, px + s * (0.2 + 0.6 * hash(tx, ty, k)), py + s * (0.2 + 0.6 * hash(tx, ty, k + 5)), s * (0.18 + 0.12 * hash(tx, ty, k + 9)), s * 0.13, ring ? "#4a3624" : "#2c1f14");
    if (!ring) return;
    // étais en bois réguliers + lanternes
    if ((tx + ty) % 3 === 0) {
      rr(g, px + s * 0.38, py, s * 0.24, s, s * 0.04, "#7a4e26");
      rr(g, px + s * 0.42, py, s * 0.06, s, 0, "#94612f");
      if ((tx * 7 + ty) % 2 === 0) lantern(g, px + s * 0.5, py + s * 0.5, s);
    }
    if (hash(tx, ty, 12) < 0.2) circle(g, px + s * hash(tx, ty, 13), py + s * hash(tx, ty, 14), s * 0.04, "#e8b93a");
  },
  terrain: () => {},
  pillar: (ctx, px, py, s, tx, ty) => {
    // pilier rocheux, parfois cerclé d'un étai en bois
    drawStone(ctx, px, py, s, mineTheme, hash(tx, ty));
    if (hash(tx, ty, 3) < 0.4) {
      const lift = s * LIFT;
      rr(ctx, px + s * 0.08, py - lift + s * 0.42, s * 0.84, s * 0.12, s * 0.03, "#7a4e26");
      rr(ctx, px + s * 0.08, py - lift + s * 0.42, s * 0.84, s * 0.04, s * 0.02, "#a06a35");
    }
  },
  block: (ctx, px, py, s, tx, ty) => {
    if (isVein(MINE.layout, tx, ty)) return goldVein(ctx, px, py, s, tx, ty, { top: "#6e5a48", side: "#43352a", light: "#8e7966" });
    if (hash(tx, ty, 5) < 0.45) barrel(ctx, px, py, s, "#b8743a", "#6e4220", "#3a3a40");
    else drawCrate(ctx, px, py, s, mineTheme);
  },
  debris: (tx, ty) => (isVein(MINE.layout, tx, ty) ? ["#ffd23f", "#6e5a48", "#fff3a0"] : ["#c98a4a", "#86542a", "#a76d37"]),
};

// ============================================================ FAR WEST
const westTheme: Theme = {
  ...THEMES.forest,
  id: "western",
  background: "#b8743a",
  shadow: "rgba(90, 45, 10, 0.3)",
  ink: "#2a1608",
  stone: { top: "#d99a5c", side: "#a8652e", light: "#f0c08a", moss: "#c47a3c" },
  crate: { top: "#d9a05b", side: "#9c6230", plank: "#b97a3d", band: "#6b3d1a" },
};

/** Cactus (décor). */
function cactus(g: Ctx, cx: number, by: number, s: number, k: number) {
  const h = s * (0.55 + 0.2 * k);
  const w = s * 0.16;
  ellipse(g, cx + s * 0.05, by, s * 0.22, s * 0.07, "rgba(90,45,10,0.3)");
  rr(g, cx - w / 2, by - h, w, h, w / 2, "#3f9a4a");
  rr(g, cx - w / 2 - s * 0.16, by - h * 0.62, s * 0.12, s * 0.07, s * 0.03, "#3f9a4a");
  rr(g, cx - w / 2 - s * 0.16, by - h * 0.85, s * 0.08, h * 0.28, s * 0.04, "#3f9a4a");
  rr(g, cx + w / 2, by - h * 0.48, s * 0.12, s * 0.07, s * 0.03, "#3f9a4a");
  rr(g, cx + w / 2 + s * 0.06, by - h * 0.7, s * 0.08, h * 0.26, s * 0.04, "#3f9a4a");
  rr(g, cx - w * 0.15, by - h + s * 0.04, w * 0.3, h - s * 0.08, w * 0.15, "#5cbf5a");
}

/** Maison de la ville (mur) : façade en planches et toit. */
function house(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const lift = s * LIFT;
  const hue = ["#a8652e", "#8f5427", "#b5743a", "#9a5d32"][Math.floor(hash(tx, ty, 2) * 4)];
  rr(g, px + s * 0.04 + s * 0.06, py + s * 0.1, s * 0.92, s * 0.9, s * 0.06, "rgba(90,45,10,0.3)");
  // façade
  rr(g, px + s * 0.03, py - lift, s * 0.94, s * 0.98 + lift * 0.2, s * 0.05, hue);
  g.strokeStyle = "rgba(40,18,4,0.35)";
  g.lineWidth = Math.max(1, s * 0.025);
  for (let k = 1; k < 5; k++) {
    const y = py - lift + (s * 0.98 * k) / 5;
    g.beginPath();
    g.moveTo(px + s * 0.05, y);
    g.lineTo(px + s * 0.95, y);
    g.stroke();
  }
  // toit (bord avant)
  rr(g, px, py - lift - s * 0.04, s, s * 0.16, s * 0.04, "#6b3d1a");
  rr(g, px, py - lift - s * 0.04, s, s * 0.05, s * 0.03, "#8a5328");
  // fenêtre ou enseigne
  const d = hash(tx, ty, 4);
  if (d < 0.5) {
    rr(g, px + s * 0.3, py - lift + s * 0.3, s * 0.4, s * 0.3, s * 0.03, "#2a1608");
    rr(g, px + s * 0.33, py - lift + s * 0.33, s * 0.34, s * 0.24, s * 0.02, "#ffd27a");
    g.fillStyle = "#2a1608";
    g.fillRect(px + s * 0.49, py - lift + s * 0.33, s * 0.02, s * 0.24);
  } else {
    rr(g, px + s * 0.14, py - lift + s * 0.22, s * 0.72, s * 0.2, s * 0.03, "#f0d9a8");
    g.fillStyle = "#6b3d1a";
    g.font = `900 ${Math.round(s * 0.13)}px "Baloo 2", system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(["SALOON", "BANK", "GOLD", "HOTEL"][Math.floor(hash(tx, ty, 6) * 4)], px + s / 2, py - lift + s * 0.325);
  }
}

export const WESTERN_ART: Art = {
  id: "western",
  background: "#b8743a",
  ink: westTheme.ink,
  farVeil: "rgba(120, 60, 20, 0.35)",
  floor: (g, px, py, s, tx, ty) => {
    g.fillStyle = (tx + ty) % 2 ? "#e9c47e" : "#e3bc74";
    g.fillRect(px, py, s, s);
    // grand-rue : traces de roues
    if (ty === 5) {
      g.fillStyle = "rgba(150,95,40,0.22)";
      g.fillRect(px, py + s * 0.28, s, s * 0.08);
      g.fillRect(px, py + s * 0.64, s, s * 0.08);
    }
    // cailloux, petites herbes sèches
    const d = hash(tx, ty, 7);
    if (d < 0.3) ellipse(g, px + s * hash(tx, ty, 8), py + s * hash(tx, ty, 9), s * 0.05, s * 0.035, "#c99a56");
    else if (d < 0.38) {
      const x = px + s * (0.2 + 0.6 * hash(tx, ty, 10));
      const y = py + s * (0.3 + 0.5 * hash(tx, ty, 11));
      for (let k = -1; k <= 1; k++) line(g, [x, y, x + k * s * 0.05, y - s * 0.1], "#b58a3c", Math.max(1, s * 0.02));
    }
  },
  border: (g, px, py, s, tx, ty, ring) => {
    if (!ring) {
      // désert lointain : dunes, rochers rouges, cactus
      g.fillStyle = (tx + ty) % 2 ? "#d6a05e" : "#d09a58";
      g.fillRect(px - 1, py - 1, s + 2, s + 2);
      const d = hash(tx, ty, 15);
      if (d < 0.12) cactus(g, px + s / 2, py + s * 0.85, s, hash(tx, ty, 16));
      else if (d < 0.22) {
        ellipse(g, px + s * 0.5, py + s * 0.62, s * 0.36, s * 0.22, "#a85a2e");
        ellipse(g, px + s * 0.46, py + s * 0.52, s * 0.3, s * 0.17, "#c4703a");
      }
      return;
    }
    // palissade de la ville
    g.fillStyle = "#d8ad68";
    g.fillRect(px - 1, py - 1, s + 2, s + 2);
    rr(g, px, py + s * 0.38, s, s * 0.1, 0, "#7a4a22");
    rr(g, px, py + s * 0.62, s, s * 0.1, 0, "#7a4a22");
    for (const k of [0.15, 0.85]) {
      rr(g, px + s * (k - 0.07), py + s * 0.2, s * 0.14, s * 0.66, s * 0.04, "#8f5a2c");
      rr(g, px + s * (k - 0.07), py + s * 0.2, s * 0.14, s * 0.05, s * 0.03, "#a86e38");
    }
    if (hash(tx, ty, 18) < 0.12) cactus(g, px + s / 2, py + s * 0.6, s * 0.8, 0.5);
  },
  terrain: (g, kind, px, py, s) => {
    if (kind === TERRAIN.NONE) return;
    g.fillStyle = "#d9b36e";
    g.fillRect(px, py, s, s);
  },
  pillar: (ctx, px, py, s, tx, ty) => house(ctx, px, py, s, tx, ty),
  block: (ctx, px, py, s, tx, ty) => {
    if (isVein(WESTERN.layout, tx, ty)) return goldVein(ctx, px, py, s, tx, ty, { top: "#c4703a", side: "#8a4620", light: "#e09058" });
    if (hash(tx, ty, 5) < 0.5) barrel(ctx, px, py, s, "#b8743a", "#6e4220", "#4a4a52");
    else drawCrate(ctx, px, py, s, westTheme);
  },
  debris: (tx, ty) => (isVein(WESTERN.layout, tx, ty) ? ["#ffd23f", "#c4703a", "#fff3a0"] : ["#d9a05b", "#9c6230", "#b97a3d"]),
};
