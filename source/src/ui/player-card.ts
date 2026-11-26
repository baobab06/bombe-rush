/**
 * CARTE JOUEUR : une image à partager (TikTok, WhatsApp…) avec ton perso,
 * ton rang et tes meilleures stats. Dessinée sur un canvas 900 × 1200.
 */
import { CHARACTERS } from "../core/characters";
import { getTitle } from "../core/cosmetics";
import { advStars } from "../meta/adventure";
import { masteryOf } from "../meta/mastery";
import type { Profile } from "../meta/profile";
import { rankProgress } from "../meta/rank";
import { countOwned, equippedSkin } from "../meta/store";
import { drawCharacter, lookOf } from "../render/bodies";

export const CARD_W = 900;
export const CARD_H = 1200;
const INK = "#120d36";
const DISPLAY = '"Dela Gothic One", "Arial Black", Impact, sans-serif';
const UI = '"Baloo 2", "Trebuchet MS", system-ui, sans-serif';

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

/** Personnage le plus joué (maîtrise). */
export function favoriteCharacter(p: Profile): { id: string; name: string; games: number; level: number } {
  let best = { id: p.characterId, name: "", games: -1, level: 1 };
  for (const c of CHARACTERS) {
    const m = masteryOf(p, c.id);
    if (m.games > best.games) best = { id: c.id, name: c.name, games: m.games, level: m.level };
  }
  if (!best.name) best.name = CHARACTERS.find((c) => c.id === best.id)?.name ?? "";
  return best;
}

function outlined(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, font = DISPLAY, align: CanvasTextAlign = "center", stroke = 0.16) {
  g.save();
  g.font = `${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.fillStyle = "rgba(0,0,0,.35)";
  g.fillText(text, x, y + size * 0.1);
  g.strokeStyle = INK;
  g.lineWidth = size * stroke;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
  g.restore();
}

function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient, stroke?: string, lw = 6) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

export function drawPlayerCard(cv: HTMLCanvasElement, p: Profile, t = 0.4) {
  cv.width = CARD_W;
  cv.height = CARD_H;
  const g = cv.getContext("2d")!;
  const W = CARD_W;
  const H = CARD_H;
  const rp = rankProgress(p.rank.points);
  const rc = rp.rank.color;
  // cadre aux couleurs du rang
  const frame = g.createLinearGradient(0, 0, W, H);
  frame.addColorStop(0, "#fff6c9");
  frame.addColorStop(0.35, rc);
  frame.addColorStop(1, INK);
  round(g, 0, 0, W, H, 70, frame);
  // fond intérieur
  const bg = g.createLinearGradient(0, 30, 0, H);
  bg.addColorStop(0, "#3b2fb0");
  bg.addColorStop(0.55, "#221a6e");
  bg.addColorStop(1, "#140f45");
  round(g, 26, 26, W - 52, H - 52, 52, bg, INK, 8);
  g.save();
  g.beginPath();
  g.roundRect(26, 26, W - 52, H - 52, 52);
  g.clip();
  // rayons derrière le perso
  g.save();
  g.translate(W / 2, 400);
  g.fillStyle = "rgba(255,255,255,0.07)";
  for (let i = 0; i < 16; i++) {
    g.rotate((Math.PI * 2) / 16);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-70, -900);
    g.lineTo(70, -900);
    g.fill();
  }
  g.restore();
  const halo = g.createRadialGradient(W / 2, 420, 30, W / 2, 420, 330);
  halo.addColorStop(0, "rgba(255,230,140,0.55)");
  halo.addColorStop(1, "rgba(255,230,140,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, W, 800);
  // étoiles
  g.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 40; i++) {
    const x = (i * 197) % W;
    const y = 60 + ((i * 131) % 640);
    g.beginPath();
    g.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // logo
  g.font = `74px ${DISPLAY}`;
  const wB = g.measureText("BOMBE").width;
  const wR = g.measureText("RUSH").width;
  const x0 = W / 2 - (wB + 26 + wR) / 2;
  outlined(g, "BOMBE", x0, 110, 74, "#ffffff", DISPLAY, "left");
  outlined(g, "RUSH", x0 + wB + 26, 110, 74, "#ffd23f", DISPLAY, "left");
  // socle + perso
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.ellipse(W / 2, 640, 230, 52, 0, 0, Math.PI * 2);
  g.fill();
  const ped = g.createLinearGradient(0, 590, 0, 660);
  ped.addColorStop(0, "#7d86e8");
  ped.addColorStop(1, "#3c4196");
  g.fillStyle = ped;
  g.beginPath();
  g.ellipse(W / 2, 615, 210, 46, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = rc;
  g.lineWidth = 8;
  g.stroke();
  drawCharacter(g, W / 2, 470, 440, lookOf(p.characterId, equippedSkin(p, p.characterId), p.equipped.accessory), { faceX: 0, faceY: 1, walk: 0, moving: false, t, expr: "happy", celebrate: true }, INK);

  // pseudo, titre, niveau
  outlined(g, p.name, W / 2, 730, 78, "#ffffff");
  const title = getTitle(p.equipped.title)?.name;
  if (title) {
    g.font = `800 34px ${UI}`;
    const tw = g.measureText(title).width + 60;
    round(g, W / 2 - tw / 2, 782, tw, 52, 26, "rgba(255,210,63,0.95)", INK, 5);
    g.fillStyle = INK;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(title, W / 2, 810);
  }
  // niveau (pastille) et rang
  round(g, 70, 170, 150, 150, 75, "#5aa0ff", INK, 8);
  outlined(g, String(p.level), 145, 238, 70, "#ffffff");
  g.font = `800 26px ${UI}`;
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.fillText("NIVEAU", 145, 296);
  round(g, W - 230, 170, 160, 150, 40, rc, INK, 8);
  g.font = `72px ${UI}`;
  g.fillText(rp.rank.icon, W - 150, 232);
  g.font = `800 26px ${UI}`;
  g.fillStyle = INK;
  g.fillText(rp.step.name, W - 150, 290);

  // stats
  const fav = favoriteCharacter(p);
  const stats: [string, string][] = [
    [fmt(p.played), "Parties"],
    [fmt(p.wins), "Victoires"],
    [p.played ? `${Math.round((p.wins / p.played) * 100)}%` : "–", "Victoires %"],
    [fmt(p.kills), "Éliminations"],
    [String(Math.max(p.stats.bestWinStreak, p.winStreak)), "Meilleure série"],
    [`${advStars(p)}⭐`, "Aventure"],
  ];
  const cw = (W - 140) / 3;
  stats.forEach(([v, l], i) => {
    const x = 70 + (i % 3) * cw;
    const y = 870 + Math.floor(i / 3) * 120;
    round(g, x + 8, y, cw - 16, 104, 26, "rgba(255,255,255,0.1)", "rgba(255,255,255,0.25)", 3);
    outlined(g, v, x + cw / 2, y + 42, 46, "#ffe27a");
    g.font = `800 24px ${UI}`;
    g.fillStyle = "#d9d6ff";
    g.textAlign = "center";
    g.fillText(l, x + cw / 2, y + 84);
  });
  // perso préféré + collection
  const cc = countOwned(p);
  g.font = `800 28px ${UI}`;
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.fillText(`❤️ Perso préféré : ${fav.name} (maîtrise ${fav.level})   ·   🎒 Collection ${Math.round((cc.owned / Math.max(1, cc.total)) * 100)} %`, W / 2, 1118);
  outlined(g, "Joue avec moi ! Gratuit sur Google Play", W / 2, 1160, 28, "#ffd23f", UI, "center", 0.12);
}
