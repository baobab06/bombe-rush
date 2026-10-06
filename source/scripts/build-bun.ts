/**
 * Build alternatif avec Bun : `bun scripts/build-bun.ts`
 *  - dist/www/index.html : page complète autonome (utilisée par Capacitor → APK)
 *  - dist/artifact.html  : même jeu, sans squelette <html> (aperçu publié)
 */

const result = await Bun.build({
  entrypoints: ["src/app/main.ts"],
  minify: true,
  target: "browser",
  format: "iife",
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
const js = await result.outputs[0].text();
// @ts-ignore module JS partagé
const { writePages } = await import("./page.mjs");
const size = writePages(js);
console.log(`OK — ${(size / 1024).toFixed(0)} Ko`);
