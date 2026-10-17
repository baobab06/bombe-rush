package com.defisentreamis.app;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

/**
 * Appli Android de « Défis entre amis » : un WebView plein écran qui ouvre
 * le serveur du jeu (l'appli web et l'API sont servies par le même serveur).
 * L'adresse du serveur se règle au premier lancement, ou quand il est
 * injoignable, sur l'écran local assets/setup.html.
 */
public class MainActivity extends Activity {
    private static final String SETUP = "file:///android_asset/setup.html";
    private WebView web;
    private SharedPreferences prefs;
    private String pendingJoin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("defis", MODE_PRIVATE);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(0xf6, 0xf5, 0xff));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " DefisAndroid/" + version());

        web.addJavascriptInterface(new Bridge(), "DefisAndroid");
        // Sans WebChromeClient, confirm() renvoie toujours false.
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                Uri server = Uri.parse(serverUrl());
                if ("file".equals(u.getScheme()) || (u.getHost() != null && u.getHost().equals(server.getHost()))) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showSetup("Serveur injoignable : " + err.getDescription());
            }
        });

        setContentView(web);
        if (Build.VERSION.SDK_INT >= 33) {
            // Cible API 36 : onBackPressed n'est plus appelé, il faut ce rappel.
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                new OnBackInvokedCallback() {
                    @Override
                    public void onBackInvoked() {
                        handleBack();
                    }
                });
        }
        pendingJoin = joinCode(getIntent());
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else openServer();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String code = joinCode(intent);
        if (code != null) {
            pendingJoin = code;
            openServer();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    /** Liens d'invitation : defis://join/CODE ou https://<serveur>/?join=CODE */
    private static String joinCode(Intent intent) {
        Uri u = intent == null ? null : intent.getData();
        if (u == null) return null;
        if ("defis".equals(u.getScheme())) return u.getLastPathSegment();
        return u.getQueryParameter("join");
    }

    private String serverUrl() {
        return prefs.getString("server", getString(R.string.server_url));
    }

    private void openServer() {
        String url = serverUrl();
        if (url.isEmpty()) {
            showSetup("");
            return;
        }
        if (pendingJoin != null) {
            url = url + "/?join=" + Uri.encode(pendingJoin);
            pendingJoin = null;
        }
        web.loadUrl(url);
    }

    private void showSetup(String message) {
        web.loadUrl(SETUP + "#" + Uri.encode(message));
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        web.evaluateJavascript("(function(){try{return window.__defisBack?window.__defisBack():false}catch(e){return false}})()",
            new android.webkit.ValueCallback<String>() {
                @Override
                public void onReceiveValue(String handled) {
                    if (!"true".equals(handled)) moveTaskToBack(true);
                }
            });
    }

    private String version() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    /** Fonctions appelables depuis la page : window.DefisAndroid.xxx() */
    private class Bridge {
        @JavascriptInterface
        public String getServer() {
            return serverUrl();
        }

        @JavascriptInterface
        public void setServer(final String url) {
            String u = url.trim().replaceAll("/+$", "");
            if (!u.isEmpty() && !u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
            prefs.edit().putString("server", u).apply();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    openServer();
                }
            });
        }

        @JavascriptInterface
        public void openSetup() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    showSetup("");
                }
            });
        }

        @JavascriptInterface
        public void share(String text) {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, text);
            startActivity(Intent.createChooser(i, "Inviter des amis"));
        }

        @JavascriptInterface
        public String version() {
            return MainActivity.this.version();
        }
    }
}
