/* Tests headless de la simulation : `bun tests/sim.test.ts` */
import { Match } from "../src/core/match";
import { RULES } from "../src/core/rules";
import { BOMB_KINDS } from "../src/core/bombs";
import { NO_INPUT, TILE, type Difficulty, type InputCmd } from "../src/core/types";
import { FOREST } from "../src/maps/forest";
import { MAPS } from "../src/maps";
import { TERRAIN } from "../src/core/types";
import { BotBrain } from "../src/ai/bot";
import { LOOT, LootTable } from "../src/core/loot";
import { Rng } from "../src/core/rng";
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

/** Zones de sol libre (hors murs, blocs, lave, eau) connexes, à l'intérieur de l'arène. */
function floorComponents(m: Match): Set<number>[] {
  const g = m.grid;
  const free = (x: number, y: number) => g.tile(x, y) === TILE.FLOOR && !g.isHazard(x, y);
  const seen = new Set<number>();
  const out: Set<number>[] = [];
  for (let y = 1; y < g.h - 1; y++)
    for (let x = 1; x < g.w - 1; x++) {
      const i = g.idx(x, y);
      if (!free(x, y) || seen.has(i)) continue;
      const comp = new Set([i]);
      seen.add(i);
      const q = [i];
      while (q.length) {
        const c = q.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = (c % g.w) + dx, ny = Math.floor(c / g.w) + dy, ni = g.idx(nx, ny);
          if (free(nx, ny) && !seen.has(ni)) { seen.add(ni); comp.add(ni); q.push(ni); }
        }
      }
      out.push(comp);
    }
  return out;
}

/**
 * Le joueur `id` peut-il poser sa 1re bombe dans sa zone de départ et s'en
 * protéger ? (vraie simulation : bombe posée, joueur dans la cachette, explosion)
 */
function survivesFirstBomb(seed: number, n: number, map: typeof FOREST, id: number): boolean {
  const make = () => new Match({ seed, map, modeId: "classic", players: Array.from({ length: n }, (_, i) => ({ name: "P" + i, characterId: "pip", isBot: false })) });
  const m0 = make();
  const comp = floorComponents(m0).find((c) => c.has(m0.grid.idx(Math.floor(m0.players[id].x), Math.floor(m0.players[id].y))))!;
  const w = m0.grid.w;
  for (const b of comp) {
    const m = make();
    m.phase = "playing";
    const p = m.players[id];
    const bx = b % w, by = Math.floor(b / w);
    p.x = bx + 0.5; p.y = by + 0.5;
    if (!m.tryPlaceBomb(p)) continue;
    // cachette : une case de la zone hors du souffle (portée de départ)
    const r = p.range;
    const hide = [...comp].find((c) => { const x = c % w, y = Math.floor(c / w); return !((x === bx && Math.abs(y - by) <= r) || (y === by && Math.abs(x - bx) <= r)); });
    if (hide === undefined) continue;
    p.x = (hide % w) + 0.5; p.y = Math.floor(hide / w) + 0.5;
    for (let i = 0; i < Math.round((RULES.bombFuse + RULES.fireDuration + 0.3) / DT); i++) m.step(m.players.map(() => NO_INPUT));
    if (p.alive) return true;
  }
  return false;
}

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
    // arène pleine : les seules cases vides sont les petites zones de départ (une par
    // position, 3 à 5 cases), séparées les unes des autres par des blocs
    const comps = floorComponents(m);
    const sizesOk = comps.every((c) => c.size >= 2 && c.size <= 7);
    const expected = n > 4 ? 6 : 4;
    if (seed === 1) check(comps.length === expected && sizesOk, `${n} joueurs : seules les ${expected} zones de départ sont vides, tout le reste est bloc ou pierre (${comps.map((c) => c.size).join("/")})`);
    else if (!(comps.length === expected && sizesOk)) check(false, `${n} joueurs, graine ${seed} : zones de départ (${comps.map((c) => c.size).join("/")})`);
    // cachette : pour chaque joueur, poser sa 1re bombe puis se cacher survit
    if (seed <= 3 && n === 4) {
      const ok = m.players.every((_, id) => survivesFirstBomb(m.config.seed, n, FOREST, id));
      check(ok, `graine ${seed} : la cachette du spawn protège chaque joueur de sa 1re bombe`);
    }
  }
}

