// Serveur HTTP de l'alpha « Défis quotidiens entre amis ». Aucune dépendance (Node ≥ 18).
//   PORT             port d'écoute (défaut 8080)
//   DATA_FILE        fichier de données (défaut ./data/db.json)
//   ALLOW_FAST_DAYS  "0" pour interdire les jours rapides de test (défaut autorisés)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { App, AppError, AVATARS, NOTIF_TYPES, REACTIONS, TAUNTS } from "./lib/app.mjs";
import { Store } from "./lib/store.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const store = new Store(process.env.DATA_FILE ?? join(root, "data", "db.json"));
const allowFastDays = process.env.ALLOW_FAST_DAYS !== "0";
const app = new App({ store, allowFastDays });

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
// Seuls ces modules partagés sont servis au navigateur.
const SHARED = new Set(["rng.mjs", "games.mjs"]);

const routes = [];
const route = (method, pattern, handler, auth = true) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:\w+/g, "([\\w-]+)")}$`), handler, auth });

route("GET", "/api/config", () => ({ avatars: AVATARS, taunts: TAUNTS, reactions: REACTIONS, notifTypes: NOTIF_TYPES, allowFastDays, serverNow: Date.now() }), false);
route("POST", "/api/users", (_u, b) => app.createUser(b), false);
route("GET", "/api/home", (u) => app.home(u));
route("PATCH", "/api/me", (u, b) => app.updateMe(u, b));
route("DELETE", "/api/me", (u) => (app.deleteMe(u), { ok: true }));
route("GET", "/api/notifications", (u) => app.notifications(u));
route("POST", "/api/notifications/read", (u) => (app.markRead(u), { ok: true }));
route("GET", "/api/stats", (u) => app.stats(u));
route("POST", "/api/groups", (u, b) => app.createGroup(u, b));
route("POST", "/api/groups/join", (u, b) => app.joinGroup(u, b.code));
route("GET", "/api/groups/:id", (u, _b, [id]) => app.groupView(u, id));
route("POST", "/api/groups/:id/leave", (u, _b, [id]) => (app.leaveGroup(u, id), { ok: true }));
route("POST", "/api/groups/:id/remove", (u, b, [id]) => app.removeMember(u, id, b.userId));
route("POST", "/api/groups/:id/admin", (u, b, [id]) => app.transferAdmin(u, id, b.userId));
route("POST", "/api/groups/:id/invite", (u, _b, [id]) => app.renewInvite(u, id));
route("POST", "/api/groups/:id/challenge", (u, b, [id]) => app.launchChallenge(u, id, b));
route("GET", "/api/groups/:id/history/:cid", (u, _b, [id, cid]) => app.historyView(u, id, cid));
route("POST", "/api/groups/:id/taunts", (u, b, [id]) => app.sendTaunt(u, id, b));
route("POST", "/api/taunts/:id/react", (u, b, [id]) => app.reactTaunt(u, id, b.emoji));
route("POST", "/api/rematches", (u, b) => app.proposeRematch(u, b));
route("POST", "/api/rematches/:id/respond", (u, b, [id]) => app.respondRematch(u, id, !!b.accept));
route("POST", "/api/play/state", (u, b) => app.playState(u, b.ctx));
route("POST", "/api/play/train/start", (u, b) => app.trainStart(u, b.ctx));
route("POST", "/api/play/train/submit", (u, b) => app.trainSubmit(u, b.ctx, b.index, b.events));
route("POST", "/api/play/attempt/start", (u, b) => app.attemptStart(u, b.ctx));
route("POST", "/api/attempts/:id/submit", (u, b, [id]) => app.attemptSubmit(u, id, b.events));
route("GET", "/api/attempts/:id", (u, _b, [id]) => app.attemptGet(u, id));

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 512 * 1024) throw new AppError(413, "Requête trop volumineuse.");
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AppError(400, "JSON invalide."); }
}

async function serveStatic(res, path) {
  let file;
  if (path.startsWith("/lib/")) {
    const name = path.slice(5);
    if (!SHARED.has(name)) return false;
    file = join(root, "lib", name);
  } else {
    const pub = resolve(root, "public");
    file = normalize(join(pub, path === "/" ? "index.html" : path));
    if (!file.startsWith(pub)) return false;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const path = url.pathname;
  if (path === "/health") return send(res, 200, { ok: true });
  if (path.startsWith("/api/")) {
    try {
      const r = routes.find((x) => x.method === req.method && x.re.test(path));
      if (!r) throw new AppError(404, "Route inconnue.");
      const params = path.match(r.re).slice(1);
      const body = req.method === "GET" ? {} : await readBody(req);
      const user = r.auth ? app.auth((req.headers.authorization ?? "").replace(/^Bearer /, "")) : null;
      return send(res, 200, await r.handler(user, body, params));
    } catch (e) {
      if (e instanceof AppError) return send(res, e.status, { error: e.message, ...e.extra });
      console.error(e);
      return send(res, 500, { error: "Erreur serveur." });
    }
  }
  if (req.method === "GET" && (await serveStatic(res, path))) return;
  // Application monopage : toute autre URL renvoie index.html (liens d'invitation).
  if (req.method === "GET" && !extname(path) && (await serveStatic(res, "/"))) return;
  res.writeHead(404).end("Introuvable");
});

setInterval(() => {
  try { app.tick(); } catch (e) { console.error("tick", e); }
}, 15_000).unref();

const shutdown = () => { store.flush(); process.exit(0); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => console.log(`Défis entre amis — alpha sur http://localhost:${port}`));
