/* Tests headless de la simulation : `bun tests/sim.test.ts` */
import { Match } from "../src/core/match";
import { RULES } from "../src/core/rules";
import { NO_INPUT, TILE, type Difficulty, type InputCmd } from "../src/core/types";
import { FOREST } from "../src/maps/forest";
import { MAPS } from "../src/maps";
import { TERRAIN } from "../src/core/types";
import { BotBrain } from "../src/ai/bot";
import { DT } from "../src/core/rules";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.log("  ✗ " + msg);
  } else console.log("  ✓ " + msg);
}

function emptyMatch(players = 2): Match {
  const m = new Match({
    seed: 42,
    map: FOREST,
    modeId: "classic",
    players: Array.from({ length: players }, (_, i) => ({ name: "P" + i, characterId: "pip", isBot: false })),
  });
  m.phase = "playing";
  const g = m.grid;
  for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === TILE.BLOCK) g.tiles[i] = TILE.FLOOR;
  // les tests de portée historiques sont écrits pour une portée 2
  for (const p of m.players) p.range = 2;
  return m;
}
const idle = (m: Match) => m.players.map(() => NO_INPUT);
const run = (m: Match, secs: number, inputs?: (m: Match) => InputCmd[]) => {
  for (let i = 0; i < Math.round(secs / DT); i++) m.step(inputs ? inputs(m) : idle(m));
};
const place = (m: Match, id: number, x: number, y: number) => {
  m.players[id].x = x + 0.5;
  m.players[id].y = y + 0.5;
};

console.log("Départ");
{
  const m = new Match({ seed: 5, map: FOREST, modeId: "classic", players: [0, 1].map((i) => ({ name: "P" + i, characterId: "pip", isBot: false })) });
  check(m.players[0].range === 1, "portée de départ = 1 case");
  check(m.players[0].maxBombs === 1, "1 bombe au départ");
}
for (const n of [2, 4, 6]) {
  for (let seed = 1; seed <= 20; seed++) {
    const m = new Match({ seed, map: FOREST, modeId: "classic", players: Array.from({ length: n }, (_, i) => ({ name: "P" + i, characterId: "pip", isBot: false })) });
    const g = m.grid;
    let floors = 0;
    for (let y = 1; y < g.h - 1; y++) for (let x = 1; x < g.w - 1; x++) if (g.tile(x, y) === TILE.FLOOR) floors++;
    // chaque spawn : la case + ses voisins libres seulement (L de 3 cases dans les coins)
    const expected = n > 4 ? 4 * 3 + 2 * 3 : 4 * 3;
    if (seed === 1) check(floors === expected, `${n} joueurs : seules ${expected} cases vides (spawns), tout le reste est bloc ou pierre (trouvé ${floors})`);
    // cachette : pour chaque joueur, poser au spawn voisin puis se cacher survit
    if (seed === 1 && n === 4) {
      const p = m.players[0];
      const sx = Math.floor(p.x), sy = Math.floor(p.y);
      m.phase = "playing";
      p.x = sx + 1.5; // case voisine (2,1)
      m.tryPlaceBomb(p);
      p.x = sx + 0.5;
      p.y = sy + 1.5; // cachette (1,2)
      run(m, RULES.bombFuse + 0.2);
      check(p.alive, "la cachette du spawn protège de la 1re bombe");
    }
  }
}

