/**
 * Écran COFFRES : réserve de coffres gagnés en jouant, aperçu du contenu
 * possible (probabilités), puis cinématique d'ouverture (chest-cinematic.ts).
 * Le contenu est tiré ET sauvegardé avant l'animation.
 */
import { RARITY_LABEL, RARITY_ORDER } from "../core/characters";
import { chestPool, openChest } from "../meta/grants";
import { CHESTS, CHEST_ORDER, DUPLICATE_COINS, type ChestTier } from "../meta/progress-config";
import { owns } from "../meta/store";
import { chestImage } from "../ui/chest-art";
import { ChestCinematic } from "./chest-cinematic";
import { fmt, type AppCtx } from "./ctx";

/** Vignette d'un coffre (dessin de src/ui/chest-art.ts). */
export const chestArt = (tier: ChestTier, extra = "") => `<span class="chest-art c-${tier} ${extra}"><img alt="" draggable="false" src="${chestImage(tier)}"></span>`;

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
