/* Comptes Google + sauvegarde en ligne : serveur réel (HTTP) + client réel.
 * Les jetons Google sont imités avec une clé RSA de test (même format que
 * Google : JWT RS256 avec kid) ; le serveur les vérifie avec son vrai code.
 * `bun tests/accounts.test.ts` */
import { createServer, type Server } from "node:http";
import { generateKeyPairSync, createSign, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Accounts, FileStore, GoogleVerifier, MemoryStore, accountRoutes, type KvStore } from "../server/accounts";
import { CloudSync } from "../src/meta/cloud";
import { memoryBackend, migrate } from "../src/meta/save";
import { defaultProfile, type Profile } from "../src/meta/profile";
import { CATALOG } from "../src/meta/catalog";

/** un vrai skin du catalogue (achetable) */
const SKIN = CATALOG.find((i) => !i.free && i.kind === "skin")?.id ?? CATALOG.find((i) => !i.free)!.id;

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg);
}

// ---------- faux Google : clé de signature + jetons
const CLIENT = "123456-test.apps.googleusercontent.com";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as { n: string; e: string; kty: string }), kid: "k1", alg: "RS256" };
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(sub: string, o: { aud?: string; exp?: number; iss?: string; key?: typeof privateKey; kid?: string; alg?: string; email?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: o.alg ?? "RS256", kid: o.kid ?? "k1", typ: "JWT" });
  const p = b64({ iss: o.iss ?? "https://accounts.google.com", aud: o.aud ?? CLIENT, sub, email: o.email ?? `${sub}@gmail.com`, iat: now, exp: o.exp ?? now + 3600 });
  const sig = createSign("RSA-SHA256").update(`${h}.${p}`).sign(o.key ?? privateKey).toString("base64url");
  return `${h}.${p}.${sig}`;
}
const verifier = () => new GoogleVerifier([CLIENT], "test://jwks", async () => ({ keys: [jwk], maxAge: 3600 }));

// ---------- serveur HTTP réel (routes /api)
async function startServer(store: KvStore): Promise<{ url: string; srv: Server; accounts: Accounts }> {
  const accounts = new Accounts(store, verifier(), (d) => migrate(d as Partial<Profile>));
  const routes = accountRoutes(accounts, CLIENT);
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    if (!(await routes(req, res, u.pathname))) { res.writeHead(404); res.end(); }
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const port = (srv.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, srv, accounts };
}

