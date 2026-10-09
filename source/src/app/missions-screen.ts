/**
 * Écran MISSIONS : 3 missions du jour + 3 missions de la semaine.
 * États : EN COURS → TERMINÉE (bouton RÉCUPÉRER) → RÉCUPÉRÉE.
 */
import { audio } from "../audio/audio";
import { trustedNow } from "../meta/clock";
import type { Granted } from "../meta/grants";
import { DAILY_MISSION_XP, type Reward } from "../meta/progress-config";
import { claimMission, ensureMissions, missionDef, missionLabel, missionsToClaim } from "../meta/store";
import { claimWeekly, ensureWeekly, weekLeft, weeklyDef, weeklyLabel, weeklyRewards, weeklyToClaim } from "../meta/weekly";
import { icon } from "../ui/icons";
import { fmt, type AppCtx } from "./ctx";
import { coinsOf, rewardChip } from "./rewards";

const $ = (id: string) => document.getElementById(id)!;

const dur = (ms: number) => {
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)} j ${h % 24} h`;
  return `${h} h ${String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0")}`;
};

export class MissionsScreen {
  tab: "daily" | "weekly" = "daily";

  constructor(private ctx: AppCtx, private onChange: () => void) {
    $("missionTabs").querySelectorAll<HTMLButtonElement>("button.tab").forEach((b) =>
      b.addEventListener("click", () => {
        audio.play("tab");
        this.tab = b.dataset.tab as "daily" | "weekly";
        this.render();
      }),
    );
  }

  render() {
    const p = this.ctx.profile;
    ensureMissions(p);
    ensureWeekly(p);
    this.ctx.persist();
    const now = trustedNow(p);
    $("missionTabs").querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.classList.toggle("sel", b.dataset.tab === this.tab));
    const nd = missionsToClaim(p);
    const nw = weeklyToClaim(p);
    $("misDotD").hidden = !nd;
    $("misDotD").textContent = String(nd);
    $("misDotW").hidden = !nw;
    $("misDotW").textContent = String(nw);
    const mid = new Date(now);
    mid.setHours(24, 0, 0, 0);
    $("missionTimer").textContent = this.tab === "daily" ? `Nouvelles missions dans ${dur(mid.getTime() - now.getTime())}` : `Nouvelles missions dans ${dur(weekLeft(now))}`;
    const list = $("missionList");
    list.innerHTML = "";
    const rows =
      this.tab === "daily"
        ? p.missions.list.map((m) => {
            const d = missionDef(m.id)!;
            const rw: Reward[] = [{ kind: "coins", amount: d.reward }, { kind: "xp", amount: DAILY_MISSION_XP }];
            return { m, icon: d.icon, label: missionLabel(d), goal: d.goal, rewards: rw, claim: () => claimMission(p, m.id) };
          })
        : p.weekly.list.map((m) => {
            const d = weeklyDef(m.id)!;
            return { m, icon: d.icon, label: weeklyLabel(d), goal: d.goal, rewards: weeklyRewards(d), claim: () => claimWeekly(p, m.id) };
          });
    rows.forEach((r, i) => {
      const done = r.m.progress >= r.goal;
      const state = r.m.claimed ? "claimed" : done ? "done" : "run";
      const row = document.createElement("div");
      row.className = `mission ${state}`;
      row.dataset.id = r.m.id;
      row.style.animationDelay = `${i * 60}ms`;
      const badge = state === "claimed" ? "RÉCUPÉRÉE" : state === "done" ? "TERMINÉE" : "EN COURS";
      row.innerHTML = `<span class="mi">${r.icon}</span>
        <div class="mb"><b><span class="mstate">${badge}</span>${r.label}</b>
          <span class="mprog"><span class="xpbar"><i style="width:${(Math.min(r.m.progress, r.goal) / r.goal) * 100}%"></i></span><span class="prog">${fmt(Math.min(r.m.progress, r.goal))} / ${fmt(r.goal)}</span><span class="mrw">${r.rewards.map(rewardChip).join("")}</span></span></div>`;
      const right = document.createElement("div");
      right.className = "mact";
      if (state === "claimed") right.innerHTML = `<span class="reward">${icon("check")}</span>`;
      else if (state === "done") {
        const b = document.createElement("button");
        b.className = "btn btn-green small";
        b.innerHTML = `<span>RÉCUPÉRER</span>`;
        b.addEventListener("click", () => {
          const before = p.coins;
          const got: Granted[] | null = r.claim();
          if (!got) return;
          this.ctx.persist(); // avant toute animation : impossible de réclamer deux fois
          audio.play("buy");
          const coins = coinsOf(got);
          if (coins) this.ctx.wallet.earn(this.ctx.fx, b, coins, before);
          const c = this.ctx.fx.center(b);
          this.ctx.fx.confetti(c.x, c.y, 26);
          const extra = got.filter((g) => g.reward.kind !== "coins" && g.reward.kind !== "xp");
          for (const g of extra) this.ctx.toast(`${g.icon} ${g.label}${g.source?.startsWith("Niveau") ? ` (${g.source})` : ""}`, "good");
          this.onChange();
          this.render();
        });
        right.appendChild(b);
      } else right.innerHTML = `<span class="pct">${Math.floor((r.m.progress / r.goal) * 100)}%</span>`;
      row.appendChild(right);
      list.appendChild(row);
    });
    const note = document.createElement("p");
    note.className = "hint mis-note";
    note.textContent =
      this.tab === "daily"
        ? "Les missions avancent toutes seules en jouant (solo et en ligne). Chaque mission rapporte des pièces et de l'XP."
        : "Missions plus longues, plus grosses récompenses (parfois un coffre). Renouvelées chaque lundi.";
    list.appendChild(note);
  }
}
