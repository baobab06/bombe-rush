/**
 * BANQUE (onglet « Bombers » de la boutique) : packs en argent réel
 * (Google Play), échange bombers → pièces, annonce de la nouvelle monnaie.
 */
import { audio } from "../audio/audio";
import { creditPurchase, exchange, grantBomberGift, isCredited } from "../meta/bank";
import { EXCHANGES, PACKS, type PackDef } from "../meta/economy";
import { billing } from "../platform/billing";
import { haptics } from "../platform/haptics";
import { icon } from "../ui/icons";
import { fmt, type AppCtx } from "./ctx";
import { showGranted } from "./rewards";

const money = (cur: "coins" | "bombers") => (cur === "coins" ? '<i class="coin"></i>' : '<i class="bomber"></i>');

/** Grille de la banque (remplace la grille d'objets quand l'onglet est ouvert). */
export function renderBank(ctx: AppCtx, grid: HTMLElement, refresh: () => void) {
  grid.innerHTML = "";
  const section = (title: string, note: string) => {
    const h = document.createElement("div");
    h.className = "featured-head";
    h.style.gridColumn = "1 / -1";
    h.innerHTML = `<b>${title}</b><span>${note}</span>`;
    grid.appendChild(h);
  };
  const store = billing.enabled ? "· paiement sécurisé par Google Play" : "· disponible dans l'appli Android (Google Play)";
  section("Bombers 💣", store);
  const cards = new Map<string, HTMLElement>();
  for (const pk of PACKS.filter((x) => x.currency === "bombers")) cards.set(pk.id, packCard(ctx, pk, refresh));
  cards.forEach((c) => grid.appendChild(c));
  section("Pièces", store);
  for (const pk of PACKS.filter((x) => x.currency === "coins")) {
    const c = packCard(ctx, pk, refresh);
    cards.set(pk.id, c);
    grid.appendChild(c);
  }
  section("Échanger des bombers", "· contre des pièces, tout de suite");
  for (const x of EXCHANGES) grid.appendChild(exchangeCard(ctx, x, refresh));

  // vrais prix (devise du joueur) renvoyés par Google Play
  if (billing.enabled) {
    void billing.products().then((list) => {
      for (const pr of list) {
        const el = cards.get(pr.id)?.querySelector<HTMLElement>(".pk-price span");
        if (el && pr.price) el.textContent = pr.price;
      }
    });
  }
}

function packCard(ctx: AppCtx, pk: PackDef, refresh: () => void): HTMLElement {
  const el = document.createElement("button");
  el.className = `item pack pk-${pk.currency}`;
  el.dataset.r = pk.currency === "bombers" ? (pk.amount >= 1200 ? "legend" : pk.amount >= 500 ? "epic" : "rare") : "common";
  const stack = Math.min(4, 1 + PACKS.filter((x) => x.currency === pk.currency).indexOf(pk));
  el.innerHTML = `${pk.tag ? `<span class="deal">${pk.tag}</span>` : ""}
    <div class="pk-art">${money(pk.currency).repeat(stack)}</div>
    <b class="name">${fmt(pk.amount)} ${pk.currency === "coins" ? "pièces" : "bombers"}</b>
    ${pk.bonus ? `<span class="sub">${pk.bonus} offerts</span>` : `<span class="sub">&nbsp;</span>`}
    <span class="price pk-price"><span>${pk.price}</span></span>`;
  el.addEventListener("click", () => {
    ctx.click();
    void buyPack(ctx, pk, refresh);
  });
  return el;
}

