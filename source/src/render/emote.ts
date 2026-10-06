/** Bulle d'emote (jeu et menus). (bx, by) = pointe de la bulle, s = taille de case. */
import type { EmoteDef } from "../core/cosmetics";

export const EMOTE_DURATION = 2.2;
export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

export function drawEmoteBubble(ctx: CanvasRenderingContext2D, bx: number, by: number, s: number, def: EmoteDef, age: number, loop = false, captionBelow = false) {
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
  if (def.taunt) tauntCaption(ctx, def.name, captionBelow ? hh / 2 + s * 0.36 : -hh / 2 - s * 0.2, s, age, loop);
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
    case "laugh":
      ey = -Math.abs(Math.sin(age * 16)) * s * 0.05;
      rot = Math.sin(age * 30) * 0.12;
      break;
    case "dance":
      rot = Math.sin(age * 8) * 0.35;
      ey = -Math.abs(Math.cos(age * 8)) * s * 0.07;
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

/** Étiquette rouge « moquerie » au-dessus de la bulle (texte de l'emote). */
function tauntCaption(ctx: CanvasRenderingContext2D, text: string, y: number, s: number, age: number, loop: boolean) {
  const fs = Math.max(9, Math.round(s * 0.26));
  ctx.save();
  ctx.font = `900 ${fs}px "Baloo 2","Fredoka",system-ui,sans-serif`;
  const tw = ctx.measureText(text).width;
  const w = tw + fs * 1.1;
  const h = fs * 1.45;
  const wob = loop ? 0 : Math.sin(age * 14) * 0.06 * Math.max(0, 1 - age / 0.8);
  ctx.translate(0, y);
  ctx.rotate(-0.05 + wob);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2 + fs * 0.12, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = "#ff3d6e";
  ctx.strokeStyle = "#1a1626";
  ctx.lineWidth = Math.max(1.2, s * 0.04);
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, fs * 0.06);
  ctx.restore();
}
