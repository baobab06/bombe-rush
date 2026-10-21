# Publicités dans BOMBE RUSH — état et activation

## Ce qu'est le projet aujourd'hui

- **Jeu web** : TypeScript + Canvas 2D, un seul fichier HTML, servi par un
  petit serveur Node (Render). Il n'utilise ni Unity ni Godot.
- **APK Android** : une coquille WebView (`android/`) construite **sans Gradle**
  (aapt2 → javac → dx → apksigner) qui affiche ce même jeu web.

## Ce qui est déjà fait dans le code

| Élément | Fichier |
|---|---|
| Réglages : fréquences, plafonds, identifiants | `src/ads/config.ts` |
| Service unique (le jeu ne parle qu'à lui) + fournisseurs | `src/ads/service.ts` |
| Règles des récompenses (plafonds par jour, une fois par partie) | `src/meta/ad-rewards.ts` |
| Interface : consentement, vidéos, pub entre deux parties | `src/app/ads-ui.ts` |

- **Vidéos récompensées**, toujours au choix du joueur :
  - +100 pièces, au plus 5 fois par jour (page Missions) ;
  - un coffre commun gratuit, une fois par jour (page Missions) ;
  - doubler les pièces gagnées en fin de partie, une fois par partie et au plus +600.
  La récompense n'est donnée **que si la régie confirme que la vidéo a été vue jusqu'au bout**.
  Vidéo fermée, absente ou en échec : un message s'affiche et le jeu continue.
- **Pub entre deux parties** : jamais pendant un combat. Elle ne s'affiche
  qu'en quittant l'écran de fin, au plus une fois toutes les 3 parties et
  toutes les 4 minutes, et jamais pendant les 2 premières parties de la session.
- **Consentement** : demandé avant la première pub (personnalisées ou non) et
  modifiable dans Paramètres. Ce choix est transmis à la régie.
- **Aucune régie configurée = aucune pub et aucun bouton.** C'est l'état
  actuel en production : rien n'est simulé et aucun revenu n'est inventé.
- Pour tester en local uniquement : `http://localhost:…/?ads=test` (fausse
  pub signalée « PUB DE TEST ») ou `?ads=test-none` (aucune pub disponible).
  Ce mode ne fonctionne pas sur le site en ligne.

## État au 16 octobre 2026 (version 1.1.1)

Les **vrais identifiants AdMob** du compte Bombe Rush sont en place (`src/ads/config.ts`,
`android-gradle/gradle.properties`). Les vraies pubs ne s'affichent que si l'appli est installée
depuis Google Play ; un APK installé à la main utilise les pubs de test de Google (`AdsBridge.installedFromPlay`).

## Version 1.1.0 (14 octobre 2026)

L'appli Android **contient maintenant AdMob**. C'est un projet Gradle (`android-gradle/`), compilé
automatiquement par GitHub Actions (`ci/android.yml`, branche `android-builds`). Elle contient le pont natif
`window.BombeRushAds` (`AdsBridge.java`), le formulaire de consentement UMP et les **identifiants de test**
officiels de Google. Pour passer aux vraies pubs, voir `android/publication/PUBS-ADMOB.md`.

## Historique : pourquoi AdMob n'était pas actif avant la 1.1

AdMob a besoin de son **SDK Android officiel** (Google Mobile Ads), qui
s'ajoute avec Gradle et ses dépendances. L'APK actuel est construit sans
Gradle : on ne peut pas y intégrer ce SDK proprement. Par ailleurs, AdMob
ne fonctionne pas dans un site web, et les règles AdSense interdisent
d'afficher des pubs web à l'intérieur d'une WebView d'application.

## Activer les pubs dans l'application Android (AdMob)

1. Créer un compte **AdMob**, ajouter l'application (package `com.bomberush.game`),
   créer un bloc « Récompensée » et un bloc « Interstitiel ».
2. Passer l'APK à un **projet Gradle** : Android Studio, ou bien Capacitor
   avec le plugin `@capacitor-community/admob`. Ajouter la dépendance
   `com.google.android.gms:play-services-ads` et l'identifiant d'application
   AdMob dans le manifeste.
3. Intégrer le **SDK UMP** (User Messaging Platform) de Google pour le
   consentement européen (RGPD / TCF), puis configurer le message dans AdMob
   (*Confidentialité et messages*).
4. Exposer au jeu un pont JavaScript `window.BombeRushAds` avec les fonctions
   `isReady(kind)`, `showRewarded(adUnit, callbackId)`,
   `showInterstitial(adUnit, callbackId)` et `setConsent(personalized)`.
   Le résultat se renvoie avec
   `window.__bombeRushAdResult(callbackId, "completed" | "skipped" | "unavailable" | "error" | "shown")`.
   Ne renvoyer `completed` qu'au rappel officiel du SDK
   `OnUserEarnedRewardListener`. Le jeu détecte ce pont automatiquement.
5. Pendant le développement, garder les **identifiants de test officiels de
   Google** déjà présents dans `src/ads/config.ts`. Ne les remplacer par les
   vrais identifiants que pour la version publiée.
6. Google Play Console : remplir la section *Sécurité des données*
   (identifiant publicitaire) et déclarer que l'application contient des
   publicités.

## Activer les pubs sur le jeu web (AdSense — H5 Games Ads)

1. Avoir un compte **AdSense** validé pour le domaine du jeu (il faut un nom
   de domaine à vous ; un sous-domaine `onrender.com` ne suffit pas en général),
   et demander l'accès à **H5 Games Ads** (API Ad Placement).
2. Publier le fichier `ads.txt` fourni par AdSense à la racine du site.
3. Mettre l'identifiant `ca-pub-…` dans `ADS.webPublisherId`. Laisser
   `webTestMode: true` tant que Google n'a pas validé le compte.
4. Activer un **CMP certifié** pour l'Europe dans AdSense (*Confidentialité et
   messages*). Le choix proposé par le jeu ne remplace pas un CMP certifié.

## Bouton « Sans pub »

Il n'est **pas** créé, parce qu'il n'y a pas d'achat intégré réel. Pour le
faire : Google Play Billing dans l'application (produit « remove_ads »,
vérification de l'achat côté serveur), et un paiement (Stripe…) avec un
compte joueur pour le web. Ensuite, désactiver `ads.interstitial()` pour les
joueurs qui ont acheté l'option.
