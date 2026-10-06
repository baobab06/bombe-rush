/**
 * Assemble la page du jeu (HTML + CSS + JS dans un seul fichier) et copie
 * les fichiers statiques de public/ (icônes, manifeste, aperçu de lien).
 * Utilisé par build.mjs (esbuild/Node) et build-bun.ts (Bun).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#12231a">
<meta name="description" content="Jeu d'arène à bombes multijoueur. Invite tes amis avec un lien, ça se joue directement dans le navigateur.">
<!-- comportement « application » -->
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Bombe Rush">
<meta name="format-detection" content="telephone=no">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<!-- aperçu du lien dans WhatsApp / Messenger / Discord -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="BOMBE RUSH">
<meta property="og:title" content="🎮 Viens tester BOMBE RUSH !">
<meta property="og:description" content="Pose. Fuis. BOUM. Un jeu de bombes multijoueur qui se joue directement dans le navigateur, sans rien installer.">
<meta property="og:image" content="__ORIGIN__/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
`;

export function writePages(js) {
  const safeJs = js.replace(/<\/script/gi, "<\\/script");
  const css = readFileSync("src/ui/style.css", "utf8");
  const body = readFileSync("src/ui/index.html", "utf8")
    .replace("/*__CSS__*/", () => css)
    .replace("/*__JS__*/", () => safeJs);
  const [head, app] = body.split('<div id="app">');
  mkdirSync("dist/www", { recursive: true });
  // aperçu sans serveur (page publiée) : pas de méta d'app, pas de manifeste
  writeFileSync("dist/artifact.html", body);
  writeFileSync(
    "dist/www/index.html",
    `<!doctype html>
<html lang="fr">
<head>
${HEAD}${head}</head>
<body>
<div id="app">${app}
</body>
</html>
`,
  );
  if (existsSync("public")) cpSync("public", "dist/www", { recursive: true });
  return body.length;
}
