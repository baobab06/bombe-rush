package com.bomberush.game;

import android.app.Activity;
import android.os.CancellationSignal;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;

import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import org.json.JSONObject;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * Pont entre le jeu (JavaScript) et la connexion Google officielle d'Android
 * (Credential Manager + « Se connecter avec Google »).
 *
 * Côté jeu : window.BombeRushAuth (voir src/platform/google-auth.ts).
 *  - signIn(serverClientId, callbackId) : ouvre le choix du compte Google ;
 *    → window.__bombeRushAuthResult(callbackId, {"status":"ok","idToken"} |
 *      {"status":"cancelled"|"noAccount"|"error"})
 *  - signOut() : oublie le compte choisi (le prochain signIn redemande le compte)
 *
 * Le jeton d'identité est envoyé tel quel au serveur du jeu, qui le vérifie
 * (signature Google, audience, expiration). Aucun mot de passe ne passe par ici.
 */
public class AuthBridge {
    private static final String TAG = "BombeRushAuth";
    private final Activity act;
    private final WebView web;
    private final CredentialManager cm;
    private final Executor executor = Executors.newSingleThreadExecutor();
    private volatile boolean destroyed = false;

    public AuthBridge(Activity act, WebView web) {
        this.act = act;
        this.web = web;
        this.cm = CredentialManager.create(act);
    }

    public void destroy() {
        destroyed = true;
    }

    @JavascriptInterface
    public void signIn(final String serverClientId, final String callbackId) {
        // identifiant client Web (OAuth) attendu : xxx.apps.googleusercontent.com
        if (serverClientId == null || !serverClientId.matches("^[0-9A-Za-z.-]{10,200}\\.apps\\.googleusercontent\\.com$")) {
            reply(callbackId, "error", null);
            return;
        }
        act.runOnUiThread(() -> {
            try {
                GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(serverClientId).build();
                GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
                cm.getCredentialAsync(act, request, new CancellationSignal(), executor,
                        new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                            @Override
                            public void onResult(GetCredentialResponse response) {
                                Credential c = response.getCredential();
                                if (c instanceof CustomCredential && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType())) {
                                    try {
                                        GoogleIdTokenCredential g = GoogleIdTokenCredential.createFrom(((CustomCredential) c).getData());
                                        reply(callbackId, "ok", g.getIdToken());
                                        return;
                                    } catch (Exception e) {
                                        Log.w(TAG, "jeton illisible", e);
                                    }
                                }
                                reply(callbackId, "error", null);
                            }

                            @Override
                            public void onError(GetCredentialException e) {
                                Log.w(TAG, "connexion Google : " + e.getClass().getSimpleName());
                                if (e instanceof GetCredentialCancellationException) reply(callbackId, "cancelled", null);
                                else if (e instanceof NoCredentialException) reply(callbackId, "noAccount", null);
                                else reply(callbackId, "error", null);
                            }
                        });
            } catch (Exception e) {
                Log.w(TAG, "connexion Google impossible", e);
                reply(callbackId, "error", null);
            }
        });
    }

    @JavascriptInterface
    public void signOut() {
        try {
            cm.clearCredentialStateAsync(new ClearCredentialStateRequest(), new CancellationSignal(), executor,
                    new CredentialManagerCallback<Void, ClearCredentialException>() {
                        @Override
                        public void onResult(Void result) {}

                        @Override
                        public void onError(ClearCredentialException e) {}
                    });
        } catch (Exception e) {
            Log.w(TAG, "déconnexion", e);
        }
    }

    private void reply(String callbackId, String status, String idToken) {
        if (callbackId == null || !callbackId.matches("^[A-Za-z0-9]{1,20}$")) return;
        JSONObject j = new JSONObject();
        try {
            j.put("status", status);
            if (idToken != null) j.put("idToken", idToken);
        } catch (Exception ignored) {
        }
        final String js = "window.__bombeRushAuthResult && window.__bombeRushAuthResult(" + JSONObject.quote(callbackId) + "," + JSONObject.quote(j.toString()) + ")";
        act.runOnUiThread(() -> {
            if (!destroyed) web.evaluateJavascript(js, null);
        });
    }
}
