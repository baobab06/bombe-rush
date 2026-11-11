/**
 * DESSIN DES COFFRES (canvas) — un vrai coffre par rareté, pas un simple
 * changement de couleur :
 *   commun     : bois et fer, cadenas en laiton
 *   rare       : acier bleu, ferrures argentées, gemme cyan
 *   épique     : améthyste et or, coins ouvragés, gemme rose
 *   légendaire : or massif, rubis, couronne, étincelles
 *
 * Le même dessin sert partout : vignettes (image mise en cache) et
 * cinématique d'ouverture (pose animée : couvercle qui s'ouvre, lumière,
 * écrasement / étirement, serrure qui saute).
 */
import type { ChestTier } from "../meta/progress-config";

const INK = "#140f3c";

interface Pal {
  /** corps : haut → bas */
  a: string;
  b: string;
  /** couvercle (un peu plus clair) */
  lid: string;
  /** ferrures : clair → foncé */
  t1: string;
  t2: string;
  /** intérieur */
  lining: string;
  lining2: string;
  gem: string;
  gem2: string;
  /** lumière qui sort du coffre */
  glow: string;
}

export const CHEST_PAL: Record<ChestTier, Pal> = {
  common: { a: "#c98a4b", b: "#8f5527", lid: "#dba05f", t1: "#dfe6ee", t2: "#7d8a9a", lining: "#4a2a12", lining2: "#2b1708", gem: "#ffd45a", gem2: "#c98a12", glow: "#ffe9a8" },
  rare: { a: "#52b4ff", b: "#1c5cc2", lid: "#7cc9ff", t1: "#ffffff", t2: "#9db0c8", lining: "#143a78", lining2: "#0a1f47", gem: "#8ff6ff", gem2: "#16b8d8", glow: "#a8ecff" },
  epic: { a: "#b673ff", b: "#5d22b8", lid: "#cf9bff", t1: "#ffe27a", t2: "#d68f14", lining: "#35126e", lining2: "#1c083f", gem: "#ff8be0", gem2: "#d32fa6", glow: "#f3bcff" },
  legend: { a: "#ffd447", b: "#e58a00", lid: "#ffe680", t1: "#fff8cf", t2: "#f0a516", lining: "#8a2c0a", lining2: "#4f1503", gem: "#ff5a76", gem2: "#c01238", glow: "#fff4b8" },
};

export interface ChestPose {
  /** 0 = fermé, 1 = grand ouvert (peut dépasser un peu : rebond) */
  open?: number;
  /** lumière qui s'échappe (0..1) */
  glow?: number;
  /** faisceau de lumière vers le haut (0..1), coffre ouvert */
  beam?: number;
  /** couleur de la lumière (par défaut : celle du coffre) */
  light?: string;
  /** serrure visible (false : elle a sauté) */
  lock?: boolean;
  /** écrasement / étirement */
  sx?: number;
  sy?: number;
  rot?: number;
  /** temps (scintillements) */
  t?: number;
  /** ombre au sol (0..1) */
  shadow?: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function grad(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const q = i % 2 ? r * 0.3 : r;
    c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  c.closePath();
}

// géométrie (unité : largeur du coffre)
const LW = 0.034; // contour
const HW = 0.47; // demi-largeur du corps
const FEET = 0.03;
const HB = 0.4; // hauteur du corps
const YB = -FEET; // bas du corps
const YT = YB - HB; // haut du corps
const HL = 0.31; // hauteur du couvercle fermé
const DEPTH = 0.37; // profondeur (hauteur de l'intérieur du couvercle, grand ouvert)
const STRAP = 0.27; // position des ferrures verticales

/** Rivet. */
function rivet(c: CanvasRenderingContext2D, x: number, y: number, p: Pal, r = 0.017) {
  c.beginPath();
  c.arc(x, y, r, 0, 7);
  c.fillStyle = p.t2;
  c.fill();
  c.lineWidth = LW * 0.45;
  c.strokeStyle = INK;
  c.stroke();
  c.beginPath();
  c.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, 7);
  c.fillStyle = "rgba(255,255,255,.75)";
  c.fill();
}

