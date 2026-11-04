/* Mises à jour du jeu : règles, serveur (routes + admin), vérification côté jeu.
 * `bun tests/update.test.ts` */
import { createServer } from "node:http";
import { MemoryStore } from "../server/accounts";
import { UpdateService, updateRoutes } from "../server/updates";
import { compareVersions, sanitizeUpdate, updateStatus, DEFAULT_UPDATE, type UpdateConfig } from "../src/net/update-policy";
import { UpdateChecker } from "../src/meta/update-check";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.log("  ✗ " + msg);
  } else console.log("  ✓ " + msg);
}

console.log("Règles de version");
check(compareVersions("1.11.5", "1.11.10") < 0 && compareVersions("1.12", "1.11.9") > 0 && compareVersions("1.2.0", "1.2") === 0, "comparaison numérique (1.11.5 < 1.11.10, 1.12 > 1.11.9)");
const cfg = (o: Partial<UpdateConfig>): UpdateConfig => ({ ...DEFAULT_UPDATE, enabled: true, latestVersion: "1.12.0", minVersion: "1.11.0", ...o });
check(updateStatus(cfg({}), "1.12.0") === "ok" && updateStatus(cfg({}), "1.13.0") === "ok", "1. version à jour (ou plus récente) : rien");
check(updateStatus(cfg({}), "1.11.5") === "optional", "2. version supportée mais ancienne : facultative");
check(updateStatus(cfg({}), "1.10.9") === "mandatory", "3. sous la version minimale : obligatoire");
check(updateStatus(cfg({ mandatory: true }), "1.11.5") === "mandatory", "dernière version marquée obligatoire : tout le monde doit mettre à jour");
check(updateStatus(cfg({ enabled: false }), "1.0.0") === "ok", "notifications désactivées : personne n'est bloqué");
check(updateStatus(cfg({ minVersion: "1.11.6" }), null) === "mandatory" && updateStatus(cfg({ minVersion: "1.11.5" }), null) === "optional", "ancien jeu sans version (≤ 1.11.5) traité comme 1.11.5");
check(!sanitizeUpdate({ latestVersion: "1.10", minVersion: "1.11" }).ok, "refus : minimum au-dessus de la dernière version");
check(!sanitizeUpdate({ latestVersion: "abc", minVersion: "1.0" }).ok, "refus : version invalide");
check(!sanitizeUpdate({ latestVersion: "1.2", minVersion: "1.0", storeUrl: "https://evil.example/app" }).ok, "refus : lien hors Google Play");
const san = sanitizeUpdate({ latestVersion: "1.2", minVersion: "1.0", title: "  Salut<script>  ", notes: [{ kind: "bad", text: "x" }, { kind: "fix", text: "" }, ...Array(30).fill({ kind: "fix", text: "y" })] });
check(san.ok && san.config.notes.length === 20 && san.config.notes[0].kind === "new" && san.config.title === "Salut<script>", "notes : 20 au plus, lignes vides retirées, type inconnu = nouveau (le texte est échappé à l'affichage)");

console.log("Serveur");
const TOKEN = "t".repeat(32);
const store = new MemoryStore();
const svc = new UpdateService(store);
const routes = updateRoutes(svc, TOKEN, () => null);
const srv = createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", "http://x");
  if (!(await routes(req, res, u.pathname, u.searchParams))) {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => srv.listen(0, r));
