/**
 * Écran du PASS DE SAISON : panneau (palier, étoiles, Premium) + piste des
 * 100 paliers (ligne gratuite / ligne Premium), et fenêtre d'achat Premium.
 */
import { CHESTS, type Reward } from "../meta/progress-config";
import { getItem } from "../meta/catalog";
import { SKINS } from "../core/characters";
import { getEmote } from "../core/cosmetics";
import {
  PASS_RULES, buyPremium, claimPass, ensurePass, passClaimable, passSeason, passSeasonEnd, passStarsInTier, passTier, passTrack, premiumSummary,
} from "../meta/pass";
import { audio } from "../audio/audio";
import { drawCharacter, lookOf } from "../render/bodies";
import { fmt, type AppCtx } from "./ctx";
import { showGranted } from "./rewards";

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Icône + texte court d'une récompense de palier. */
export function cellOf(r: Reward): { ic: string; lb: string; rare?: boolean } {
  switch (r.kind) {
    case "coins":
      return { ic: "🪙", lb: `${fmt(r.amount)} pièces` };
    case "bombers":
      return { ic: "💣", lb: `${fmt(r.amount)} bombers` };
    case "xp":
      return { ic: "✨", lb: `${fmt(r.amount)} XP` };
    case "stars":
      return { ic: "⭐", lb: `${fmt(r.amount)} ⭐` };
    case "chest":
      return { ic: "🎁", lb: CHESTS[r.tier].name, rare: r.tier === "legend" || r.tier === "epic" };
    case "theme": {
      const n = SKINS.find((s) => s.theme === r.id)?.name ?? "";
      return { ic: "🎅", lb: `Skin ${n} (tous les persos)`, rare: true };
    }
    case "item": {
      const it = getItem(r.id);
      if (!it) return { ic: "🎉", lb: "Objet" };
      const ic = it.kind === "emote" ? getEmote(it.id)?.emoji ?? "😀" : it.kind === "boom" ? "💥" : it.kind === "trail" ? "❄️" : it.kind === "title" ? "🏷️" : "🎉";
      const kind = it.kind === "emote" ? "Emote" : it.kind === "boom" ? "Explosion" : it.kind === "trail" ? "Traînée" : it.kind === "title" ? "Titre" : "";
      return { ic, lb: `${kind} ${it.name}`.trim(), rare: true };
    }
  }
}

export class PassScreen {
  private wired = false;

  constructor(
    private ctx: AppCtx,
    private onChange: () => void = () => {},
  ) {}

  private wire() {
    if (this.wired) return;
    this.wired = true;
    $("psBuy").addEventListener("click", () => {
      this.ctx.click();
      if (!this.ctx.profile.pass.premium) this.openPremium();
    });
    $("psClaimAll").addEventListener("click", () => {
      this.ctx.click();
      this.claim();
    });
    $("psTrack").addEventListener("click", (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>(".cell");
      if (!cell) return;
      const line = cell.dataset.line as "free" | "prem";
      const tier = Number(cell.dataset.tier);
      if (cell.classList.contains("ready")) {
        this.ctx.click();
        this.claim(line, tier);
      } else if (cell.classList.contains("lock")) {
        this.ctx.click();
        this.openPremium();
      } else {
        audio.play("tab");
        const r = (line === "free" ? passTrack().free : passTrack().prem)[tier];
        if (r) this.ctx.toast(`Palier ${tier}${line === "prem" ? " Premium" : ""} : ${cellOf(r).lb}`, "hot");
      }
    });
  }

  private claim(line?: "free" | "prem", tier?: number) {
    const p = this.ctx.profile;
    const got = claimPass(p, line, tier);
    if (!got.length) return;
    this.ctx.persist();
    this.ctx.wallet.countTo();
    showGranted(this.ctx, line ? `⭐ Palier ${tier}` : "⭐ Récompenses du pass", got, {});
    this.render(false);
    this.onChange();
  }

