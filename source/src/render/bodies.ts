/**
 * Personnages dessinés en procédural (aucune image) : une silhouette par
 * « genre » + palette + tenue + motif = un skin.
 *
 * Pipeline d'un personnage :
 *   ombre → [corps + mains dans un calque] → motif / reflet / flash de dégâts
 *   (appliqués uniquement sur le corps, jamais sur le visage) → accessoires.
 * Animations : respiration, marche (rebond + inclinaison), action (pose
 * d'une bombe), dégâts, victoire, coucou de la main, clignement des yeux
 * et expressions (content, inquiet, sonné, fâché).
 *
 * Pour passer plus tard à de vraies illustrations, il suffit de remplacer
 * `drawCharacter` par des drawImage ; le reste du jeu ne change pas.
 */
import {
  WEAR_SLOT,
  getCharacter,
  getSkin,
  type Accessory,
  type AuraId,
  type BodyKind,
  type EyeStyle,
  type Palette,
  type Pattern,
} from "../core/characters";
import { getAccessory } from "../core/cosmetics";

type Ctx = CanvasRenderingContext2D;

export interface Look {
  kind: BodyKind;
  palette: Palette;
  /** objets portés (au plus un par emplacement) */
  wear: Accessory[];
  pattern: Pattern;
  aura: AuraId;
  eyes: EyeStyle;
  special?: "shimmer" | "rainbow";
  /** compat V1 */
  accessory?: Accessory;
}

export type Expr = "normal" | "happy" | "scared" | "dizzy" | "angry";

export interface CharPose {
  faceX: number;
  faceY: number;
  walk: number;
  moving: boolean;
  t: number;
  squash?: number; // 1 = normal
  /** pose d'une bombe / capacité : 0 → 1 */
  action?: number;
  /** vient d'encaisser un coup : 0 → 1 */
  hurt?: number;
  expr?: Expr;
  /** sautille de joie (victoire, menus) */
  celebrate?: boolean;
  /** coucou de la main : 0 → 1 */
  wave?: number;
  /** pas d'ombre au sol (déjà dessinée ailleurs) */
  noShadow?: boolean;
}

/** Points d'ancrage renvoyés par chaque silhouette (accessoires, mains, motifs). */
interface Anchor {
  headCx: number;
  headTop: number;
  headW: number;
  eyeY: number;
  neckY: number;
  bodyY: number;
  bodyW: number;
  /** ovale du visage (protégé des motifs) */
  faceRx: number;
  faceRy: number;
  faceY: number;
}

/**
 * Apparence d'un joueur : skin + accessoire équipé (qui remplace l'objet
 * du skin occupant le même emplacement).
 */
export function lookOf(characterId: string, skinId?: string, accessoryId?: string | null): Look {
  const c = getCharacter(characterId);
  const sk = getSkin(c.id, skinId);
  let wear = [...sk.wear];
  const acc = getAccessory(accessoryId);
  if (acc) {
    const slot = WEAR_SLOT[acc.wear];
    wear = wear.filter((w) => w === "none" || WEAR_SLOT[w as Exclude<Accessory, "none">] !== slot);
    wear.push(acc.wear);
  }
  return {
    kind: c.kind,
    palette: sk.palette,
    wear,
    pattern: sk.pattern,
    aura: sk.aura,
    eyes: sk.eyes ?? "normal",
    special: sk.special,
  };
}

// ----------------------------------------------------------------- couleurs
const rgbCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let v = rgbCache.get(hex);
  if (!v) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}
export function mix(a: string, b: string, k: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
}
const shadeCache = new Map<string, [string, string]>();
function shadeStops(c: string): [string, string] {
  let v = shadeCache.get(c);
  if (!v) {
    v = [mix(c, "#ffffff", 0.32), mix(c, "#000000", 0.2)];
    shadeCache.set(c, v);
  }
  return v;
}

/** Remplissage « volume » : lumière en haut à gauche, ombre en bas à droite. */
function shaded(ctx: Ctx, color: string, x: number, y: number, rx: number, ry: number): string | CanvasGradient {
  if (color[0] !== "#" || Math.min(rx, ry) < 2.5) return color;
  const [hi, lo] = shadeStops(color);
  const r = Math.max(rx, ry);
  const g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.45, r * 0.08, x, y, r * 1.15);
  g.addColorStop(0, hi);
  g.addColorStop(0.5, color);
  g.addColorStop(1, lo);
  return g;
}

/**
 * Même dégradé, mais construit à l'origine et mis en cache (les tailles
 * changent peu d'une image à l'autre) : on dessine ensuite en translatant.
 */
const gradCache = new WeakMap<Ctx, Map<string, CanvasGradient>>();
function shadedAt0(ctx: Ctx, color: string, rx: number, ry: number): CanvasGradient | null {
  if (color[0] !== "#" || Math.min(rx, ry) < 2.5) return null;
  let m = gradCache.get(ctx);
  if (!m) gradCache.set(ctx, (m = new Map()));
  const key = `${color}|${Math.round(rx * 2)}|${Math.round(ry * 2)}`;
  let g = m.get(key);
  if (!g) {
    if (m.size > 600) m.clear();
    g = shaded(ctx, color, 0, 0, Math.round(rx * 2) / 2, Math.round(ry * 2) / 2) as CanvasGradient;
    m.set(key, g);
  }
  return g;
}

// ----------------------------------------------------------------- outils
function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, stroke = false, rot = 0, flat = false) {
  rx = Math.max(0.1, rx);
  ry = Math.max(0.1, ry);
  const g = flat ? null : shadedAt0(ctx, fill, rx, ry);
  if (g) {
    ctx.translate(x, y);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
    if (stroke) ctx.stroke();
    ctx.translate(-x, -y);
    return;
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
  if (stroke) ctx.stroke();
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, stroke = false, flat = false) {
  const g = flat ? null : shadedAt0(ctx, fill, w / 2, h / 2);
  if (g) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.fill();
    if (stroke) ctx.stroke();
    ctx.translate(-cx, -cy);
    return;
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  if (stroke) ctx.stroke();
}

function poly(ctx: Ctx, pts: [number, number][], fill: string, stroke = false) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  if (stroke) ctx.stroke();
}

function blinking(pose: CharPose): boolean {
  const e = pose.expr ?? "normal";
  if (e === "dizzy" || e === "happy") return false;
  return (pose.t * 0.9 + 0.37) % 3.6 < 0.13;
}

