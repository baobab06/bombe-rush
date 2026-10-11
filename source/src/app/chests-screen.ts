/**
 * Écran COFFRES : réserve de coffres gagnés en jouant, aperçu du contenu
 * possible (probabilités), puis ouverture animée.
 * Le contenu est tiré ET sauvegardé avant l'animation.
 */
import { audio } from "../audio/audio";
import { RARITY_LABEL, RARITY_ORDER } from "../core/characters";
import { chestPool, openChest, type ChestOpening, type Granted } from "../meta/grants";
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

  /** Étape 1 — le coffre, sa rareté, ses conditions (gratuit, gagné en jouant), le contenu possible et OUVRIR. */
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
        <p class="sub"><span class="tier-tag c-${tier}">${TIER_LABEL[tier]}</span> · Ouverture <b>gratuite</b> · gagné en jouant · <b>${n}</b> en réserve</p>
        <div class="chest-prev">${chestArt(tier, "wobble")}
          <div><p class="sub">Contient toujours <b>${fmt(d.coins[0])} à ${fmt(d.coins[1])} pièces</b> + <b>${d.drops} objet${d.drops > 1 ? "s" : ""}</b> :</p><ul class="odds">${odds}</ul></div></div>`,
      );
      const actions = document.createElement("div");
      actions.className = "sheet-actions";
      const b = document.createElement("button");
      b.className = "btn " + (n ? "btn-yellow" : "btn-ghost");
      b.id = "btnOpenChest";
      b.disabled = !n;
      b.innerHTML = n ? `<span>OUVRIR</span>` : "<span>Tu n'en as pas encore</span>";
      b.addEventListener("click", () => {
        if (b.disabled) return;
        b.disabled = true; // anti double clic
        close();
        this.open(tier);
      });
      actions.appendChild(b);
      sheet.appendChild(actions);
    });
  }

  /** Cinématique en cours (une seule à la fois). */
  private cine: ChestCinematic | null = null;

  /** Ferme la cinématique (navigation, bouton retour) : la récompense est déjà enregistrée. */
  closeCinematic() {
    this.cine?.close();
  }
  get cinematicOpen() {
    return !!this.cine;
  }

  /**
   * Ouverture : le contenu est tiré par le système de récompenses et
   * SAUVEGARDÉ AVANT l'animation. L'animation ne fait qu'afficher ce résultat
   * (quitter, recharger ou passer ne change rien).
   */
  open(tier: ChestTier) {
    if (this.cine) return;
    const p = this.ctx.profile;
    const before = p.coins;
    const res = openChest(p, tier);
    if (!res) return;
    this.ctx.persist();
    this.onChange();
    this.render();
    this.cine = new ChestCinematic(this.ctx, res, before, {
      onClose: () => {
        this.cine = null;
        this.render();
        this.onChange();
      },
      again: () => (p.chests[tier] > 0 ? () => this.open(tier) : null),
    });
  }
}

const TIER_LABEL: Record<ChestTier, string> = { common: "Commun", rare: "Rare", epic: "Épique", legend: "Légendaire" };

/**
 * Cinématique d'ouverture (étapes 2 à 5) : apparition, secousses de plus en
 * plus fortes, lumière qui s'échappe, explosion à la couleur du coffre,
 * révélation des récompenses (effet renforcé pour Épique / Légendaire),
 * RÉCUPÉRER ou OUVRIR UN AUTRE. Touche l'écran (ou PASSER) pour aller
 * directement aux récompenses.
 */
class ChestCinematic {
  private el: HTMLElement;
  private timers: number[] = [];
  private revealed = false;
  private closed = false;

  constructor(
    private ctx: AppCtx,
    private res: ChestOpening,
    private before: number,
    private hooks: { onClose: () => void; again: () => (() => void) | null },
  ) {
    const tier = res.tier;
    const el = document.createElement("div");
    el.className = `chest-fx c-${tier}`;
    el.id = "chestFx";
    el.innerHTML = `
      <div class="cf-top"><span class="cf-name">${CHESTS[tier].name}</span><div class="wallet" data-wallet data-wallet-top><i class="coin"></i><b data-coins>0</b></div></div>
      <div class="cf-rays"></div>
      <div class="cf-stage">${chestArt(tier, "cf-chest")}<i class="cf-leak"></i></div>
      <div class="cf-cards" hidden></div>
      <div class="cf-actions" hidden></div>
      <button class="cf-skip" id="btnChestSkip">PASSER ⏩</button>
      <p class="cf-hint">Touche l'écran pour ouvrir plus vite</p>`;
    const app = document.getElementById("app")!;
    app.insertBefore(el, document.getElementById("uiFx"));
    this.el = el;
    // le compteur affiche l'ancien solde jusqu'à la révélation
    el.querySelector<HTMLElement>("[data-coins]")!.textContent = fmt(before);
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".cf-actions")) return;
      this.reveal();
    });
    el.querySelector("#btnChestSkip")!.addEventListener("click", (e) => {
      e.stopPropagation();
      this.reveal();
    });
    // étape 2 : préparation (apparition + petite vibration), étape 3 : secousses → lumière → explosion
    audio.play("whoosh");
    this.at(450, () => el.classList.add("prep"));
    this.at(1000, () => {
      el.classList.add("shake");
      audio.play("rumble", 0.6);
      haptics.pulse(20);
    });
    this.at(1600, () => {
      el.classList.add("leak");
      const c = this.ctx.fx.center(el.querySelector(".cf-stage")!);
      this.ctx.fx.sparkle(c.x, c.y, 18, CHESTS[tier].color);
      haptics.pulse(30);
    });
    this.at(2300, () => this.reveal());
  }

  private at(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(() => !this.closed && !this.revealed && fn(), ms));
  }

  /** Étape 4 : explosion de lumière puis révélation (exactement ce qui a été donné). */
  reveal() {
    if (this.revealed || this.closed) return;
    this.revealed = true;
    for (const t of this.timers) window.clearTimeout(t);
    const el = this.el;
    const tier = this.res.tier;
    el.classList.remove("shake", "prep");
    el.classList.add("leak", "burst");
    el.querySelector(".cf-hint")?.remove();
    el.querySelector(".cf-skip")?.remove();
    audio.play("unlock");
    haptics.pulse(tier === "legend" ? 90 : 45);
    const stage = el.querySelector(".cf-stage")!;
    const c = this.ctx.fx.center(stage);
    const big = tier === "legend" || tier === "epic";
    this.ctx.fx.confetti(c.x, c.y, big ? 110 : 55, big ? 1.4 : 1);
    this.ctx.fx.sparkle(c.x, c.y, big ? 36 : 20, CHESTS[tier].color);
    const cards = el.querySelector<HTMLElement>(".cf-cards")!;
    const res = this.res;
    const coinG: Granted = { reward: { kind: "coins", amount: res.coins }, label: `+${fmt(res.coins)} pièces`, icon: "🪙", coins: res.coins };
    const list: Granted[] = [coinG, ...res.items];
    window.setTimeout(() => {
      if (this.closed) return;
      el.classList.add("revealed");
      cards.hidden = false;
      list.forEach((g, i) => {
        const card = grantCard(g, this.ctx);
        const rare = g.rarity === "epic" || g.rarity === "legend";
        if (rare) card.classList.add("shine");
        card.style.animationDelay = `${0.05 + i * 0.32}s`;
        if (g.rarity) card.insertAdjacentHTML("afterbegin", `<span class="gc-rar">${RARITY_LABEL[g.rarity].toUpperCase()}${g.rarity === "legend" ? " !" : ""}</span>`);
        cards.appendChild(card);
        window.setTimeout(() => {
          if (this.closed) return;
          if (rare) {
            const cc = this.ctx.fx.center(card);
            this.ctx.fx.sparkle(cc.x, cc.y, 22, g.rarity === "legend" ? "#ffd23f" : "#c27bff");
            audio.play("levelup", 0.7);
          }
        }, 150 + i * 320);
      });
      const gained = res.coins + res.items.reduce((a, g) => a + g.coins, 0);
      window.setTimeout(() => !this.closed && this.ctx.wallet.earn(this.ctx.fx, cards, gained, this.before), 300);
      // étape 5 : RÉCUPÉRER / OUVRIR UN AUTRE
      const actions = el.querySelector<HTMLElement>(".cf-actions")!;
      const ok = document.createElement("button");
      ok.className = "btn btn-yellow";
      ok.id = "btnChestOk";
      ok.innerHTML = "<span>RÉCUPÉRER</span>";
      ok.addEventListener("click", () => {
        this.ctx.click();
        this.close();
      });
      actions.appendChild(ok);
      const again = this.hooks.again();
      if (again) {
        const b = document.createElement("button");
        b.className = "btn btn-blue";
        b.id = "btnChestAgain";
        b.innerHTML = `<span>OUVRIR UN AUTRE (${this.ctx.profile.chests[tier]})</span>`;
        b.addEventListener("click", () => {
          this.ctx.click();
          this.close();
          again();
        });
        actions.appendChild(b);
      }
      window.setTimeout(() => !this.closed && (actions.hidden = false), 150 + list.length * 220);
    }, 380);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const t of this.timers) window.clearTimeout(t);
    this.el.remove();
    this.ctx.wallet.sync();
    this.hooks.onClose();
  }
}
