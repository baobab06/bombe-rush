/* Mode Aventure : objectifs, étoiles, boss, progression. `bun tests/adventure.test.ts` */
import { Match } from "../src/core/match";
import { DT } from "../src/core/rules";
import { BotBrain } from "../src/ai/bot";
import { NO_INPUT } from "../src/core/types";
import { ADV_LEVELS, ADV_MAX_STARS, ADV_WORLDS, advClaimable, advMatchConfig, advStars, currentLevel, firstClearReward, levelOpen, recordLevel, worldOpen } from "../src/meta/adventure";
import { defaultProfile } from "../src/meta/profile";
import { migrate } from "../src/meta/save";
const loadProfileFrom = (j: string) => migrate(JSON.parse(j));

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg);
}
const ME = { name: "Toi", characterId: "renard", isBot: false };

/** Joue un niveau, le joueur piloté par un bot. */
function play(id: string, seed: number, skill: "hard" | "expert" = "expert") {
  const l = ADV_LEVELS.find((x) => x.id === id)!;
  const m = new Match(advMatchConfig(l, ME, seed));
  const brains = m.players.map((p) => new BotBrain(p.id, p.id === 0 ? skill : p.difficulty!, seed * 13 + p.id));
  let steps = 0;
  while (m.phase !== "over" && steps < 60 * 300) {
    m.step(brains.map((b, i) => (m.players[i].alive ? b.update(m, DT) : NO_INPUT)));
    steps++;
  }
  return { m, l, won: m.adv!.won, stars: m.adv!.stars(), t: m.adv!.doneAt, why: m.adv!.why };
}

console.log("1. Mondes et niveaux");
check(ADV_WORLDS.length === 4 && ADV_LEVELS.length === 40 && ADV_MAX_STARS === 120, "4 mondes × 10 niveaux = 120 étoiles");
check(ADV_WORLDS.every((w) => w.levels[9].goal === "boss" && !!w.levels[9].boss), "un boss au niveau 10 de chaque monde");
check(new Set(ADV_LEVELS.map((l) => l.id)).size === 40, "identifiants uniques");

console.log("2. Objectifs (joueur expert, plusieurs graines)");
const rates: string[] = [];
for (const l of ADV_LEVELS) {
  let wins = 0, stars = 0;
  const why: string[] = [];
  const N = 6;
  for (let s = 1; s <= N; s++) {
    const r = play(l.id, s * 7 + l.n);
    if (r.won) { wins++; stars += r.stars; } else why.push(r.why || "?");
  }
  rates.push(`${l.id} ${l.goal.padEnd(7)} ${wins}/${N} ★${(stars / Math.max(1, wins)).toFixed(1)} ${why.join(",")}`);
  check(wins >= 1, `${l.id} (${l.goal}, ${l.mapId}) faisable : ${wins}/${N} réussis`);
}
console.log(rates.map((r) => "     " + r).join("\n"));

console.log("3. Boss");
{
  const l = ADV_LEVELS.find((x) => x.id === "1-10")!;
  const m = new Match(advMatchConfig(l, ME, 3));
  m.phase = "playing"; m.countdown = 0;
  const boss = m.players[1];
  check(m.adv!.bossHp === 3 && boss.maxBombs === 3 && boss.range === 3, "boss : 3 cœurs, 3 bombes, portée 3");
  m.kill(boss, 0);
  check(boss.alive && m.adv!.bossHp === 2 && boss.shieldTime > 0, "touché : un cœur en moins, bouclier, toujours là");
  m.kill(boss, 0); m.kill(boss, 0);
  check(!boss.alive && m.adv!.bossHp === 0, "dernier cœur : boss éliminé");
  for (let i = 0; i < 5; i++) m.step(m.players.map(() => NO_INPUT));
  check(m.adv!.won && m.adv!.stars() === 3, "boss battu vite : niveau réussi, 3 étoiles");
}

console.log("4. Progression et récompenses");
{
  const p = defaultProfile();
  check(levelOpen(p, "1-1") && !levelOpen(p, "1-2") && !worldOpen(p, 2), "au début : seul le niveau 1-1 est ouvert");
  const l = ADV_LEVELS[0];
  const o = recordLevel(p, l, true, 2, 30);
  check(o.first && o.stars === 2 && o.rewards.length === 1 && levelOpen(p, "1-2"), "1er passage : 2 étoiles, pièces, niveau suivant ouvert");
  const o2 = recordLevel(p, l, true, 3, 20);
  check(!o2.first && o2.newStars === 1 && o2.rewards.length === 0 && advStars(p) === 3, "rejoué : +1 étoile, pas de 2e récompense");
  recordLevel(p, l, false, 0, 10);
  check(advStars(p, l.id) === 3, "un échec ne fait pas perdre d'étoiles");
  for (const x of ADV_LEVELS.slice(0, 10)) recordLevel(p, x, true, 1, 50);
  check(worldOpen(p, 2) && currentLevel(p).id === "2-1", "boss battu : monde 2 ouvert");
  check(advClaimable(p).some((m) => m.stars === 10), "palier de 10 étoiles à récupérer");
  check(firstClearReward(ADV_LEVELS[39]).some((r) => r.kind === "item" && r.id === "title-bossbuster"), "dernier boss : titre Chasseur de boss");
  const re = loadProfileFrom(JSON.stringify({ ...p, adv: { stars: { "1-1": 9, "zz": 3 }, best: { "1-1": -4 }, claimed: [10, 11] } }));
  check(re.adv.stars["1-1"] === 3 && !("zz" in re.adv.stars) && !("1-1" in re.adv.best) && re.adv.claimed.join() === "10", "sauvegarde nettoyée");
}

console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert ✅");
(globalThis as unknown as { process: { exit(c: number): void } }).process.exit(failures ? 1 : 0);