/** Un œil, avec style (normal, cartoon, lumineux) et expression. */
function eye(ctx: Ctx, x: number, y: number, r: number, pose: CharPose, ink: string, look: Look, side: number) {
  const e = pose.expr ?? "normal";
  const lw = ctx.lineWidth;
  if (e === "happy") {
    ctx.lineWidth = Math.max(1.2, r * 0.55);
    ctx.beginPath();
    ctx.arc(x, y + r * 0.35, r * 0.85, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.lineWidth = lw;
    return;
  }
  if (e === "dizzy") {
    ctx.lineWidth = Math.max(1.2, r * 0.45);
    const k = r * 0.7;
    ctx.beginPath();
    ctx.moveTo(x - k, y - k);
    ctx.lineTo(x + k, y + k);
    ctx.moveTo(x + k, y - k);
    ctx.lineTo(x - k, y + k);
    ctx.stroke();
    ctx.lineWidth = lw;
    return;
  }
  if (blinking(pose)) {
    ctx.lineWidth = Math.max(1.2, r * 0.5);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.9, y + r * 0.2);
    ctx.quadraticCurveTo(x, y + r * 0.6, x + r * 0.9, y + r * 0.2);
    ctx.stroke();
    ctx.lineWidth = lw;
    return;
  }
  const big = look.eyes === "cartoon" ? 1.35 : 1;
  const rr2 = r * big * (e === "scared" ? 1.15 : 1);
  if (look.eyes === "glow") {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(pose.t * 4);
    ell(ctx, x, y, rr2 * 1.9, rr2 * 2.1, look.palette.light, false, 0, true);
    ctx.restore();
    ell(ctx, x, y, rr2 * 0.95, rr2 * 1.2, look.palette.light, false, 0, true);
    ell(ctx, x + pose.faceX * rr2 * 0.2, y - rr2 * 0.1, rr2 * 0.45, rr2 * 0.55, "#ffffff", false, 0, true);
    return;
  }
  ell(ctx, x, y, rr2, rr2 * 1.2, "#ffffff", true, 0, true);
  const pr = e === "scared" ? 0.35 : look.eyes === "cartoon" ? 0.62 : 0.56;
  const px = x + pose.faceX * rr2 * 0.35;
  const py = y + rr2 * 0.2 + pose.faceY * rr2 * 0.2;
  ell(ctx, px, py, rr2 * pr, rr2 * pr * 1.1, ink, false, 0, true);
  ell(ctx, px - rr2 * 0.2, py - rr2 * 0.3, rr2 * 0.2, rr2 * 0.2, "#ffffff", false, 0, true);
  if (look.eyes === "cartoon") ell(ctx, px + rr2 * 0.18, py + rr2 * 0.18, rr2 * 0.09, rr2 * 0.09, "#ffffff", false, 0, true);
  if (e === "angry") {
    ctx.lineWidth = Math.max(1.2, r * 0.5);
    ctx.beginPath();
    ctx.moveTo(x - side * rr2 * 1.1, y - rr2 * 1.5);
    ctx.lineTo(x + side * rr2 * 0.9, y - rr2 * 1.0);
    ctx.stroke();
    ctx.lineWidth = lw;
  }
}

function eyes(ctx: Ctx, cx: number, y: number, s: number, gap: number, r: number, pose: CharPose, ink: string, look: Look) {
  const ex = pose.faceX * s * 0.06;
  for (const side of [-1, 1]) eye(ctx, cx + side * gap + ex, y, r, pose, ink, look, side);
}

/** Bouche selon l'expression. */
function mouth(ctx: Ctx, x: number, y: number, w: number, pose: CharPose, ink: string, open = 0) {
  const e = pose.expr ?? "normal";
  const lw = ctx.lineWidth;
  ctx.lineWidth = Math.max(1, lw * 0.85);
  if (e === "happy" || open > 0.2) {
    const h = w * (0.55 + open * 0.3);
    ctx.fillStyle = "#5a1f2b";
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, y - h * 0.1);
    ctx.quadraticCurveTo(x, y - h * 0.25, x + w * 0.5, y - h * 0.1);
    ctx.quadraticCurveTo(x + w * 0.4, y + h, x, y + h);
    ctx.quadraticCurveTo(x - w * 0.4, y + h, x - w * 0.5, y - h * 0.1);
    ctx.fill();
    ctx.stroke();
    ell(ctx, x, y + h * 0.65, w * 0.22, h * 0.2, "#ff7a8a", false, 0, true);
  } else if (e === "scared" || e === "dizzy") {
    ctx.fillStyle = "#5a1f2b";
    ctx.beginPath();
    ctx.ellipse(x, y + w * 0.15, w * 0.18, w * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (e === "angry") {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.35, y + w * 0.2);
    ctx.quadraticCurveTo(x, y - w * 0.05, x + w * 0.35, y + w * 0.2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x, y - w * 0.15, w * 0.35, 0.35, Math.PI - 0.35);
    ctx.stroke();
  }
  ctx.lineWidth = lw;
}

function cheeks(ctx: Ctx, cx: number, y: number, s: number, gap: number, pose: CharPose) {
  for (const side of [-1, 1]) ell(ctx, cx + side * gap + pose.faceX * s * 0.03, y, s * 0.045, s * 0.025, "rgba(255,110,130,0.45)", false, 0, true);
}

function sweat(ctx: Ctx, x: number, y: number, s: number, t: number) {
  const k = (t * 1.5) % 1;
  ctx.save();
  ctx.globalAlpha = 1 - k * 0.6;
  ctx.fillStyle = "#8fd8ff";
  const yy = y + k * s * 0.12;
  ctx.beginPath();
  ctx.moveTo(x, yy - s * 0.06);
  ctx.quadraticCurveTo(x + s * 0.04, yy, x, yy + s * 0.03);
  ctx.quadraticCurveTo(x - s * 0.04, yy, x, yy - s * 0.06);
  ctx.fill();
  ctx.restore();
}

function feet(ctx: Ctx, cx: number, footY: number, s: number, pose: CharPose, color: string, spread = 0.13, rx = 0.09) {
  const swing = pose.moving ? Math.sin(pose.walk * Math.PI) * s * 0.08 : 0;
  for (const side of [-1, 1]) {
    const fx = cx + side * s * spread + (pose.faceY === 0 ? swing * side * pose.faceX : 0);
    const fy = footY - s * 0.02 + (pose.faceY !== 0 ? swing * side * 0.6 : 0);
    ell(ctx, fx, fy, s * rx, s * 0.06, color, true);
  }
}

// --------------------------------------------------------------- silhouettes
function fox(ctx: Ctx, cx: number, by: number, s: number, c: Palette, pose: CharPose, ink: string, look: Look): Anchor {
  const back = pose.faceY < 0;
  const side = pose.faceX !== 0 ? -pose.faceX : 1;
  const wag = Math.sin(pose.t * (pose.moving ? 12 : 5)) * 0.18;
  // queue touffue (derrière, côté opposé au regard)
  ctx.save();
  ctx.translate(cx + side * s * 0.22, by + s * 0.16 + (back ? s * 0.05 : 0));
  ctx.rotate(side * (0.6 + wag));
  ell(ctx, 0, -s * 0.08, s * 0.11, s * 0.22, c.main, true);
  ell(ctx, 0, -s * 0.24, s * 0.075, s * 0.075, c.light);
  ctx.restore();
  // corps
  ell(ctx, cx, by + s * 0.12, s * 0.22, s * 0.16, c.main, true);
  if (!back) {
    // plastron en pointe
    poly(ctx, [[cx - s * 0.12, by + s * 0.03], [cx + s * 0.12, by + s * 0.03], [cx, by + s * 0.25]], c.light);
  }
  // oreilles
  const hy = by - s * 0.08;
  for (const sx of [-1, 1]) {
    poly(ctx, [[cx + sx * s * 0.08, hy - s * 0.17], [cx + sx * s * 0.2, hy - s * 0.38], [cx + sx * s * 0.26, hy - s * 0.1]], c.main, true);
    poly(ctx, [[cx + sx * s * 0.12, hy - s * 0.17], [cx + sx * s * 0.19, hy - s * 0.31], [cx + sx * s * 0.22, hy - s * 0.14]], c.accent);
  }
  // tête + joues duveteuses
  for (const sx of [-1, 1]) poly(ctx, [[cx + sx * s * 0.2, hy - s * 0.04], [cx + sx * s * 0.3, hy + s * 0.06], [cx + sx * s * 0.17, hy + s * 0.12]], c.light, true);
  ell(ctx, cx, hy, s * 0.25, s * 0.21, c.main, true);
  if (!back) {
    const mx = cx + pose.faceX * s * 0.08;
    ell(ctx, mx, hy + s * 0.08, s * 0.15, s * 0.09, c.light);
    ell(ctx, mx + pose.faceX * s * 0.07, hy + s * 0.035, s * 0.036, s * 0.028, ink, false, 0, true);
    ell(ctx, mx + pose.faceX * s * 0.07 - s * 0.01, hy + s * 0.027, s * 0.012, s * 0.008, "#ffffff", false, 0, true);
    mouth(ctx, mx + pose.faceX * s * 0.05, hy + s * 0.11, s * 0.08, pose, ink, pose.action ? Math.sin(pose.action * Math.PI) : 0);
    eyes(ctx, cx, hy - s * 0.04, s, s * 0.1, s * 0.045, pose, ink, look);
  } else {
    ell(ctx, cx, hy - s * 0.02, s * 0.12, s * 0.1, c.dark);
  }
  return { headCx: cx, headTop: hy - s * 0.21, headW: s * 0.5, eyeY: hy - s * 0.04, neckY: hy + s * 0.18, bodyY: by + s * 0.12, bodyW: s * 0.22, faceRx: s * 0.19, faceRy: s * 0.15, faceY: hy + s * 0.03 };
}