/** Un « téléphone » : stockage local + profil + client de synchronisation. */
function device(url: string, opts: { storage?: ReturnType<typeof memoryBackend>; profile?: Profile; offline?: () => boolean } = {}) {
  const storage = opts.storage ?? memoryBackend();
  const state = { profile: opts.profile ?? defaultProfile() };
  const cloud = new CloudSync({
    storage,
    getProfile: () => state.profile,
    setProfile: (p) => (state.profile = p),
    api: async (path, init) => {
      if (opts.offline?.()) throw new Error("réseau coupé");
      const r = await fetch(url + path, {
        method: init.method,
        headers: { origin: "http://localhost", ...(init.body !== undefined ? { "content-type": "application/json" } : {}), ...(init.session ? { authorization: `Bearer ${init.session}` } : {}) },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    },
  });
  return { storage, state, cloud };
}
/** Progression de joueur réaliste (pièces, skins, niveau, rang, stats, achats). */
function progressed(name: string, coins: number): Profile {
  const p = defaultProfile();
  p.name = name; p.named = true;
  p.level = 7; p.xp = 120; p.coins = coins; p.coinsEarned = coins + 500; p.bombers = 40;
  p.played = 23; p.wins = 9; p.kills = 31;
  p.owned = [SKIN]; p.ownedCharacters = [...p.ownedCharacters];
  p.rank.points = 340; p.rank.best = 360;
  p.purchases = [{ token: "tok-1", productId: "bombers_100", at: 1 }];
  p.achievements = { first_win: { at: 1, claimed: true } };
  return p;
}
const keys = (s: MemoryStore) => [...(s as unknown as { m: Map<string, unknown> }).m.keys()];

console.log("Vérification des jetons Google (côté serveur)");
{
  const v = verifier();
  const ok = await v.verify(token("1001")).then((i) => i.sub === "1001", () => false);
  check(ok, "jeton Google valide : accepté, identifiant stable lu par le serveur");
  const reject = async (t: string, why: string) => check(await v.verify(t).then(() => false, () => true), `refusé : ${why}`);
  await reject(token("1001", { key: other.privateKey }), "signature d'une autre clé (faux jeton)");
  await reject(token("1001", { aud: "autre-appli.apps.googleusercontent.com" }), "jeton émis pour une autre application");
  await reject(token("1001", { exp: Math.floor(Date.now() / 1000) - 600 }), "jeton expiré");
  await reject(token("1001", { iss: "https://evil.example.com" }), "mauvais émetteur");
  await reject(token("1001", { kid: "inconnue" }), "clé inconnue");
  await reject(token("1001", { alg: "none" }), "algorithme « none »");
  const t = token("1001").split(".");
  const forged = [t[0], b64({ ...JSON.parse(Buffer.from(t[1], "base64url").toString()), sub: "9999" }), t[2]].join(".");
  await reject(forged, "identifiant Google modifié par le client (signature cassée)");
  await reject("pas-un-jeton", "texte quelconque");
}

const store = new MemoryStore();
const { url, srv, accounts } = await startServer(store);

console.log("Comptes : création unique, sessions, sécurité HTTP");
{
  const r = await Promise.all(Array.from({ length: 8 }, () => accounts.signIn(token("2002"))));
  check(new Set(r.map((x) => x.profileId)).size === 1 && r.filter((x) => x.created).length === 1, "8 connexions simultanées du même compte : un seul profil créé (pas de doublon)");
  const again = await accounts.signIn(token("2002"));
  check(again.profileId === r[0].profileId && !again.created, "reconnexion : même profil");
  check(!keys(store).some((k) => k.includes("2002")), "l'identifiant Google n'est jamais stocké en clair (empreinte seulement)");
  check(!keys(store).some((k) => k.includes(again.session)), "les sessions ne sont stockées que sous forme d'empreinte");
  const h = await fetch(url + "/api/profile", { headers: { authorization: "Bearer " + "x".repeat(40) } });
  check(h.status === 401, "session inventée : refusée (401)");
  const h2 = await fetch(url + "/api/auth/google", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: token("3003", { key: other.privateKey }), sub: "3003" }) });
  check(h2.status === 401, "faux jeton envoyé au serveur : refusé (401), aucun compte créé");
  const cors = await fetch(url + "/api/config", { headers: { origin: "https://site-pirate.example" } });
  check(!cors.headers.get("access-control-allow-origin"), "site extérieur : pas autorisé à appeler l'API (CORS)");
  const corsApp = await fetch(url + "/api/config", { headers: { origin: "https://appassets.androidplatform.net" } });
  check(corsApp.headers.get("access-control-allow-origin") === "https://appassets.androidplatform.net", "appli Android : autorisée");
  const big = await accounts.save(again.profileId, { junk: "x".repeat(300_000) }, 0).then(() => false, () => true);
  check(big, "sauvegarde trop grosse : refusée");
}

console.log("1) Première connexion Google (compte invité avec progression)");
const phoneA = device(url, { profile: progressed("Guigui", 1500) });
{
  await phoneA.cloud.init();
  check(phoneA.cloud.enabled && phoneA.cloud.status === "signedOut", "serveur prêt, joueur pas encore connecté");
  const r = await phoneA.cloud.signInWithGoogleToken(token("4004"));
  check(r.kind === "linked", "1re connexion : la progression du téléphone est ASSOCIÉE au compte");
  const cloud = await accounts.load((await accounts.signIn(token("4004"))).profileId);
  const d = cloud.data as Profile;
  check(cloud.rev === 1 && d.coins === 1500 && d.level === 7 && d.owned.includes(SKIN) && d.rank.points === 340 && d.purchases.length === 1, "en ligne : pièces, skins, niveau, rang, achats bien enregistrés");
  check(phoneA.cloud.status === "synced", "état : sauvegardé ✓");
}

console.log("2) Déconnexion puis reconnexion");
{
  const before = keys(store).filter((k) => k.startsWith("acct:")).length;
  await phoneA.cloud.signOut();
  check(!phoneA.cloud.signedIn && phoneA.state.profile.coins === 1500, "déconnecté : la progression reste sur le téléphone");
  phoneA.state.profile.coins += 50; // joue un peu déconnecté
  phoneA.cloud.markDirty();
  const r = await phoneA.cloud.signInWithGoogleToken(token("4004"));
  const after = keys(store).filter((k) => k.startsWith("acct:")).length;
  check(r.kind === "synced" && after === before, "reconnexion au même compte : même profil, aucun nouveau compte");
  const cloud = await accounts.load(phoneA.cloud.meta.profileId!);
  check((cloud.data as Profile).coins === 1550, "ce qui a été gagné hors connexion est envoyé à la reconnexion");
}

