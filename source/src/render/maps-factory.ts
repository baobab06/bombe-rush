/**
 * Rendu de la carte USINE (Domination), d'après la planche de référence :
 * usine moderne vue de dessus, style cartoon industriel coloré.
 *
 * Même principe que le Labyrinthe (maps-hd.ts) :
 * - le SOL (dalles d'acier, tôles, grilles, bandes de sécurité, plots de
 *   départ, étoile de capture, flaques de lumière) est cuit une fois par partie ;
 * - chaque OBSTACLE (mur d'acier, ventilation, tonneaux, machine, caisse) est
 *   dessiné une fois en détail dans un petit canvas en cache puis recopié ;
 * - seuls les éléments vivants (hélices, voyants, lampes) bougent à chaque image.
 *
 * Collisions : rien ici. Tout vient du plan (src/maps/factory.ts) : un « # »
 * bloque toujours, une caisse est un bloc destructible normal, le décor du sol
 * ne bloque jamais.
 */
import { FACTORY } from "../maps/factory";
import type { Art } from "./art";
import { LIFT, hash } from "./sprites";
import { cached, canon, circle, crateSprite, ellipse, fillRR, glow, lin, line, path, rad, shade, softShadow, strokeRR } from "./maps-hd";

type Ctx = CanvasRenderingContext2D;

const L = FACTORY.layout;
const W = L[0].length;
const H = L.length;
const CX = (W - 1) / 2;
const CY = (H - 1) / 2;
const at = (tx: number, ty: number) => L[ty]?.[tx] ?? "#";
const now = () => (typeof performance !== "undefined" ? performance.now() / 1000 : 0);
/** côté de l'équipe : -1 rouge (gauche), 1 bleu (droite), 0 milieu */
const side = (tx: number) => (tx < CX ? -1 : tx > CX ? 1 : 0);
const RED = "255,64,64";
const BLUE = "60,140,255";
const ORANGE = "255,150,40";

// ---------------------------------------------------------------- palette
const STEEL = { top: "#9aa2ae", light: "#c4cad3", side: "#59606c", dark: "#2c313a" };
const FLOOR = { a: "#3b404a", b: "#363b45", seam: "#22262e", light: "rgba(255,255,255,0.06)" };
const INK = "#12151b";

// ============================================================== murs
type WallKind = "steel" | "fan" | "barrels" | "machine";

/** Look d'un mur intérieur selon sa place (symétrique, comme le plan). */
function wallKind(tx: number, ty: number): WallKind {
  const [cx, cy] = canon(L, tx, ty);
  if (cy === CY && Math.abs(tx - CX) === 1) return "steel"; // blocs qui encadrent l'étoile
  if (cx === CX) return "machine"; // machines au-dessus / au-dessous du centre
  if (cx === 2 && cy === 2) return "fan"; // ventilations près des départs
  if (cx === 3 && cy === 4) return "barrels"; // tonneaux rouges / bleus
  if (cx === 4 && cy === 1) return "fan";
  return "steel";
}

