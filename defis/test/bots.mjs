// Joueurs automatiques : produisent des événements comme le ferait le client.
import { GAMES, MEMORY, REFLEX, logicProblem, targetAt } from "../lib/games.mjs";

/** quality ∈ [0,1] : 1 = partie parfaite, plus bas = plus de ratés. */
export function play(gameId, seed, { quality = 1, rt = 250, pace = 1 } = {}) {
  const content = GAMES[gameId].generate(seed);
  if (gameId === "reflex") {
    const events = [];
    content.stimuli.forEach((s, i) => {
      if (s.kind === "go" && (i * 7919) % 100 < quality * 100) events.push({ type: "tap", t: s.at + rt + (i % 5) * 13 });
    });
    return events;
  }
  if (gameId === "memory") {
    const events = [];
    const maxLevels = Math.round(quality * MEMORY.levels);
    let displayStart = MEMORY.leadMs;
    for (let k = 0; k < content.levels.length; k++) {
      const seq = content.levels[k];
      let t = displayStart + seq.length * MEMORY.stepMs;
      for (const [j, cell] of seq.entries()) {
        t += Math.round(300 * pace) + (j % 3) * 20;
        const wrong = k === maxLevels;
        events.push({ type: "tap", t, cell: wrong ? (cell + 1) % MEMORY.cells : cell });
        if (wrong) return events;
      }
      displayStart = t + MEMORY.pauseMs;
    }
    return events;
  }
  if (gameId === "precision") {
    const events = [];
    for (const tg of content.targets) {
      if ((tg.id * 7919) % 100 >= quality * 100) continue;
      const t = tg.spawnAt + 400 + (tg.id % 4) * 37;
      const p = targetAt(tg, t);
      if (p) events.push({ type: "shot", t, x: p.x + tg.r * 0.3, y: p.y });
    }
    return events.sort((a, b) => a.t - b.t);
  }
  if (gameId === "logic") {
    const events = [];
    for (let i = 0, t = 1500; t < 60000; i++, t += Math.round(2500 * pace) + (i % 4) * 100) {
      const p = logicProblem(content.seed, i);
      const right = (i * 7919) % 100 < quality * 100;
      events.push({ type: "answer", t, i, choice: right ? p.answer : (p.answer + 1) % p.choices.length });
    }
    return events;
  }
  throw new Error(gameId);
}

export { REFLEX };