console.log("Positions de départ aléatoires");
{
  const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ name: "P" + i, characterId: "pip", isBot: false }));
  const cell = (p: { x: number; y: number }) => [Math.floor(p.x), Math.floor(p.y)] as [number, number];
  const man = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  for (const map of MAPS) {
    let overlap = 0, onObstacle = 0, tooClose = 0, cantMove = 0, sharedZone = 0, notMirror = 0, checked = 0;
    const configs = new Set<string>();
    const p0cells = new Set<string>();
    const p0count = new Map<string, number>();
    const quadCount = [0, 0, 0, 0];
    for (const n of [1, 2, 3, 4, 5, 6])
      for (let seed = 1; seed <= 150; seed++) {
        const m = new Match({ seed: seed * 7919 + n, map, modeId: seed % 2 ? "chaos" : "classic", players: slots(n) });
        const g = m.grid;
        const cells = m.players.map(cell);
        checked++;
        if (new Set(cells.map((c) => c.join(","))).size !== n) overlap++;
        for (const [x, y] of cells) {
          const i = g.idx(x, y);
          if (g.tile(x, y) !== TILE.FLOOR || g.isHazard(x, y) || g.bombAt[i] >= 0 || g.fire[i] > 0 || g.terrainAt(x, y) !== TERRAIN.NONE) onObstacle++;
          // peut bouger tout de suite : au moins une case voisine libre
          // et jamais en cul-de-sac : au moins 2 cases libres autour
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !g.blocksMove(x + dx, y + dy)).length < 2) cantMove++;
        }
        // (cartes Domination à départs fixes, 5-6 joueurs : 4 cases au moins, le plan ne permet pas plus)
        const minGap = map.fixedSpawns && n > 4 ? 4 : 5;
        for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (man(cells[a], cells[b]) < minGap) tooClose++;
        // deux joueurs ne partagent jamais la même zone libre au départ
        const comps = floorComponents(m);
        // (cartes Domination à 5-6 joueurs : les zones, toujours libres, peuvent relier les départs du milieu)
        const domOnly = !!map.modes && !map.modes.some((x) => x === "classic" || x === "chaos");
        // (cartes Domination ouvertes comme l'Usine : arène dégagée, pas de zones séparées)
        if (!domOnly) for (const c of comps) if (cells.filter(([x, y]) => c.has(g.idx(x, y))).length > 1) sharedZone++;
        // équité : arène et positions symétriques (miroirs haut/bas et gauche/droite)
        const set = new Set(cells.map((c) => c.join(",")));
        if (n === 4) {
          for (const [x, y] of cells) if (!set.has(`${g.w - 1 - x},${y}`) || !set.has(`${x},${g.h - 1 - y}`)) notMirror++;
          for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.tile(x, y) !== g.tile(g.w - 1 - x, y) || g.tile(x, y) !== g.tile(x, g.h - 1 - y)) { notMirror++; y = g.h; break; }
          configs.add([...set].sort().join(" "));
          p0cells.add(cells[0].join(","));
          p0count.set(cells[0].join(","), (p0count.get(cells[0].join(",")) ?? 0) + 1);
          quadCount[m.loot.quadrant(cells[0][0], cells[0][1])]++;
        }
      }
    check(overlap === 0, `${map.name} : jamais deux joueurs sur la même case (${checked} parties, 1 à 6 joueurs)`);
    check(onObstacle === 0, `${map.name} : jamais de départ sur un mur, un bloc, une bombe, du feu, de la lave, de l'eau, de la glace ou une cheminée`);
    check(cantMove === 0, `${map.name} : chaque joueur a au moins 2 cases libres à côté de lui (pas de cul-de-sac)`);
    check(tooClose === 0, `${map.name} : au moins ${map.fixedSpawns ? "5 cases (4 à 5-6 joueurs)" : "5 cases"} entre deux joueurs`);
    check(sharedZone === 0, `${map.name} : chaque joueur commence dans sa propre zone, séparée des autres par des blocs`);
    check(notMirror === 0, `${map.name} : positions et blocs symétriques (aucun joueur avantagé)`);
    if (map.fixedSpawns) {
      // départs du plan (S) : toujours les mêmes cases, mais le joueur 1 tombe sur chacune à parts égales
      const cellsOf = (ch: string) => map.layout.flatMap((r, y) => [...r].map((c, x) => (c === ch ? `${x},${y}` : "")).filter(Boolean));
      // à 4 joueurs : les départs S, complétés par les départs « s » si le plan en a moins de 4 (Usine)
      const plan = [...cellsOf("S"), ...cellsOf("s")].slice(0, Math.max(4, cellsOf("S").length));
      const share = plan.map((k) => (p0count.get(k) ?? 0) / 150);
      check(configs.size === 1 && [...configs][0] === plan.slice().sort().join(" "), `${map.name} : départs fixes du plan (${plan.length} cases)`);
      check(share.every((s) => s > 0.15 && s < 0.35), `${map.name} : le joueur 1 n'a pas de départ favori (${share.map((s) => Math.round(s * 100) + "%").join(" ")})`);
    } else {
      check(configs.size >= 4, `${map.name} : les positions changent d'une partie à l'autre (${configs.size} dispositions différentes à 4 joueurs)`);
      check(p0cells.size >= 16, `${map.name} : le joueur 1 change de case (${p0cells.size} cases différentes)`);
      const share = quadCount.map((q) => q / 150);
      check(share.every((s) => s > 0.15 && s < 0.35), `${map.name} : le joueur 1 n'a pas de coin favori (${share.map((s) => Math.round(s * 100) + "%").join(" ")})`);
    }
  }
  // même graine = mêmes positions (serveur et téléphones calculent la même chose)
  const a = new Match({ seed: 123456, map: MAPS[2], modeId: "chaos", players: slots(4) });
  const b = new Match({ seed: 123456, map: MAPS[2], modeId: "chaos", players: slots(4) });
  check(a.players.every((p, i) => p.x === b.players[i].x && p.y === b.players[i].y), "même graine → mêmes positions (multijoueur sans désynchronisation)");
  const c = new Match({ seed: 123457, map: MAPS[2], modeId: "chaos", players: slots(4) });
  check(!a.players.every((p, i) => p.x === c.players[i].x && p.y === c.players[i].y), "graine différente → positions différentes");

  // les joueurs bougent vraiment dès le départ (vraie simulation, vrais contrôles)
  let moved = 0, total = 0;
  for (const map of MAPS)
    for (let seed = 1; seed <= 25; seed++) {
      const m = new Match({ seed, map, modeId: "classic", players: slots(4) });
      run(m, RULES.countdown + 0.05);
      const g = m.grid;
      const inputs = m.players.map((p) => {
        const [x, y] = cell(p);
        const d = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !g.blocksMove(x + dx, y + dy))!;
        return { mx: d[0], my: d[1], bomb: false, ability: false };
      });
      const before = m.players.map((p) => [p.x, p.y]);
      run(m, 0.4, () => inputs);
      m.players.forEach((p, i) => { total++; if (Math.abs(p.x - before[i][0]) + Math.abs(p.y - before[i][1]) > 0.5) moved++; });
    }
  check(moved === total, `tous les joueurs se déplacent dès le départ (${moved}/${total})`);

  // la 1re bombe ne condamne personne : sur chaque map, chaque joueur a une cachette
  let safe = 0, tries = 0;
  for (const map of MAPS)
    for (let seed = 1; seed <= 6; seed++)
      for (let id = 0; id < 4; id++) { tries++; if (survivesFirstBomb(seed * 31, 4, map, id)) safe++; }
  check(safe === tries, `chaque joueur peut poser sa 1re bombe et s'abriter (${safe}/${tries})`);

  // petites maps : tirage si possible, sinon positions fixes, jamais d'erreur ni de doublon
  const mk = (id: string, layout: string[]) => ({ id, name: id, subtitle: "", theme: "forest", layout, blockDensity: 1, spawnClear: 1, startRange: 1, available: true });
  const small = mk("small7", ["#######", "#S...S#", "#.#.#.#", "#.....#", "#.#.#.#", "#S...S#", "#######"]);
  const tiny = mk("tiny5", ["#####", "#S.S#", "#...#", "#S.S#", "#####"]);
  const odd = mk("odd", ["########", "#S.....#", "#.##.#.#", "#.....S#", "########"]);
  for (const [map, label] of [[small, "petite map 7×7"], [tiny, "mini map 5×5 (secours : positions fixes)"], [odd, "map non symétrique (secours)"]] as const)
    for (const n of [2, 3, 4, 5, 6]) {
      let ok = true;
      for (let seed = 1; seed <= 40; seed++) {
        try {
          const m = new Match({ seed, map, modeId: "classic", players: slots(n) });
          const cells = m.players.map(cell);
          if (new Set(cells.map((c) => c.join(","))).size !== n) ok = false;
          if (cells.some(([x, y]) => m.grid.blocksMove(x, y))) ok = false;
        } catch (e) {
          // seule erreur admise : la map n'a vraiment pas assez de cases libres
          if (!String(e).includes("trop petite")) ok = false;
        }
      }
      if (n === 2 || n === 4 || n === 6) check(ok, `${label}, ${n} joueurs : positions distinctes et libres, aucune boucle infinie`);
    }
  // petite map 7×7 : une seule disposition respecte la distance minimale, mais
  // les joueurs y sont répartis au hasard (le joueur 1 change de coin)
  const s7 = new Set<string>();
  for (let seed = 1; seed <= 60; seed++) s7.add(cell(new Match({ seed, map: small, modeId: "classic", players: slots(4) }).players[0]).join(","));
  check(s7.size === 4, `petite map 7×7 : le joueur 1 change de coin (${s7.size} coins différents)`);
  const t5 = new Match({ seed: 9, map: tiny, modeId: "classic", players: slots(4) }).players.map(cell).map((c) => c.join(",")).sort().join(" ");
  check(t5 === "1,1 1,3 3,1 3,3", `mini map 5×5 : secours sur les 4 positions fixes (${t5})`);
  let tooSmall = false;
  try { new Match({ seed: 1, map: mk("micro", ["####", "#S.#", "####"]), modeId: "classic", players: slots(4) }); } catch (e) { tooSmall = String(e).includes("trop petite"); }
  check(tooSmall, "map sans assez de cases : erreur claire plutôt qu'une position impossible");
}

