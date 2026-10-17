#!/usr/bin/env bash
# Construit l'APK Android de « Défis entre amis », sans Android Studio ni Gradle.
#   ./android/build-apk.sh                         → apk/DefisEntreAmis.apk
#   DEFIS_SERVER=https://mon-serveur ./android/build-apk.sh   (serveur par défaut)
# Outils téléchargés une fois dans $TOOLS : build-tools 36 (aapt2, d8, zipalign,
# apksigner) et android.jar (API 36). Il faut Java (JDK 17+), curl et unzip.
set -euo pipefail
unset JAVA_TOOL_OPTIONS
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
TOOLS="${TOOLS:-$HOME/.cache/defis-android}"
BT="$TOOLS/android-16"
ANDROID_JAR="$TOOLS/android-36/android.jar"
# Clé de TEST (versionnée) : permet d'installer les mises à jour par-dessus.
# Pour Google Play, il faudra une vraie clé gardée hors du dépôt.
KEYSTORE="$HERE/test.keystore"
KS_PASS="defis-test"
OUT="$ROOT/apk/build"
APK="$ROOT/apk/DefisEntreAmis.apk"

if [ ! -x "$BT/aapt2" ] || [ ! -f "$ANDROID_JAR" ]; then
  echo "0/6 téléchargement des outils Android → $TOOLS"
  mkdir -p "$TOOLS"
  curl -sSfL -o "$TOOLS/bt.zip" https://dl.google.com/android/repository/build-tools_r36_linux.zip
  curl -sSfL -o "$TOOLS/pf.zip" https://dl.google.com/android/repository/platform-36_r02.zip
  (cd "$TOOLS" && unzip -q -o bt.zip && unzip -q -o pf.zip && rm bt.zip pf.zip)
fi

rm -rf "$OUT" && mkdir -p "$OUT/compiled" "$OUT/classes" "$OUT/gen" "$OUT/res"
cp -r "$HERE/res/." "$OUT/res/"
if [ -n "${DEFIS_SERVER:-}" ]; then
  sed -i "s#<string name=\"server_url\">[^<]*</string>#<string name=\"server_url\">${DEFIS_SERVER%/}</string>#" "$OUT/res/values/strings.xml"
fi
echo "Serveur par défaut : $(sed -n 's#.*name="server_url">\([^<]*\)<.*#\1#p' "$OUT/res/values/strings.xml")"

echo "1/6 ressources"
"$BT/aapt2" compile --dir "$OUT/res" -o "$OUT/compiled/res.zip"
echo "2/6 manifeste + liaison"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$ANDROID_JAR" --manifest "$HERE/AndroidManifest.xml" \
  --java "$OUT/gen" -A "$HERE/assets" --min-sdk-version 24 --target-sdk-version 36 "$OUT/compiled/res.zip"
echo "3/6 Java"
javac -nowarn -source 8 -target 8 -encoding UTF-8 -bootclasspath "$ANDROID_JAR" -d "$OUT/classes" \
  $(find "$HERE/src" "$OUT/gen" -name "*.java") 2>&1 | grep -v "warning\|^Note" || true
echo "4/6 dex"
"$BT/d8" --min-api 24 --lib "$ANDROID_JAR" --output "$OUT" $(find "$OUT/classes" -name "*.class")
echo "5/6 assemblage"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias defis \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Defis entre amis (test), C=FR" >/dev/null 2>&1
fi
echo "6/6 signature"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" --ks-key-alias defis \
  --min-sdk-version 24 --out "$APK" "$OUT/aligned.apk"
"$BT/apksigner" verify "$APK"
rm -rf "$OUT" "$APK.idsig"
ls -la "$APK"
