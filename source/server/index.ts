/**
 * Serveur BOMBE RUSH : sert le jeu (web) + les liens d'invitation, et gère
 * le multijoueur en temps réel via WebSocket.
 *
 *   npm run server          → http://localhost:8787
 *   PORT=… STATIC_DIR=…     → configuration
 *
 * Routes :
 *   GET  /                 le jeu
 *   GET  /j/CODE           lien d'invitation (ouvre le jeu et rejoint la salle)
 *   GET  /health           état du serveur
 *   GET  /.well-known/assetlinks.json   Android App Links (si ANDROID_* défini)
 *   WS   /ws               temps réel
 */
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from "../src/net/protocol";
import { Lobby, type Client } from "./lobby";
import { Matchmaker } from "./matchmaking";
import { PushService } from "./push";
import { acceptUpgrade, type WsConn } from "./ws";

const PORT = Number(process.env.PORT ?? 8787);
const HERE = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = process.env.STATIC_DIR
  ? resolve(process.env.STATIC_DIR)
  : existsSync(join(HERE, "www", "index.html"))
    ? join(HERE, "www")
    : existsSync(join(HERE, "index.html"))
      ? HERE // fichiers du jeu posés à côté du serveur (dépôt « à plat »)
      : join(process.cwd(), "dist", "www");

const clients = new Map<string, Client>();
const conns = new Map<string, WsConn>();
const push = new PushService();

const send = (token: string, msg: ServerMsg) => {
  const c = conns.get(token);
  if (c && !c.closed) c.send(JSON.stringify(msg));
};

const lobby = new Lobby({
  send,
  client: (token) => clients.get(token),
  notifyOffline: (tokens, title, body) => void push.notify(tokens, title, body),
});
const matchmaker = new Matchmaker(lobby);
setInterval(() => matchmaker.tick(), 1000);