console.log("Nouvelle map : Labyrinthe");
{
  const LAB = MAPS.find((m) => m.id === "labyrinth")!;
  check(!!LAB, "le Labyrinthe est dans la liste des maps jouables");
  check(!MAPS.some((m) => m.id === "chaos_arena"), "l'Arène Chaos a été retirée");
  const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ name: "P" + i, characterId: "pip", isBot: false }));
  // vraiment différentes : plans comparés case par case, entre elles et avec les anciennes
  // cases différentes ; une map de taille différente compte comme entièrement différente
  const diffCells = (a: string[], b: string[]) =>
    a.length !== b.length || a[0].length !== b[0].length ? a.length * a[0].length : a.reduce((n, row, y) => n + [...row].filter((c, x) => c !== b[y][x]).length, 0);
  const minOld = (m: typeof LAB) => Math.min(...MAPS.filter((o) => o !== LAB).map((o) => diffCells(m.layout, o.layout)));
  check(minOld(LAB) >= 20, `différent des 4 autres maps (au moins ${minOld(LAB)} cases différentes)`);
  const count = (m: typeof LAB, c: string) => m.layout.join("").split(c).length - 1;
  check(count(LAB, "#") > count(FOREST, "#") && count(LAB, "~") > 0, `Labyrinthe : plus de murs que la Forêt (${count(LAB, "#")} contre ${count(FOREST, "#")}) et des canaux d'eau`);

  for (const map of [LAB]) {
    const fresh = () => {
      const m = new Match({ seed: 11, map, modeId: "classic", players: slots(2) });
      m.phase = "playing";
      const g = m.grid;
      for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === TILE.BLOCK) g.tiles[i] = TILE.FLOOR;
      return m;
    };
    // collisions : on pousse le joueur contre chaque mur / gouffre voisin, il ne rentre jamais dedans
    let pushes = 0, inside = 0;
    {
      const m0 = fresh();
      const g0 = m0.grid;
      for (let y = 1; y < g0.h - 1; y++)
        for (let x = 1; x < g0.w - 1; x++) {
          if (g0.blocksMove(x, y)) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (!g0.blocksMove(x + dx, y + dy)) continue;
            const m = fresh();
            const p = m.players[0];
            p.x = x + 0.5; p.y = y + 0.5;
            m.players[1].x = 0.5; m.players[1].y = 0.5;
            run(m, 0.6, () => [{ mx: dx, my: dy, bomb: false, ability: false }, NO_INPUT]);
            pushes++;
            if (Math.floor(p.x) !== x || Math.floor(p.y) !== y || m.grid.blocksMove(Math.floor(p.x), Math.floor(p.y))) inside++;
          }
        }
    }
    check(pushes > 20 && inside === 0, `${map.name} : murs et obstacles bloquent le joueur (${pushes} poussées, ${inside} traversée)`);

    // caisses : une bombe détruit la caisse voisine ; la flamme s'arrête sur un mur
    {
      const m = new Match({ seed: 11, map, modeId: "classic", players: slots(2) });
      m.phase = "playing";
      const g = m.grid;
      let target: [number, number] | null = null;
      let from: [number, number] | null = null;
      for (let y = 1; y < g.h - 1 && !target; y++)
        for (let x = 1; x < g.w - 1 && !target; x++)
          if (g.tile(x, y) === TILE.BLOCK)
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
              if (!g.blocksMove(x + dx, y + dy) && g.tile(x + dx, y + dy) === TILE.FLOOR && !target) { target = [x, y]; from = [x + dx, y + dy]; }
      const p = m.players[0];
      p.x = from![0] + 0.5; p.y = from![1] + 0.5;
      p.shieldTime = 99;
      m.tryPlaceBomb(p);
      let destroyed = false;
      for (let i = 0; i < Math.round((RULES.bombFuse + 0.3) / DT); i++) { m.step(idle(m)); if (m.events.some((e) => e.t === "blockDestroyed" && e.x === target![0] && e.y === target![1])) destroyed = true; }
      check(destroyed && g.tile(target![0], target![1]) === TILE.FLOOR, `${map.name} : une caisse touchée par une explosion est détruite`);
    }
    {
      // flamme de portée 3 : jamais sur un mur ni au-delà ; elle survole l'eau / le vide
      const m = fresh();
      const g = m.grid;
      const p = m.players[0];
      p.range = 3;
      p.shieldTime = 99;
      let wallHit = 0, beyond = 0, overHazard = 0, bombs = 0;
      for (let y = 1; y < g.h - 1; y++)
        for (let x = 1; x < g.w - 1; x++) {
          if (g.blocksMove(x, y) || g.terrainAt(x, y) === TERRAIN.VENT) continue;
          const mm = fresh();
          const q = mm.players[0];
          q.range = 3; q.shieldTime = 99; q.x = x + 0.5; q.y = y + 0.5;
          mm.players[1].x = 0.5; mm.players[1].y = 0.5;
          if (!mm.tryPlaceBomb(q)) continue;
          bombs++;
          for (let i = 0; i < Math.round((RULES.bombFuse + 0.05) / DT); i++) mm.step(idle(mm));
          const gg = mm.grid;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let blocked = false;
            for (let k = 1; k <= 3; k++) {
              const cx = x + dx * k, cy = y + dy * k;
              const burning = gg.fire[gg.idx(cx, cy)] > 0;
              if (gg.tile(cx, cy) === TILE.WALL) { if (burning) wallHit++; blocked = true; continue; }
              if (blocked && burning) beyond++;
              if (!blocked && gg.isHazard(cx, cy) && burning) overHazard++;
            }
          }
        }
      check(bombs > 30 && wallHit === 0 && beyond === 0, `${map.name} : les explosions s'arrêtent aux murs (${bombs} bombes testées)`);
      check(overHazard > 0, `${map.name} : les flammes passent au-dessus de l'eau, comme sur les autres maps`);
    }

    // loots : uniquement sur des cases praticables ; parties complètes avec bots, dans les 2 modes
    for (const modeId of ["classic", "chaos"]) {
      let badLoot = 0, loots = 0, ended = 0, stuck = 0, chaosEvents = 0, chaosEarly = 0, badZone = 0, moved = 0;
      const N = 12;
      for (let sd = 1; sd <= N; sd++) {
        const m = new Match({ seed: sd * 53 + 7, map, modeId, players: Array.from({ length: 4 }, (_, i) => ({ name: "B" + i, characterId: "renard", isBot: true, difficulty: "normal" as Difficulty })) });
        const brains = m.players.map((p) => new BotBrain(p.id, "normal", sd));
        const start = m.players.map((p) => [p.x, p.y]);
        let guard = 0;
        while (m.phase !== "over" && guard++ < 60 * 200) {
          m.step(brains.map((b) => b.update(m, DT)));
          for (const e of m.events) {
            if (e.t === "bonusSpawn") { loots++; if (m.grid.blocksMove(e.x, e.y) || m.grid.tile(e.x, e.y) !== TILE.FLOOR) badLoot++; }
            if (e.t === "chaosWarn" || e.t === "chaosStart") { chaosEvents++; if (m.time < 14.9) chaosEarly++; }
          }
          // (les flammes survolent l'eau et le vide comme pour les bombes : seul un mur est interdit)
          // (pendant la mort subite, un mur peut tomber sur une case déjà annoncée : le feu l'ignore)
          if (m.chaos?.pending && !m.suddenDeath) for (const i of m.chaos.pending.zone) if (m.grid.tiles[i] === TILE.WALL) badZone++;
          for (const p of m.players) if (p.alive && m.grid.blocksMove(Math.floor(p.x), Math.floor(p.y))) stuck++;
          if (m.time > 4 && m.time < 4 + DT * 1.5) m.players.forEach((p, i) => { if (Math.abs(p.x - start[i][0]) + Math.abs(p.y - start[i][1]) > 0.5) moved++; });
        }
        if (m.phase === "over") ended++;
      }
      check(ended === N && stuck === 0, `${map.name} ${modeId} : ${N} parties de bots terminées, aucun joueur dans un mur ou un gouffre`);
      check(moved >= N * 3, `${map.name} ${modeId} : les bots se déplacent dès le début (${moved}/${N * 4} ont bougé en 4 s)`);
      check(loots > 0 && badLoot === 0, `${map.name} ${modeId} : ${loots} bonus apparus, tous sur des cases libres`);
      if (modeId === "classic") check(chaosEvents === 0, `${map.name} classique : aucun malus CHAOS`);
      else check(chaosEvents > N && chaosEarly === 0 && badZone === 0, `${map.name} CHAOS : ${chaosEvents} malus, aucun avant 15 s, zones annoncées jamais sur un mur`);
    }
  }
}

