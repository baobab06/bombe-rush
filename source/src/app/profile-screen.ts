/**
 * Écran PROFIL : carte du joueur (niveau, titre, rang, série), succès,
 * maîtrise des personnages et statistiques.
 */
import { audio } from "../audio/audio";
import { CHARACTERS } from "../core/characters";
import { getTitle } from "../core/cosmetics";
import { achDesc, achievementList, achievementsToClaim, claimAchievement } from "../meta/achievements";
import { countOwned, equippedSkin } from "../meta/store";
import { masteryOf, nextMasteryStep } from "../meta/mastery";
import { MASTERY_MAX, levelXp, masteryXp } from "../meta/progress-config";
import { rankProgress } from "../meta/rank";
import { drawPortrait } from "../ui/thumbs";
import { fmt, type AppCtx } from "./ctx";
import { coinsOf, rewardChip, showGranted } from "./rewards";

const $ = (id: string) => document.getElementById(id)!;
type Tab = "ach" | "mastery" | "stats";

export class ProfileScreen {
  tab: Tab = "ach";

  constructor(private ctx: AppCtx, private onChange: () => void, private actions: { rename(): void; titles(): void; rank(): void }) {
    $("profTabs").querySelectorAll<HTMLButtonElement>("button").forEach((b) =>
      b.addEventListener("click", () => {
        audio.play("tab");
        this.tab = b.dataset.tab as Tab;
        this.render();
      }),
    );
  }

