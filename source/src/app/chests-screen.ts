/**
 * Écran COFFRES : réserve de coffres gagnés en jouant, aperçu du contenu
 * possible (probabilités), puis ouverture animée.
 * Le contenu est tiré ET sauvegardé avant l'animation.
 */
import { audio } from "../audio/audio";
import { RARITY_LABEL, RARITY_ORDER } from "../core/characters";
import { chestPool, openChest } from "../meta/grants";
import { CHESTS, CHEST_ORDER, DUPLICATE_COINS, type ChestTier } from "../meta/progress-config";
import { owns } from "../meta/store";
import { haptics } from "../platform/haptics";
import { fmt, type AppCtx } from "./ctx";
import { grantCard } from "./rewards";

export const chestArt = (tier: ChestTier, extra = "") => `<span class="chest-art c-${tier} ${extra}"><i class="lid"></i><i class="box"></i><i class="lock"></i></span>`;

export class ChestsScreen {
  constructor(private ctx: AppCtx, private onChange: () => void) {}

  render() {
    const p = this.ctx.profile;
    const body = document.getElementById("chestBody")!;
    body.innerHTML = "";
    const row = document.createElement("div");
    row.className = "chest-row";
    for (const t of CHEST_ORDER) {
      const n = p.chests[t] ?? 0;
      const d = CHESTS[t];
      const card = document.createElement("div");
      card.className = `chest-card panel c-${t}${n ? " has" : ""}`;
      card.dataset.tier = t;
      card.innerHTML = `${chestArt(t, n ? "wobble" : "")}<b>${d.name}</b><span class="chest-n">× ${n}</span>`;
      const open = document.createElement("button");
      open.className = "btn small " + (n ? "btn-yellow" : "btn-ghost");
      open.innerHTML = `<span>${n ? "OUVRIR" : "CONTENU"}</span>`;
      open.addEventListener("click", () => {
        this.ctx.click();
        this.preview(t);
      });
      card.appendChild(open);
      row.appendChild(card);
    }
    body.appendChild(row);
    body.insertAdjacentHTML(
      "beforeend",
      `<div class="chest-how panel"><b>Comment gagner des coffres ?</b>
        <span>⬆️ Monter de niveau (niv. 3, 5, 8, 10…)</span><span>📅 7e jour de connexion</span><span>🎯 Missions de la semaine</span>
        <span>🎖️ Maîtrise des personnages</span><span>🏅 Succès et nouveaux rangs</span><span>🔥 Série de 10 victoires</span>
        <em>Les coffres ne s'achètent pas : ils se gagnent uniquement en jouant. Un objet déjà possédé est remplacé par des pièces.</em></div>`,
    );
  }

  /** Aperçu : pièces, nombre d'objets, probabilités par rareté. */
  preview(tier: ChestTier) {
    const p = this.ctx.profile;
    const d = CHESTS[tier];
    const n = p.chests[tier] ?? 0;
    this.ctx.modal.open((sheet, close) => {
      const odds = RARITY_ORDER.filter((r) => d.odds[r] > 0)
        .map((r) => {
          const pool = chestPool(p, r);
          const left = pool.filter((i) => !owns(p, i.id)).length;
          return `<li class="r-${r}"><b>${RARITY_LABEL[r]}</b><span>${d.odds[r]} %</span><small>${left}/${pool.length} à découvrir · doublon = ${fmt(DUPLICATE_COINS[r])} 🪙</small></li>`;
        })
        .join("");
      sheet.insertAdjacentHTML(
        "beforeend",
        `<h2>${d.name}</h2>
        <div class="chest-prev">${chestArt(tier, "wobble")}
          <div><p class="sub">Contient toujours <b>${fmt(d.coins[0])} à ${fmt(d.coins[1])} pièces</b> + <b>${d.drops} objet${d.drops > 1 ? "s" : ""}</b> :</p><ul class="odds">${odds}</ul></div></div>`,
      );
      const actions = document.createElement("div");
      actions.className = "sheet-actions";
      const b = document.createElement("button");
      b.className = "btn " + (n ? "btn-yellow" : "btn-ghost");
      b.id = "btnOpenChest";
      b.disabled = !n;
      b.innerHTML = n ? `<span>OUVRIR (${n})</span>` : "<span>Tu n'en as pas encore</span>";
      b.addEventListener("click", () => {
        close();
        this.open(tier);
      });
      actions.appendChild(b);
      sheet.appendChild(actions);
    });
  }

  open(tier: ChestTier) {
    const p = this.ctx.profile;
    const before = p.coins;
    const res = openChest(p, tier);
    if (!res) return;
    // sauvegarde AVANT l'animation : recharger ne relance pas le tirage
    this.ctx.persist();
    this.onChange();
    this.render();
    this.ctx.modal.open(
      (sheet, close) => {
        sheet.insertAdjacentHTML("beforeend", `<h2>${CHESTS[tier].name}</h2>`);
        const stageEl = document.createElement("div");
        stageEl.className = "chest-open";
        stageEl.innerHTML = chestArt(tier, "shake");
        sheet.appendChild(stageEl);
        const row = document.createElement("div");
        row.className = "grant-row";
        row.hidden = true;
        sheet.appendChild(row);
        const actions = document.createElement("div");
        actions.className = "sheet-actions";
        const ok = document.createElement("button");
        ok.className = "btn btn-yellow";
        ok.id = "btnChestOk";
        ok.innerHTML = "<span>SUPER !</span>";
        ok.hidden = true;
        ok.addEventListener("click", () => {
          this.ctx.click();
          close();
        });
        const again = document.createElement("button");
        again.className = "btn btn-blue";
        again.hidden = true;
        again.innerHTML = "<span>EN OUVRIR UN AUTRE</span>";
        again.addEventListener("click", () => {
          close();
          this.open(tier);
        });
        actions.append(ok, again);
        sheet.appendChild(actions);
        audio.play("whoosh");
        let done = false;
        const reveal = () => {
          if (done) return;
          done = true;
          const art = stageEl.querySelector(".chest-art")!;
          art.classList.remove("shake");
          art.classList.add("burst");
          audio.play("unlock");
          haptics.pulse(40);
          const c = this.ctx.fx.center(stageEl);
          this.ctx.fx.confetti(c.x, c.y, tier === "legend" ? 120 : 60, tier === "legend" ? 1.4 : 1);
          this.ctx.fx.sparkle(c.x, c.y, 24, CHESTS[tier].color);
          window.setTimeout(() => {
            stageEl.classList.add("small");
            row.hidden = false;
            const coinG = { reward: { kind: "coins" as const, amount: res.coins }, label: `+${fmt(res.coins)} pièces`, icon: "🪙", coins: res.coins };
            [coinG, ...res.items].forEach((g, i) => {
              const card = grantCard(g, this.ctx);
              card.style.animationDelay = `${0.1 + i * 0.25}s`;
              row.appendChild(card);
            });
            const gained = res.coins + res.items.reduce((a, g) => a + g.coins, 0);
            this.ctx.wallet.earn(this.ctx.fx, row, gained, before);
            ok.hidden = false;
            again.hidden = !(p.chests[tier] > 0);
          }, 450);
        };
        stageEl.addEventListener("click", reveal);
        window.setTimeout(reveal, 1300);
      },
      { closable: false, onClose: () => this.render(), cls: "grant-sheet" },
    );
  }
}