/** Ferrure verticale (corps ou couvercle), entre y0 et y1. */
function strap(c: CanvasRenderingContext2D, x: number, y0: number, y1: number, p: Pal, w = 0.1) {
  c.fillStyle = grad(c, x - w / 2, 0, x + w / 2, 0, [[0, p.t2], [0.3, p.t1], [0.7, p.t1], [1, p.t2]]);
  c.fillRect(x - w / 2, y0, w, y1 - y0);
  c.lineWidth = LW * 0.6;
  c.strokeStyle = INK;
  c.beginPath();
  c.moveTo(x - w / 2, y0);
  c.lineTo(x - w / 2, y1);
  c.moveTo(x + w / 2, y0);
  c.lineTo(x + w / 2, y1);
  c.stroke();
}

/** Serrure, centrée en (0,0). Exportée : elle saute à l'ouverture. */
export function drawLock(c: CanvasRenderingContext2D, x: number, y: number, s: number, tier: ChestTier, rot = 0, alpha = 1) {
  const p = CHEST_PAL[tier];
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  c.globalAlpha *= alpha;
  c.lineJoin = "round";
  c.strokeStyle = INK;
  if (tier === "common") {
    // cadenas en laiton
    c.lineWidth = 0.05;
    c.strokeStyle = INK;
    c.beginPath();
    c.arc(0, -0.035, 0.05, Math.PI, 0);
    c.stroke();
    c.lineWidth = 0.026;
    c.strokeStyle = p.t1;
    c.beginPath();
    c.arc(0, -0.035, 0.05, Math.PI, 0);
    c.stroke();
    rr(c, -0.08, -0.04, 0.16, 0.14, 0.03);
    c.fillStyle = grad(c, 0, -0.04, 0, 0.1, [[0, "#ffe07a"], [1, "#d7931a"]]);
    c.fill();
    c.lineWidth = LW * 0.8;
    c.strokeStyle = INK;
    c.stroke();
    c.fillStyle = INK;
    c.beginPath();
    c.arc(0, 0.015, 0.022, 0, 7);
    c.fill();
    c.fillRect(-0.009, 0.02, 0.018, 0.045);
    c.fillStyle = "rgba(255,255,255,.55)";
    rr(c, -0.062, -0.028, 0.05, 0.016, 0.008);
    c.fill();
  } else {
    // plaque + gemme
    c.lineWidth = LW * 0.8;
    if (tier === "legend") {
      // soleil d'or
      c.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        const q = i % 2 ? 0.092 : 0.128;
        c.lineTo(Math.cos(a) * q, Math.sin(a) * q + 0.01);
      }
      c.closePath();
    } else if (tier === "epic") {
      // écu
      c.beginPath();
      c.moveTo(-0.095, -0.075);
      c.lineTo(0.095, -0.075);
      c.lineTo(0.095, 0.03);
      c.quadraticCurveTo(0.08, 0.1, 0, 0.14);
      c.quadraticCurveTo(-0.08, 0.1, -0.095, 0.03);
      c.closePath();
    } else {
      c.beginPath();
      c.arc(0, 0.01, 0.098, 0, 7);
    }
    c.fillStyle = grad(c, 0, -0.1, 0, 0.13, [[0, p.t1], [1, p.t2]]);
    c.fill();
    c.strokeStyle = INK;
    c.stroke();
    // gemme
    const gy = tier === "epic" ? 0.02 : 0.01;
    c.beginPath();
    if (tier === "epic") {
      c.moveTo(0, gy - 0.06);
      c.lineTo(0.05, gy);
      c.lineTo(0, gy + 0.06);
      c.lineTo(-0.05, gy);
      c.closePath();
    } else if (tier === "legend") {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        c.lineTo(Math.cos(a) * 0.058, gy + Math.sin(a) * 0.058);
      }
      c.closePath();
    } else c.arc(0, gy, 0.052, 0, 7);
    c.fillStyle = grad(c, -0.04, gy - 0.05, 0.04, gy + 0.05, [[0, p.gem], [1, p.gem2]]);
    c.fill();
    c.lineWidth = LW * 0.6;
    c.stroke();
    c.fillStyle = "rgba(255,255,255,.85)";
    c.beginPath();
    c.ellipse(-0.016, gy - 0.02, 0.016, 0.01, -0.6, 0, 7);
    c.fill();
  }
  c.restore();
}

