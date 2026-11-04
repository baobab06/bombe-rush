# Annonces de mise à jour — mode d'emploi

## Où ?
Page d'administration : **https://bombe-rush.onrender.com/admin-mises-a-jour.html**
Clé : variable d'environnement `ADMIN_TOKEN` du service Render (jamais dans le code).

## Réglages
| Champ | Effet |
|---|---|
| Notifications activées | Désactivé = aucun message, aucune version bloquée (interrupteur général). |
| Dernière version | Version disponible sur Google Play (ex. `1.12.0`). Les joueurs plus anciens voient la fenêtre. |
| Version minimale | En dessous : mise à jour **obligatoire** (plein écran, pas de « plus tard »). |
| Obligatoire | La dernière version devient obligatoire pour tout le monde. |
| Titre / description / notes | Texte affiché dans la fenêtre (notes : Nouveau, Amélioré, Correction). |
| Lien Google Play | Ouvert par « METTRE À JOUR » (doit être un lien play.google.com). |

## Quand une nouvelle version sort
1. Attendre que Google Play l'ait **acceptée** (sinon les joueurs ne la trouvent pas encore).
2. Ouvrir la page, mettre « Dernière version » = la nouvelle version, écrire le titre et les notes.
3. Laisser « Obligatoire » décoché, sauf si les anciennes versions ne doivent plus jouer (bug grave, changement du multijoueur).
4. « Publier l'annonce ». Les joueurs la voient au prochain lancement (ou en revenant dans le jeu après 30 min).

## Ce que fait le jeu
- Vérifie au lancement (`GET /api/update?v=…`), puis au retour dans l'appli au plus toutes les 30 min.
- Facultative : une fois par session, « PLUS TARD » laisse jouer.
- Obligatoire : partie, salles privées et multijoueur bloqués ; une partie en cours n'est jamais coupée (la fenêtre attend la fin).
  Le serveur refuse aussi le multijoueur et l'envoi de sauvegarde en ligne aux versions obsolètes (rien n'est effacé).
- Hors ligne / serveur en panne : la dernière réponse connue est utilisée ; un joueur à jour n'est jamais bloqué.
- Le site web est toujours à jour : son bouton « RECHARGER LE JEU » recharge simplement la page.
- Les versions ≤ 1.11.5 ne connaissent pas ce système : elles n'affichent pas la fenêtre ; si la version minimale dépasse 1.11.5, le serveur leur refuse seulement le multijoueur et la sauvegarde en ligne.