/** Bloc d'acier en relief (face avant + dessus en tôle rivetée). */
function steelBody(g: Ctx, s: number, top: string, seed: number) {
  const lift = s * LIFT;
  const pad = s * 0.035;
  const w = s - pad * 2;
  const y0 = -lift + pad;
  const hTop = s - pad * 2 - lift * 0.12;
  softShadow(g, pad, y0 + lift * 0.4, w, s - pad - lift * 0.3, s * 0.08);
  // face avant (plus sombre, avec une bande de rainures)
  fillRR(g, pad, y0, w, s - pad - y0, s * 0.07, lin(g, 0, y0 + hTop, 0, s - pad, [[0, STEEL.side], [1, shade(STEEL.side, -0.45)]]));
  for (let k = 1; k < 4; k++) line(g, [pad + (w * k) / 4, y0 + hTop + s * 0.03, pad + (w * k) / 4, s - pad - s * 0.03], "rgba(10,12,18,0.45)", Math.max(1, s * 0.012));
  // dessus
  fillRR(g, pad, y0, w, hTop, s * 0.07, lin(g, pad, y0, pad + w * 0.6, y0 + hTop, [[0, shade(top, 0.18)], [1, shade(top, -0.08)]]));
  g.save();
  path(g, pad, y0, w, hTop, s * 0.07);
  g.clip();
  // 4 plaques
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 2; c++) {
      const x = pad + c * (w / 2);
      const y = y0 + r * (hTop / 2);
      const v = (hash(seed, r * 2 + c, 3) - 0.5) * 0.12;
      fillRR(g, x + s * 0.02, y + s * 0.02, w / 2 - s * 0.04, hTop / 2 - s * 0.04, s * 0.03, lin(g, x, y, x, y + hTop / 2, [[0, shade(top, v + 0.12)], [1, shade(top, v - 0.06)]]));
      line(g, [x + s * 0.05, y + s * 0.035, x + w / 2 - s * 0.05, y + s * 0.035], "rgba(255,255,255,0.35)", Math.max(0.8, s * 0.012));
      for (const [bx, by] of [[x + s * 0.06, y + s * 0.06], [x + w / 2 - s * 0.06, y + hTop / 2 - s * 0.06]]) {
        circle(g, bx, by, s * 0.018, "#3a3f48");
        circle(g, bx - s * 0.005, by - s * 0.005, s * 0.008, "#e2e6ec");
      }
    }
  // rayures d'usure
  if (hash(seed, 1, 9) < 0.6) line(g, [pad + w * 0.2, y0 + hTop * 0.7, pad + w * 0.45, y0 + hTop * 0.62], "rgba(255,255,255,0.18)", Math.max(0.8, s * 0.01));
  g.restore();
  fillRR(g, pad + s * 0.05, y0 + s * 0.012, w - s * 0.1, s * 0.028, s * 0.014, "rgba(255,255,255,0.4)");
  strokeRR(g, pad, y0, w, s - pad - y0, s * 0.07, INK, Math.max(1, s * 0.03));
  line(g, [pad + s * 0.03, y0 + hTop, pad + w - s * 0.03, y0 + hTop], "rgba(10,12,18,0.7)", Math.max(1, s * 0.02));
  return { pad, w, y0, hTop };
}

/** Bloc de ventilation : caisson d'acier + grille ronde (l'hélice tourne à part). */
function fanSprite(g: Ctx, s: number, seed: number) {
  const { pad, w, y0, hTop } = steelBody(g, s, "#8e96a2", seed);
  const cx = pad + w / 2;
  const cy = y0 + hTop / 2;
  const r = Math.min(w, hTop) * 0.4;
  fillRR(g, cx - r * 1.12, cy - r * 1.12, r * 2.24, r * 2.24, s * 0.05, "#4a505a");
  circle(g, cx, cy, r, rad(g, cx, cy, 0, r, [[0, "#14171d"], [1, "#262a32"]]));
  circle(g, cx, cy, r * 1.0, "rgba(0,0,0,0)");
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.strokeStyle = "#b9c0ca";
  g.lineWidth = Math.max(1.2, s * 0.03);
  g.stroke();
}
function fanBlades(ctx: Ctx, x: number, y: number, r: number, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  for (let k = 0; k < 4; k++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(r * 0.12, -r * 0.08);
    ctx.quadraticCurveTo(r * 0.7, -r * 0.42, r * 0.86, -r * 0.05);
    ctx.quadraticCurveTo(r * 0.6, r * 0.18, r * 0.12, r * 0.08);
    ctx.closePath();
    ctx.fillStyle = "#7d8592";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = Math.max(0.8, r * 0.05);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "#c9cfd8";
  ctx.fill();
  // barreaux de la grille par-dessus
  ctx.strokeStyle = "rgba(200,206,214,0.55)";
  ctx.lineWidth = Math.max(0.7, r * 0.04);
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r);
  ctx.stroke();
  ctx.restore();
}

