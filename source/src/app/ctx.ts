/**
 * Ce que les écrans secondaires (boutique, collection, personnage,
 * récompenses) ont le droit de demander à l'application.
 */
import type { Profile } from "../meta/profile";
import type { UiFx } from "../ui/fx";

export type ScreenId =
  | "home" | "setup" | "chars" | "settings" | "pause" | "results" | "game" | "private" | "lobby" | "boot" | "welcome" | "invite" | "shop" | "collection";

export interface AppCtx {
  readonly profile: Profile;
  persist(): void;
  click(): void;
  toast(text: string, kind?: "" | "hot" | "bad" | "good"): void;
  go(id: ScreenId): void;
  /** ouvre la boutique sur un objet précis */
  openShop(itemId?: string, tab?: string): void;
  wallet: Wallet;
  fx: UiFx;
  modal: Modal;
  /** l'apparence du joueur a changé (équipement, personnage) */
  lookChanged(): void;
}

const $ = (id: string) => document.getElementById(id)!;
export const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ");

/** Porte-monnaie : tous les compteurs [data-coins] de l'interface. */
export class Wallet {
  private shown = 0;
  private anim = 0;

  constructor(private coins: () => number) {}

  sync() {
    cancelAnimationFrame(this.anim);
    this.anim = 0;
    this.shown = this.coins();
    this.write(this.shown);
  }

  private write(v: number) {
    document.querySelectorAll<HTMLElement>("[data-coins]").forEach((el) => (el.textContent = fmt(v)));
  }

  /** Compteur qui défile jusqu'à la valeur actuelle. */
  countTo(target = this.coins(), dur = 650) {
    cancelAnimationFrame(this.anim);
    const from = this.shown;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      this.shown = from + (target - from) * e;
      this.write(this.shown);
      if (k < 1) this.anim = requestAnimationFrame(step);
      else this.anim = 0;
    };
    this.anim = requestAnimationFrame(step);
    this.bump();
  }

  /**
   * Perte de pièces animée : elles quittent le porte-monnaie, se brisent sur
   * la perte affichée, et le compteur descend ; le porte-monnaie tremble.
   */
  lose(fx: UiFx, to: Element, amount: number, before: number) {
    const w = this.target();
    if (!w || amount <= 0) return this.countTo();
    this.shown = before;
    this.write(before);
    w.classList.remove("hurt");
    void (w as HTMLElement).offsetWidth;
    w.classList.add("hurt");
    const n = Math.min(10, Math.max(3, Math.round(amount / 6)));
    fx.coinsLost(fx.center(w), fx.center(to), n, (i, total) => {
      this.shown = before - (amount * i) / total;
      this.write(this.shown);
    }, () => this.sync());
  }

  bump() {
    document.querySelectorAll<HTMLElement>("[data-wallet]").forEach((w) => {
      w.classList.remove("bump");
      void w.offsetWidth;
      w.classList.add("bump");
    });
  }

  /** Porte-monnaie visible à l'écran (cible des pièces qui volent). */
  target(): Element | null {
    const list = [...document.querySelectorAll<HTMLElement>("[data-wallet]")];
    return list.find((w) => w.offsetParent !== null) ?? null;
  }

  /**
   * Gain de pièces animé : elles s'envolent de `from` vers le porte-monnaie
   * et le compteur monte au fur et à mesure.
   */
  earn(fx: UiFx, from: Element | { x: number; y: number }, amount: number, before: number) {
    const to = this.target();
    const start = from instanceof Element ? fx.center(from) : from;
    if (!to || amount <= 0) return this.countTo();
    this.shown = before;
    this.write(before);
    const end = fx.center(to);
    const n = Math.min(18, Math.max(4, Math.round(amount / 40)));
    fx.coins(start, end, n, (i, total) => {
      this.shown = before + (amount * i) / total;
      this.write(this.shown);
      this.bump();
    }, () => this.sync());
  }
}

/** Fenêtre modale unique (récompenses, missions, achat). */
export class Modal {
  private wrap = $("modal");
  private sheet = $("modalSheet");
  private onClose: (() => void) | null = null;

  constructor() {
    this.wrap.addEventListener("pointerdown", (e) => {
      if (e.target === this.wrap && this.wrap.dataset.closable === "1") this.close();
    });
  }

  get isOpen() {
    return !this.wrap.hidden;
  }

  open(build: (sheet: HTMLElement, close: () => void) => void, opts: { closable?: boolean; onClose?: () => void; cls?: string } = {}) {
    this.sheet.innerHTML = "";
    this.sheet.className = "sheet panel" + (opts.cls ? " " + opts.cls : "");
    this.wrap.dataset.closable = opts.closable === false ? "0" : "1";
    this.onClose = opts.onClose ?? null;
    if (opts.closable !== false) {
      const x = document.createElement("button");
      x.className = "sheet-close";
      x.setAttribute("aria-label", "Fermer");
      x.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>';
      x.addEventListener("click", () => this.close());
      this.sheet.appendChild(x);
    }
    build(this.sheet, () => this.close());
    this.wrap.hidden = false;
  }

  close() {
    if (this.wrap.hidden) return;
    this.wrap.hidden = true;
    this.sheet.innerHTML = "";
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }
}
