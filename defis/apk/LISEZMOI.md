# APK Android — Défis entre amis (alpha)

`DefisEntreAmis.apk` : version 0.1.0-alpha, Android 7 et plus (cible Android 16).

## Installer sur un téléphone

1. Envoie `DefisEntreAmis.apk` sur le téléphone (câble, Drive, WhatsApp…) ou
   télécharge-le depuis le serveur : `https://<ton-serveur>/apk/DefisEntreAmis.apk`
   (bouton « Télécharger l'appli Android » sur la page d'accueil du site).
2. Ouvre le fichier et accepte « Installer des applis inconnues » pour l'appli utilisée.
3. Lance **Défis entre amis**.

## Le serveur

L'appli est une fenêtre sur le serveur du jeu : il doit tourner quelque part.
Au premier lancement elle ouvre `https://defis-entre-amis.onrender.com`.
Le plus simple est donc de nommer le service Render **defis-entre-amis**.

Sinon, ou si le serveur est injoignable, un écran demande son adresse :
- l'adresse Render, ou
- `http://192.168.x.x:8080` pour un serveur lancé avec `npm start` sur ton
  ordinateur, téléphone sur le même Wi-Fi.

L'adresse se change ensuite dans **Réglages → Changer de serveur**.

## Recompiler

```bash
cd defis
./android/build-apk.sh                                  # même version, serveur par défaut ci-dessus
./android/build-apk.sh 0.2.0                            # nouvelle version (à faire pour chaque mise à jour)
DEFIS_SERVER=https://mon-serveur.onrender.com ./android/build-apk.sh
```

Le script télécharge lui-même les outils Android (une fois) et signe avec la
**clé de test** `android/test.keystore` : chaque nouvelle version s'installe
par-dessus l'ancienne, sans perdre les données. Pour publier sur Google Play,
il faudra une vraie clé gardée hors du dépôt.