const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
const get = async (v: string) => (await (await fetch(`${base}/api/update?v=${v}`)).json()) as { status: string; config: UpdateConfig };
check((await get("1.0.0")).status === "ok", "configuration par défaut : désactivée, personne n'est bloqué");
const put = (body: unknown, token = TOKEN) => fetch(`${base}/api/admin/update`, { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
check((await put({ latestVersion: "2.0.0", minVersion: "1.0.0" }, "mauvaise-cle-mauvaise-cle-xx")).status === 401, "admin : mauvaise clé refusée");
check((await fetch(`${base}/api/admin/update`)).status === 401, "admin : sans clé refusé");
check((await put({ latestVersion: "1.0", minVersion: "2.0" })).status === 400, "admin : configuration incohérente refusée");
const okPut = await put({ enabled: true, latestVersion: "1.12.0", minVersion: "1.11.0", title: "Domination 2.0", description: "Nouvelle carte", notes: [{ kind: "new", text: "Zone mobile" }] });
check(okPut.status === 200, "admin : annonce publiée");
check((await get("1.12.0")).status === "ok" && (await get("1.11.5")).status === "optional" && (await get("1.10.0")).status === "mandatory", "statuts renvoyés selon la version du joueur");
const g = await get("1.11.5");
check(g.config.title === "Domination 2.0" && g.config.notes[0].text === "Zone mobile", "titre, description et notes transmis au jeu");
check(!!(await store.get("cfg:update")), "enregistré dans la base (Upstash en production)");
const svc2 = new UpdateService(store);
check((await svc2.get()).latestVersion === "1.12.0", "après redémarrage du serveur : configuration retrouvée");
check(svc.statusOf("1.10.0") === "mandatory" && svc.statusOf(null) === "optional", "contrôle pour le multijoueur et la sauvegarde en ligne");
const noAdmin = updateRoutes(svc, undefined, () => null);
const res503 = { code: 0, writeHead(c: number) { this.code = c; }, end() {} };
await noAdmin({ method: "GET", headers: {}, socket: {} } as never, res503 as never, "/api/admin/update", new URLSearchParams());
check(res503.code === 503, "sans ADMIN_TOKEN : administration désactivée");
// base injoignable : on garde la dernière configuration
const broken = new UpdateService({ kind: "x", get: async () => { throw new Error("down"); }, set: async () => {}, setNX: async () => true, del: async () => {} });
check((await broken.get()).enabled === false, "base injoignable : configuration par défaut, rien de bloqué");
srv.close();

console.log("Vérification côté jeu");
const mem = new Map<string, string>();
const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
let mode: "ok" | "offline" | "500" = "ok";
let served: UpdateConfig = cfg({ title: "Grosse MAJ" });
let calls = 0;
const fakeFetch = (async (url: string) => {
  calls++;
  if (mode === "offline") throw new TypeError("Failed to fetch");
  if (mode === "500") return new Response("oups", { status: 500 });
  const v = new URL(url).searchParams.get("v");
  return new Response(JSON.stringify({ status: updateStatus(served, v), current: v, config: served }), { status: 200 });
}) as typeof fetch;
let version = "1.12.0";
const mk = () => new UpdateChecker({ base: () => "http://srv", version: () => version, fetch: fakeFetch, storage });
let r = await mk().check();
check(r.status === "ok" && r.source === "server", "1. dernière version : aucune fenêtre");
version = "1.11.5";
r = await mk().check();
check(r.status === "optional" && r.config.title === "Grosse MAJ", "2. mise à jour facultative proposée");
version = "1.10.0";
r = await mk().check();
check(r.status === "mandatory", "3. mise à jour obligatoire");
mode = "offline";
r = await mk().check();
check(r.status === "mandatory" && r.source === "cache", "4. sans Internet : l'obligation déjà connue reste (pas de contournement)");
version = "1.11.5";
r = await mk().check();
check(r.status === "optional", "4. sans Internet, version supportée : jamais bloqué");
mem.clear();
r = await mk().check();
check(r.status === "ok" && r.source === "none", "4. sans Internet et sans réponse connue : on joue normalement");
mode = "500";
r = await mk().check();
check(r.status === "ok", "5. serveur en panne : on joue normalement");
mode = "ok";
await mk().check();
mode = "500";
version = "1.10.0";
r = await mk().check();
check(r.status === "mandatory" && r.source === "cache", "5. serveur en panne, version trop ancienne déjà connue : toujours bloqué");
// 6. fermeture / réouverture : décision immédiate depuis la mémoire de l'appareil
r = mk().fromCache();
check(r.status === "mandatory", "6. réouverture du jeu : l'écran obligatoire s'affiche tout de suite");
mode = "ok";
served = cfg({ minVersion: "1.0.0" });
r = await mk().check();
check(r.status === "optional", "règle assouplie par l'administrateur : le joueur est débloqué");
const ck = mk();
calls = 0;
await Promise.all([ck.check(), ck.check(), ck.check()]);
check(calls === 1 && !ck.due(), "une seule requête à la fois, pas de revérification avant 30 min");

console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert.");
process.exit(failures ? 1 : 0);