console.log("Maps");
for (const map of MAPS) {
  for (const n of [2, 4, 6]) {
    const m = new Match({ seed: 3, map, modeId: "classic", players: Array.from({ length: n }, (_, i) => ({ name: "P" + i, characterId: "renard", isBot: false })) });
    const g = m.grid;
    // toutes les cases praticables (blocs ignorés) forment une seule zone
    const walk = (x: number, y: number) => g.tile(x, y) !== TILE.WALL && !g.isHazard(x, y);
    let total = 0;
    let start = -1;
    for (let i = 0; i < g.tiles.length; i++) if (walk(i % g.w, Math.floor(i / g.w))) { total++; if (start < 0) start = i; }
    const seen = new Set([start]);
    const q = [start];
    while (q.length) {
      const c = q.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = (c % g.w) + dx, ny = Math.floor(c / g.w) + dy, ni = ny * g.w + nx;
        if (walk(nx, ny) && !seen.has(ni)) { seen.add(ni); q.push(ni); }
      }
    }
    const spawnsOk = m.players.every((p) => { const x = Math.floor(p.x), y = Math.floor(p.y); return g.tile(x, y) === TILE.FLOOR && !g.isHazard(x, y); });
    if (n === 4) check(seen.size === total && spawnsOk, `${map.name} : arène d'un seul tenant, spawns libres`);
    if (n !== 4 && !(seen.size === total && spawnsOk)) check(false, `${map.name} ${n} joueurs`);
  }
}
{
  // glace : on continue de glisser après avoir lâché le joystick
  const ice = MAPS.find((m) => m.id === "ice")!;
  const m = new Match({ seed: 3, map: ice, modeId: "classic", players: [0, 1].map((i) => ({ name: "P" + i, characterId: "renard", isBot: false })) });
  m.phase = "playing";
  const g = m.grid;
  for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === TILE.BLOCK) g.tiles[i] = TILE.FLOOR;
  const p = m.players[0];
  p.x = 2.5; p.y = 3.5; // rangée de glace y=3, x de 2 à 10
  run(m, 0.2, () => [{ mx: 1, my: 0, bomb: false, ability: false }, NO_INPUT]);
  const x1 = p.x;
  run(m, 1.0);
  check(g.terrainAt(2, 3) === TERRAIN.ICE && p.x > x1 + 2, "Banquise : on glisse sans commande sur la glace");
  run(m, 3);
  check(Math.floor(p.x) <= 11 && g.tile(Math.floor(p.x), 3) === TILE.FLOOR, "Banquise : la glissade s'arrête en sortant de la glace / contre un obstacle");
  // sur l'herbe : pas de glissade
  p.x = 1.5; p.y = 7.5 - 4; p.y = 5.5; p.x = 1.5;
}
{
  // volcan : les cheminées entrent en éruption et tuent
  const vol = MAPS.find((m) => m.id === "volcano")!;
  const m = new Match({ seed: 3, map: vol, modeId: "classic", players: [0, 1].map((i) => ({ name: "P" + i, characterId: "renard", isBot: false })) });
  m.phase = "playing";
  check(m.vents.length === 3, "Volcan : 3 cheminées");
  const v = m.vents[0];
  m.players[1].x = v[0] + 0.5; m.players[1].y = v[1] + 0.5;
  let erupted = false;
  for (let i = 0; i < 60 * 12 && !erupted; i++) { m.step(idle(m)); if (m.events.some((e) => e.t === "eruption" && e.x === v[0] && e.y === v[1])) erupted = true; }
  run(m, DT * 2);
  check(erupted && !m.players[1].alive && m.players[1].killedBy === -1, "Volcan : l'éruption tue (sans créditer personne)");
  check(m.grid.isHazard(3, 3), "Volcan : la lave est infranchissable");
}