/** Deux tonneaux cerclés (rouges côté rouge, bleus côté bleu) sur une palette. */
function barrelsSprite(g: Ctx, s: number, team: number) {
  const base = team < 0 ? "#d8313a" : team > 0 ? "#2f7fe0" : "#d8313a";
  const lift = s * LIFT;
  // palette au sol
  softShadow(g, s * 0.06, s * 0.1, s * 0.88, s * 0.82, s * 0.06, 0.38);
  fillRR(g, s * 0.06, s * 0.08, s * 0.88, s * 0.84, s * 0.04, "#6b4a2a");
  for (let k = 0; k < 4; k++) line(g, [s * 0.08, s * (0.18 + k * 0.22), s * 0.92, s * (0.18 + k * 0.22)], "rgba(30,16,6,0.55)", Math.max(1, s * 0.02));
  const one = (x: number, y: number, r: number) => {
    // corps (cylindre debout vu en plongée)
    fillRR(g, x - r, y - lift, r * 2, lift + r * 0.4, r * 0.3, lin(g, x - r, 0, x + r, 0, [[0, shade(base, -0.35)], [0.45, shade(base, 0.12)], [1, shade(base, -0.45)]]));
    // cerclages
    for (const k of [0.25, 0.75]) line(g, [x - r, y - lift + (lift + r * 0.4) * k, x + r, y - lift + (lift + r * 0.4) * k], "rgba(20,24,34,0.65)", Math.max(1, s * 0.03));
    // couvercle
    ellipse(g, x, y - lift, r, r * 0.92, lin(g, x - r, y - lift - r, x + r, y - lift + r, [[0, shade(base, 0.35)], [1, shade(base, -0.1)]]));
    g.beginPath();
    g.ellipse(x, y - lift, r * 0.78, r * 0.7, 0, 0, Math.PI * 2);
    g.strokeStyle = "rgba(20,10,10,0.35)";
    g.lineWidth = Math.max(1, s * 0.02);
    g.stroke();
    circle(g, x + r * 0.35, y - lift - r * 0.25, r * 0.12, "#2a2e36");
    ellipse(g, x - r * 0.3, y - lift - r * 0.35, r * 0.35, r * 0.14, "rgba(255,255,255,0.35)", -0.5);
    g.beginPath();
    g.ellipse(x, y - lift, r, r * 0.92, 0, 0, Math.PI * 2);
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1, s * 0.025);
    g.stroke();
  };
  one(s * 0.3, s * 0.68, s * 0.2);
  one(s * 0.7, s * 0.42, s * 0.2);
}

/** Machine industrielle jaune (presse) avec bandes de sécurité. */
function machineSprite(g: Ctx, s: number) {
  const lift = s * LIFT * 1.25;
  const pad = s * 0.05;
  const w = s - pad * 2;
  const y0 = -lift + pad;
  const hTop = s - pad * 2 - lift * 0.1;
  softShadow(g, pad, y0 + lift * 0.4, w, s - pad - lift * 0.3, s * 0.06);
  fillRR(g, pad, y0, w, s - pad - y0, s * 0.06, lin(g, 0, y0 + hTop, 0, s - pad, [[0, "#b8860f"], [1, "#6b4a06"]]));
  // bandes noir/jaune sur la face avant
  g.save();
  path(g, pad, y0 + hTop, w, s - pad - y0 - hTop, s * 0.04);
  g.clip();
  for (let k = -2; k < 8; k++) {
    g.beginPath();
    const x = pad + k * s * 0.16;
    g.moveTo(x, s);
    g.lineTo(x + s * 0.08, s);
    g.lineTo(x + s * 0.2, y0 + hTop);
    g.lineTo(x + s * 0.12, y0 + hTop);
    g.closePath();
    g.fillStyle = "rgba(20,20,20,0.75)";
    g.fill();
  }
  g.restore();
  // dessus
  fillRR(g, pad, y0, w, hTop, s * 0.06, lin(g, pad, y0, pad, y0 + hTop, [[0, "#ffd14a"], [1, "#e0a81c"]]));
  // trappe centrale grise + piston
  const ix = pad + w * 0.2;
  const iy = y0 + hTop * 0.18;
  fillRR(g, ix, iy, w * 0.6, hTop * 0.64, s * 0.04, lin(g, ix, iy, ix, iy + hTop * 0.64, [[0, "#6c737e"], [1, "#3c424c"]]));
  fillRR(g, ix + w * 0.12, iy + hTop * 0.12, w * 0.36, hTop * 0.4, s * 0.03, "#2a2f37");
  line(g, [ix + w * 0.14, iy + hTop * 0.14, ix + w * 0.46, iy + hTop * 0.14], "rgba(255,255,255,0.3)", Math.max(0.8, s * 0.012));
  // coins rivetés
  for (const [x, y] of [[pad + s * 0.07, y0 + s * 0.07], [pad + w - s * 0.07, y0 + s * 0.07], [pad + s * 0.07, y0 + hTop - s * 0.07], [pad + w - s * 0.07, y0 + hTop - s * 0.07]]) {
    circle(g, x, y, s * 0.022, "#7a5a10");
    circle(g, x - s * 0.006, y - s * 0.006, s * 0.009, "#fff2c0");
  }
  fillRR(g, pad + s * 0.05, y0 + s * 0.012, w - s * 0.1, s * 0.028, s * 0.014, "rgba(255,255,255,0.45)");
  strokeRR(g, pad, y0, w, s - pad - y0, s * 0.06, INK, Math.max(1, s * 0.03));
}

