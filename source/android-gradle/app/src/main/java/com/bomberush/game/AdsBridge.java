package com.bomberush.game;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.ads.mediation.admob.AdMobAdapter;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Pont entre le jeu (JavaScript) et le SDK officiel Google Mobile Ads (AdMob).
 *
 * Côté jeu : window.BombeRushAds (voir src/ads/service.ts, fournisseur "android").
 *  - configure(rewardedUnit, interstitialUnit) : identifiants des blocs d'annonces
 *  - isReady(kind)                              : une pub est chargée ("rewarded" / "interstitial")
 *  - showRewarded(unit, callbackId)             : résultat "completed" UNIQUEMENT si la récompense
 *                                                 est confirmée par le SDK (OnUserEarnedRewardListener)
 *  - showInterstitial(unit, callbackId)         : résultat "shown" / "unavailable" / "error"
 *  - privacyOptionsRequired() / showPrivacyOptions() : choix de consentement (UMP, Europe)
 * Le résultat revient par window.__bombeRushAdResult(callbackId, statut).
 *
 * Consentement : SDK UMP de Google (formulaire certifié pour l'Europe). Aucune pub
 * n'est demandée tant que canRequestAds() est faux. En cas d'échec, le jeu continue.
 */
public class AdsBridge {
    private static final String TAG = "BombeRushAds";
    private final Activity act;
    private final WebView web;
    private final ConsentInformation consent;
    private final AtomicBoolean started = new AtomicBoolean(false);
    private volatile boolean nonPersonalized = false;
    private volatile String rewardedUnit = null;
    private volatile String interstitialUnit = null;
    private RewardedAd rewarded;
    private InterstitialAd interstitial;
    private boolean loadingRewarded = false;
    private boolean loadingInterstitial = false;
    private boolean destroyed = false;

    AdsBridge(Activity act, WebView web) {
        this.act = act;
        this.web = web;
        this.consent = UserMessagingPlatform.getConsentInformation(act);
    }

    /** Au démarrage : met à jour le consentement (formulaire si requis), puis lance AdMob. */
    void start() {
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        consent.requestConsentInfoUpdate(act, params,
            () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(act, formError -> {
                if (formError != null) Log.w(TAG, "consentement : " + formError.getMessage());
                initAds();
            }),
            requestError -> {
                Log.w(TAG, "consentement indisponible : " + requestError.getMessage());
                initAds();
            });
        // consentement déjà connu (lancement précédent) : on peut démarrer tout de suite
        initAds();
    }

    private void initAds() {
        if (destroyed || !consent.canRequestAds() || !started.compareAndSet(false, true)) return;
        new Thread(() -> MobileAds.initialize(act, status -> act.runOnUiThread(() -> {
            loadRewarded();
            loadInterstitial();
        }))).start();
    }

    void destroy() {
        destroyed = true;
        rewarded = null;
        interstitial = null;
    }

    private AdRequest request() {
        AdRequest.Builder b = new AdRequest.Builder();
        if (nonPersonalized) {
            Bundle extras = new Bundle();
            extras.putString("npa", "1");
            b.addNetworkExtrasBundle(AdMobAdapter.class, extras);
        }
        return b.build();
    }

    // ------------------------------------------------------------ chargement
    private void loadRewarded() {
        if (destroyed || rewardedUnit == null || rewarded != null || loadingRewarded || !started.get()) return;
        loadingRewarded = true;
        RewardedAd.load(act, rewardedUnit, request(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(RewardedAd ad) {
                loadingRewarded = false;
                rewarded = ad;
            }

            @Override
            public void onAdFailedToLoad(LoadAdError err) {
                loadingRewarded = false;
                Log.w(TAG, "vidéo non chargée : " + err.getMessage());
            }
        });
    }

    private void loadInterstitial() {
        if (destroyed || interstitialUnit == null || interstitial != null || loadingInterstitial || !started.get()) return;
        loadingInterstitial = true;
        InterstitialAd.load(act, interstitialUnit, request(), new InterstitialAdLoadCallback() {
            @Override
            public void onAdLoaded(InterstitialAd ad) {
                loadingInterstitial = false;
                interstitial = ad;
            }

            @Override
            public void onAdFailedToLoad(LoadAdError err) {
                loadingInterstitial = false;
                Log.w(TAG, "interstitiel non chargé : " + err.getMessage());
            }
        });
    }

    private void reply(String callbackId, String status) {
        final String id = callbackId.replaceAll("[^A-Za-z0-9_]", "");
        act.runOnUiThread(() -> {
            if (!destroyed) web.evaluateJavascript("window.__bombeRushAdResult && window.__bombeRushAdResult('" + id + "','" + status + "')", null);
        });
    }

    // --------------------------------------------------------- appelé par le jeu
    @JavascriptInterface
    public void configure(String rewardedUnitId, String interstitialUnitId) {
        rewardedUnit = rewardedUnitId != null && rewardedUnitId.startsWith("ca-app-pub-") ? rewardedUnitId : null;
        interstitialUnit = interstitialUnitId != null && interstitialUnitId.startsWith("ca-app-pub-") ? interstitialUnitId : null;
        act.runOnUiThread(() -> {
            loadRewarded();
            loadInterstitial();
        });
    }

    @JavascriptInterface
    public boolean isReady(String kind) {
        boolean ready = "rewarded".equals(kind) ? rewarded != null : "interstitial".equals(kind) && interstitial != null;
        if (!ready) act.runOnUiThread(() -> {
            if ("rewarded".equals(kind)) loadRewarded();
            else loadInterstitial();
        });
        return ready;
    }

    @JavascriptInterface
    public void showRewarded(String unitId, String callbackId) {
        act.runOnUiThread(() -> {
            final RewardedAd ad = rewarded;
            if (ad == null) {
                reply(callbackId, "unavailable");
                loadRewarded();
                return;
            }
            rewarded = null;
            final boolean[] earned = {false};
            final boolean[] done = {false};
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdDismissedFullScreenContent() {
                    if (!done[0]) {
                        done[0] = true;
                        reply(callbackId, earned[0] ? "completed" : "skipped");
                    }
                    loadRewarded();
                }

                @Override
                public void onAdFailedToShowFullScreenContent(AdError err) {
                    if (!done[0]) {
                        done[0] = true;
                        reply(callbackId, "error");
                    }
                    loadRewarded();
                }
            });
            // la récompense n'est accordée que sur confirmation du SDK
            ad.show(act, rewardItem -> earned[0] = true);
        });
    }

    @JavascriptInterface
    public void showInterstitial(String unitId, String callbackId) {
        act.runOnUiThread(() -> {
            final InterstitialAd ad = interstitial;
            if (ad == null) {
                reply(callbackId, "unavailable");
                loadInterstitial();
                return;
            }
            interstitial = null;
            final boolean[] done = {false};
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdDismissedFullScreenContent() {
                    if (!done[0]) {
                        done[0] = true;
                        reply(callbackId, "shown");
                    }
                    loadInterstitial();
                }

                @Override
                public void onAdFailedToShowFullScreenContent(AdError err) {
                    if (!done[0]) {
                        done[0] = true;
                        reply(callbackId, "error");
                    }
                    loadInterstitial();
                }
            });
            ad.show(act);
        });
    }

    /** Choix « pubs non personnalisées » fait dans le jeu (en plus du consentement Google). */
    @JavascriptInterface
    public void setConsent(boolean personalized) {
        nonPersonalized = !personalized;
    }

    /** Faut-il proposer un bouton « choix de confidentialité » (Europe) ? */
    @JavascriptInterface
    public boolean privacyOptionsRequired() {
        return consent.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
    }

    @JavascriptInterface
    public void showPrivacyOptions() {
        act.runOnUiThread(() -> UserMessagingPlatform.showPrivacyOptionsForm(act, err -> {
            if (err != null) Log.w(TAG, "options de confidentialité : " + err.getMessage());
            initAds();
        }));
    }
}
