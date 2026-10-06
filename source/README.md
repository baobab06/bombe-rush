# BOMBE RUSH — bêta web

Jeu d'arène à bombes multijoueur **jouable directement dans le navigateur**
(iPhone, Android, ordinateur), en paysage, sans rien installer. On envoie un
lien, les amis cliquent, ils jouent.

## ✨ V2 — boutique, pièces, skins, personnages animés

### Mettre à jour le jeu en ligne
Sur GitHub, « Add file » → « Upload files » → glisse **`index.html`** et
**`server.mjs`** (tirés de `deploy/www/` et `deploy/`) → « Commit changes ».
Render redéploie tout seul en 2-3 minutes.

### Où changer les chiffres (sans toucher au reste)
| Quoi | Fichier |
|---|---|
| **Mises par difficulté** (victoire + / défaite −) : `STAKES` | `src/meta/economy.ts` |
| Bonus de victoire (événements, séries, 1re victoire du jour…) : `WIN_MODIFIERS` | `src/meta/rewards.ts` |
| Prix par rareté, gains de fin de partie, récompense du jour, missions, événements, promo du jour | `src/meta/economy.ts` |
| Personnages et skins (un thème = une entrée dans `THEMES`, créé pour tous les persos) | `src/core/characters.ts` |
| Accessoires, effets (traînées), emotes | `src/core/cosmetics.ts` |
| Règles d'achat / équipement / missions (fonctions pures, testées) | `src/meta/store.ts` |

### Architecture ajoutée
- `src/meta/catalog.ts` : catalogue unique de tout ce qui se possède (skins,
  accessoires, effets, emotes, personnages). Boutique et collection ne lisent
  que lui : un nouveau type d'objet = un `kind` de plus.
- `src/meta/profile.ts` + `save.ts` : profil v2 (pièces, objets possédés,
  équipement, missions, série quotidienne) avec migration automatique des
  anciennes sauvegardes.