// ============================================================== sol
const isSpawn = (tx: number, ty: number) => at(tx, ty) === "S";
/** zone autour du point central entourée de bandes de sécurité */
const inCenterRing = (tx: number, ty: number) => Math.abs(tx - CX) <= 1 && Math.abs(ty - CY) <= 2;

/** Lampes du décor : [x, y, rayon (cases), couleur] (flaques de lumière cuites au sol). */
const LIGHTS: [number, number, number, string][] = [
  [CX, -0.1, 2.6, ORANGE],
  [CX, H - 0.9, 2.6, ORANGE],
  [-0.1, CY + 0.5, 2.6, RED],
  [W - 0.9, CY + 0.5, 2.6, BLUE],
  [1, 2, 1.4, RED],
  [1, H - 3, 1.4, RED],
  [W - 2, 2, 1.4, BLUE],
  [W - 2, H - 3, 1.4, BLUE],
  [CX + 0.5, CY + 0.5, 1.8, "255,200,60"],
];

function floorTile(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const [cx, cy] = canon(L, tx, ty);
  const h = hash(cx, cy, 31);
  // dalle d'acier sombre
  g.fillStyle = (tx + ty) % 2 ? FLOOR.a : FLOOR.b;
  g.fillRect(px, py, s + 0.5, s + 0.5);
  const kind = h < 0.16 ? "grate" : h < 0.4 ? "plate" : "tile";
  if (kind === "plate") {
    // tôle striée (losanges)
    fillRR(g, px + s * 0.05, py + s * 0.05, s * 0.9, s * 0.9, s * 0.04, "#555c68");
    g.save();
    path(g, px + s * 0.05, py + s * 0.05, s * 0.9, s * 0.9, s * 0.04);
    g.clip();
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) {
        const xx = px + s * (0.14 + x * 0.18) + (y % 2) * s * 0.09;
        const yy = py + s * (0.14 + y * 0.18);
        line(g, [xx - s * 0.04, yy + s * 0.025, xx + s * 0.04, yy - s * 0.025], y % 2 ? "rgba(200,206,216,0.45)" : "rgba(30,34,40,0.6)", Math.max(1, s * 0.022));
      }
    g.restore();
    strokeRR(g, px + s * 0.05, py + s * 0.05, s * 0.9, s * 0.9, s * 0.04, "rgba(15,18,24,0.7)", Math.max(1, s * 0.02));
  } else if (kind === "grate") {
    // grille métallique (on voit le vide dessous)
    fillRR(g, px + s * 0.08, py + s * 0.08, s * 0.84, s * 0.84, s * 0.03, "#15181e");
    for (let k = 0; k < 6; k++) {
      line(g, [px + s * (0.15 + k * 0.14), py + s * 0.1, px + s * (0.15 + k * 0.14), py + s * 0.9], "#5d6470", Math.max(1, s * 0.03));
    }
    line(g, [px + s * 0.1, py + s * 0.5, px + s * 0.9, py + s * 0.5], "#6b7380", Math.max(1, s * 0.04));
    strokeRR(g, px + s * 0.08, py + s * 0.08, s * 0.84, s * 0.84, s * 0.03, "#7a828e", Math.max(1, s * 0.03));
  } else {
    // dalle : 4 carreaux, joints, quelques rivets et taches
    for (let k = 0; k < 2; k++) {
      line(g, [px + s / 2, py, px + s / 2, py + s], FLOOR.seam, Math.max(1, s * 0.02));
      line(g, [px, py + s / 2, px + s, py + s / 2], FLOOR.seam, Math.max(1, s * 0.02));
    }
    line(g, [px + s * 0.03, py + s * 0.03, px + s * 0.47, py + s * 0.03], FLOOR.light, Math.max(1, s * 0.02));
    line(g, [px + s * 0.53, py + s * 0.53, px + s * 0.97, py + s * 0.53], FLOOR.light, Math.max(1, s * 0.02));
    if (h > 0.8) ellipse(g, px + s * (0.3 + hash(tx, ty, 2) * 0.4), py + s * (0.3 + hash(tx, ty, 3) * 0.4), s * 0.16, s * 0.1, "rgba(10,12,16,0.25)");
    if (h > 0.6 && h < 0.7) line(g, [px + s * 0.6, py + s * 0.2, px + s * 0.72, py + s * 0.34, px + s * 0.68, py + s * 0.42], "rgba(10,12,16,0.4)", Math.max(1, s * 0.012));
  }
  // joint de bord de case
  g.strokeStyle = "rgba(10,12,16,0.55)";
  g.lineWidth = Math.max(1, s * 0.02);
  g.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}

