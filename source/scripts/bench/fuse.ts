/* Banc d'essai : effet du délai de mèche sur les bots. `bun scripts/bench/fuse.ts 2.0 1.6 1.4` */
import { BotBrain } from "../../src/ai/bot";
import { Match } from "../../src/core/match";
import { DT, RULES } from "../../src/core/rules";
import type { Difficulty } from "../../src/core/types";
import { MAPS } from "../../src/maps";

const fuses = process.argv.slice(2).map(Number);
const N = 40;
for (const fuse of fuses.length ? fuses : [RULES.bombFuse]) {
  (RULES as { bombFuse: number }).bombFuse = fuse;
  for (const diff of ["easy", "normal", "hard", "expert"] as Difficulty[]) {
    let self = 0, kills = 0, deaths = 0, dur = 0, before = 0, bombs = 0;
    for (let seed = 1; seed <= N; seed++) {
      const map = MAPS[seed % MAPS.length];
      const m = new Match({ seed, map, modeId: "classic", players: [0, 1, 2, 3].map((i) => ({ name: "B" + i, characterId: "renard", isBot: true, difficulty: diff })) });
      const bots = m.players.map((p) => new BotBrain(p.id, diff, seed * 7 + p.id));
      m.countdown = 0;
      m.phase = "playing";
      while (m.phase !== "over" && m.time < 200) {
        m.step(bots.map((b) => b.update(m, DT)));
        for (const e of m.events) {
          if (e.t === "playerDied") {
            deaths++;
            if (e.killer === e.player) self++;
            else if (e.killer >= 0) kills++;
            if (!m.suddenDeath) before++;
          }
          if (e.t === "bombPlaced") bombs++;
        }
      }
      dur += m.time;
    }
    console.log(`mèche ${fuse}s ${diff.padEnd(6)} : suicides ${(self / N).toFixed(2)}/partie · éliminations ${(kills / N).toFixed(2)} · morts avant mort subite ${(before / N).toFixed(2)} · bombes ${(bombs / N).toFixed(0)} · durée ${(dur / N).toFixed(0)}s`);
  }
}
