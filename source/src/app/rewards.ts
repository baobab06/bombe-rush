/**
 * Récompense quotidienne et missions du jour (fenêtres modales).
 */
import { audio } from "../audio/audio";
import { DAILY_REWARDS } from "../meta/economy";
import { claimDaily, claimMission, dailyState, ensureMissions, missionDef, missionLabel } from "../meta/store";
import { haptics } from "../platform/haptics";
import { icon } from "../ui/icons";
import { fmt, type AppCtx } from "./ctx";

export function openDaily(ctx: AppCtx, onChange: () => void) {
  const p = ctx.profile;
  const st = dailyState(p);
  ctx.modal.open((sheet, close) => {
    sheet.insertAdjacentHTML("beforeend", `<h2>Récompense du jour</h2><p class="sub">Connecte-toi chaque jour : la récompense grossit !</p>`);
    const days = document.createElement("div");
    days.className = "days";
    let todayEl: HTMLElement | null = null;
    DAILY_REWARDS.forEach((amount, i) => {
      const d = document.createElement("div");
      const done = st.available ? i < st.index : i <= st.index;
      const today = st.available && i === st.index;
      d.className = "day" + (done ? " done" : "") + (today ? " today" : "") + (i === DAILY_REWARDS.length - 1 ? " big" : "");
      const coins = i >= 4 ? 3 : i >= 2 ? 2 : 1;
      d.innerHTML = `<small>Jour ${i + 1}</small><span class="stack">${'<i class="coin"></i>'.repeat(coins)}</span><b>${fmt(amount)}</b>${done ? `<span class="tick">${icon("check")}</span>` : ""}`;
      if (today) todayEl = d;
      days.appendChild(d);
    });
    sheet.appendChild(days);
    const actions = document.createElement("div");
    actions.className = "sheet-actions";
    const btn = document.createElement("button");
    btn.className = "btn btn-yellow";
    if (st.available) {
      btn.innerHTML = `${icon("gift")}<span>RÉCLAMER ${fmt(st.reward)}</span>`;
      btn.addEventListener("click", () => {
        const before = p.coins;
        const got = claimDaily(p);
        if (!got) return;
        ctx.persist();
        audio.play("unlock");
        haptics.pulse(30);
        ctx.wallet.earn(ctx.fx, todayEl ?? btn, got, before);
        const c = ctx.fx.center(todayEl ?? btn);
        ctx.fx.confetti(c.x, c.y, 50);
        todayEl?.classList.remove("today");
        todayEl?.classList.add("done");
        todayEl?.insertAdjacentHTML("beforeend", `<span class="tick">${icon("check")}</span>`);
        btn.disabled = true;
        btn.innerHTML = "<span>À DEMAIN !</span>";
        onChange();
        window.setTimeout(close, 1700);
      });
    } else {
      btn.disabled = true;
      btn.innerHTML = "<span>Reviens demain !</span>";
    }
    actions.appendChild(btn);
    sheet.appendChild(actions);
  });
}

export function openMissions(ctx: AppCtx, onChange: () => void) {
  const p = ctx.profile;
  ensureMissions(p);
  ctx.persist();
  ctx.modal.open((sheet) => {
    const now = new Date();
    const mid = new Date(now);
    mid.setHours(24, 0, 0, 0);
    const left = mid.getTime() - now.getTime();
    sheet.insertAdjacentHTML(
      "beforeend",
      `<h2>Missions du jour</h2><p class="sub">Nouvelles missions dans ${Math.floor(left / 3600000)} h ${String(Math.floor((left % 3600000) / 60000)).padStart(2, "0")}</p>`,
    );
    const list = document.createElement("div");
    list.className = "missions";
    const draw = () => {
      list.innerHTML = "";
      for (const m of p.missions.list) {
        const d = missionDef(m.id);
        if (!d) continue;
        const done = m.progress >= d.goal;
        const row = document.createElement("div");
        row.className = "mission" + (done ? " done" : "") + (m.claimed ? " claimed" : "");
        row.innerHTML = `<span class="mi">${d.icon}</span>
          <div><b>${missionLabel(d)}</b><span class="xpbar"><i style="width:${(m.progress / d.goal) * 100}%"></i></span><span class="prog">${m.progress} / ${d.goal}</span></div>`;
        const right = document.createElement("div");
        if (m.claimed) right.innerHTML = `<span class="reward">${icon("check")} Réclamée</span>`;
        else if (done) {
          const b = document.createElement("button");
          b.className = "btn btn-green small";
          b.innerHTML = `<span>RÉCLAMER</span><i class="coin"></i><span>${fmt(d.reward)}</span>`;
          b.addEventListener("click", () => {
            const before = p.coins;
            const got = claimMission(p, m.id);
            if (!got) return;
            ctx.persist();
            audio.play("buy");
            ctx.wallet.earn(ctx.fx, b, got, before);
            onChange();
            draw();
          });
          right.appendChild(b);
        } else right.innerHTML = `<span class="reward"><i class="coin"></i>${fmt(d.reward)}</span>`;
        row.appendChild(right);
        list.appendChild(row);
      }
    };
    draw();
    sheet.appendChild(list);
  });
}
