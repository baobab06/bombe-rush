/**
 * Build Node (esbuild) : `npm run build`
 *  - dist/www/index.html : page autonome, utilisée par Capacitor pour l'APK
 *  - dist/artifact.html  : même contenu sans squelette <html>
 * Options : --watch (rebuild auto), --test (lance les tests de simulation)
 */
import * as esbuild from "esbuild";
import { cpSync, rmSync } from "node:fs";
import { writePages } from "./page.mjs";
import { execFileSync } from "node:child_process";

const args = new Set(process.argv.slice(2));

if (args.has("--test")) {
  for (const t of ["sim", "meta", "progress"]) {
    await esbuild.build({ entryPoints: [`tests/${t}.test.ts`], bundle: true, platform: "node", format: "esm", outfile: `dist/test/${t}.test.mjs`, logLevel: "warning" });
    execFileSync(process.execPath, [`dist/test/${t}.test.mjs`], { stdio: "inherit" });
  }
  process.exit(0);
}

function assemble(js) {
  const size = writePages(js);
  console.log(`dist/www/index.html — ${(size / 1024).toFixed(0)} Ko`);
}

const options = {
  entryPoints: ["src/app/main.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  write: false,
  logLevel: "warning",
};

/** Serveur de jeu en un seul fichier, sans dépendance (Node 18+). */
async function buildServer(outfile) {
  await esbuild.build({ entryPoints: ["server/index.ts"], bundle: true, platform: "node", format: "esm", target: "node18", outfile, logLevel: "warning" });
}

if (args.has("--server")) {
  await buildServer("dist/server.mjs");
  console.log("dist/server.mjs");
  process.exit(0);
}

if (args.has("--deploy")) {
  const r = await esbuild.build(options);
  assemble(r.outputFiles[0].text);
  await buildServer("deploy/server.mjs");
  rmSync("deploy/www", { recursive: true, force: true });
  cpSync("dist/www", "deploy/www", { recursive: true });
  console.log("deploy/ prêt : server.mjs + www/ (aucune dépendance à installer)");
  process.exit(0);
}

if (args.has("--watch")) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [{ name: "assemble", setup(b) { b.onEnd((r) => r.outputFiles && assemble(r.outputFiles[0].text)); } }],
  });
  await ctx.watch();
  console.log("Surveillance… ouvre dist/www/index.html dans le navigateur.");
} else {
  const r = await esbuild.build(options);
  assemble(r.outputFiles[0].text);
}
