/**
 * Écran CLASSEMENT MONDIAL : top de la semaine / général, ma place,
 * récompense du top 10 de la semaine passée.
 */
import { grantAll } from "../meta/grants";
import { RANKS, type Reward } from "../meta/progress-config";
import type { WorldBoard, WorldRank } from "../net/world";
import { fmt, type AppCtx } from "./ctx";
import { showGranted } from "./rewards";

/** Récompense de la semaine passée selon la place (top 10). */
export function weeklyPrize(pos: number): Reward[] {
  if (pos === 1) return [{ kind: "chest", tier: "legend" }, { kind: "coins", amount: 1000 }];
  if (pos <= 3) return [{ kind: "chest", tier: "epic" }, { kind: "coins", amount: 500 }];
  return [{ kind: "chest", tier: "rare" }, { kind: "coins", amount: 200 }];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const medal = (i: number) => `<i>${i}</i>`;

function left(ms: number): string {
  const h = Math.max(0, Math.floor(ms / 3600_000));
  return h >= 48 ? `${Math.floor(h / 24)} jours` : h >= 1 ? `${h} h` : "moins d'une heure";
}

export class WorldScreen {
  private tab: "week" | "all" = "week";
  private seq = 0;

  constructor(
    private ctx: AppCtx,
    private world: WorldRank,
    private onChange: () => void,
  ) {
    document.querySelectorAll<HTMLButtonElement>("#worldTabs button").forEach((b) =>
      b.addEventListener("click", () => {
        ctx.click();
        this.tab = b.dataset.board === "all" ? "all" : "week";
        this.render();
      }),
    );
  }

  render() {
    document.querySelectorAll<HTMLButtonElement>("#worldTabs button").forEach((b) => { b.classList.toggle("sel", b.dataset.board === this.tab); b.setAttribute("aria-checked", String(b.dataset.board === this.tab)); });
    const list = document.getElementById("worldList")!;
    const me = document.getElementById("worldMe")!;
    const info = document.getElementById("worldInfo")!;
    if (!this.world.available) {
      list.innerHTML = `<p class="world-empty">🌐 Le classement mondial a besoin d'internet.</p>`;
      me.innerHTML = "";
      info.textContent = "";
      return;
    }
    list.innerHTML = `<p class="world-empty">Chargement…</p>`;
    const n = ++this.seq;
    this.world
      .board(this.tab)
      .then((b) => {
        if (n === this.seq) this.show(b);
      })
      .catch(() => {
        if (n !== this.seq) return;
        list.innerHTML = `<p class="world-empty">😕 Classement indisponible pour le moment.<br><button class="btn btn-ghost small" id="worldRetry"><span>Réessayer</span></button></p>`;
        list.querySelector("#worldRetry")?.addEventListener("click", () => {
          this.ctx.click();
          this.render();
        });
      });
  }

  private show(b: WorldBoard) {
    const p = this.ctx.profile;
    const list = document.getElementById("worldList")!;
    const meEl = document.getElementById("worldMe")!;
    const info = document.getElementById("worldInfo")!;
    const unit = b.board === "week" ? "🏆 cette semaine" : "🏆";
    list.innerHTML = b.entries.length
      ? `<ol class="world-rows">${b.entries
          .map((e, i) => {
            const r = RANKS[e.r] ?? RANKS[0];
            return `<li class="${e.me ? "me" : ""}${i < 3 ? ` top${i + 1}` : ""}"><span class="wr-pos">${medal(i + 1)}</span><span class="wr-ico" title="${r.name}" style="--rc:${r.color}">${r.icon}</span><b class="wr-name">${esc(e.n)}</b><span class="wr-pts">${fmt(e.p)}</span></li>`;
          })
          .join("")}</ol>`
      : `<p class="world-empty">${b.board === "week" ? "Personne n'a encore gagné de trophées cette semaine.<br><b>Sois le premier !</b>" : "Personne n'a encore de trophées cette saison.<br><b>Joue en Compétition pour y entrer !</b>"}</p>`;
    const r = b.me ? RANKS[b.me.r] ?? RANKS[0] : RANKS[0];
    meEl.innerHTML =
      b.me && b.me.pos
        ? `<span class="wr-pos">${b.me.pos}<small>e</small></span><span class="wr-ico" style="--rc:${r.color}">${r.icon}</span><b class="wr-name">${esc(b.me.n)}</b><span class="wr-pts">${fmt(b.me.p)} <small>${unit}</small></span>`
        : `<span class="wr-hint">${p.world.id ? (b.board === "week" ? "Gagne des trophées cette semaine pour apparaître ici !" : "Termine une partie de Compétition pour apparaître ici !") : "Joue une partie de Compétition (connecté à internet) pour entrer au classement !"}</span>`;
    info.innerHTML =
      b.board === "week"
        ? `⏳ Fin de la semaine dans <b>${left(b.weekEnds - Date.now())}</b> · Récompenses : 1er coffre légendaire, top 3 coffre épique, top 10 coffre rare`
        : `${fmt(b.total)} joueur${b.total > 1 ? "s" : ""} classé${b.total > 1 ? "s" : ""} · 📅 Saison d'un mois${b.seasonEnds ? ` : fin dans <b>${left(b.seasonEnds - Date.now())}</b>` : ""}, puis tout le monde repart de 0`;
    this.claim(b);
  }

  /** Top 10 de la semaine passée : récompense, une seule fois. */
  private claim(b: WorldBoard) {
    const p = this.ctx.profile;
    const last = b.last;
    if (!last?.pos || p.world.claimed === last.week) return;
    p.world.claimed = last.week;
    const granted = grantAll(p, weeklyPrize(last.pos), [], `Classement mondial (${last.pos}e)`);
    this.ctx.persist();
    this.onChange();
    showGranted(this.ctx, `🏆 ${last.pos === 1 ? "1er" : `${last.pos}e`} de la semaine !`, granted, { sub: "Ta récompense du classement mondial" });
  }
}
