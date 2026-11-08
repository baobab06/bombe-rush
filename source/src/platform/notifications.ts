/**
 * NOTIFICATIONS (appli Android uniquement ; sur le web, tout est simplement absent).
 * Le pont natif « BombeRushNotify » est dans android-gradle (Notify*.java).
 *
 * - Mises à jour et annonces : vérifiées par l'appli elle-même ~2 fois par jour (rien à faire ici).
 * - Rappels : programmés par le jeu à chaque passage en arrière-plan (récompense du jour,
 *   retour dans l'arène après 3 jours d'absence) ; reprogrammés à chaque ouverture.
 */
import type { Profile } from "../meta/profile";
import { dayKey } from "../meta/store";

export type NotifyState = "granted" | "denied" | "default" | "off" | "unsupported";

interface NativeNotify {
  permissionState(): string;
  requestPermission(): void;
  setEnabled(on: boolean): void;
  schedule(key: string, atMs: number, title: string, body: string): void;
  cancel(key: string): void;
}

function native(): NativeNotify | null {
  return (window as unknown as { BombeRushNotify?: NativeNotify }).BombeRushNotify ?? null;
}

export const notifications = {
  get supported() {
    return !!native();
  },
  state(): NotifyState {
    const n = native();
    if (!n) return "unsupported";
    const s = n.permissionState();
    return s === "granted" || s === "denied" || s === "default" || s === "off" ? s : "denied";
  },
  /** Fenêtre système (Android 13+) ; résout avec le nouvel état. */
  request(): Promise<NotifyState> {
    const n = native();
    if (!n) return Promise.resolve("unsupported");
    return new Promise((res) => {
      const w = window as unknown as { __bombeRushNotifyResult?: (s: string) => void };
      const t = window.setTimeout(() => res(this.state()), 20000);
      w.__bombeRushNotifyResult = () => {
        window.clearTimeout(t);
        res(this.state());
      };
      n.requestPermission();
    });
  },
  setEnabled(on: boolean) {
    native()?.setEnabled(on);
  },
  /**
   * Rappels à programmer d'après le profil (appelé quand le jeu passe en arrière-plan).
   * Jamais plus d'un rappel de chaque sorte en attente (une nouvelle programmation remplace l'ancienne).
   */
  scheduleReminders(p: Profile, now = new Date()) {
    const n = native();
    if (!n || this.state() !== "granted") return;
    // 1. récompense du jour : demain à 18 h 30 si celle d'aujourd'hui est prise, sinon ce soir
    const at = new Date(now);
    at.setHours(18, 30, 0, 0);
    const claimedToday = p.daily?.last === dayKey(now);
    if (claimedToday || at.getTime() <= now.getTime() + 10 * 60 * 1000) at.setDate(at.getDate() + 1);
    const day = Math.min(7, ((p.daily?.streak ?? 0) % 7) + 1);
    n.schedule("daily", at.getTime(), "🎁 Ta récompense du jour t'attend !", `Jour ${day}/7 : connecte-toi pour la récupérer avant qu'elle ne s'envole.`);
    // 2. retour dans l'arène après 3 jours sans jouer
    const back = new Date(now);
    back.setDate(back.getDate() + 3);
    back.setHours(18, 0, 0, 0);
    n.schedule("comeback", back.getTime(), "💣 L'arène t'attend !", "Tes adversaires s'entraînent pendant ton absence… Reviens défendre ton rang !");
  },
  cancelReminders() {
    const n = native();
    n?.cancel("daily");
    n?.cancel("comeback");
  },
};