  /** Affiche l'écran ; `scroll` : place la piste sur le palier en cours. */
  render(scroll = true) {
    this.wire();
    const p = this.ctx.profile;
    ensurePass(p);
    const season = passSeason();
    const track = passTrack(season);
    const tier = passTier(p);
    const days = Math.max(0, Math.ceil((passSeasonEnd() - Date.now()) / 86400_000));
    $("psSeason").textContent = `${season.emoji} SAISON ${season.name.toUpperCase()}`;
    $("psTime").textContent = days > 1 ? `Encore ${days} jours` : days === 1 ? "Dernier jour !" : "Se termine aujourd'hui";
    $("psTierNum").textContent = String(tier);
    $("psTierTxt").textContent = `PALIER ${tier}`;
    const inTier = passStarsInTier(p);
    $("psBarFill").style.width = `${(inTier / PASS_RULES.starsPerTier) * 100}%`;
    $("psBarTxt").textContent = tier >= PASS_RULES.tiers ? "PASS TERMINÉ 🏆" : `${inTier} / ${PASS_RULES.starsPerTier} ⭐`;
    const buy = $("psBuy");
    buy.classList.toggle("on", p.pass.premium);
    buy.innerHTML = p.pass.premium ? "👑 PREMIUM ACTIVÉ<small>Toutes les récompenses débloquées</small>" : `👑 PASS PREMIUM<small>${PASS_RULES.premiumPrice} 💣</small>`;
    const claimable = passClaimable(p, track);
    $("psClaimAll").hidden = claimable.length < 2;
    // piste : 100 colonnes
    const cols: string[] = [];
    for (let t = 1; t <= PASS_RULES.tiers; t++) {
      const f = track.free[t];
      const r = track.prem[t];
      const reached = t <= tier;
      const num = `<div class="ps-num ${reached ? "done" : ""} ${t === tier + 1 ? "next" : ""}"><span>${t}</span></div>`;
      let fc = `<div class="cell free empty"></div>`;
      if (f) {
        const c = cellOf(f);
        const got = p.pass.free.includes(t);
        const st = got ? "got" : reached ? "ready" : "";
        fc = `<button class="cell free ${st} ${c.rare ? "rare" : ""}" data-line="free" data-tier="${t}"><span class="ic">${c.ic}</span><span class="lb">${esc(c.lb)}</span>${st === "ready" ? '<span class="claim">RÉCUPÉRER</span>' : ""}</button>`;
      }
      const c = cellOf(r);
      const got = p.pass.prem.includes(t);
      const st = !p.pass.premium ? "lock" : got ? "got" : reached ? "ready" : "";
      const pc = `<button class="cell prem ${st} ${c.rare ? "rare" : ""} ${t === PASS_RULES.tiers ? "big" : ""}" data-line="prem" data-tier="${t}"><span class="ic">${c.ic}</span><span class="lb">${esc(c.lb)}</span>${st === "ready" ? '<span class="claim">RÉCUPÉRER</span>' : ""}</button>`;
      cols.push(`<div class="ps-col ${reached ? "reached" : ""}" data-col="${t}">${num}${fc}${pc}</div>`);
    }
    const el = $("psTrack");
    const keep = el.querySelector(".ps-scroll")?.scrollLeft ?? 0;
    el.innerHTML = `<div class="ps-labels"><span></span><div class="ps-rowlab free">GRATUIT</div><div class="ps-rowlab prem">PREMIUM 👑</div></div><div class="ps-scroll">${cols.join("")}</div>`;
    const sc = el.querySelector<HTMLElement>(".ps-scroll")!;
    if (scroll) {
      const first = claimable[0]?.tier ?? tier + 1;
      const col = sc.querySelector<HTMLElement>(`[data-col="${Math.max(1, Math.min(PASS_RULES.tiers, first))}"]`);
      requestAnimationFrame(() => {
        if (col) sc.scrollLeft = Math.max(0, col.offsetLeft - sc.clientWidth * 0.15);
      });
    } else sc.scrollLeft = keep;
  }

