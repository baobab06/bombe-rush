package com.bomberush.game;

import android.app.Activity;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

/**
 * Pont « BombeRushNotify » utilisé par le jeu :
 *  - permissionState() : granted | denied | default (jamais demandé) | off (coupé dans le jeu)
 *  - requestPermission() : fenêtre système d'Android 13+ (le résultat arrive dans
 *    window.__bombeRushNotifyResult(state))
 *  - setEnabled(bool) / schedule(clé, quandMs, titre, texte) / cancel(clé)
 */
final class NotifyBridge {
    static final int REQ = 7311;
    private final Activity act;
    private final WebView web;

    NotifyBridge(Activity act, WebView web) {
        this.act = act;
        this.web = web;
        Notify.channels(act);
        Notify.scheduleUpdateJob(act);
    }

    @JavascriptInterface
    public String permissionState() {
        if (Notify.permitted(act)) return Notify.enabled(act) ? "granted" : "off";
        if (Build.VERSION.SDK_INT >= 33) {
            boolean asked = Notify.prefs(act).getBoolean("asked", false);
            return asked ? "denied" : "default";
        }
        return "denied";
    }

    @JavascriptInterface
    public void requestPermission() {
        Notify.prefs(act).edit().putBoolean("enabled", true).apply();
        if (Build.VERSION.SDK_INT >= 33 && !Notify.permitted(act)) {
            Notify.prefs(act).edit().putBoolean("asked", true).apply();
            act.runOnUiThread(() -> act.requestPermissions(new String[] {"android.permission.POST_NOTIFICATIONS"}, REQ));
        } else {
            onResult();
        }
    }

    /** Réponse de la fenêtre système (appelé par MainActivity). */
    void onResult() {
        final String st = permissionState();
        act.runOnUiThread(() -> web.evaluateJavascript("window.__bombeRushNotifyResult && window.__bombeRushNotifyResult('" + st + "')", null));
    }

    @JavascriptInterface
    public void setEnabled(boolean on) {
        Notify.prefs(act).edit().putBoolean("enabled", on).apply();
    }

    @JavascriptInterface
    public void schedule(String key, double atMs, String title, String body) {
        if (key == null || title == null || body == null) return;
        String k = key.replaceAll("[^A-Za-z0-9_-]", "");
        if (k.isEmpty() || title.length() > 120 || body.length() > 300) return;
        long at = (long) atMs;
        if (at <= System.currentTimeMillis()) return;
        Notify.schedule(act, k, at, title, body);
    }

    @JavascriptInterface
    public void cancel(String key) {
        if (key == null) return;
        Notify.cancel(act, key.replaceAll("[^A-Za-z0-9_-]", ""));
    }
}
