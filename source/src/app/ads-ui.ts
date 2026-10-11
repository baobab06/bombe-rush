/**
 * Publicités côté interface : consentement, vidéos récompensées, pub entre
 * deux parties. Tout est séparé du gameplay : si aucune régie n'est branchée
 * (ads.enabled = false), rien de tout cela n'apparaît.
 */
import { audio } from "../audio/audio";
import { ads } from "../ads/service";
import type { RewardedPlacement } from "../ads/config";
import { grantAdReward, interstitialDue, noteInterstitialShown } from "../meta/ad-rewards";
import type { Granted } from "../meta/grants";
import type { CoinTransaction } from "../meta/rewards";
import type { AppCtx } from "./ctx";

/** Demande le consentement (pubs personnalisées ou non) une seule fois. */
export function ensureAdConsent(ctx: AppCtx): Promise<void> {
  const p = ctx.profile;
  if (p.ads.personalized !== null) {
    ads.setConsent(p.ads.personalized);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    ctx.modal.open(
      (sheet, close) => {
        sheet.insertAdjacentHTML(
          "beforeend",
          `<h2>Publicités</h2><p class="sub consent-txt">Les vidéos sont toujours facultatives. Tu peux accepter des publicités <b>personnalisées</b> (selon tes centres d'intérêt, via des cookies/identifiants) ou seulement des publicités <b>non personnalisées</b>. Modifiable à tout moment dans les Paramètres.</p>`,
        );
        const act = document.createElement("div");
        act.className = "sheet-actions";
        const no = document.createElement("button");
        no.className = "btn btn-ghost";
        no.id = "btnAdNoPerso";
        no.innerHTML = "<span>Non personnalisées</span>";
        const yes = document.createElement("button");
        yes.className = "btn btn-blue";
        yes.id = "btnAdPerso";
        yes.innerHTML = "<span>Personnalisées</span>";
        const pickIt = (v: boolean) => {
          p.ads.personalized = v;
          ads.setConsent(v);
          ctx.persist();
          close();
        };
        no.addEventListener("click", () => pickIt(false));
        yes.addEventListener("click", () => pickIt(true));
        act.append(no, yes);
        sheet.appendChild(act);
      },
      { closable: false, onClose: () => resolve() },
    );
  });
}

/**
 * Vidéo récompensée : la récompense n'est donnée QUE si la régie confirme
 * « vue jusqu'au bout ». Sinon : message clair, rien n'est donné, le jeu continue.
 */
export async function watchRewarded(ctx: AppCtx, placement: RewardedPlacement, tx?: CoinTransaction | null): Promise<Granted[] | null> {
  await ensureAdConsent(ctx);
  audio.suspend();
  const status = await ads.rewarded(placement);
  audio.resume();
  if (status !== "completed") {
    ctx.toast(status === "skipped" ? "Vidéo interrompue : pas de récompense" : "Aucune vidéo disponible pour le moment, réessaie plus tard", status === "skipped" ? "" : "bad");
    return null;
  }
  const got = grantAdReward(ctx.profile, placement === "double" ? "double" : placement, tx);
  ctx.persist();
  return got;
}

/**
 * Pub entre deux parties (jamais pendant un combat) : seulement si la
 * fréquence le permet. Ne bloque jamais : en cas d'échec on continue.
 */
export async function maybeInterstitial(ctx: AppCtx, sessionGames: number): Promise<void> {
  if (!ads.enabled || !interstitialDue(ctx.profile, sessionGames)) return;
  await ensureAdConsent(ctx);
  audio.suspend();
  const s = await ads.interstitial();
  audio.resume();
  if (s === "shown") {
    noteInterstitialShown(ctx.profile);
    ctx.persist();
  }
}