console.log("Domination 2 contre 2");
{
  const { HILL_RULES } = await import("../src/core/hill");
  const { FACTORY } = await import("../src/maps/factory");
  const slots4 = () => Array.from({ length: 4 }, (_, i) => ({ name: "P" + i, characterId: "pip", isBot: false, difficulty: "normal" as Difficulty }));
  const mk = () => {
    const m = new Match({ seed: 21, map: FACTORY, modeId: "koth", players: slots4() });
    m.phase = "playing";
    m.hill!.moveIn = 1e9;
    return m;
  };
  {
    const m = mk();
    const cx = (m.grid.w - 1) / 2;
    const side = m.players.map((p) => (p.x < cx ? 0 : 1));
    check(JSON.stringify(m.teams) === "[0,1,0,1]" && side.join() === "0,1,0,1", `équipes : 0 et 2 rouges (à gauche), 1 et 3 bleus (à droite) ${JSON.stringify(m.players.map((p) => [Math.floor(p.x), Math.floor(p.y)]))}`);
    check(m.players.every((p) => !m.grid.blocksMove(Math.floor(p.x), Math.floor(p.y))), "départs d'équipe sur des cases libres");
    check(m.hill!.scores.length === 2, "un score par équipe");
  }
  {
    // deux coéquipiers ensemble sur la zone : l'équipe marque
    const m = mk();
    const [x, y] = m.hill!.center;
    place(m, 0, x, y); place(m, 2, x, y); place(m, 1, 1, 1); place(m, 3, m.grid.w - 2, 1);
    run(m, 5);
    check(!m.hill!.contested && m.hill!.teamPoints(0) >= 4 && m.hill!.teamPoints(1) === 0 && m.hill!.points(2) === m.hill!.points(0), `coéquipiers ensemble sur la zone : l'équipe marque (${m.hill!.teamPoints(0)} en 5 s)`);
    // un adversaire arrive : zone disputée
    const before = m.hill!.teamPoints(0);
    place(m, 1, x, y);
    run(m, 2);
    check(m.hill!.contested && m.hill!.teamPoints(0) === before && m.hill!.teamPoints(1) === 0, "un adversaire sur la zone : disputée, personne ne marque");
  }
  {
    // pas de tir ami : la bombe d'un coéquipier ne tue pas
    const m = mk();
    place(m, 0, 2, 4); place(m, 2, 3, 4); place(m, 1, 12, 9); place(m, 3, 12, 10);
    m.players[2].maxBombs = 1;
    run(m, 0.1, (mm) => mm.players.map((p) => ({ mx: 0, my: 0, bomb: p.id === 2, ability: false })));
    run(m, 4);
    check(m.players[0].alive, "tir ami désactivé : la bombe d'un coéquipier ne blesse pas");
    // mais sa propre bombe reste dangereuse
    const m2 = mk();
    place(m2, 0, 2, 4); place(m2, 1, 12, 9); place(m2, 2, 12, 1); place(m2, 3, 12, 10);
    run(m2, 0.1, (mm) => mm.players.map((p) => ({ mx: 0, my: 0, bomb: p.id === 0, ability: false })));
    run(m2, 4);
    check(!m2.players[0].alive || m2.hill!.respawnIn[0] > 0 || m2.players[0].deathTime >= 0, "sa propre bombe reste dangereuse");
    // et la bombe d'un adversaire tue
    const m3 = mk();
    place(m3, 0, 2, 4); place(m3, 1, 3, 4); place(m3, 2, 12, 1); place(m3, 3, 12, 10);
    run(m3, 0.1, (mm) => mm.players.map((p) => ({ mx: 0, my: 0, bomb: p.id === 1, ability: false })));
    run(m3, 4);
    check(m3.players[0].deathTime >= 0 && m3.players[1].stats.kills >= 1, "la bombe d'un adversaire tue");
  }
  {
    // victoire d'équipe
    const m = mk();
    const [x, y] = m.hill!.center;
    place(m, 2, x, y); place(m, 0, 1, 1); place(m, 1, 1, 9); place(m, 3, m.grid.w - 2, 1);
    m.hill!.scores[1] = 10;
    run(m, HILL_RULES.target + RULES.endDelay + 1);
    const st = m.standings();
    const pl = (id: number) => st.find((r) => r.id === id)!.place;
    check(m.isOver && m.winnerId >= 0 && m.teamOf(m.winnerId) === 0 && pl(0) === 1 && pl(2) === 1 && pl(1) === 3 && pl(3) === 3, "victoire d'équipe : les deux rouges 1ers, les deux bleus 3es");
  }
  {
    // réapparition de son côté
    let home = 0, total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const m = new Match({ seed, map: FACTORY, modeId: "koth", players: slots4() });
      m.phase = "playing";
      for (const id of [0, 1]) {
        m.kill(m.players[id], -1);
      }
      run(m, HILL_RULES.respawnDelay + 0.3);
      for (const id of [0, 1]) {
        total++;
        const p = m.players[id];
        if (p.alive && (m.teamOf(id) === 0 ? p.x < m.grid.w / 2 : p.x > m.grid.w / 2)) home++;
      }
    }
    check(home === total, `réapparition du côté de son équipe (${home}/${total})`);
  }
}

