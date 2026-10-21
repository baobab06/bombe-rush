package com.bomberush.game;

import android.app.Activity;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Pont entre le jeu (JavaScript) et Google Play Billing (achats intégrés).
 *
 * Côté jeu : window.BombeRushBilling (voir src/platform/billing.ts).
 *  - isReady()                         : connecté à Google Play
 *  - queryProducts(idsCsv, callbackId) : vrais prix → {"products":[{"id","price"}]}
 *  - buy(productId, callbackId)        : → {"status":"purchased|pending|cancelled|unavailable|error","productId","token"}
 *  - consume(token)                    : à appeler APRÈS avoir crédité le pack (produits consommables)
 *  - restore()                         : renvoie les achats payés mais pas encore consommés
 * Les résultats reviennent par window.__bombeRushBillingResult(callbackId, json) ;
 * les achats arrivés hors clic par window.__bombeRushPurchase(json).
 *
 * Le jeu ne crédite qu'à l'état PURCHASED (jamais PENDING), une seule fois par
 * jeton, puis consomme l'achat. Un achat payé mais non crédité (appli fermée,
 * plantage) est redonné au prochain lancement par restore().
 */
public class BillingBridge implements PurchasesUpdatedListener {
    private static final String TAG = "BombeRushBilling";
    private final Activity act;
    private final WebView web;
    private final BillingClient client;
    private final Map<String, ProductDetails> details = new ConcurrentHashMap<>();
    private volatile boolean ready = false;
    private volatile boolean destroyed = false;
    /** achat en cours lancé depuis le jeu (un seul à la fois) */
    private volatile String buyCallback = null;
    private volatile String buyProduct = null;

    BillingBridge(Activity act, WebView web) {
        this.act = act;
        this.web = web;
        client = BillingClient.newBuilder(act)
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build();
    }

    void start() {
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult r) {
                ready = r.getResponseCode() == BillingClient.BillingResponseCode.OK;
                Log.i(TAG, "Google Play Billing : " + r.getResponseCode() + " " + r.getDebugMessage());
                if (ready) restore();
            }

            @Override
            public void onBillingServiceDisconnected() {
                ready = false;
            }
        });
    }

    void destroy() {
        destroyed = true;
        client.endConnection();
    }

    // ------------------------------------------------------------- vers le jeu

    private void reply(String callbackId, JSONObject json) {
        if (callbackId == null) return;
        final String js = "window.__bombeRushBillingResult && window.__bombeRushBillingResult(" + JSONObject.quote(callbackId) + "," + JSONObject.quote(json.toString()) + ")";
        act.runOnUiThread(() -> {
            if (!destroyed) web.evaluateJavascript(js, null);
        });
    }

    private void lateGrant(Purchase p) {
        final String js = "window.__bombeRushPurchase && window.__bombeRushPurchase(" + JSONObject.quote(purchaseJson("purchased", p).toString()) + ")";
        act.runOnUiThread(() -> {
            if (!destroyed) web.evaluateJavascript(js, null);
        });
    }

    private static JSONObject status(String s) {
        JSONObject o = new JSONObject();
        try {
            o.put("status", s);
        } catch (Exception ignored) {
        }
        return o;
    }

    private static JSONObject purchaseJson(String s, Purchase p) {
        JSONObject o = status(s);
        try {
            List<String> ids = p.getProducts();
            if (!ids.isEmpty()) o.put("productId", ids.get(0));
            o.put("token", p.getPurchaseToken());
        } catch (Exception ignored) {
        }
        return o;
    }

    // ------------------------------------------------------- appelé par le jeu

    @JavascriptInterface
    public boolean isReady() {
        return ready;
    }

    @JavascriptInterface
    public void queryProducts(String idsCsv, final String callbackId) {
        fetchDetails(idsCsv, () -> {
            JSONObject out = new JSONObject();
            JSONArray list = new JSONArray();
            try {
                for (ProductDetails d : details.values()) {
                    ProductDetails.OneTimePurchaseOfferDetails offer = d.getOneTimePurchaseOfferDetails();
                    if (offer == null) continue;
                    JSONObject o = new JSONObject();
                    o.put("id", d.getProductId());
                    o.put("price", offer.getFormattedPrice());
                    list.put(o);
                }
                out.put("products", list);
            } catch (Exception ignored) {
            }
            reply(callbackId, out);
        });
    }

    @JavascriptInterface
    public void buy(final String productId, final String callbackId) {
        if (!ready) {
            reply(callbackId, status("unavailable"));
            return;
        }
        if (buyCallback != null) {
            reply(callbackId, status("unavailable"));
            return;
        }
        Runnable launch = () -> {
            ProductDetails d = details.get(productId);
            if (d == null) {
                reply(callbackId, status("unavailable"));
                return;
            }
            buyCallback = callbackId;
            buyProduct = productId;
            act.runOnUiThread(() -> {
                BillingFlowParams params = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(
                        BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).build()))
                    .build();
                BillingResult r = client.launchBillingFlow(act, params);
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    finishBuy(status(r.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED ? "cancelled" : "error"));
                }
            });
        };
        if (details.containsKey(productId)) launch.run();
        else fetchDetails(productId, launch);
    }

    @JavascriptInterface
    public void consume(String token) {
        if (token == null || token.isEmpty()) return;
        ConsumeParams params = ConsumeParams.newBuilder().setPurchaseToken(token).build();
        client.consumeAsync(params, (r, t) -> Log.i(TAG, "consommé : " + r.getResponseCode()));
    }

    /** Achats payés mais pas encore consommés (crédit interrompu) : le jeu les crédite s'il ne l'a pas fait. */
    @JavascriptInterface
    public void restore() {
        if (!ready) return;
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build();
        client.queryPurchasesAsync(params, (r, purchases) -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) return;
            for (Purchase p : purchases) if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) lateGrant(p);
        });
    }

    // ------------------------------------------------------------ Google Play

    private void fetchDetails(String idsCsv, final Runnable then) {
        if (!ready) {
            then.run();
            return;
        }
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (String id : idsCsv.split(",")) {
            String s = id.trim();
            if (s.isEmpty()) continue;
            products.add(QueryProductDetailsParams.Product.newBuilder().setProductId(s).setProductType(BillingClient.ProductType.INAPP).build());
        }
        if (products.isEmpty()) {
            then.run();
            return;
        }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(products).build();
        client.queryProductDetailsAsync(params, (r, result) -> {
            if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                for (ProductDetails d : result.getProductDetailsList()) details.put(d.getProductId(), d);
            } else Log.w(TAG, "produits : " + r.getResponseCode() + " " + r.getDebugMessage());
            then.run();
        });
    }

    private void finishBuy(JSONObject json) {
        String cb = buyCallback;
        buyCallback = null;
        buyProduct = null;
        reply(cb, json);
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase p : purchases) {
                boolean mine = buyCallback != null && buyProduct != null && p.getProducts().contains(buyProduct);
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    if (mine) finishBuy(purchaseJson("purchased", p));
                    else lateGrant(p);
                } else if (p.getPurchaseState() == Purchase.PurchaseState.PENDING && mine) {
                    // paiement en attente (espèces, virement…) : crédité plus tard, à l'état PURCHASED
                    finishBuy(purchaseJson("pending", p));
                }
            }
            if (buyCallback != null) finishBuy(status("error"));
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            finishBuy(status("cancelled"));
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            // achat précédent jamais consommé : on le redonne au jeu, qui le crédite puis le consomme
            finishBuy(status("error"));
            restore();
        } else {
            Log.w(TAG, "achat : " + code + " " + r.getDebugMessage());
            finishBuy(status("error"));
        }
    }
}
