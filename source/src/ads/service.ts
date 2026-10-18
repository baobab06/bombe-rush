/**
 * SERVICE PUBLICITAIRE — interface unique entre le jeu et la régie.
 *
 * Le jeu ne parle qu'à `ads` : il demande « une pub récompensée est-elle
 * disponible ? », « montre-la », et reçoit un statut. La récompense n'est
 * donnée que si le statut est "completed" (pub vue jusqu'au bout).
 * Échec, absence de pub, refus : le jeu continue normalement.
 *
 * Fournisseurs :
 *  - none      : aucune régie configurée (situation actuelle en production) ;
 *  - android   : pont vers le SDK officiel AdMob de l'application, si
 *                l'application l'expose (window.BombeRushAds) ;
 *  - h5        : Google AdSense « H5 Games Ads » (API Ad Placement) pour le
 *                jeu web, si un identifiant éditeur est configuré ;
 *  - test      : fausse pub CLAIREMENT signalée « PUB DE TEST », uniquement
 *                en local (localhost) avec ?ads=test — jamais en production.
 */
import { ADS, type RewardedPlacement } from "./config";

export type RewardedStatus = "completed" | "skipped" | "unavailable" | "error";
export type InterstitialStatus = "shown" | "unavailable" | "error";

export interface AdProvider {
  readonly name: "none" | "android" | "h5" | "test";
  /** une pub récompensée peut être demandée (la régie peut quand même ne rien avoir) */
  readonly rewardedSupported: boolean;
  /** le consentement est géré par la régie elle-même (formulaire Google UMP dans l'appli) */
  readonly nativeConsent?: boolean;
  /** bouton « choix de confidentialité » à proposer (Europe) */
  privacyOptionsRequired?(): boolean;
  showPrivacyOptions?(): void;
  showRewarded(placement: RewardedPlacement): Promise<RewardedStatus>;
  showInterstitial(): Promise<InterstitialStatus>;
  setConsent(personalized: boolean): void;
}

// ------------------------------------------------------------------ aucun
const noneProvider: AdProvider = {
  name: "none",
  rewardedSupported: false,
  showRewarded: async () => "unavailable",
  showInterstitial: async () => "unavailable",
  setConsent: () => {},
};

// ---------------------------------------------------------------- Android
/** Pont natif attendu dans l'application (voir docs/PUBLICITES.md). */
interface NativeAds {
  isReady(kind: string): boolean;
  showRewarded(adUnit: string, callbackId: string): void;
  showInterstitial(adUnit: string, callbackId: string): void;
  setConsent(personalized: boolean): void;
  configure?(rewardedUnit: string, interstitialUnit: string): void;
  privacyOptionsRequired?(): boolean;
  showPrivacyOptions?(): void;
}
function androidProvider(native: NativeAds): AdProvider {
  const waiting = new Map<string, (s: string) => void>();
  (window as unknown as { __bombeRushAdResult: (id: string, s: string) => void }).__bombeRushAdResult = (id, s) => {
    waiting.get(id)?.(s);
    waiting.delete(id);
  };
  // identifiants des blocs d'annonces → l'appli précharge les pubs
  try {
    native.configure?.(ADS.android.rewarded, ADS.android.interstitial);
  } catch {
    /* ancienne appli */
  }
  let n = 0;
  const call = (fn: (cb: string) => void, timeoutMs = 90000) =>
    new Promise<string>((resolve) => {
      const id = `ad${++n}`;
      const to = window.setTimeout(() => {
        waiting.delete(id);
        resolve("error");
      }, timeoutMs);
      waiting.set(id, (s) => {
        window.clearTimeout(to);
        resolve(s);
      });
      try {
        fn(id);
      } catch {
        window.clearTimeout(to);
        waiting.delete(id);
        resolve("error");
      }
    });
  return {
    name: "android",
    rewardedSupported: true,
    nativeConsent: true,
    privacyOptionsRequired: () => {
      try {
        return !!native.privacyOptionsRequired?.();
      } catch {
        return false;
      }
    },
    showPrivacyOptions: () => {
      try {
        native.showPrivacyOptions?.();
      } catch {
        /* pont absent */
      }
    },
    async showRewarded() {
      if (!native.isReady("rewarded")) return "unavailable";
      const s = await call((id) => native.showRewarded(ADS.android.rewarded, id));
      return s === "completed" ? "completed" : s === "skipped" ? "skipped" : s === "unavailable" ? "unavailable" : "error";
    },
    async showInterstitial() {
      if (!ADS.android.interstitial || !native.isReady("interstitial")) return "unavailable";
      const s = await call((id) => native.showInterstitial(ADS.android.interstitial, id), 60000);
      return s === "shown" ? "shown" : s === "unavailable" ? "unavailable" : "error";
    },
    setConsent: (p) => {
      try {
        native.setConsent(p);
      } catch {
        /* pont absent */
      }
    },
  };
}

