/**
 * Vibrations. Dans l'APK (Capacitor), on passe par le plugin Haptics s'il
 * est installé ; sinon navigator.vibrate (Chrome Android). Sans support,
 * les appels sont simplement ignorés.
 */
import { androidApp } from "./native";

type CapHaptics = { vibrate(o: { duration: number }): Promise<void> };

let enabled = true;

function capacitorHaptics(): CapHaptics | null {
  const w = window as unknown as { Capacitor?: { Plugins?: { Haptics?: CapHaptics } } };
  return w.Capacitor?.Plugins?.Haptics ?? null;
}

export const haptics = {
  setEnabled(v: boolean) {
    enabled = v;
  },
  pulse(ms: number) {
    if (!enabled) return;
    const cap = capacitorHaptics();
    const app = androidApp();
    try {
      if (app) app.vibrate(ms);
      else if (cap) void cap.vibrate({ duration: ms });
      else navigator.vibrate?.(ms);
    } catch {
      /* non supporté */
    }
  },
  bomb() {
    this.pulse(18);
  },
  explosionNear() {
    this.pulse(45);
  },
  death() {
    this.pulse(220);
  },
};