  /** Fenêtre d'achat du Premium. */
  openPremium() {
    const p = this.ctx.profile;
    if (p.pass.premium) return;
    const season = passSeason();
    const sum = premiumSummary(passTrack(season));
    const ex = season.exclusives;
    const name = (id?: string) => (id ? getItem(id)?.name ?? "" : "");
    const skin = ex ? SKINS.find((s) => s.theme === ex.theme)?.name ?? "" : "";
    const chests = sum.chests.legend + sum.chests.epic + sum.chests.rare + sum.chests.common;
    const rows = [
      ex ? `<div class="pp-item"><span>🎅</span>Skin ${esc(skin)} (tous les persos)<small>PALIER 100</small></div>` : "",
      ex ? `<div class="pp-item"><span>💥</span>Explosion ${esc(name(ex.boom))}<small>ÉPIQUE</small></div>` : "",
      ex ? `<div class="pp-item"><span>${getEmote(ex.emote)?.emoji ?? "😀"}</span>Traînée ${esc(name(ex.trail))} + emote + titre<small>EXCLUSIFS</small></div>` : "",
      `<div class="pp-item"><span>🎁</span>${chests} coffres dont ${sum.chests.legend} légendaires<small>+ ${fmt(sum.coins)} 🪙</small></div>`,
      `<div class="pp-item"><span>💣</span>${sum.bombers} bombers récupérés<small>sur ${PASS_RULES.premiumPrice} !</small></div>`,
    ].join("");
    this.ctx.modal.open(
      (sheet, close) => {
        sheet.insertAdjacentHTML(
          "beforeend",
          `<h2>👑 PASS PREMIUM ${season.emoji}</h2>
          <div class="pp-grid">
            <div class="pp-hero"><canvas width="640" height="420"></canvas><em>${ex ? "PALIER 100 · EXCLUSIF" : `SAISON ${esc(season.name.toUpperCase())}`}</em><b>${ex ? `SKIN ${esc(skin.toUpperCase())} · tous tes persos` : "Une récompense à chaque palier"}</b></div>
            <div class="pp-list">${rows}
              <div class="pp-buy"><button class="btn btn-yellow pp-go"><span>ACHETER · ${PASS_RULES.premiumPrice} 💣</span></button></div>
              <p class="pp-note">Jusqu'à la fin de la saison · paliers déjà atteints débloqués tout de suite</p>
            </div>
          </div>`,
        );
        this.drawHero(sheet.querySelector("canvas")!, ex?.theme);
        sheet.querySelector(".pp-go")!.addEventListener("click", () => {
          this.ctx.click();
          const r = buyPremium(p);
          if (!r.ok) {
            if (r.reason === "bombers") {
              this.ctx.toast(`Il te manque ${r.missing} bombers 💣`, "bad");
              close();
              this.ctx.openShop(undefined, "bank");
            }
            return;
          }
          this.ctx.persist();
          this.ctx.wallet.countTo();
          audio.play("win");
          close();
          this.ctx.toast("👑 Pass Premium activé !", "hot");
          this.render(true);
          this.onChange();
        });
      },
      { cls: "prem-sheet" },
    );
  }

  private drawHero(c: HTMLCanvasElement, theme?: string) {
    const x = c.getContext("2d");
    if (!x) return;
    for (let i = 0; i < 26; i++) {
      x.fillStyle = "rgba(255,255,255,.85)";
      x.beginPath();
      x.arc((i * 97) % 640, (i * 53) % 330, 3 + (i % 3) * 2, 0, 7);
      x.fill();
    }
    const opt = (t: number, wave = 0) => ({ faceX: 0, faceY: 1, walk: 0, moving: false, t, expr: "happy" as const, wave, noShadow: true });
    const ch = this.ctx.profile.characterId;
    const other = ch === "drako" ? "renard" : "drako";
    drawCharacter(x, 190, 260, 220, lookOf(ch, theme ? `${ch}-${theme}` : undefined), opt(0.4));
    drawCharacter(x, 450, 260, 220, lookOf(other, theme ? `${other}-${theme}` : undefined), opt(0.9, 0.6));
  }

  /** Nouvelle saison : récompenses oubliées données d'office. */
  checkSeasonEnd() {
    const end = ensurePass(this.ctx.profile);
    if (!end) return;
    this.ctx.persist();
    this.onChange();
    if (end.granted.length) showGranted(this.ctx, "⭐ Fin de la saison du pass", end.granted, { sub: "Tes récompenses pas encore récupérées" });
  }
}
