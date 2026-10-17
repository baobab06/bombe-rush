# Défis entre amis — alpha

Un mini-jeu par jour, une seule vraie partie, le meilleur du groupe gagne.
Implémentation alpha du *Cahier des charges — Défis quotidiens entre amis (v1)*.

Projet **indépendant de Bombe Rush** : tout est dans ce dossier `defis/`, sans
dépendance (Node ≥ 18), et peut être déplacé dans son propre dépôt tel quel.

## Lancer en local

```bash
cd defis
npm start          # http://localhost:8080
npm test           # 20 tests : barème, calendrier, rejeu serveur, parcours complet
```

Pour tester seul : ouvre deux navigateurs (ou une fenêtre privée), crée deux
joueurs, invite le second avec le code, puis lance un challenge en
**« Jours rapides de 5 min (test) »** : on parcourt une journée, sa clôture et
le rattrapage en quelques minutes.

## Appli Android (APK)

`apk/DefisEntreAmis.apk` — voir `apk/LISEZMOI.md` pour l'installer et le
recompiler (`./android/build-apk.sh`). L'APK ouvre le serveur du jeu dans une
fenêtre plein écran : il faut donc d'abord mettre le serveur en ligne.

## Mettre en ligne (Render)

Le `render.yaml` à la racine du dépôt concerne Bombe Rush ; on ne le touche pas.
Créer à la main un **second service web** sur Render :

| Réglage | Valeur |
|---|---|
| Name | `defis-entre-amis` (l'APK ouvre cette adresse par défaut) |
| Root Directory | `defis` |
| Build Command | *(vide)* |
| Start Command | `node server.mjs` |
| Health Check Path | `/health` |
| Variable `DATA_FILE` | `/var/data/db.json` + un **disque persistant** monté sur `/var/data` |

⚠️ Sans disque persistant (offre gratuite), les données sont perdues à chaque
redéploiement ou mise en veille. Autre limite de l'offre gratuite : le service
s'endort, donc les notifications horaires partent au réveil suivant.

Variables : `PORT`, `DATA_FILE`, `ALLOW_FAST_DAYS=0` pour masquer les jours rapides.

## Ce qui est fait (section 11 du CDC)

- [x] Les quatre mini-jeux jouables en entraînement et en vraie partie
- [x] Seuil atteint → « Tu es prêt ! » + compte à rebours de 3 s → vraie partie
- [x] « Lancer quand même » après 3 essais sous le seuil
- [x] Rattrapage : un essai, puis la vraie partie sans seuil ; classement recalculé
- [x] Une seule vraie partie : relance, resoumission, fermeture de l'app, autre appareil, réseau
- [x] Même seed officielle pour tout le groupe, différente des seeds d'entraînement
- [x] Détail des parties masqué jusqu'à la fin du rattrapage
- [x] Score recalculé par le serveur à partir des événements, de façon déterministe
- [x] Points du jour pour 2 à 10 joueurs, ex æquo compris
- [x] Clôture dans le fuseau du challenge, y compris les jours de 23 h / 25 h
- [x] Résultats impossibles refusés, résultats douteux marqués « suspect »
- [x] Revanches, provocations, chaque type de notification désactivable
- [x] Suppression du compte
- [x] Challenge de 7 jours à 4 joueurs de bout en bout (test automatique)

## Ce qui manque avant la v1

| Manque | Alpha | v1 |
|---|---|---|
| Connexion | pseudo + **code de récupération** (à copier dans les réglages) | Google / Apple |
| Notifications | dans l'app (cloche 🔔), sans heures calmes | push FCM / APNs, heures calmes 22 h–8 h |
| Données | un fichier JSON | vraie base (PostgreSQL…) |
| Appli | web (PWA) + APK Android (WebView) | Android 10+ / iOS 16+, publiées sur les stores |
| Âge | case « au moins 15 ans » | à décider (13 / 15 ans selon le pays) |
| Examen des « suspects » | marqués, pas d'écran d'admin | écran de modération |

## Décisions prises là où le CDC était flou

Toutes modifiables dans `lib/games.mjs` et `lib/app.mjs`.

- **Memory Blitz** : plafond de 12 séquences (3 à 14 cases), 5 s sans toucher = fin,
  durée max 150 s (nécessaire pour la règle « clôture + durée max + 2 min »).
- **Precision Shot** : `1000 × touchées/total × (0,5 + 0,5 × précision)` avec
  précision = touchées/tirs. La formule du CDC multipliait deux fois par la précision.
  Seuil : 60 % de précision **et** 5 cibles (sinon un seul tir réussi suffisait).
- **Reflex Rush** : 20 signaux valides + 6 leurres. Bonne réponse = toucher un signal
  valide en ≥ 100 ms. Toucher un leurre ou le vide = erreur. Aucun bon = 0.
- **Logic Sprint** : 50 points par bonne réponse, −15 par erreur (le barème
  100/−30 plafonnait à 1000 dès 10 réponses : tout le monde aurait été ex æquo).
- **Seed d'entraînement** : nouvelle à chaque essai, pour qu'on ne puisse pas apprendre la partie par cœur.
- **Résultat refusé** (impossible) : 0 point et non classé. Partie lancée jamais
  soumise : score 0, classée.
- **Joueur parti** : garde ses points et reste dans le classement final, marqué « parti ».
- **Fin des résultats provisoires et du challenge** : échéance du CDC + 5 min, pour
  laisser finir une partie lancée juste avant la clôture.
- **Provocations** : 3 par 24 h glissantes et par destinataire (le groupe compte comme un destinataire).

## Organisation du code

```
lib/rng.mjs        hasard déterministe (partagé navigateur / serveur)
lib/games.mjs      les 4 mini-jeux : génération, rejeu, score, plausibilité (partagé)
lib/scoring.mjs    points du jour, ex æquo, classement du challenge
lib/calendar.mjs   jours, clôtures, rattrapage, fuseaux et changements d'heure
lib/app.mjs        règles serveur : comptes, groupes, challenges, tentatives, social
lib/store.mjs      sauvegarde JSON
server.mjs         API HTTP + fichiers statiques
public/            appli web (aucune compilation)
android/           projet Android (WebView) + script de compilation
apk/               APK prêt à installer
test/              tests node:test + joueurs automatiques
```
