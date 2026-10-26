/**
 * Rendu « HD » de la map Labyrinthe.
 *
 * Principe : chaque élément (mur, caisse, cristal…) est dessiné UNE fois, en
 * détail, dans un petit canvas mis en cache (à la taille de case et à la
 * densité de pixels de l'écran), puis simplement recopié à chaque image.
 * On peut donc se permettre dégradés, briques une par une, veinage du bois,
 * ombres douces et halos sans coûter de temps pendant la partie.
 * Seuls les éléments vivants (flammes, pulsations, eau) sont redessinés.
 *
 * Le sol, lui, est cuit une fois par partie (renderer.bakeGround) : on y met
 * l'occlusion ambiante au pied des murs et les flaques de lumière des torches.
 *
 * Collisions : rien ici. Tout vient du plan de la map (src/maps/*.ts).
 */
import { TERRAIN } from "../core/types";
import { LABYRINTH } from "../maps/labyrinth";
import type { Art } from "./art";
import { LIFT, hash } from "./sprites";

type Ctx = CanvasRenderingContext2D;

// ================================================================ outils
const now = () => (typeof performance !== "undefined" ? performance.now() / 1000 : 0);

function path(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}
function fillRR(g: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  path(g, x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
}
function strokeRR(g: Ctx, x: number, y: number, w: number, h: number, r: number, color: string, width: number) {
  path(g, x, y, w, h, r);
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke();
}
function circle(g: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient) {
  g.beginPath();
  g.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}
function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}
function lin(g: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
function rad(g: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][]) {
  const gr = g.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
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
/** Éclaircit / assombrit une couleur #rrggbb (k de -1 à 1). */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
  // renvoie toujours du #rrggbb, pour pouvoir re-nuancer le résultat
  return "#" + ((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0");
}

// ------------------------------------------------------- cache de sprites
const cache = new Map<string, HTMLCanvasElement>();
const MX = 0.14; // marge horizontale (ombres), en fraction de case

/** Échelle réelle du dessin (densité de pixels), arrondie pour limiter le cache. */
function scaleOf(ctx: Ctx): number {
  const t = ctx.getTransform();
  const k = Math.hypot(t.a, t.b);
  return Math.max(1, Math.min(3, Math.round(k * 2) / 2));
}

/**
 * Dessine un sprite mis en cache. La zone couvre la case, `top` cases au-dessus
 * (relief) et `bot` en dessous (ombre). `draw` reçoit un contexte où (0,0) est
 * le coin haut-gauche de la case.
 */
function cached(ctx: Ctx, key: string, px: number, py: number, s: number, top: number, bot: number, draw: (g: Ctx, s: number) => void) {
  if (typeof document === "undefined") return;
  const q = scaleOf(ctx);
  const k = `${key}|${s}|${q}`;
  let c = cache.get(k);
  if (!c) {
    if (cache.size > 500) cache.clear();
    c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(s * (1 + MX * 2) * q));
    c.height = Math.max(1, Math.ceil(s * (1 + top + bot) * q));
    const g = c.getContext("2d")!;
    g.scale(q, q);
    g.translate(s * MX, s * top);
    draw(g, s);
    cache.set(k, c);
  }
  ctx.drawImage(c, px - s * MX, py - s * top, s * (1 + MX * 2), s * (1 + top + bot));
}

/** Halo lumineux pré-dessiné (dégradé radial), recopié en mode additif. */
const glows = new Map<string, HTMLCanvasElement>();
function glow(ctx: Ctx, x: number, y: number, r: number, rgb: string, a: number) {
  if (typeof document === "undefined" || r <= 0.5 || a <= 0) return;
  let c = glows.get(rgb);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = rad(g, 32, 32, 0, 32, [[0, `rgba(${rgb},1)`], [0.45, `rgba(${rgb},0.35)`], [1, `rgba(${rgb},0)`]]);
    g.fillRect(0, 0, 64, 64);
    glows.set(rgb, c);
  }
  const op = ctx.globalCompositeOperation;
  const ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = ga * Math.min(1, a);
  ctx.drawImage(c, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = ga;
  ctx.globalCompositeOperation = op;
}

/** Coordonnées miroir : la décoration reste symétrique comme le plan. */
function canon(layout: string[], tx: number, ty: number): [number, number] {
  return [Math.min(tx, layout[0].length - 1 - tx), Math.min(ty, layout.length - 1 - ty)];
}
const at = (layout: string[], tx: number, ty: number) => layout[ty]?.[tx] ?? "#";

/** Ombre douce sous un objet posé au sol. */
function softShadow(g: Ctx, x: number, y: number, w: number, h: number, r: number, a = 0.42) {
  g.save();
  g.shadowColor = `rgba(0,0,0,${a})`;
  g.shadowBlur = Math.max(2, w * 0.12);
  g.shadowOffsetX = w * 0.05;
  g.shadowOffsetY = w * 0.07;
  fillRR(g, x, y, w, h, r, `rgba(0,0,0,${a * 0.6})`);
  g.restore();
}

// ------------------------------------------------ illustrations (images)
/**
 * Illustrations faites avec une IA d'images (fond transparent, 256×256),
 * dans public/sprites/labyrinth/. Si une image manque ou n'est pas encore
 * chargée, le dessin par code prend le relais : le jeu marche toujours.
 */
const SPRITE_FILES: Record<string, string> = {
  barrel: "sprites/labyrinth/barrel.png",
  crate: "sprites/labyrinth/crate.png",
  bush: "sprites/labyrinth/bush.png",
  wallTorch: "sprites/labyrinth/wall-torch.png",
  altar: "sprites/labyrinth/altar.png",
  floorSand: "sprites/labyrinth/floor-sand.png",
  water: "sprites/labyrinth/water.png",
  bridge: "sprites/labyrinth/bridge.png",
  wall: "sprites/labyrinth/wall.png",
  floor: "sprites/labyrinth/floor.png",
};
/** augmente à chaque image chargée : le sol (cuit une fois) est alors redessiné */
let spriteVersion = 0;
const images = new Map<string, HTMLImageElement>();
function img(id: string): HTMLImageElement | null {
  const file = SPRITE_FILES[id];
  if (!file || typeof Image === "undefined") return null;
  let im = images.get(id);
  if (!im) {
    im = new Image();
    im.decoding = "async";
    im.onload = () => spriteVersion++;
    im.src = file;
    images.set(id, im);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}
// préchargement dès l'ouverture du jeu
if (typeof window !== "undefined") for (const id of Object.keys(SPRITE_FILES)) img(id);

/**
 * Pose une illustration vue de dessus comme un objet en relief : ombre douce,
 * épaisseur (copies assombries empilées) puis le dessus, remonté de LIFT.
 */
function illustrated(g: Ctx, s: number, im: HTMLImageElement, round: boolean, scale = 0.9) {
  const lift = s * LIFT;
  const w = s * scale;
  const x = (s - w) / 2;
  const yTop = (s - w) / 2 - lift;
  // ombre au sol
  if (round) ellipse(g, s / 2 + s * 0.06, s / 2 + s * 0.1, w * 0.48, w * 0.44, "rgba(0,0,0,0.35)");
  else softShadow(g, x, yTop + lift, w, w, s * 0.08);
  // épaisseur
  const steps = 5;
  g.save();
  g.filter = "brightness(0.5) saturate(1.1)";
  for (let k = steps; k >= 1; k--) g.drawImage(im, x, yTop + (lift * k) / steps, w, w);
  g.restore();
  g.drawImage(im, x, yTop, w, w);
}

// ====================================================================
//                              LABYRINTHE
// ====================================================================
const L = LABYRINTH.layout;
const LW = L[0].length;
const LH = L.length;
const isAltar = (tx: number, ty: number) => tx === (LW - 1) / 2 && ty === (LH - 1) / 2;
const labInnerWall = (tx: number, ty: number) => tx > 0 && ty > 0 && tx < LW - 1 && ty < LH - 1 && at(L, tx, ty) === "#";
/** Variante d'un mur intérieur : torche, glyphe, mousse ou simple. */
function labWallKind(tx: number, ty: number): "altar" | "torch" | "glyph" | "moss" | "plain" {
  if (isAltar(tx, ty)) return "altar";
  const [cx, cy] = canon(L, tx, ty);
  const h = hash(cx, cy, 13);
  return h < 0.42 ? "torch" : h < 0.66 ? "glyph" : h < 0.84 ? "moss" : "plain";
}
const ringTorch = (tx: number, ty: number) => {
  const [cx, cy] = canon(L, tx, ty);
  if (isGate(tx, ty)) return false;
  return (cx === 0 && cy % 3 === 1) || (cy === 0 && cx % 3 === 1);
};
const isGate = (tx: number, ty: number) =>
  (tx === (LW - 1) / 2 && (ty === 0 || ty === LH - 1)) || (ty === (LH - 1) / 2 && (tx === 0 || tx === LW - 1));

/** Sources de lumière (torches, autel) : [x, y, rayon en cases, intensité]. */
const LAB_LIGHTS: [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = [];
  for (let y = 0; y < LH; y++)
    for (let x = 0; x < LW; x++) {
      if (labInnerWall(x, y)) {
        const k = labWallKind(x, y);
        if (k === "altar") out.push([x + 0.5, y + 0.3, 3.2, 0.42]);
        else if (k === "torch") out.push([x + 0.5, y + 0.3, 2.3, 0.3]);
      } else if ((x === 0 || y === 0 || x === LW - 1 || y === LH - 1) && ringTorch(x, y)) out.push([x + 0.5, y + 0.5, 2.1, 0.24]);
    }
  return out;
})();

/** Flamme vivante : lueur additive + langues de feu. (x, y) = base de la flamme. */
function flame(ctx: Ctx, x: number, y: number, s: number, seed: number, size = 1) {
  const t = now();
  const f = 0.88 + 0.12 * Math.sin(t * 10.7 + seed * 7.1) + 0.06 * Math.sin(t * 23.3 + seed * 3.7);
  const k = size;
  glow(ctx, x, y - s * 0.12 * k, s * 0.6 * k * f, "255,150,60", 0.42);
  const sway = Math.sin(t * 8 + seed) * s * 0.035 * k;
  const tongue = (w: number, h: number, c: string) => {
    ctx.beginPath();
    ctx.moveTo(x - s * w * k, y);
    ctx.bezierCurveTo(x - s * w * k, y - s * h * 0.45 * k, x + sway * 0.3, y - s * h * 0.6 * k * f, x + sway, y - s * h * k * f);
    ctx.bezierCurveTo(x + sway * 0.3, y - s * h * 0.6 * k * f, x + s * w * k, y - s * h * 0.45 * k, x + s * w * k, y);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
  };
  tongue(0.12, 0.34, "#ff5a14");
  tongue(0.085, 0.26, "#ff9a2a");
  tongue(0.05, 0.17, "#ffe680");
  ellipse(ctx, x, y - s * 0.02 * k, s * 0.04 * k, s * 0.025 * k, "#fff6c8");
}

/** Pierre : un bloc de maçonnerie (dessus en briques + face avant). */
function stoneBlock(g: Ctx, s: number, seed: number, palette: { top: string; side: string; mortar: string }) {
  const lift = s * LIFT;
  const pad = s * 0.035;
  const w = s - pad * 2;
  const top = -lift + pad;
  const hTop = s - pad * 2 - lift * 0.12;
  softShadow(g, pad, top + lift * 0.4, w, s - pad - lift * 0.3, s * 0.08);
  // face avant
  fillRR(g, pad, top, w, s - pad - top, s * 0.08, lin(g, 0, top + hTop, 0, s - pad, [[0, shade(palette.side, 0.05)], [1, shade(palette.side, -0.35)]]));
  // briques de la face avant
  const fy0 = top + hTop;
  const fh = s - pad - fy0;
  g.save();
  path(g, pad, top, w, s - pad - top, s * 0.08);
  g.clip();
  for (let i = 0; i < 3; i++) {
    const bx = pad + (w / 3) * i + (i ? 0 : 0);
    fillRR(g, bx + s * 0.012, fy0 + s * 0.015, w / 3 - s * 0.024, fh - s * 0.03, s * 0.02, shade(palette.side, (hash(seed, i, 4) - 0.5) * 0.18));
    fillRR(g, bx + s * 0.02, fy0 + s * 0.02, w / 3 - s * 0.04, s * 0.02, s * 0.01, "rgba(255,255,255,0.12)");
  }
  g.restore();
  // dessus : fond de joint puis briques une à une
  fillRR(g, pad, top, w, hTop, s * 0.08, palette.mortar);
  g.save();
  path(g, pad, top, w, hTop, s * 0.08);
  g.clip();
  const rows = 3;
  const rh = hTop / rows;
  for (let r = 0; r < rows; r++) {
    const cols = r % 2 ? 2 : 3;
    const off = r % 2 ? 0 : -w / 6;
    // rangées décalées comme une vraie maçonnerie
    for (let c = 0; c < cols + (r % 2 ? 0 : 1); c++) {
      const ww = r % 2 ? w / 2 : w / 2.5;
      const x0 = r % 2 ? pad + c * ww : pad + off + c * ww;
      const y0 = top + r * rh;
      const v = (hash(seed, r * 7 + c, 9) - 0.5) * 0.16;
      const base = shade(palette.top, v);
      fillRR(g, x0 + s * 0.014, y0 + s * 0.014, ww - s * 0.028, rh - s * 0.028, s * 0.025, lin(g, x0, y0, x0 + ww * 0.4, y0 + rh, [[0, shade(palette.top, v + 0.12)], [1, base]]));
      // biseau : arête claire en haut, sombre en bas
      fillRR(g, x0 + s * 0.02, y0 + s * 0.016, ww - s * 0.04, s * 0.018, s * 0.008, "rgba(255,255,255,0.32)");
      fillRR(g, x0 + s * 0.02, y0 + rh - s * 0.03, ww - s * 0.04, s * 0.014, s * 0.007, "rgba(20,24,34,0.25)");
      // éclats et grain
      if (hash(seed, r * 5 + c, 2) < 0.35) circle(g, x0 + ww * (0.25 + hash(seed, c, r) * 0.5), y0 + rh * 0.55, s * 0.012, "rgba(30,34,44,0.45)");
    }
  }
  // fissure
  if (hash(seed, 1, 77) < 0.4) line(g, [pad + w * 0.6, top + hTop * 0.2, pad + w * 0.68, top + hTop * 0.42, pad + w * 0.62, top + hTop * 0.58], "rgba(25,28,38,0.55)", Math.max(1, s * 0.015));
  g.restore();
  // reflet du bord supérieur
  fillRR(g, pad + s * 0.05, top + s * 0.012, w - s * 0.1, s * 0.03, s * 0.015, "rgba(255,255,255,0.38)");
  // contour net
  strokeRR(g, pad, top, w, s - pad - top, s * 0.08, "#151922", Math.max(1, s * 0.03));
  line(g, [pad + s * 0.03, top + hTop, pad + w - s * 0.03, top + hTop], "rgba(15,18,26,0.6)", Math.max(1, s * 0.02));
}

const LAB_STONE = { top: "#a4acb7", side: "#5c6371", mortar: "#3a404c" };

function labWallSprite(g: Ctx, s: number, tx: number, ty: number, kind: ReturnType<typeof labWallKind>) {
  const [cx, cy] = canon(L, tx, ty);
  const seed = cx * 31 + cy * 7;
  const lift = s * LIFT;
  if (kind === "altar") {
    stoneBlock(g, s, seed, { top: "#b3a48f", side: "#6e5f4c", mortar: "#4a3e30" });
    const top = -lift + s * 0.035;
    const hTop = s - s * 0.07 - lift * 0.12;
    const cxp = s / 2;
    const cyp = top + hTop * 0.55;
    // vasque dorée
    ellipse(g, cxp, cyp + s * 0.05, s * 0.34, s * 0.2, "rgba(0,0,0,0.35)");
    ellipse(g, cxp, cyp, s * 0.32, s * 0.19, lin(g, 0, cyp - s * 0.2, 0, cyp + s * 0.2, [[0, "#ffe08a"], [0.5, "#d49a2a"], [1, "#7a4c10"]]));
    ellipse(g, cxp, cyp - s * 0.02, s * 0.25, s * 0.13, rad(g, cxp, cyp, 0, s * 0.25, [[0, "#ffb347"], [0.6, "#a8350c"], [1, "#3a1406"]]));
    g.lineWidth = Math.max(1, s * 0.02);
    g.strokeStyle = "#5a3608";
    g.beginPath();
    g.ellipse(cxp, cyp, s * 0.32, s * 0.19, 0, 0, Math.PI * 2);
    g.stroke();
    return;
  }
  stoneBlock(g, s, seed, LAB_STONE);
  const top = -lift + s * 0.035;
  const hTop = s - s * 0.07 - lift * 0.12;
  if (kind === "torch") {
    // brasero en fer forgé sur le mur
    const bx = s / 2;
    const by = top + hTop * 0.5;
    ellipse(g, bx + s * 0.02, by + s * 0.1, s * 0.16, s * 0.07, "rgba(0,0,0,0.4)");
    fillRR(g, bx - s * 0.035, by - s * 0.02, s * 0.07, s * 0.14, s * 0.02, lin(g, bx - s * 0.04, 0, bx + s * 0.04, 0, [[0, "#2a2a30"], [0.5, "#6a6a74"], [1, "#2a2a30"]]));
    ellipse(g, bx, by - s * 0.02, s * 0.13, s * 0.06, lin(g, 0, by - s * 0.08, 0, by + s * 0.04, [[0, "#7a7a84"], [1, "#2a2a30"]]));
    ellipse(g, bx, by - s * 0.035, s * 0.1, s * 0.035, "#3a1a0a");
  } else if (kind === "glyph") {
    // glyphe gravé : creux sombre + lèvre claire
    const gx = s / 2;
    const gy = top + hTop * 0.52;
    const r = s * 0.16;
    const pts = [gx - r, gy + r, gx - r, gy - r, gx + r, gy - r, gx + r, gy + r * 0.45, gx - r * 0.4, gy + r * 0.45, gx - r * 0.4, gy - r * 0.35, gx + r * 0.38, gy - r * 0.35];
    line(g, pts.map((v, i) => v + (i % 2 ? s * 0.012 : s * 0.008)), "rgba(255,255,255,0.35)", Math.max(1, s * 0.03));
    line(g, pts, "rgba(28,32,42,0.85)", Math.max(1, s * 0.03));
  } else if (kind === "moss") {
    // mousse qui coule sur le bord
    for (let k = 0; k < 4; k++) {
      const mx = s * (0.2 + hash(cx, cy, k) * 0.6);
      ellipse(g, mx, top + s * 0.03, s * (0.08 + hash(cy, cx, k) * 0.06), s * 0.05, k % 2 ? "#4f8f3a" : "#69ad48");
      if (k % 2) fillRR(g, mx - s * 0.015, top + s * 0.03, s * 0.03, s * (0.06 + hash(cx, k, cy) * 0.1), s * 0.015, "#4f8f3a");
    }
  }
}

/** Caisse en bois : planches veinées, coins en fer rivetés. */
function labCrateSprite(g: Ctx, s: number, seed: number) {
  const lift = s * LIFT;
  const pad = s * 0.075;
  const w = s - pad * 2;
  const top = -lift + pad;
  const hTop = w - lift * 0.12;
  softShadow(g, pad, top + lift * 0.4, w, w + lift * 0.5, s * 0.06);
  // face avant
  fillRR(g, pad, top, w, w + lift * 0.88, s * 0.06, lin(g, 0, top + hTop, 0, top + w + lift * 0.88, [[0, "#b56a2e"], [1, "#6e3a14"]]));
  for (let i = 1; i < 3; i++) line(g, [pad + (w * i) / 3, top + hTop + s * 0.01, pad + (w * i) / 3, top + w + lift * 0.85], "rgba(60,28,8,0.6)", Math.max(1, s * 0.015));
  // dessus : 3 planches
  const ph = hTop / 3;
  for (let i = 0; i < 3; i++) {
    const y0 = top + i * ph;
    const v = (hash(seed, i, 3) - 0.5) * 0.12;
    fillRR(g, pad, y0, w, ph + 0.5, s * 0.02, lin(g, pad, y0, pad, y0 + ph, [[0, shade("#e39a52", v + 0.1)], [1, shade("#c7783a", v)]]));
    // veinage
    for (let k = 0; k < 3; k++) {
      const yy = y0 + ph * (0.3 + k * 0.22);
      g.beginPath();
      g.moveTo(pad + s * 0.04, yy);
      g.bezierCurveTo(pad + w * 0.3, yy - s * 0.02, pad + w * 0.6, yy + s * 0.02 * (hash(seed, i, k) - 0.5) * 4, pad + w - s * 0.04, yy);
      g.strokeStyle = "rgba(120,60,20,0.35)";
      g.lineWidth = Math.max(0.8, s * 0.008);
      g.stroke();
    }
    line(g, [pad, y0 + ph, pad + w, y0 + ph], "rgba(80,38,10,0.7)", Math.max(1, s * 0.015));
    line(g, [pad + s * 0.02, y0 + s * 0.012, pad + w - s * 0.02, y0 + s * 0.012], "rgba(255,225,170,0.35)", Math.max(0.8, s * 0.01));
  }
  // croisillon en relief
  const x0 = pad + s * 0.1, y0 = top + s * 0.1, x1 = pad + w - s * 0.1, y1 = top + hTop - s * 0.1;
  // croisillon en X (comme la référence) : ombre, planche, arête éclairée
  for (const [ax, ay, bx2, by2] of [[x0, y0, x1, y1], [x1, y0, x0, y1]]) {
    line(g, [ax + s * 0.01, ay + s * 0.02, bx2 + s * 0.01, by2 + s * 0.02], "rgba(60,26,6,0.55)", Math.max(2, s * 0.08));
    line(g, [ax, ay, bx2, by2], "#a8622a", Math.max(2, s * 0.068));
    line(g, [ax, ay - s * 0.012, bx2, by2 - s * 0.012], "rgba(255,210,150,0.35)", Math.max(0.8, s * 0.011));
  }
  // cadre intérieur
  strokeRR(g, pad + s * 0.045, top + s * 0.045, w - s * 0.09, hTop - s * 0.09, s * 0.03, "#9c5824", Math.max(1.5, s * 0.05));
  // coins en fer et rivets
  for (const [cx, cy] of [[pad, top], [pad + w, top], [pad, top + hTop], [pad + w, top + hTop]]) {
    const sx = cx === pad ? 1 : -1;
    const sy = cy === top ? 1 : -1;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + sx * s * 0.17, cy);
    g.lineTo(cx, cy + sy * s * 0.17);
    g.closePath();
    g.fillStyle = lin(g, cx, cy, cx + sx * s * 0.15, cy + sy * s * 0.15, [[0, "#9aa0aa"], [1, "#4a4e58"]]);
    g.fill();
    circle(g, cx + sx * s * 0.05, cy + sy * s * 0.05, s * 0.018, "#2a2c32");
    circle(g, cx + sx * s * 0.045, cy + sy * s * 0.045, s * 0.008, "#d8dce2");
  }
  strokeRR(g, pad, top, w, w + lift * 0.88, s * 0.06, "#2e1606", Math.max(1, s * 0.03));
}