function exchangeCard(ctx: AppCtx, x: (typeof EXCHANGES)[number], refresh: () => void): HTMLElement {
  const el = document.createElement("button");
  const p = ctx.profile;
  el.className = "item pack pk-exchange";
  el.innerHTML = `<div class="pk-art"><i class="bomber"></i><span class="pk-arrow">→</span><i class="coin"></i></div>
    <b class="name">${fmt(x.coins)} pièces</b><span class="sub">pour ${fmt(x.bombers)} bombers</span>
    <span class="price ${p.bombers < x.bombers ? "poor" : ""}"><i class="bomber"></i>${fmt(x.bombers)}</span>`;
  el.addEventListener("click", () => {
    ctx.click();
    if (p.bombers < x.bombers) {
      audio.play("deny");
      ctx.toast(`Il te manque ${fmt(x.bombers - p.bombers)} bombers`, "bad");
      return;
    }
    ctx.modal.open((sheet, close) => {
      sheet.insertAdjacentHTML(
        "beforeend",
        `<h2>Échanger ?</h2><div class="buy" style="grid-template-columns:1fr"><div class="cost" style="justify-content:center"><i class="bomber"></i>${fmt(x.bombers)} → <i class="coin"></i>${fmt(x.coins)}</div>
         <p class="center">Il te restera <b style="color:#fff">${fmt(p.bombers - x.bombers)}</b> bombers.</p></div>`,
      );
      const actions = document.createElement("div");
      actions.className = "sheet-actions";
      const no = document.createElement("button");
      no.className = "btn btn-ghost";
      no.innerHTML = "<span>Annuler</span>";
      no.addEventListener("click", () => close());
      const yes = document.createElement("button");
      yes.className = "btn btn-green";
      yes.innerHTML = "<span>ÉCHANGER</span>";
      yes.addEventListener("click", () => {
        const before = p.coins;
        const r = exchange(p, x.id);
        if (!r.ok) return close();
        ctx.persist();
        audio.play("buy");
        haptics.pulse(30);
        ctx.wallet.earn(ctx.fx, yes, r.coins, before);
        window.setTimeout(() => {
          close();
          refresh();
        }, 700);
      });
      actions.append(no, yes);
      sheet.appendChild(actions);
    });
  });
  return el;
}

/** Achat d'un pack avec de l'argent réel. */
async function buyPack(ctx: AppCtx, pk: PackDef, refresh: () => void) {
  if (!billing.enabled) {
    audio.play("deny");
    ctx.toast("Les achats se font dans l'appli Android (Google Play)", "bad");
    return;
  }
  const r = await billing.buy(pk.id);
  if (r.status === "purchased" && r.token) {
    credit(ctx, r.productId ?? pk.id, r.token, true);
    refresh();
  } else if (r.status === "pending") ctx.toast("Paiement en attente : ton pack arrivera dès qu'il sera validé", "");
  else if (r.status === "unavailable") ctx.toast("Boutique Google Play indisponible pour l'instant", "bad");
  else if (r.status === "error") ctx.toast("L'achat n'a pas abouti. Tu n'as pas été débité.", "bad");
}

/** Crédite un achat confirmé (une seule fois par jeton), sauvegarde, puis le consomme. */
function credit(ctx: AppCtx, productId: string, token: string, show: boolean) {
  const p = ctx.profile;
  const before = p.coins;
  const got = creditPurchase(p, productId, token);
  if (got) ctx.persist();
  // consommé seulement s'il est bien crédité (sinon on le garde pour une version qui connaît ce produit)
  if (isCredited(p, token)) billing.consume(token);
  if (!got) return;
  audio.play("unlock");
  haptics.pulse(40);
  if (show) showGranted(ctx, "Merci pour ton achat !", got, { before, onClose: () => ctx.wallet.sync() });
  else {
    ctx.wallet.sync();
    ctx.toast(`🎉 Achat reçu : ${got.map((g) => g.label).join(", ")}`, "good");
  }
}

/** Achats arrivés hors clic (paiement en attente validé, appli fermée pendant l'achat). */
export function listenPurchases(ctx: AppCtx) {
  billing.listen((productId, token) => credit(ctx, productId, token, false));
}

/** Présentation des bombers + cadeau de découverte (une seule fois). */
export function announceBombers(ctx: AppCtx) {
  const p = ctx.profile;
  const got = grantBomberGift(p);
  ctx.persist();
  if (!got) return;
  ctx.modal.open(
    (sheet, close) => {
      sheet.insertAdjacentHTML(
        "beforeend",
        `<h2>Nouveau : les Bombers !</h2>
         <p class="sub">La monnaie premium de Bombe Rush. Achète des skins, des personnages et des effets en bombers, ou échange-les contre des pièces.</p>
         <div class="buy" style="grid-template-columns:1fr"><div class="cost" style="justify-content:center;font-size:1.8em"><i class="bomber"></i>+${fmt(got)}</div>
         <p class="center">Cadeau pour fêter leur arrivée. Tu en gagnes aussi le 7e jour de connexion.</p></div>`,
      );
      const actions = document.createElement("div");
      actions.className = "sheet-actions";
      const later = document.createElement("button");
      later.className = "btn btn-ghost";
      later.innerHTML = "<span>Plus tard</span>";
      later.addEventListener("click", () => close());
      const go = document.createElement("button");
      go.className = "btn btn-purple";
      go.innerHTML = `${icon("shop")}<span>VOIR LA BANQUE</span>`;
      go.addEventListener("click", () => {
        close();
        ctx.openShop(undefined, "bank");
      });
      actions.append(later, go);
      sheet.appendChild(actions);
      audio.play("unlock");
    },
    { closable: false, onClose: () => ctx.wallet.sync() },
  );
}
