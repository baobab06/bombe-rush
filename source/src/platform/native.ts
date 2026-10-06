/**
 * Pont vers l'application Android (APK). L'appli injecte l'objet
 * `BombeRushAndroid` dans la page ; dans un navigateur il n'existe pas et
 * tout retombe sur les API web.
 */
export interface AndroidBridge {
  share(text: string, title: string): void;
  vibrate(ms: number): void;
  /** adresse du serveur multijoueur intégrée à l'APK */
  serverUrl(): string;
  appVersion(): string;
  exitApp(): void;
}

export function androidApp(): AndroidBridge | null {
  return (window as unknown as { BombeRushAndroid?: AndroidBridge }).BombeRushAndroid ?? null;
}