/** Tonneau cerclé de fer. */
function labBarrelSprite(g: Ctx, s: number) {
  const lift = s * LIFT;
  const cx = s / 2;
  const topY = -lift + s * 0.3;
  const botY = s * 0.86;
  ellipse(g, cx + s * 0.06, botY, s * 0.36, s * 0.12, "rgba(0,0,0,0.38)");
  // fût : douelles
  g.save();
  g.beginPath();
  g.moveTo(cx - s * 0.33, topY);
  g.bezierCurveTo(cx - s * 0.4, topY + (botY - topY) * 0.4, cx - s * 0.4, botY - s * 0.12, cx - s * 0.3, botY - s * 0.02);
  g.lineTo(cx + s * 0.3, botY - s * 0.02);
  g.bezierCurveTo(cx + s * 0.4, botY - s * 0.12, cx + s * 0.4, topY + (botY - topY) * 0.4, cx + s * 0.33, topY);
  g.closePath();
  g.fillStyle = lin(g, cx - s * 0.4, 0, cx + s * 0.4, 0, [[0, "#5e3212"], [0.35, "#b2682e"], [0.55, "#c87c3c"], [1, "#4e2a0e"]]);
  g.fill();
  g.clip();
  for (let k = -3; k <= 3; k++) line(g, [cx + k * s * 0.1, topY, cx + k * s * 0.11, botY], "rgba(60,28,8,0.45)", Math.max(0.8, s * 0.012));
  for (const f of [0.22, 0.72]) {
    const y = topY + (botY - topY) * f;
    fillRR(g, cx - s * 0.42, y, s * 0.84, s * 0.065, s * 0.02, lin(g, 0, y, 0, y + s * 0.065, [[0, "#b8bcc6"], [1, "#4a4e58"]]));
  }
  g.restore();
  // couvercle
  ellipse(g, cx, topY, s * 0.33, s * 0.17, lin(g, 0, topY - s * 0.17, 0, topY + s * 0.17, [[0, "#e0a060"], [1, "#a8642c"]]));
  g.strokeStyle = "#6e6e78";
  g.lineWidth = Math.max(1.2, s * 0.035);
  g.beginPath();
  g.ellipse(cx, topY, s * 0.33, s * 0.17, 0, 0, Math.PI * 2);
  g.stroke();
  for (let k = -1; k <= 1; k++) line(g, [cx - s * 0.24, topY + k * s * 0.06, cx + s * 0.24, topY + k * s * 0.06], "rgba(110,60,20,0.5)", Math.max(0.8, s * 0.01));
  g.strokeStyle = "#1e0e04";
  g.lineWidth = Math.max(1, s * 0.025);
  g.beginPath();
  g.ellipse(cx, topY, s * 0.35, s * 0.19, 0, Math.PI, 0);
  g.stroke();
}

