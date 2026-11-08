package com.bomberush.game;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * Environ deux fois par jour, avec Internet : lit /api/update (réglé depuis la page
 * d'administration) et prévient UNE fois :
 *  - quand une nouvelle version est disponible (annonce de mise à jour activée) ;
 *  - quand une annonce (« push ») est publiée.
 * Rien n'est envoyé si les notifications sont coupées dans le jeu ou dans Android.
 */
public class UpdateJob extends JobService {
    @Override
    public boolean onStartJob(final JobParameters params) {
        new Thread(() -> {
            try {
                check(getApplicationContext());
            } catch (Exception ignored) {
            }
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    static void check(Context c) throws Exception {
        if (!Notify.enabled(c) || !Notify.permitted(c)) return;
        String version;
        try {
            PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            version = pi.versionName;
        } catch (Exception e) {
            return;
        }
        String base = c.getString(R.string.server_url);
        HttpURLConnection con = (HttpURLConnection) new URL(base + "/api/update?v=" + URLEncoder.encode(version, "UTF-8")).openConnection();
        con.setConnectTimeout(10000);
        con.setReadTimeout(10000);
        con.setRequestProperty("x-bomberush-version", version);
        if (con.getResponseCode() != 200) return;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (InputStream in = con.getInputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0 && out.size() < 64 * 1024) out.write(buf, 0, n);
        }
        JSONObject res = new JSONObject(out.toString("UTF-8"));
        JSONObject cfg = res.optJSONObject("config");
        if (cfg == null) return;
        SharedPreferences sp = Notify.prefs(c);
        // 1. nouvelle version
        String status = res.optString("status", "ok");
        String latest = cfg.optString("latestVersion", "");
        if (!"ok".equals(status) && !latest.isEmpty() && !latest.equals(sp.getString("notifiedVersion", ""))) {
            boolean must = "mandatory".equals(status);
            String title = must ? "⚠️ Mise à jour nécessaire" : "🚀 Nouvelle mise à jour !";
            String body = cfg.optString("title", "BOMBE RUSH " + latest) + " — " + cfg.optString("description", "Touche pour mettre à jour le jeu.");
            Notify.post(c, Notify.CH_UPDATES, 1001, title, body, Notify.tapIntent(c, cfg.optString("storeUrl", ""), 1));
            sp.edit().putString("notifiedVersion", latest).apply();
        }
        // 2. annonce
        JSONObject push = cfg.optJSONObject("push");
        if (push != null) {
            String id = push.optString("id", "");
            if (!id.isEmpty() && !id.equals(sp.getString("notifiedPush", ""))) {
                Notify.post(c, Notify.CH_UPDATES, 1002, push.optString("title", "BOMBE RUSH"), push.optString("body", ""), Notify.tapIntent(c, null, 3));
                sp.edit().putString("notifiedPush", id).apply();
            }
        }
    }
}
