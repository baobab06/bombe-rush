/* Partie rapide (matchmaking) + parrainage. `bun tests/quick.test.ts` */
import { Lobby, type Client } from "../server/lobby";
import { Matchmaker } from "../server/matchmaking";
import { ReferralService, REF_GAMES, REF_MAX_FRIENDS } from "../server/referral";
import { MemoryStore } from "../server/accounts";
import { settleMatch } from "../src/meta/rewards";
import { defaultProfile } from "../src/meta/profile";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg);
}

type Msg = { t: string; [k: string]: unknown };
const clients = new Map<string, Client>();
const inbox = new Map<string, Msg[]>();
const send = (token: string, msg: unknown) => {
  if (!inbox.has(token)) inbox.set(token, []);
  inbox.get(token)!.push(JSON.parse(JSON.stringify(msg)));
};
const mk = (tok: string): Client => {
  const c: Client = { token: tok, id: "id" + tok, name: "J" + tok, characterId: "renard", room: null, connected: true };
  clients.set(tok, c);
  return c;
};
const last = (tok: string, t: string) => (inbox.get(tok) ?? []).filter((m) => m.t === t).pop();
const lobby = new Lobby({ send, client: (t) => clients.get(t), notifyOffline: () => {} });

console.log("1. File d'attente");
{
  let now = 1_000_000;
  const mm = new Matchmaker(lobby, send, { minPlayers: 1, maxPlayers: 4, maxWaitS: 15 }, () => now);
  const a = mk("a"), b = mk("b");
  mm.enqueue(a);
  const q1 = last("a", "queue") as { players: { you?: boolean }[] } | undefined;
  check(!!q1 && q1.players.length === 1 && q1.players[0].you === true, "seul dans la file : on se voit");
  mm.enqueue(b);
  const q2 = last("a", "queue") as { players: unknown[] };
  check(q2.players.length === 2, "un 2e joueur arrive : visible par le 1er");
  now += 5000; mm.tick();
  check(mm.size === 2 && !a.room, "5 s : on attend encore");
  now += 10_000; mm.tick();
  check(mm.size === 0 && !!a.room && a.room === b.room, "15 s : la partie démarre avec les 2 joueurs");
  const room = lobby.rooms.get(a.room!)!;
  check(!!room.game && room.quick === true && room.fillBots, "partie lancée tout de suite, bots en renfort");
  check(["classic", "chaos", "koth"].includes(room.modeId), "mode tiré au hasard : " + room.modeId);
  const rv = last("a", "room") as { room: { quick?: boolean } };
  check(rv.room.quick === true, "le client sait que c'est une partie rapide (pas de salon)");
  check(!!last("a", "matchStart") && !!last("b", "matchStart"), "les deux reçoivent le début de partie");
  check((room.game as unknown as { match: { players: unknown[] } }).match.players.length === 4, "4 joueurs dans la partie (2 + 2 bots)");
  room.game!.stop();
  // fin de partie : salle dissoute
  (lobby as unknown as { endGame(r: unknown): void }).endGame(room);
  await new Promise((r) => setTimeout(r, 1700));
  check(!lobby.rooms.has(room.code) && a.room === null && b.room === null, "après la partie : salle dissoute, chacun libre");
}
{
  let now = 2_000_000;
  const mm = new Matchmaker(lobby, send, { minPlayers: 1, maxPlayers: 4, maxWaitS: 15 }, () => now);
  const ps = ["c", "d", "e", "f", "g"].map(mk);
  for (const p of ps) mm.enqueue(p);
  mm.tick();
  check(ps.slice(0, 4).every((p) => !!p.room) && !ps[4].room && mm.size === 1, "4 joueurs : partie immédiate, le 5e attend la suivante");
  const quitter = mk("h");
  mm.enqueue(quitter);
  mm.dequeue(quitter);
  check(mm.size === 1 && (last("h", "queue") as { players: unknown }).players === null, "annuler : on sort de la file");
  ps[4].connected = false;
  now += 20_000; mm.tick();
  check(mm.size === 0 && !ps[4].room, "joueur déconnecté : retiré de la file sans partie");
  for (const p of ps.slice(0, 4)) lobby.rooms.get(p.room!)?.game?.stop();
}

