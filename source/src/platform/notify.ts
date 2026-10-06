/**
 * Notifications.
 *
 * 1. LOCALES (fonctionnent sans serveur) : quand le jeu est en arrière-plan et
 *    qu'un ami rejoint la salle ou que la partie démarre.
 *    - APK : plugin @capacitor/local-notifications
 *    - Navigateur : API Notification (après autorisation)
 * 2. PUSH (app fermée) : nécessitent Firebase (voir server/push.ts et le
 *    README). Le jeton FCM est transmis au serveur s'il est disponible.
 */
type CapLocal = {
  requestPermissions(): Promise<{ display: string }>;
  schedule(o: { notifications: { id: number; title: string; body: string }[] }): Promise<unknown>;
};
type CapPush = {
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  addListener(ev: "registration", cb: (t: { value: string }) => void): void;
};

const plugins = () =>
  (window as unknown as { Capacitor?: { Plugins?: { LocalNotifications?: CapLocal; PushNotifications?: CapPush } } }).Capacitor?.Plugins ?? {};

let nextId = 1;

export const notify = {
  async requestPermission(): Promise<boolean> {
    const cap = plugins().LocalNotifications;
    try {
      if (cap) return (await cap.requestPermissions()).display === "granted";
      if ("Notification" in window) {
        if (Notification.permission === "granted") return true;
        if (Notification.permission === "default") return (await Notification.requestPermission()) === "granted";
      }
    } catch {
      /* refusé ou indisponible */
    }
    return false;
  },

  /** Affiche une notification seulement si le jeu n'est pas au premier plan. */
  async show(title: string, body: string) {
    if (!document.hidden) return;
    const cap = plugins().LocalNotifications;
    try {
      if (cap) await cap.schedule({ notifications: [{ id: nextId++, title, body }] });
      else if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
    } catch {
      /* indisponible */
    }
  },

  /** Enregistre l'appareil pour les notifications push (APK + Firebase configuré). */
  async registerPush(onToken: (token: string) => void) {
    const push = plugins().PushNotifications;
    if (!push) return false;
    try {
      if ((await push.requestPermissions()).receive !== "granted") return false;
      push.addListener("registration", (t) => onToken(t.value));
      await push.register();
      return true;
    } catch {
      return false;
    }
  },
};