console.log("Mode Chaos");
{
  const mk = () => {
    const m = new Match({ seed: 9, map: FOREST, modeId: "chaos", players: [0, 1, 2].map((i) => ({ name: "P" + i, characterId: "renard", isBot: false })) });
    m.phase = "playing";
    return m;
  };
  {
    const m = mk();
    check(!!m.chaos, "le mode Chaos crée son directeur d'événements");
    const seen: string[] = [];
    let warned = 0;
    for (let i = 0; i < 60 * 70; i++) {
      // joueurs invincibles pour laisser tourner la partie
      for (const p of m.players) p.shieldTime = 99;
      m.step(idle(m));
      for (const e of m.events) {
        if (e.t === "chaosStart") seen.push(e.id);
        if (e.t === "chaosWarn") warned++;
      }
    }
    check(seen.length >= 3 && seen.length <= 8, `des événements arrivent régulièrement sans être trop fréquents (${seen.length} en 70 s : ${seen.join(", ")})`);
    check(m.chaos!.count >= 3, "le directeur compte les événements");
    check(warned >= 1 || !seen.some((id) => ["bombRain", "flameStorm", "megaBlast"].includes(id)), "les gros événements sont précédés d'une alerte");
  }
  {
    const m = mk();
    m.chaos!.trigger("megaBlast");
    check(!!m.chaos!.pending && m.chaos!.pendingLeft === 3 && m.chaos!.pending.zone.length > 0, "Explosion géante : alerte de 3 s et zone annoncée");
    const zone = m.chaos!.pending!.zone.slice();
    run(m, 2.9);
    check(zone.every((i) => m.grid.fire[i] === 0), "rien ne brûle pendant le compte à rebours");
    run(m, 0.2);
    check(zone.every((i) => m.grid.tiles[i] === TILE.WALL || m.grid.fire[i] > 0), "BOOM : toute la zone est en feu, blocs compris");
  }
  {
    const m = mk();
    m.chaos!.trigger("bombRain");
    run(m, 3.05);
    run(m, 1.5);
    const neutral = [...m.bombs.values()].filter((b) => b.ownerId === -1).length;
    check(neutral >= 3, `Pluie de bombes : des bombes neutres tombent (${neutral})`);
    run(m, 4);
    check(m.players.every((p) => p.activeBombs === 0), "les bombes neutres ne bloquent le stock de personne");
  }
  {
    const m = mk();
    m.chaos!.trigger("speedChaos");
    run(m, DT);
    check(m.speedMul > 1, "Speed chaos accélère tout le monde");
    run(m, 8);
    check(m.speedMul === 1, "puis tout revient à la normale");
    m.chaos!.trigger("shields");
    run(m, DT);
    check([...m.bonuses.values()].filter((b) => b.type === "shield").length >= 1, "Boucliers : des boucliers apparaissent");
    m.chaos!.trigger("overload");
    run(m, DT);
    check(m.bonusBoost && m.bonuses.size >= 3, "Surcharge : bonus en masse");
    m.chaos!.trigger("flameStorm");
    const z = m.chaos!.pending!.zone.slice();
    run(m, 3.1);
    check(z.length > 0 && z.every((i) => m.grid.fire[i] > 0), "Tempête de flammes : les zones annoncées brûlent");
  }
  {
    // déterminisme : deux parties identiques = mêmes événements
    const a = mk(), b = mk();
    const ea: string[] = [], eb: string[] = [];
    for (let i = 0; i < 60 * 40; i++) {
      for (const p of a.players) p.shieldTime = 99;
      for (const p of b.players) p.shieldTime = 99;
      a.step(idle(a)); b.step(idle(b));
      for (const e of a.events) if (e.t === "chaosStart") ea.push(e.id);
      for (const e of b.events) if (e.t === "chaosStart") eb.push(e.id);
    }
    check(ea.join() === eb.join() && ea.length > 0, "Chaos déterministe (indispensable pour le multijoueur)");
  }
  // bots en mode Chaos
  let ok = 0;
  for (let sd = 1; sd <= 30; sd++) {
    const m = new Match({ seed: sd, map: MAPS[sd % 4], modeId: "chaos", players: Array.from({ length: 4 }, (_, i) => ({ name: "B" + i, characterId: "renard", isBot: true, difficulty: "normal" as Difficulty })) });
    const brains = m.players.map((p) => new BotBrain(p.id, "normal", sd));
    let guard = 0;
    while (m.phase !== "over" && guard++ < 60 * 200) m.step(brains.map((b) => b.update(m, DT)));
    if (m.phase === "over") ok++;
  }
  check(ok === 30, "30 parties Chaos entre bots se terminent (4 maps)");
}

