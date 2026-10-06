#!/usr/bin/env bash
# Construit l'APK Android de BOMBE RUSH sans Android Studio ni Gradle.
# Outils (dans $TOOLS) : aapt2, android.jar (API 34), dx.jar, apksigner.jar.
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
OUT="$ROOT/dist/android"
rm -rf "$OUT" && mkdir -p "$OUT/compiled" "$OUT/classes" "$OUT/gen" "$OUT/assets"

echo "1/6 ressources"
"$AAPT2" compile --dir "$HERE/res" -o "$OUT/compiled/res.zip"
echo "2/6 manifeste + liaison"
cp -r "$ROOT/dist/www" "$OUT/assets/www"
"$AAPT2" link -o "$OUT/base.apk" -I "$ANDROID_JAR" --manifest "$HERE/AndroidManifest.xml" \
  --java "$OUT/gen" -A "$OUT/assets" --min-sdk-version 24 --target-sdk-version 34 \
  --version-code 3 --version-name 0.3.0 -0 png "$OUT/compiled/res.zip"
echo "3/6 Java"
javac -nowarn -source 8 -target 8 -encoding UTF-8 -bootclasspath "$ANDROID_JAR" -d "$OUT/classes" \
  $(find "$HERE/src" "$OUT/gen" -name "*.java") 2>&1 | grep -v "warning\|^Note" || true
echo "4/6 dex"
java -jar "$DX" --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"
echo "5/6 assemblage"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass bomberush -keypass bomberush -alias bomberush \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Bombe Rush, O=Bombe Rush, C=FR" >/dev/null 2>&1
fi
echo "6/6 signature"
java -jar "$APKSIGNER" sign --ks "$KEYSTORE" --ks-pass pass:bomberush --key-pass pass:bomberush --ks-key-alias bomberush \
  --min-sdk-version 24 --out "$ROOT/dist/BombeRush.apk" "$OUT/unsigned.apk"
java -jar "$APKSIGNER" verify --verbose "$ROOT/dist/BombeRush.apk" | head -6
ls -la "$ROOT/dist/BombeRush.apk"
