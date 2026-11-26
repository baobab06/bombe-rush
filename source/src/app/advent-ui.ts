/**
 * 🎄 Calendrier de l'Avent (fenêtre) + neige sur l'accueil pendant la saison de Noël.
 * Règles et cadeaux : meta/advent.ts.
 */
import { audio } from "../audio/audio";
import { ADVENT, adventInfo, adventOpened, claimAdvent } from "../meta/advent";
import type { AppCtx } from "./ctx";
import { cellOf } from "./pass-ui";
import { showGranted } from "./rewards";

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
      const head = info.open
        ? `<p class="sub">Un cadeau par jour jusqu'au 24 décembre. Tu as raté un jour ? Rattrape-le jusqu'au 31 !</p>`
        : `<p class="sub">Ouverture le <b>1er décembre</b>${info.startsIn ? ` (dans ${info.startsIn} jour${info.startsIn > 1 ? "s" : ""})` : ""}. Voici les cadeaux qui t'attendent :</p>`;
      sheet.insertAdjacentHTML("beforeend", `<h2>🎄 Calendrier de l'Avent</h2>${head}<div class="avent-grid" id="adventGrid"></div>`);
      const grid = sheet.querySelector<HTMLElement>("#adventGrid")!;
      ADVENT.forEach((r, i) => {
        const n = i + 1;
        const c = cellOf(r);
        const done = got.includes(n);
        const can = info.claimable.includes(n);
        const big = n === 24 || n % 6 === 0;
        const b = document.createElement("button");
        b.className = `ad-door${done ? " done" : ""}${can ? " can" : ""}${big ? " big" : ""}${n === info.day ? " today" : ""}`;
        b.innerHTML = `<span class="ad-n">${n}</span><span class="ad-ic">${done || !info.open || can ? c.ic : "🔒"}</span><span class="ad-lb">${done ? "✓" : c.lb}</span>`;
        b.addEventListener("click", () => {
          if (!can) {
            audio.play("tab");
            this.ctx.toast(done ? "Déjà ouvert ✓" : info.open ? `🔒 À ouvrir le ${n} décembre` : "🎄 Ouverture le 1er décembre", "bad");
            return;
          }
          this.ctx.click();
          const res = claimAdvent(this.ctx.profile, n);
          if (!res) return;
          this.ctx.persist();
          this.ctx.wallet.countTo();
          close();
          showGranted(this.ctx, `🎁 Jour ${n}`, res, {});
          this.renderButton();
          this.onChange();
        });
        grid.appendChild(b);
      });
    });
  }
}
