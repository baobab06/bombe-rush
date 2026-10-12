# Bombe Rush — Publier sur Google Play (pas à pas)

| | |
|---|---|
| Package | `com.bomberush.game` |
| Version | **1.0.0** (versionCode **9**) |
| SDK cible | **36** (Android 16) · SDK minimal 24 (Android 7.0) |
| Fichier à envoyer | `BombeRush-1.0.0.aab` (obtenu à l'étape 2) |
| Politique de confidentialité | https://bombe-rush.onrender.com/confidentialite.html |

---

## Étape 0 — Une seule fois : installer Java sur ton PC

Il faut Java pour créer ta clé et signer le fichier.
Ouvre **Invite de commandes** (touche Windows, tape `cmd`, Entrée), puis colle :

```
winget install EclipseAdoptium.Temurin.21.JDK
```

Si `winget` n'existe pas : télécharge **Temurin 21 (JDK)** sur https://adoptium.net
et installe-le avec les options par défaut. Redémarre le PC ensuite.

## Étape 1 — Une seule fois : créer TA clé

1. Copie tout le dossier `publication` sur ton PC (par exemple sur le Bureau).
2. Double-clique sur **`1-creer-ma-cle.bat`**.
3. Choisis un mot de passe (6 caractères minimum ; rien ne s'affiche quand tu tapes, c'est normal),
   puis réponds aux questions (ton nom, puis Entrée pour passer le reste) et tape `oui`.
4. La clé est créée dans `C:\Users\<toi>\BombeRush-cle\bomberush-upload.jks`.

**À faire tout de suite :**
- copie `bomberush-upload.jks` sur une clé USB ou un cloud personnel ;
- note le mot de passe dans un gestionnaire de mots de passe ;
- ne les envoie à personne et ne les mets jamais sur GitHub.

Si tu perds la clé, Google peut en enregistrer une nouvelle (Play Console → Intégrité de l'appli →
« Demander la réinitialisation de la clé d'importation »), mais c'est plus long.

En ligne de commande, cela correspond à :

```
keytool -genkeypair -v -keystore "%USERPROFILE%\BombeRush-cle\bomberush-upload.jks" -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

## Étape 2 — À chaque version : signer le .aab

1. Mets `BombeRush-1.0.0-unsigned.aab` **dans le même dossier** que `2-signer-aab.bat`.
2. Double-clique sur **`2-signer-aab.bat`** et tape le mot de passe de ta clé.
3. Tu obtiens **`BombeRush-1.0.0.aab`** : c'est ce fichier qu'on envoie sur Google Play.

En ligne de commande, cela correspond à :

```
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "%USERPROFILE%\BombeRush-cle\bomberush-upload.jks" -signedjar BombeRush-1.0.0.aab BombeRush-1.0.0-unsigned.aab upload
jarsigner -verify BombeRush-1.0.0.aab
```

(La dernière ligne doit afficher `jar verified.` Un avertissement « self-signed » est normal.)

## Étape 3 — Tester la version Release sur ton téléphone

Le fichier `BombeRush-1.0.0-release-TEST.apk` a été fabriqué à partir du .aab par l'outil
officiel de Google (bundletool). Il est signé avec la clé de **test**, comme les APK d'avant.

1. Envoie-le sur ton téléphone et ouvre-le. Autorise « Installer des applis inconnues » si Android le demande.
   Il s'installe par-dessus ta version actuelle, et ta progression est gardée.
2. À vérifier :
   - le jeu démarre ;
   - l'accueil s'affiche en paysage ;
   - une partie Classique et une partie Chaos se jouent jusqu'au bout, avec le joystick, la bombe et le bouclier ;
   - le bouton **Retour** du téléphone ferme les fenêtres et met le jeu en pause ;
   - la boutique, l'ouverture d'un coffre et les missions fonctionnent ;
   - une partie privée avec un ami fonctionne ;
   - en **mode avion**, le solo fonctionne et les parties privées affichent « serveur injoignable » sans planter ;
   - quitter le jeu puis le rouvrir garde la progression.

⚠️ **Important** : la version installée depuis Google Play est signée par Google. Elle ne peut pas
s'installer par-dessus une version de test, il faudra d'abord désinstaller la version de test.
**Désinstaller efface la progression enregistrée sur le téléphone.**

## Étape 4 — Google Play Console

1. **Compte** : https://play.google.com/console → créer un compte développeur
   (25 $ une seule fois, vérification d'identité).
2. **Créer l'application** : nom « Bombe Rush », langue Français, type **Jeu**, **Gratuit**.
   Accepte les déclarations.
3. **Configurer l'application** (tableau de bord → « Configurer votre application ») :
   - Politique de confidentialité : `https://bombe-rush.onrender.com/confidentialite.html`
   - Accès à l'application : tout est accessible sans identifiant.
   - Annonces : **Non**, l'appli ne contient pas de publicité pour l'instant.
   - Classification du contenu : remplis le questionnaire (réponses proposées dans `FICHE-PLAY-STORE.md`).
   - Public cible : voir `FICHE-PLAY-STORE.md`.
   - Sécurité des données : réponses proposées dans `FICHE-PLAY-STORE.md`.
   - Catégorie : **Jeu → Action** (ou Arcade).
   - Fiche du Store : textes, icône 512×512, bannière 1024×500 et captures, tous dans le dossier `fiche-store`.
4. **Test fermé**. C'est obligatoire pour les comptes personnels récents : **12 testeurs pendant 14 jours d'affilée**.
   - Menu **Tester → Test fermé** → créer une piste.
   - Section « Testeurs » : crée une liste avec les adresses Gmail de 12 personnes ou plus (amis, famille).
   - « Créer une version » → Google propose **« Signature d'application par Google Play »** : accepte.
   - Téléverse **`BombeRush-1.0.0.aab`** → nom de version « 1.0.0 » → notes de version → **Publier sur le test fermé**.
   - Envoie le **lien d'inscription** aux testeurs. Ils doivent l'accepter puis installer le jeu depuis le Play Store.
     Ils doivent rester inscrits 14 jours.
5. **Production** : au bout des 14 jours, tableau de bord → **Demander l'accès à la production**.
   Réponds au questionnaire sur le test, puis crée une version de production avec le même .aab
   (ou un nouveau) et envoie-la en examen. L'examen par Google prend quelques jours.

## Mises à jour suivantes

Chaque nouvelle version doit avoir un **versionCode plus grand** (10, 11…). Je le fais dans
`android/AndroidManifest.xml`, puis je reconstruis le .aab avec `android/build-aab.sh`. Tu le signes
avec la même clé (étape 2) et tu le téléverses.
