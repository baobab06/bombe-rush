/**
 * Vignettes des objets (cartes de boutique / collection).
 * Chaque type d'objet sait se dessiner tout seul à partir du catalogue.
 */
import { RARITY_LABEL } from "../core/characters";
import { getEmote, getTrail } from "../core/cosmetics";
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
