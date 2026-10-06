/**
 * Verrouille l'APK en paysage : ajoute android:screenOrientation="sensorLandscape"
 * à l'activité principale du projet Android généré par Capacitor.
 * Lancé automatiquement par `npm run android:init` et `npm run android:sync`.
 * (sensorLandscape = paysage uniquement, dans les deux sens selon la prise en main)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2] ?? "android/app/src/main/AndroidManifest.xml";
if (!existsSync(path)) {
  console.log(`(${path} introuvable : lance d'abord « npx cap add android »)`);
  process.exit(0);
}
let xml = readFileSync(path, "utf8");
const activity = /<activity\b[^>]*android:name="[^"]*MainActivity"[^>]*>/s;
const m = xml.match(activity);
if (!m) {
  console.error("Activité principale introuvable dans le manifeste.");
  process.exit(1);
}
let tag = m[0];
if (/android:screenOrientation="[^"]*"/.test(tag)) {
  tag = tag.replace(/android:screenOrientation="[^"]*"/, 'android:screenOrientation="sensorLandscape"');
} else {
  tag = tag.replace(/<activity\b/, '<activity\n            android:screenOrientation="sensorLandscape"');
}
xml = xml.replace(m[0], tag);

// Liens d'invitation : bomberush://join/CODE (+ https://TON_DOMAINE/j/CODE si INVITE_HOST est défini)
if (!xml.includes('android:scheme="bomberush"')) {
  const host = process.env.INVITE_HOST;
  const https = host
    ? `
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="${host}" android:pathPrefix="/j/" />
            </intent-filter>`
    : "";
  const filters = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="bomberush" android:host="join" />
            </intent-filter>${https}`;
  xml = xml.replace(/(<activity\b[^>]*MainActivity[\s\S]*?)(<\/activity>)/, `$1${filters}\n        $2`);
}
writeFileSync(path, xml);
console.log("APK verrouillé en paysage (sensorLandscape) + liens d'invitation déclarés.");