console.log("3) Fermeture et réouverture du jeu");
{
  phoneA.state.profile.wins += 1;
  phoneA.cloud.markDirty();
  await phoneA.cloud.push();
  const saved = JSON.parse(JSON.stringify(phoneA.state.profile)) as Profile;
  // « réouverture » : nouveau client, même stockage du téléphone
  const reopened = device(url, { storage: phoneA.storage, profile: migrate(saved) });
  await reopened.cloud.init();
  check(reopened.cloud.signedIn && reopened.cloud.status === "synced", "au redémarrage : toujours connecté, sans redemander le compte");
  check(reopened.state.profile.coins === 1550 && reopened.state.profile.wins === 10, "progression identique après réouverture");
  reopened.state.profile.coins += 10;
  reopened.cloud.markDirty();
  await reopened.cloud.push();
  check(((await accounts.load(reopened.cloud.meta.profileId!)).data as Profile).coins === 1560, "les sauvegardes continuent après réouverture");
}

console.log("4) Nouveau téléphone : progression conservée");
{
  const phoneB = device(url); // tout neuf
  await phoneB.cloud.init();
  const r = await phoneB.cloud.signInWithGoogleToken(token("4004"));
  const p = phoneB.state.profile;
  check(r.kind === "restored", "téléphone vierge + compte existant : progression RÉCUPÉRÉE");
  check(p.coins === 1560 && p.level === 7 && p.bombers === 40 && p.owned.includes(SKIN) && p.rank.points === 340 && p.wins === 10 && p.name === "Guigui" && p.achievements.first_win?.claimed === true, "pièces, bombers, skins, niveau, rang, stats, succès : tout est là");
}

console.log("5) Association d'un ancien compte invité");
{
  const guest = device(url, { profile: progressed("Invité", 777) });
  await guest.cloud.init();
  const r = await guest.cloud.signInWithGoogleToken(token("5005"));
  const cloud = await accounts.load(guest.cloud.meta.profileId!);
  check(r.kind === "linked" && (cloud.data as Profile).coins === 777 && guest.state.profile.coins === 777, "compte invité + nouveau compte Google : progression associée, rien de perdu");
}

console.log("6) Connexion avec un compte déjà associé à une autre progression");
{
  // téléphone C : progression invitée différente ; compte 4004 déjà utilisé (1560 pièces)
  const phoneC = device(url, { profile: progressed("Autre", 300) });
  await phoneC.cloud.init();
  const r = await phoneC.cloud.signInWithGoogleToken(token("4004"));
  check(r.kind === "conflict" && r.cloud.coins === 1560 && r.local.coins === 300, "conflit détecté : on montre les deux progressions au joueur");
  check(phoneC.state.profile.coins === 300 && ((await accounts.load(phoneC.cloud.meta.profileId ?? (await accounts.signIn(token("4004"))).profileId)).data as Profile).coins === 1560, "tant que le joueur n'a pas choisi : rien n'est écrasé");
  // a) annuler
  await phoneC.cloud.cancelConflict();
  check(!phoneC.cloud.signedIn && phoneC.state.profile.coins === 300, "« Annuler » : rien ne change, pas connecté");
  // b) garder le compte Google
  await phoneC.cloud.signInWithGoogleToken(token("4004"));
  await phoneC.cloud.resolveConflict("cloud");
  const backup = JSON.parse(phoneC.storage.load("bomberush.profile.backup") ?? "{}") as { profile?: Profile };
  check(phoneC.state.profile.coins === 1560 && backup.profile?.coins === 300, "« Garder le compte Google » : progression du compte chargée, celle du téléphone gardée en copie de secours");
  // c) garder ce téléphone (remplace la version en ligne, le serveur en garde une copie)
  const phoneD = device(url, { profile: progressed("Moi", 9000) });
  await phoneD.cloud.init();
  await phoneD.cloud.signInWithGoogleToken(token("4004"));
  const pid = (await accounts.signIn(token("4004"))).profileId;
  const revBefore = (await accounts.load(pid)).rev;
  await phoneD.cloud.resolveConflict("local");
  const now = await accounts.load(pid);
  const kept = await store.get(`prof:${pid}:backup:${revBefore}`);
  check((now.data as Profile).coins === 9000 && !!kept && (JSON.parse(kept).data as Profile).coins === 1560, "« Garder ce téléphone » : remplace le compte, l'ancienne version est gardée sur le serveur");
}

