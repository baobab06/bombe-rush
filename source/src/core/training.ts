import type { Match } from "./match";
import { clearAbilities } from "./specials";
import { TILE } from "./types";

/**
 * Mode « Entraînement » (tutoriel) : les vraies règles du jeu (déplacement,
 * bombes, explosions, bonus, capacités), sans fin de partie ni récompense.
 *
 * - Joueur 0 : le joueur ; joueur 1 : un mannequin immobile (cible).
 * - Caisses posées à la main, chacune avec un bonus connu (la leçon est la
 *   même pour tout le monde). Toutes cassées : elles reviennent.
 * - Un joueur éliminé réapparaît à son départ au bout de 1,5 s, protégé.
 */
export const TRAINING_CRATES: [number, number, string | null][] = [
  [4, 1, "flame"],
  [1, 3, "bomb"],
  [5, 3, "speed"],
  [8, 1, "shield"],
  [3, 5, "throw"],
  [7, 3, null],
  [9, 3, "bomb"],
  [7, 5, null],
];
export const TRAINING_SPAWNS: [number, number][] = [
  [1, 1],
  [11, 5],
];
const RESPAWN = 1.5;
const CRATES_BACK = 4;

export class TrainingState {
  private respawnIn: number[];
  private refill = -1;

  constructor(private m: Match) {
    this.respawnIn = m.players.map(() => 0);
    this.placeCrates();
    m.players.forEach((p, i) => {
      const [x, y] = TRAINING_SPAWNS[i] ?? TRAINING_SPAWNS[0];
      p.x = x + 0.5;
      p.y = y + 0.5;
    });
  }

  private placeCrates(): void {
    const g = this.m.grid;
    for (const [x, y, bonus] of TRAINING_CRATES) {
      const i = g.idx(x, y);
      if (g.tiles[i] !== TILE.FLOOR || g.bombAt[i] >= 0 || g.bonusAt[i] >= 0 || g.fire[i] > 0) continue;
      if (this.m.players.some((p) => p.alive && Math.floor(p.x) === x && Math.floor(p.y) === y)) continue;
      g.tiles[i] = TILE.BLOCK;
      g.hiddenBonus[i] = bonus;
    }
  }

  onDeath(id: number): void {
    this.respawnIn[id] = RESPAWN;
  }

  update(dt: number): void {
    const m = this.m;
    for (const p of m.players) {
      if (p.alive) continue;
      if (this.respawnIn[p.id] <= 0) this.respawnIn[p.id] = RESPAWN;
      this.respawnIn[p.id] -= dt;
      if (this.respawnIn[p.id] > 0) continue;
      const [x, y] = TRAINING_SPAWNS[p.id] ?? TRAINING_SPAWNS[0];
      const i = m.grid.idx(x, y);
      if (m.grid.fire[i] > 0 || m.grid.bombAt[i] >= 0) continue; // on attend que la case soit sûre
      p.x = x + 0.5;
      p.y = y + 0.5;
      p.alive = true;
      p.moving = false;
      p.slideX = 0;
      p.slideY = 0;
      p.faceX = 0;
      p.faceY = 1;
      clearAbilities(p);
      p.bombCooldown = 0;
      p.shieldTime = 1.5;
      m.events.push({ t: "respawn", player: p.id, x: p.x, y: p.y });
    }
    // toutes les caisses cassées : elles reviennent un peu plus tard
    const left = TRAINING_CRATES.some(([x, y]) => m.grid.tiles[m.grid.idx(x, y)] === TILE.BLOCK);
    if (left) this.refill = -1;
    else if (this.refill < 0) this.refill = CRATES_BACK;
    else if ((this.refill -= dt) <= 0) {
      this.refill = -1;
      this.placeCrates();
    }
  }
}
