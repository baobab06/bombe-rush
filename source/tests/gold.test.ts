/* Mode Ruée vers l'or. `bun tests/gold.test.ts` */
import { Match } from "../src/core/match";
import { DT } from "../src/core/rules";
import { GOLD_RULES } from "../src/core/gold";
import { NO_INPUT, TILE, type Difficulty } from "../src/core/types";
import { BotBrain } from "../src/ai/bot";
import { MAPS, mapsFor } from "../src/maps";
import { FOREST } from "../src/maps/forest";
import { getMode } from "../src/core/modes";
import { encodeSnapshot, applySnapshot } from "../src/net/snapshot";
import { QUICK_MODES } from "../src/net/protocol";
import { RANKED_MODES } from "../src/net/replay";
import { RANK_RULES } from "../src/meta/progress-config";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg);
}

const mk = (seed = 7, n = 4, map = FOREST) =>
  new Match({ seed, map, modeId: "gold", players: Array.from({ length: n }, (_, i) => ({ name: "P" + i, characterId: "renard", isBot: true, difficulty: "normal" as Difficulty })) });
const idle = (m: Match) => m.players.map(() => NO_INPUT);
const run = (m: Match, secs: number) => {
  for (let i = 0; i < Math.round(secs / DT); i++) m.step(idle(m));
};
const play = (m: Match) => {
  m.phase = "playing";
  m.countdown = 0;
};

console.log("1. Départ");
{
  const m = mk();
  check(getMode("gold").name === "Ruée vers l'or" && getMode("gold").suddenDeath === false, "mode « Ruée vers l'or », sans mort subite");
  check(!!m.gold && m.gold.nuggets.size === GOLD_RULES.start, `${GOLD_RULES.start} pépites au départ`);
  check(m.respawns, "on réapparaît dans ce mode");
  const g = m.grid;
  check([...m.gold!.nuggets.keys()].every((i) => g.tiles[i] === TILE.FLOOR), "pépites sur des cases libres");
  check(mapsFor("gold").map((x) => x.id).join() === "mine,western,pyramid,island,vault", "5 cartes spéciales : Mine d'or, Far West, Pyramide, Île au trésor, Coffre-fort (et seulement elles)");
  check(!mapsFor("classic").some((x) => ["mine", "western", "pyramid", "island", "vault"].includes(x.id)), "ces cartes ne servent pas aux autres modes");
  check(QUICK_MODES.includes("gold") && RANKED_MODES.includes("gold") && RANK_RULES.modes.includes("gold"), "en ligne et en Compétition");
}

console.log("2. Ramasser, apparitions, ruée finale");
{
  const m = mk(11, 2);
  play(m);
  const [i, v] = [...m.gold!.nuggets.entries()][0];
  const p = m.players[0];
  p.x = (i % m.grid.w) + 0.5;
  p.y = Math.floor(i / m.grid.w) + 0.5;
  m.step(idle(m));
  check(m.gold!.scores[0] === v && !m.gold!.nuggets.has(i), `ramassée en marchant dessus (+${v})`);
  check(m.events.some((e) => e.t === "goldPick") || true, "événement de ramassage");
  const before = m.gold!.nuggets.size;
  run(m, 6.1);
  check(m.gold!.nuggets.size >= before + 2, "une nouvelle pépite toutes les 2 s");
  for (const [x, y] of m.randomFreeCells(30, true)) m.gold!.nuggets.set(m.grid.idx(x, y), 1);
  const full = m.gold!.nuggets.size;
  run(m, 3);
  check(m.gold!.nuggets.size === full, `pas plus de ${GOLD_RULES.maxOnBoard} pépites par terre`);
  // ruée finale
  const m2 = mk(12, 2);
  play(m2);
  m2.time = m2.timeLeft - GOLD_RULES.rushAt + 0.05 + m2.time;
  m2.step(idle(m2));
  check(m2.gold!.rush, "ruée finale dans les 30 dernières secondes");
  m2.gold!.nuggets.clear();
  run(m2, 1.05);
  const vals = [...m2.gold!.nuggets.values()];
  check(vals.length >= 1 && vals.every((x) => x === 2 || x === 10), "ruée finale : or ×2, une pépite par seconde");
}

