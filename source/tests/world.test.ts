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
import { trophyDelta } from "../src/meta/rank";
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
function play(seed: number, modeId: string, diffs: Difficulty | Difficulty[], bots: number, skill: Difficulty = "hard") {
  const dl = Array.isArray(diffs) ? diffs : Array.from({ length: bots }, () => diffs);
  bots = dl.length;
  const chars = CHARACTERS.slice(0, bots + 1);
  const map = mapsFor(modeId)[seed % mapsFor(modeId).length];
  const players = chars.map((c, i) => ({ name: c.name, characterId: c.id, isBot: i > 0, difficulty: i > 0 ? dl[i - 1] : undefined }));
  const s = new LocalSession({ seed, map, modeId, players }, 0);
  s.recorder = new InputRecorder();
  const pilot = new BotBrain(0, skill, seed * 7 + 1);
  const m = s.match;
  // le jeu s'arrête d'enregistrer quand l'issue est connue (mort, ou fin de partie)
  while (!((!m.players[0].alive && !m.hill) || m.phase === "over") && m.tick < 60 * 60 * 6) s.step(pilot.update(m, DT));
  const spec: RankedSpec = { seed, mapId: map.id, modeId, players: players.map((p) => ({ characterId: p.characterId, isBot: p.isBot, ...(p.isBot ? { difficulty: p.difficulty } : {}) })) };
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
const want = { modeId: g0.spec.modeId, bots: g0.spec.players.slice(1).map((p) => p.difficulty!) };
check(checkSpec(g0.spec, want) === null && checkSpec(g0.spec, { ...want, bots: want.bots.map(() => "expert" as Difficulty) }) !== null, "adversaires plus faciles que ceux du ticket : refusé");
check(checkSpec({ ...g0.spec, mapId: "nulle-part" }) !== null, "carte inconnue refusée");

console.log("Serveur : Compétition, trophées, triche");
(async () => {
  let now = Date.parse("2026-11-10T12:00:00Z");
  const svc = new LeaderboardService(new MemoryStore(), () => now, 400);
  const ok = () => true;
  type T = { id: string; secret: string; ticket: string; seed: number; modeId: string; bots: Difficulty[] };
  const P = (svc as unknown as { doc: { players: Record<string, { p: number; w: number; wk: string }> } }).doc.players;
  const old = (await svc.ticket({ name: "Vieux", modeId: "classic", stake: "easy", bots: 3 } as never, ok)) as { error?: string };
  check(!!old.error, "ancienne version du jeu (sans trophées) : pas de ticket, partie non classée");
  // joueur A
  const tA = (await svc.ticket({ name: "Alice<b>", comp: 2 }, ok)) as T;
  check(!!tA.id && !!tA.secret && Number.isInteger(tA.seed), "premier ticket : identifiant + clé secrète + graine choisie par le serveur");
  check(["classic", "chaos", "koth"].includes(tA.modeId) && tA.bots.length === 3 && tA.bots.every((d) => d === "easy"), `mode tiré au hasard par le serveur (${tA.modeId}), 3 adversaires faciles à 0 trophée`);
  const gA = play(tA.seed, tA.modeId, tA.bots, 3, "expert");
  now += gA.ticks * DT * 1000 + 2000;
  const rA = (await svc.submit({ id: tA.id, secret: tA.secret, ticket: tA.ticket, name: "Alice<b>", ...gA })) as { ok: boolean; delta: number; place: number; points: number };
  const pl = { place: gA.local.won ? 1 : gA.local.place, players: 4, draw: gA.local.draw };
  const expect = trophyDelta(columnOf(pl), 0, tA.modeId, gA.local.draw);
  check(rA.ok && rA.delta === expect && rA.points === expect, `trophées calculés par le serveur d'après le rejeu (${rA.delta} 🏆, ${pl.place}e/4 en ${tA.modeId})`);
  const again = (await svc.submit({ id: tA.id, secret: tA.secret, ticket: tA.ticket, ...gA })) as { ok: boolean };
  check(!again.ok, "même ticket envoyé deux fois : refusé");

  // plus de trophées → adversaires plus forts, imposés par le serveur
  P[tA.id].p = 700;
  const t2 = (await svc.ticket({ id: tA.id, secret: tA.secret, name: "Alice", comp: 2 }, ok)) as T;
  check(t2.bots.includes("expert") && !t2.bots.includes("easy"), `à 700 trophées (Platine) : adversaires ${t2.bots.join(", ")}`);
  const tl = (await svc.ticket({ name: "Horsligne", comp: 2, pts: 480 }, ok)) as T;
  check(tl.bots.includes("hard") && !tl.bots.includes("easy"), "trophées gagnés hors ligne : les adversaires sont quand même au bon niveau");
  const g2 = play(t2.seed, t2.modeId, t2.bots, 3, "expert");
  now += 500; // envoyé tout de suite : impossible d'avoir joué si vite
  const fast = (await svc.submit({ id: tA.id, secret: tA.secret, ticket: t2.ticket, ...g2 })) as { ok: boolean; note?: string; place: number | null; delta: number };
  check(fast.ok && fast.place === null && !!fast.note && fast.delta < 0, `partie envoyée plus vite qu'elle n'a duré : comptée comme abandon (${fast.delta} 🏆)`);

  const t3 = (await svc.ticket({ id: tA.id, secret: tA.secret, name: "Alice", comp: 2 }, ok)) as T;
  const easy = play(t3.seed, t3.modeId, ["easy", "easy", "easy"], 3); // adversaires faciles au lieu de ceux du ticket
  now += 3600_000;
  const cheat = (await svc.submit({ id: tA.id, secret: tA.secret, ticket: t3.ticket, ...easy })) as { ok: boolean };
  check(!cheat.ok, "partie jouée contre des adversaires plus faciles que prévu : refusée");

  const t4 = (await svc.ticket({ id: tA.id, secret: tA.secret, name: "Alice", comp: 2 }, ok)) as T;
  const g4 = play(t4.seed + 1, t4.modeId, t4.bots, 3); // graine choisie par le joueur
  now += 3600_000;
  const wrong = (await svc.submit({ id: tA.id, secret: tA.secret, ticket: t4.ticket, ...g4 })) as { ok: boolean };
  check(!wrong.ok, "graine différente de celle du ticket : refusée");

  const bad = (await svc.submit({ id: tA.id, secret: "faux", ticket: "x", ...g4 })) as { ok: boolean; status?: number };
  check(!bad.ok && bad.status === 401, "mauvaise clé secrète : refusé");

  // ticket jamais rendu = abandon au ticket suivant
  const tB = (await svc.ticket({ name: "Bob", comp: 2 }, ok)) as T;
  P[tB.id].p = 500;
  now += 60_000;
  await svc.ticket({ id: tB.id, secret: tB.secret, name: "Bob", comp: 2 }, ok);
  check(P[tB.id].p < 500, `partie quittée sans résultat : comptée comme une défaite (${P[tB.id].p - 500} 🏆)`);
  const tC = (await svc.ticket({ id: tB.id, secret: tB.secret, name: "Bob", comp: 2 }, ok)) as T;
  const pB = P[tB.id].p;
  await svc.cancel({ id: tB.id, secret: tB.secret, ticket: tC.ticket });
  now += 60_000;
  await svc.ticket({ id: tB.id, secret: tB.secret, name: "Bob", comp: 2 }, ok);
  check(P[tB.id].p === pB, "ticket annulé (réseau lent) : pas de pénalité");
  const modes = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const t = (await svc.ticket({ id: tB.id, secret: tB.secret, name: "Bob", comp: 2 }, ok)) as T;
    modes.add(t.modeId);
    await svc.cancel({ id: tB.id, secret: tB.secret, ticket: t.ticket });
  }
  check(modes.size === 3, "les 3 modes sortent bien au tirage");

  const top = await svc.top("all", tA.id, 10);
  check(top.entries.every((e) => !/[<>]/.test(e.n)) && top.entries.some((e) => e.me), "pseudos nettoyés, ma ligne repérée");

  // semaine suivante
  const wk = weekOf(now);
  P[tA.id].w = 120;
  P[tA.id].wk = wk;
  now += 7 * 86400_000;
  const next = await svc.top("week", tA.id, 10);
  check(next.entries.length === 0 && next.last?.pos === 1, "nouvelle semaine : classement de la semaine vide, l'ancien 1er est récompensable");
  const all = await svc.top("all", tA.id, 10);
  check(all.me!.p === P[tA.id].p, "le classement général, lui, continue");
  await svc.hide(tA.id, true);
  check(!(await svc.top("all", null, 10)).entries.some((e) => e.n.startsWith("Alice")), "administration : pseudo retiré du classement");

  console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert.");
  process.exit(failures ? 1 : 0);
})();