function robot(ctx: Ctx, cx: number, by: number, s: number, c: Palette, pose: CharPose, ink: string, look: Look): Anchor {
  const back = pose.faceY < 0;
  // corps
  rrect(ctx, cx - s * 0.2, by + s * 0.02, s * 0.4, s * 0.25, s * 0.06, c.main, true);
  if (!back) {
    rrect(ctx, cx - s * 0.11, by + s * 0.07, s * 0.22, s * 0.13, s * 0.03, c.dark, false, true);
    ell(ctx, cx - s * 0.05, by + s * 0.135, s * 0.025, s * 0.025, c.accent, false, 0, true);
    ell(ctx, cx + s * 0.04, by + s * 0.135, s * 0.025, s * 0.025, Math.sin(pose.t * 5) > 0 ? "#7dff9a" : "#2a6b3a", false, 0, true);
  } else {
    for (const k of [0, 1, 2]) rrect(ctx, cx - s * 0.12, by + s * (0.07 + k * 0.05), s * 0.24, s * 0.025, s * 0.01, c.dark, false, true);
  }
  // rivets
  for (const sx of [-1, 1]) ell(ctx, cx + sx * s * 0.16, by + s * 0.06, s * 0.014, s * 0.014, c.light, false, 0, true);
  // tête
  const hy = by - s * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx, hy - s * 0.17);
  ctx.lineTo(cx + s * 0.02, hy - s * 0.3);
  ctx.stroke();
  const on = Math.sin(pose.t * 4) > -0.3;
  if (on) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ell(ctx, cx + s * 0.02, hy - s * 0.31, s * 0.08, s * 0.08, c.accent, false, 0, true);
    ctx.restore();
  }
  ell(ctx, cx + s * 0.02, hy - s * 0.31, s * 0.045, s * 0.045, on ? c.accent : c.dark, true);
  rrect(ctx, cx - s * 0.25, hy - s * 0.17, s * 0.5, s * 0.33, s * 0.09, c.main, true);
  // boulons d'oreille
  for (const sx of [-1, 1]) ell(ctx, cx + sx * s * 0.26, hy, s * 0.035, s * 0.05, c.dark, true);
  if (!back) {
    rrect(ctx, cx - s * 0.18 + pose.faceX * s * 0.03, hy - s * 0.09, s * 0.36, s * 0.18, s * 0.06, "#162033", false, true);
    const ex = pose.faceX * s * 0.05;
    const e = pose.expr ?? "normal";
    for (const sx of [-1, 1]) {
      const x = cx + sx * s * 0.08 + ex;
      const y = hy - s * 0.03 + pose.faceY * s * 0.01;
      ctx.save();
      ctx.globalAlpha = 0.35;
      rrect(ctx, x - s * 0.055, y - s * 0.055, s * 0.11, s * 0.11, s * 0.04, c.accent, false, true);
      ctx.restore();
      if (e === "happy") {
        ctx.strokeStyle = c.accent;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.035, y + s * 0.015);
        ctx.lineTo(x, y - s * 0.025);
        ctx.lineTo(x + s * 0.035, y + s * 0.015);
        ctx.stroke();
        ctx.strokeStyle = ink;
      } else if (e === "dizzy") {
        ctx.strokeStyle = c.accent;
        ctx.beginPath();
        ctx.arc(x, y, s * 0.025, pose.t * 8, pose.t * 8 + 4.5);
        ctx.stroke();
        ctx.strokeStyle = ink;
      } else if (blinking(pose)) rrect(ctx, x - s * 0.035, y - s * 0.004, s * 0.07, s * 0.012, s * 0.006, c.accent, false, true);
      else rrect(ctx, x - s * 0.035, y - s * 0.04 * (e === "scared" ? 1.25 : 1), s * 0.07, s * 0.08 * (e === "scared" ? 1.25 : 1), s * 0.02, c.accent, false, true);
    }
    // bouche LED
    const open = pose.action ? Math.sin(pose.action * Math.PI) : 0;
    const mw = s * (e === "happy" || open > 0.2 ? 0.12 : 0.08);
    rrect(ctx, cx - mw / 2 + ex, hy + s * 0.045, mw, s * (e === "scared" || open > 0.2 ? 0.035 : 0.015), s * 0.008, c.accent, false, true);
  } else {
    rrect(ctx, cx - s * 0.12, hy - s * 0.08, s * 0.24, s * 0.14, s * 0.03, c.dark, false, true);
  }
  ell(ctx, cx - s * 0.15, hy - s * 0.12, s * 0.05, s * 0.025, "rgba(255,255,255,0.45)", false, 0, true);
  return { headCx: cx, headTop: hy - s * 0.17, headW: s * 0.5, eyeY: hy - s * 0.03, neckY: hy + s * 0.17, bodyY: by + s * 0.14, bodyW: s * 0.2, faceRx: s * 0.2, faceRy: s * 0.12, faceY: hy };
}

function frog(ctx: Ctx, cx: number, by: number, s: number, c: Palette, pose: CharPose, ink: string, look: Look): Anchor {
  const back = pose.faceY < 0;
  // corps large et aplati
  ell(ctx, cx, by + s * 0.06, s * 0.31, s * 0.23, c.main, true);
  if (!back) {
    ell(ctx, cx, by + s * 0.14, s * 0.2, s * 0.12, c.light);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(1, s * 0.015);
    for (const k of [0, 1, 2]) {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.12, by + s * (0.1 + k * 0.035));
      ctx.quadraticCurveTo(cx, by + s * (0.12 + k * 0.035), cx + s * 0.12, by + s * (0.1 + k * 0.035));
      ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = Math.max(1.2, s * 0.045);
  }
  // taches
  for (const [dx, dy, r] of [[-0.17, -0.02, 0.04], [0.19, 0.05, 0.03], [0.1, -0.08, 0.025]] as const) {
    if (back || dy < 0) ell(ctx, cx + dx * s, by + dy * s, r * s, r * s, c.accent);
  }
  // yeux globuleux sur le dessus
  const ey = by - s * 0.15;
  for (const sx of [-1, 1]) ell(ctx, cx + sx * s * 0.14, ey, s * 0.11, s * 0.1, c.main, true);
  if (!back) {
    const ex = pose.faceX * s * 0.03;
    for (const sx of [-1, 1]) eye(ctx, cx + sx * s * 0.14 + ex, ey + s * 0.005, s * 0.058, pose, ink, look, sx);
    // narines
    for (const sx of [-1, 1]) ell(ctx, cx + sx * s * 0.035 + pose.faceX * s * 0.04, by - s * 0.035, s * 0.012, s * 0.008, ink, false, 0, true);
    // grand sourire
    const e = pose.expr ?? "normal";
    const open = pose.action ? Math.sin(pose.action * Math.PI) : 0;
    if (e === "happy" || open > 0.2 || e === "scared") mouth(ctx, cx + pose.faceX * s * 0.04, by + s * 0.0, s * 0.18, pose, ink, open);
    else {
      ctx.beginPath();
      ctx.arc(cx + pose.faceX * s * 0.04, by - s * 0.02, s * 0.14, 0.25, Math.PI - 0.25);
      ctx.stroke();
    }
    cheeks(ctx, cx, by + s * 0.02, s, s * 0.2, pose);
  }
  return { headCx: cx, headTop: ey - s * 0.1, headW: s * 0.55, eyeY: ey, neckY: by + s * 0.12, bodyY: by + s * 0.1, bodyW: s * 0.28, faceRx: s * 0.27, faceRy: s * 0.13, faceY: ey + s * 0.06 };
}