/**
 * Dessine un coffre posé sur le sol : (x, base) = milieu du bas, s = largeur.
 */
export function drawChest(c: CanvasRenderingContext2D, x: number, base: number, s: number, tier: ChestTier, pose: ChestPose = {}) {
  const p = CHEST_PAL[tier];
  const open = Math.max(0, pose.open ?? 0);
  const glow = clamp(pose.glow ?? 0, 0, 1);
  const beam = clamp(pose.beam ?? 0, 0, 1.2);
  const light = pose.light ?? p.glow;
  const t = pose.t ?? 0;
  const fancy = tier !== "common";

  c.save();
  c.translate(x, base);
  // ombre au sol (ne tourne pas, ne s'écrase pas)
  const sh = pose.shadow ?? 1;
  if (sh > 0) {
    c.save();
    c.scale(s, s);
    c.fillStyle = `rgba(0,0,0,${0.38 * sh})`;
    c.beginPath();
    c.ellipse(0, 0.012, 0.56 * (pose.sx ?? 1), 0.07, 0, 0, 7);
    c.fill();
    c.restore();
  }
  c.rotate(pose.rot ?? 0);
  c.scale(s * (pose.sx ?? 1), s * (pose.sy ?? 1));
  c.lineJoin = "round";
  c.lineCap = "round";

  // ----------------------------------------------------------- couvercle
  const theta = Math.min(open, 1.12) * 1.83; // jusqu'à ~105° (un peu plus au rebond)
  const cav = 0.1 * clamp(open * 4, 0, 1); // ouverture du corps vue de dessus
  const yH = YT - cav; // charnière (bord arrière)
  const innerH = DEPTH * Math.sin(theta);
  const frontH = HL * Math.max(0, Math.cos(theta));
  const total = innerH + frontH;
  const lw2 = HW * lerp(1.045, 0.95, clamp(open * 1.6, 0, 1));
  const drawLid = () => {
    const top = yH - total;
    const r = Math.min(0.21, total * 0.66);
    const path = () => rr(c, -lw2, top, lw2 * 2, total + (open < 0.02 ? 0.02 : 0), [r, r, 0.015, 0.015]);
    // intérieur (visible quand le couvercle bascule vers l'arrière)
    path();
    c.fillStyle = grad(c, 0, top, 0, yH, [[0, p.lining], [1, p.lining2]]);
    c.fill();
    c.save();
    path();
    c.clip();
    if (innerH > 0.01) {
      // doublure : panneau en creux + lumière qui remonte de l'intérieur
      rr(c, -lw2 + 0.07, yH - innerH + 0.03, lw2 * 2 - 0.14, innerH - 0.02, [Math.max(0.01, r - 0.06), Math.max(0.01, r - 0.06), 0.01, 0.01]);
      c.fillStyle = "rgba(0,0,0,.22)";
      c.fill();
      if (glow > 0) {
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = 0.55 * glow;
        c.fillStyle = grad(c, 0, yH, 0, yH - innerH, [[0, light], [1, "rgba(0,0,0,0)"]]);
        c.fillRect(-lw2, yH - innerH, lw2 * 2, innerH);
        c.globalAlpha = 1;
        c.globalCompositeOperation = "source-over";
      }
    }
    if (frontH > 0.004) {
      // face extérieure (se réduit en basculant)
      const fy = yH - innerH; // bas de la face extérieure
      c.save();
      c.beginPath();
      c.rect(-lw2 - 0.1, top - 0.1, lw2 * 2 + 0.2, frontH + 0.1);
      c.clip();
      c.fillStyle = grad(c, 0, top, 0, fy, [[0, p.lid], [0.55, p.a], [1, p.b]]);
      c.fillRect(-lw2, top, lw2 * 2, frontH);
      const k = frontH / HL;
      if (tier === "common") {
        // planches
        c.strokeStyle = "rgba(60,30,10,.35)";
        c.lineWidth = 0.012;
        for (const f of [0.36, 0.68]) {
          c.beginPath();
          c.moveTo(-lw2, top + frontH * f);
          c.lineTo(lw2, top + frontH * f);
          c.stroke();
        }
      } else {
        // coins ouvragés
        c.fillStyle = grad(c, 0, top, 0, top + 0.18 * k, [[0, p.t1], [1, p.t2]]);
        for (const sgn of [-1, 1]) {
          c.beginPath();
          c.moveTo(sgn * lw2, top - 0.02);
          c.lineTo(sgn * (lw2 - 0.2), top - 0.02);
          c.quadraticCurveTo(sgn * (lw2 - 0.17), top + 0.13 * k, sgn * lw2, top + 0.2 * k);
          c.closePath();
          c.fill();
          c.lineWidth = LW * 0.6;
          c.strokeStyle = INK;
          c.stroke();
        }
      }
      // reflet
      c.fillStyle = "rgba(255,255,255,.3)";
      rr(c, -lw2 + 0.09, top + 0.035 * k, lw2 * 0.62, 0.035 * k, 0.02);
      c.fill();
      // ferrures + bordure basse du couvercle
      const sx = (STRAP * lw2) / HW;
      strap(c, -sx, top - 0.02, fy, p);
      strap(c, sx, top - 0.02, fy, p);
      c.fillStyle = grad(c, 0, fy - 0.07 * k, 0, fy, [[0, p.t1], [1, p.t2]]);
      c.fillRect(-lw2, fy - 0.065 * k, lw2 * 2, 0.065 * k);
      c.lineWidth = LW * 0.6;
      c.strokeStyle = INK;
      c.beginPath();
      c.moveTo(-lw2, fy - 0.065 * k);
      c.lineTo(lw2, fy - 0.065 * k);
      c.stroke();
      if (k > 0.6) {
        rivet(c, -sx, top + frontH * 0.42, p);
        rivet(c, sx, top + frontH * 0.42, p);
      }
      c.restore();
    }
    // rebord du couvercle (entre intérieur et extérieur)
    if (innerH > 0.01 && frontH > 0.012) {
      c.fillStyle = grad(c, 0, yH - innerH - 0.03, 0, yH - innerH + 0.012, [[0, p.t1], [1, p.t2]]);
      c.fillRect(-lw2, yH - innerH - 0.022, lw2 * 2, 0.034);
      c.lineWidth = LW * 0.55;
      c.strokeStyle = INK;
      c.strokeRect(-lw2, yH - innerH - 0.022, lw2 * 2, 0.034);
    }
    c.restore();
    path();
    c.lineWidth = LW;
    c.strokeStyle = INK;
    c.stroke();
    // ornement au sommet (disparaît quand le couvercle bascule)
    const kc = clamp(1 - open * 2.2, 0, 1);
    if (kc > 0.02 && (tier === "legend" || tier === "epic")) {
      c.save();
      c.translate(0, top + 0.004);
      c.scale(tier === "legend" ? 1.25 : 1.15, kc * (tier === "legend" ? 1.25 : 1.15));
      c.lineWidth = LW * 0.75;
      c.strokeStyle = INK;
      c.fillStyle = grad(c, 0, -0.13, 0, 0, [[0, p.t1], [1, p.t2]]);
      if (tier === "legend") {
        // couronne
        c.beginPath();
        c.moveTo(-0.14, 0);
        c.lineTo(-0.16, -0.1);
        c.lineTo(-0.075, -0.05);
        c.lineTo(0, -0.14);
        c.lineTo(0.075, -0.05);
        c.lineTo(0.16, -0.1);
        c.lineTo(0.14, 0);
        c.closePath();
        c.fill();
        c.stroke();
        for (const [gx, gy] of [[-0.16, -0.1], [0, -0.14], [0.16, -0.1]]) {
          c.beginPath();
          c.arc(gx, gy, 0.022, 0, 7);
          c.fillStyle = p.gem;
          c.fill();
          c.stroke();
        }
      } else {
        // fleuron + gemme
        c.beginPath();
        c.moveTo(-0.1, 0);
        c.quadraticCurveTo(-0.07, -0.06, 0, -0.1);
        c.quadraticCurveTo(0.07, -0.06, 0.1, 0);
        c.closePath();
        c.fill();
        c.stroke();
        c.beginPath();
        c.arc(0, -0.045, 0.026, 0, 7);
        c.fillStyle = p.gem;
        c.fill();
        c.stroke();
      }
      c.restore();
    }
  };

  // ---------------------------------------------------------------- corps
  const drawBody = () => {
    // pieds
    c.fillStyle = tier === "common" ? "#5e3414" : p.t2;
    c.lineWidth = LW * 0.7;
    c.strokeStyle = INK;
    for (const fx of [-0.36, 0.36]) {
      rr(c, fx - 0.07, YB - 0.01, 0.14, FEET + 0.01, [0, 0, 0.012, 0.012]);
      c.fill();
      c.stroke();
    }
    const body = () => rr(c, -HW, YT, HW * 2, HB, [0.012, 0.012, 0.06, 0.06]);
    body();
    c.fillStyle = grad(c, 0, YT, 0, YB, [[0, p.a], [1, p.b]]);
    c.fill();
    c.save();
    body();
    c.clip();
    if (tier === "common") {
      c.strokeStyle = "rgba(60,30,10,.4)";
      c.lineWidth = 0.012;
      for (const f of [0.42, 0.72]) {
        c.beginPath();
        c.moveTo(-HW, YT + HB * f);
        c.lineTo(HW, YT + HB * f);
        c.stroke();
      }
      // nœuds du bois
      c.fillStyle = "rgba(60,30,10,.28)";
      for (const [kx, ky] of [[-0.12, 0.3], [0.13, 0.84], [-0.4, 0.86]]) {
        c.beginPath();
        c.ellipse(kx, YT + HB * ky, 0.022, 0.011, 0, 0, 7);
        c.fill();
      }
    } else {
      // panneaux en creux
      for (const [px, pw] of [[-STRAP + 0.07, STRAP * 2 - 0.14], [-HW + 0.045, HW - STRAP - 0.115], [STRAP + 0.07, HW - STRAP - 0.115]]) {
        rr(c, px, YT + 0.115, pw, HB - 0.19, 0.022);
        c.fillStyle = "rgba(10,5,40,.17)";
        c.fill();
        c.fillStyle = "rgba(255,255,255,.2)";
        c.fillRect(px + 0.012, YT + HB - 0.082, pw - 0.024, 0.008);
      }
    }
    // ombre du bas, reflet de gauche
    c.fillStyle = grad(c, 0, YB - 0.14, 0, YB, [[0, "rgba(10,5,40,0)"], [1, "rgba(10,5,40,.3)"]]);
    c.fillRect(-HW, YB - 0.14, HW * 2, 0.14);
    c.fillStyle = "rgba(255,255,255,.2)";
    c.fillRect(-HW + 0.028, YT + 0.09, 0.02, HB - 0.2);
    strap(c, -STRAP, YT, YB, p);
    strap(c, STRAP, YT, YB, p);
    // bordure haute du corps
    c.fillStyle = grad(c, 0, YT, 0, YT + 0.075, [[0, p.t1], [1, p.t2]]);
    c.fillRect(-HW, YT, HW * 2, 0.072);
    c.lineWidth = LW * 0.6;
    c.strokeStyle = INK;
    c.beginPath();
    c.moveTo(-HW, YT + 0.072);
    c.lineTo(HW, YT + 0.072);
    c.stroke();
    if (fancy) {
      // équerres des coins du bas
      c.fillStyle = grad(c, 0, YB - 0.15, 0, YB, [[0, p.t1], [1, p.t2]]);
      for (const sgn of [-1, 1]) {
        c.beginPath();
        c.moveTo(sgn * HW, YB - 0.17);
        c.quadraticCurveTo(sgn * (HW - 0.13), YB - 0.13, sgn * (HW - 0.16), YB + 0.01);
        c.lineTo(sgn * HW, YB + 0.01);
        c.closePath();
        c.fill();
        c.stroke();
      }
    }
    c.restore();
    for (const sgn of [-1, 1]) {
      rivet(c, sgn * STRAP, YT + 0.16, p);
      rivet(c, sgn * STRAP, YB - 0.07, p);
      if (fancy) rivet(c, sgn * (HW - 0.05), YB - 0.05, p, 0.014);
    }
    body();
    c.lineWidth = LW;
    c.strokeStyle = INK;
    c.stroke();
  };

  if (open > 0.02) {
    drawLid();
    // intérieur du corps (vu de dessus)
    c.beginPath();
    c.moveTo(-HW + 0.01, YT + 0.01);
    c.lineTo(HW - 0.01, YT + 0.01);
    c.lineTo(HW * 0.95, yH);
    c.lineTo(-HW * 0.95, yH);
    c.closePath();
    c.fillStyle = grad(c, 0, yH, 0, YT, [[0, p.lining2], [1, p.lining]]);
    c.fill();
    c.lineWidth = LW * 0.8;
    c.strokeStyle = INK;
    c.stroke();
    // lumière
    if (glow > 0 || beam > 0) {
      c.save();
      c.globalCompositeOperation = "lighter";
      if (beam > 0) {
        const hgt = 1.9;
        c.globalAlpha = Math.min(1, beam) * 0.75;
        c.beginPath();
        c.moveTo(-HW * 0.86, YT);
        c.lineTo(HW * 0.86, YT);
        c.lineTo(HW * 1.75, YT - hgt);
        c.lineTo(-HW * 1.75, YT - hgt);
        c.closePath();
        c.fillStyle = grad(c, 0, YT, 0, YT - hgt, [[0, light], [0.25, light + "aa"], [1, "rgba(0,0,0,0)"]]);
        c.fill();
        // cœur du faisceau
        c.globalAlpha = Math.min(1, beam) * 0.55;
        c.beginPath();
        c.moveTo(-HW * 0.5, YT);
        c.lineTo(HW * 0.5, YT);
        c.lineTo(HW * 0.85, YT - hgt * 0.8);
        c.lineTo(-HW * 0.85, YT - hgt * 0.8);
        c.closePath();
        c.fillStyle = grad(c, 0, YT, 0, YT - hgt * 0.8, [[0, "#ffffff"], [1, "rgba(255,255,255,0)"]]);
        c.fill();
      }
      c.globalAlpha = Math.max(glow, Math.min(1, beam));
      const g = c.createRadialGradient(0, YT - cav * 0.5, 0.02, 0, YT - cav * 0.5, 0.62);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.22, light);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(0, YT - cav * 0.5, 0.62, 0.3, 0, 0, 7);
      c.fill();
      c.restore();
    }
    drawBody();
  } else {
    drawBody();
    drawLid();
    // lumière qui passe par la fente
    if (glow > 0) {
      c.save();
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = glow;
      const ry = 0.05 + 0.07 * glow;
      const g = c.createRadialGradient(0, YT, 0.01, 0, YT, 0.6);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.25, light);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.translate(0, YT);
      c.scale(1, ry / 0.6);
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, 0.6, 0, 7);
      c.fill();
      c.restore();
    }
  }
  if (pose.lock !== false && open < 0.02) drawLock(c, 0, YT + 0.035, 1, tier);

  // étincelles du légendaire
  if (tier === "legend" && open < 0.02) {
    c.fillStyle = "#fffbe0";
    for (const [i, sx0, sy0] of [[0, -0.36, -0.62], [1, 0.4, -0.5], [2, 0.3, -0.16], [3, -0.44, -0.2]] as const) {
      const tw = 0.5 + 0.5 * Math.sin(t * 3.2 + i * 1.7);
      star(c, sx0, sy0, 0.022 + 0.03 * tw, t * 0.6 + i);
      c.globalAlpha = 0.45 + 0.55 * tw;
      c.fill();
    }
    c.globalAlpha = 1;
  }
  c.restore();
}

/** Hauteur d'un coffre fermé (ornement compris), en largeurs de coffre. */
export const CHEST_HEIGHT = FEET + HB + HL + 0.15;
/** Hauteur de la fente (lumière, serrure) au-dessus du sol, en largeurs de coffre. */
export const CHEST_SEAM = -YT;

const cache = new Map<string, string>();
/** Image d'un coffre fermé (pour les listes, les cartes de récompense…). */
export function chestImage(tier: ChestTier, px = 240): string {
  const key = `${tier}:${px}`;
  let url = cache.get(key);
  if (!url) {
    const cv = document.createElement("canvas");
    cv.width = Math.round(px * 1.24);
    cv.height = Math.round(px * 1.06);
    const c = cv.getContext("2d")!;
    drawChest(c, cv.width / 2, cv.height - px * 0.09, px, tier, { t: 0.9 });
    url = cv.toDataURL("image/png");
    cache.set(key, url);
  }
  return url;
}
