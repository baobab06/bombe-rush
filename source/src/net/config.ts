/**
 * Adresse du serveur multijoueur.
 *
 * - Jeu ouvert depuis le serveur (navigateur)  → même origine, rien à régler.
 * - APK Android                                 → renseigner APK_SERVER_URL
 *   avec l'adresse publique du serveur déployé (ex. https://bomberush.onrender.com).
 */
export const APK_SERVER_URL = "";

/** Lien de téléchargement de l'APK affiché aux invités (optionnel). */
export const APK_DOWNLOAD_URL = "";

export function serverBase(): string | null {
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean }; BombeRushAndroid?: { serverUrl(): string } };
  // appli Android : serveur choisi dans les Paramètres, sinon celui intégré à l'APK
  if (w.BombeRushAndroid) {
    let override = "";
    try {
      override = localStorage.getItem("bomberush.server") ?? "";
    } catch {
      /* stockage indisponible */
    }
    const url = (override || w.BombeRushAndroid.serverUrl() || APK_SERVER_URL).trim().replace(/\/$/, "");
    return url || null;
  }
  if (w.Capacitor?.isNativePlatform?.()) return APK_SERVER_URL || null;
  try {
    const override = localStorage.getItem("bomberush.server");
    if (override) return override.replace(/\/$/, "");
  } catch {
    /* stockage indisponible */
  }
  if (location.protocol === "http:" || location.protocol === "https:") return location.origin;
  return APK_SERVER_URL || null;
}

export function wsUrl(base: string): string {
  return base.replace(/^http/, "ws") + "/ws";
}

export function inviteUrl(base: string, code: string): string {
  return `${base}/j/${code}`;
}

/** Code de salle présent dans l'URL d'ouverture (/j/CODE, ?join=CODE). */
export function joinCodeFromUrl(href: string = location.href): string | null {
  try {
    const u = new URL(href);
    const m = u.pathname.match(/\/(?:j|join)\/([A-Za-z0-9]{4,8})/);
    if (m) return m[1].toUpperCase();
    const q = u.searchParams.get("join");
    if (q) return q.toUpperCase();
    // lien profond de l'APK : bomberush://join/CODE
    const d = href.match(/bomberush:\/\/join\/([A-Za-z0-9]{4,8})/i);
    if (d) return d[1].toUpperCase();
  } catch {
    /* URL invalide */
  }
  return null;
}