/** Haie taillée : grappes de feuilles ombrées. */
function labHedgeSprite(g: Ctx, s: number, seed: number) {
  const lift = s * LIFT;
  softShadow(g, s * 0.08, -lift + s * 0.2, s * 0.84, s * 0.78 + lift * 0.5, s * 0.25);
  fillRR(g, s * 0.07, -lift + s * 0.12, s * 0.86, s * 0.8 + lift * 0.62, s * 0.26, lin(g, 0, -lift, 0, s, [[0, "#3c9a3a"], [1, "#1c5a22"]]));
  // grappes de feuilles du fond vers l'avant
  const blobs: [number, number, number][] = [];
  for (let k = 0; k < 9; k++) blobs.push([0.2 + hash(seed, k, 1) * 0.6, 0.12 + hash(seed, k, 2) * 0.62, 0.11 + hash(seed, k, 3) * 0.06]);
  blobs.sort((a, b) => a[1] - b[1]);
  for (const [bx, by, r] of blobs) {
    const x = s * bx;
    const y = -lift + s * by + s * 0.06;
    circle(g, x + s * 0.015, y + s * 0.02, s * r, "rgba(10,40,12,0.45)");
    circle(g, x, y, s * r, rad(g, x - s * r * 0.35, y - s * r * 0.4, 0, s * r * 1.2, [[0, "#8be06a"], [0.55, "#4cae3e"], [1, "#2a7a2a"]]));
  }
  if (hash(seed, 9, 9) < 0.6)
    for (let k = 0; k < 3; k++) circle(g, s * (0.3 + hash(seed, k, 11) * 0.4), -lift + s * (0.25 + hash(seed, k, 12) * 0.4), s * 0.03, ["#ff8ac6", "#fff2a8", "#ffffff"][k]);
  strokeRR(g, s * 0.07, -lift + s * 0.12, s * 0.86, s * 0.8 + lift * 0.62, s * 0.26, "rgba(10,36,12,0.9)", Math.max(1, s * 0.028));
}

