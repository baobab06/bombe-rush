/* Classement mondial : rejeu des parties, anti-triche, points, semaines.
 * `bun tests/world.test.ts` */
import { BotBrain } from "../src/ai/bot";
import { CHARACTERS } from "../src/core/characters";
import { DT } from "../src/core/rules";
import { mapsFor } from "../src/maps";
import { MemoryStore } from "../server/accounts";
import { LeaderboardService, weekOf } from "../server/leaderboard";
import { LocalSession } from "../src/net/session";
import { InputRecorder, checkSpec, outcomeOf, replayAll, type RankedSpec } from "../src/net/replay";
import { rankDelta } from "../src/meta/rank";
import { columnOf } from "../src/meta/rewards";
import type { Difficulty } from "../src/core/types";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.log("  ✗ " + msg);
  } else console.log("  ✓ " + msg);
}

/** Joue une partie comme le jeu : le joueur est piloté par un bot, commandes enregistrées. */
function play(seed: number, modeId: string, diff: Difficulty, bots: number, skill: Difficulty = "hard") {
  const chars = CHARACTERS.slice(0, bots + 1);
  const map = mapsFor(modeId)[seed % mapsFor(modeId).length];
  const players = chars.map((c, i) => ({ name: c.name, characterId: c.id, isBot: i > 0, difficulty: i > 0 ? diff : undefined }));
  const s = new LocalSession({ seed, map, modeId, players }, 0);
  s.recorder = new InputRecorder();
  const pilot = new BotBrain(0, skill, seed * 7 + 1);
  const m = s.match;
  // le jeu s'arrête d'enregistrer quand l'issue est connue (mort, ou fin de partie)
  while (!((!m.players[0].alive && !m.hill) || m.phase === "over") && m.tick < 60 * 60 * 6) s.step(pilot.update(m, DT));
  const spec: RankedSpec = { seed, mapId: map.id, modeId, players: players.map((p) => ({ characterId: p.characterId, isBot: p.isBot, ...(p.isBot ? { difficulty: diff } : {}) })) };
  return { spec, log: s.recorder.log, ticks: s.recorder.ticks, local: outcomeOf(m, 0) };
}

console.log("Rejeu à l'identique");
let same = 0;
let total = 0;
const games: ReturnType<typeof play>[] = [];
for (const mode of ["classic", "chaos", "koth"])
  for (let k = 0; k < 4; k++) {
    const g = play(500 + k * 13 + mode.length, mode, (["easy", "normal", "hard", "expert"] as Difficulty[])[k], mode === "koth" ? 3 : 1 + (k % 3));
    games.push(g);
    const r = replayAll(g.spec, g.log);
    total++;
    if (r.complete && r.ticks === g.ticks && r.place === g.local.place && r.won === g.local.won && r.draw === g.local.draw) same++;
  }
check(same === total, `le serveur retrouve exactement la même issue (${same}/${total} parties, 3 modes, 4 difficultés)`);
const g0 = games[0];
check(g0.log.length < g0.ticks * 4, `journal compressé (${g0.ticks} images → ${g0.log.length} nombres)`);

console.log("Forme de la partie");
check(checkSpec(g0.spec) === null, "partie normale acceptée");
check(checkSpec({ ...g0.spec, modeId: "training" }) !== null, "mode caché (entraînement) refusé");
check(checkSpec({ ...g0.spec, players: [{ ...g0.spec.players[0] }, { ...g0.spec.players[0], isBot: true, difficulty: "easy" }] }) !== null, "personnage en double refusé");
check(checkSpec({ ...g0.spec, players: g0.spec.players.map((p, i) => (i === 1 ? { ...p, difficulty: "easy" as Difficulty } : p)) }, { modeId: g0.spec.modeId, stake: g0.spec.players[1].difficulty!, bots: g0.spec.players.length - 1 }) !== null || g0.spec.players[1].difficulty === "easy", "bots plus faciles que le ticket : refusé");
check(checkSpec({ ...g0.spec, mapId: "nulle-part" }) !== null, "carte inconnue refusée");

