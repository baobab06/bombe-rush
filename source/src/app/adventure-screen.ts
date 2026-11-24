/**
 * Écran AVENTURE : 4 mondes, une carte par monde (chemin de 10 niveaux),
 * fiche de niveau (objectif, étoiles, récompense), résultat du niveau.
 * Règles et progression : meta/adventure.ts ; objectifs en jeu : core/adventure.ts.
 */
import { audio } from "../audio/audio";
import { getMode } from "../core/modes";
import { getMap } from "../maps";
import {
  ADV_MAX_STARS, ADV_MILESTONES, ADV_PASS_STARS, ADV_WORLDS, GOAL_ICON, advClaimable, advLevel, advStars, currentLevel,
  firstClearReward, goalText, levelOpen, nextLevel, nextMilestone, recordLevel, starTexts, worldOpen, worldStars, type AdvLevel,
} from "../meta/adventure";
import { grantAll, type Granted } from "../meta/grants";
import { addPassStars } from "../meta/pass";
import type { Reward } from "../meta/progress-config";
import { drawCharacter, lookOf } from "../render/bodies";
import type { AppCtx } from "./ctx";
import { cellOf } from "./pass-ui";
import { showGranted } from "./rewards";
import { hydrateIcons } from "../ui/icons";

const $ = (id: string) => document.getElementById(id)!;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const DIFF: Record<string, string> = { easy: "facile", normal: "moyen", hard: "fort", expert: "expert" };

/** Positions des 10 niveaux sur la carte (en % de la zone), chemin en zigzag. */
const SPOTS: [number, number][] = [
  [7, 70], [16, 34], [26, 66], [35, 28], [45, 62], [54, 26], [63, 62], [72, 30], [81, 64], [92, 38],
];