function ninja(ctx: Ctx, cx: number, by: number, s: number, c: Palette, pose: CharPose, ink: string, look: Look): Anchor {
  const back = pose.faceY < 0;
  const hy = by - s * 0.04;
  const side = pose.faceX !== 0 ? -pose.faceX : 1;
  // poignée de sabre dans le dos
  ctx.save();
  ctx.translate(cx - side * s * 0.12, hy + s * 0.05);
  ctx.rotate(side * 0.7);
  rrect(ctx, -s * 0.025, -s * 0.36, s * 0.05, s * 0.18, s * 0.02, "#6b4a2a", true);
  rrect(ctx, -s * 0.06, -s * 0.2, s * 0.12, s * 0.03, s * 0.012, "#c9a227", true);
  ctx.restore();
  // rubans du bandeau qui flottent derrière
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.lineCap = "round";
  const flow = pose.moving ? 14 : 9;
  for (const k of [0, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * s * 0.2, hy - s * 0.12);
    ctx.quadraticCurveTo(
      cx + side * s * 0.34,
      hy - s * 0.1 + Math.sin(pose.t * flow + k) * s * 0.05,
      cx + side * s * (0.44 + k * 0.05),
      hy - s * (0.02 + k * 0.08) + Math.sin(pose.t * flow + k + 1) * s * 0.05,
    );
    ctx.stroke();
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1.2, s * 0.045);
  // corps-capuche
  ell(ctx, cx, hy + s * 0.04, s * 0.27, s * 0.3, c.main, true);
  // ceinture + nœud
  rrect(ctx, cx - s * 0.2, hy + s * 0.17, s * 0.4, s * 0.05, s * 0.02, c.accent, false, true);
  if (!back) ell(ctx, cx + s * 0.08, hy + s * 0.195, s * 0.035, s * 0.03, c.accent, true);
  // bandeau
  rrect(ctx, cx - s * 0.25, hy - s * 0.16, s * 0.5, s * 0.06, s * 0.03, c.accent);
  if (!back) {
    // fente du visage
    rrect(ctx, cx - s * 0.18 + pose.faceX * s * 0.04, hy - s * 0.08, s * 0.36, s * 0.12, s * 0.06, c.light);
    const ex = pose.faceX * s * 0.07;
    const e = pose.expr ?? "normal";
    for (const sx of [-1, 1]) {
      const x = cx + sx * s * 0.075 + ex;
      if (e === "happy" || e === "dizzy" || blinking(pose)) eye(ctx, x, hy - s * 0.02, s * 0.035, pose, ink, look, sx);
      else if (look.eyes === "glow") eye(ctx, x, hy - s * 0.02, s * 0.03, pose, ink, look, sx);
      else {
        const sc = e === "scared" ? 1.25 : 1;
        ell(ctx, x, hy - s * 0.02, s * 0.035 * sc, s * 0.04 * sc, ink, false, 0, true);
        ell(ctx, x - s * 0.012, hy - s * 0.035, s * 0.012, s * 0.012, "#ffffff", false, 0, true);
        if (e === "angry") {
          ctx.beginPath();
          ctx.moveTo(x - sx * s * 0.045, hy - s * 0.07);
          ctx.lineTo(x + sx * s * 0.03, hy - s * 0.045);
          ctx.stroke();
        }
      }
    }
  } else {
    ell(ctx, cx, hy - s * 0.13, s * 0.06, s * 0.05, c.accent, true);
  }
  ell(ctx, cx - s * 0.15, hy - s * 0.15, s * 0.05, s * 0.03, "rgba(255,255,255,0.35)", false, -0.5, true);
  return { headCx: cx, headTop: hy - s * 0.26, headW: s * 0.52, eyeY: hy - s * 0.02, neckY: hy + s * 0.12, bodyY: hy + s * 0.14, bodyW: s * 0.25, faceRx: s * 0.2, faceRy: s * 0.08, faceY: hy - s * 0.02 };
}

function mushroom(ctx: Ctx, cx: number, by: number, s: number, c: Palette, pose: CharPose, ink: string, look: Look): Anchor {
  const back = pose.faceY < 0;
  // pied (le corps)
  rrect(ctx, cx - s * 0.16, by - s * 0.04, s * 0.32, s * 0.3, s * 0.13, c.light, true);
  if (!back) {
    eyes(ctx, cx, by + s * 0.07, s, s * 0.07, s * 0.04, pose, ink, look);
    mouth(ctx, cx + pose.faceX * s * 0.05, by + s * 0.14, s * 0.07, pose, ink, pose.action ? Math.sin(pose.action * Math.PI) : 0);
    cheeks(ctx, cx, by + s * 0.14, s, s * 0.11, pose);
  }
  // chapeau
  const cy = by - s * 0.07;
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.02, s * 0.38, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // lamelles sous le chapeau
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(1, s * 0.012);
  for (let k = -4; k <= 4; k++) {
    ctx.beginPath();
    ctx.moveTo(cx + k * s * 0.07, cy + s * 0.04);
    ctx.lineTo(cx + k * s * 0.05, cy + s * 0.075);
    ctx.stroke();
  }
  ctx.restore();
  ctx.lineWidth = Math.max(1.2, s * 0.045);
  ctx.fillStyle = shaded(ctx, c.main, cx, cy - s * 0.12, s * 0.38, s * 0.3);
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.38, s * 0.3, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  for (const [dx, dy, r] of [[-0.2, -0.1, 0.06], [0.05, -0.21, 0.07], [0.22, -0.08, 0.05], [-0.04, -0.06, 0.04]] as const) {
    ell(ctx, cx + dx * s, cy + dy * s, r * s, r * s * 0.85, c.accent);
  }
  ell(ctx, cx - s * 0.2, cy - s * 0.18, s * 0.06, s * 0.03, "rgba(255,255,255,0.4)", false, -0.6, true);
  return { headCx: cx, headTop: cy - s * 0.3, headW: s * 0.6, eyeY: by + s * 0.07, neckY: by + s * 0.2, bodyY: by + s * 0.12, bodyW: s * 0.16, faceRx: s * 0.13, faceRy: s * 0.1, faceY: by + s * 0.1 };
}

function bear(ctx: Ctx, cx: number, by: number, s: number, c: Palette, pose: CharPose, ink: string, look: Look): Anchor {
  const back = pose.faceY < 0;
  const hy = by - s * 0.02;
  const panda = look.pattern === "panda";
  const earCol = panda ? c.dark : c.main;
  for (const sx of [-1, 1]) {
    ell(ctx, cx + sx * s * 0.2, hy - s * 0.22, s * 0.08, s * 0.08, earCol, true);
    if (!panda) ell(ctx, cx + sx * s * 0.2, hy - s * 0.22, s * 0.04, s * 0.04, c.light);
  }
  ell(ctx, cx, hy, s * 0.3, s * 0.3, c.main, true);
  if (!back) {
    ell(ctx, cx, hy + s * 0.18, s * 0.16, s * 0.1, c.light);
    if (panda) for (const sx of [-1, 1]) ell(ctx, cx + sx * s * 0.1 + pose.faceX * s * 0.06, hy - s * 0.04, s * 0.075, s * 0.085, c.dark, false, sx * 0.4, true);
    eyes(ctx, cx, hy - s * 0.05, s, s * 0.1, s * 0.042, pose, ink, look);
    const mx = cx + pose.faceX * s * 0.07;
    ell(ctx, mx, hy + s * 0.07, s * 0.1, s * 0.07, c.light);
    ell(ctx, mx, hy + s * 0.045, s * 0.04, s * 0.03, c.accent);
    ell(ctx, mx - s * 0.012, hy + s * 0.037, s * 0.012, s * 0.008, "rgba(255,255,255,.7)", false, 0, true);
    mouth(ctx, mx, hy + s * 0.1, s * 0.07, pose, ink, pose.action ? Math.sin(pose.action * Math.PI) : 0);
    cheeks(ctx, cx, hy + s * 0.06, s, s * 0.19, pose);
  } else {
    ell(ctx, cx, hy + s * 0.05, s * 0.18, s * 0.16, c.dark);
    ell(ctx, cx, hy + s * 0.05, s * 0.16, s * 0.14, c.main);
  }
  ell(ctx, cx - s * 0.17, hy - s * 0.12, s * 0.06, s * 0.035, "rgba(255,255,255,0.4)", false, -0.6, true);
  return { headCx: cx, headTop: hy - s * 0.3, headW: s * 0.6, eyeY: hy - s * 0.05, neckY: hy + s * 0.22, bodyY: hy + s * 0.12, bodyW: s * 0.28, faceRx: s * 0.21, faceRy: s * 0.16, faceY: hy + s * 0.02 };
}