console.log("Domination 2 contre 2 : bombes (Usine)");
{
  const { FACTORY } = await import("../src/maps/factory");
  const { FOREST: FO } = await import("../src/maps/forest");
  const slots4 = () => Array.from({ length: 4 }, (_, i) => ({ name: "P" + i, characterId: "pip", isBot: false, difficulty: "normal" as Difficulty }));
  const mk = () => {
    const m = new Match({ seed: 31, map: FACTORY, modeId: "koth", players: slots4() });
    m.phase = "playing";
    m.hill!.moveIn = 1e9;
    // joueurs rangés loin de la zone de test
    place(m, 0, 1, 1); place(m, 1, 13, 1); place(m, 2, 1, 11); place(m, 3, 13, 11);
    return m;
  };
  const bombBy = (m: Match, id: number) => run(m, DT, (mm) => mm.players.map((p) => ({ mx: 0, my: 0, bomb: p.id === id, ability: false })));
  {
    const m = mk();
    const r = m.bombRules;
    check(r.fuse === 2.5 && r.startRange === 2 && r.startBombs === 1 && Math.abs(r.fireDuration - 0.4) < 1e-9 && r.cooldown > 0, `réglages Domination : mèche ${r.fuse} s, portée ${r.startRange}, ${r.startBombs} bombe, explosion ${r.fireDuration} s, délai ${r.cooldown} s`);
    check(m.players.every((p) => p.range === 2 && p.maxBombs === 1), "chaque joueur commence avec portée 2 et 1 bombe");
    const c = new Match({ seed: 31, map: FO, modeId: "classic", players: slots4() });
    check(c.bombRules.fuse === RULES.bombFuse && c.bombRules.startRange === RULES.startRange && c.bombRules.fireDuration === RULES.fireDuration && c.bombRules.cooldown === 0, "Classique inchangé (mèche, portée, explosion, pas de délai)");
  }
  {
    // délai avant explosion et portée : la bombe explose à 2,5 s, le feu va à 2 cases, pas 3
    const m = mk();
    place(m, 0, 4, 6); // ligne y=6 : couloir libre vers la droite (5, 6, 7=zone)
    bombBy(m, 0);
    place(m, 0, 1, 1);
    const g = m.grid;
    let at = -1;
    for (let k = 0; k < Math.round(3 / DT) && at < 0; k++) {
      m.step(idle(m));
      if (m.events.some((e) => e.t === "explode")) at = m.time;
    }
    const t0 = m.time - at;
    check(Math.abs(at - (m.time - t0) ) < 1 && at > 0, "la bombe explose");
    const fire = (x: number, y: number) => g.fire[g.idx(x, y)] > 0;
    check(fire(4, 6) && fire(5, 6) && fire(6, 6) && !fire(7, 6), "portée 2 : le feu touche 2 cases et pas la 3e");
    // durée visuelle de l'explosion ~0,4 s
    let dur = 0;
    while (fire(5, 6) && dur < 2) { m.step(idle(m)); dur += DT; }
    check(dur > 0.3 && dur < 0.45, `explosion visible ~0,4 s (${dur.toFixed(2)} s)`);
  }
  {
    // mèche : rien avant 2,4 s, explosion avant 2,6 s
    const m = mk();
    place(m, 0, 4, 6);
    bombBy(m, 0);
    place(m, 0, 1, 1);
    let when = -1;
    const start = m.time;
    for (let k = 0; k < Math.round(3 / DT) && when < 0; k++) {
      m.step(idle(m));
      if (m.events.some((e) => e.t === "explode")) when = m.time - start;
    }
    check(when > 2.4 && when < 2.6, `délai avant explosion ≈ 2,5 s (${when.toFixed(2)} s)`);
  }
  {
    // mur indestructible : le feu s'arrête ; caisse : détruite
    const m = mk();
    const g = m.grid;
    // (3,5) est un bloc gris du plan, (2,3) une caisse
    check(g.tile(3, 5) === TILE.WALL && g.tile(2, 3) === TILE.BLOCK, "plan : mur en (3,5), caisse en (2,3)");
    place(m, 0, 2, 5); // à gauche du mur (3,5) ; au-dessus : (2,4) puis la caisse (2,3)
    bombBy(m, 0);
    place(m, 0, 1, 11);
    run(m, 2.55);
    check(g.fire[g.idx(4, 5)] <= 0 && g.tile(3, 5) === TILE.WALL, "le feu ne traverse pas un mur indestructible");
    check(g.tile(2, 3) === TILE.FLOOR, "la caisse touchée est détruite");
    check(g.fire[g.idx(2, 2)] <= 0, "le feu s'arrête sur la caisse détruite (pas au-delà)");
  }
  {
    // pas de bombe dans un mur / un obstacle ; une seule bombe ; délai entre deux poses
    const m = mk();
    const p = m.players[0];
    place(m, 0, 2, 3); // sur une caisse (cas impossible en jeu) : refus
    check(!m.tryPlaceBomb(p) && m.bombs.size === 0, "impossible de poser une bombe sur une caisse ou un mur");
    place(m, 0, 4, 6);
    check(m.tryPlaceBomb(p), "pose sur une case libre");
    place(m, 0, 5, 6);
    check(!m.tryPlaceBomb(p), "1 bombe à la fois au départ");
    p.maxBombs = 2;
    check(!m.tryPlaceBomb(p), `délai entre deux poses (${m.bombRules.cooldown} s)`);
    run(m, m.bombRules.cooldown + DT);
    check(m.tryPlaceBomb(p) && m.bombs.size === 2, "après le délai, la 2e bombe se pose");
  }
  {
    // réaction en chaîne : une explosion déclenche la bombe voisine
    const m = mk();
    const p1 = m.players[1];
    place(m, 1, 4, 6);
    m.tryPlaceBomb(p1);
    place(m, 0, 6, 6);
    run(m, 1.0);
    m.tryPlaceBomb(m.players[0]);
    place(m, 0, 1, 11); place(m, 1, 13, 11);
    let both = 0;
    for (let k = 0; k < Math.round(2 / DT); k++) {
      m.step(idle(m));
      const ex = m.events.filter((e) => e.t === "explode").length;
      if (ex) { both = ex; break; }
    }
    check(both === 2 && m.bombs.size === 0, "réaction en chaîne : la 1re explosion fait sauter la bombe à portée");
  }
  {
    // un joueur touché ne meurt qu'une fois par explosion (pas de dégâts multiples)
    const m = mk();
    place(m, 1, 4, 6);
    m.tryPlaceBomb(m.players[1]);
    place(m, 1, 13, 11);
    place(m, 0, 5, 6); // adversaire dans le souffle, immobile
    let deaths = 0;
    for (let k = 0; k < Math.round(3.2 / DT); k++) {
      m.step(idle(m));
      deaths += m.events.filter((e) => e.t === "playerDied" && e.player === 0).length;
    }
    check(deaths === 1 && m.players[1].stats.kills === 1, `touché une seule fois par la même explosion (${deaths} mort)`);
  }
  {
    // décor de l'usine : les grilles au sol et les repères peints ne bloquent pas
    const m = mk();
    const g = m.grid;
    const free = [[7, 2], [7, 10], [1, 5], [1, 7], [13, 5], [13, 7], [7, 6]];
    check(free.every(([x, y]) => !g.blocksMove(x, y)), "grilles au sol, repères et étoile : praticables");
  }
}

