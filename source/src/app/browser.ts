/**
 * Navigateur d'objets : sert à la fois la BOUTIQUE et la COLLECTION.
 *  - à gauche : grand aperçu animé de l'objet sélectionné + action
 *  - à droite : onglets par catégorie (+ filtre par personnage pour les
 *    skins) et grille de cartes.
 */
import { audio } from "../audio/audio";
import { CHARACTERS, RARITY_LABEL, RARITY_ORDER, getCharacter } from "../core/characters";
import { CATALOG, CATEGORIES, getItem, isBuyable, type CatalogItem, type ItemKind } from "../meta/catalog";
import { unlockText } from "../meta/unlocks";
import { countOwned, equip, equippedSkin, featured, isEquipped, owns, priceOf } from "../meta/store";
import { icon } from "../ui/icons";
import { itemCard } from "../ui/items";
import { Stage } from "../ui/stage";
import { drawPortrait } from "../ui/thumbs";
import { fmt, type AppCtx } from "./ctx";
import { confirmPurchase } from "./purchase";

type Tab = "featured" | ItemKind;

export class ItemBrowser {
  private stage: Stage;
  private tabsEl: HTMLElement;
  private subEl: HTMLElement;
  private gridEl: HTMLElement;
  private nameEl: HTMLElement;
  private rarEl: HTMLElement;
  private descEl: HTMLElement;
  private actEl: HTMLElement;
  private tab: Tab;
  private charFilter = "";
  private selected: string | null = null;

  constructor(
    root: HTMLElement,
    private mode: "shop" | "collection",
    private ctx: AppCtx,
  ) {
    root.innerHTML = `
      <aside class="preview panel">
        <canvas class="stage"></canvas>
        <div class="pv-info"><span class="rar-tag"></span><b class="pv-name"></b><p class="pv-desc"></p></div>
        <div class="pv-actions"></div>
      </aside>
      <div class="browse">
        <nav class="tabs" role="tablist"></nav>
        <div class="subtabs"></div>
        <div class="grid"></div>
      </div>`;
    this.stage = new Stage(root.querySelector<HTMLCanvasElement>(".stage")!, { y: 0.6 });
    this.tabsEl = root.querySelector(".tabs")!;
    this.subEl = root.querySelector(".subtabs")!;
    this.gridEl = root.querySelector(".grid")!;
    this.nameEl = root.querySelector(".pv-name")!;
    this.rarEl = root.querySelector(".rar-tag")!;
    this.descEl = root.querySelector(".pv-desc")!;
    this.actEl = root.querySelector(".pv-actions")!;
    this.tab = mode === "shop" ? "featured" : "skin";
  }

  /** Affichage de l'écran (éventuellement sur un objet précis). */
  open(itemId?: string, tab?: string) {
    const p = this.ctx.profile;
    this.charFilter = this.charFilter || p.characterId;
    if (tab) this.tab = tab as Tab;
    if (tab === "skin" && !itemId) this.charFilter = p.characterId;
    if (itemId) {
      const it = getItem(itemId);
      if (it) {
        if (!tab) this.tab = it.kind;
        if (it.kind === "skin") this.charFilter = it.characterId!;
        this.selected = it.id;
      }
    }
    this.render();
    if (!this.selected || !getItem(this.selected)) this.selectFirst();
    else this.select(this.selected, false);
    this.stage.start();
    if (this.mode === "shop") this.updateTimer();
  }

  private updateTimer() {
    const el = document.getElementById("shopTimer");
    if (!el) return;
    const ms = featured().refreshIn;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    el.textContent = `Nouvelle sélection dans ${h} h ${String(m).padStart(2, "0")}`;
  }

  // ------------------------------------------------------------- onglets
  private tabs(): { id: Tab; label: string }[] {
    const list: { id: Tab; label: string }[] = CATEGORIES.filter((c) => this.mode === "collection" || CATALOG.some((i) => i.kind === c.id && isBuyable(i))).map((c) => ({ id: c.id, label: c.label }));
    if (this.mode === "shop") list.unshift({ id: "featured", label: "À la une" });
    return list;
  }

