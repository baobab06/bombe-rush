/**
 * 🎄 Calendrier de l'Avent (fenêtre) + neige sur l'accueil pendant la saison de Noël.
 * Règles et cadeaux : meta/advent.ts.
 */
import { audio } from "../audio/audio";
import { ADVENT, adventInfo, adventOpened, claimAdvent } from "../meta/advent";
import type { AppCtx } from "./ctx";
import { cellOf } from "./pass-ui";
import { showGranted } from "./rewards";
import { getBoom, getEmote } from "../core/cosmetics";
import { getItem } from "../meta/catalog";
import type { Reward } from "../meta/progress-config";
import { drawCharacter, lookOf } from "../render/bodies";
import { drawBomb } from "../render/sprites";
import { drawChest } from "../ui/chest-art";

const $ = (id: string) => document.getElementById(id)!;

/** Neige qui tombe sur l'accueil (CSS seulement, aucun coût en jeu). */
export function setSnow(on: boolean) {
  const box = $("snowfall");
  box.hidden = !on;
  if (!on || box.childElementCount) return;
  const flakes = ["❄", "❅", "•", "❆", "•"];
  for (let i = 0; i < 34; i++) {
    const f = document.createElement("i");
    f.textContent = flakes[i % flakes.length];
    f.style.left = `${(i * 37) % 100}%`;
    f.style.fontSize = `${1.6 + ((i * 13) % 5) * 0.7}cqh`;
    f.style.animationDuration = `${7 + ((i * 7) % 9)}s, ${2.5 + (i % 4)}s`;
    f.style.animationDelay = `${-((i * 1.7) % 12)}s, ${-(i % 3)}s`;
    f.style.opacity = String(0.45 + ((i * 11) % 5) * 0.1);
    box.appendChild(f);
  }
}

export class AdventUI {
  constructor(
    private ctx: AppCtx,
    private onChange: () => void,
  ) {}

  /** Bouton de l'accueil : visible pendant la saison, pastille s'il y a une case à ouvrir. */
  renderButton() {
    const info = adventInfo(this.ctx.profile);
    const b = $("btnAdvent");
    b.hidden = !info.season;
    $("adventDot").hidden = !info.claimable.length;
    $("adventDot").textContent = String(info.claimable.length);
    $("adventSub").textContent = info.open ? (info.day <= 24 ? `Jour ${info.day}` : "Rattrape !") : info.startsIn ? `J-${info.startsIn}` : "Joyeux Noël";
    setSnow(info.season);
  }