console.log("Domination : zone qui se déplace");
{
  const { HILL_RULES } = await import("../src/core/hill");
  const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ name: "P" + i, characterId: "pip", isBot: false, difficulty: "normal" as Difficulty }));
  for (const map of MAPS) {
    const m = new Match({ seed: 5, map, modeId: "koth", players: slots(4) });
    const g = m.grid;
    const h = m.hill!;
    // emplacements praticables et disposés en miroir (équité)
    const okSites = h.sites.every((st) => st.cells.length === 1 && st.cells.every((i) => g.tiles[i] !== TILE.WALL && !g.isHazard(i % g.w, Math.floor(i / g.w))));
    const centers = new Set(h.sites.map((st) => st.center.join(",")));
    const mirrored = h.sites.every((st) => centers.has(`${g.w - 1 - st.center[0]},${st.center[1]}`) && centers.has(`${st.center[0]},${g.h - 1 - st.center[1]}`));
    const centerOnly = h.sites.length === 1 && h.sites[0].center[0] === (g.w - 1) / 2 && h.sites[0].center[1] === (g.h - 1) / 2;
    check((h.sites.length >= 3 || centerOnly) && okSites && mirrored, `${map.name} : ${h.sites.length} emplacements de zone, praticables, en miroir`);
  }
  {
    const m = new Match({ seed: 6, map: FOREST, modeId: "koth", players: slots(2) });
    m.phase = "playing";
    const h = m.hill!;
    const first = h.site;
    let warnAt = -1, movedAt = -1;
    const t0 = m.time;
    for (let k = 0; k < Math.round((HILL_RULES.moveEvery + 1) / DT); k++) {
      m.step(idle(m));
      for (const e of m.events) {
        if (e.t === "hillWarn" && warnAt < 0) warnAt = m.time - t0;
        if (e.t === "hillMoved" && movedAt < 0) movedAt = m.time - t0;
      }
      if (warnAt >= 0 && movedAt < 0 && h.next >= 0) {
        // la prochaine zone est déjà dégagée des blocs
        if (h.nextCells.some((i) => m.grid.tiles[i] === TILE.BLOCK)) warnAt = -99;
      }
    }
    check(warnAt > 0 && Math.abs(warnAt - (HILL_RULES.moveEvery - HILL_RULES.moveWarn)) < 0.2, `annonce ${HILL_RULES.moveWarn} s avant (à ${warnAt.toFixed(1)} s), nouvelle zone dégagée`);
    check(movedAt > 0 && Math.abs(movedAt - HILL_RULES.moveEvery) < 0.2 && h.site !== first && h.next === -1, `la zone change de place après ${HILL_RULES.moveEvery} s (à ${movedAt.toFixed(1)} s)`);
  }
}