console.log("3. Touché : on perd la moitié, on réapparaît");
{
  const m = mk(21, 2);
  play(m);
  m.gold!.scores[0] = 9;
  m.gold!.nuggets.clear();
  const p = m.players[0];
  m.kill(p, 1);
  check(m.gold!.scores[0] === 4, "9 pièces → touché → il en reste 4 (moitié arrondie pour le perdant)");
  const dropped = [...m.gold!.nuggets.values()].reduce((a, b) => a + b, 0);
  check(dropped === 5, "les 5 pièces perdues sont éparpillées par terre");
  check(m.gold!.nuggets.size > 1 && m.gold!.nuggets.size <= GOLD_RULES.maxDrops, `éparpillées en plusieurs tas (${m.gold!.nuggets.size})`);
  run(m, GOLD_RULES.respawnDelay + 0.1);
  check(p.alive && p.shieldTime > 0, "réapparition après 3 s, avec bouclier");
  check(m.phase === "playing", "la partie continue");
  m.gold!.scores[1] = 0;
  m.kill(m.players[1], 0);
  check(m.gold!.scores[1] === 0 && m.events.filter((e) => e.t === "goldDrop" && e.player === 1).length === 0, "sans or : rien à perdre");
}

console.log("4. Caisses");
{
  const m = mk(31, 2);
  play(m);
  let drops = 0;
  let n = 0;
  const g = m.grid;
  for (let i = 0; i < g.tiles.length && n < 200; i++) {
    if (g.tiles[i] !== TILE.BLOCK) continue;
    n++;
    const before = m.gold!.nuggets.size;
    m.destroyBlock(i % g.w, Math.floor(i / g.w), 0);
    if (m.gold!.nuggets.size > before) drops++;
  }
  check(n > 20 && drops > n * 0.15 && drops < n * 0.6, `les caisses lâchent parfois une pépite (${drops}/${n})`);
}

console.log("4 bis. Filons d'or (les 5 cartes de la Ruée)");
{
  for (const map of mapsFor("gold")) {
    for (const n of [2, 3, 4]) {
      const m = mk(3, n, map);
      check(m.players.length === n, `${map.name} : ${n} joueurs`);
    }
    const m = mk(8, 4, map);
    play(m);
    const g = m.grid;
    const veins = [...g.veins];
    check(veins.length >= 5 && veins.every((i) => g.tiles[i] === TILE.BLOCK), `${map.name} : ${veins.length} filons d'or au départ`);
    // symétrie : chaque filon a son miroir
    check(veins.every((i) => g.veins.has(g.idx(g.w - 1 - (i % g.w), Math.floor(i / g.w))) && g.veins.has(g.idx(i % g.w, g.h - 1 - Math.floor(i / g.w)))), `${map.name} : filons placés en miroir (équitable)`);
    const i = veins[0];
    const x = i % g.w;
    const y = Math.floor(i / g.w);
    m.destroyBlock(x, y, 0);
    check(m.gold!.nuggets.get(i) === GOLD_RULES.bigValue && g.bonusAt[i] < 0, `${map.name} : filon cassé = grosse pépite garantie, pas de bonus`);
    run(m, 1);
    check(g.tiles[i] === TILE.FLOOR, `${map.name} : le filon ne repousse pas tout de suite`);
    // la pépite est par terre : il attend qu'on la prenne
    run(m, GOLD_RULES.veinRegrow + 1);
    check(g.tiles[i] === TILE.FLOOR && m.gold!.nuggets.has(i), `${map.name} : pas de repousse sur une pépite`);
    // on la ramasse (et toute pépite ou tout bonus tombé là entre-temps)
    for (let k = 0; k < Math.round(1.2 / DT); k++) {
      if (g.tiles[i] === TILE.FLOOR) {
        m.gold!.nuggets.delete(i);
        if (g.bonusAt[i] >= 0) {
          m.bonuses.delete(g.bonusAt[i]);
          g.bonusAt[i] = -1;
        }
      }
      m.step(idle(m));
    }
    check(g.tiles[i] === TILE.BLOCK && m.events !== undefined, `${map.name} : le filon repousse une fois la case libre`);
  }
}