  open() {
    const p = this.ctx.profile;
    const info = adventInfo(p);
    const got = adventOpened(p, info.year);
    this.ctx.modal.open((sheet, close) => {
      sheet.classList.add("advent-sheet");
      const left = 24 - got.length;
      const head = info.open
        ? `<span class="av-chip">🎁 <b>${got.length}</b> / 24 ouverts</span><span class="av-hint">${info.claimable.length ? `${info.claimable.length} cadeau${info.claimable.length > 1 ? "x" : ""} à ouvrir !` : info.day < 24 ? "Reviens demain pour le suivant 🎅" : left ? "Rattrape tes cadeaux jusqu'au 31 !" : "Joyeux Noël ! 🎄"}</span>`
        : `<span class="av-chip">⏳ Ouverture dans <b>${info.startsIn}</b> jour${info.startsIn > 1 ? "s" : ""}</span><span class="av-hint">Un cadeau par jour du 1er au 24 décembre</span>`;
      sheet.insertAdjacentHTML(
        "beforeend",
        `<div class="av-lights" aria-hidden="true">${Array.from({ length: 22 }, (_, i) => `<i style="--d:${(i % 5) * 0.3}s"></i>`).join("")}</div>
        <div class="av-snow" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="left:${(i * 53) % 100}%;animation-delay:${-((i * 1.3) % 9)}s;animation-duration:${6 + (i % 5)}s">❄</i>`).join("")}</div>
        <div class="av-hills" aria-hidden="true"></div>
        <header class="av-head"><h2>Calendrier de l'Avent</h2><div class="av-sub">${head}</div></header>
        <div class="avent-grid" id="adventGrid"></div>`,
      );
      const grid = sheet.querySelector<HTMLElement>("#adventGrid")!;
      ADVENT.forEach((r, i) => {
        const n = i + 1;
        const done = got.includes(n);
        const can = info.claimable.includes(n);
        const hero = n === 24;
        const special = r.kind === "theme" || r.kind === "item";
        const b = document.createElement("button");
        b.className = `ad-gift w${n % 6}${done ? " done" : ""}${can ? " can" : ""}${hero ? " hero" : ""}${special ? " special" : ""}${n === info.day ? " today" : ""}`;
        b.setAttribute("aria-label", `Jour ${n}`);
        const label = rewardLabel(r);
        b.innerHTML = `<span class="ad-box"><span class="ad-rib-v"></span><span class="ad-rib-h"></span></span>
          <span class="ad-lid"><span class="ad-rib-v"></span><span class="ad-bow"><i></i><i></i><b></b></span></span>
          <span class="ad-tag">${n}</span>
          <span class="ad-in"></span>
          <span class="ad-cap">${done ? "✓ Ouvert" : can ? "OUVRE !" : label}</span>
          ${n === info.day && !done ? '<span class="ad-today">AUJOURD\'HUI</span>' : ""}`;
        const inside = b.querySelector<HTMLElement>(".ad-in")!;
        // l'aperçu du cadeau : visible dans les boîtes ouvertes et la grande boîte du 24
        if (done || hero || special) inside.appendChild(rewardArt(r, hero ? 132 : 68));
        b.addEventListener("click", () => {
          if (!can) {
            audio.play("tab");
            this.ctx.toast(done ? "Déjà ouvert ✓" : info.open ? `🔒 À ouvrir le ${n} décembre` : "🎄 Ouverture le 1er décembre", "bad");
            b.classList.remove("nope");
            void b.offsetWidth;
            b.classList.add("nope");
            return;
          }
          if (b.classList.contains("opening")) return;
          this.ctx.click();
          const res = claimAdvent(this.ctx.profile, n);
          if (!res) return;
          this.ctx.persist();
          audio.play("unlock");
          // la boîte s'ouvre (couvercle qui saute, confettis), puis la récompense
          if (!inside.childElementCount) inside.appendChild(rewardArt(r, 68));
          b.classList.add("opening");
          b.insertAdjacentHTML("beforeend", `<span class="ad-burst">${Array.from({ length: 12 }, (_, k) => `<i style="--a:${k * 30}deg;--c:${["#ffd23f", "#ff4d6d", "#4cc9f0", "#8ae65a"][k % 4]}"></i>`).join("")}</span>`);
          window.setTimeout(() => {
            this.ctx.wallet.countTo();
            close();
            showGranted(this.ctx, `🎁 Jour ${n}`, res, {});
            this.renderButton();
            this.onChange();
          }, 900);
        });
        grid.appendChild(b);
      });
    });
  }
}

/** Petit texte sous la boîte. */
function rewardLabel(r: Reward): string {
  switch (r.kind) {
    case "coins":
      return `${r.amount} pièces`;
    case "bombers":
      return `${r.amount} bombers`;
    case "chest":
      return cellOf(r).lb;
    case "theme":
      return r.id === "pere-noel" ? "Skin Père Noël" : "Skin Bonhomme";
    case "item": {
      const it = getItem(r.id);
      return it?.kind === "emote" ? `Emote ${getEmote(r.id)?.emoji ?? ""}` : it?.kind === "boom" ? "Bombe-cadeau" : it?.kind === "title" ? "Titre" : it?.kind === "accessory" ? "Bonnet de Noël" : "Surprise";
    }
    default:
      return cellOf(r).lb;
  }
}

/** Dessin de la récompense : perso en skin de Noël, bombe, coffre, pièces… */
function rewardArt(r: Reward, size: number): HTMLElement {
  const box = document.createElement("span");
  box.className = "ad-art";
  const canvas = (draw: (g: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement("canvas");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = Math.round(size * dpr);
    cv.style.width = cv.style.height = `${size}px`;
    const g = cv.getContext("2d")!;
    g.scale(dpr, dpr);
    draw(g);
    box.appendChild(cv);
  };
  const pose = { faceX: 0, faceY: 1, walk: 0, moving: false, t: 0.3, expr: "happy" as const };
  switch (r.kind) {
    case "theme":
      canvas((g) => drawCharacter(g, size / 2, size * 0.66, size * 0.86, lookOf("renard", `renard-${r.id}`), pose));
      break;
    case "item": {
      const it = getItem(r.id);
      if (it?.kind === "accessory") canvas((g) => drawCharacter(g, size / 2, size * 0.68, size * 0.84, lookOf("renard", undefined, r.id), pose));
      else if (it?.kind === "boom") canvas((g) => drawBomb(g, size / 2, size * 0.55, size * 1.25, 1, 0.4, 5, 9, 0.55, getBoom(r.id).bomb));
      else if (it?.kind === "emote") box.innerHTML = `<em class="ad-emo">${getEmote(r.id)?.emoji ?? "🎉"}</em>`;
      else box.innerHTML = `<em class="ad-title">« ${it?.name ?? ""} »</em>`;
      break;
    }
    case "chest":
      canvas((g) => drawChest(g, size / 2, size * 0.86, size * 0.72, r.tier, { t: 0.3 }));
      break;
    case "coins":
      box.innerHTML = `<i class="coin big"></i>`;
      break;
    case "bombers":
      box.innerHTML = `<i class="bomber big"></i>`;
      break;
    default:
      box.innerHTML = `<em class="ad-emo">${cellOf(r).ic}</em>`;
  }
  return box;
}
