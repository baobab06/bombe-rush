/**
 * PUBLICITÉS — réglages (fréquences, plafonds, identifiants).
 *
 * État actuel : AUCUNE régie n'est activée en production (pas de compte ni
 * d'identifiants réels dans le projet). Les boutons « regarder une pub » sont
 * donc masqués et le jeu fonctionne normalement. Voir docs/PUBLICITES.md pour
 * l'activation (AdSense H5 Games pour le web, AdMob pour l'application).
 *
 * Ne JAMAIS mettre ici de faux identifiants de production.
 */
export const ADS = {
  /** Web : identifiant éditeur AdSense « ca-pub-… » (vide = pubs web désactivées) */
  webPublisherId: "",
  /** Web : mode test de l'API Ad Placement (à garder "on" tant que le compte n'est pas validé) */
  webTestMode: true,
  /**
   * Application Android : VRAIS identifiants AdMob du compte Bombe Rush.
   * Sécurité : l'appli n'affiche les vraies pubs que si elle a été installée
   * depuis Google Play ; un APK installé à la main utilise les pubs de TEST
   * de Google (voir AdsBridge.java).
   */
  android: {
    appId: "ca-app-pub-8702007304042641~8404560974",
    rewarded: "ca-app-pub-8702007304042641/4862655803",
    interstitial: "ca-app-pub-8702007304042641/9926535369",
  },

  /** Pubs récompensées (toujours au choix du joueur) */
  rewarded: {
    /** pièces offertes par pub, et nombre maximum par jour */
    coins: { amount: 100, perDay: 5 },
    /** doubler les pièces gagnées en fin de partie (une fois par partie) */
    double: { maxBonus: 600 },
    /** coffre commun gratuit, une fois par jour */
    freeChest: { tier: "common" as const, perDay: 1 },
  },

  /** Pubs entre deux parties (jamais pendant un combat) */
  interstitial: {
    /** parties terminées au minimum entre deux pubs */
    minGamesBetween: 3,
    /** secondes minimum entre deux pubs (toutes pubs confondues) */
    minSecondsBetween: 240,
    /** pas de pub avant d'avoir joué ce nombre de parties dans la session */
    graceGames: 2,
  },
};

export type RewardedPlacement = "coins" | "double" | "freeChest";