- `src/render/bodies.ts` : personnages (ombrage, mains, yeux qui clignent,
  expressions, poses d'action/dégâts/victoire, motifs de skins, accessoires).
- `src/render/charfx.ts` : auras, traînées, traces au sol, éclats de capacité.
- `src/ui/stage.ts` : le personnage en grand sur son piédestal (menus).
- `src/app/browser.ts` (boutique + collection), `locker.ts` (Personnage),
  `rewards.ts` (récompense du jour, missions), `purchase.ts` (achat animé).
- Réseau : la tenue (skin, accessoire, effet) et les emotes passent par le
  serveur (`setLook`, `emote`) ; tout reste 100 % cosmétique.

Les pièces sont stockées sur le téléphone du joueur (bêta). Pour une sortie
publique avec achats réels, il faudra des comptes et une validation serveur
des achats (`store.ts` est déjà prévu pour tourner côté serveur).

### Tests
`bun tests/sim.test.ts` (gameplay) et `bun tests/meta.test.ts` (boutique,
pièces, missions, sauvegarde) — ou `npm test` qui lance les deux.

## 📱 Appli Android (APK)

`dist/BombeRush.apk` : le jeu complet (identique à la version web) dans une
appli Android plein écran, en paysage, avec icône et écran de démarrage.
- Construite sans Android Studio : `android/build-apk.sh` (aapt2 + javac + dx + apksigner).
- Le jeu est embarqué dans l'APK (`assets/www`) et affiché dans une WebView ;
  le multijoueur passe par `https://bombe-rush.onrender.com` (modifiable dans
  `android/res/values/strings.xml`, ou dans Paramètres → Serveur en ligne).
- Bouton retour du téléphone, partage natif (INVITER), vibrations, écran
  toujours allumé, encoche gérée.
- **Garde précieusement `android/bomberush-test.keystore`** : les mises à jour
  de l'appli doivent être signées avec la même clé, sinon il faut désinstaller.
- Pour la distribuer : mets `BombeRush.apk` sur GitHub avec les autres
  fichiers ; elle est alors téléchargeable sur https://bombe-rush.onrender.com/BombeRush.apk

## 🚀 Mettre la bêta en ligne (≈ 10 minutes, sans ligne de commande)

Tout ce qu'il faut est **déjà compilé** dans le dossier `deploy/` :
`server.mjs` (serveur de jeu, aucune dépendance) + `www/` (le jeu).

### Pourquoi un serveur ?

Le multijoueur en temps réel a besoin d'un programme qui tourne en
permanence : il héberge les salles, fait tourner la partie (il fait
autorité, donc pas de triche ni de désynchronisation) et relaie les
mouvements à 20 images/s via WebSocket. Un hébergement « site statique »
(GitHub Pages, Netlify…) ne suffit pas.

**Pas de base de données** : les salles vivent en mémoire (une partie dure
2 min 30). La progression de chaque joueur est sauvegardée dans son navigateur.

### Option recommandée : Render (gratuit)

1. Crée un compte sur **github.com**, puis un dépôt (bouton « New »), par
   exemple `bombe-rush`.
2. Dans le dépôt : « Add file » → « Upload files » → glisse **le contenu du
   dossier `deploy/`** (server.mjs, package.json, render.yaml, Dockerfile, www/).
3. Crée un compte sur **render.com** (connexion avec GitHub).
4. « New » → « Blueprint » → choisis ton dépôt → « Apply ».
   (ou « New » → « Web Service » → ton dépôt → Start command : `node server.mjs`)
5. Après 1-2 minutes, Render te donne une adresse du type
   `https://bombe-rush.onrender.com` : **c'est le lien à envoyer**.

⚠️ Offre gratuite Render : le serveur s'endort après 15 min sans joueur ;
la première ouverture prend alors ~30-50 s (l'écran de chargement patiente).
L'offre payante la moins chère (~7 $/mois) supprime cette attente.

### Autres hébergeurs possibles

| Hébergeur | Comment | Remarque |
|---|---|---|
| Railway | New Project → Deploy from GitHub → dépôt `deploy/` | ~5 $/mois, pas de mise en veille |
| Fly.io | `fly launch` dans `deploy/` (Dockerfile fourni) | très bonne latence en Europe (région `cdg`) |
| Un VPS (OVH, Hetzner…) | `node server.mjs` ou `docker build . && docker run -p 80:8080` | il faut ajouter le HTTPS (Caddy le fait tout seul) |

Le serveur écoute sur la variable `PORT` (fournie automatiquement par ces hébergeurs).
Adresse de contrôle : `/health`.

### Envoyer le lien

> 🎮 Viens tester mon jeu !
> 👉 https://bombe-rush.onrender.com

Dans le jeu, **🎮 Partie privée → Créer une salle → INVITER** ouvre le partage
du téléphone (WhatsApp, Messenger, Discord, SMS…) avec un lien direct vers ta
salle. L'aperçu du lien affiche « 🎮 Guillaume t'invite sur BOMBE RUSH ».

### Conseils pour les testeurs

- **iPhone** : ouvrir le lien dans Safari, puis Partager → « Sur l'écran
  d'accueil » pour un vrai plein écran (sinon la barre de Safari reste visible).
  iOS 16 ou plus récent recommandé.
- **Android** : Chrome passe en plein écran et verrouille le paysage au
  premier toucher. Menu ⋮ → « Ajouter à l'écran d'accueil » pour une icône.
- **PC** : flèches / ZQSD pour bouger, Espace pour la bombe, E pour le bouclier.

## Modifier le jeu puis redéployer

```bash
npm install            # esbuild + TypeScript (outils de développement)
npm run deploy:bundle  # recompile tout dans deploy/
```
puis remplace les fichiers dans le dépôt GitHub : Render redéploie tout seul.
Pour tester en local : `npm run server` puis http://localhost:8787
(ou `http://<IP-du-PC>:8787` depuis les téléphones du même Wi-Fi).

## Plus tard : applications iPhone / Android

Le jeu est déjà structuré pour ça : la même page web peut être emballée par
Capacitor (`capacitor.config.json`, `scripts/android-landscape.mjs` sont prêts),
il suffira d'ajouter les dépendances Capacitor et de pointer l'app vers
l'adresse du serveur (`src/net/config.ts`). Rien à réécrire.

---

## Détails techniques

### Origine : vertical slice « Forêt »

Jeu d'arène à bombes pour mobile, vue de dessus légèrement 2.5D.
Cette version est une **tranche verticale jouable** : une map (Forêt), le mode
Classique, des bots en 3 niveaux, la progression et la sauvegarde locale.

## Ce qui fonctionne vraiment

| Domaine | État |
|---|---|
| Déplacement fluide sur grille, assistance dans les virages, collisions sur la grille | ✅ |
| Bombes (2,7 s), explosion en croix, murs qui bloquent, blocs détruits | ✅ |
| Réactions en chaîne (même tick, ordre déterministe) | ✅ |
| Éliminations (touché = la case du centre du perso est en feu) | ✅ |
| Bonus : Bombe +1, Flamme +1, Vitesse, Bouclier (bouton 🛡️, 3 s) | ✅ |
| Bots Facile / Normal / Difficile (carte de danger, fuite, chasse, bonus, bouclier) | ✅ |
| 4 maps : Forêt, Volcan (lave + cheminées en éruption), Banquise (glace glissante), Plage (lagon) + choix aléatoire | ✅ |
| Mort subite (spirale de pierres à 0:42) pour éviter les parties sans fin | ✅ |
| Joystick dynamique, gros boutons, multi-touch, clavier | ✅ |
| Paysage uniquement : arène pleine hauteur, HUD et commandes dans les colonnes latérales, zoom auto selon l'écran et l'encoche | ✅ |
| Sons + 2 musiques synthétisés (aucun fichier), vibrations | ✅ |
| 6 personnages de genres différents (renard, robot, grenouille, ninja, champignon, ourson), 24 skins débloquables avec les pièces | ✅ |
| Menus, choix du personnage et du skin, réglages, pause, résultats | ✅ |
| XP, niveaux, pièces, stats, sauvegarde locale | ✅ |
| Mode Chaos : 6 événements + « 🎲 aléatoire », alerte et compte à rebours 3-2-1 | ✅ |
| Parties privées en ligne : salle, code, lien d'invitation, lobby temps réel, prêt, exclusion, reconnexion | ✅ (serveur inclus, à héberger) |
| Notifications locales (app en arrière-plan) | ✅ |
| Notifications push (app fermée) | ⚙️ code prêt, nécessite Firebase (voir plus bas) |
| Matchmaking public | ⚙️ prêt côté serveur, pas encore de bouton |
| Boutique, classement, amis, récompenses | ⏳ données prêtes, pas d'écran |

## Technologie

**TypeScript + Canvas 2D**, emballé en APK Android avec **Capacitor**.

- La simulation (`src/core`) est du TypeScript pur, sans DOM, à pas fixe de
  60 ticks/s, avec un aléatoire « seedé ». La même classe `Match` pourra
  tourner sur un serveur Node autoritaire pour le multijoueur.
- Les bots produisent des `InputCmd`, exactement comme un humain : ils ne
  trichent pas, et ils pourront tourner côté serveur.
- Tout le visuel est procédural : remplacer un personnage par une vraie
  illustration revient à remplacer une fonction de `render/sprites.ts`.

## Arborescence

```
src/
  core/        simulation pure
    match.ts     boucle de jeu, bombes, explosions, chaînes, morts, mort subite
    movement.ts  déplacement sur grille + assistance de virage
    grid.ts      cases, bombes, bonus, flammes
    bonuses.ts   registre des bonus (ajouter un bonus = une entrée)
    characters.ts personnages + skins (ajouter un skin = une entrée dans SKINS)
    modes.ts     registre des modes (Chaos = crochets onStart/onTick)
    rules.ts     tous les réglages de gameplay
  ai/          bots : carte de danger (chaînes incluses), recherche de chemin temporisée
  maps/        forest / volcano / ice / beach + générateur symétrique (lave, eau, glace, cheminées)
  render/      renderer Canvas, art.ts (décor de chaque map), sprites, bodies.ts (personnages), particules
  input/       joystick, boutons, clavier
  audio/       moteur Web Audio (SFX + musique)
  meta/        profil, sauvegarde, progression, missions
  net/         session locale + protocole réseau prévu
  platform/    vibrations, viewport paysage (verrou, rotation, zones de sécurité)
  ui/          HTML/CSS des écrans, miniatures
  app/         écran de jeu + contrôleur d'application
tests/sim.test.ts   tests headless (explosions, chaînes, bonus, bouclier, collisions, 180 parties de bots)
scripts/build.mjs   build (esbuild) → dist/www/index.html
```

## Mode Chaos

`src/core/chaos.ts` — un directeur tire un événement toutes les 11 à 17 s
(premier vers 10 s), jamais deux à la fois :

| Événement | Effet | Alerte |
|---|---|---|
| 💣 Pluie de bombes | bombes neutres qui tombent pendant 4 s | 3-2-1 |
| 🔥 Tempête de flammes | 12 cases marquées s'enflamment 2,5 s | 3-2-1 + zones rouges |
| ⚡ Surcharge | 4 bonus apparaissent + chaque bloc cassé lâche un bonus (8 s) | bannière |
| 🏃 Speed chaos | tout le monde ×1,6 en vitesse (7 s) | bannière |
| 🛡️ Boucliers | 3 boucliers apparaissent | bannière |
| 💥 Explosion géante | zone 5×5 annoncée puis pulvérisée (blocs compris) | 3-2-1 + zone rouge |
| 🎲 Aléatoire | annonce « événement aléatoire » puis tire l'un des 6 | — |

Ajouter un événement = une entrée dans `CHAOS_EVENTS` (prepare / start / tick / end).
Tout utilise l'aléatoire de la partie : le serveur et les joueurs voient les mêmes événements.

## Parties privées (multijoueur en ligne)

Architecture (côté serveur, dossier `server/`) :

- `lobby.ts` — **lobby** : salles, codes, prêt, exclusion, choix du mode/de la carte, reconnexion (45 s de grâce)
- `matchmaking.ts` — **matchmaking** public (prêt, non exposé dans l'interface)
- `game.ts` — **jeu** : simulation autoritaire 60 Hz (même code `src/core` que le client), bots, 20 instantanés/s
- `ws.ts` — WebSocket sans dépendance · `push.ts` — notifications FCM · `index.ts` — HTTP + routes

Côté client : prédiction de son propre déplacement + réconciliation, interpolation des autres
joueurs (`src/net/onlineSession.ts`), reconnexion automatique (`src/net/connection.ts`), y compris
après un rechargement de la page.

### Tester en local (2 navigateurs ou 2 téléphones sur le même Wi-Fi)

```bash
npm install
npm run server            # http://localhost:8787
```

Ouvre `http://<IP-de-ton-PC>:8787` sur deux appareils → 🎮 Partie privée → Créer une salle →
Inviter. Le lien `http://…/j/CODE` fait entrer directement dans la salle.

### Mettre en ligne (pour jouer avec des amis partout)

Le serveur est un simple programme Node (aucune base de données). N'importe quel hébergeur
Node avec WebSockets convient (Render, Railway, Fly.io, un VPS…) :

1. `npm run build && npm run server:build`
2. Démarrer `node dist/server.mjs` (variables : `PORT`, `STATIC_DIR=dist/www`)
3. L'adresse publique (ex. `https://bomberush.onrender.com`) devient l'adresse des invitations.
4. Pour l'APK : mettre cette adresse dans `src/net/config.ts` (`APK_SERVER_URL`), puis
   `INVITE_HOST=bomberush.onrender.com npm run android:sync`.

### Liens d'invitation dans l'APK

- `bomberush://join/CODE` fonctionne dès l'installation.
- `https://TON_DOMAINE/j/CODE` ouvre directement l'app une fois les **Android App Links**
  vérifiés : définir `ANDROID_PACKAGE=com.bomberush.game` et `ANDROID_SHA256=<empreinte de ta clé
  de signature>` sur le serveur (il publie `/.well-known/assetlinks.json`). Sans l'app, le même
  lien ouvre le jeu dans le navigateur et rejoint la salle.

### Notifications

- **Locales** (fonctionnent déjà) : arrivée d'un ami ou début de partie pendant que le jeu est en
  arrière-plan.
- **Push** (app fermée) — nécessite Firebase, non configurable sans ton compte :
  1. Créer un projet Firebase, ajouter l'app Android `com.bomberush.game`
  2. Copier `google-services.json` dans `android/app/`
  3. Sur le serveur : `FCM_PROJECT_ID` et `FCM_SERVICE_ACCOUNT` (JSON du compte de service)
  Tant que ce n'est pas fait, le serveur l'indique dans ses logs et n'envoie rien.

## Lancer en local

```bash
npm install
npm run build        # crée dist/www/index.html
npm test             # tests de simulation
```

Ouvre `dist/www/index.html` dans Chrome (un double-clic suffit, aucun serveur nécessaire).
Sur ordinateur : flèches ou ZQSD, Espace = bombe, E = bouclier, Échap = pause.

## Générer l'APK Android

Prérequis : Node 18+, [Android Studio](https://developer.android.com/studio) (il installe le SDK et un JDK).

```bash
npm install
npm run android:init     # build + crée le projet android/ (une seule fois)
npm run android:open     # ouvre Android Studio
```

Dans Android Studio : **Build › Build App Bundle(s) / APK(s) › Build APK(s)**.
L'APK se trouve dans `android/app/build/outputs/apk/debug/app-debug.apk`.

En ligne de commande (avec `ANDROID_HOME` configuré) :

```bash
npm run android:apk
```

Après chaque modification du jeu : `npm run android:sync` puis relancer le build.

Orientation (paysage uniquement) :
- APK : `android:init` et `android:sync` lancent `scripts/android-landscape.mjs`,
  qui ajoute `android:screenOrientation="sensorLandscape"` à l'activité : l'app
  démarre et reste en paysage. Le plugin `@capacitor/screen-orientation`
  verrouille aussi au lancement.
- Navigateur : au premier toucher, le jeu tente plein écran + verrouillage
  paysage. Si l'écran reste en portrait (verrou refusé, rotation auto coupée,
  jeu affiché dans une autre app), toute l'interface pivote de 90° : il suffit
  de tenir le téléphone à l'horizontale (`src/platform/viewport.ts`).

Conseils pour l'APK :
- Les polices viennent de Google Fonts : hors connexion, le jeu utilise les
  polices système de repli. On les embarquera dans une prochaine version.

## Équilibrage rapide

Tout est dans `src/core/rules.ts` (durée de mèche, portée de départ, vitesse,
durée du bouclier, mort subite…) et `src/maps/forest.ts` (densité de blocs,
probabilité et répartition des bonus). Les profils des bots sont en tête de
`src/ai/bot.ts`.

## Étapes suivantes proposées

1. Retours de test sur la Forêt (sensation de contrôle, vitesse, bots).
2. Maps Volcan (lave), Banquise (glisse), Plage (eau) : nouveaux fichiers dans `maps/` + thèmes.
3. Mode Chaos via `modes.ts`.
4. Serveur Node autoritaire (WebSocket) réutilisant `core/` + lobby par code à 4 chiffres.