console.log("2. Pièces ×1,5 en ligne");
{
  const p = defaultProfile();
  const off = defaultProfile();
  const t1 = settleMatch(p, { matchId: "m1", stake: "normal", modeId: "classic", online: true, players: 4 }, { place: 1, players: 4 })!;
  const t2 = settleMatch(off, { matchId: "m1", stake: "normal", modeId: "classic", online: false, players: 4 }, { place: 1, players: 4 })!;
  const bonus = (t1 as unknown as { modifiers: { label: string; amount: number }[]; base: number }).modifiers.find((x) => x.label === "Bonus en ligne");
  const base = (t1 as unknown as { base: number }).base;
  check(!!bonus && bonus.amount === Math.round(base * 0.5) && t1.applied - t2.applied === bonus.amount, `victoire en ligne : +${bonus?.amount} 🪙 de bonus (gains ×1,5)`);
  const l = defaultProfile();
  l.coins = 1000;
  const t3 = settleMatch(l, { matchId: "m2", stake: "normal", modeId: "classic", online: true, players: 4 }, { place: 4, players: 4 })!;
  const l2 = defaultProfile();
  l2.coins = 1000;
  const t4 = settleMatch(l2, { matchId: "m2", stake: "normal", modeId: "classic", online: false, players: 4 }, { place: 4, players: 4 })!;
  check(t3.applied === t4.applied, "les pertes ne sont pas multipliées");
}

console.log("3. Parrainage");
{
  const kv = new MemoryStore();
  const svc = new ReferralService(kv);
  const T = (n: number) => n.toString(16).padStart(32, "0");
  const parrain = await svc.me({ token: T(1), name: "Guigui" }) as { code: string; friends: unknown[] };
  check(/^[A-Z0-9]{5}$/.test(parrain.code), "code ami créé : " + parrain.code);
  const again = await svc.me({ token: T(1), name: "Guigui" }) as { code: string };
  check(again.code === parrain.code, "le code ne change pas");
  check("error" in (await svc.use({ token: T(1), code: parrain.code })), "son propre code : refusé");
  check("error" in (await svc.use({ token: T(2), code: "ZZZZZ" })), "code inconnu : refusé");
  const u = await svc.use({ token: T(2), name: "Lucas", code: parrain.code.toLowerCase() }) as { ok?: boolean; welcome?: number };
  check(u.ok === true && u.welcome === 300, "ami : code accepté, 300 pièces de bienvenue");
  check("error" in (await svc.use({ token: T(2), code: parrain.code })), "un seul code par joueur");
  const v = await svc.me({ token: T(1) }) as { friends: { name: string; games: number }[] };
  check(v.friends.length === 1 && v.friends[0].name === "Lucas", "le parrain voit son ami");
  for (let i = 0; i < REF_GAMES - 1; i++) await svc.progress({ token: T(2) });
  check((await svc.claim({ token: T(1) })).chests === 0, "pas de coffre avant 3 parties");
  const done = await svc.progress({ token: T(2) }) as { done: boolean };
  check(done.done, "3e partie : parrainage réussi");
  check((await svc.claim({ token: T(1) })).chests === 1 && (await svc.claim({ token: T(2) })).chests === 1, "un coffre chacun");
  check((await svc.claim({ token: T(1) })).chests === 0, "coffre remis une seule fois");
  await svc.progress({ token: T(2) });
  check((await svc.claim({ token: T(1) })).chests === 0, "parties suivantes : rien de plus");
  for (let i = 3; i < 3 + REF_MAX_FRIENDS; i++) await svc.use({ token: T(i), name: "A" + i, code: parrain.code });
  const full = await svc.use({ token: T(99), code: parrain.code });
  check("error" in full, "10 amis maximum");
  check("error" in (await svc.me({ token: "pas-un-jeton" })), "jeton invalide refusé");
}

console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert.");
(globalThis as unknown as { process: { exit(c: number): void } }).process.exit(failures ? 1 : 0);