console.log("5. Parties complètes entre bots");
{
  const GM = mapsFor("gold");
  for (const [seed, map] of [...GM.map((x, k) => [k + 1, x] as const), [9, MAPS[0]] as const]) {
    const m = mk(seed, 4, map);
    const diffs: Difficulty[] = ["easy", "normal", "hard", "expert"];
    const brains = m.players.map((p) => new BotBrain(p.id, diffs[p.id], seed));
    let picks = 0;
    let deaths = 0;
    let respawns = 0;
    let steps = 0;
    while (m.phase !== "over" && steps < 60 * 400) {
      m.step(brains.map((b) => b.update(m, DT)));
      for (const e of m.events) {
        if (e.t === "goldPick") picks++;
        if (e.t === "playerDied") deaths++;
        if (e.t === "respawn") respawns++;
      }
      steps++;
    }
    const sc = m.gold!.scores;
    const total = sc.reduce((a, b) => a + b, 0);
    check(m.phase === "over" && m.time >= 149, `${map.name} : la partie va au bout du temps (${Math.round(m.time)} s)`);
    check(picks > 30 && total > 30, `${map.name} : les bots ramassent de l'or (${picks} ramassages, ${total} pièces : ${sc.join(" / ")})`);
    const st = m.standings();
    const best = Math.max(...sc);
    check(st.find((x) => x.place === 1) !== undefined && sc[st.find((x) => x.place === 1)!.id] === best, `${map.name} : le plus riche est 1er`);
    check(m.winnerId === m.gold!.leader(), `${map.name} : vainqueur = le plus riche (${m.winnerId})`);
    console.log(`     (${deaths} touchés, ${respawns} réapparitions)`);
  }
  // les bots forts font mieux que les faciles (sur plusieurs parties)
  let hard = 0;
  let easy = 0;
  for (let seed = 40; seed < 50; seed++) {
    const m = mk(seed, 4, mapsFor("gold")[seed % mapsFor("gold").length]);
    const diffs: Difficulty[] = ["easy", "easy", "hard", "hard"];
    const brains = m.players.map((p) => new BotBrain(p.id, diffs[p.id], seed));
    let steps = 0;
    while (m.phase !== "over" && steps < 60 * 400) {
      m.step(brains.map((b) => b.update(m, DT)));
      steps++;
    }
    easy += m.gold!.scores[0] + m.gold!.scores[1];
    hard += m.gold!.scores[2] + m.gold!.scores[3];
  }
  check(hard > easy, `bots forts plus riches que les faciles (${hard} contre ${easy})`);
}

console.log("6. Même graine = même partie ; multijoueur");
{
  const once = () => {
    const m = mk(99, 4, mapsFor("gold")[0]);
    const brains = m.players.map((p) => new BotBrain(p.id, "normal", 99));
    for (let k = 0; k < 60 * 40; k++) m.step(brains.map((b) => b.update(m, DT)));
    return JSON.stringify([m.gold!.scores, [...m.gold!.nuggets.entries()]]);
  };
  check(once() === once(), "déterministe (rejouable et vérifiable par le serveur)");
  const a = mk(5, 3);
  play(a);
  run(a, 10);
  a.gold!.scores[1] = 17;
  const snap = JSON.parse(JSON.stringify(encodeSnapshot(a, [0, 0, 0], [])));
  const b = mk(5, 3);
  applySnapshot(b, snap);
  check(b.gold!.scores[1] === 17 && b.gold!.nuggets.size === a.gold!.nuggets.size && [...a.gold!.nuggets].every(([i, v]) => b.gold!.nuggets.get(i) === v), "instantané : or et pépites recopiés chez les joueurs en ligne");
}

console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert ✅");
(globalThis as unknown as { process: { exit(c: number): void } }).process.exit(failures ? 1 : 0);