function penguin(ctx: Ctx, cx: number, by: number, s: number, c: Palette, pose: CharPose, ink: string, look: Look): Anchor {
  const back = pose.faceY < 0;
  const hy = by - s * 0.02;
  // houppette
  for (const k of [-1, 0, 1]) {
    ctx.save();
    ctx.translate(cx + k * s * 0.03, hy - s * 0.3);
    ctx.rotate(k * 0.5 + Math.sin(pose.t * 3 + k) * 0.08);
    ell(ctx, 0, -s * 0.04, s * 0.025, s * 0.06, c.main, true);
    ctx.restore();
  }
  // corps en œuf
  ell(ctx, cx, hy + s * 0.04, s * 0.27, s * 0.33, c.main, true);
  if (!back) {
    // ventre + masque blanc en cœur
    ell(ctx, cx, hy + s * 0.12, s * 0.19, s * 0.22, c.light);
    for (const sx of [-1, 1]) ell(ctx, cx + sx * s * 0.075 + pose.faceX * s * 0.04, hy - s * 0.08, s * 0.1, s * 0.1, c.light);
    eyes(ctx, cx, hy - s * 0.08, s, s * 0.075, s * 0.04, pose, ink, look);
    // bec
    const bx = cx + pose.faceX * s * 0.06;
    const open = pose.action ? Math.sin(pose.action * Math.PI) : (pose.expr === "happy" ? 0.6 : 0);
    poly(ctx, [[bx - s * 0.06, hy - s * 0.0], [bx + s * 0.06, hy - s * 0.0], [bx, hy + s * 0.06]], c.accent, true);
    if (open > 0.2) poly(ctx, [[bx - s * 0.05, hy + s * 0.025], [bx + s * 0.05, hy + s * 0.025], [bx, hy + s * 0.08 + open * s * 0.03]], mix(c.accent, "#000000", 0.25), true);
    cheeks(ctx, cx, hy + s * 0.0, s, s * 0.13, pose);
  } else {
    ell(ctx, cx, hy + s * 0.1, s * 0.12, s * 0.16, c.dark);
  }
  ell(ctx, cx - s * 0.15, hy - s * 0.16, s * 0.05, s * 0.03, "rgba(255,255,255,0.4)", false, -0.6, true);
  return { headCx: cx, headTop: hy - s * 0.29, headW: s * 0.5, eyeY: hy - s * 0.08, neckY: hy + s * 0.07, bodyY: hy + s * 0.12, bodyW: s * 0.26, faceRx: s * 0.17, faceRy: s * 0.13, faceY: hy - s * 0.05 };
}

// --------------------------------------------------------------- mains
function hands(ctx: Ctx, a: Anchor, s: number, c: Palette, look: Look, pose: CharPose) {
  const kind = look.kind;
  const lift = pose.action ? Math.sin(Math.min(1, pose.action * 1.4) * Math.PI) : 0;
  const swing = pose.moving ? Math.sin(pose.walk * Math.PI) : 0;
  const hurt = pose.hurt ?? 0;
  const color = kind === "mushroom" ? c.light : kind === "robot" ? c.dark : c.main;
  for (const side of [-1, 1]) {
    let hx = a.headCx + side * (a.bodyW + s * 0.03);
    let hy = a.bodyY + s * 0.01;
    if (pose.faceY === 0 && pose.faceX !== 0) {
      hx += swing * side * s * 0.06 * pose.faceX;
    } else hy += swing * side * s * 0.03;
    if (lift > 0) {
      hy -= lift * s * 0.2;
      hx += side * lift * s * 0.04;
    }
    if (pose.celebrate) {
      const j = Math.sin(pose.t * 12 + side) * 0.5 + 0.5;
      hy = a.headTop + s * 0.08 - j * s * 0.06;
      hx = a.headCx + side * (a.headW * 0.55);
    }
    if (pose.wave && side === 1) {
      const w = Math.sin(pose.wave * Math.PI);
      hy -= w * s * 0.3;
      hx += w * s * 0.05 + Math.sin(pose.t * 18) * s * 0.04 * w;
    }
    if (hurt > 0) {
      hy -= Math.sin(hurt * Math.PI) * s * 0.12;
      hx += side * Math.sin(hurt * 30) * s * 0.02 * (1 - hurt);
    }
    if (kind === "penguin") ell(ctx, hx, hy, s * 0.05, s * 0.11, color, true, side * (0.35 + lift * 0.8 + (pose.celebrate ? 1 : 0)));
    else if (kind === "robot") rrect(ctx, hx - s * 0.045, hy - s * 0.04, s * 0.09, s * 0.08, s * 0.025, color, true);
    else ell(ctx, hx, hy, s * 0.055, s * 0.05, color, true);
  }
}

// ------------------------------------------------------------ motifs
const scratch = typeof document !== "undefined" ? document.createElement("canvas") : null;
const sctx = scratch?.getContext("2d") ?? null;