/** Bandes jaunes et noires (sur un rectangle en cases). */
function hazardFrame(g: Ctx, x: number, y: number, w: number, h: number, s: number) {
  const b = s * 0.16;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.rect(x + b, y + b, w - b * 2, h - b * 2);
  g.clip("evenodd");
  g.fillStyle = "#f2b81c";
  g.fillRect(x, y, w, h);
  g.fillStyle = "#16181d";
  for (let k = -h; k < w + h; k += s * 0.3) {
    g.beginPath();
    g.moveTo(x + k, y + h);
    g.lineTo(x + k + s * 0.15, y + h);
    g.lineTo(x + k + s * 0.15 + h, y);
    g.lineTo(x + k + h, y);
    g.closePath();
    g.fill();
  }
  g.restore();
}

function star(g: Ctx, x: number, y: number, r: number, fill: string) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

/** Lumière douce posée sur le sol (cuite). */
function pool(g: Ctx, x: number, y: number, r: number, rgb: string, a: number) {
  g.save();
  g.globalCompositeOperation = "lighter";
  g.fillStyle = rad(g, x, y, 0, r, [[0, `rgba(${rgb},${a})`], [1, `rgba(${rgb},0)`]]);
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}

function factoryFloor(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  floorTile(g, px, py, s, tx, ty);
  // plots de départ : carré lumineux rouge (gauche) / bleu (droite)
  if (isSpawn(tx, ty)) {
    const rgb = side(tx) < 0 ? RED : BLUE;
    fillRR(g, px + s * 0.08, py + s * 0.08, s * 0.84, s * 0.84, s * 0.06, `rgba(${rgb},0.35)`);
    strokeRR(g, px + s * 0.1, py + s * 0.1, s * 0.8, s * 0.8, s * 0.05, `rgb(${rgb})`, Math.max(1.5, s * 0.05));
    strokeRR(g, px + s * 0.2, py + s * 0.2, s * 0.6, s * 0.6, s * 0.04, "rgba(255,255,255,0.55)", Math.max(1, s * 0.02));
  }
  // dernière case de la carte : on pose le décor qui couvre plusieurs cases
  if (tx === W - 2 && ty === H - 2) overlay(g, s);
}

