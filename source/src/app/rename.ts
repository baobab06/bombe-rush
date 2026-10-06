/**
 * Changement de pseudo payant (le premier pseudo est gratuit).
 * Fenêtre : saisie → prix → solde restant → CHANGER (débit animé).
 */
import { audio } from "../audio/audio";
import { NAME_CHANGE_PRICE, NAME_MAX, NAME_MIN } from "../meta/economy";
import { cleanName, rename, renameCost } from "../meta/store";
import { haptics } from "../platform/haptics";
import { fmt, type AppCtx } from "./ctx";

export function openRename(ctx: AppCtx, onDone: () => void) {
  const p = ctx.profile;
  ctx.modal.open((sheet, close) => {
    sheet.insertAdjacentHTML(
      "beforeend",
      `<h2>Changer de pseudo</h2>
      <div class="rename">
        <label class="field"><span>Nouveau pseudo</span><input id="renameInput" maxlength="${NAME_MAX}" autocomplete="nickname" spellcheck="false" placeholder="${p.name.replace(/"/g, "&quot;")}"></label>
        <div class="rename-cost">
          <div class="cost"><i class="coin"></i><b id="renamePrice">${fmt(NAME_CHANGE_PRICE)}</b></div>
          <p id="renameInfo"></p>
        </div>
      </div>`,
    );
    const input = sheet.querySelector<HTMLInputElement>("#renameInput")!;
    const info = sheet.querySelector<HTMLElement>("#renameInfo")!;
    const priceEl = sheet.querySelector<HTMLElement>(".rename-cost .cost")!;
    const actions = document.createElement("div");
    actions.className = "sheet-actions";
    const no = document.createElement("button");
    no.className = "btn btn-ghost";
    no.innerHTML = "<span>Annuler</span>";
    no.addEventListener("click", () => {
      ctx.click();
      close();
    });
    const yes = document.createElement("button");
    yes.className = "btn btn-green";
    yes.id = "btnRenameOk";
    yes.innerHTML = "<span>CHANGER</span>";
    actions.append(no, yes);
    sheet.appendChild(actions);

    const refresh = () => {
      const v = cleanName(input.value);
      const cost = renameCost(p, v || "\u0000");
      const poor = p.coins < cost;
      priceEl.classList.toggle("poor", poor);
      if (poor) info.innerHTML = `Il te manque <b>${fmt(cost - p.coins)}</b> pièces. Joue des parties pour en gagner !`;
      else if (v.length < NAME_MIN) info.innerHTML = `Ton pseudo actuel : <b>${escape(p.name)}</b>`;
      else if (v === p.name) info.textContent = "C'est déjà ton pseudo.";
      else info.innerHTML = `Il te restera <b>${fmt(p.coins - cost)}</b> pièces.`;
      yes.disabled = poor || v.length < NAME_MIN || v === p.name;
    };
    const submit = () => {
      if (yes.disabled) return;
      const before = p.coins;
      const r = rename(p, input.value);
      if (!r.ok) {
        audio.play("deny");
        ctx.toast(r.reason === "coins" ? `Il te manque ${fmt(r.missing ?? 0)} pièces` : "Pseudo invalide", "bad");
        return refresh();
      }
      ctx.persist();
      audio.play("buy");
      haptics.pulse(30);
      ctx.wallet.lose(ctx.fx, priceEl, r.cost, before);
      ctx.toast(`✏️ Tu t'appelles maintenant ${p.name} !`, "good");
      close();
      onDone();
    };
    input.addEventListener("input", refresh);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    yes.addEventListener("click", () => {
      ctx.click();
      submit();
    });
    refresh();
    window.setTimeout(() => input.focus(), 60);
  });
}

function escape(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
