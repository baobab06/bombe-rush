import { test } from "node:test";
import assert from "node:assert/strict";
import { GAMES, GAME_IDS, logicProblem } from "../lib/games.mjs";
import { challengeStandings, pointsForRank, rankDay } from "../lib/scoring.mjs";
import { catchupEnd, currentDay, dayClose, dayOpen } from "../lib/calendar.mjs";
import { drawGames } from "../lib/app.mjs";
import { play } from "./bots.mjs";

test("points du jour : tableau du cahier des charges", () => {
  const table = { 1: [10], 2: [10, 1], 3: [10, 6, 1], 4: [10, 7, 4, 1], 6: [10, 8, 6, 5, 3, 1], 10: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] };
  for (const [n, pts] of Object.entries(table)) {
    assert.deepEqual(pts.map((_, i) => pointsForRank(Number(n), i + 1)), pts, `n=${n}`);
  }
  for (let n = 2; n <= 10; n++) {
    assert.equal(pointsForRank(n, 1), 10);
    assert.equal(pointsForRank(n, n), 1);
  }
});

test("ex æquo : même rang, mêmes points (ceux du meilleur rang)", () => {
  const r = rankDay([
    { userId: "a", score: 500, secondary: 300 },
    { userId: "b", score: 800, secondary: 300 },
    { userId: "c", score: 500, secondary: 300 },
    { userId: "d", score: 500, secondary: 250 },
  ], "asc");
  assert.deepEqual(r.map((x) => [x.userId, x.rank, x.points]), [["b", 1, 10], ["d", 2, 7], ["a", 3, 4], ["c", 3, 4]]);
  // critère secondaire « plus grand = mieux »
  const p = rankDay([{ userId: "a", score: 1, secondary: 50 }, { userId: "b", score: 1, secondary: 90 }], "desc");
  assert.equal(p[0].userId, "b");
});

test("classement du challenge : points, puis 1res places, puis total des scores", () => {
  const day1 = rankDay([{ userId: "a", score: 900 }, { userId: "b", score: 100 }], "asc");
  const day2 = rankDay([{ userId: "b", score: 200 }, { userId: "a", score: 100 }], "asc");
  const s = challengeStandings(["a", "b", "c"], [day1, day2]);
  assert.deepEqual(s.map((x) => [x.userId, x.points, x.rank]), [["a", 11, 1], ["b", 11, 2], ["c", 0, 3]]);
});

test("calendrier : jours de 23 h et 25 h aux changements d'heure (Europe/Paris)", () => {
  // Lancement le samedi 28 mars 2026 à 18 h 30 heure de Paris (17 h 30 UTC).
  const ch = { launchedAt: Date.UTC(2026, 2, 28, 17, 30), tz: "Europe/Paris", durationDays: 7 };
  assert.equal(dayOpen(ch, 1), Date.UTC(2026, 2, 29, 16, 30)); // passage à l'heure d'été
  assert.equal(dayClose(ch, 0) - dayOpen(ch, 0), 23 * 3600_000);
  assert.equal(dayClose(ch, 1) - dayOpen(ch, 1), 24 * 3600_000);
  assert.equal(catchupEnd(ch, 0), dayOpen(ch, 2));
  const fall = { launchedAt: Date.UTC(2026, 9, 24, 16, 30), tz: "Europe/Paris", durationDays: 3 };
  assert.equal(dayClose(fall, 0) - dayOpen(fall, 0), 25 * 3600_000);
  assert.equal(currentDay(fall, Date.UTC(2026, 9, 25, 17, 0)), 0);
  assert.equal(currentDay(fall, Date.UTC(2026, 9, 25, 17, 30)), 1);
  // jours rapides (test)
  const fast = { launchedAt: 1000, dayMs: 60_000, durationDays: 3 };
  assert.equal(dayOpen(fast, 2), 121_000);
  assert.equal(currentDay(fast, 200_000), 3);
});

test("tirage des mini-jeux : pas de répétition avant que les quatre aient été joués", () => {
  const g = drawGames("abc", 30);
  for (let i = 0; i + 4 <= 30; i += 4) assert.equal(new Set(g.slice(i, i + 4)).size, 4);
  for (let i = 1; i < 30; i++) assert.notEqual(g[i], g[i - 1]);
});

test("mini-jeux : déterministes et partie parfaite bien notée", () => {
  for (const id of GAME_IDS) {
    const game = GAMES[id];
    assert.deepEqual(game.generate(42), game.generate(42), id);
    const res = game.evaluate(game.generate(42), play(id, 42));
    assert.equal(res.verdict, "ok", `${id}: ${res.reasons}`);
    assert.ok(res.passed, id);
    assert.ok(res.score >= 700 && res.score <= 1000, `${id}: ${res.score}`);
    const weak = game.evaluate(game.generate(42), play(id, 42, { quality: 0.3 }));
    assert.ok(weak.score < res.score, `${id} faible`);
    const none = game.evaluate(game.generate(42), []);
    assert.equal(none.score, 0, `${id} vide`);
    assert.equal(none.passed, false);
  }
});

test("formules de départ", () => {
  // Reflex : 20 bonnes réponses à 250 ms de moyenne => 1000 − 25 − petites variations
  const r = GAMES.reflex.evaluate(GAMES.reflex.generate(1), play("reflex", 1, { rt: 240 }));
  assert.equal(r.raw.good, 20);
  assert.equal(r.score, Math.floor(1000 - (r.raw.avgRt - 200) / 2 + 0.5));
  const l = GAMES.logic.evaluate(GAMES.logic.generate(1), play("logic", 1, { quality: 0.5 }));
  assert.equal(l.score, Math.max(0, Math.min(1000, 50 * l.raw.correct - 15 * l.raw.errors)));
});

test("validation serveur : résultats impossibles refusés, douteux marqués suspect", () => {
  const seed = 7;
  // Memory : saisie pendant la démonstration
  const mem = GAMES.memory.generate(seed);
  assert.equal(GAMES.memory.evaluate(mem, [{ type: "tap", t: 10, cell: mem.levels[0][0] }]).verdict, "invalid");
  // Logic : réponses dans le désordre
  assert.equal(GAMES.logic.evaluate(GAMES.logic.generate(seed), [{ type: "answer", t: 1000, i: 3, choice: 0 }]).verdict, "invalid");
  // Precision : rafale de tirs
  const burst = Array.from({ length: 40 }, (_, i) => ({ type: "shot", t: 5000 + i * 10, x: 0.5, y: 0.5 }));
  assert.equal(GAMES.precision.evaluate(GAMES.precision.generate(seed), burst).verdict, "invalid");
  // Horodatages non croissants
  assert.equal(GAMES.reflex.evaluate(GAMES.reflex.generate(seed), [{ type: "tap", t: 5000 }, { type: "tap", t: 4000 }]).verdict, "invalid");
  // Reflex : régularité non humaine => suspect
  const content = GAMES.reflex.generate(seed);
  const robotic = content.stimuli.filter((s) => s.kind === "go").map((s) => ({ type: "tap", t: s.at + 180 }));
  const res = GAMES.reflex.evaluate(content, robotic);
  assert.equal(res.verdict, "suspect");
  assert.ok(res.score > 0);
});

test("Logic Sprint : chaque problème a une seule bonne réponse parmi des choix distincts", () => {
  for (let i = 0; i < 300; i++) {
    const p = logicProblem(99, i);
    assert.equal(new Set(p.choices).size, p.choices.length, p.text);
    assert.ok(p.answer >= 0 && p.answer < p.choices.length);
  }
});
