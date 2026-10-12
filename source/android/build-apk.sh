#!/usr/bin/env bash
# Construit l'APK Android de BOMBE RUSH sans Android Studio ni Gradle.
# Outils (dans $TOOLS) : aapt2, android.jar (API 34, compilation), dx.jar, apksigner.jar. Cible : API 36 (manifeste).
#   ./android/build-apk.sh            → dist/BombeRush.apk
set -euo pipefail
unset JAVA_TOOL_OPTIONS
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
TOOLS="${TOOLS:-/home/claude/androidtools}"
AAPT2="$TOOLS/apktool/brut.apktool/apktool-lib/src/main/resources/prebuilt/linux/aapt2"
ANDROID_JAR="$TOOLS/platforms/android-34/android.jar"
DX="$TOOLS/dx.jar"
APKSIGNER="$TOOLS/apksigner.jar"
KEYSTORE="${KEYSTORE:-$HERE/bomberush-test.keystore}"
# mot de passe de la clé de TEST : variable TEST_KS_PASS ou fichier android/bomberush-test.pass (hors Git)
TEST_KS_PASS="${TEST_KS_PASS:-$(cat "$HERE/bomberush-test.pass" 2>/dev/null || true)}"
[ -n "$TEST_KS_PASS" ] || { echo "Mot de passe de la clé de test manquant (TEST_KS_PASS ou android/bomberush-test.pass)"; exit 1; }
OUT="$ROOT/dist/android"
rm -rf "$OUT" && mkdir -p "$OUT/compiled" "$OUT/classes" "$OUT/gen" "$OUT/assets"

echo "1/6 ressources"
"$AAPT2" compile --dir "$HERE/res" -o "$OUT/compiled/res.zip"
echo "2/6 manifeste + liaison"
cp -r "$ROOT/dist/www" "$OUT/assets/www"
"$AAPT2" link -o "$OUT/base.apk" -I "$ANDROID_JAR" --manifest "$HERE/AndroidManifest.xml" \
  --java "$OUT/gen" -A "$OUT/assets" --min-sdk-version 24 --target-sdk-version 36 \
  -0 png "$OUT/compiled/res.zip"
echo "3/6 Java"
javac -nowarn -source 8 -target 8 -encoding UTF-8 -bootclasspath "$ANDROID_JAR" -d "$OUT/classes" \
  $(find "$HERE/src" "$OUT/gen" -name "*.java") 2>&1 | grep -v "warning\|^Note" || true
echo "4/6 dex"
java -jar "$DX" --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"
echo "5/6 assemblage"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$TEST_KS_PASS" -keypass "$TEST_KS_PASS" -alias bomberush \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Bombe Rush, O=Bombe Rush, C=FR" >/dev/null 2>&1
fi
echo "6/6 signature"
java -jar "$APKSIGNER" sign --ks "$KEYSTORE" --ks-pass pass:$TEST_KS_PASS --key-pass pass:$TEST_KS_PASS --ks-key-alias bomberush \
  --min-sdk-version 24 --out "$ROOT/dist/BombeRush.apk" "$OUT/unsigned.apk"
java -jar "$APKSIGNER" verify --verbose "$ROOT/dist/BombeRush.apk" | head -6
ls -la "$ROOT/dist/BombeRush.apk"
