/**
 * Écran RANG : rang actuel, points, progression, paliers et historique.
 * Rang personnel (aucun faux classement mondial).
 */
import { STAKES, placeMedal, placeName, type StakeId } from "../meta/economy";
import { RANKS, RANK_RULES } from "../meta/progress-config";
import { rankDelta, rankProgress } from "../meta/rank";
import { fmt, type AppCtx } from "./ctx";
import { rewardChip } from "./rewards";

const sgn = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");

export class RankScreen {
  constructor(private ctx: AppCtx) {}

  render() {
    const p = this.ctx.profile;
    const rp = rankProgress(p.rank.points);
    const body = document.getElementById("rankBody")!;
    const stake = ((p.lastSetup.difficulty as StakeId) in STAKES ? p.lastSetup.difficulty : "normal") as StakeId;
    const players = p.lastSetup.botCount + 1;
    const table = [1, 2, 3, 4].slice(0, Math.max(2, players)).map((col, i, arr) => {
      const c = arr.length === 2 ? [1, 4][i] : arr.length === 3 ? [1, 2, 4][i] : col;
      return `<span>${placeMedal(i + 1, arr.length)} <b>${sgn(rankDelta(c, stake, players))}</b></span>`;
    });
    const hist = [...p.rank.history].reverse();
    body.innerHTML = `
      <div class="rank-hero panel" style="--rc:${rp.rank.color}">
        <div class="rank-emblem"><span>${rp.rank.icon}</span></div>
        <h3>${rp.rank.name}</h3>
        <p class="rank-pts"><b>${fmt(p.rank.points)}</b> points</p>
        <span class="xpbar big"><i style="width:${rp.ratio * 100}%"></i></span>
        <p class="rank-next">${rp.next ? `Encore <b>${fmt(rp.missing)}</b> points pour ${rp.next.icon} ${rp.next.name}` : "Rang maximum atteint !"}</p>
        <div class="rank-table"><small>Avec ta config (${STAKES[stake].label}, ${players - 1} bot${players > 2 ? "s" : ""}) :</small><div>${table.join("")}</div></div>
        <p class="hint">Plus la difficulté et le nombre de bots sont élevés, plus ça rapporte.${RANK_RULES.protectedRanks.length ? " En Bronze, tu ne perds jamais de points." : ""} Les parties privées en ligne ne comptent pas pour le rang.</p>
      </div>
      <div class="rank-side">
        <h3 class="label first">Paliers</h3>
        <ol class="rank-ladder">${RANKS.map((r, i) => {
          const reached = p.rank.points >= r.min || p.rank.best >= i;
          const cur = r.id === rp.rank.id;
          return `<li class="${reached ? "ok" : ""}${cur ? " cur" : ""}" style="--rc:${r.color}"><span class="rl-ico">${r.icon}</span><b>${r.name}</b><small>${fmt(r.min)} pts</small><span class="mrw">${r.reward.length ? r.reward.map(rewardChip).join("") : "<em>Départ</em>"}</span>${reached && i > 0 ? '<span class="rl-ok">✔</span>' : ""}</li>`;
        }).join("")}</ol>
        <h3 class="label">Dernières parties classées</h3>
        ${hist.length ? `<ul class="rank-hist">${hist.map((h) => `<li><span>${placeMedal(h.place, h.players)} ${placeName(h.place)}/${h.players}</span><span>${STAKES[h.stake as StakeId]?.label ?? h.stake}</span><b class="${h.delta > 0 ? "up" : h.delta < 0 ? "down" : ""}">${sgn(h.delta)}</b><small>${fmt(h.points)} pts</small></li>`).join("")}</ul>` : `<p class="hint">Joue une partie contre les bots pour commencer à grimper !</p>`}
        <p class="hint">Rang personnel calculé sur ton appareil : il n'y a pas encore de classement mondial (il faudrait des comptes vérifiés par le serveur).</p>
      </div>`;
  }
}