console.log("Serveur : tickets, points, triche");
(async () => {
  let now = Date.parse("2026-11-10T12:00:00Z");
  const svc = new LeaderboardService(new MemoryStore(), () => now, 400);
  const ok = () => true;
  // joueur A
  const tA = (await svc.ticket({ name: "Alice<b>", modeId: "classic", stake: "hard", bots: 3 }, ok)) as { id: string; secret: string; ticket: string; seed: number };
  check(!!tA.id && !!tA.secret && Number.isInteger(tA.seed), "premier ticket : identifiant + clé secrète + graine choisie par le serveur");
  const gA = play(tA.seed, "classic", "hard", 3, "expert");
  now += gA.ticks * DT * 1000 + 2000;
  const rA = (await svc.submit({ id: tA.id, secret: tA.secret, ticket: tA.ticket, name: "Alice<b>", ...gA })) as { ok: boolean; delta: number; place: number };
  const pl = { place: gA.local.won ? 1 : gA.local.place, players: 4, draw: gA.local.draw };
  const expect = Math.max(0, rankDelta(columnOf(pl), "hard", 4));
  check(rA.ok && rA.delta === expect, `points calculés par le serveur d'après le rejeu (${rA.delta} pts, ${pl.place}e/4)`);
  const again = (await svc.submit({ id: tA.id, secret: tA.secret, ticket: tA.ticket, ...gA })) as { ok: boolean };
  check(!again.ok, "même ticket envoyé deux fois : refusé");

  // résultat truqué : on change les commandes → le rejeu donne autre chose (au pire) ou refuse
  const t2 = (await svc.ticket({ id: tA.id, secret: tA.secret, name: "Alice", modeId: "classic", stake: "hard", bots: 3 }, ok)) as { ticket: string; seed: number };
  const g2 = play(t2.seed, "classic", "hard", 3, "expert");
  now += 500; // envoyé tout de suite : impossible d'avoir joué si vite
  const before = (await svc.top("all", tA.id, 10)).me!.p;
  const fast = (await svc.submit({ id: tA.id, secret: tA.secret, ticket: t2.ticket, ...g2 })) as { ok: boolean; note?: string; place: number | null };
  check(fast.ok && fast.place === null && !!fast.note, "partie envoyée plus vite qu'elle n'a duré : comptée comme abandon");

  const t3 = (await svc.ticket({ id: tA.id, secret: tA.secret, name: "Alice", modeId: "chaos", stake: "expert", bots: 2 }, ok)) as { ticket: string; seed: number };
  const g3 = play(t3.seed + 1, "chaos", "expert", 2); // graine choisie par le joueur, pas celle du serveur
  now += 3600_000;
  const wrong = (await svc.submit({ id: tA.id, secret: tA.secret, ticket: t3.ticket, ...g3 })) as { ok: boolean };
  check(!wrong.ok, "graine différente de celle du ticket : refusée");

  const bad = (await svc.submit({ id: tA.id, secret: "faux", ticket: "x", ...g3 })) as { ok: boolean; status?: number };
  check(!bad.ok && bad.status === 401, "mauvaise clé secrète : refusé");

  // ticket jamais rendu = abandon au ticket suivant
  const tB = (await svc.ticket({ name: "Bob", modeId: "classic", stake: "normal", bots: 3 }, ok)) as { id: string; secret: string; ticket: string };
  const gB = play(4242, "classic", "normal", 3);
  void gB;
  // Bob monte d'abord hors de Bronze pour que la perte compte
  const P = (svc as unknown as { doc: { players: Record<string, { p: number }> } }).doc.players;
  P[tB.id].p = 500;
  now += 60_000;
  await svc.ticket({ id: tB.id, secret: tB.secret, name: "Bob", modeId: "classic", stake: "normal", bots: 3 }, ok);
  check(P[tB.id].p < 500, `partie quittée sans résultat : comptée comme abandon (${P[tB.id].p - 500} pts)`);
  // ticket rendu tout de suite (arrivé trop tard) : aucune pénalité
  const tC = (await svc.ticket({ id: tB.id, secret: tB.secret, name: "Bob", modeId: "classic", stake: "normal", bots: 3 }, ok)) as { ticket: string };
  const pB = P[tB.id].p;
  await svc.cancel({ id: tB.id, secret: tB.secret, ticket: tC.ticket });
  now += 60_000;
  await svc.ticket({ id: tB.id, secret: tB.secret, name: "Bob", modeId: "classic", stake: "normal", bots: 3 }, ok);
  check(P[tB.id].p === pB, "ticket annulé (réseau lent) : pas de pénalité");

  const top = await svc.top("all", tA.id, 10);
  check(top.entries.every((e) => !/[<>]/.test(e.n)) && top.entries.some((e) => e.me), "pseudos nettoyés, ma ligne repérée");
  check(before >= 0 && top.total >= 1, "classement général rempli");

  // semaine suivante : points de la semaine remis à zéro, top 10 gardé pour les récompenses
  const wk = weekOf(now);
  const P2 = (svc as unknown as { doc: { players: Record<string, { w: number; wk: string; p: number }> } }).doc.players;
  P2[tA.id].w = 120;
  P2[tA.id].wk = wk;
  now += 7 * 86400_000;
  const next = await svc.top("week", tA.id, 10);
  check(next.entries.length === 0 && next.last?.pos === 1, "nouvelle semaine : classement de la semaine vide, l'ancien 1er est récompensable");
  const all = await svc.top("all", tA.id, 10);
  check(all.me!.p === P2[tA.id].p, "le classement général, lui, continue");
  await svc.hide(tA.id, true);
  check(!(await svc.top("all", null, 10)).entries.some((e) => e.n.startsWith("Alice")), "administration : pseudo retiré du classement");

  console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert.");
  process.exit(failures ? 1 : 0);
})();
