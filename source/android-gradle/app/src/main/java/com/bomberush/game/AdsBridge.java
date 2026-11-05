package com.bomberush.game;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAd;
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAdLoadCallback;
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
 *  Le bloc « récompensé » est un INTERSTITIEL AVEC RÉCOMPENSE (RewardedInterstitialAd) depuis la 1.2.1.
 *  Il n'est montré qu'après un appui du joueur sur « regarder une vidéo » (choix explicite, règle AdMob).
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
    // Identifiants de TEST officiels de Google (fonctionnent avec n'importe quel identifiant d'application)
    private static final String TEST_REWARDED = "ca-app-pub-3940256099942544/5354046379"; // interstitiel avec récompense
    private static final String TEST_INTERSTITIAL = "ca-app-pub-3940256099942544/1033173712";
    private final Activity act;
    private final WebView web;
    private final ConsentInformation consent;
    private final AtomicBoolean started = new AtomicBoolean(false);
    private volatile boolean nonPersonalized = false;
    private volatile String rewardedUnit = null;
    private volatile String interstitialUnit = null;
    private RewardedInterstitialAd rewarded;
    /** bloc créé au format « Avec récompense » dans AdMob : on le charge avec RewardedAd */
    private RewardedAd rewardedPlain;
    /** format du bloc récompensé : null = inconnu, true = RewardedAd, false = RewardedInterstitialAd */
    private Boolean plainFormat = null;
    private int rewardedFails = 0, interstitialFails = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());
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
        rewardedPlain = null;
        interstitial = null;
        handler.removeCallbacksAndMessages(null);
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
    /** nouvel essai automatique après un échec : 15 s, 30 s, 60 s… jusqu'à 5 min */
    private long backoff(int fails) {
        return Math.min(300_000L, 15_000L << Math.min(5, Math.max(0, fails - 1)));
    }

    private boolean hasRewarded() {
        return rewarded != null || rewardedPlain != null;
    }

    private void loadRewarded() {
        if (destroyed || rewardedUnit == null || hasRewarded() || loadingRewarded || !started.get()) return;
        loadingRewarded = true;
        if (Boolean.TRUE.equals(plainFormat)) loadRewardedPlain();
        else loadRewardedInterstitial();
    }

    private void rewardedFailed(LoadAdError err) {
        loadingRewarded = false;
        rewardedFails++;
        Log.w(TAG, "vidéo non chargée (" + err.getCode() + ") : " + err.getMessage());
        handler.postDelayed(this::loadRewarded, backoff(rewardedFails));
    }

    private void loadRewardedInterstitial() {
        RewardedInterstitialAd.load(act, rewardedUnit, request(), new RewardedInterstitialAdLoadCallback() {
            @Override
            public void onAdLoaded(RewardedInterstitialAd ad) {
                loadingRewarded = false;
                rewardedFails = 0;
                plainFormat = false;
                rewarded = ad;
            }

            @Override
            public void onAdFailedToLoad(LoadAdError err) {
                // format jamais confirmé : on essaie tout de suite l'autre format (« Avec récompense »)
                if (plainFormat == null) {
                    Log.w(TAG, "interstitiel avec récompense refusé (" + err.getCode() + "), essai au format récompensé");
                    loadRewardedPlain();
                    return;
                }
                rewardedFailed(err);
            }
        });
    }

    private void loadRewardedPlain() {
        RewardedAd.load(act, rewardedUnit, request(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(RewardedAd ad) {
                loadingRewarded = false;
                rewardedFails = 0;
                plainFormat = true;
                rewardedPlain = ad;
            }

            @Override
            public void onAdFailedToLoad(LoadAdError err) {
                rewardedFailed(err);
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
                interstitialFails = 0;
                interstitial = ad;
            }

            @Override
            public void onAdFailedToLoad(LoadAdError err) {
                loadingInterstitial = false;
                interstitialFails++;
                Log.w(TAG, "interstitiel non chargé (" + err.getCode() + ") : " + err.getMessage());
                handler.postDelayed(AdsBridge.this::loadInterstitial, backoff(interstitialFails));
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
    /**
     * Vraies pubs seulement si l'appli vient du Google Play Store. Un APK installé à la main
     * (APK de test du développeur) affiche les pubs de TEST de Google : le développeur ne
     * risque jamais de cliquer sur ses propres pubs (interdit par AdMob).
     */
    private boolean installedFromPlay() {
        try {
            PackageManager pm = act.getPackageManager();
            String installer;
            if (Build.VERSION.SDK_INT >= 30) installer = pm.getInstallSourceInfo(act.getPackageName()).getInstallingPackageName();
            else installer = pm.getInstallerPackageName(act.getPackageName());
            return "com.android.vending".equals(installer);
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public void configure(String rewardedUnitId, String interstitialUnitId) {
        boolean real = installedFromPlay();
        if (!real) Log.i(TAG, "appli hors Play Store : pubs de TEST");
        rewardedUnit = rewardedUnitId != null && rewardedUnitId.startsWith("ca-app-pub-") ? (real ? rewardedUnitId : TEST_REWARDED) : null;
        interstitialUnit = interstitialUnitId != null && interstitialUnitId.startsWith("ca-app-pub-") ? (real ? interstitialUnitId : TEST_INTERSTITIAL) : null;
        act.runOnUiThread(() -> {
            loadRewarded();
            loadInterstitial();
        });
    }

    @JavascriptInterface
    public boolean isReady(String kind) {
        boolean ready = "rewarded".equals(kind) ? hasRewarded() : "interstitial".equals(kind) && interstitial != null;
        if (!ready) act.runOnUiThread(() -> {
            if ("rewarded".equals(kind)) loadRewarded();
            else loadInterstitial();
        });
        return ready;
    }

    /**
     * Le joueur a appuyé sur « regarder une vidéo ». Si aucune vidéo n'est encore prête,
     * on lance le chargement et on attend jusqu'à 8 s avant de répondre « indisponible ».
     */
    @JavascriptInterface
    public void showRewarded(String unitId, String callbackId) {
        act.runOnUiThread(() -> {
            if (hasRewarded()) {
                presentRewarded(callbackId);
                return;
            }
            rewardedFails = 0;
            loadRewarded();
            final long until = System.currentTimeMillis() + 8000;
            handler.post(new Runnable() {
                @Override
                public void run() {
                    if (destroyed) return;
                    if (hasRewarded()) presentRewarded(callbackId);
                    else if (System.currentTimeMillis() >= until) {
                        reply(callbackId, "unavailable");
                        if (!loadingRewarded) handler.postDelayed(AdsBridge.this::loadRewarded, backoff(1));
                    } else {
                        if (!loadingRewarded) loadRewarded();
                        handler.postDelayed(this, 250);
                    }
                }
            });
        });
    }

    private void presentRewarded(String callbackId) {
        final boolean[] earned = {false};
        final boolean[] done = {false};
        FullScreenContentCallback cb = new FullScreenContentCallback() {
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
        };
        // la récompense n'est accordée que sur confirmation du SDK
        if (rewardedPlain != null) {
            final RewardedAd ad = rewardedPlain;
            rewardedPlain = null;
            ad.setFullScreenContentCallback(cb);
            ad.show(act, rewardItem -> earned[0] = true);
        } else {
            final RewardedInterstitialAd ad = rewarded;
            rewarded = null;
            ad.setFullScreenContentCallback(cb);
            ad.show(act, rewardItem -> earned[0] = true);
        }
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