/** Décor du sol à cheval sur plusieurs cases (bandes, étoile, lumières). */
function overlay(g: Ctx, s: number) {
  // bandes de sécurité autour de la zone centrale (3 × 5 cases)
  hazardFrame(g, (CX - 1) * s + s * 0.06, (CY - 2) * s + s * 0.06, s * 3 - s * 0.12, s * 5 - s * 0.12, s);
  // bandes devant les machines du haut et du bas
  for (const y of [2, H - 3]) {
    fillRR(g, (CX - 1) * s, y * s + (y < CY ? -s * 0.12 : s * 0.88), s * 3, s * 0.24, s * 0.04, "#f2b81c");
  }
  // étoile de capture au centre
  const x = (CX + 0.5) * s;
  const y = (CY + 0.5) * s;
  circle(g, x, y, s * 0.47, rad(g, x, y, s * 0.1, s * 0.47, [[0, "#ffe27a"], [0.7, "#f5a516"], [1, "#a8620a"]]));
  g.beginPath();
  g.arc(x, y, s * 0.47, 0, Math.PI * 2);
  g.strokeStyle = "#5a3404";
  g.lineWidth = Math.max(1.2, s * 0.04);
  g.stroke();
  g.beginPath();
  g.arc(x, y, s * 0.38, 0, Math.PI * 2);
  g.strokeStyle = "rgba(255,245,200,0.8)";
  g.lineWidth = Math.max(1, s * 0.025);
  g.stroke();
  star(g, x + s * 0.02, y + s * 0.04, s * 0.26, "rgba(90,50,4,0.5)");
  star(g, x, y, s * 0.26, "#fff3b0");
  // flaques de lumière des lampes
  for (const [lx, ly, r, rgb] of LIGHTS) pool(g, (lx + 0.5) * s, (ly + 0.5) * s, r * s, rgb, rgb === "255,200,60" ? 0.22 : 0.28);
}

// ============================================================== bordure
const isCorner = (tx: number, ty: number) => (tx === 0 || tx === W - 1) && (ty === 0 || ty === H - 1);

