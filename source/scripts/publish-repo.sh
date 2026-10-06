#!/usr/bin/env bash
# Prépare le dépôt GitHub déployé par Render :
#   server.mjs + www/ (jeu compilé + APK) à la racine, code source dans source/.
# Usage : scripts/publish-repo.sh /chemin/du/clone
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$1"
cd "$REPO"
git rm -rq --ignore-unmatch . >/dev/null 2>&1 || true
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp "$ROOT/dist/server.mjs" server.mjs
cp -r "$ROOT/dist/www" www
[ -f "$ROOT/dist/BombeRush.apk" ] && cp "$ROOT/dist/BombeRush.apk" www/BombeRush.apk
cp "$ROOT/deploy/package.json" "$ROOT/deploy/Dockerfile" .
cat > render.yaml <<'YAML'
# Render « Blueprint » : se met à jour tout seul à chaque envoi sur GitHub.
services:
  - type: web
    name: bombe-rush
    runtime: node
    plan: free
    buildCommand: echo "rien à compiler"
    startCommand: node server.mjs
    healthCheckPath: /health
    envVars:
      - key: STATIC_DIR
        value: ./www
YAML
mkdir source
(cd "$ROOT" && git ls-files -co --exclude-standard | grep -v -E '^(deploy/|dist/)' | while read -r f; do mkdir -p "$REPO/source/$(dirname "$f")"; cp "$f" "$REPO/source/$f"; done)
cat > README.md <<'MD'
# BOMBE RUSH

Jeu d'arène à bombes multijoueur — web (https://bombe-rush.onrender.com) et Android.

- `server.mjs` + `www/` : ce que Render met en ligne (jeu compilé, serveur multijoueur, `www/BombeRush.apk`).
- `source/` : tout le code du projet (TypeScript, serveur, appli Android, tests). Voir `source/README.md`.
MD
git add -A
