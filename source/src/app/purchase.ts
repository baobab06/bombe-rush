/**
 * Achat d'un objet : confirmation → débit animé → grande révélation
 * (rayons, confettis, « DÉBLOQUÉ ! ») → proposition d'équiper.
 */
import { audio } from "../audio/audio";
import { RARITY_LABEL } from "../core/characters";
import { getItem } from "../meta/catalog";
import { buy, equip, equippedSkin, priceOf } from "../meta/store";
import { haptics } from "../platform/haptics";
import { itemCard } from "../ui/items";
import { RARITY_COLOR } from "../ui/stage";
import { fmt, type AppCtx } from "./ctx";

export function confirmPurchase(ctx: AppCtx, id: string, onDone: (equipped: boolean) => void) {
  const item = getItem(id);
  if (!item) return;
  const p = ctx.profile;
  const { price, full, deal } = priceOf(id);
  ctx.modal.open((sheet, close) => {
    sheet.insertAdjacentHTML("beforeend", `<h2>Acheter ?</h2>`);
    const box = document.createElement("div");
    box.className = "buy";
    const card = itemCard(item, { owned: false, dim: false, price, fullPrice: full, deal }, { characterId: p.characterId, skinId: equippedSkin(p, p.characterId) });
    box.appendChild(card);
    const right = document.createElement("div");
    right.innerHTML = `<p>${RARITY_LABEL[item.rarity]} · ${item.desc || ""}</p>
      <div class="cost"><i class="coin"></i>${deal ? `<s style="opacity:.6;font-size:.6em">${fmt(full)}</s>` : ""}${fmt(price)}</div>
      <p>Il te restera <b style="color:#fff">${fmt(p.coins - price)}</b> pièces.</p>`;
    const actions = document.createElement("div");
    actions.className = "sheet-actions";
    const no = document.createElement("button");
    no.className = "btn btn-ghost";
    no.innerHTML = "<span>Annuler</span>";
    no.addEventListener("click", () => {
      ctx.click();
      close();
    });
    const yes = document.createElement("button");
    yes.className = "btn btn-green";
    yes.innerHTML = `<span>ACHETER</span>`;
    yes.addEventListener("click", () => {
      const before = p.coins;
      const r = buy(p, id);
      if (!r.ok) {
        audio.play("deny");
        ctx.toast(r.reason === "coins" ? `Il te manque ${fmt(r.missing ?? 0)} pièces` : "Achat impossible", "bad");
        close();
        return;
      }
      ctx.persist();
      audio.play("buy");
      haptics.pulse(30);
      close();
      ctx.wallet.countTo(p.coins, 500);
      void before;
      reveal(ctx, id, onDone);
    });
    actions.append(no, yes);
    right.appendChild(actions);
    box.appendChild(right);
    sheet.appendChild(box);
  });
}

/** Grande révélation de l'objet débloqué. */
export function reveal(ctx: AppCtx, id: string, onDone: (equipped: boolean) => void) {
  const item = getItem(id)!;
  const p = ctx.profile;
  const app = document.getElementById("app")!;
  const ov = document.createElement("div");
  ov.className = "reveal";
  ov.style.setProperty("--rc", RARITY_COLOR[item.rarity]);
  ov.innerHTML = `<div class="rays"></div>`;
  const box = document.createElement("div");
  box.className = "reveal-box";
  box.innerHTML = `<h2>DÉBLOQUÉ !</h2>`;
  const card = itemCard(item, { owned: true }, { characterId: item.kind === "skin" ? item.characterId! : p.characterId, skinId: equippedSkin(p, p.characterId) });
  card.classList.add("big");
  card.querySelector(".price")?.remove();
  box.appendChild(card);
  const actions = document.createElement("div");
  actions.className = "sheet-actions";
  const later = document.createElement("button");
  later.className = "btn btn-ghost";
  later.innerHTML = "<span>Continuer</span>";
  const eq = document.createElement("button");
  eq.className = "btn btn-blue";
  eq.innerHTML = "<span>ÉQUIPER</span>";
  const finish = (doEquip: boolean) => {
    ctx.click();
    if (doEquip) {
      equip(p, id);
      ctx.persist();
      ctx.lookChanged();
      audio.play("equip");
    }
    ov.remove();
    onDone(doEquip);
  };
  later.addEventListener("click", () => finish(false));
  eq.addEventListener("click", () => finish(true));
  actions.append(later, eq);
  box.appendChild(actions);
  ov.appendChild(box);
  app.appendChild(ov);
  audio.play("unlock");
  window.setTimeout(() => {
    const c = ctx.fx.center(card);
    ctx.fx.confetti(c.x, c.y, item.rarity === "legend" ? 110 : 70, 1.2);
    ctx.fx.sparkle(c.x, c.y, 20, RARITY_COLOR[item.rarity]);
  }, 380);
}