  private render() {
    const p = this.ctx.profile;
    this.tabsEl.innerHTML = "";
    for (const t of this.tabs()) {
      const b = document.createElement("button");
      b.className = "tab" + (t.id === this.tab ? " sel" : "");
      b.setAttribute("role", "tab");
      b.dataset.tab = t.id;
      if (this.mode === "collection" && t.id !== "featured") {
        const c = countOwned(p, t.id);
        b.innerHTML = `${t.label} <small>${c.owned}/${c.total}</small>`;
      } else b.textContent = t.label;
      if (t.id === "featured") b.insertAdjacentHTML("afterbegin", "⭐ ");
      b.addEventListener("click", () => {
        audio.play("tab");
        this.tab = t.id;
        this.render();
        this.selectFirst();
      });
      this.tabsEl.appendChild(b);
    }
    // filtre par personnage (skins)
    this.subEl.innerHTML = "";
    this.subEl.hidden = this.tab !== "skin";
    if (this.tab === "skin") {
      for (const c of CHARACTERS) {
        const b = document.createElement("button");
        b.className = c.id === this.charFilter ? "sel" : "";
        b.title = c.name;
        b.setAttribute("aria-label", `Skins de ${c.name}`);
        const cv = document.createElement("canvas");
        cv.width = cv.height = 72;
        b.appendChild(cv);
        drawPortrait(cv, c.id, equippedSkin(p, c.id), 1, 0, null, 0.98);
        b.addEventListener("click", () => {
          audio.play("tab");
          this.charFilter = c.id;
          this.render();
          this.selectFirst();
        });
        this.subEl.appendChild(b);
      }
    }
    this.renderGrid();
    if (this.mode === "collection") this.updateProgress();
  }

  private items(): CatalogItem[] {
    if (this.tab === "featured") return featured().items;
    let list = CATALOG.filter((i) => i.kind === this.tab);
    // boutique : uniquement ce qui se vend (les exclusifs se gagnent)
    if (this.mode === "shop") list = list.filter((i) => isBuyable(i) || i.free);
    if (this.tab === "skin") list = list.filter((i) => i.characterId === this.charFilter);
    const rank = (i: CatalogItem) => (i.free ? -1 : RARITY_ORDER.indexOf(i.rarity));
    return list.slice().sort((a, b) => rank(a) - rank(b) || a.price - b.price);
  }

  private renderGrid() {
    const p = this.ctx.profile;
    const grid = this.gridEl;
    grid.innerHTML = "";
    const wearer = { characterId: p.characterId, skinId: equippedSkin(p, p.characterId) };
    const feat = this.tab === "featured" ? featured() : null;
    if (feat) {
      const ms = feat.refreshIn;
      const head = document.createElement("div");
      head.className = "featured-head";
      head.style.gridColumn = "1 / -1";
      head.innerHTML = `<b>Sélection du jour</b><span>· renouvelée dans ${Math.floor(ms / 3600000)} h ${String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0")}</span>`;
      grid.appendChild(head);
    }
    this.items().forEach((it, i) => {
      const own = owns(p, it.id);
      const pr = priceOf(it.id);
      const card = itemCard(
        it,
        {
          owned: own,
          equipped: own && isEquipped(p, it.id),
          price: it.exclusive && !own ? undefined : pr.price,
          fullPrice: pr.full,
          deal: pr.deal,
          affordable: p.coins >= pr.price,
          sub: it.exclusive && !own ? "🔒 Exclusif" : it.kind === "skin" && (this.tab === "featured" || this.mode === "collection") ? getCharacter(it.characterId!).name : undefined,
          isNew: !!feat && !p.seen.includes(it.id) && !it.free,
          dim: this.mode === "collection" ? undefined : false,
          big: !!feat && i === 0,
        },
        wearer,
      );
      card.style.animationDelay = `${Math.min(i, 14) * 25}ms`;
      if (it.id === this.selected) card.classList.add("sel");
      card.addEventListener("click", () => {
        audio.play("tab");
        this.select(it.id);
      });
      grid.appendChild(card);
    });
  }