// ---------------------------------------------------------------- sol
function labFloorHD(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const [cx, cy] = canon(L, tx, ty);
  const sand = cx <= 2 && cy <= 2 && !(cx === 2 && cy === 2);
  const center = cx >= 4 && cy >= 3;
  const base = sand ? "#d6b07a" : center ? "#454c5e" : "#3d4351";
  const sandImg = img(sand ? "floorSand" : "floor");
  if (sandImg) g.drawImage(sandImg, px, py, s, s);
  // 4 dalles biseautées (dessin par code si pas d'illustration)
  const half = s / 2;
  for (let i = 0; i < (sandImg ? 0 : 4); i++) {
    const ox = (i % 2) * half;
    const oy = Math.floor(i / 2) * half;
    const v = (hash(tx * 2 + (i % 2), ty * 2 + (i >> 1), 21) - 0.5) * (sand ? 0.12 : 0.16);
    const c = shade(base, v);
    g.fillStyle = sand ? "#a8834e" : "#1c2028";
    g.fillRect(px + ox, py + oy, half, half);
    fillRR(g, px + ox + s * 0.02, py + oy + s * 0.02, half - s * 0.04, half - s * 0.04, s * 0.03, lin(g, px + ox, py + oy, px + ox + half, py + oy + half, [[0, shade(c, 0.12)], [1, shade(c, -0.1)]]));
    // biseau
    line(g, [px + ox + s * 0.035, py + oy + half - s * 0.04, px + ox + s * 0.035, py + oy + s * 0.035, px + ox + half - s * 0.04, py + oy + s * 0.035], sand ? "rgba(255,245,220,0.4)" : "rgba(255,255,255,0.1)", Math.max(0.8, s * 0.012));
    line(g, [px + ox + half - s * 0.03, py + oy + s * 0.04, px + ox + half - s * 0.03, py + oy + half - s * 0.03, px + ox + s * 0.04, py + oy + half - s * 0.03], "rgba(0,0,0,0.3)", Math.max(0.8, s * 0.012));
    // grain
    for (let k = 0; k < 5; k++)
      circle(g, px + ox + half * (0.15 + hash(tx * 9 + i, ty, k) * 0.7), py + oy + half * (0.15 + hash(tx, ty * 9 + i, k) * 0.7), s * 0.007, sand ? "rgba(140,100,50,0.5)" : "rgba(255,255,255,0.07)");
  }
  const h = hash(cx, cy, 31);
  if (sandImg) {
    // sol illustré : pas de décor ajouté par code
  } else if (!sand && h < 0.2) {
    for (let k = 0; k < 4; k++) circle(g, px + s * (0.08 + k * 0.05), py + s * (0.85 - (k % 2) * 0.05), s * 0.035, k % 2 ? "rgba(98,160,70,0.7)" : "rgba(70,130,55,0.7)");
  } else if (!sand && h < 0.33) {
    line(g, [px + s * 0.55, py + s * 0.52, px + s * 0.66, py + s * 0.66, px + s * 0.6, py + s * 0.82, px + s * 0.7, py + s * 0.95], "rgba(8,10,16,0.6)", Math.max(1, s * 0.016));
  } else if (sand && !sandImg && h < 0.3) {
    ellipse(g, px + s * 0.7, py + s * 0.3, s * 0.06, s * 0.035, "#b89260");
  }
  // pont de bois au-dessus des canaux
  const water = (x: number, y: number) => at(L, x, y) === "~";
  if (at(L, tx, ty) === "_" && (water(tx - 1, ty) || water(tx + 1, ty) || water(tx, ty - 1) || water(tx, ty + 1))) {
    // eau à gauche/droite : on traverse de haut en bas (pont tel quel), sinon pont tourné
    const vertical = water(tx - 1, ty) || water(tx + 1, ty);
    const im = img("bridge");
    if (im) {
      g.save();
      g.translate(px + s / 2, py + s / 2);
      if (!vertical) g.rotate(Math.PI / 2);
      g.drawImage(im, -s / 2, -s / 2, s, s);
      g.restore();
    } else labBridge(g, px, py, s, vertical);
  }
  // occlusion ambiante au pied des murs (lumière venant du haut-gauche)
  const wall = (x: number, y: number) => at(L, x, y) === "#";
  g.save();
  g.beginPath();
  g.rect(px, py, s, s);
  g.clip();
  if (wall(tx, ty - 1)) {
    g.fillStyle = lin(g, 0, py, 0, py + s * 0.45, [[0, "rgba(0,0,0,0.5)"], [1, "rgba(0,0,0,0)"]]);
    g.fillRect(px, py, s, s * 0.45);
  }
  if (wall(tx - 1, ty)) {
    g.fillStyle = lin(g, px, 0, px + s * 0.35, 0, [[0, "rgba(0,0,0,0.42)"], [1, "rgba(0,0,0,0)"]]);
    g.fillRect(px, py, s * 0.35, s);
  }
  if (wall(tx + 1, ty)) {
    g.fillStyle = lin(g, px + s, 0, px + s * 0.8, 0, [[0, "rgba(0,0,0,0.25)"], [1, "rgba(0,0,0,0)"]]);
    g.fillRect(px + s * 0.8, py, s * 0.2, s);
  }
  if (wall(tx, ty + 1)) {
    g.fillStyle = lin(g, 0, py + s, 0, py + s * 0.8, [[0, "rgba(0,0,0,0.22)"], [1, "rgba(0,0,0,0)"]]);
    g.fillRect(px, py + s * 0.8, s, s * 0.2);
  }
  // flaques de lumière des torches
  g.globalCompositeOperation = "lighter";
  for (const [lx, ly, r, a] of LAB_LIGHTS) {
    const dx = lx - (tx + 0.5);
    const dy = ly - (ty + 0.5);
    if (dx * dx + dy * dy > (r + 0.8) * (r + 0.8)) continue;
    const X = px + (lx - tx) * s;
    const Y = py + (ly - ty) * s;
    g.fillStyle = rad(g, X, Y, 0, r * s, [[0, `rgba(255,150,60,${a})`], [0.5, `rgba(255,120,40,${a * 0.35})`], [1, "rgba(255,100,30,0)"]]);
    g.fillRect(px, py, s, s);
  }
  g.restore();
}

