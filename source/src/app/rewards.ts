/**
 * Récompenses à l'écran : calendrier de connexion (7 jours) et fenêtre
 * « Tu as gagné… » commune à toutes les sources (missions, succès, rangs…).
 */
import { audio } from "../audio/audio";
import { RARITY_LABEL, getCharacter } from "../core/characters";
import { getItem } from "../meta/catalog";
import { rewardIcon, rewardText, type Granted } from "../meta/grants";
import { CHESTS, LOGIN_REWARDS, type Reward } from "../meta/progress-config";
import { claimDaily, dailyState } from "../meta/store";
import { haptics } from "../platform/haptics";
import { icon } from "../ui/icons";
import { drawItemArt } from "../ui/items";
import { fmt, type AppCtx } from "./ctx";

/** Petite étiquette de récompense (avant de l'avoir gagnée). */
export function rewardChip(r: Reward): string {
  if (r.kind === "coins") return `<span class="rw-chip coins"><i class="coin"></i>${fmt(r.amount)}</span>`;
  if (r.kind === "xp") return `<span class="rw-chip xp">${fmt(r.amount)} XP</span>`;
  if (r.kind === "chest") return `<span class="rw-chip chest c-${r.tier}">🎁 ${CHESTS[r.tier].name.replace("Coffre ", "")}</span>`;
  const it = getItem(r.id);
  return `<span class="rw-chip item r-${it?.rarity ?? "common"}">${rewardIcon(r)} ${rewardText(r)}</span>`;
}

/** Pièces réellement ajoutées (pour l'animation du porte-monnaie). */
export const coinsOf = (list: Granted[]) => list.reduce((a, g) => a + g.coins, 0);

/** Carte d'un objet gagné (coffres, fenêtre de récompenses). */
export function grantCard(g: Granted, ctx: AppCtx): HTMLElement {
  const el = document.createElement("div");
  el.className = `gcard ${g.rarity ? "r-" + g.rarity : g.chest ? "c-" + g.chest : g.reward.kind}${g.duplicate ? " dup" : ""}`;
  const it = g.itemId ? getItem(g.itemId) : undefined;
  if (it) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 120;
    const p = ctx.profile;
    drawItemArt(cv, it, { characterId: p.characterId, skinId: p.equippedSkins[p.characterId] });
    el.appendChild(cv);
    const kind = { skin: "Skin", accessory: "Accessoire", trail: "Effet", emote: "Emote", boom: "Explosion", title: "Titre", character: "Perso" }[it.kind];
    const name = it.kind === "skin" ? `${getCharacter(it.characterId!).name} ${it.name}` : it.name;
    el.insertAdjacentHTML("beforeend", `<small>${kind} ${RARITY_LABEL[it.rarity].toLowerCase()}</small><b>${name}</b>${g.duplicate ? `<em>doublon → <i class="coin"></i>+${fmt(g.coins)}</em>` : `<em class="new">NOUVEAU !</em>`}`);
  } else {
    const big = g.reward.kind === "coins" ? '<i class="coin big"></i>' : g.reward.kind === "chest" ? '<span class="gc-emo">🎁</span>' : '<span class="gc-emo">✨</span>';
    el.innerHTML = `${big}<b>${g.label}</b>`;
  }
  if (g.source) el.title = g.source;
  return el;
}

