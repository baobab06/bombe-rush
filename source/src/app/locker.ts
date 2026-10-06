/**
 * Écran PERSONNAGE : choisir son héros et équiper rapidement ce qu'on
 * possède (skin, accessoire, effet, emotes). Ce qui manque renvoie vers
 * la boutique.
 */
import { audio } from "../audio/audio";
import { CHARACTERS, RARITY_ORDER, getCharacter, getSkin } from "../core/characters";
import { CATALOG, getItem, type ItemKind } from "../meta/catalog";
import { equip, equippedSkin, isEquipped, owns, usable } from "../meta/store";
import { icon } from "../ui/icons";
import { itemCard } from "../ui/items";
import { Stage } from "../ui/stage";
import { drawPortrait } from "../ui/thumbs";
import { fmt, type AppCtx } from "./ctx";

type Tab = Exclude<ItemKind, "character">;
const TABS: { id: Tab; label: string }[] = [
  { id: "skin", label: "Skins" },
  { id: "accessory", label: "Accessoires" },
  { id: "trail", label: "Effets" },
  { id: "emote", label: "Emotes" },
];

const $ = (id: string) => document.getElementById(id)!;

export class Locker {
  readonly stage: Stage;
  private tab: Tab = "skin";

  constructor(private ctx: AppCtx) {
    this.stage = new Stage($("charStage") as HTMLCanvasElement, { y: 0.6 });
  }

  open() {
    this.render();
    this.stage.start();
  }

  private look() {
    const p = this.ctx.profile;
    return { characterId: p.characterId, skinId: equippedSkin(p, p.characterId), accessoryId: p.equipped.accessory, trailId: p.equipped.trail };
  }

  render() {
    const p = this.ctx.profile;
    const c = getCharacter(p.characterId);
    const skin = getSkin(c.id, equippedSkin(p, c.id));
    $("charName").textContent = c.name;
    $("charTag").textContent = `${c.tagline} · ${skin.name}`;
    this.stage.set(this.look(), skin.free ? null : skin.rarity);
    this.stage.setMode(this.tab === "trail" ? "run" : "idle");
    this.stage.idleEmotes = p.equipped.emotes;

    // personnages
    const row = $("charRow");
    row.innerHTML = "";
    for (const ch of CHARACTERS) {
      const own = p.ownedCharacters.includes(ch.id);
      const b = document.createElement("button");
      b.className = "char" + (ch.id === p.characterId ? " sel" : "") + (own ? "" : " locked");
      b.setAttribute("aria-label", own ? ch.name : `${ch.name} (à débloquer)`);
      b.title = ch.name;
      const cv = document.createElement("canvas");
      cv.width = cv.height = 110;
      b.appendChild(cv);
      drawPortrait(cv, ch.id, equippedSkin(p, ch.id), 1, 0, own ? p.equipped.accessory : null, 0.98);
      if (!own) {
        const it = getItem(`chr-${ch.id}`)!;
        b.insertAdjacentHTML("beforeend", `<span class="lock-badge">${icon("lock")}${fmt(it.price)}</span>`);
      }
      b.addEventListener("click", () => {
        this.ctx.click();
        if (!own) return this.ctx.openShop(`chr-${ch.id}`);
        p.characterId = ch.id;
        this.ctx.persist();
        this.ctx.lookChanged();
        this.stage.flash();
        audio.play("equip");
        this.render();
      });
      row.appendChild(b);
    }

    // onglets
    const tabs = $("lockerTabs");
    tabs.innerHTML = "";
    for (const t of TABS) {
      const b = document.createElement("button");
      b.className = "tab" + (t.id === this.tab ? " sel" : "");
      b.textContent = t.label;
      b.addEventListener("click", () => {
        audio.play("tab");
        this.tab = t.id;
        this.render();
      });
      tabs.appendChild(b);
    }
    this.renderGrid();
  }

  private renderGrid() {
    const p = this.ctx.profile;
    const grid = $("lockerGrid");
    grid.innerHTML = "";
    let list = CATALOG.filter((i) => i.kind === this.tab);
    if (this.tab === "skin") list = list.filter((i) => i.characterId === p.characterId);
    const ownedList = list.filter((i) => usable(p, i.id)).sort((a, b) => (a.free ? -1 : RARITY_ORDER.indexOf(a.rarity)) - (b.free ? -1 : RARITY_ORDER.indexOf(b.rarity)));
    const wearer = { characterId: p.characterId, skinId: equippedSkin(p, p.characterId) };
    // accessoire : « aucun »
    if (this.tab === "accessory") {
      const none = document.createElement("button");
      none.className = "item more" + (p.equipped.accessory === null ? " equipped" : "");
      none.innerHTML = `${icon("close")}<span>Aucun</span>`;
      none.addEventListener("click", () => {
        this.ctx.click();
        p.equipped.accessory = null;
        this.ctx.persist();
        this.ctx.lookChanged();
        this.render();
      });
      grid.appendChild(none);
    }
    ownedList.forEach((it, i) => {
      const eq = isEquipped(p, it.id);
      const card = itemCard(it, { owned: true, equipped: eq }, wearer);
      card.style.animationDelay = `${Math.min(i, 12) * 25}ms`;
      card.addEventListener("click", () => {
        const toggle = it.kind === "emote" || it.kind === "accessory";
        if (!equip(p, it.id, { toggle })) return;
        this.ctx.persist();
        this.ctx.lookChanged();
        audio.play("equip");
        if (it.kind === "emote") this.stage.showEmote(it.id);
        else this.stage.flash();
        this.render();
      });
      grid.appendChild(card);
    });
    // vers la boutique
    const missing = list.filter((i) => !owns(p, i.id)).length;
    const more = document.createElement("button");
    more.className = "item more";
    more.innerHTML = `${icon("shop")}<span>${missing ? `${missing} de plus<br>en boutique` : "Boutique"}</span>`;
    more.addEventListener("click", () => {
      this.ctx.click();
      this.ctx.openShop(undefined, this.tab);
    });
    grid.appendChild(more);
    if (this.tab === "emote") {
      const note = document.createElement("p");
      note.className = "hint";
      note.style.gridColumn = "1 / -1";
      note.textContent = `Jusqu'à 4 emotes équipées (${p.equipped.emotes.length}/4) — en partie, touche le bouton 😊 ou les touches 1 à 4.`;
      grid.appendChild(note);
    }
  }
}