  render() {
    this.renderCard();
    $("profTabs").querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.classList.toggle("sel", b.dataset.tab === this.tab));
    const n = achievementsToClaim(this.ctx.profile);
    $("achDot").hidden = !n;
    $("achDot").textContent = String(n);
    const body = $("profBody");
    body.innerHTML = "";
    body.scrollTop = 0;
    if (this.tab === "ach") this.renderAch(body);
    else if (this.tab === "mastery") this.renderMastery(body);
    else this.renderStats(body);
  }

  private renderCard() {
    const p = this.ctx.profile;
    const card = $("profCard");
    const rp = rankProgress(p.rank.points);
    const title = getTitle(p.equipped.title);
    card.innerHTML = `
      <canvas class="prof-ava" width="160" height="160"></canvas>
      <div class="prof-id"><b id="profName"></b><button class="ptitle-btn" id="profTitle">🏷️ ${title?.name ?? "Sans titre"} ✏️</button></div>
      <div class="prof-lvl"><span class="lvl">${p.level}</span><span class="xpbar"><i style="width:${(p.xp / levelXp(p.level)) * 100}%"></i></span><small>${fmt(p.xp)} / ${fmt(levelXp(p.level))} XP</small></div>
      <button class="prof-rank" id="profRank" style="--rc:${rp.rank.color}"><span>${rp.rank.icon}</span><b>${rp.rank.name}</b><small>${fmt(p.rank.points)} pts</small></button>
      <div class="prof-streak"><span>🔥 Série <b>${p.winStreak}</b></span><span>Record <b>${Math.max(p.stats.bestWinStreak, p.winStreak)}</b></span></div>
      <button class="btn-link" id="profRename">Changer de pseudo</button>`;
    card.querySelector<HTMLElement>("#profName")!.textContent = p.name;
    drawPortrait(card.querySelector("canvas")!, p.characterId, equippedSkin(p, p.characterId), 1, 0, p.equipped.accessory);
    card.querySelector("#profTitle")!.addEventListener("click", () => {
      this.ctx.click();
      this.actions.titles();
    });
    card.querySelector("#profRank")!.addEventListener("click", () => {
      this.ctx.click();
      this.actions.rank();
    });
    card.querySelector("#profRename")!.addEventListener("click", () => {
      this.ctx.click();
      this.actions.rename();
    });
  }

  private renderAch(body: HTMLElement) {
    const p = this.ctx.profile;
    const list = achievementList(p);
    // à récupérer d'abord, puis débloqués, puis les plus avancés
    list.sort((a, b) => Number(b.unlocked && !b.claimed) - Number(a.unlocked && !a.claimed) || Number(a.unlocked) - Number(b.unlocked) || b.value / b.def.goal - a.value / a.def.goal);
    const got = list.filter((a) => a.unlocked).length;
    body.insertAdjacentHTML("beforeend", `<div class="ach-head"><b>${got} / ${list.length}</b> succès débloqués<span class="xpbar"><i style="width:${(got / list.length) * 100}%"></i></span></div>`);
    const grid = document.createElement("div");
    grid.className = "ach-grid";
    for (const a of list) {
      const el = document.createElement("div");
      const state = a.claimed ? "claimed" : a.unlocked ? "ready" : "locked";
      el.className = `ach ${state}`;
      el.dataset.id = a.def.id;
      el.innerHTML = `<span class="ach-ico">${a.def.icon}</span>
        <div class="ach-b"><b>${a.def.name}</b><small>${achDesc(a.def)}</small>
        <span class="mprog"><span class="xpbar"><i style="width:${(a.value / a.def.goal) * 100}%"></i></span><span class="prog">${fmt(a.value)} / ${fmt(a.def.goal)}</span><span class="mrw">${a.def.reward.map(rewardChip).join("")}</span></span></div>`;
      if (state === "ready") {
        const btn = document.createElement("button");
        btn.className = "btn btn-green small";
        btn.innerHTML = "<span>RÉCUPÉRER</span>";
        btn.addEventListener("click", () => {
          const before = p.coins;
          const g = claimAchievement(p, a.def.id);
          if (!g) return;
          this.ctx.persist();
          this.onChange();
          showGranted(this.ctx, `Succès : ${a.def.name}`, g, { before, onClose: () => this.render() });
          if (!coinsOf(g)) this.ctx.wallet.sync();
        });
        el.appendChild(btn);
      } else if (state === "claimed") el.insertAdjacentHTML("beforeend", `<span class="ach-ok">✔</span>`);
      else el.insertAdjacentHTML("beforeend", `<span class="ach-lock">🔒</span>`);
      grid.appendChild(el);
    }
    body.appendChild(grid);
  }

  private renderMastery(body: HTMLElement) {
    const p = this.ctx.profile;
    body.insertAdjacentHTML("beforeend", `<p class="hint">Seul le personnage avec lequel tu joues progresse. Les récompenses sont uniquement cosmétiques.</p>`);
    const grid = document.createElement("div");
    grid.className = "mast-grid";
    for (const c of CHARACTERS) {
      const m = masteryOf(p, c.id);
      const own = p.ownedCharacters.includes(c.id);
      const next = nextMasteryStep(p, c.id);
      const el = document.createElement("div");
      el.className = "mast" + (own ? "" : " locked") + (c.id === p.characterId ? " sel" : "");
      const cv = document.createElement("canvas");
      cv.width = cv.height = 96;
      el.appendChild(cv);
      drawPortrait(cv, c.id, equippedSkin(p, c.id), 1, 0, null, 0.95);
      const max = m.level >= MASTERY_MAX;
      el.insertAdjacentHTML(
        "beforeend",
        `<div class="mast-b"><b>${c.name} <span class="lvl">${m.level}</span></b>
          <span class="mprog"><span class="xpbar"><i style="width:${max ? 100 : (m.xp / masteryXp(m.level)) * 100}%"></i></span><span class="prog">${max ? "MAX" : `${fmt(m.xp)} / ${fmt(masteryXp(m.level))}`}</span></span>
          <small>🎮 ${m.games} · 🏆 ${m.wins} · 💥 ${m.kills}</small>
          ${next ? `<span class="mrw"><em>Niv. ${next.level} :</em>${next.rewards.map(rewardChip).join("")}</span>` : `<span class="mrw"><em>Maîtrise complète !</em></span>`}</div>`,
      );
      grid.appendChild(el);
    }
    body.appendChild(grid);
  }

  private renderStats(body: HTMLElement) {
    const p = this.ctx.profile;
    const cc = countOwned(p);
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const rows: [string, string][] = [
      [fmt(p.played), "Parties"],
      [fmt(p.wins), "Victoires"],
      [p.played ? `${Math.round((p.wins / p.played) * 100)} %` : "–", "Taux de victoire"],
      [fmt(p.kills), "Éliminations"],
      [fmt(p.bombsPlaced), "Bombes posées"],
      [fmt(p.blocksDestroyed), "Blocs détruits"],
      [fmt(p.bonusesPicked), "Bonus ramassés"],
      [mmss(p.bestSurvival), "Meilleure survie"],
      [String(Math.max(p.stats.bestWinStreak, p.winStreak)), "Meilleure série"],
      [fmt(p.stats.expertWins), "Victoires Expert"],
      [fmt(p.stats.chestsOpened), "Coffres ouverts"],
      [fmt(p.stats.missionsClaimed), "Missions réussies"],
      [fmt(p.stats.loginDays), "Jours de connexion"],
      [fmt(p.coinsEarned), "Pièces gagnées"],
      [`${cc.owned}/${cc.total}`, "Collection"],
      [fmt(p.stats.onlinePlayed), "Parties en ligne"],
    ];
    body.insertAdjacentHTML("beforeend", `<div class="stats-mini big">${rows.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>`);
  }
}