function labBridge(g: Ctx, px: number, py: number, s: number, vertical: boolean) {
  g.fillStyle = lin(g, px, py, px + s, py + s, [[0, "#1a6f9e"], [1, "#0e4a72"]]);
  g.fillRect(px, py, s, s);
  g.save();
  g.translate(px + s / 2, py + s / 2);
  if (!vertical) g.rotate(Math.PI / 2);
  // ombre du pont sur l'eau
  fillRR(g, -s * 0.44 + s * 0.05, -s * 0.5 + s * 0.04, s * 0.88, s, s * 0.04, "rgba(0,20,40,0.45)");
  for (let k = 0; k < 5; k++) {
    const y = -s * 0.5 + k * s * 0.2;
    const v = (hash(px, py, k) - 0.5) * 0.12;
    fillRR(g, -s * 0.42, y + s * 0.01, s * 0.84, s * 0.18, s * 0.025, lin(g, 0, y, 0, y + s * 0.18, [[0, shade("#d9a060", v + 0.1)], [1, shade("#9c6430", v)]]));
    line(g, [-s * 0.38, y + s * 0.06, s * 0.38, y + s * 0.07], "rgba(110,60,20,0.35)", Math.max(0.8, s * 0.008));
    circle(g, -s * 0.34, y + s * 0.1, s * 0.012, "#3a2410");
    circle(g, s * 0.34, y + s * 0.1, s * 0.012, "#3a2410");
  }
  // rambardes
  for (const x of [-0.47, 0.41]) {
    fillRR(g, s * x, -s * 0.5, s * 0.06, s, s * 0.03, lin(g, s * x, 0, s * (x + 0.06), 0, [[0, "#7a4a22"], [1, "#4a2a10"]]));
    circle(g, s * (x + 0.03), -s * 0.42, s * 0.04, "#5a3418");
    circle(g, s * (x + 0.03), s * 0.42, s * 0.04, "#5a3418");
  }
  g.restore();
}

