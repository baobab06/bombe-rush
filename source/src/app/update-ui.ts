/**
 * Fenêtres de mise à jour (style Bombe Rush).
 *  - facultative : « METTRE À JOUR » / « PLUS TARD », une seule fois par session ;
 *  - obligatoire : plein écran, impossible à fermer ; le jeu, le multijoueur et
 *    la sauvegarde en ligne restent bloqués jusqu'à la mise à jour.
 * La progression du joueur n'est jamais touchée.
 */
import type { UpdateConfig, UpdateStatus } from "../net/update-policy";
import { isAndroidApp } from "../platform/app-version";
import type { UpdateResult } from "../meta/update-check";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const NOTE_ICON = { new: "✨", fix: "🛠️", improve: "⚡" } as const;
const NOTE_LABEL = { new: "Nouveau", fix: "Correction", improve: "Amélioré" } as const;

export class UpdateUI {
  /** mise à jour obligatoire en cours : jeu et services en ligne bloqués */
  blocking = false;
  private gate: HTMLElement | null = null;
  private pop: HTMLElement | null = null;
  /** dernières versions déjà proposées pendant cette session (facultatives) */
  private shownThisSession = new Set<string>();
  private pending: UpdateResult | null = null;
  onBlockChange: ((blocking: boolean) => void) | null = null;

  constructor(
    private host: HTMLElement,
    private canShowOptional: () => boolean,
  ) {}

  /** Applique le résultat d'une vérification. */
  apply(r: UpdateResult) {
    if (r.status === "mandatory") {
      this.closeOptional();
      this.showGate(r);
      return;
    }
    if (this.blocking) this.hideGate(); // l'administrateur a assoupli la règle
    if (r.status === "optional" && !this.shownThisSession.has(r.config.latestVersion)) {
      this.pending = r;
      this.flush();
    } else if (r.status === "ok") this.pending = null;
  }

  /** À appeler quand le joueur arrive sur un écran calme (accueil). */
  flush() {
    const r = this.pending;
    if (!r || this.blocking || this.pop || !this.canShowOptional()) return;
    this.pending = null;
    this.shownThisSession.add(r.config.latestVersion);
    this.showOptional(r);
  }

  get status(): UpdateStatus {
    return this.blocking ? "mandatory" : "ok";
  }

  private openStore(c: UpdateConfig) {
    if (isAndroidApp()) {
      // l'appli ouvre les liens externes dans le Play Store (MainActivity)
      location.href = c.storeUrl;
    } else {
      // site web : toujours la dernière version, il suffit de recharger
      location.reload();
    }
  }

  private body(r: UpdateResult, mandatory: boolean): string {
    const c = r.config;
    const notes = c.notes.length
      ? `<ul class="upd-notes">${c.notes.map((n) => `<li class="k-${n.kind}"><i>${NOTE_ICON[n.kind]}</i><b>${NOTE_LABEL[n.kind]}</b><span>${esc(n.text)}</span></li>`).join("")}</ul>`
      : "";
    return `
      <div class="upd-badge">${mandatory ? "⛔ MISE À JOUR OBLIGATOIRE" : "🎁 MISE À JOUR DISPONIBLE"}</div>
      <h2 class="upd-title">${esc(c.title)}</h2>
      <div class="upd-ver"><span class="old">Ta version <b>${esc(r.current)}</b></span><span class="arrow">➜</span><span class="new">Nouvelle <b>${esc(c.latestVersion)}</b></span></div>
      ${c.description ? `<p class="upd-desc">${esc(c.description)}</p>` : ""}
      ${notes}
      ${mandatory ? `<p class="upd-warn">Cette version n'est plus prise en charge. Mets le jeu à jour pour continuer à jouer. Ta progression, tes objets et tes achats sont conservés.</p>` : ""}
      <div class="upd-actions">
        <button class="btn btn-green upd-go"><span>${isAndroidApp() ? "METTRE À JOUR" : "RECHARGER LE JEU"}</span></button>
        ${mandatory ? "" : `<button class="btn btn-ghost small upd-later"><span>PLUS TARD</span></button>`}
      </div>`;
  }

  private showOptional(r: UpdateResult) {
    const el = document.createElement("div");
    el.className = "upd-wrap";
    el.innerHTML = `<div class="upd-card panel" role="dialog" aria-modal="true" aria-label="Mise à jour disponible">${this.body(r, false)}</div>`;
    el.querySelector(".upd-go")!.addEventListener("click", () => this.openStore(r.config));
    el.querySelector(".upd-later")!.addEventListener("click", () => this.closeOptional());
    el.addEventListener("pointerdown", (e) => {
      if (e.target === el) this.closeOptional();
    });
    this.host.appendChild(el);
    this.pop = el;
  }

  closeOptional() {
    if (!this.pop) return;
    const el = this.pop;
    this.pop = null;
    el.classList.add("out");
    window.setTimeout(() => el.remove(), 220);
  }

  /** Bouton retour d'Android pendant la fenêtre facultative. */
  back(): boolean {
    if (this.pop) {
      this.closeOptional();
      return true;
    }
    return false;
  }

  private showGate(r: UpdateResult) {
    if (!this.gate) {
      this.gate = document.createElement("div");
      this.gate.className = "upd-wrap upd-gate";
      this.host.appendChild(this.gate);
    }
    this.gate.innerHTML = `<div class="upd-card panel" role="alertdialog" aria-modal="true" aria-label="Mise à jour obligatoire">${this.body(r, true)}</div>`;
    this.gate.querySelector(".upd-go")!.addEventListener("click", () => this.openStore(r.config));
    if (!this.blocking) {
      this.blocking = true;
      this.onBlockChange?.(true);
    }
  }

  private hideGate() {
    this.gate?.remove();
    this.gate = null;
    if (this.blocking) {
      this.blocking = false;
      this.onBlockChange?.(false);
    }
  }
}