function rand(i: number, k: number) {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function pattern(ctx: Ctx, a: Anchor, s: number, look: Look, pose: CharPose, box: { x: number; y: number; w: number; h: number }) {
  const c = look.palette;
  const t = pose.t;
  const cx = a.headCx;
  ctx.save();
  // le visage reste toujours lisible
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  if (pose.faceY >= 0) ctx.ellipse(cx + pose.faceX * s * 0.05, a.faceY, a.faceRx, a.faceRy, 0, 0, Math.PI * 2);
  ctx.clip("evenodd");
  ctx.globalCompositeOperation = "source-atop";
  const top = a.headTop;
  const bottom = a.bodyY + s * 0.2;
  const left = cx - s * 0.4;
  const w = s * 0.8;
  switch (look.pattern) {
    case "cracks": {
      const glow = 0.65 + 0.35 * Math.sin(t * 3);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const [lw, col, al] of [[s * 0.05, c.accent, 0.35 * glow], [s * 0.02, c.light, glow]] as const) {
        ctx.strokeStyle = col;
        ctx.globalAlpha = al;
        ctx.lineWidth = lw;
        for (let i = 0; i < 6; i++) {
          let x = left + rand(i, 1) * w;
          let y = top + rand(i, 2) * (bottom - top);
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let k = 0; k < 3; k++) {
            x += (rand(i, k + 3) - 0.5) * s * 0.16;
            y += s * 0.05 + rand(i, k + 6) * s * 0.04;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      break;
    }
    case "frost": {
      const g = ctx.createLinearGradient(0, bottom, 0, top);
      g.addColorStop(0, "rgba(160,210,255,0.5)");
      g.addColorStop(0.5, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      for (let i = 0; i < 14; i++) {
        const x = left + rand(i, 1) * w;
        const y = top + rand(i, 2) * (bottom - top);
        const tw = 0.5 + 0.5 * Math.sin(t * 3 + i);
        ctx.globalAlpha = 0.5 + tw * 0.5;
        ctx.fillStyle = "#ffffff";
        const r = s * (0.012 + rand(i, 3) * 0.018);
        ctx.beginPath();
        ctx.moveTo(x, y - r * 2);
        ctx.lineTo(x + r * 0.6, y);
        ctx.lineTo(x, y + r * 2);
        ctx.lineTo(x - r * 0.6, y);
        ctx.fill();
      }
      break;
    }
    case "galaxy": {
      ctx.globalAlpha = 0.55;
      const g = ctx.createRadialGradient(cx + Math.sin(t * 0.7) * s * 0.1, a.bodyY - s * 0.1, 0, cx, a.bodyY, s * 0.5);
      g.addColorStop(0, "#ff7ad9");
      g.addColorStop(0.45, "#5b3fd1");
      g.addColorStop(1, "#0b0628");
      ctx.fillStyle = g;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 22; i++) {
        const x = left + ((rand(i, 1) * w + t * s * 0.03 * (0.5 + rand(i, 4))) % w);
        const y = top + rand(i, 2) * (bottom - top);
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i * 1.7));
        ctx.globalAlpha = tw;
        ctx.fillStyle = i % 5 === 0 ? "#ffe8a3" : "#ffffff";
        const r = s * (0.006 + rand(i, 3) * 0.012);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "stripes": {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = "#f5f1e6";
      for (let y = a.neckY + s * 0.03; y < bottom + s * 0.1; y += s * 0.07) ctx.fillRect(box.x, y, box.w, s * 0.03);
      break;
    }
    case "circuit": {
      ctx.strokeStyle = c.accent;
      ctx.fillStyle = c.accent;
      ctx.lineWidth = Math.max(1, s * 0.014);
      for (let i = 0; i < 6; i++) {
        const x = left + rand(i, 1) * w;
        const y = top + s * 0.05 + rand(i, 2) * (bottom - top);
        const len = s * (0.06 + rand(i, 3) * 0.08);
        const pulse = (t * 1.5 + rand(i, 5)) % 1;
        ctx.globalAlpha = 0.5 + 0.5 * (1 - pulse);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y);
        ctx.lineTo(x + len, y + len * 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, s * 0.014, 0, Math.PI * 2);
        ctx.arc(x + len, y + len * 0.6, s * 0.014, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "spots": {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = look.kind === "mushroom" ? c.light : c.accent;
      for (let i = 0; i < 7; i++) {
        const x = left + rand(i, 1) * w;
        const y = top + s * 0.06 + rand(i, 2) * (bottom - top);
        ctx.beginPath();
        ctx.arc(x, y, s * (0.02 + rand(i, 3) * 0.025), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
  // reflet doré / irisé qui balaie le corps
  if (look.special) {
    const ph = ((t * 0.45) % 1) * 2.4 - 0.7;
    const x0 = box.x + ph * box.w;
    const g = ctx.createLinearGradient(x0 - s * 0.25, box.y, x0 + s * 0.25, box.y + box.h * 0.6);
    if (look.special === "shimmer") {
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,240,0.75)");
      g.addColorStop(1, "rgba(255,255,255,0)");
    } else {
      g.addColorStop(0, "rgba(255,90,120,0)");
      g.addColorStop(0.3, "rgba(255,200,90,0.45)");
      g.addColorStop(0.55, "rgba(120,255,200,0.45)");
      g.addColorStop(0.8, "rgba(120,140,255,0.45)");
      g.addColorStop(1, "rgba(255,90,200,0)");
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(box.x, box.y, box.w, box.h);
  }
  ctx.restore();
}

// ------------------------------------------------------------ accessoires
function accessory(ctx: Ctx, kind: Accessory, a: Anchor, s: number, look: Look, pose: CharPose, ink: string) {
  const back = pose.faceY < 0;
  const { headCx: cx, headTop: top, headW: w } = a;
  const fx = pose.faceX * s * 0.06;
  const stroke = () => {
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.2, s * 0.04);
  };
  stroke();
  switch (kind) {
    case "crown": {
      const cw = w * 0.5;
      const y = top - s * 0.02;
      const g = ctx.createLinearGradient(0, y - s * 0.13, 0, y + s * 0.02);
      g.addColorStop(0, "#fff0a0");
      g.addColorStop(0.5, "#ffd23f");
      g.addColorStop(1, "#d9930b");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - cw / 2, y + s * 0.02);
      ctx.lineTo(cx - cw / 2, y - s * 0.1);
      ctx.lineTo(cx - cw / 4, y - s * 0.04);
      ctx.lineTo(cx, y - s * 0.14);
      ctx.lineTo(cx + cw / 4, y - s * 0.04);
      ctx.lineTo(cx + cw / 2, y - s * 0.1);
      ctx.lineTo(cx + cw / 2, y + s * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ell(ctx, cx, y - s * 0.025, s * 0.025, s * 0.025, "#ff4d6d", false, 0, true);
      for (const sx of [-1, 1]) ell(ctx, cx + sx * cw * 0.3, y - s * 0.005, s * 0.016, s * 0.016, "#4cc9f0", false, 0, true);
      break;
    }
    case "glasses": {
      if (back) break;
      ctx.lineWidth = Math.max(1.2, s * 0.035);
      for (const sx of [-1, 1]) {
        ctx.fillStyle = "rgba(20,20,40,0.82)";
        ctx.beginPath();
        ctx.roundRect(cx + sx * s * 0.1 - s * 0.07 + fx, a.eyeY - s * 0.045, s * 0.14, s * 0.09, s * 0.03);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.03 + fx, a.eyeY - s * 0.01);
      ctx.lineTo(cx + s * 0.03 + fx, a.eyeY - s * 0.01);
      ctx.stroke();
      break;
    }
    case "shades": {
      if (back) break;
      const y = a.eyeY;
      ctx.fillStyle = "#14141f";
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.2 + fx, y - s * 0.05);
      ctx.lineTo(cx + s * 0.2 + fx, y - s * 0.05);
      ctx.lineTo(cx + s * 0.18 + fx, y + s * 0.03);
      ctx.quadraticCurveTo(cx + s * 0.1 + fx, y + s * 0.07, cx + s * 0.03 + fx, y + s * 0.0);
      ctx.lineTo(cx - s * 0.03 + fx, y + s * 0.0);
      ctx.quadraticCurveTo(cx - s * 0.1 + fx, y + s * 0.07, cx - s * 0.18 + fx, y + s * 0.03);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = Math.max(1, s * 0.018);
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + sx * s * 0.13 + fx - s * 0.03, y - s * 0.02);
        ctx.lineTo(cx + sx * s * 0.13 + fx + s * 0.0, y - s * 0.04);
        ctx.stroke();
      }
      break;
    }
    case "visor": {
      if (back) break;
      const y = a.eyeY;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(pose.t * 5);
      rrect(ctx, cx - w * 0.5 + fx, y - s * 0.07, w, s * 0.14, s * 0.07, look.palette.accent === "#ff2bd6" ? "#ff2bd6" : "#00e5ff", false, true);
      ctx.restore();
      const g = ctx.createLinearGradient(cx - w * 0.45, 0, cx + w * 0.45, 0);
      g.addColorStop(0, "#00e5ff");
      g.addColorStop(1, "#ff2bd6");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(cx - w * 0.44 + fx, y - s * 0.04, w * 0.88, s * 0.08, s * 0.04);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      const k = ((pose.t * 0.8) % 1) * w * 0.7;
      ctx.fillRect(cx - w * 0.35 + k + fx, y - s * 0.025, s * 0.04, s * 0.015);
      break;
    }
    case "eyepatch": {
      if (back) break;
      const x = cx - s * 0.1 + fx;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.48, a.eyeY - s * 0.1);
      ctx.lineTo(cx + w * 0.48, a.eyeY + s * 0.02);
      ctx.stroke();
      ell(ctx, x, a.eyeY, s * 0.06, s * 0.055, "#1a1a1a", true, 0, true);
      break;
    }
    case "bandana": {
      if (back) break;
      const y = a.eyeY + s * 0.05;
      ctx.fillStyle = look.palette.dark;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.46 + fx, y);
      ctx.quadraticCurveTo(cx + fx, y - s * 0.02, cx + w * 0.46 + fx, y);
      ctx.lineTo(cx + w * 0.3 + fx, y + s * 0.11);
      ctx.quadraticCurveTo(cx + fx, y + s * 0.15, cx - w * 0.3 + fx, y + s * 0.11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "scarf": {
      const y = a.neckY;
      rrect(ctx, cx - w * 0.42, y - s * 0.04, w * 0.84, s * 0.08, s * 0.04, look.palette.accent, true);
      const side = pose.faceX !== 0 ? -pose.faceX : 1;
      const flap = Math.sin(pose.t * (pose.moving ? 14 : 6)) * s * 0.02;
      ctx.save();
      ctx.translate(cx + side * w * 0.22, y);
      ctx.rotate(side * (pose.moving ? 0.9 : 0.15) + flap / s);
      rrect(ctx, -s * 0.035, 0, s * 0.07, s * 0.16, s * 0.03, look.palette.accent, true);
      ctx.restore();
      break;
    }
    case "lei": {
      const y = a.neckY;
      const cols = ["#ff5d8f", "#ffd60a", "#ff9f1c", "#ffffff"];
      for (let k = 0; k < 9; k++) {
        const ang = Math.PI * (0.05 + (k / 8) * 0.9);
        const x = cx + Math.cos(ang) * w * 0.4;
        const yy = y - s * 0.02 + Math.sin(ang) * s * 0.06;
        ell(ctx, x, yy, s * 0.03, s * 0.03, cols[k % cols.length], true, 0, true);
      }
      break;
    }
    case "flower": {
      const fx2 = cx + w * 0.32;
      const fy = top + s * 0.06;
      for (let k = 0; k < 5; k++) {
        const ang = (k / 5) * Math.PI * 2 + pose.t * 0.8;
        ell(ctx, fx2 + Math.cos(ang) * s * 0.05, fy + Math.sin(ang) * s * 0.05, s * 0.038, s * 0.038, "#ffffff", false, 0, true);
      }
      ell(ctx, fx2, fy, s * 0.032, s * 0.032, "#ffb52e", false, 0, true);
      break;
    }
    case "bow": {
      const bx = cx + w * 0.28;
      const by = top + s * 0.04;
      const col = look.palette.accent;
      for (const sx of [-1, 1]) poly(ctx, [[bx, by], [bx + sx * s * 0.11, by - s * 0.07], [bx + sx * s * 0.11, by + s * 0.07]], col, true);
      ell(ctx, bx, by, s * 0.03, s * 0.03, col, true);
      break;
    }
    case "headphones": {
      ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.beginPath();
      ctx.arc(cx, a.eyeY, w * 0.48, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.2, s * 0.04);
      for (const sx of [-1, 1]) rrect(ctx, cx + sx * w * 0.46 - s * 0.05, a.eyeY - s * 0.07, s * 0.1, s * 0.14, s * 0.04, look.palette.accent, true);
      break;
    }
    case "pirate": {
      const y = top + s * 0.03;
      const col = "#2b2118";
      ctx.fillStyle = shaded(ctx, col, cx, y - s * 0.06, w * 0.5, s * 0.1);
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.58, y);
      ctx.quadraticCurveTo(cx - w * 0.3, y - s * 0.22, cx, y - s * 0.16);
      ctx.quadraticCurveTo(cx + w * 0.3, y - s * 0.22, cx + w * 0.58, y);
      ctx.quadraticCurveTo(cx, y + s * 0.06, cx - w * 0.58, y);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#d4a017";
      ctx.lineWidth = Math.max(1, s * 0.02);
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.5, y - s * 0.01);
      ctx.quadraticCurveTo(cx, y + s * 0.04, cx + w * 0.5, y - s * 0.01);
      ctx.stroke();
      if (!back) {
        // tête de mort stylisée
        ell(ctx, cx, y - s * 0.08, s * 0.035, s * 0.03, "#f5f1e6", false, 0, true);
        ctx.strokeStyle = "#f5f1e6";
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.045, y - s * 0.03);
        ctx.lineTo(cx + s * 0.045, y - s * 0.005);
        ctx.moveTo(cx + s * 0.045, y - s * 0.03);
        ctx.lineTo(cx - s * 0.045, y - s * 0.005);
        ctx.stroke();
      }
      break;
    }
    case "tophat": {
      const y = top + s * 0.02;
      rrect(ctx, cx - w * 0.36, y - s * 0.03, w * 0.72, s * 0.05, s * 0.025, "#1d1b26", true);
      rrect(ctx, cx - w * 0.22, y - s * 0.24, w * 0.44, s * 0.23, s * 0.03, "#1d1b26", true);
      rrect(ctx, cx - w * 0.22, y - s * 0.08, w * 0.44, s * 0.04, 0, look.palette.accent, false, true);
      break;
    }
    case "cap": {
      const y = top + s * 0.05;
      const col = look.palette.accent;
      ctx.fillStyle = shaded(ctx, col, cx, y - s * 0.05, w * 0.38, s * 0.12);
      ctx.beginPath();
      ctx.ellipse(cx, y, w * 0.4, s * 0.14, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (!back) {
        const dir = pose.faceX || 0;
        ell(ctx, cx + dir * w * 0.25, y + s * 0.005, w * (dir ? 0.3 : 0.36), s * 0.04, mix(col, "#000000", 0.2), true, 0, true);
      }
      ell(ctx, cx, y - s * 0.14, s * 0.02, s * 0.02, "#ffffff", false, 0, true);
      break;
    }
    case "beanie": {
      const y = top + s * 0.06;
      const col = look.palette.accent;
      ctx.fillStyle = shaded(ctx, col, cx, y - s * 0.08, w * 0.4, s * 0.14);
      ctx.beginPath();
      ctx.ellipse(cx, y, w * 0.42, s * 0.16, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      rrect(ctx, cx - w * 0.44, y - s * 0.03, w * 0.88, s * 0.06, s * 0.03, "#ffffff", true);
      const bounce = Math.abs(Math.sin(pose.t * (pose.moving ? 10 : 3))) * s * 0.03;
      ell(ctx, cx, y - s * 0.18 - bounce, s * 0.05, s * 0.05, "#ffffff", true);
      break;
    }
    case "horns": {
      for (const sx of [-1, 1]) {
        const bx = cx + sx * w * 0.28;
        const by = top + s * 0.06;
        ctx.fillStyle = shaded(ctx, "#f2e6d0", bx, by - s * 0.08, s * 0.05, s * 0.1);
        ctx.beginPath();
        ctx.moveTo(bx - sx * s * 0.05, by);
        ctx.quadraticCurveTo(bx + sx * s * 0.08, by - s * 0.05, bx + sx * s * 0.07, by - s * 0.18);
        ctx.quadraticCurveTo(bx + sx * s * 0.02, by - s * 0.07, bx + sx * s * 0.05, by + s * 0.01);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case "halo": {
      const y = top - s * 0.1 + Math.sin(pose.t * 2.5) * s * 0.02;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#fff3a0";
      ctx.lineWidth = s * 0.07;
      ctx.beginPath();
      ctx.ellipse(cx, y, w * 0.3, s * 0.06, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = Math.max(1.5, s * 0.03);
      ctx.beginPath();
      ctx.ellipse(cx, y, w * 0.3, s * 0.06, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "helmet": {
      const y = top + s * 0.06;
      ctx.fillStyle = shaded(ctx, "#cfd8e3", cx, y - s * 0.08, w * 0.45, s * 0.14);
      ctx.beginPath();
      ctx.ellipse(cx, y, w * 0.46, s * 0.17, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      rrect(ctx, cx - w * 0.48, y - s * 0.025, w * 0.96, s * 0.05, s * 0.025, "#8d99ae", true);
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.2, y - s * 0.14);
      ctx.lineTo(cx + w * 0.3, y - s * 0.28);
      ctx.stroke();
      const on = Math.sin(pose.t * 6) > 0;
      ell(ctx, cx + w * 0.3, y - s * 0.29, s * 0.03, s * 0.03, on ? "#00e5ff" : "#2a6b7a", true, 0, true);
      break;
    }
  }
}

// ---------------------------------------------------------------- entrée
const BODY: Record<BodyKind, (ctx: Ctx, cx: number, by: number, s: number, c: Palette, pose: CharPose, ink: string, look: Look) => Anchor> = {
  fox,
  robot,
  frog,
  ninja,
  mushroom,
  bear,
  penguin,
};

/** Ordre de dessin des accessoires : cou, puis visage, puis tête. */
const SLOT_ORDER: Record<string, number> = { neck: 0, face: 1, head: 2 };

/**
 * (cx, cy) = centre de la case occupée par le personnage ; s = taille de case.
 */
export function drawCharacter(ctx: Ctx, cx: number, cy: number, s: number, look: Look, pose: CharPose, ink = "#1d2a1f") {
  const t = pose.t;
  let bob = pose.moving ? Math.abs(Math.sin(pose.walk * Math.PI)) * s * 0.06 : Math.sin(t * 3) * s * 0.012;
  // saut de joie : tout le personnage décolle, l'ombre reste au sol
  const lift = pose.celebrate ? Math.abs(Math.sin(t * 6)) * s * 0.18 : 0;
  if (pose.celebrate) bob = 0;
  const groundY = cy + s * 0.3;
  const footY = groundY - lift;
  const c = look.palette;
  // respiration / écrasement
  let sx = 1;
  let sy = pose.squash ?? 1;
  if (!pose.moving && pose.squash === undefined) {
    const br = Math.sin(t * 2.6) * 0.022;
    sy += br;
    sx -= br * 0.8;
  }
  if (pose.action) {
    const k = pose.action;
    const q = Math.sin(k * Math.PI * 2) * (1 - k) * 0.18;
    sy -= q;
    sx += q * 0.8;
  }
  if (pose.celebrate) {
    const land = Math.max(0, Math.cos(t * 6 * 2)) * 0.08;
    sy -= land;
    sx += land;
  }
  if (pose.squash !== undefined) sx = 2 - pose.squash;
  const lean = pose.moving && pose.faceY === 0 ? pose.faceX * 0.07 : 0;
  const shake = pose.hurt ? Math.sin(pose.hurt * 40) * s * 0.035 * (1 - pose.hurt) : 0;

  if (!pose.noShadow) {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    const shrink = 1 - (bob + lift) / s;
    ctx.ellipse(cx, groundY + s * 0.02, s * 0.3 * shrink, s * 0.1 * shrink, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // transformation commune au corps et aux accessoires
  const apply = (g: Ctx) => {
    g.translate(cx + shake, footY);
    g.rotate(lean);
    g.scale(sx, sy);
    g.translate(-cx, -footY);
  };
  const by = footY - s * 0.36 - bob;
  const box = { x: cx - s * 0.95, y: cy - s * 1.3 - lift, w: s * 1.9, h: s * 1.9 };
  const draw = (g: Ctx): Anchor => {
    g.lineJoin = "round";
    g.lineCap = "round";
    g.strokeStyle = ink;
    g.lineWidth = Math.max(1.2, s * (look.eyes === "cartoon" ? 0.06 : 0.045));
    if (look.kind === "frog") feet(g, cx, footY, s, pose, c.dark, 0.22, 0.11);
    else if (look.kind === "robot") {
      const swing = pose.moving ? Math.sin(pose.walk * Math.PI) * s * 0.04 : 0;
      for (const k of [-1, 1]) rrect(g, cx + k * s * 0.12 - s * 0.07, footY - s * 0.08 + swing * k, s * 0.14, s * 0.09, s * 0.03, c.dark, true);
    } else if (look.kind === "penguin") feet(g, cx, footY, s, pose, c.accent, 0.11, 0.08);
    else feet(g, cx, footY, s, pose, c.dark);
    const back = pose.faceY < 0;
    // les mains passent derrière en vue de dos
    let a: Anchor | null = null;
    if (back) {
      const probe = BODY[look.kind];
      // ancres connues sans dessiner : on dessine le corps d'abord puis les mains par-dessus
      a = probe(g, cx, by, s, c, pose, ink, look);
      g.strokeStyle = ink;
      g.lineWidth = Math.max(1.2, s * 0.045);
      hands(g, a, s, c, look, pose);
      return a;
    }
    a = BODY[look.kind](g, cx, by, s, c, pose, ink, look);
    g.strokeStyle = ink;
    g.lineWidth = Math.max(1.2, s * 0.045);
    hands(g, a, s, c, look, pose);
    if (pose.expr === "scared") sweat(g, a.headCx + a.headW * 0.42, a.headTop + s * 0.12, s, t);
    return a;
  };

  const T = ctx.getTransform();
  const scale = Math.hypot(T.a, T.b);
  const needLayer = !!sctx && (look.pattern !== "none" && look.pattern !== "panda" || !!look.special || (pose.hurt !== undefined && pose.hurt < 0.35));
  let anchor: Anchor;
  if (needLayer && sctx && scratch && scale > 0) {
    const pw = Math.min(1400, Math.ceil(box.w * scale) + 2);
    const ph = Math.min(1400, Math.ceil(box.h * scale) + 2);
    if (scratch.width < pw || scratch.height < ph) {
      scratch.width = Math.max(scratch.width, pw);
      scratch.height = Math.max(scratch.height, ph);
    }
    const k = Math.min(scale, (pw - 2) / box.w);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, pw, ph);
    sctx.setTransform(k, 0, 0, k, -box.x * k, -box.y * k);
    sctx.save();
    apply(sctx);
    anchor = draw(sctx);
    pattern(sctx, anchor, s, look, pose, box);
    if (pose.hurt !== undefined && pose.hurt < 0.35 && Math.floor(pose.hurt * 24) % 2 === 0) {
      sctx.globalCompositeOperation = "source-atop";
      sctx.fillStyle = "rgba(255,255,255,0.85)";
      sctx.fillRect(box.x, box.y, box.w, box.h);
      sctx.globalCompositeOperation = "source-over";
    }
    sctx.restore();
    ctx.drawImage(scratch, 0, 0, pw - 2, ph - 2, box.x, box.y, (pw - 2) / k, (ph - 2) / k);
  } else {
    ctx.save();
    apply(ctx);
    anchor = draw(ctx);
    ctx.restore();
  }

  // accessoires (au-dessus du motif)
  const wear = look.wear.filter((w) => w !== "none");
  if (look.accessory && look.accessory !== "none" && !wear.includes(look.accessory)) wear.push(look.accessory);
  if (wear.length) {
    ctx.save();
    apply(ctx);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    wear
      .slice()
      .sort((p, q) => SLOT_ORDER[WEAR_SLOT[p as Exclude<Accessory, "none">]] - SLOT_ORDER[WEAR_SLOT[q as Exclude<Accessory, "none">]])
      .forEach((w) => accessory(ctx, w, anchor, s, look, pose, ink));
    ctx.restore();
  }
}

/** Point d'ancrage au-dessus de la tête (bulles d'emote, repères). */
export function headTopOffset(kind: BodyKind): number {
  return kind === "mushroom" || kind === "ninja" ? 0.62 : kind === "frog" ? 0.5 : 0.6;
}