console.log("Cas limites : réseau coupé, deux téléphones en même temps, session expirée");
{
  let off = false;
  const p = device(url, { profile: progressed("Réseau", 100), offline: () => off });
  await p.cloud.init();
  await p.cloud.signInWithGoogleToken(token("6006"));
  off = true;
  p.state.profile.coins = 222;
  p.cloud.markDirty();
  await p.cloud.push();
  check(p.cloud.status === "offline" && p.cloud.meta.dirty && p.state.profile.coins === 222, "réseau coupé : rien n'est perdu, envoi en attente");
  off = false;
  await p.cloud.sync();
  check(((await accounts.load(p.cloud.meta.profileId!)).data as Profile).coins === 222 && !p.cloud.meta.dirty, "réseau revenu : la progression part toute seule");
  // deux téléphones sur le même compte, modifiés en même temps
  const q = device(url);
  await q.cloud.init();
  await q.cloud.signInWithGoogleToken(token("6006")); // récupère (vierge)
  q.state.profile.coins = 999;
  q.cloud.markDirty();
  await q.cloud.push();
  p.state.profile.coins = 111; // p ne sait pas que q a avancé
  p.cloud.markDirty();
  await p.cloud.push();
  const on = (await accounts.load(p.cloud.meta.profileId!)).data as Profile;
  check(on.coins === 999 && p.cloud.pendingConflict() !== null, "deux téléphones modifiés en même temps : pas d'écrasement, le joueur choisit");
  // session expirée côté serveur
  await accounts.signOut(q.cloud.meta.session!);
  await q.cloud.sync();
  check(!q.cloud.signedIn && q.state.profile.coins === 999 && q.cloud.status === "signedOut", "session expirée : déconnecté proprement, progression du téléphone intacte");
}

console.log("Suppression du compte (exigence Google Play)");
{
  const d = device(url, { profile: progressed("Bye", 10) });
  await d.cloud.init();
  await d.cloud.signInWithGoogleToken(token("8008"));
  const pid = d.cloud.meta.profileId!;
  const ok = await d.cloud.deleteAccount();
  const left = keys(store).filter((k) => k.includes(pid));
  check(ok && left.length === 0 && !d.cloud.signedIn && d.state.profile.coins === 10, "compte supprimé : plus rien sur le serveur, progression gardée sur le téléphone");
  const again = await accounts.signIn(token("8008"));
  check(again.created && again.profileId !== pid, "se reconnecter ensuite recrée un compte vide (l'ancien est bien parti)");
}

console.log("Stockage persistant (redémarrage du serveur)");
{
  const dir = mkdtempSync(join(tmpdir(), "acct-"));
  const s1 = new FileStore(dir);
  const a1 = new Accounts(s1, verifier());
  const r1 = await a1.signIn(token("7007"));
  await a1.save(r1.profileId, { coins: 42 }, 0);
  await new Promise((r) => setTimeout(r, 120));
  const a2 = new Accounts(new FileStore(dir), verifier());
  const r2 = await a2.signIn(token("7007"));
  check(r2.profileId === r1.profileId && !r2.created && (r2.cloud.data as { coins: number }).coins === 42, "après redémarrage du serveur : même compte, même sauvegarde");
  check(!!(await a2.profileOf(r1.session)), "les sessions survivent au redémarrage");
}

console.log("Serveur sans configuration");
{
  const routes = accountRoutes(null, undefined);
  const s = createServer(async (req, res) => void (await routes(req, res, new URL(req.url ?? "/", "http://x").pathname)));
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const u = `http://127.0.0.1:${(s.address() as { port: number }).port}`;
  const c = (await (await fetch(u + "/api/config")).json()) as { accounts: boolean };
  const d = device(u, { profile: progressed("X", 5) });
  await d.cloud.init();
  check(!c.accounts && d.cloud.status === "disabled" && d.state.profile.coins === 5, "comptes pas encore configurés : le jeu le dit et garde la progression locale");
  s.close();
}

srv.close();
void randomBytes;
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert.");
(globalThis as unknown as { process: { exit(c: number): void } }).process.exit(failures ? 1 : 0);