console.log("Mode Roi de la colline");
{
  const { HILL_RULES } = await import("../src/core/hill");
  const slots = (n: number, bot = false) => Array.from({ length: n }, (_, i) => ({ name: "P" + i, characterId: "pip", isBot: bot, difficulty: "normal" as Difficulty }));
  // colline valide sur chaque carte : praticable, dégagée, symétrique
  for (const map of MAPS) {
    const m = new Match({ seed: 9, map, modeId: "koth", players: slots(4) });
    const g = m.grid;
    const h = m.hill!;
    const cells = h.cells.map((i) => [i % g.w, Math.floor(i / g.w)] as [number, number]);
    const okCells = cells.every(([x, y]) => g.tile(x, y) === TILE.FLOOR && !g.isHazard(x, y));
    // zone d'une case : symétrique si elle est au milieu ; sinon (milieu inaccessible) les emplacements sont en miroir (testé plus haut)
    const mid = cells.every(([x, y]) => x === g.w - 1 - x && y === g.h - 1 - y);
    const sym = mid || !h.sites.some((st) => st.center[0] === (g.w - 1) / 2 && st.center[1] === (g.h - 1) / 2);
    check(cells.length === 1 && okCells && sym, `${map.name} : colline de ${cells.length} case, praticables, sans bloc, symétrique`);
  }
  const fresh = () => {
    const m = new Match({ seed: 4, map: FOREST, modeId: "koth", players: slots(3) });
    m.phase = "playing";
    const g = m.grid;
    for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === TILE.BLOCK) g.tiles[i] = TILE.FLOOR;
    return m;
  };
  const hc = (m: Match, k = 0) => { const i = m.hill!.cells[k]; return [i % m.grid.w, Math.floor(i / m.grid.w)]; };
  {
    const m = fresh();
    const [x, y] = hc(m);
    place(m, 0, x, y); place(m, 1, 1, 1); place(m, 2, 11, 9);
    run(m, 5);
    const pts = m.hill!.points(0);
    check(pts >= 4 && pts <= 5 && m.hill!.points(1) === 0, `seul sur la colline : 1 point par seconde (${pts} en 5 s)`);
    place(m, 1, x, y);
    run(m, 3);
    check(m.hill!.points(0) === pts && m.hill!.points(1) === 0 && m.hill!.contested, "à deux sur la colline : disputée, personne ne marque");
  }
  {
    const m = fresh();
    place(m, 1, 1, 1); place(m, 2, 11, 9);
    m.players[0].maxBombs = 5; m.players[0].range = 4;
    m.kill(m.players[0], 1);
    run(m, HILL_RULES.respawnDelay - 0.2);
    check(!m.players[0].alive, `éliminé : absent pendant ${HILL_RULES.respawnDelay} s`);
    run(m, 0.4);
    const p = m.players[0];
    const [cx, cy] = m.hill!.center;
    const far = Math.abs(Math.floor(p.x) - cx) + Math.abs(Math.floor(p.y) - cy) >= HILL_RULES.respawnHillGap;
    check(p.alive && p.shieldTime > 1.5 && p.maxBombs === m.bombRules.startBombs && p.range === m.bombRules.startRange && far && m.grid.fire[m.grid.idx(Math.floor(p.x), Math.floor(p.y))] <= 0,
      "réapparition : protégé par un bouclier, pouvoirs de départ, loin de la colline, sur une case sûre");
    check(m.players[1].stats.kills === 1, "l'élimination compte bien pour le tueur");
  }
  {
    const m = fresh();
    const [x, y] = hc(m);
    place(m, 0, x, y); place(m, 1, 1, 1); place(m, 2, 11, 9);
    m.hill!.scores[1] = 10;
    m.hill!.moveIn = 1e9; // zone fixe pour ce test (le déplacement est testé à part)
    run(m, HILL_RULES.target + RULES.endDelay + 1);
    const st = m.standings();
    check(m.isOver && m.winnerId === 0 && m.hill!.points(0) === HILL_RULES.target, `premier à ${HILL_RULES.target} points : victoire et fin de partie`);
    // équipes (3 joueurs : 0 et 2 rouges, 1 bleu) : les deux rouges 1ers ex aequo, le bleu 3e
    const pl = (id: number) => st.find((r) => r.id === id)!.place;
    check(pl(0) === 1 && pl(2) === 1 && pl(1) === 3, "classement par équipe (équipe gagnante 1re ex aequo)");
  }
  {
    // au temps : meilleur score ; égalité = match nul
    const m = fresh();
    place(m, 0, 1, 1); place(m, 1, 11, 1); place(m, 2, 11, 9);
    m.hill!.scores[0] = 7; m.hill!.scores[1] = 7;
    m.time = RULES.matchDuration - 0.1;
    run(m, RULES.endDelay + 0.5);
    check(m.isOver && m.winnerId === -1 && m.standings().filter((r) => r.place === 1).length === 3, "fin du temps à égalité de points entre équipes : match nul, tous ex aequo");
  }
  {
    // pas de mort subite dans ce mode, les autres modes inchangés
    let sd = false;
    const m = new Match({ seed: 2, map: FOREST, modeId: "koth", players: slots(2) });
    m.phase = "playing"; m.time = RULES.matchDuration - RULES.suddenDeathAt + 5;
    for (const p of m.players) p.shieldTime = 999;
    run(m, 10);
    sd = m.suddenDeath || m.pendingDrops.length > 0;
    const c = new Match({ seed: 2, map: FOREST, modeId: "classic", players: slots(2) });
    check(!sd && c.hill === null && new Match({ seed: 2, map: FOREST, modeId: "chaos", players: slots(2) }).hill === null, "pas de mort subite en Roi de la colline ; Classique et Chaos sans colline");
  }
  // parties complètes de bots : se terminent, la colline rapporte des points
  for (const map of MAPS.filter((mm) => mm.modes?.includes("koth"))) { // cartes où Domination se joue vraiment
    let ended = 0, scored = 0, stuck = 0, respawns = 0;
    const N = 8;
    for (let sd = 1; sd <= N; sd++) {
      const m = new Match({ seed: sd * 211, map, modeId: "koth", players: slots(4, true) });
      const brains = m.players.map((p) => new BotBrain(p.id, (["easy", "normal", "hard", "expert"] as Difficulty[])[sd % 4], sd));
      let guard = 0;
      while (m.phase !== "over" && guard++ < 60 * 200) {
        m.step(brains.map((b) => b.update(m, DT)));
        for (const e of m.events) if (e.t === "respawn") respawns++;
        for (const p of m.players) if (p.alive && m.grid.blocksMove(Math.floor(p.x), Math.floor(p.y))) stuck++;
      }
      if (m.isOver) ended++;
      if (Math.max(...m.hill!.scores) >= 5) scored++;
    }
    check(ended === N && stuck === 0 && scored >= N - 1 && respawns > 0, `${map.name} : ${N} parties de bots terminées, la colline est jouée (${scored}/${N} avec 5 points ou plus), ${respawns} réapparitions`);
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

console.log("Butin aléatoire (core/loot.ts)");
{
  // parties entre bots : bonus jamais superposés, jamais dans un mur/bloc/bombe, quotas respectés
  let bad = 0, total = 0, maxBoard = 0;
  const firstSeq: string[] = [];
  const typeTotals: Record<string, number> = {};
  const quadSpread: number[] = [];
  for (let sd = 1; sd <= 24; sd++) {
    const m = new Match({ seed: sd * 7919, map: MAPS[sd % 4], modeId: "classic", players: Array.from({ length: 4 }, (_, i) => ({ name: "B" + i, characterId: "renard", isBot: true, difficulty: "normal" as Difficulty })) });
    const brains = m.players.map((p) => new BotBrain(p.id, "normal", sd));
    const seq: string[] = [];
    let guard = 0;
    while (m.phase !== "over" && guard++ < 60 * 200) {
      m.step(brains.map((b) => b.update(m, DT)));
      for (const e of m.events) if (e.t === "bonusSpawn") {
        seq.push(e.type);
        total++;
        const g = m.grid;
        if (g.tile(e.x, e.y) !== TILE.FLOOR) bad++;
      }
      const cells = new Set<number>();
      for (const b of m.bonuses.values()) {
        const i = m.grid.idx(b.tx, b.ty);
        if (cells.has(i) || m.grid.bombAt[i] >= 0) bad++;
        cells.add(i);
      }
      maxBoard = Math.max(maxBoard, m.bonuses.size);
    }
    for (const [k, v] of Object.entries(m.loot.perType)) {
      typeTotals[k] = (typeTotals[k] ?? 0) + v;
      if (v > (LOOT.maxPerMatch[k] ?? Infinity)) bad++;
    }
    quadSpread.push(Math.max(...m.loot.perQuadrant) - Math.min(...m.loot.perQuadrant));
    firstSeq.push(seq.slice(0, 4).join("-"));
  }
  check(bad === 0, `${total} bonus apparus sur 24 parties : jamais superposés, ni dans un mur, un bloc ou une bombe, quotas respectés`);
  check(maxBoard <= LOOT.maxOnBoard, `au plus ${LOOT.maxOnBoard} bonus visibles en même temps (max observé ${maxBoard})`);
  check(new Set(firstSeq).size >= 18, `ordre différent d'une partie à l'autre (${new Set(firstSeq).size}/24 débuts différents)`);
  check(Object.keys(typeTotals).length === 4, `les 4 bonus apparaissent : ${Object.entries(typeTotals).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  check(Math.max(...quadSpread) <= 12, `équilibre entre les coins (écart max ${Math.max(...quadSpread)})`);
  // tirages bruts : proportions conformes aux poids
  const t = new LootTable(13, 11, [[1, 1], [11, 9]], { ...LOOT, maxPerMatch: {}, maxOnBoard: 1e9, quadrantLead: 1e9 });
  const rng = new Rng(42);
  const n: Record<string, number> = {};
  let drops = 0;
  for (let i = 0; i < 20000; i++) {
    const r = t.roll(rng, 3, 3, 0);
    if (r) {
      n[r] = (n[r] ?? 0) + 1;
      drops++;
    }
  }
  const tw = Object.values(LOOT.weights).reduce((a, b) => a + b, 0);
  check(Math.abs(drops / 20000 - LOOT.dropChance) < 0.015, `taux de bonus par bloc ≈ ${Math.round(LOOT.dropChance * 100)} % (${Math.round((drops / 20000) * 100)} %)`);
  check(Object.entries(LOOT.weights).every(([k, w]) => Math.abs((n[k] ?? 0) / drops - w / tw) < 0.02), "répartition conforme aux poids configurés");
  // 2 joueurs : les coins vides ne bloquent pas le butin des joueurs
  const duo = new LootTable(13, 11, [[1, 1], [11, 9]]);
  const r2 = new Rng(3);
  let got = 0;
  for (let i = 0; i < 60; i++) if (duo.roll(r2, 2, 2, 0)) got++;
  check(got <= LOOT.quadrantLead, `duo : un joueur qui casse tout dans son coin est limité tant que l'autre n'a rien (${got})`);
  for (let i = 0; i < 60; i++) duo.roll(r2, 10, 8, 0);
  let got2 = 0;
  for (let i = 0; i < 60; i++) if (duo.roll(r2, 2, 2, 0)) got2++;
  check(got2 > 0, "… puis il reprend quand l'autre joueur a aussi reçu ses bonus");
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
    check(seen.length >= 3, `des malus arrivent régulièrement (${seen.length} en 70 s : ${seen.join(", ")})`);
    check(m.chaos!.count >= 10, `≈ un malus toutes les 5 s après 15 s (${m.chaos!.count} déclenchés)`);
    check(warned >= 1, "les malus dangereux sont précédés d'une alerte");
    check(seen.every((id) => !["overload", "shields", "speedChaos"].includes(id)), "uniquement des malus (plus de bonus dans la rotation)");
  }
  {
    // chronologie exacte : rien avant 15 s, puis 15, 20, 25, 30 s
    const m = mk();
    const at: number[] = [];
    for (let i = 0; i < 60 * 31; i++) {
      for (const p of m.players) p.shieldTime = 99;
      m.step(idle(m));
      for (const e of m.events) if (e.t === "chaosStart" || e.t === "chaosWarn" || e.t === "chaosSkip") at.push(Math.round(m.time * 100) / 100);
    }
    const slots = [...new Set(at.filter((t) => Math.abs(t - Math.round(t / 5) * 5) < 0.05).map((t) => Math.round(t)))];
    check(at.every((t) => t >= 15 - 1e-6) && slots.join() === "15,20,25,30", `malus à 15, 20, 25, 30 s (${slots.join(", ")}) — rien avant 15 s`);
    // jamais deux dangers en même temps
    let both = 0;
    const m2 = mk();
    for (let i = 0; i < 60 * 90; i++) {
      for (const p of m2.players) p.shieldTime = 99;
      m2.step(idle(m2));
      const dangers = (m2.chaos!.pending ? 1 : 0) + m2.chaos!.active.filter((r) => r.def.danger).length;
      if (dangers > 1) both++;
      if (m2.chaos!.active.length + (m2.chaos!.pending ? 1 : 0) > 3) both++;
    }
    check(both === 0, "jamais deux malus dangereux à la fois, 3 effets maximum");
  }
  {
    // pause : le temps de jeu (et donc les malus) s'arrête si la simulation n'avance pas
    const m = mk();
    for (let i = 0; i < 60 * 14; i++) m.step(idle(m));
    const t = m.time;
    check(m.chaos!.count === 0 && Math.abs(t - 14) < 0.05, "à 14 s : aucun malus");
  }
  {
    const m = mk();
    m.chaos!.trigger("fog");
    run(m, DT);
    check(m.fog, "Brouillard actif");
    run(m, 6.1);
    check(!m.fog, "puis la visibilité revient");
    m.chaos!.trigger("slow");
    run(m, DT);
    check(m.speedMul < 1, "Ralentissement : tout le monde avance moins vite");
    run(m, 5.1);
    check(m.speedMul === 1, "… puis la vitesse revient");
    m.chaos!.trigger("overheat");
    run(m, DT);
    const p0 = m.players[0];
    const r0 = p0.range;
    m.tryPlaceBomb(p0);
    const b = [...m.bombs.values()].find((x) => x.ownerId === 0)!;
    check(!!b && b.range === r0 + 1 && b.fuse < 1.4, `Surchauffe : bombe portée +1 et mèche plus courte (${b?.fuse.toFixed(2)} s)`);
    m.chaos!.trigger("zone");
    const z = m.chaos!.pending!.zone.slice();
    check(z.length >= 4 && z.length <= 0.2 * 99 + 1, `Zone interdite : ${z.length} cases annoncées`);
    run(m, 2.4);
    check(z.every((i) => m.grid.fire[i] === 0), "Zone interdite : rien ne brûle pendant l'alerte");
    run(m, 0.2);
    check(z.every((i) => m.grid.tiles[i] === TILE.BLOCK || m.grid.fire[i] > 0), "… puis la zone brûle");
  }
  {
    // le mode Classique n'a aucun malus
    const m = new Match({ seed: 9, map: FOREST, modeId: "classic", players: [0, 1].map((i) => ({ name: "P" + i, characterId: "renard", isBot: false })) });
    m.phase = "playing";
    for (let i = 0; i < 60 * 40; i++) {
      for (const p of m.players) p.shieldTime = 99;
      m.step(idle(m));
    }
    check(!m.chaos && !m.fog && m.speedMul === 1, "mode Classique : aucun malus");
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
    check(z.length > 0 && z.every((i) => m.grid.fire[i] > 0), "Sol instable : les cases annoncées brûlent");
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

console.log("Mèche courte (bombs.ts)");
{
  check(BOMB_KINDS.standard.fuse === RULES.bombFuse && RULES.bombFuse <= 1.5 && RULES.bombFuse >= 1.2, `délai avant explosion : ${RULES.bombFuse} s (avant : 2 s)`);
  check(RULES.bombWarn > 0.3 && RULES.bombWarn < RULES.bombFuse, `alerte visuelle pendant les ${RULES.bombWarn} dernières secondes`);
  const m = emptyMatch(2);
  place(m, 0, 3, 3);
  place(m, 1, 11, 9);
  m.tryPlaceBomb(m.players[0]);
  run(m, RULES.bombFuse - 0.1);
  check(m.bombs.size === 1, "pas d'explosion avant la fin de la mèche");
  run(m, 0.15);
  check(m.bombs.size === 0 && m.players[0].alive === false, "explosion à l'heure, le poseur resté dessus est touché");
  // on a le temps de fuir : poser puis s'écarter d'une case et tourner
  const e = emptyMatch(2);
  place(e, 0, 3, 3);
  place(e, 1, 11, 9);
  e.tryPlaceBomb(e.players[0]);
  let t = 0;
  for (; t < RULES.bombFuse + 0.7; t += DT) {
    const sx = Math.floor(e.players[0].x), sy = Math.floor(e.players[0].y);
    const inp = e.players.map(() => NO_INPUT);
    void sy;
    // portée 2 : deux cases à droite puis une vers le bas (derrière un pilier)
    inp[0] = sx < 5 || e.players[0].x < 5.4 ? { mx: 1, my: 0, bomb: false, ability: false } : e.players[0].y < 4.5 ? { mx: 0, my: 1, bomb: false, ability: false } : NO_INPUT;
    e.step(inp);
  }
  check(e.players[0].alive && e.bombs.size === 0, `portée 2 : poser, 2 cases à droite puis 1 en bas → on s'en sort (vitesse de base)`);
  const c = emptyMatch(2);
  place(c, 0, 3, 3);
  place(c, 1, 11, 9);
  c.tryPlaceBomb(c.players[0]);
  run(c, 0.6);
  place(c, 0, 5, 3);
  c.players[0].maxBombs = 2;
  c.tryPlaceBomb(c.players[0]);
  place(c, 0, 9, 9);
  run(c, RULES.bombFuse - 0.6 + 0.05);
  check(c.bombs.size === 0, "réaction en chaîne : la 2e bombe saute avec la 1re");
  const cells = c.blastCells(3, 3, 2);
  check(cells.length === 9 || cells.length > 0, `zone d'alerte calculée (${cells.length} cases)`);
}

console.log("Classement réel");
{
  const m = emptyMatch(4);
  m.players.forEach((p, i) => place(m, i, 3 + i * 2, 3));
  m.time = 10;
  m.kill(m.players[2], -1);
  m.time = 20;
  m.kill(m.players[0], 1);
  let st = m.standings();
  const of = (id: number) => st.find((x) => x.id === id)!;
  check(of(0).place === 3 && of(2).place === 4 && of(0).decided && !of(1).decided, "en cours : 1er mort = 4e, 2e mort = 3e, les vivants restent à départager");
  m.time = 30;
  m.kill(m.players[1], -1);
  for (let i = 0; i < 200 && m.phase !== "over"; i++) m.step(idle(m));
  st = m.standings();
  check(m.phase === "over" && m.winnerId === 3 && of(3).place === 1 && of(1).place === 2 && m.players[1].place === 2, "fin : survivant 1er, dernier mort 2e");
  const d = emptyMatch(4);
  d.time = 5;
  d.kill(d.players[0], -1);
  d.time = 9;
  d.kill(d.players[1], -1);
  d.kill(d.players[2], -1);
  const ds = d.standings();
  const dof = (id: number) => ds.find((x) => x.id === id)!;
  check(dof(1).place === 2 && dof(2).place === 2 && dof(0).place === 4 && dof(3).place === 1, "morts au même instant : ex aequo (meilleure place partagée)");
  const z = emptyMatch(4);
  z.time = 5;
  z.kill(z.players[0], -1);
  z.kill(z.players[1], -1);
  z.kill(z.players[2], -1);
  z.kill(z.players[3], -1);
  for (let i = 0; i < 200 && z.phase !== "over"; i++) z.step(idle(z));
  check(z.winnerId === -1 && z.players.every((p) => p.place === 1), "tout le monde saute ensemble : égalité, pas de vainqueur");
}

console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert.");
(globalThis as unknown as { process: { exit(c: number): void } }).process.exit(failures ? 1 : 0);
