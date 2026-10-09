/**
 * Vignettes des objets (cartes de boutique / collection).
 * Chaque type d'objet sait se dessiner tout seul à partir du catalogue.
 */
import { RARITY_LABEL } from "../core/characters";
import { getBoom, getEmote, getTitle, getTrail } from "../core/cosmetics";
import { fmt } from "../app/ctx";
import { icon } from "./icons";
import type { CatalogItem } from "../meta/catalog";
import { EMOJI_FONT } from "../render/emote";
import { Particles } from "../render/particles";
import { drawPortrait } from "./thumbs";

export interface Wearer {
  characterId: string;
  skinId?: string;
}

/** Dessine l'illustration d'un objet dans un canvas (taille interne fixe). */
export function drawItemArt(cv: HTMLCanvasElement, item: CatalogItem, wearer: Wearer) {
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  switch (item.kind) {
    case "skin":
      drawPortrait(cv, item.characterId!, item.id, 1, 1.3, null, 0.9);
      break;
    case "character":
      drawPortrait(cv, item.characterId!, undefined, 1, 1.3, null, 0.9);
      break;
    case "accessory":
      drawPortrait(cv, wearer.characterId, wearer.skinId, 1, 1.3, item.id, 0.9);
      break;
    case "trail":
      drawTrailArt(cv, item.id);
      break;
    case "boom":
      drawBoomArt(cv, item.id);
      break;
    case "title":
      drawTitleArt(cv, item.id, item.rarity);
      break;
    case "emote": {
      const e = getEmote(item.id)!;
      const W0 = cv.width;
      const H0 = cv.height;
      const m = Math.min(W0, H0);
      const ox = (W0 - m) / 2;
      const oy = (H0 - m) / 2;
      ctx.translate(ox, oy);
      const w = m;
      const h = m;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#1a1626";
      ctx.lineWidth = w * 0.035;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.roundRect(w * 0.14, h * 0.14, w * 0.72, h * 0.6, w * 0.2);
      ctx.moveTo(w * 0.42, h * 0.735);
      ctx.lineTo(w * 0.5, h * 0.88);
      ctx.lineTo(w * 0.58, h * 0.735);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(w * 0.43, h * 0.7, w * 0.14, h * 0.05);
      ctx.font = `${Math.round(w * 0.4)}px ${EMOJI_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#000";
      ctx.fillText(e.emoji, w / 2, h * 0.455);
      break;
    }
  }
}

/** Explosion : une déflagration figée à ses couleurs. */
function drawBoomArt(cv: HTMLCanvasElement, id: string) {
  const d = getBoom(id);
  const ctx = cv.getContext("2d")!;
  const w = cv.width;
  const h = cv.height;
  const s = Math.min(w, h) * 0.42;
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, s * 1.05);
  g.addColorStop(0, d.glow);
  g.addColorStop(0.35, d.spark[0]);
  g.addColorStop(0.7, d.ring);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = s * (i % 2 ? 0.62 : 1);
    ctx.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  const P = new Particles();
  const sc = s / 1.3;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 0.75 + (i % 3) * 0.18;
    const kind = d.extra === "confetti" ? "confetti" : d.extra === "snow" ? "flake" : d.extra === "hearts" ? "heart" : d.extra === "bubbles" ? "bubble" : "twinkle";
    P.spawn(i % 2 ? kind : "twinkle", w / 2 / sc + Math.cos(a) * r, h / 2 / sc + Math.sin(a) * r, { life: 1, size: 0.13, color: d.spark[i % d.spark.length], rot: i });
  }
  P.update(0.3);
  P.draw(ctx, 0, 0, sc);
}

/** Titre : une banderole avec le texte. */
function drawTitleArt(cv: HTMLCanvasElement, id: string, rarity: string) {
  const t = getTitle(id);
  const ctx = cv.getContext("2d")!;
  const w = cv.width;
  const h = cv.height;
  const col: Record<string, [string, string]> = { common: ["#c9d6e3", "#8296ab"], rare: ["#6cc0ff", "#2a78c9"], epic: ["#c993ff", "#7a35c9"], legend: ["#ffe17a", "#d99a16"] };
  const [a, b] = col[rarity] ?? col.common;
  const bw = w * 0.86;
  const bh = h * 0.3;
  const x = (w - bw) / 2;
  const y = h * 0.36;
  ctx.fillStyle = b;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.04, y + bh * 0.25);
  ctx.lineTo(x + w * 0.08, y + bh * 0.25);
  ctx.lineTo(x + w * 0.08, y + bh * 1.2);
  ctx.lineTo(x - w * 0.04, y + bh * 1.2);
  ctx.lineTo(x + w * 0.02, y + bh * 0.72);
  ctx.closePath();
  ctx.moveTo(x + bw + w * 0.04, y + bh * 0.25);
  ctx.lineTo(x + bw - w * 0.08, y + bh * 0.25);
  ctx.lineTo(x + bw - w * 0.08, y + bh * 1.2);
  ctx.lineTo(x + bw + w * 0.04, y + bh * 1.2);
  ctx.lineTo(x + bw - w * 0.02, y + bh * 0.72);
  ctx.closePath();
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + bh);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.strokeStyle = "#1a1626";
  ctx.lineWidth = w * 0.025;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, bh * 0.3);
  ctx.fill();
  ctx.stroke();
  const text = (t?.name ?? "Titre").toUpperCase();
  let fs = bh * 0.5;
  ctx.font = `800 ${fs}px "Baloo 2", system-ui, sans-serif`;
  while (ctx.measureText(text).width > bw * 0.88 && fs > 6) {
    fs -= 1;
    ctx.font = `800 ${fs}px "Baloo 2", system-ui, sans-serif`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = fs * 0.22;
  ctx.strokeStyle = "#1a1626";
  ctx.strokeText(text, w / 2, y + bh * 0.54);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, w / 2, y + bh * 0.54);
}

/** Effet : une arabesque de particules à ses couleurs. */
function drawTrailArt(cv: HTMLCanvasElement, id: string) {
  const def = getTrail(id);
  const ctx = cv.getContext("2d")!;
  const w = cv.width;
  const h = cv.height;
  const s = w * 0.42;
  // trace de fond
  const g = ctx.createLinearGradient(w * 0.1, h * 0.8, w * 0.9, h * 0.2);
  def.colors.forEach((c, i) => g.addColorStop(def.colors.length > 1 ? i / (def.colors.length - 1) : 0, c));
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = g;
  ctx.lineCap = "round";
  ctx.lineWidth = w * 0.13;
  ctx.beginPath();
  ctx.moveTo(w * 0.14, h * 0.78);
  ctx.quadraticCurveTo(w * 0.45, h * 0.86, w * 0.84, h * 0.24);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const P = new Particles();
  const kindOf: Record<string, Parameters<Particles["spawn"]>[0]> = {
    dust: "smoke", sparks: "twinkle", leaves: "leaf", bubbles: "bubble", snow: "flake", hearts: "heart", fire: "ember",
    bolts: "bolt", notes: "note", rainbow: "glow", stardust: "twinkle",
  };
  const kind = kindOf[def.kind] ?? "twinkle";
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    const x = 0.14 + k * 0.7;
    const y = 0.78 - k * 0.5 + Math.sin(k * 6) * 0.06;
    const size = kind === "smoke" ? 0.1 : kind === "glow" ? 0.12 : kind === "bolt" ? 0.22 : 0.13;
    P.spawn(kind, (x * w) / s, (y * h) / s, { life: 1, size: size * (0.75 + k * 0.4), color: def.colors[i % def.colors.length], rot: i * 0.7 });
  }
  P.update(0.5);
  P.draw(ctx, 0, 0, s);
}

// ------------------------------------------------------------ cartes DOM

export interface CardState {
  owned: boolean;
  equipped?: boolean;
  price?: number;
  fullPrice?: number;
  deal?: boolean;
  affordable?: boolean;
  /** texte sous le nom (ex. personnage du skin) */
  sub?: string;
  isNew?: boolean;
  /** objet pas encore possédé : vignette assombrie + cadenas */
  dim?: boolean;
  big?: boolean;
}

/** Carte d'objet (boutique, collection, vestiaire). */
export function itemCard(item: CatalogItem, st: CardState, wearer: Wearer): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "item" + (st.owned ? " owned" : st.dim === false ? "" : " locked") + (st.equipped ? " equipped" : "") + (st.big ? " big" : "");
  b.dataset.r = item.rarity;
  b.dataset.id = item.id;
  b.setAttribute("aria-label", `${item.name} — ${RARITY_LABEL[item.rarity]}`);
  const art = document.createElement("span");
  art.className = "art";
  const cv = document.createElement("canvas");
  cv.width = st.big ? 300 : 150;
  cv.height = st.big ? 194 : 150;
  art.appendChild(cv);
  b.appendChild(art);
  b.insertAdjacentHTML("beforeend", `<span class="rar">${RARITY_LABEL[item.rarity]}</span>`);
  if (!st.owned && st.dim !== false) b.insertAdjacentHTML("beforeend", `<span class="lock">${icon("lock")}</span>`);
  if (st.equipped) b.insertAdjacentHTML("beforeend", `<span class="eq">${icon("check")}</span>`);
  if (st.deal && !st.owned) b.insertAdjacentHTML("beforeend", `<span class="deal">PROMO</span>`);
  if (st.isNew && !st.owned && !st.deal) b.insertAdjacentHTML("beforeend", `<span class="new">NOUVEAU</span>`);
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = item.name;
  b.appendChild(name);
  if (st.sub) {
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = st.sub;
    b.appendChild(sub);
  }
  if (st.owned) b.insertAdjacentHTML("beforeend", `<span class="price owned">${st.equipped ? "ÉQUIPÉ" : "POSSÉDÉ"}</span>`);
  else if (st.price !== undefined)
    b.insertAdjacentHTML(
      "beforeend",
      `<span class="price${st.affordable === false ? " poor" : ""}"><i class="coin"></i>${st.deal && st.fullPrice ? `<s>${fmt(st.fullPrice)}</s>` : ""}${fmt(st.price)}</span>`,
    );
  drawItemArt(cv, item, wearer);
  return b;
}