function labWaterHD(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const water = (x: number, y: number) => at(L, x, y) === "~";
  g.fillStyle = "#2e3440";
  g.fillRect(px, py, s, s);
  fillRR(g, px + s * 0.04, py + s * 0.04, s * 0.92, s * 0.92, s * 0.06, lin(g, px, py, px + s * 0.3, py + s, [[0, "#0b4f7e"], [0.5, "#1888c4"], [1, "#2fb6e8"]]));
  // ombre portée par le rebord (haut-gauche)
  g.save();
  path(g, px + s * 0.04, py + s * 0.04, s * 0.92, s * 0.92, s * 0.06);
  g.clip();
  g.fillStyle = lin(g, 0, py, 0, py + s * 0.25, [[0, "rgba(0,10,30,0.5)"], [1, "rgba(0,10,30,0)"]]);
  g.fillRect(px, py, s, s * 0.25);
  // écume le long des bords
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (water(tx + dx, ty + dy)) continue;
    const x = dx === 1 ? px + s * 0.9 : px + s * 0.06;
    const y = dy === 1 ? py + s * 0.9 : py + s * 0.06;
    if (dx) for (let k = 0; k < 4; k++) circle(g, x, py + s * (0.15 + k * 0.23), s * 0.035, "rgba(220,250,255,0.55)");
    else for (let k = 0; k < 4; k++) circle(g, px + s * (0.15 + k * 0.23), y, s * 0.035, "rgba(220,250,255,0.55)");
  }
  g.restore();
  // nénuphar
  if (hash(tx, ty, 3) < 0.75) {
    const x = px + s * (0.55 + hash(tx, ty, 4) * 0.15);
    const y = py + s * (0.55 + hash(tx, ty, 5) * 0.15);
    ellipse(g, x + s * 0.02, y + s * 0.02, s * 0.14, s * 0.1, "rgba(0,30,40,0.4)");
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, s * 0.14, 0.3, Math.PI * 2 - 0.1);
    g.closePath();
    g.fillStyle = lin(g, x - s * 0.14, y - s * 0.14, x + s * 0.14, y + s * 0.14, [[0, "#6fcf5a"], [1, "#2e8a3a"]]);
    g.fill();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ellipse(g, x + Math.cos(a) * s * 0.04, y - s * 0.03 + Math.sin(a) * s * 0.025, s * 0.045, s * 0.02, k % 2 ? "#ff9ad0" : "#ffd0ea", a);
    }
    circle(g, x, y - s * 0.03, s * 0.022, "#ffe066");
  }
  // rebord de pierre
  strokeRR(g, px + s * 0.04, py + s * 0.04, s * 0.92, s * 0.92, s * 0.06, "#596070", Math.max(1, s * 0.035));
}