  private updateProgress() {
    const c = countOwned(this.ctx.profile);
    const t = document.getElementById("collProgressText");
    const bar = document.getElementById("collProgress");
    if (t) t.textContent = `${c.owned}/${c.total}`;
    if (bar) bar.style.width = `${(c.owned / c.total) * 100}%`;
  }

  private selectFirst() {
    const list = this.items();
    const p = this.ctx.profile;
    const eq = list.find((i) => owns(p, i.id) && isEquipped(p, i.id));
    const pick = this.mode === "shop" ? list.find((i) => !owns(p, i.id)) ?? list[0] : eq ?? list[0];
    if (pick) this.select(pick.id, false);
  }

  // ---------------------------------------------------------- sélection
  select(id: string, scroll = true) {
    const it = getItem(id);
    if (!it) return;
    const p = this.ctx.profile;
    this.selected = id;
    if (this.mode === "shop" && !p.seen.includes(id)) {
      p.seen.push(id);
      if (p.seen.length > 400) p.seen.splice(0, p.seen.length - 400);
      this.ctx.persist();
      this.gridEl.querySelector(`.item[data-id="${id}"] .new`)?.remove();
    }
    this.gridEl.querySelectorAll(".item").forEach((el) => el.classList.toggle("sel", (el as HTMLElement).dataset.id === id));
    if (scroll) this.gridEl.querySelector(`.item[data-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // aperçu
    const skin = equippedSkin(p, p.characterId);
    this.stage.setMode(it.kind === "trail" ? "run" : "idle");
    this.stage.showEmote(null);
    this.stage.boomPreview = it.kind === "boom" ? it.id : null;
    switch (it.kind) {
      case "skin":
        this.stage.set({ characterId: it.characterId!, skinId: it.id, trailId: p.equipped.trail }, it.rarity);
        break;
      case "character":
        this.stage.set({ characterId: it.characterId! }, it.rarity);
        break;
      case "accessory":
        this.stage.set({ characterId: p.characterId, skinId: skin, accessoryId: it.id, trailId: p.equipped.trail }, it.rarity);
        break;
      case "trail":
        this.stage.set({ characterId: p.characterId, skinId: skin, accessoryId: p.equipped.accessory, trailId: it.id }, it.rarity);
        break;
      case "emote":
        this.stage.set({ characterId: p.characterId, skinId: skin, accessoryId: p.equipped.accessory, trailId: p.equipped.trail }, it.rarity);
        this.stage.showEmote(it.id, true);
        break;
      case "boom":
      case "title":
        this.stage.set({ characterId: p.characterId, skinId: skin, accessoryId: p.equipped.accessory, trailId: p.equipped.trail }, it.rarity);
        break;
    }
    this.rarEl.textContent = RARITY_LABEL[it.rarity];
    this.rarEl.dataset.r = it.rarity;
    this.nameEl.textContent = it.kind === "skin" ? `${getCharacter(it.characterId!).name} ${it.name}` : it.name;
    this.descEl.textContent = it.desc;
    if (this.mode === "collection") {
      const how = owns(p, it.id) ? "✔ Possédé" : `Comment l'obtenir : ${unlockText(it.id)}`;
      this.descEl.insertAdjacentHTML("beforeend", `<br><small class="how">${how}</small>`);
    }
    this.renderAction(it);
  }

