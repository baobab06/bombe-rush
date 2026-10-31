/* Passe de robustesse : parties complètes avec toutes les capacités et des
 * appuis au hasard, invariants vérifiés à CHAQUE image.
 * `bun tests/fuzz.test.ts` */
import { Match } from "../src/core/match";
import { DT, RULES } from "../src/core/rules";
import { TILE, type Difficulty, type InputCmd } from "../src/core/types";
import { FOREST } from "../src/maps/forest";
import { MAPS } from "../src/maps";
import { FACTORY } from "../src/maps/factory";
import { BotBrain } from "../src/ai/bot";
import { Rng } from "../src/core/rng";
import { SPECIALS, SPECIAL_RULES } from "../src/core/specials";
import { FREEZE, SHOCK, TOXIC } from "../src/core/bombs";
import { encodeSnapshot, applySnapshot } from "../src/net/snapshot";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.log("  ✗ " + msg);
  } else console.log("  ✓ " + msg);
}

/** Vérifie la cohérence complète de l'état ; renvoie la liste des problèmes. */
function invariants(m: Match): string[] {
  const bad: string[] = [];
  const g = m.grid;
  // 1. compteur de bombes de chaque joueur = bombes réellement à lui (au sol ou en vol)
  for (const p of m.players) {
    let n = 0;
    for (const b of m.bombs.values()) if (b.ownerId === p.id) n++;
    if (p.activeBombs !== n) bad.push(`activeBombs J${p.id}=${p.activeBombs} ≠ ${n}`);
    if (p.activeBombs < 0) bad.push(`activeBombs négatif J${p.id}`);
  }
  // 2. grille ↔ bombes
  for (const b of m.bombs.values()) {
    const i = g.idx(b.tx, b.ty);
    if (!b.flight && g.bombAt[i] !== b.id) bad.push(`bombe ${b.id} au sol absente de la grille`);
    if (b.flight && g.bombAt[i] === b.id) bad.push(`bombe ${b.id} en vol sur la grille`);
    if (!b.flight && g.tiles[i] !== TILE.FLOOR) bad.push(`bombe ${b.id} dans un mur/caisse`);
    if (b.fuse > 60) bad.push(`bombe ${b.id} : mèche anormale ${b.fuse}`);
  }
  for (let i = 0; i < g.bombAt.length; i++) {
    const id = g.bombAt[i];
    if (id >= 0 && (!m.bombs.has(id) || m.bombs.get(id)!.flight)) bad.push(`case ${i} : bombe fantôme ${id}`);
  }
  // 3. grille ↔ bonus
  for (const b of m.bonuses.values()) if (g.bonusAt[g.idx(b.tx, b.ty)] !== b.id) bad.push(`bonus ${b.id} absent de la grille`);
  for (let i = 0; i < g.bonusAt.length; i++) {
    const id = g.bonusAt[i];
    if (id >= 0 && !m.bonuses.has(id)) bad.push(`case ${i} : bonus fantôme ${id}`);
    if (id >= 0 && g.tiles[i] !== TILE.FLOOR) bad.push(`bonus dans un mur/caisse (case ${i})`);
  }
  // 4. joueurs : états bornés, rien sur les éliminés, vitesse de base intacte
  for (const p of m.players) {
    const base = RULES.baseSpeed + p.speedLevel * RULES.speedPerLevel;
    if (Math.abs(p.speed - base) > 1e-9) bad.push(`vitesse de base modifiée J${p.id}`);
    if (p.stunTime < 0 || p.stunTime > SHOCK.stun + 1e-9) bad.push(`paralysie hors bornes J${p.id}`);
    if (p.slowTime < 0 || p.slowTime > FREEZE.duration + 1e-9) bad.push(`gel hors bornes J${p.id}`);
    if (p.toxDose < 0 || p.toxDose >= TOXIC.lethalDoses + (p.alive ? 0 : 1)) bad.push(`doses hors bornes J${p.id}`);
    for (const sp of SPECIALS) if (p[sp.field] !== 0 && p[sp.field] !== 1) bad.push(`réserve ${sp.id} = ${p[sp.field]} J${p.id}`);
    if (!p.alive) {
      if (SPECIALS.some((sp) => p[sp.field] > 0) || p.stunTime > 0 || p.slowTime > 0 || p.toxDose > 0) bad.push(`éliminé avec capacité/effet J${p.id}`);
    } else if (!g.inside(Math.floor(p.x), Math.floor(p.y))) bad.push(`J${p.id} hors carte`);
    if (p.alive && g.blocksMove(Math.floor(p.x), Math.floor(p.y))) bad.push(`J${p.id} dans un mur`);
  }
  // 5. nuages : bornés
  if (m.toxicZones.length > TOXIC.maxZones) bad.push(`trop de nuages ${m.toxicZones.length}`);
  for (const z of m.toxicZones) if (z.timeLeft <= 0 || z.timeLeft > TOXIC.duration + 1e-9) bad.push(`nuage ${z.id} durée ${z.timeLeft}`);
  // 6. capacités en jeu : jamais plus de la limite sur la carte
  if (m.phase === "playing" && m.specials.onBoard() > m.specials.cfg.maxOnBoard) bad.push(`trop de capacités visibles ${m.specials.onBoard()}`);
  return bad;
}

