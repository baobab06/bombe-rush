/**
 * Mode AVENTURE : un niveau = un mode de base (Classique, Chaos, Ruée vers
 * l'or) + un objectif, un temps limite, des étoiles, parfois un BOSS.
 * Branché sur la simulation (match.ts) : déterministe comme le reste.
 * Le joueur local est toujours le joueur 0.
 */
import type { Match } from "./match";
import type { PlayerState } from "./types";
import { TILE } from "./types";

export type AdvGoal = "win" | "crates" | "gold" | "survive" | "boss";

export interface BossRules {
  /** points de vie (touché = un cœur en moins, puis bouclier) */
  hp: number;
  bombs: number;
  range: number;
  /** vitesse en plus (cases / s) */
  speed?: number;
}

export interface AdventureRules {
  goal: AdvGoal;
  /** temps limite (s) */
  duration: number;
  /** caisses à casser / or à ramasser / secondes à tenir */
  target?: number;
  /**
   * Étoiles 2 et 3 : temps maximal (s) pour finir le niveau, ou, pour
   * « survive », nombre d'adversaires à éliminer.
   */
  stars: [number, number];
  /** le joueur 1 est un boss */
  boss?: BossRules;
}

/** Bouclier du boss après chaque coup (s). */
export const BOSS_SHIELD = 2.2;

export class AdventureState {
  won = false;
  lost = false;
  /** raison de l'échec (affichée au joueur) */
  why: "" | "dead" | "time" = "";
  /** moment de la réussite (s de jeu) */
  doneAt = 0;
  bossHp = 0;
  readonly bossId: number = -1;

  constructor(
    private m: Match,
    readonly rules: AdventureRules,
  ) {
    const b = rules.boss;
    if (b && m.players.length > 1) {
      this.bossId = 1;
      this.bossHp = b.hp;
      const p = m.players[1];
      p.maxBombs = b.bombs;
      p.range = b.range;
      p.speed += b.speed ?? 0;
    }
  }

  get done(): boolean {
    return this.won || this.lost;
  }
  get duration(): number {
    return this.rules.duration;
  }

  /** Avancement de l'objectif : [actuel, but]. */
  progress(): [number, number] {
    const m = this.m;
    const r = this.rules;
    const me = m.players[0];
    switch (r.goal) {
      case "crates":
        return [Math.min(r.target ?? 0, me.stats.blocksDestroyed), r.target ?? 0];
      case "gold":
        return [Math.min(r.target ?? 0, m.gold?.points(0) ?? 0), r.target ?? 0];
      case "survive":
        return [Math.min(r.target ?? r.duration, Math.floor(m.time)), r.target ?? r.duration];
      case "boss":
        return [(r.boss?.hp ?? 0) - this.bossHp, r.boss?.hp ?? 0];
      default: {
        const foes = m.players.length - 1;
        return [m.players.filter((p) => p.id !== 0 && !p.alive).length, foes];
      }
    }
  }

  /** Étoiles gagnées (0 = niveau raté). */
  stars(): number {
    if (!this.won) return 0;
    const [s2, s3] = this.rules.stars;
    if (this.rules.goal === "survive") {
      const k = this.m.players[0].stats.kills;
      return k >= s3 ? 3 : k >= s2 ? 2 : 1;
    }
    return this.doneAt <= s3 ? 3 : this.doneAt <= s2 ? 2 : 1;
  }

  /** Coup reçu par le boss : un cœur en moins au lieu de l'élimination. */
  absorb(p: PlayerState, killer: number): boolean {
    if (p.id !== this.bossId || this.bossHp <= 1) {
      if (p.id === this.bossId) this.bossHp = 0;
      return false;
    }
    this.bossHp--;
    p.shieldTime = BOSS_SHIELD;
    p.stunTime = 0;
    p.toxDose = 0;
    this.m.events.push({ t: "bossHit", player: p.id, hp: this.bossHp, killer, x: p.x, y: p.y });
    return true;
  }

  update(): void {
    if (this.done || this.m.phase !== "playing") return;
    const m = this.m;
    const r = this.rules;
    const me = m.players[0];
    const finish = (won: boolean, why: AdventureState["why"] = "") => {
      this.won = won;
      this.lost = !won;
      this.why = why;
      this.doneAt = m.time;
      m.events.push({ t: "advDone", won });
    };
    // Ruée vers l'or : on réapparaît, l'échec ne vient que du temps
    if (!me.alive && !m.gold) return finish(false, "dead");
    const [cur, goal] = this.progress();
    switch (r.goal) {
      case "crates":
      case "gold":
        if (cur >= goal) return finish(true);
        // plus aucune caisse à casser : on compte ce qui a été fait
        if (r.goal === "crates" && !this.cratesLeft()) return finish(cur >= goal);
        break;
      case "survive":
        if (m.time >= goal) return finish(true);
        break;
      case "boss":
        if (!m.players[this.bossId]?.alive) return finish(true);
        break;
      default:
        if (m.players.every((p) => p.id === 0 || !p.alive)) return finish(true);
    }
    if (m.time >= r.duration) finish(false, "time");
  }

  private cratesLeft(): boolean {
    const g = this.m.grid;
    for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === TILE.BLOCK && !g.veins.has(i)) return true;
    return false;
  }
}