  private renderAction(it: CatalogItem) {
    const p = this.ctx.profile;
    const el = this.actEl;
    el.innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "btn";
    el.appendChild(btn);
    const own = owns(p, it.id);
    const eq = own && isEquipped(p, it.id);
    const charLocked = it.kind === "skin" && !p.ownedCharacters.includes(it.characterId!);
    if (own) {
      if (eq && (it.kind === "accessory" || (it.kind === "emote" && p.equipped.emotes.length > 1))) {
        btn.classList.add("btn-ghost");
        btn.innerHTML = `<span>RETIRER</span>`;
        btn.addEventListener("click", () => this.doEquip(it, true));
        const ok = document.createElement("button");
        ok.className = "btn btn-green";
        ok.disabled = true;
        ok.innerHTML = `${icon("check")}<span>ÉQUIPÉ</span>`;
        el.appendChild(ok);
      } else if (eq) {
        btn.classList.add("btn-green");
        btn.disabled = true;
        btn.innerHTML = `${icon("check")}<span>ÉQUIPÉ</span>`;
      } else if (charLocked) {
        btn.classList.add("btn-purple");
        btn.innerHTML = `<span>DÉBLOQUE ${getCharacter(it.characterId!).name.toUpperCase()}</span>`;
        btn.addEventListener("click", () => this.ctx.openShop(`chr-${it.characterId}`));
      } else {
        btn.classList.add("btn-blue");
        btn.innerHTML = `<span>ÉQUIPER</span>`;
        btn.addEventListener("click", () => this.doEquip(it, false));
      }
      return;
    }
    if (this.mode === "collection" && it.exclusive) {
      btn.classList.add("btn-ghost");
      btn.disabled = true;
      btn.innerHTML = `${icon("lock")}<span>${unlockText(it.id)}</span>`;
      return;
    }
    if (this.mode === "collection") {
      btn.classList.add("btn-yellow");
      btn.innerHTML = `${icon("shop")}<span>VOIR EN BOUTIQUE</span>`;
      btn.addEventListener("click", () => {
        this.ctx.click();
        this.ctx.openShop(it.id);
      });
      return;
    }
    if (charLocked) {
      btn.classList.add("btn-purple");
      btn.innerHTML = `${icon("lock")}<span>DÉBLOQUE ${getCharacter(it.characterId!).name.toUpperCase()}</span>`;
      btn.addEventListener("click", () => {
        this.ctx.click();
        this.open(`chr-${it.characterId}`, "character");
      });
      return;
    }
    const pr = priceOf(it.id);
    if (p.coins >= pr.price) {
      btn.classList.add("btn-green");
      btn.innerHTML = `<span>ACHETER</span><i class="coin"></i><span>${fmt(pr.price)}</span>`;
      btn.addEventListener("click", () => {
        this.ctx.click();
        confirmPurchase(this.ctx, it.id, (equipped) => {
          this.render();
          this.select(it.id, false);
          if (equipped) this.stage.flash();
        });
      });
    } else {
      btn.classList.add("btn-yellow");
      btn.innerHTML = `<i class="coin"></i><span>${fmt(pr.price)}</span>`;
      this.descEl.insertAdjacentHTML("beforeend", `<br><b style="color:#ffb3ad">Il te manque ${fmt(pr.price - p.coins)} pièces</b>`);
      btn.addEventListener("click", () => {
        audio.play("deny");
        btn.classList.remove("shake");
        void btn.offsetWidth;
        btn.classList.add("shake");
        this.ctx.toast(`Il te manque ${fmt(pr.price - p.coins)} pièces : joue des parties et fais tes missions !`, "bad");
      });
    }
  }

  private doEquip(it: CatalogItem, toggle: boolean) {
    const p = this.ctx.profile;
    if (!equip(p, it.id, { toggle })) return;
    this.ctx.persist();
    this.ctx.lookChanged();
    audio.play("equip");
    this.ctx.fx.sparkle(this.ctx.fx.center(this.stage.canvas).x, this.ctx.fx.center(this.stage.canvas).y, 14);
    if (!toggle) this.stage.flash();
    if (!toggle) this.ctx.toast(it.kind === "title" ? `🏷️ Titre « ${it.name} » équipé !` : `${it.name} équipé !`, "good");
    this.render();
    this.select(it.id, false);
  }
}
