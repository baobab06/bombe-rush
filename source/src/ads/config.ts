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
   * Application Android : identifiants AdMob. Ceux-ci sont les identifiants
   * de TEST officiels publiés par Google (ils n'affichent que des pubs de test).
   * À remplacer par les vôtres uniquement pour la version publiée.
   */
  android: {
    appId: "ca-app-pub-3940256099942544~3347511713",
    rewarded: "ca-app-pub-3940256099942544/5224354917",
    interstitial: "ca-app-pub-3940256099942544/1033173712",
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
