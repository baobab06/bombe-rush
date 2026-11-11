/**
 * Écran RANG : rang actuel, points, progression, paliers et historique.
 * Rang personnel ; le classement mondial vérifié est dans world-screen.ts.
 */
import { STAKES, placeMedal, placeName, type StakeId } from "../meta/economy";
import { MODES } from "../core/modes";
import { RANK_RULES } from "../meta/progress-config";
import { STEPS, compBots, rankProgress, seasonEnd, trophyDelta } from "../meta/rank";
import { fmt, type AppCtx } from "./ctx";
import { rewardChip } from "./rewards";

const sgn = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");
const LVL: Record<string, string> = { easy: "Facile", normal: "Moyen", hard: "Difficile", expert: "Expert" };

/** « Facile » ou « Moyen / Difficile » selon les adversaires du moment. */
function botsLabel(points: number): string {
  const u = [...new Set(compBots(points))];
  return u.map((d) => LVL[d] ?? d).join(" / ");
}

function daysLeft(): string {
  const h = Math.max(0, Math.floor((seasonEnd() - Date.now()) / 3600_000));
  return h >= 48 ? `${Math.floor(h / 24)} jours` : h >= 1 ? `${h} h` : "moins d'une heure";
}

export class RankScreen {
  constructor(private ctx: AppCtx) {}

  render() {
    const p = this.ctx.profile;
    const pts = p.rank.points;
    const rp = rankProgress(pts);
    const body = document.getElementById("rankBody")!;
    const soft = pts < RANK_RULES.softUnder;
    const table = [1, 2, 3, 4].map((c) => `<span>${placeMedal(c, 4)} <b class="${c > 2 ? "neg" : ""}">${sgn(trophyDelta(c, Math.max(pts, 40)))}</b></span>`);
    const hist = [...p.rank.history].reverse();
    const modeName = (id?: string) => {
      const m = MODES.find((x) => x.id === id);
      return m ? `${m.emoji ?? ""} ${m.name}` : "";
    };
    body.innerHTML = `
      <div class="rank-hero panel" style="--rc:${rp.rank.color}">
        <div class="rank-emblem"><span>${rp.rank.icon}</span></div>
        <h3>${rp.step.name}</h3>
        <p class="rank-pts"><b>${fmt(pts)}</b> 🏆 trophées</p>
        <span class="xpbar big"><i style="width:${rp.ratio * 100}%"></i></span>
        <p class="rank-next">${rp.next ? `Encore <b>${fmt(rp.missing)}</b> 🏆 pour ${rp.next.rank.icon} ${rp.next.name}` : "Division maximale atteinte !"}</p>
        <div class="rank-table"><small>Chaque partie de Compétition :</small><div>${table.join("")}</div></div>
        <p class="hint">🎲 Le mode de jeu est tiré au hasard, toujours à 4 joueurs. Adversaires actuels : <b>${botsLabel(pts)}</b> — plus tu montes, plus ils sont forts.${soft ? ` Sous ${RANK_RULES.softUnder} 🏆, tu perds moitié moins.` : ""} En Domination (2 contre 2) : victoire ${sgn(RANK_RULES.team.win)}, défaite ${sgn(trophyDelta(4, Math.max(pts, 40), "koth"))}.</p>
      </div>
      <div class="rank-side">
        <h3 class="label first">Récompenses de la saison <small class="season-left">⏳ fin dans ${daysLeft()}</small></h3>
        <ol class="rank-ladder steps">${STEPS.map((st) => {
          const got = p.rank.rewarded.includes(st.id);
          const cur = st.index === rp.step.index;
          return `<li class="${got ? "ok" : ""}${cur ? " cur" : ""}" style="--rc:${st.rank.color}"><span class="rl-ico">${st.rank.icon}</span><b>${st.name}</b><span class="rl-min">${fmt(st.min)} 🏆</span><span class="mrw">${st.reward.length ? st.reward.map(rewardChip).join("") : "<em>Départ</em>"}</span><span class="rl-ok">${got && st.index > 0 ? "✅" : ""}</span></li>`;
        }).join("")}</ol>
        <h3 class="label">Dernières parties de Compétition</h3>
        ${hist.length ? `<ul class="rank-hist">${hist.map((h) => `<li><span>${placeMedal(h.place, h.players)} ${placeName(h.place)}/${h.players}</span><span>${modeName(h.mode)}</span><b class="${h.delta > 0 ? "up" : h.delta < 0 ? "down" : ""}">${sgn(h.delta)}</b><small>${fmt(h.points)} 🏆</small></li>`).join("")}</ul>` : `<p class="hint">Aucune partie de Compétition pour l'instant. Choisis 🏆 COMPÉTITION sur l'accueil et lance-toi !</p>`}
        <p class="hint">🌍 Connecté à internet, tes parties de Compétition comptent aussi pour le <b>classement mondial</b> : le serveur rejoue chaque partie pour vérifier le résultat. </p>
        <p class="hint">📅 <b>Une saison dure un mois.</b> Le 1er de chaque mois, tout le monde repart de 0 trophée, toutes les récompenses se regagnent, et tu reçois une prime selon la division atteinte.${p.rank.last ? ` Saison précédente : ${fmt(p.rank.last.points)} 🏆.` : ""}</p>
      </div>`;
  }
}