console.log("Explosion & murs");
{
  const m = emptyMatch();
  place(m, 0, 1, 1);
  place(m, 1, 11, 9);
  m.tryPlaceBomb(m.players[0]);
  place(m, 0, 3, 3); // le joueur s'éloigne (téléporté)
  run(m, RULES.bombFuse + DT * 2);
  const g = m.grid;
  check(g.fire[g.idx(1, 1)] > 0, "feu au centre");
  check(g.fire[g.idx(2, 1)] > 0 && g.fire[g.idx(3, 1)] > 0, "bras horizontal de portée 2");
  check(g.fire[g.idx(4, 1)] === 0, "portée limitée à 2");
  check(g.fire[g.idx(1, 2)] > 0 && g.fire[g.idx(1, 3)] > 0, "bras vertical");
  check(g.fire[g.idx(0, 1)] === 0, "mur extérieur bloque");
  check(m.players[0].activeBombs === 0, "bombe rendue au joueur");
}
{
  const m = emptyMatch();
  place(m, 0, 3, 1);
  m.players[0].range = 3;
  m.tryPlaceBomb(m.players[0]);
  place(m, 0, 11, 9);
  run(m, RULES.bombFuse + DT * 2);
  const g = m.grid;
  check(g.fire[g.idx(3, 2)] > 0, "feu juste sous la bombe");
  check(g.fire[g.idx(3, 3)] > 0, "colonne ouverte : feu en (3,3)");
  // (2,2) est un pilier : le feu de (2,1) ne descend pas
  check(g.tile(2, 2) === TILE.WALL && g.fire[g.idx(2, 2)] === 0, "pilier jamais en feu");
}

console.log("Réaction en chaîne");
{
  const m = emptyMatch();
  place(m, 0, 1, 1);
  m.tryPlaceBomb(m.players[0]);
  m.players[0].maxBombs = 3;
  place(m, 0, 3, 1);
  run(m, 1); // la seconde bombe a 1 s de retard
  m.tryPlaceBomb(m.players[0]);
  place(m, 0, 5, 1);
  m.tryPlaceBomb(m.players[0]);
  place(m, 0, 11, 9);
  check(m.bombs.size === 3, "3 bombes posées");
  run(m, RULES.bombFuse - 1 + DT * 2);
  check(m.bombs.size === 0, "les 3 bombes explosent ensemble");
  check(m.grid.fire[m.grid.idx(7, 1)] > 0, "le feu de la 3e bombe atteint (7,1)");
}

console.log("Blocs & bonus");
{
  const m = emptyMatch();
  const g = m.grid;
  g.tiles[g.idx(3, 1)] = TILE.BLOCK;
  g.hiddenBonus[g.idx(3, 1)] = "flame";
  g.tiles[g.idx(4, 1)] = TILE.BLOCK;
  place(m, 0, 1, 1);
  m.tryPlaceBomb(m.players[0]);
  place(m, 0, 3, 3);
  place(m, 1, 11, 9);
  run(m, RULES.bombFuse + DT * 2);
  check(g.tile(3, 1) === TILE.FLOOR, "bloc détruit");
  check(g.tile(4, 1) === TILE.BLOCK, "le bloc suivant est protégé");
  check(g.bonusAt[g.idx(3, 1)] >= 0, "bonus révélé (et pas brûlé par sa propre flamme)");
  run(m, 0.7);
  // marcher dessus : de (1,3) on remonte puis on va à droite
  const before = m.players[0].range;
  place(m, 0, 3, 1);
  run(m, DT * 2);
  check(m.players[0].range === before + 1, "bonus Flamme ramassé (+1 portée)");
}