const cleanName = (n: unknown) =>
  String(n ?? "")
    .replace(/[<>&"]/g, "")
    .trim()
    .slice(0, 16) || "Joueur";

/** Identifiant cosmétique reçu d'un client : court et sans caractères exotiques. */
const cosm = (v: unknown): string | undefined => (typeof v === "string" && /^[a-z0-9-]{1,40}$/.test(v) ? v : undefined);
const MAX_MSG_PER_SEC = 150; // 60 entrées/s + marge
const MAX_ROOMS = 2000;

function onMessage(conn: WsConn, raw: string, state: { token: string | null; win: number; count: number }) {
  // anti-abus : on coupe une connexion qui inonde le serveur
  const now = Date.now();
  if (now - state.win > 1000) {
    state.win = now;
    state.count = 0;
  }
  if (++state.count > MAX_MSG_PER_SEC || raw.length > 4096) {
    conn.close(4008);
    return;
  }
  let msg: ClientMsg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.t === "hello") {
    const token = typeof msg.token === "string" && msg.token.length >= 16 ? msg.token.slice(0, 64) : randomBytes(16).toString("hex");
    let c = clients.get(token);
    if (!c) {
      c = { token, id: randomBytes(5).toString("hex"), name: "", characterId: "renard", room: null, connected: true };
      clients.set(token, c);
    }
    // une seule connexion active par joueur
    const old = conns.get(token);
    if (old && old !== conn) old.close(4000);
    conns.set(token, conn);
    state.token = token;
    c.connected = true;
    c.name = cleanName(msg.name);
    c.characterId = String(msg.characterId || "renard");
    c.skinId = cosm(msg.skinId);
    c.accessoryId = cosm(msg.accessoryId);
    c.trailId = cosm(msg.trailId);
    send(token, { t: "welcome", you: c.id, v: PROTOCOL_VERSION });
    if (c.room) lobby.reconnect(c);
    else send(token, { t: "room", room: null });
    return;
  }
  const c = state.token ? clients.get(state.token) : undefined;
  if (!c) return;
  switch (msg.t) {
    case "ping":
      send(c.token, { t: "pong" });
      break;
    case "createRoom":
      if (lobby.rooms.size >= MAX_ROOMS) {
        send(c.token, { t: "error", code: "busy", message: "Le serveur est plein pour le moment, réessaie dans un instant." });
        break;
      }
      lobby.create(c);
      break;
    case "peek":
      send(c.token, { t: "peek", ...lobby.peek(String(msg.code ?? "")) });
      break;
    case "joinRoom":
      lobby.join(c, String(msg.code ?? ""));
      break;
    case "leaveRoom":
      lobby.leave(c);
      send(c.token, { t: "room", room: null });
      break;
    case "setReady":
      lobby.setReady(c, !!msg.ready);
      break;
    case "setName":
      c.name = cleanName(msg.name);
      lobby.updateProfile(c);
      break;
    case "setLook":
      c.characterId = String(msg.characterId || c.characterId);
      c.skinId = cosm(msg.skinId);
      c.accessoryId = cosm(msg.accessoryId);
      c.trailId = cosm(msg.trailId);
      lobby.updateProfile(c);
      break;
    case "setSettings":
      lobby.setSettings(c, msg);
      break;
    case "kick":
      lobby.kick(c, String(msg.playerId));
      break;
    case "start":
      lobby.start(c);
      break;
    case "input":
      if (msg.cmd) lobby.input(c, Number(msg.seq) || 0, msg.cmd);
      break;
    case "emote":
      lobby.emote(c, String(msg.id ?? ""));
      break;
    case "pushToken":
      push.register(c.token, msg.platform, String(msg.token));
      break;
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".json": "application/json",
  ".apk": "application/vnd.android.package-archive",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ ok: true, rooms: lobby.rooms.size, players: conns.size, push: push.enabled, v: PROTOCOL_VERSION }));
    return;
  }
  if (url.pathname === "/.well-known/assetlinks.json" && process.env.ANDROID_PACKAGE && process.env.ANDROID_SHA256) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: process.env.ANDROID_PACKAGE, sha256_cert_fingerprints: [process.env.ANDROID_SHA256] },
        },
      ]),
    );
    return;
  }
  // /j/CODE → le jeu (le client lit le code dans l'URL et rejoint la salle)
  const invite = url.pathname.match(/^\/(?:j|join)\/([A-Za-z0-9]+)\/?$/);
  let path = invite || url.pathname === "/" ? "/index.html" : url.pathname;
  path = normalize(path).replace(/^(\.\.[/\\])+/, "");
  try {
    let data: Buffer | string = await readFile(join(STATIC_DIR, path));
    if (path === "/index.html") {
      // aperçu du lien (WhatsApp, Messenger, Discord…) personnalisé pour l'invitation
      const origin = `${(req.headers["x-forwarded-proto"] as string)?.split(",")[0] || "http"}://${req.headers.host}`;
      let html = data.toString("utf8").replaceAll("__ORIGIN__", origin);
      if (invite) {
        const p = lobby.peek(invite[1]);
        const who = p.found && p.hostName ? `${p.hostName} t'invite` : "On t'invite";
        const mode = p.found && p.modeId === "chaos" ? " en mode CHAOS 💀" : "";
        html = html
          .replace(/(<meta property="og:title" content=")[^"]*/, `$1🎮 ${who} sur BOMBE RUSH${mode}`)
          .replace(/(<meta property="og:description" content=")[^"]*/, `$1Clique pour rejoindre la partie privée ${invite[1].toUpperCase()} — aucune installation, ça se joue dans le navigateur.`);
      }
      data = html;
    }
    const ext = extname(path);
    const immutable = ext === ".png" || ext === ".ico" || ext === ".svg";
    res.writeHead(200, {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": immutable ? "public, max-age=86400" : "no-cache",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Introuvable");
  }
});

server.on("upgrade", (req, socket) => {
  if (!req.url?.startsWith("/ws")) {
    socket.destroy();
    return;
  }
  const conn = acceptUpgrade(req, socket);
  if (!conn) return;
  const state = { token: null as string | null, win: 0, count: 0 };
  conn.onMessage = (raw) => onMessage(conn, raw, state);
  conn.onClose = () => {
    if (!state.token || conns.get(state.token) !== conn) return;
    conns.delete(state.token);
    const c = clients.get(state.token);
    if (!c) return;
    c.connected = false;
    lobby.disconnected(c);
  };
});

setInterval(() => {
  for (const c of conns.values()) c.heartbeat();
}, 4_000); // un téléphone qui perd le réseau est détecté en 4 à 8 s

server.listen(PORT, () => {
  console.log(`BOMBE RUSH — serveur prêt sur http://localhost:${PORT}  (jeu : ${STATIC_DIR})`);
});
