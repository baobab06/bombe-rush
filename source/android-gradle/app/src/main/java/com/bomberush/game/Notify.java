package com.bomberush.game;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;

/**
 * NOTIFICATIONS DU JEU (sans Firebase, sans serveur d'envoi) :
 *  - « Mises à jour et annonces » : un travail en arrière-plan (JobScheduler, ~2 fois par jour,
 *    seulement avec Internet) lit /api/update (le même réglage que la fenêtre de mise à jour) et
 *    prévient une seule fois par nouvelle version / par annonce. Voir UpdateJob.
 *  - « Récompenses » : rappels programmés par le jeu lui-même (récompense du jour, retour après
 *    quelques jours d'absence). Voir ReminderReceiver.
 * Le joueur peut tout couper dans les Paramètres du jeu (et, bien sûr, dans ceux d'Android).
 */
final class Notify {
    static final String CH_UPDATES = "updates";
    static final String CH_REWARDS = "rewards";
    static final String PREFS = "bomberush_notify";
    static final int JOB_ID = 4242;

    private Notify() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean enabled(Context c) {
        return prefs(c).getBoolean("enabled", true);
    }

    static boolean permitted(Context c) {
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.areNotificationsEnabled();
    }

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel up = new NotificationChannel(CH_UPDATES, "Mises à jour et annonces", NotificationManager.IMPORTANCE_DEFAULT);
        up.setDescription("Nouvelle version du jeu, événements et annonces");
        NotificationChannel rw = new NotificationChannel(CH_REWARDS, "Récompenses", NotificationManager.IMPORTANCE_DEFAULT);
        rw.setDescription("Récompense du jour et rappels");
        nm.createNotificationChannel(up);
        nm.createNotificationChannel(rw);
    }

    /** Ouvre le jeu (ou le Play Store si storeUrl est donné). */
    static PendingIntent tapIntent(Context c, String storeUrl, int code) {
        Intent i;
        if (storeUrl != null && storeUrl.startsWith("https://play.google.com/")) {
            i = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + c.getPackageName()));
            i.setPackage("com.android.vending");
            if (i.resolveActivity(c.getPackageManager()) == null) i = new Intent(Intent.ACTION_VIEW, Uri.parse(storeUrl));
        } else {
            i = new Intent(c, MainActivity.class);
            i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        }
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @SuppressWarnings("deprecation")
    static void post(Context c, String channel, int id, String title, String body, PendingIntent tap) {
        if (!enabled(c) || !permitted(c)) return;
        channels(c);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_bomb)
            .setColor(Color.parseColor("#FFB21F"))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(tap);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(id, b.build());
    }

    /** Vérification périodique des mises à jour / annonces (persistée au redémarrage du téléphone). */
    static void scheduleUpdateJob(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        if (js.getPendingJob(JOB_ID) != null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, UpdateJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(12L * 60 * 60 * 1000, 3L * 60 * 60 * 1000)
            .setPersisted(true)
            .build();
        js.schedule(job);
    }

    // ---------------------------------------------------------------- rappels
    static PendingIntent reminderIntent(Context c, String key, String title, String body, boolean create) {
        Intent i = new Intent(c, ReminderReceiver.class);
        i.setAction("com.bomberush.game.REMINDER." + key);
        i.putExtra("key", key);
        i.putExtra("title", title);
        i.putExtra("body", body);
        int flags = PendingIntent.FLAG_IMMUTABLE | (create ? PendingIntent.FLAG_UPDATE_CURRENT : PendingIntent.FLAG_NO_CREATE);
        return PendingIntent.getBroadcast(c, key.hashCode(), i, flags);
    }

    static void schedule(Context c, String key, long atMs, String title, String body) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = reminderIntent(c, key, title, body, true);
        am.cancel(pi);
        // pas besoin d'une heure exacte : Android regroupe pour économiser la batterie
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
        // mémorisé pour être reprogrammé après un redémarrage du téléphone
        prefs(c).edit().putString("r." + key, atMs + "\n" + title + "\n" + body).apply();
    }

    static void cancel(Context c, String key) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = reminderIntent(c, key, "", "", false);
        if (am != null && pi != null) am.cancel(pi);
        prefs(c).edit().remove("r." + key).apply();
    }

    /** Après un redémarrage : les alarmes sont perdues, on les reprogramme. */
    static void restore(Context c) {
        long now = System.currentTimeMillis();
        for (java.util.Map.Entry<String, ?> e : prefs(c).getAll().entrySet()) {
            if (!e.getKey().startsWith("r.") || !(e.getValue() instanceof String)) continue;
            String[] p = ((String) e.getValue()).split("\n", 3);
            if (p.length < 3) continue;
            try {
                long at = Long.parseLong(p[0]);
                if (at > now) schedule(c, e.getKey().substring(2), at, p[1], p[2]);
            } catch (NumberFormatException ignored) {
            }
        }
        scheduleUpdateJob(c);
    }
}