/** Fenêtre « Tu as gagné… » (toutes les sources). */
export function showGranted(ctx: AppCtx, title: string, list: Granted[], opts: { before?: number; sub?: string; onClose?: () => void } = {}) {
  if (!list.length) return opts.onClose?.();
  ctx.modal.open(
    (sheet, close) => {
      sheet.insertAdjacentHTML("beforeend", `<h2>${title}</h2>${opts.sub ? `<p class="sub">${opts.sub}</p>` : ""}`);
      const row = document.createElement("div");
      row.className = "grant-row";
      list.forEach((g, i) => {
        const c = grantCard(g, ctx);
        c.style.animationDelay = `${0.08 + i * 0.12}s`;
        row.appendChild(c);
      });
      sheet.appendChild(row);
      const actions = document.createElement("div");
      actions.className = "sheet-actions";
      const ok = document.createElement("button");
      ok.className = "btn btn-yellow";
      ok.innerHTML = "<span>SUPER !</span>";
      ok.addEventListener("click", () => {
        ctx.click();
        close();
      });
      actions.appendChild(ok);
      sheet.appendChild(actions);
      audio.play("unlock");
      haptics.pulse(25);
      const c = ctx.fx.center(row);
      ctx.fx.confetti(c.x, c.y, 40);
      const coins = coinsOf(list);
      if (coins > 0 && opts.before !== undefined) ctx.wallet.earn(ctx.fx, row, coins, opts.before);
      else ctx.wallet.sync();
    },
    { onClose: opts.onClose, cls: "grant-sheet" },
  );
}

export function openDaily(ctx: AppCtx, onChange: () => void) {
  const p = ctx.profile;
  const st = dailyState(p);
  ctx.modal.open((sheet, close) => {
    sheet.insertAdjacentHTML(
      "beforeend",
      `<h2>Connexion du jour</h2><p class="sub">Un cadeau chaque jour · jour ${st.index + 1}/7 · un jour raté ne fait rien perdre</p>`,
    );
    const days = document.createElement("div");
    days.className = "days";
    let todayEl: HTMLElement | null = null;
    LOGIN_REWARDS.forEach((rw, i) => {
      const d = document.createElement("div");
      const done = st.available ? i < st.index : i <= st.index;
      const today = st.available && i === st.index;
      const r = rw[0];
      d.className = "day" + (done ? " done" : "") + (today ? " today" : "") + (i === LOGIN_REWARDS.length - 1 ? " big" : "");
      const art = r.kind === "chest" ? '<span class="stack chest-ico">🎁</span>' : `<span class="stack">${'<i class="coin"></i>'.repeat(i >= 4 ? 3 : i >= 2 ? 2 : 1)}</span>`;
      const lbl = r.kind === "coins" ? fmt(r.amount) : r.kind === "chest" ? CHESTS[r.tier].name.replace("Coffre ", "Coffre ") : rewardText(r);
      d.innerHTML = `<small>Jour ${i + 1}</small>${art}<b>${lbl}</b>${done ? `<span class="tick">${icon("check")}</span>` : ""}`;
      if (today) todayEl = d;
      days.appendChild(d);
    });
    sheet.appendChild(days);
    const actions = document.createElement("div");
    actions.className = "sheet-actions";
    const btn = document.createElement("button");
    btn.className = "btn btn-yellow";
    btn.id = "btnClaimDaily";
    if (st.available) {
      btn.innerHTML = `${icon("gift")}<span>RÉCUPÉRER</span>`;
      btn.addEventListener("click", () => {
        const before = p.coins;
        const got = claimDaily(p);
        if (!got) return;
        ctx.persist(); // sauvegardé avant l'animation
        audio.play("unlock");
        haptics.pulse(30);
        const coins = coinsOf(got);
        if (coins) ctx.wallet.earn(ctx.fx, todayEl ?? btn, coins, before);
        const c = ctx.fx.center(todayEl ?? btn);
        ctx.fx.confetti(c.x, c.y, 50);
        todayEl?.classList.remove("today");
        todayEl?.classList.add("done", "claimed-now");
        todayEl?.insertAdjacentHTML("beforeend", `<span class="tick">${icon("check")}</span>`);
        btn.disabled = true;
        btn.innerHTML = "<span>À DEMAIN !</span>";
        onChange();
        if (got.some((g) => g.chest)) ctx.toast("🎁 Coffre ajouté : ouvre-le dans COFFRES !", "good");
        window.setTimeout(close, 1700);
      });
    } else {
      btn.disabled = true;
      btn.innerHTML = "<span>Déjà récupéré · reviens demain !</span>";
    }
    actions.appendChild(btn);
    sheet.appendChild(actions);
  });
}