const NAMES = ["classic", "chaos", "koth"] as const;

console.log("Parties aléatoires : toutes capacités, appuis au hasard, invariants à chaque image");
{
  const totals = { games: 0, ticks: 0, explode: 0, chainLink: 0, shock: 0, frost: 0, gas: 0, remote: 0, thrown: 0, refused: 0, picked: 0, deaths: 0 };
  const problems = new Map<string, number>();
  let crashes = 0;
  let notOver = 0;
  let endDirty = 0;
  let maxBombs = 0;
  let maxBonuses = 0;
  const maps = MAPS.filter((mp) => mp.available);
  for (const modeId of NAMES) {
    const pool = maps.filter((mp) => (modeId === "koth" ? mp.modes?.includes("koth") : !mp.modes || mp.modes.includes(modeId)));
    for (let seed = 1; seed <= 14; seed++) {
      const map = pool[seed % pool.length] ?? (modeId === "koth" ? FACTORY : FOREST);
      const n = 2 + (seed % 3);
      const players = Array.from({ length: modeId === "koth" ? 4 : n }, (_, i) => ({ name: "B" + i, characterId: "pip", isBot: true, difficulty: (["easy", "normal", "hard"] as Difficulty[])[(seed + i) % 3] }));
      let m: Match;
      try {
        m = new Match({ seed: seed * 7919 + modeId.length, map, modeId, players });
      } catch (e) {
        crashes++;
        console.log("    plantage à la création", modeId, map.id, e);
        continue;
      }
      // capacités beaucoup plus fréquentes que dans le vrai jeu (stress)
      Object.assign(m.specials.cfg, { interval: [1.5, 2.5], chance: 1, maxOnBoard: 3, firstAt: 1, maxPerMatch: Object.fromEntries(SPECIALS.map((s) => [s.id, 99])) });
      m.specials.nextIn = 1;
      const brains = m.players.map((p) => new BotBrain(p.id, players[p.id].difficulty, seed));
      const rng = new Rng(seed * 31);
      let guard = 0;
      try {
        while (m.phase !== "over" && guard++ < 60 * 240) {
          const inputs: InputCmd[] = brains.map((b) => {
            const c = b.update(m, DT);
            // appuis humains au hasard, y compris des capacités qu'on n'a pas (ou plus)
            if (rng.chance(0.02)) c.throw = true;
            if (rng.chance(0.02)) c.remote = true;
            if (rng.chance(0.01)) c.ability = true;
            if (rng.chance(0.01)) c.bomb = true;
            return c;
          });
          m.step(inputs);
          totals.ticks++;
          for (const e of m.events) {
            if (e.t in totals) (totals as Record<string, number>)[e.t]++;
            if (e.t === "remoteDetonate") totals.remote++;
            if (e.t === "bombThrown") totals.thrown++;
            if (e.t === "bonusRefused") totals.refused++;
            if (e.t === "bonusPicked") totals.picked++;
            if (e.t === "playerDied") totals.deaths++;
          }
          maxBombs = Math.max(maxBombs, m.bombs.size);
          maxBonuses = Math.max(maxBonuses, m.bonuses.size);
          for (const p of invariants(m)) {
            const key = `${modeId} : ${p.replace(/\d+/g, "#")}`;
            if (!problems.has(key)) console.log(`    ! ${modeId} ${map.id} seed ${seed} t=${m.time.toFixed(2)} : ${p}`);
            problems.set(key, (problems.get(key) ?? 0) + 1);
          }
          // l'état en ligne se recopie sans erreur (une fois par seconde)
          if (m.tick % 60 === 0) {
            const c = new Match({ seed: 1, map, modeId, players });
            applySnapshot(c, JSON.parse(JSON.stringify(encodeSnapshot(m, m.players.map(() => 0), m.events))));
            if (c.bombs.size !== m.bombs.size || c.toxicZones.length !== m.toxicZones.length) {
              const key = `${modeId} : instantané en ligne incomplet`;
              problems.set(key, (problems.get(key) ?? 0) + 1);
            }
          }
        }
      } catch (e) {
        crashes++;
        console.log("    PLANTAGE", modeId, map.id, seed, e);
        continue;
      }
      totals.games++;
      if (m.phase !== "over") notOver++;
      // fin de manche : plus de bonus, de nuages, de capacités ni d'effets
      if (m.bonuses.size || m.toxicZones.length || m.players.some((p) => SPECIALS.some((sp) => p[sp.field] > 0) || p.stunTime > 0 || p.slowTime > 0 || p.toxDose > 0)) endDirty++;
    }
  }
  check(crashes === 0, `${totals.games} parties (Classique, Chaos, Domination sur toutes les cartes), aucun plantage`);
  check(notOver === 0, "toutes les parties vont jusqu'au bout");
  check(problems.size === 0, `invariants vérifiés sur ${totals.ticks} images : ${problems.size ? [...problems].map(([k, v]) => `${k} ×${v}`).join(" ; ") : "aucune incohérence"}`);
  check(endDirty === 0, "fin de manche : carte et joueurs toujours propres");
  check(totals.explode > 0 && totals.chainLink > 0 && totals.shock > 0 && totals.frost > 0 && totals.gas > 0 && totals.remote > 0 && totals.thrown > 0, `tout a servi : ${totals.explode} explosions, ${totals.thrown} lancers, ${totals.chainLink} déclenchements en chaîne, ${totals.shock} décharges, ${totals.frost} gels, ${totals.gas} nuages, ${totals.remote} BOUM, ${totals.picked} ramassages, ${totals.refused} refus, ${totals.deaths} éliminations`);
  check(maxBombs < 60 && maxBonuses < 20, `pas d'accumulation : au plus ${maxBombs} bombes et ${maxBonuses} bonus en même temps`);
}

