/** Bulle d'emote (jeu et menus). (bx, by) = pointe de la bulle, s = taille de case. */
import type { EmoteDef } from "../core/cosmetics";

export const EMOTE_DURATION = 2.2;
export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

export function drawEmoteBubble(ctx: CanvasRenderingContext2D, bx: number, by: number, s: number, def: EmoteDef, age: number, loop = false) {
  const DUR = EMOTE_DURATION;
  const pop = age < 0.18 ? 0.3 + (age / 0.18) * 0.85 : age < 0.3 ? 1.15 - ((age - 0.18) / 0.12) * 0.15 : 1;
  const fade = loop ? 1 : age > DUR - 0.3 ? Math.max(0, (DUR - age) / 0.3) : 1;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(bx, by);
  ctx.scale(pop, pop);
  const w = s * 0.86;
  const hh = s * 0.72;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.roundRect(-w / 2, -hh / 2 + s * 0.05, w, hh, s * 0.24);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#1a1626";
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.roundRect(-w / 2, -hh / 2, w, hh, s * 0.24);
  ctx.moveTo(-s * 0.1, hh / 2 - 1);
  ctx.lineTo(0, hh / 2 + s * 0.16);
  ctx.lineTo(s * 0.1, hh / 2 - 1);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(-s * 0.09, hh / 2 - s * 0.05, s * 0.18, s * 0.06);
  let ey = 0;
  let rot = 0;
  let sx = 1;
  switch (def.anim) {
    case "bounce":
      ey = -Math.abs(Math.sin(age * 9)) * s * 0.08;
      break;
    case "shake":
      rot = Math.sin(age * 22) * 0.25 * (loop ? 1 : Math.max(0, 1 - age / 1.4));
      break;
    case "spin":
      sx = Math.cos(age * 7);
      break;
    default:
      ey = Math.sin(age * 6) * s * 0.02;
  }
  ctx.translate(0, ey);
  ctx.rotate(rot);
  ctx.scale(Math.abs(sx) < 0.15 ? 0.15 : sx, 1);
  ctx.font = `${Math.round(s * 0.48)}px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000";
  ctx.fillText(def.emoji, 0, s * 0.03);
  ctx.restore();
}