console.log("Éliminations & bouclier");
{
  const m = emptyMatch(3);
  place(m, 0, 1, 1);
  place(m, 1, 1, 3); // dans la ligne de feu
  place(m, 2, 11, 9);
  m.players[1].shieldCharges = 1;
  m.tryPlaceBomb(m.players[0]);
  place(m, 0, 5, 5);
  run(m, RULES.bombFuse - 0.5);
  m.tryShield(m.players[1]);
  run(m, 0.6);
  check(m.players[1].alive, "le bouclier protège de l'explosion");
  run(m, 1); // laisser retomber les flammes
  place(m, 2, 9, 9);
  m.players[1].shieldTime = 0;
  place(m, 1, 1, 1);
  m.tryPlaceBomb(m.players[1]);
  place(m, 1, 9, 7); // pile dans la croix de… non : hors portée
  place(m, 2, 3, 1); // victime en (3,1)
  run(m, RULES.bombFuse + DT * 2);
  check(!m.players[2].alive, "joueur dans le feu éliminé");
  check(m.players[1].stats.kills === 1, "élimination créditée au poseur");
  console.log("    (killedBy=" + m.players[2].killedBy + ")");
  m.kill(m.players[0], -1);
  run(m, RULES.endDelay + 0.1);
  check(m.phase === "over" && m.winnerId === 1, "partie terminée, dernier survivant vainqueur");
}
{
  const m = emptyMatch();
  place(m, 0, 1, 1);
  place(m, 1, 11, 9);
  m.tryPlaceBomb(m.players[0]);
  run(m, RULES.bombFuse + DT * 2);
  check(!m.players[0].alive, "suicide possible (on reste sur sa bombe)");
  check(m.players[1].stats.kills === 0 && m.players[0].stats.kills === 0, "pas de kill crédité pour un suicide");
}

console.log("Collisions");
{
  const m = emptyMatch();
  place(m, 0, 1, 1);
  run(m, 2, () => [{ mx: 0, my: -1, bomb: false, ability: false }, NO_INPUT]);
  check(m.players[0].y >= 1.5 - 1e-6, "impossible d'entrer dans le mur du haut");
  place(m, 0, 1, 1);
  run(m, 3, () => [{ mx: 1, my: 0.35, bomb: false, ability: false }, NO_INPUT]);
  const p = m.players[0];
  check(m.grid.tile(Math.floor(p.x), Math.floor(p.y)) === TILE.FLOOR, "toujours sur une case libre");
  check(p.x > 10, "avance le long du couloir malgré un joystick imprécis");
  // virage assisté : légèrement décalé sous la ligne, on veut monter dans la colonne 3
  place(m, 0, 3, 3);
  p.x = 3.5 + 0.3; // décalé de 0.3 vers la droite
  run(m, 0.5, () => [{ mx: 0, my: -1, bomb: false, ability: false }, NO_INPUT]);
  check(p.y < 2.5 && Math.abs(p.x - 3.5) < 0.01, "assistance de virage (recentrage dans le couloir)");
  // bombe : on peut en sortir mais pas y revenir
  place(m, 0, 1, 3);
  m.tryPlaceBomb(p);
  run(m, 0.6, () => [{ mx: 0, my: 1, bomb: false, ability: false }, NO_INPUT]);
  run(m, 0.6, () => [{ mx: 0, my: -1, bomb: false, ability: false }, NO_INPUT]);
  check(Math.floor(p.y) >= 4, "la bombe bloque le retour");
  // dès qu'on a quitté la case de la bombe, elle est solide (même en restant collé)
}
{
  const m = emptyMatch();
  const p = m.players[0];
  place(m, 0, 3, 3);
  place(m, 1, 11, 9);
  m.tryPlaceBomb(p);
  run(m, 0.2, () => [{ mx: 1, my: 0, bomb: false, ability: false }, NO_INPUT]);
  const out = p.x;
  check(Math.floor(out) === 4, "on sort de sa bombe");
  run(m, 0.5, () => [{ mx: -1, my: 0, bomb: false, ability: false }, NO_INPUT]);
  check(Math.floor(p.x) === 4 && p.x >= out - 1e-6, "impossible de retraverser la bombe juste après l'avoir quittée");
}