console.log("Explosions simultanées de toutes les bombes spéciales");
{
  const m = new Match({ seed: 5, map: FOREST, modeId: "classic", players: Array.from({ length: 4 }, (_, i) => ({ name: "P" + i, characterId: "pip", isBot: false })) });
  m.phase = "playing";
  m.specials.disabled = true;
  const g = m.grid;
  for (let y = 1; y < g.h - 1; y++) for (let x = 1; x < g.w - 1; x++) g.tiles[g.idx(x, y)] = TILE.FLOOR;
  const kinds = [{ elec: true }, { freeze: true }, { toxic: true }, { big: true, range: 4 }, { remote: true }, { chainDepth: 0 }, {}];
  let id = 70000;
  let k = 0;
  for (let y = 1; y < g.h - 1; y += 2)
    for (let x = 1; x < g.w - 1; x += 2) {
      const owner = k % 4;
      const b = { id: id++, ownerId: owner, tx: x, ty: y, fuse: 0.5, fuseTotal: 0.5, range: 2, passable: [] as number[], ...kinds[k % kinds.length] };
      m.bombs.set(b.id, b as never);
      g.bombAt[g.idx(x, y)] = b.id;
      m.players[owner].activeBombs++;
      k++;
    }
  // les joueurs sous bouclier pour regarder
  for (const p of m.players) p.shieldTime = 30;
  const count: Record<string, number> = {};
  const exploded = new Map<string, number>();
  for (let i = 0; i < 60; i++) {
    m.step(m.players.map(() => ({ mx: 0, my: 0, bomb: false, ability: false })));
    for (const e of m.events) {
      count[e.t] = (count[e.t] ?? 0) + 1;
      if (e.t === "explode") exploded.set(`${e.x},${e.y}`, (exploded.get(`${e.x},${e.y}`) ?? 0) + 1);
    }
  }
  check(m.bombs.size === 0 && [...exploded.values()].every((v) => v === 1) && exploded.size === k, `${k} bombes de tous types au même instant : chacune explose une fois`);
  const expect = (t: string, kind: object) => Math.ceil(k / kinds.length) - (kinds.indexOf(kind) >= k % kinds.length && k % kinds.length ? 1 : 0);
  check((count.shock ?? 0) === expect("shock", kinds[0]) && (count.frost ?? 0) === expect("frost", kinds[1]) && (count.gas ?? 0) === expect("gas", kinds[2]), `effets appliqués une fois par bombe (décharges ${count.shock}, gels ${count.frost}, nuages ${count.gas})`);
  check(invariants(m).length === 0, `état cohérent ensuite${invariants(m).length ? " : " + invariants(m).join(", ") : ""}`);
}