/** Anneau de l'arène : murs techniques avec tuyaux, cuves, lampes et portes d'équipe. */
function factoryRing(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const vertical = tx === 0 || tx === W - 1;
  const [cx, cy] = canon(L, tx, ty);
  // socle
  g.fillStyle = "#1d2129";
  g.fillRect(px, py, s + 0.5, s + 0.5);
  fillRR(g, px + s * 0.03, py + s * 0.03, s * 0.94, s * 0.88, s * 0.06, lin(g, px, py, px, py + s, [[0, "#5a616d"], [1, "#2d323b"]]));
  if (isCorner(tx, ty)) {
    // grosse cuve ronde
    const x = px + s / 2;
    const y = py + s * 0.46;
    circle(g, x + s * 0.05, y + s * 0.07, s * 0.44, "rgba(0,0,0,0.4)");
    circle(g, x, y, s * 0.44, lin(g, x - s * 0.44, 0, x + s * 0.44, 0, [[0, "#3a3f48"], [0.45, "#8a929e"], [1, "#2a2e36"]]));
    circle(g, x, y, s * 0.3, rad(g, x - s * 0.08, y - s * 0.08, 0, s * 0.3, [[0, "#b9c0ca"], [1, "#5c636e"]]));
    for (const a of [0, 1.57, 3.14, 4.71]) circle(g, x + Math.cos(a + 0.78) * s * 0.36, y + Math.sin(a + 0.78) * s * 0.36, s * 0.03, "#1d2129");
    fillRR(g, x - s * 0.1, y + s * 0.18, s * 0.2, s * 0.08, s * 0.02, "#ff5a3a");
    return;
  }
  // porte d'équipe au milieu des côtés gauche / droit
  if (vertical && cy === CY) {
    const rgb = side(tx) < 0 ? RED : BLUE;
    fillRR(g, px + s * 0.18, py + s * 0.1, s * 0.64, s * 0.76, s * 0.06, "#0c0e12");
    fillRR(g, px + s * 0.24, py + s * 0.16, s * 0.52, s * 0.64, s * 0.04, rad(g, px + s / 2, py + s / 2, 0, s * 0.5, [[0, `rgba(${rgb},0.95)`], [1, `rgba(${rgb},0.25)`]]));
    for (let k = 0; k < 4; k++) line(g, [px + s * 0.26, py + s * (0.24 + k * 0.15), px + s * 0.74, py + s * (0.24 + k * 0.15)], "rgba(10,10,14,0.55)", Math.max(1, s * 0.03));
    strokeRR(g, px + s * 0.18, py + s * 0.1, s * 0.64, s * 0.76, s * 0.06, "#c6ccd6", Math.max(1, s * 0.035));
    return;
  }
  // lampe orange au milieu du haut et du bas
  if (!vertical && cx === CX) {
    fillRR(g, px - s * 0.4, py + s * 0.3, s * 1.8, s * 0.32, s * 0.12, "#101216");
    fillRR(g, px - s * 0.34, py + s * 0.36, s * 1.68, s * 0.2, s * 0.1, lin(g, 0, py + s * 0.36, 0, py + s * 0.56, [[0, "#ffd27a"], [0.5, "#ff7a1a"], [1, "#d8400c"]]));
    return;
  }
  // tuyaux le long du mur (rouge à gauche, bleu à droite, alternés en haut/bas)
  const pipe = vertical ? (side(tx) < 0 ? "#c8323a" : "#2c74d8") : cx % 2 ? "#c8323a" : "#2c74d8";
  const r = s * 0.11;
  if (vertical) {
    const x = px + s * (tx === 0 ? 0.36 : 0.64);
    fillRR(g, x - r, py - 1, r * 2, s + 2, r, lin(g, x - r, 0, x + r, 0, [[0, shade(pipe, -0.4)], [0.4, shade(pipe, 0.25)], [1, shade(pipe, -0.5)]]));
    if (cy % 2) fillRR(g, x - r * 1.35, py + s * 0.42, r * 2.7, s * 0.16, s * 0.03, "#7f8794");
  } else {
    const y = py + s * (ty === 0 ? 0.42 : 0.58);
    fillRR(g, px - 1, y - r, s + 2, r * 2, r, lin(g, 0, y - r, 0, y + r, [[0, shade(pipe, -0.4)], [0.4, shade(pipe, 0.25)], [1, shade(pipe, -0.5)]]));
    if (cx % 2) fillRR(g, px + s * 0.42, y - r * 1.35, s * 0.16, r * 2.7, s * 0.03, "#7f8794");
  }
  // petite grille d'aération sur certaines cases
  if (hash(cx, cy, 17) < 0.35) {
    const vx = px + s * (vertical ? (tx === 0 ? 0.68 : 0.18) : 0.2);
    const vy = py + s * (vertical ? 0.2 : ty === 0 ? 0.68 : 0.12);
    fillRR(g, vx, vy, s * 0.24, s * 0.18, s * 0.02, "#14171d");
    for (let k = 0; k < 3; k++) line(g, [vx + s * 0.03, vy + s * (0.045 + k * 0.05), vx + s * 0.21, vy + s * (0.045 + k * 0.05)], "#6b7380", Math.max(0.8, s * 0.015));
  }
}

