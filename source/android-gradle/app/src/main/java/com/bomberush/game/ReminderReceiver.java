package com.bomberush.game;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Rappel programmé par le jeu (récompense du jour, retour dans l'arène) + reprise après redémarrage. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || "android.intent.action.MY_PACKAGE_REPLACED".equals(action)) {
            Notify.restore(c);
            return;
        }
        String key = intent.getStringExtra("key");
        if (key == null) return;
        Notify.prefs(c).edit().remove("r." + key).apply();
        Notify.post(c, Notify.CH_REWARDS, 2000 + Math.abs(key.hashCode() % 1000),
            intent.getStringExtra("title"), intent.getStringExtra("body"), Notify.tapIntent(c, null, 2));
    }
}