console.log("Redémarrage d'une manche");
{
  const cfg = { seed: 77, map: FACTORY, modeId: "koth", players: Array.from({ length: 4 }, (_, i) => ({ name: "B" + i, characterId: "pip", isBot: true, difficulty: "hard" as Difficulty })) };
  const play = () => {
    const m = new Match(cfg);
    const brains = m.players.map((p) => new BotBrain(p.id, "hard", 3));
    const log: string[] = [];
    let g = 0;
    while (m.phase !== "over" && g++ < 60 * 200) {
      m.step(brains.map((b) => b.update(m, DT)));
      if (g < 60 * 20) for (const e of m.events) log.push(`${m.tick}:${e.t}`);
    }
    return { m, log };
  };
  const a = play();
  const b = play();
  check(a.m.phase === "over" && b.m.phase === "over", "deux manches de suite vont au bout");
  check(a.log.join() === b.log.join() && a.log.length > 50, `manche relancée identique (aucun état qui traîne d'une manche à l'autre, ${a.log.length} événements comparés)`);
  check(b.m.players.every((p) => SPECIALS.every((sp) => p[sp.field] === 0)) && b.m.bonuses.size === 0 && b.m.toxicZones.length === 0, "fin de la 2e manche : tout est nettoyé");
}

console.log("Effets qui se chevauchent");
{
  const m = new Match({ seed: 5, map: FOREST, modeId: "classic", players: Array.from({ length: 2 }, (_, i) => ({ name: "P" + i, characterId: "pip", isBot: false })) });
  m.phase = "playing";
  m.specials.disabled = true;
  for (let i = 0; i < m.grid.tiles.length; i++) if (m.grid.tiles[i] === TILE.BLOCK) m.grid.tiles[i] = TILE.FLOOR;
  const p = m.players[1];
  p.x = 5.5; p.y = 5.5;
  m.stun(p, 0, SHOCK.stun);
  m.slow(p, 0, FREEZE.duration);
  m.stun(p, 0, SHOCK.stun); // déjà paralysé : pas d'effet de plus (règle du jeu : pas de cumul via les bombes)
  let stunned = 0, slowed = 0;
  const x0 = p.x;
  for (let i = 0; i < Math.round(4 / DT); i++) {
    m.step([{ mx: 0, my: 0, bomb: false, ability: false }, { mx: 1, my: 0, bomb: false, ability: false }]);
    if (p.stunTime > 0) stunned++;
    if (p.slowTime > 0) slowed++;
  }
  check(stunned * DT <= SHOCK.stun + DT && slowed * DT <= FREEZE.duration + DT, `paralysie (${(stunned * DT).toFixed(2)} s) et gel (${(slowed * DT).toFixed(2)} s) en même temps : chacun garde sa durée`);
  check(p.x > x0 && p.stunTime === 0 && p.slowTime === 0 && p.speed === RULES.baseSpeed, "ensuite : le joueur bouge normalement, vitesse d'origine");
  // un effet qui se termine pile au moment de l'élimination
  const q = m.players[0];
  m.slow(q, 1, DT);
  m.kill(q, 1);
  m.step([{ mx: 0, my: 0, bomb: false, ability: false }, { mx: 0, my: 0, bomb: false, ability: false }]);
  check(!q.alive && q.slowTime === 0 && q.slowImmune === 0, "effet qui finit pendant une élimination : rien ne reste");
}

console.log("Règles de détention (rappel)");
{
  const m = new Match({ seed: 5, map: FOREST, modeId: "classic", players: Array.from({ length: 2 }, (_, i) => ({ name: "P" + i, characterId: "pip", isBot: false })) });
  m.phase = "playing";
  m.specials.disabled = true;
  for (let i = 0; i < m.grid.tiles.length; i++) if (m.grid.tiles[i] === TILE.BLOCK) m.grid.tiles[i] = TILE.FLOOR;
  const p = m.players[0];
  let held = 0;
  for (const sp of SPECIALS) {
    for (const b of [...m.bonuses.values()]) (m as unknown as { removeBonus(b: unknown): void }).removeBonus(b);
    m.spawnBonus(sp.id, 1, 2);
    p.x = 1.5; p.y = 2.5;
    for (let i = 0; i < 30; i++) m.step([{ mx: 0, my: 0, bomb: false, ability: false }, { mx: 0, my: 0, bomb: false, ability: false }]);
    held = SPECIALS.filter((s) => p[s.field] > 0).length;
    p.y = 1.5;
  }
  check(held === SPECIAL_RULES.maxHeld, `en marchant sur les 7 capacités : ${held} gardées (limite ${SPECIAL_RULES.maxHeld}), les autres restent par terre`);
}

console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert.");
(globalThis as unknown as { process: { exit(c: number): void } }).process.exit(failures ? 1 : 0);
