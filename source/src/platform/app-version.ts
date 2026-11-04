/**
 * Version installée du jeu.
 *  - appli Android : versionName de l'APK (pont natif) ;
 *  - navigateur : version intégrée au moment de la compilation (le site est
 *    toujours à jour : il est republié avec le serveur).
 */
import { androidApp } from "./native";

declare const __APP_VERSION__: string;

export function buildVersion(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
}

export function isAndroidApp(): boolean {
  return !!androidApp();
}

export function appVersion(): string {
  // tests en local uniquement : simuler une autre version (?appv=1.0.0)
  try {
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      const q = new URLSearchParams(location.search).get("appv");
      if (q && /^\d+(\.\d+){0,3}$/.test(q)) return q;
    }
  } catch {
    /* pas de location */
  }
  try {
    const v = androidApp()?.appVersion();
    if (v && /^\d+(\.\d+){0,3}/.test(v)) return v.match(/^\d+(\.\d+){0,3}/)![0];
  } catch {
    /* pont indisponible */
  }
  return buildVersion();
}