// --------------------------------------------------------------- web (H5)
type AdBreak = (o: Record<string, unknown>) => void;
function h5Provider(publisherId: string): AdProvider {
  const w = window as unknown as { adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number }; adBreak?: AdBreak; adConfig?: AdBreak };
  w.adsbygoogle = w.adsbygoogle || [];
  const push: AdBreak = (o) => (w.adsbygoogle as unknown[]).push(o);
  w.adBreak = w.adConfig = push;
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    const sc = document.createElement("script");
    sc.async = true;
    sc.crossOrigin = "anonymous";
    sc.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`;
    sc.dataset.adClient = publisherId;
    if (ADS.webTestMode) sc.dataset.adbreakTest = "on";
    sc.onerror = () => (loaded = false);
    document.head.appendChild(sc);
    push({ preloadAdBreaks: "on", sound: "on" });
  };
  return {
    name: "h5",
    rewardedSupported: true,
    showRewarded(placement) {
      load();
      return new Promise((resolve) => {
        let done = false;
        const finish = (s: RewardedStatus) => {
          if (!done) {
            done = true;
            resolve(s);
          }
        };
        let viewed = false;
        window.setTimeout(() => finish("unavailable"), 15000);
        push({
          type: "reward",
          name: `reward-${placement}`,
          beforeReward: (showAdFn: () => void) => showAdFn(),
          adViewed: () => (viewed = true),
          adDismissed: () => finish("skipped"),
          adBreakDone: (info: { breakStatus?: string }) =>
            finish(viewed || info?.breakStatus === "viewed" ? "completed" : info?.breakStatus === "dismissed" ? "skipped" : "unavailable"),
        });
      });
    },
    showInterstitial() {
      load();
      return new Promise((resolve) => {
        let done = false;
        window.setTimeout(() => !done && ((done = true), resolve("unavailable")), 8000);
        push({
          type: "next",
          name: "between-games",
          adBreakDone: (info: { breakStatus?: string }) => {
            if (done) return;
            done = true;
            resolve(info?.breakStatus === "viewed" ? "shown" : "unavailable");
          },
        });
      });
    },
    setConsent(personalized) {
      (w.adsbygoogle as { requestNonPersonalizedAds?: number }).requestNonPersonalizedAds = personalized ? 0 : 1;
    },
  };
}

// ------------------------------------------------- test local (signalé)
function testProvider(): AdProvider {
  const overlay = (label: string, skippable: boolean) =>
    new Promise<"completed" | "skipped">((resolve) => {
      const el = document.createElement("div");
      el.className = "ad-test";
      el.id = "adTest";
      el.innerHTML = `<div><b>PUB DE TEST</b><p>${label}<br><small>Simulation locale (localhost) — aucune vraie publicité, aucun revenu.</small></p><span class="ad-cd" id="adCd">3</span>${skippable ? '<button class="btn btn-ghost small" id="adClose"><span>Fermer (sans récompense)</span></button>' : ""}</div>`;
      document.getElementById("app")!.appendChild(el);
      let left = 3;
      const tick = window.setInterval(() => {
        left--;
        const cd = el.querySelector("#adCd");
        if (cd) cd.textContent = String(Math.max(0, left));
        if (left <= 0) {
          window.clearInterval(tick);
          el.remove();
          resolve("completed");
        }
      }, 1000);
      el.querySelector("#adClose")?.addEventListener("click", () => {
        window.clearInterval(tick);
        el.remove();
        resolve("skipped");
      });
    });
  const flag = () => new URLSearchParams(location.search).get("ads");
  return {
    name: "test",
    rewardedSupported: true,
    async showRewarded(placement) {
      if (flag() === "test-none") return "unavailable";
      return overlay(`Vidéo récompensée « ${placement} »`, true);
    },
    async showInterstitial() {
      if (flag() === "test-none") return "unavailable";
      await overlay("Pub entre deux parties", false);
      return "shown";
    },
    setConsent: () => {},
  };
}

function pick(): AdProvider {
  const w = window as unknown as { BombeRushAds?: NativeAds };
  if (w.BombeRushAds) return androidProvider(w.BombeRushAds);
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const flag = new URLSearchParams(location.search).get("ads");
  if (local && (flag === "test" || flag === "test-none")) return testProvider();
  if (ADS.webPublisherId && /^ca-pub-\d{10,}$/.test(ADS.webPublisherId) && !w.BombeRushAds && !navigator.userAgent.includes("BombeRushAndroid")) return h5Provider(ADS.webPublisherId);
  return noneProvider;
}

/** Point d'entrée unique. Une seule pub à la fois. */
class AdService {
  readonly provider = pick();
  private busy = false;

  /** Les boutons « regarder une pub » ne s'affichent que si une régie est branchée. */
  get enabled(): boolean {
    return this.provider.rewardedSupported;
  }

  async rewarded(placement: RewardedPlacement): Promise<RewardedStatus> {
    if (this.busy) return "unavailable";
    this.busy = true;
    try {
      return await this.provider.showRewarded(placement);
    } catch {
      return "error";
    } finally {
      this.busy = false;
    }
  }

  async interstitial(): Promise<InterstitialStatus> {
    if (this.busy || this.provider.name === "none") return "unavailable";
    this.busy = true;
    try {
      return await this.provider.showInterstitial();
    } catch {
      return "error";
    } finally {
      this.busy = false;
    }
  }

  setConsent(personalized: boolean) {
    this.provider.setConsent(personalized);
  }

  /** Consentement géré par le formulaire officiel de Google (appli Android) */
  get nativeConsent(): boolean {
    return !!this.provider.nativeConsent;
  }
  privacyOptionsRequired(): boolean {
    return !!this.provider.privacyOptionsRequired?.();
  }
  showPrivacyOptions() {
    this.provider.showPrivacyOptions?.();
  }
}

export const ads = new AdService();
