#!/usr/bin/env bash
# Version de PUBLICATION Google Play, sans Android Studio ni Gradle :
#   1. dist/release/BombeRush-<version>-unsigned.aab  → à signer sur ton PC avec TA clé
#      d'importation (voir android/publication/), puis à téléverser sur la Play Console ;
#   2. dist/release/BombeRush-<version>-release-TEST.apk → APK universel généré DEPUIS ce
#      .aab par l'outil officiel bundletool, signé avec la clé de TEST (pour l'essayer
#      sur ton téléphone ; jamais à publier).
# Outils (dans $TOOLS) : aapt2, android.jar, dx.jar, apksigner.jar, bundletool.jar.
set -euo pipefail
unset JAVA_TOOL_OPTIONS
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
TOOLS="${TOOLS:-/home/claude/androidtools}"
AAPT2="$TOOLS/apktool/brut.apktool/apktool-lib/src/main/resources/prebuilt/linux/aapt2"
ANDROID_JAR="$TOOLS/platforms/android-34/android.jar"
DX="$TOOLS/dx.jar"
APKSIGNER="$TOOLS/apksigner.jar"
BUNDLETOOL="$TOOLS/bundletool.jar"
TEST_KS="${KEYSTORE:-$HERE/bomberush-test.keystore}"
# mot de passe de la clé de TEST : variable TEST_KS_PASS ou fichier android/bomberush-test.pass (hors Git)
TEST_KS_PASS="${TEST_KS_PASS:-$(cat "$HERE/bomberush-test.pass" 2>/dev/null || true)}"
[ -n "$TEST_KS_PASS" ] || { echo "Mot de passe de la clé de test manquant (TEST_KS_PASS ou android/bomberush-test.pass)"; exit 1; }
MANIFEST="$HERE/AndroidManifest.xml"
VERSION="$(grep -o 'versionName="[^"]*"' "$MANIFEST" | cut -d'"' -f2)"
CODE="$(grep -o 'versionCode="[^"]*"' "$MANIFEST" | cut -d'"' -f2)"
OUT="$ROOT/dist/release"
WORK="$ROOT/dist/aab-work"
AAB="$OUT/BombeRush-$VERSION-unsigned.aab"
TEST_APK="$OUT/BombeRush-$VERSION-release-TEST.apk"
rm -rf "$WORK" "$OUT" && mkdir -p "$WORK/compiled" "$WORK/classes" "$WORK/gen" "$WORK/assets" "$WORK/module/manifest" "$WORK/module/dex" "$OUT"
echo "Bombe Rush $VERSION (versionCode $CODE)"

echo "1/7 ressources"
"$AAPT2" compile --dir "$HERE/res" -o "$WORK/compiled/res.zip"
echo "2/7 manifeste + liaison (format « proto » des App Bundles)"
cp -r "$ROOT/dist/www" "$WORK/assets/www"
rm -f "$WORK/assets/www/BombeRush.apk"
"$AAPT2" link --proto-format -o "$WORK/proto.apk" -I "$ANDROID_JAR" --manifest "$MANIFEST" \
  --java "$WORK/gen" -A "$WORK/assets" "$WORK/compiled/res.zip"
echo "3/7 Java"
javac -nowarn -source 8 -target 8 -encoding UTF-8 -bootclasspath "$ANDROID_JAR" -d "$WORK/classes" \
  $(find "$HERE/src" "$WORK/gen" -name "*.java") 2>&1 | grep -v "warning\|^Note" || true
echo "4/7 dex"
java -jar "$DX" --dex --min-sdk-version=24 --output="$WORK/module/dex/classes.dex" "$WORK/classes"
echo "5/7 module « base »"
(cd "$WORK" && unzip -q proto.apk -d raw)
mv "$WORK/raw/AndroidManifest.xml" "$WORK/module/manifest/AndroidManifest.xml"
mv "$WORK/raw/resources.pb" "$WORK/module/resources.pb"
mv "$WORK/raw/res" "$WORK/module/res"
mv "$WORK/raw/assets" "$WORK/module/assets"
(cd "$WORK/module" && zip -q -r -X ../base.zip manifest dex res assets resources.pb)
echo "6/7 bundle (.aab) + validation par bundletool"
java -jar "$BUNDLETOOL" build-bundle --modules="$WORK/base.zip" --output="$AAB"
java -jar "$BUNDLETOOL" validate --bundle="$AAB" > "$WORK/validate.txt"
echo "   bundle valide"
echo "7/7 APK Release de TEST généré depuis le .aab (clé de test)"
java -jar "$BUNDLETOOL" build-apks --bundle="$AAB" --output="$WORK/test.apks" --mode=universal \
  --ks="$TEST_KS" --ks-pass=pass:$TEST_KS_PASS --ks-key-alias=bomberush --key-pass=pass:$TEST_KS_PASS
(cd "$WORK" && unzip -q -o test.apks universal.apk)
mv "$WORK/universal.apk" "$TEST_APK"
java -jar "$APKSIGNER" verify --verbose "$TEST_APK" | head -4
ls -la "$OUT"