/** Au-delà de l'arène : hall d'usine sombre (dalles, tuyaux, cuves). */
function factoryFar(g: Ctx, px: number, py: number, s: number, tx: number, ty: number) {
  const d = hash(tx, ty, 71);
  g.fillStyle = (tx + ty) % 2 ? "#20242c" : "#1d2028";
  g.fillRect(px - 0.5, py - 0.5, s + 1, s + 1);
  line(g, [px, py + s / 2, px + s, py + s / 2], "rgba(0,0,0,0.3)", Math.max(1, s * 0.02));
  if (d < 0.18) {
    const x = px + s / 2;
    const y = py + s / 2;
    circle(g, x, y, s * 0.42, lin(g, x - s * 0.42, 0, x + s * 0.42, 0, [[0, "#2a2e36"], [0.5, "#6d7480"], [1, "#22262e"]]));
    circle(g, x, y, s * 0.26, "#4a515c");
  } else if (d < 0.4) {
    const col = d < 0.29 ? "#9a2a30" : "#25569c";
    fillRR(g, px - 1, py + s * 0.38, s + 2, s * 0.24, s * 0.12, col);
    line(g, [px, py + s * 0.43, px + s, py + s * 0.43], "rgba(255,255,255,0.18)", Math.max(1, s * 0.02));
  } else if (d < 0.5) {
    fillRR(g, px + s * 0.15, py + s * 0.15, s * 0.7, s * 0.7, s * 0.05, "#3a3020");
    line(g, [px + s * 0.2, py + s * 0.2, px + s * 0.8, py + s * 0.8], "#5a4a2a", Math.max(1, s * 0.05));
    line(g, [px + s * 0.8, py + s * 0.2, px + s * 0.2, py + s * 0.8], "#5a4a2a", Math.max(1, s * 0.05));
  }
}

// ============================================================== Art
export const FACTORY_HD: Art = {
  id: "factory",
  background: "#1a1d24",
  ink: INK,
  farVeil: "rgba(5, 7, 12, 0.5)",
  floor: factoryFloor,
  border: (g, px, py, s, tx, ty, ring) => (ring ? factoryRing(g, px, py, s, tx, ty) : factoryFar(g, px, py, s, tx, ty)),
  terrain: () => {},
  pillar: (ctx, px, py, s, tx, ty) => {
    const inner = tx > 0 && ty > 0 && tx < W - 1 && ty < H - 1 && at(tx, ty) === "#";
    // murs de mort subite (hors plan) : bloc d'acier
    const kind: WallKind = inner ? wallKind(tx, ty) : "steel";
    const [cx, cy] = canon(L, tx, ty);
    if (kind === "fan") {
      cached(ctx, `fac-fan-${cx}-${cy}`, px, py, s, LIFT + 0.05, 0.18, (g, ss) => fanSprite(g, ss, cx * 7 + cy));
      const pad = s * 0.035;
      const top = py - s * LIFT + pad;
      const hTop = s - pad * 2 - s * LIFT * 0.12;
      const r = Math.min(s - pad * 2, hTop) * 0.4;
      fanBlades(ctx, px + s / 2, top + hTop / 2, r * 0.95, now() * 6 + tx);
      return;
    }
    if (kind === "barrels") {
      cached(ctx, `fac-barrels-${side(tx)}`, px, py, s, LIFT + 0.25, 0.18, (g, ss) => barrelsSprite(g, ss, side(tx)));
      return;
    }
    if (kind === "machine") {
      cached(ctx, "fac-machine", px, py, s, LIFT * 1.25 + 0.05, 0.18, machineSprite);
      // voyant qui clignote
      const on = Math.sin(now() * 5 + tx) > 0;
      const lx = px + s * 0.82;
      const ly = py - s * LIFT * 1.25 + s * 0.14;
      circle(ctx, lx, ly, s * 0.045, on ? "#ff4a3a" : "#5a1a14");
      if (on) glow(ctx, lx, ly, s * 0.3, RED, 0.5);
      return;
    }
    cached(ctx, `fac-steel-${cx}-${cy}`, px, py, s, LIFT + 0.05, 0.18, (g, ss) => steelBody(g, ss, STEEL.top, cx * 5 + cy * 3));
  },
  block: (ctx, px, py, s, tx, ty) => {
    const [cx, cy] = canon(L, tx, ty);
    const v = Math.floor(hash(cx, cy, 5) * 4);
    cached(ctx, `fac-crate-${v}`, px, py, s, LIFT + 0.05, 0.18, (g, ss) => crateSprite(g, ss, v));
  },
  debris: () => ["#e39a52", "#9c5a26", "#c87c3c"],
  eruption: ["#ffcf4a", "#ff5a1f"],
};