console.log("Bots : toutes les maps (Normal)");
for (const map of MAPS) {
  let ok = 0, suicides = 0, env = 0, time = 0;
  const N = 40;
  for (let sd = 1; sd <= N; sd++) {
    const m = new Match({ seed: sd * 31, map, modeId: "classic", players: Array.from({ length: 4 }, (_, i) => ({ name: "B" + i, characterId: "renard", isBot: true, difficulty: "normal" as Difficulty })) });
    const brains = m.players.map((p) => new BotBrain(p.id, "normal", sd));
    let guard = 0, bad = false;
    while (m.phase !== "over" && guard++ < 60 * 200) {
      m.step(brains.map((b) => b.update(m, DT)));
      for (const p of m.players) if (p.alive && m.grid.blocksMove(Math.floor(p.x), Math.floor(p.y))) bad = true;
    }
    if (m.phase === "over" && !bad) ok++;
    time += m.time;
    for (const p of m.players) { if (p.killedBy === p.id) suicides++; if (!p.alive && p.killedBy === -1) env++; }
  }
  console.log(`  ${map.name.padEnd(9)} durée moy ${(time / N).toFixed(0)}s · suicides/partie ${(suicides / N).toFixed(2)} · morts environnement/partie ${(env / N).toFixed(2)}`);
  check(ok === N, `${map.name} : ${N} parties terminées, aucun bot dans un mur, la lave ou l'eau`);
}

console.log("Bots : parties complètes");
for (const diff of ["easy", "normal", "hard", "expert"] as Difficulty[]) {
  let suicides = 0, kills = 0, draws = 0, sudden = 0, invariant = 0, totalTime = 0, bombs = 0, bonuses = 0;
  const N = 60;
  for (let s = 1; s <= N; s++) {
    const m = new Match({
      seed: s * 97 + diff.length,
      map: FOREST,
      modeId: "classic",
      players: Array.from({ length: 4 }, (_, i) => ({ name: "B" + i, characterId: "pip", isBot: true, difficulty: diff })),
    });
    const brains = m.players.map((p) => new BotBrain(p.id, diff, s));
    let guard = 0;
    while (m.phase !== "over" && guard++ < 60 * 200) {
      m.step(brains.map((b) => b.update(m, DT)));
      for (const p of m.players)
        if (p.alive && m.grid.tile(Math.floor(p.x), Math.floor(p.y)) !== TILE.FLOOR) invariant++;
      if (m.suddenDeath && m.phase === "playing") sudden += 0; // compteur ci-dessous
    }
    if (m.phase !== "over") invariant += 1000;
    if (m.suddenDeath) sudden++;
    if (m.winnerId < 0) draws++;
    totalTime += m.time;
    for (const p of m.players) {
      if (p.killedBy === p.id) suicides++;
      kills += p.stats.kills;
      bombs += p.stats.bombsPlaced;
      bonuses += p.stats.bonusesPicked;
    }
  }
  console.log(
    `  ${diff.padEnd(6)} durée moy ${(totalTime / N).toFixed(0)}s · suicides/partie ${(suicides / N).toFixed(2)} · kills/partie ${(kills / N).toFixed(2)} · bombes/partie ${(bombs / N).toFixed(0)} · bonus/partie ${(bonuses / N).toFixed(1)} · mort subite ${sudden}/${N} · égalités ${draws}`,
  );
  check(invariant === 0, `${diff} : aucun bot dans un mur, toutes les parties se terminent`);
}

console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert.");
(globalThis as unknown as { process: { exit(c: number): void } }).process.exit(failures ? 1 : 0);
