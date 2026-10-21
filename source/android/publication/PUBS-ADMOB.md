# Bombe Rush — Activer les vraies publicités (AdMob)

La version **1.1.1** de l'appli contient AdMob, le SDK officiel de Google :
- vidéos récompensées (+100 pièces, coffre gratuit, doubler ses gains) ;
- une pub entre deux parties, au maximum toutes les 3 parties et toutes les 4 minutes, jamais pendant un combat ;
- le formulaire de consentement officiel de Google pour l'Europe ;
- le bouton « Choix de confidentialité » dans les Paramètres.

**Depuis la 1.1.1, ce sont tes VRAIS identifiants** (compte AdMob `pub-8702007304042641`) :
| | Identifiant |
|---|---|
| Application | `ca-app-pub-8702007304042641~8404560974` |
| Vidéo avec récompense | `ca-app-pub-8702007304042641/4862655803` |
| Interstitiel (entre deux parties) | `ca-app-pub-8702007304042641/9926535369` |

**Sécurité intégrée** : l'appli n'affiche les vraies pubs que si elle a été installée **depuis Google Play**.
Un APK installé à la main (comme `BombeRush-1.1.1-pubs-TEST.apk`) affiche les pubs « Test Ad » de Google :
tu peux cliquer dessus sans risque pour ton compte AdMob.
(Le bloc « Interstitiel avec récompense » créé par erreur n'est pas utilisé : tu peux le laisser.)

## 1. Créer le compte AdMob (toi)
1. https://admob.google.com → se connecter avec ton compte Google → accepter les conditions.
2. Renseigner le **paiement** (adresse, puis plus tard compte bancaire) : c'est là que l'argent arrive.
3. **Applications → Ajouter une application** → Android → « L'application est-elle publiée ? »
   Réponds « Non » tant qu'elle n'est pas sur le Play Store → nom **Bombe Rush**.
4. Dans l'application, **Blocs d'annonces → Ajouter** :
   - **Avec récompense** (nom : « Video recompensee », récompense : 1 « bonus ») ;
   - **Interstitiel** (nom : « Entre deux parties »).
5. ✅ Fait — les **3 identifiants** :
   - ID de l'application : `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`
   - ID du bloc récompensé : `ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ`
   - ID du bloc interstitiel : `ca-app-pub-XXXXXXXXXXXXXXXX/WWWWWWWWWW`
6. **Confidentialité et messages → Créer un message RGPD** pour l'application, puis publie-le.
   C'est le formulaire de consentement que l'appli affiche aux joueurs européens.

## 2. Ce que je fais avec tes identifiants
- Je les mets dans `android-gradle/gradle.properties` (ID de l'application) et dans `src/ads/config.ts` (ID des blocs).
- GitHub recompile automatiquement l'appli, puis je te livre le nouveau .aab à signer (comme avant).

## 3. Une fois l'appli publiée sur Google Play
- Dans AdMob, **relie l'application** à sa fiche Google Play (Paramètres de l'application → Associer à une plate-forme).
- **app-ads.txt** : AdMob demande un fichier `app-ads.txt` sur le site web indiqué dans ta fiche Play.
  Il faut un nom de domaine à toi (environ 10 € par an), indiqué comme site du développeur.
  Je pourrai y mettre le fichier.
- Ne clique jamais sur tes propres pubs : AdMob bloque les comptes qui le font. Pour essayer l'appli toi-même,
  ajoute ton téléphone comme **appareil de test** (AdMob → Paramètres → Appareils de test).

## Comment l'appli est compilée
L'appli avec AdMob est un projet Android standard (`android-gradle/`). Elle est compilée automatiquement
sur GitHub à chaque mise à jour (`.github/workflows/android.yml`). Les fichiers produits arrivent sur la
branche `android-builds` du dépôt : `.aab` et `.apk` non signés, plus le journal de compilation.
- Le **.aab** se signe avec TA clé (`2-signer-aab.bat`), puis s'envoie sur la Play Console.
- L'**APK de test** est signé avec la clé de test, donc il s'installe par-dessus les versions de test précédentes.