function starsHtml(n: number, cls = "") {
  return `<span class="adv-stars ${cls}">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}">★</i>`).join("")}</span>`;
}

function rewardChips(list: Reward[]) {
  return list.map((r) => { const c = cellOf(r); return `<span class="adv-chip${c.rare ? " rare" : ""}">${c.ic} ${c.lb}</span>`; }).join("");
}

/** Petite tête de personnage dans un canvas. */
function head(characterId: string, skinId: string | undefined, size: number, cls: string, expr = "normal"): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = Math.round(size * dpr);
  cv.className = cls;
  const g = cv.getContext("2d")!;
  g.scale(dpr, dpr);
  drawCharacter(g, size / 2, size * 0.62, size * 0.92, lookOf(characterId, skinId), { faceX: 0, faceY: 1, walk: 0, moving: false, t: 0.3, expr: expr as "normal" });
  return cv;
}

export interface AdvResult {
  won: boolean;
  stars: number;
  time: number;
  why: "" | "dead" | "time";
}

export class AdventureScreen {
  private world = 1;
  private wired = false;

  constructor(
    private ctx: AppCtx,
    /** lance un niveau */
    private onPlay: (l: AdvLevel) => void,
    private onChange: () => void = () => {},
  ) {}

  private wire() {
    if (this.wired) return;
    this.wired = true;
    $("advWorlds").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-w]");
      if (!b) return;
      const w = Number(b.dataset.w);
      if (!worldOpen(this.ctx.profile, w)) {
        audio.play("tab");
        this.ctx.toast(`🔒 Bats le boss du monde ${w - 1} pour ouvrir ce monde`, "bad");
        return;
      }
      this.ctx.click();
      this.world = w;
      this.render(false);
    });
    $("advMap").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-lvl]");
      if (!b) return;
      const l = advLevel(b.dataset.lvl!)!;
      if (!levelOpen(this.ctx.profile, l.id)) {
        audio.play("tab");
        this.ctx.toast("🔒 Réussis d'abord le niveau précédent", "bad");
        return;
      }
      this.ctx.click();
      this.openLevel(l);
    });
    $("advFoot").addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-claim]")) {
        this.ctx.click();
        this.claim();
      }
    });
  }

  /** Affiche l'écran ; `jump` : ouvre le monde du niveau en cours. */
  render(jump = true) {
    this.wire();
    const p = this.ctx.profile;
    if (jump) this.world = currentLevel(p).world;
    $("advTotal").innerHTML = `⭐ <b>${advStars(p)}</b> / ${ADV_MAX_STARS}`;
    // mondes
    $("advWorlds").innerHTML = ADV_WORLDS.map((w) => {
      const open = worldOpen(p, w.n);
      return `<button role="tab" data-w="${w.n}" class="${w.n === this.world ? "sel" : ""}${open ? "" : " lock"}" aria-selected="${w.n === this.world}">
        <span class="aw-ico">${open ? w.emoji : "🔒"}</span><span class="aw-txt"><b>${w.name}</b><small>⭐ ${worldStars(p, w.n)} / 30</small></span></button>`;
    }).join("");
    // carte du monde
    const w = ADV_WORLDS[this.world - 1];
    const map = $("advMap");
    map.style.setProperty("--sky-a", w.sky[0]);
    map.style.setProperty("--sky-b", w.sky[1]);
    map.style.setProperty("--ground", w.ground);
    map.dataset.world = String(w.n);
    const cur = currentLevel(p);
    const deco = { 1: ["🌲", "🌳", "🍄", "🌲", "🌼", "🌳"], 2: ["🌴", "🐚", "🦀", "🌴", "⛱️", "🐠"], 3: ["❄️", "🏔️", "⛄", "❄️", "🐧", "🏔️"], 4: ["🌋", "🔥", "🪨", "🌋", "💀", "🔥"] }[w.n]!;
    const decoHtml = deco.map((d, i) => `<span class="adv-deco" style="left:${8 + i * 16 + ((i * 7) % 5)}%;top:${i % 2 ? 6 : 82}%">${d}</span>`).join("");
    const pts = SPOTS.map(([x, y]) => `${x},${y}`).join(" ");
    const doneIdx = w.levels.filter((l) => advStars(p, l.id) > 0).length;
    const donePts = SPOTS.slice(0, Math.max(1, doneIdx + (doneIdx < 10 ? 1 : 0))).map(([x, y]) => `${x},${y}`).join(" ");
    map.innerHTML = `${decoHtml}<svg class="adv-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline class="ap-bg" points="${pts}"/><polyline class="ap-done" points="${donePts}"/><polyline class="ap-dash" points="${pts}"/></svg>`;
    w.levels.forEach((l, i) => {
      const [x, y] = SPOTS[i];
      const st = advStars(p, l.id);
      const open = levelOpen(p, l.id);
      const b = document.createElement("button");
      b.dataset.lvl = l.id;
      b.className = `adv-node${l.goal === "boss" ? " boss" : ""}${open ? "" : " lock"}${st ? " done" : ""}${l.id === cur.id && open ? " cur" : ""}`;
      b.style.left = `${x}%`;
      b.style.top = `${y}%`;
      b.setAttribute("aria-label", `Niveau ${l.id}`);
      if (l.goal === "boss") {
        b.appendChild(head(l.boss!.characterId, l.boss!.skinId, 64, "an-boss", open ? "angry" : "normal"));
        b.insertAdjacentHTML("beforeend", `<span class="an-crown">👑</span>`);
      } else b.insertAdjacentHTML("beforeend", `<span class="an-num">${l.n}</span><span class="an-ico">${open ? GOAL_ICON[l.goal] : "🔒"}</span>`);
      if (open) b.insertAdjacentHTML("beforeend", starsHtml(st, "an-st"));
      map.appendChild(b);
      // le joueur attend sur le niveau à faire
      if (l.id === cur.id && open) {
        const me = head(p.characterId, p.equippedSkins[p.characterId], 56, `adv-me${l.goal === "boss" ? " on-boss" : ""}`, "happy");
        me.style.left = `${x}%`;
        me.style.top = `${y}%`;
        map.appendChild(me);
      }
    });
    this.renderFoot();
    this.onChange();
  }

  private renderFoot() {
    const p = this.ctx.profile;
    const ready = advClaimable(p);
    const next = nextMilestone(p);
    const have = advStars(p);
    const foot = $("advFoot");
    if (ready.length) {
      foot.innerHTML = `<span class="af-txt">🎁 Palier de <b>${ready[0].stars} ⭐</b> atteint !</span><span class="af-rw">${rewardChips(ready.map((r) => r.reward))}</span><button class="btn btn-green small" data-claim>RÉCUPÉRER</button>`;
      return;
    }
    if (!next) {
      foot.innerHTML = `<span class="af-txt">🏆 Toutes les récompenses de l'Aventure sont à toi !</span>`;
      return;
    }
    const prev = [...ADV_MILESTONES].reverse().find((m) => m.stars <= have)?.stars ?? 0;
    const k = Math.max(0, Math.min(1, (have - prev) / (next.stars - prev)));
    foot.innerHTML = `<span class="af-txt">Prochain cadeau à <b>${next.stars} ⭐</b></span><span class="af-bar"><i style="width:${k * 100}%"></i><em>${have} / ${next.stars}</em></span><span class="af-rw">${rewardChips([next.reward])}</span>`;
  }

  private claim() {
    const p = this.ctx.profile;
    const ready = advClaimable(p);
    if (!ready.length) return;
    const got: Granted[] = [];
    for (const m of ready) {
      grantAll(p, [m.reward], got, "adventure");
      p.adv.claimed.push(m.stars);
    }
    this.ctx.persist();
    this.ctx.wallet.countTo();
    showGranted(this.ctx, "🗺️ Cadeaux de l'Aventure", got, {});
    this.render(false);
  }

  /** Fiche d'un niveau : objectif, étoiles, récompense, JOUER. */
  openLevel(l: AdvLevel) {
    const p = this.ctx.profile;
    const st = advStars(p, l.id);
    const mode = getMode(l.modeId);
    const map = getMap(l.mapId);
    const texts = starTexts(l);
    const best = p.adv.best[l.id];
    const foes = l.goal === "boss"
      ? `👹 <b>${l.boss!.name}</b> · ${l.rules.boss!.hp} ❤️${l.bots.length ? ` + ${l.bots.length} acolyte${l.bots.length > 1 ? "s" : ""}` : ""}`
      : l.bots.length
        ? `⚔️ ${l.bots.length} adversaire${l.bots.length > 1 ? "s" : ""} (${[...new Set(l.bots.map((d) => DIFF[d]))].join(", ")})`
        : "🎯 Seul sur la carte";
    this.ctx.modal.open((sheet, close) => {
      sheet.classList.add("adv-sheet");
      sheet.insertAdjacentHTML(
        "beforeend",
        `<div class="as-head"><span class="as-num">${l.goal === "boss" ? "BOSS" : `NIVEAU ${l.id}`}</span><h2>${GOAL_ICON[l.goal]} ${goalText(l)}</h2></div>
        <p class="as-tags"><span>${mode.emoji ?? ""} ${mode.name}</span><span>🗺️ ${map.name}</span><span>⏱️ ${mmss(l.rules.duration)}</span></p>
        <p class="as-foes">${foes}</p>
        <ul class="as-stars">${texts.map((t, i) => `<li class="${i < st ? "on" : ""}">${starsHtml(i + 1, "small")}<span>${t}</span>${i < st ? "<b>✓</b>" : ""}</li>`).join("")}</ul>
        ${best !== undefined ? `<p class="as-best">🏁 Ton record : <b>${mmss(best)}</b></p>` : ""}
        <p class="as-rw">${st ? "✅ Récompense obtenue" : `1er passage : ${rewardChips(firstClearReward(l))}`}</p>`,
      );
      const go = document.createElement("button");
      go.className = "btn btn-play as-go";
      go.innerHTML = `<i data-icon="play"></i><span class="lbl">${st ? "REJOUER" : "JOUER"}</span>`;
      go.addEventListener("click", () => {
        this.ctx.click();
        close();
        this.onPlay(l);
      });
      sheet.appendChild(go);
      hydrateIcons(sheet);
    });
  }

  /**
   * Fin d'un niveau : enregistre les étoiles, donne les récompenses, puis
   * affiche le résultat (Carte / Rejouer / Suivant).
   */
  finish(l: AdvLevel, r: AdvResult, actions: { map: () => void; retry: () => void; next: (l: AdvLevel) => void }) {
    const p = this.ctx.profile;
    const coinsBefore = p.coins;
    const o = recordLevel(p, l, r.won, r.stars, r.time);
    const got: Granted[] = [];
    if (o.rewards.length) grantAll(p, o.rewards, got, "adventure");
    const pass = r.won ? addPassStars(p, ADV_PASS_STARS) : null;
    this.ctx.persist();
    this.world = l.world;
    this.render(false);
    const nxt = nextLevel(l.id);
    const canNext = r.won && !!nxt && levelOpen(p, nxt.id);
    const kick = r.won ? (r.stars === 3 ? "PARFAIT !" : "NIVEAU RÉUSSI !") : "RATÉ…";
    const why = r.won ? "" : r.why === "time" ? "⏱️ Temps écoulé" : "💥 Tu as été touché";
    this.ctx.modal.open(
      (sheet, close) => {
        sheet.classList.add("adv-res", r.won ? "won" : "lost");
        sheet.insertAdjacentHTML(
          "beforeend",
          `<p class="ar-lvl">${l.goal === "boss" ? `BOSS · ${l.boss!.name}` : `NIVEAU ${l.id}`}</p>
          <h2 class="ar-kick">${kick}</h2>
          ${r.won ? `<div class="ar-stars">${[1, 2, 3].map((i) => `<i class="${i <= o.stars ? "on" : ""}" style="animation-delay:${0.25 + i * 0.28}s">★</i>`).join("")}</div>` : `<p class="ar-why">${why}</p>`}
          <p class="ar-facts">${r.won && l.goal !== "survive" ? `⏱️ <b>${mmss(r.time)}</b>${o.record ? ' <em class="ar-rec">NOUVEAU RECORD !</em>' : ""}` : ""}${pass && pass.stars ? ` <span>⭐ +${pass.stars} Pass</span>` : ""}</p>
          ${got.length ? `<div class="ar-rw"><small>${o.first ? "1er passage" : ""}</small>${rewardChips(got.map((g) => g.reward))}</div>` : ""}
          ${!r.won ? `<p class="ar-tip">${tip(l)}</p>` : ""}`,
        );
        const row = document.createElement("div");
        row.className = "ar-actions";
        const mk = (cls: string, html: string, fn: () => void) => {
          const b = document.createElement("button");
          b.className = `btn ${cls}`;
          b.innerHTML = html;
          b.addEventListener("click", () => {
            this.ctx.click();
            close();
            fn();
          });
          row.appendChild(b);
        };
        mk("btn-ghost", "<span>🗺️ Carte</span>", actions.map);
        mk(canNext ? "btn-blue" : "btn-yellow", `<span>${r.won ? "↻ Rejouer" : "↻ RÉESSAYER"}</span>`, actions.retry);
        if (canNext) mk("btn-yellow", "<span>SUIVANT ▶</span>", () => actions.next(nxt!));
        sheet.appendChild(row);
      },
      { closable: false },
    );
    if (p.coins !== coinsBefore) this.ctx.wallet.countTo();
    if (r.won) audio.play(o.stars === 3 ? "win" : "levelup");
  }
}

/** Petit conseil après un échec. */
function tip(l: AdvLevel): string {
  switch (l.goal) {
    case "crates":
      return "💡 Pose tes bombes au milieu des caisses : une bombe peut en casser plusieurs.";
    case "gold":
      return "💡 Casse les caisses : elles cachent souvent de l'or. Et évite les explosions, tu perds la moitié de ton or !";
    case "survive":
      return "💡 Reste loin des autres et garde toujours une case de fuite.";
    case "boss":
      return `💡 ${l.boss!.name} a un bouclier après chaque coup : recule, puis reviens quand il clignote plus.`;
    default:
      return "💡 Ramasse des bonus au début (🔥 portée, 💣 bombes, 👟 vitesse) avant d'attaquer.";
  }
}