// ------------------------------------------------- enceinte et décor lointain
function labRingHD(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const [cx, cy] = canon(L, tx, ty);
  g.fillStyle = "#2e333e";
  g.fillRect(px, py, s, s);
  // créneaux : un gros bloc par case
  fillRR(g, px + s * 0.03, py + s * 0.03, s * 0.94, s * 0.82, s * 0.07, lin(g, px, py, px, py + s, [[0, "#9ea6b2"], [0.75, "#7e8692"], [1, "#4c525e"]]));
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 2; c++) {
      const x0 = px + s * 0.06 + c * s * 0.45 + (r ? s * 0.12 : 0) - (r && c ? s * 0.24 : 0);
      const y0 = py + s * 0.07 + r * s * 0.36;
      const ww = r && c ? s * 0.33 : s * 0.42;
      fillRR(g, x0, y0, ww, s * 0.32, s * 0.03, shade("#959daa", (hash(tx + c, ty + r, 5) - 0.5) * 0.15));
      line(g, [x0 + s * 0.02, y0 + s * 0.02, x0 + ww - s * 0.02, y0 + s * 0.02], "rgba(255,255,255,0.35)", Math.max(0.8, s * 0.014));
    }
  strokeRR(g, px + s * 0.03, py + s * 0.03, s * 0.94, s * 0.82, s * 0.07, "#151922", Math.max(1, s * 0.03));
  if (isGate(tx, ty)) {
    // porte voûtée avec herse et lueur chaude
    fillRR(g, px + s * 0.16, py + s * 0.12, s * 0.68, s * 0.74, s * 0.34, "#140d08");
    fillRR(g, px + s * 0.24, py + s * 0.3, s * 0.52, s * 0.56, s * 0.26, rad(g, px + s / 2, py + s * 0.75, 0, s * 0.45, [[0, "rgba(255,170,70,0.85)"], [1, "rgba(120,40,10,0.2)"]]));
    for (let k = 0; k < 4; k++) line(g, [px + s * (0.3 + k * 0.13), py + s * 0.22, px + s * (0.3 + k * 0.13), py + s * 0.86], "#2a2a30", Math.max(1, s * 0.03));
    strokeRR(g, px + s * 0.16, py + s * 0.12, s * 0.68, s * 0.74, s * 0.34, "#c8b28a", Math.max(1.2, s * 0.045));
  } else if (ringTorch(tx, ty)) {
    fillRR(g, px + s * 0.44, py + s * 0.34, s * 0.12, s * 0.26, s * 0.03, "#3a2a1a");
    g.save();
    g.globalCompositeOperation = "lighter";
    circle(g, px + s / 2, py + s * 0.3, s * 0.55, rad(g, px + s / 2, py + s * 0.3, 0, s * 0.55, [[0, "rgba(255,170,70,0.45)"], [1, "rgba(255,120,40,0)"]]));
    g.restore();
    ellipse(g, px + s / 2, py + s * 0.24, s * 0.08, s * 0.14, "#ff8a2a");
    ellipse(g, px + s / 2, py + s * 0.27, s * 0.045, s * 0.08, "#ffe680");
  } else if (hash(cx, cy, 8) < 0.3) {
    for (let k = 0; k < 3; k++) ellipse(g, px + s * (0.25 + k * 0.22), py + s * 0.08, s * 0.1, s * 0.05, k % 2 ? "#5e9a45" : "#78b856");
  }
}

function labFarHD(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const d = hash(tx, ty, 71);
  // sol de jungle
  g.fillStyle = (tx + ty) % 2 ? "#163a28" : "#18402b";
  g.fillRect(px - 0.5, py - 0.5, s + 1, s + 1);
  const fall = (Math.abs(tx - (LW - 1) / 2) === 2 && (ty < 0 || ty > LH - 1)) || (Math.abs(ty - (LH - 1) / 2) === 3 && (tx < 0 || tx > LW - 1));
  if (fall || d < 0.08) {
    // cascade lumineuse
    g.fillStyle = lin(g, px, py, px + s, py, [[0, "#0e5c86"], [0.5, "#41d2ff"], [1, "#0e5c86"]]);
    g.fillRect(px + s * 0.1, py - 0.5, s * 0.8, s + 1);
    for (let k = 0; k < 4; k++) line(g, [px + s * (0.2 + k * 0.2), py, px + s * (0.2 + k * 0.2), py + s], "rgba(220,250,255,0.55)", Math.max(1, s * 0.03));
    ellipse(g, px + s / 2, py + s * 0.85, s * 0.45, s * 0.14, "rgba(230,250,255,0.5)");
    return;
  }
  if (d < 0.5) {
    // palmier vu de dessus, feuilles ombrées
    const x = px + s * (0.4 + hash(tx, ty, 2) * 0.2);
    const y = py + s * (0.4 + hash(tx, ty, 3) * 0.2);
    ellipse(g, x + s * 0.12, y + s * 0.14, s * 0.55, s * 0.4, "rgba(0,0,0,0.3)");
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + d * 9;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(s * 0.3, -s * 0.16, s * 0.62, 0);
      g.quadraticCurveTo(s * 0.3, s * 0.16, 0, 0);
      g.fillStyle = lin(g, 0, 0, s * 0.62, 0, [[0, "#2c7a34"], [1, k % 2 ? "#5cc04a" : "#4aa83e"]]);
      g.fill();
      line(g, [s * 0.05, 0, s * 0.58, 0], "rgba(20,60,20,0.6)", Math.max(0.8, s * 0.015));
      g.restore();
    }
    circle(g, x, y, s * 0.08, "#7a5228");
  } else if (d < 0.66) {
    ellipse(g, px + s * 0.55, py + s * 0.62, s * 0.42, s * 0.28, "rgba(0,0,0,0.3)");
    ellipse(g, px + s * 0.5, py + s * 0.55, s * 0.4, s * 0.28, lin(g, px, py + s * 0.3, px, py + s * 0.8, [[0, "#8a909a"], [1, "#4a4f58"]]));
    ellipse(g, px + s * 0.42, py + s * 0.45, s * 0.15, s * 0.06, "rgba(255,255,255,0.25)");
  } else if (d < 0.78) {
    for (let k = 0; k < 5; k++) circle(g, px + s * (0.2 + hash(tx, k, ty) * 0.6), py + s * (0.2 + hash(k, ty, tx) * 0.6), s * 0.05, ["#ff7aa8", "#ffd84a", "#c58bff", "#ffffff", "#ff9a3a"][k]);
  }
}

export const LABYRINTH_HD: Art = {
  id: "labyrinth",
  version: () => spriteVersion,
  background: "#12301f",
  ink: "#151922",
  farVeil: "rgba(4, 12, 10, 0.42)",
  floor: labFloorHD,
  border: (g, px, py, s, tx, ty, ring) => (ring ? labRingHD(g, px, py, s, tx, ty) : labFarHD(g, px, py, s, tx, ty)),
  terrain: (g, kind, px, py, s, tx, ty) => {
    if (kind !== TERRAIN.WATER) return;
    const im = img("water");
    if (im) g.drawImage(im, px, py, s, s);
    else labWaterHD(g, px, py, s, tx, ty);
  },
  animate: (ctx, kind, px, py, s, tx, ty, t) => {
    if (kind !== TERRAIN.WATER) return;
    // reflets mouvants
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < 2; k++) {
      const ph = (t * 0.25 + hash(tx, ty, k) + k * 0.5) % 1;
      const y = py + s * (0.15 + ph * 0.7);
      ctx.strokeStyle = `rgba(160,235,255,${0.28 * Math.sin(ph * Math.PI)})`;
      ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.beginPath();
      ctx.moveTo(px + s * 0.15, y);
      ctx.quadraticCurveTo(px + s * 0.35, y - s * 0.05, px + s * 0.5, y);
      ctx.quadraticCurveTo(px + s * 0.65, y + s * 0.05, px + s * 0.85, y);
      ctx.stroke();
    }
    ctx.restore();
  },
  pillar: (ctx, px, py, s, tx, ty) => {
    const kind = labInnerWall(tx, ty) ? labWallKind(tx, ty) : "plain";
    const [cx, cy] = canon(L, tx, ty);
    // murs de mort subite (hors plan) : pierre simple
    const key = kind === "plain" || kind === "torch" || kind === "glyph" || kind === "moss" ? `lab-wall-${kind}-${cx}-${cy}` : `lab-${kind}`;
    // murs simples (et murs de mort subite) : même principe que le mur à torche
    const wallImg = kind === "plain" || kind === "glyph" || kind === "moss" ? img("wall") : null;
    if (wallImg) {
      cached(ctx, "lab-wall-img", px, py, s, LIFT + 0.05, 0.18, (g, ss) => {
        stoneBlock(g, ss, 1, LAB_STONE);
        const pad = ss * 0.035;
        g.drawImage(wallImg, pad, -ss * LIFT + pad, ss - pad * 2, ss - pad * 2 - ss * LIFT * 0.12);
      });
      return;
    }
    const torchImg = kind === "torch" ? img("wallTorch") : null;
    const t = now();
    const flick = 0.85 + 0.15 * Math.sin(t * 10.7 + tx * 7.1 + ty) + 0.06 * Math.sin(t * 23.3 + ty * 3.7);
    if (torchImg) {
      // corps de pierre comme les autres murs, illustration sur le dessus ; le feu est dans
      // l'image, on ajoute seulement sa lueur qui vacille
      cached(ctx, "lab-wallTorch-img", px, py, s, LIFT + 0.05, 0.18, (g, ss) => {
        stoneBlock(g, ss, 1, LAB_STONE);
        const pad = ss * 0.035;
        g.drawImage(torchImg, pad, -ss * LIFT + pad, ss - pad * 2, ss - pad * 2 - ss * LIFT * 0.12);
      });
      glow(ctx, px + s / 2, py + s / 2 - s * LIFT * 1.1, s * 0.5 * flick, "255,150,60", 0.5);
      return;
    }
    const altarImg = kind === "altar" ? img("altar") : null;
    if (altarImg) {
      // l'autel : un monument qui dépasse de sa case (image 256×384)
      cached(ctx, "lab-altar-img", px, py, s, 1.0, 0.18, (g, ss) => {
        ellipse(g, ss * 0.56, ss * 0.86, ss * 0.46, ss * 0.16, "rgba(0,0,0,0.4)");
        const w = ss * 1.25;
        const h = w * 1.5;
        g.drawImage(altarImg, (ss - w) / 2, ss * 0.97 - h, w, h);
      });
      glow(ctx, px + s / 2, py + s * 0.97 - s * 1.25 * 1.5 * 0.8, s * 0.8 * flick, "255,150,60", 0.55);
      return;
    }
    cached(ctx, key, px, py, s, LIFT + 0.05, 0.18, (g, ss) => labWallSprite(g, ss, tx, ty, kind));
    const top = py - s * LIFT + s * 0.035;
    const hTop = s - s * 0.07 - s * LIFT * 0.12;
    if (kind === "torch") flame(ctx, px + s / 2, top + hTop * 0.47, s, tx * 3 + ty);
    else if (kind === "altar") flame(ctx, px + s / 2, top + hTop * 0.53, s, 7, 1.7);
  },
  block: (ctx, px, py, s, tx, ty) => {
    const [cx, cy] = canon(L, tx, ty);
    const h = hash(cx, cy, 5);
    // illustration si elle est chargée, sinon dessin par code
    const draw = (id: string, round: boolean, scale: number, fallbackKey: string, fallback: (g: Ctx, ss: number) => void) => {
      const im = img(id);
      if (im) cached(ctx, `lab-${id}-img`, px, py, s, LIFT + 0.05, 0.18, (g, ss) => illustrated(g, ss, im, round, scale));
      else cached(ctx, fallbackKey, px, py, s, LIFT + 0.05, 0.18, fallback);
    };
    if (h < 0.58) draw("crate", false, 0.9, `lab-crate-${Math.floor(h * 4)}`, (g, ss) => labCrateSprite(g, ss, Math.floor(h * 4)));
    else if (h < 0.78) draw("barrel", true, 0.9, "lab-barrel", labBarrelSprite);
    else draw("bush", true, 0.94, `lab-hedge-${cx}-${cy}`, (g, ss) => labHedgeSprite(g, ss, cx * 13 + cy));
  },
  debris: (tx, ty) => {
    const [cx, cy] = canon(L, tx, ty);
    const h = hash(cx, cy, 5);
    return h < 0.78 ? ["#e39a52", "#9c5a26", "#c87c3c"] : ["#3f8a3a", "#1f5a24", "#e8c840"];
  },
  eruption: ["#ffcf4a", "#ff5a1f"],
};

// outils partagés avec les autres cartes dessinées en détail (ex. maps-factory.ts)
export { cached, glow, softShadow, fillRR, strokeRR, circle, ellipse, lin, rad, line, shade, canon, path, labCrateSprite as crateSprite };
