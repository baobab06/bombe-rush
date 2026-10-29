/**
 * BUTIN DES BLOCS — configuration centrale des bonus ramassables.
 *
 * Le bonus est tiré AU MOMENT où le bloc est détruit (et plus à la création
 * de la carte) : l'ordre et le contenu changent à chaque partie et selon la
 * façon de jouer. Le tirage utilise le rng de la partie, donc le serveur et
 * les joueurs en ligne voient exactement la même chose.
 *
 * Règles d'équité (identiques pour tout le monde, jamais modifiées en cours
 * de partie pour avantager quelqu'un) :
 *  - un bonus n'apparaît que sur la case du bloc détruit (jamais dans un mur,
 *    une bombe, un autre bonus ou une zone inaccessible) ;
 *  - nombre maximum de bonus visibles en même temps ;
 *  - quotas par type et par partie (pas 6 boucliers d'affilée) ;
 *  - équilibre par quart de carte : un coin ne peut pas recevoir beaucoup plus
 *    de bonus que les autres (chaque joueur part d'un coin).
 */
import type { Rng } from "./rng";

export interface LootConfig {
  /** probabilité qu'un bloc détruit lâche un bonus (0..1) */
  dropChance: number;
  /** poids relatifs de chaque bonus (ids de core/bonuses.ts) */
  weights: Record<string, number>;
  /** bonus visibles au maximum en même temps sur la carte */
  maxOnBoard: number;
  /** quantité maximale par type et par partie (absent = illimité) */
  maxPerMatch: Record<string, number>;
  /** écart maximal de bonus entre le quart de carte le plus servi et le moins servi */
  quadrantLead: number;
  /** événement Chaos « Surcharge » : chaque bloc lâche un bonus (dans les limites ci-dessus + marge) */
  boostExtraOnBoard: number;
}

export const LOOT: LootConfig = {
  dropChance: 0.42,
  weights: { bomb: 34, flame: 30, speed: 18, shield: 18, big: 10, elec: 10, freeze: 10, toxic: 10 },
  maxOnBoard: 6,
  maxPerMatch: { bomb: 14, flame: 12, speed: 6, shield: 5, big: 4, elec: 4, freeze: 4, toxic: 4 },
  quadrantLead: 3,
  boostExtraOnBoard: 6,
};

/** Suivi du butin d'une partie (compteurs par type et par quart de carte). */
export class LootTable {
  readonly perType: Record<string, number> = {};
  readonly perQuadrant = [0, 0, 0, 0];

  /** quarts de carte où un joueur est apparu (les seuls comparés) */
  private homes: number[];

  constructor(
    private w: number,
    private h: number,
    spawns: [number, number][] = [],
    readonly cfg: LootConfig = LOOT,
  ) {
    const set = new Set(spawns.map(([x, y]) => this.quadrant(x, y)));
    this.homes = set.size >= 2 ? [...set] : [0, 1, 2, 3];
  }

  quadrant(x: number, y: number): number {
    return (x < (this.w - 1) / 2 ? 0 : 1) + (y < (this.h - 1) / 2 ? 0 : 2);
  }

  /** Types encore autorisés (quota par partie non atteint). */
  available(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, wgt] of Object.entries(this.cfg.weights)) {
      const max = this.cfg.maxPerMatch[id];
      if (wgt > 0 && (max === undefined || (this.perType[id] ?? 0) < max)) out[id] = wgt;
    }
    return out;
  }

  /**
   * Tirage pour un bloc détruit en (x, y). `onBoard` = bonus déjà visibles.
   * Renvoie le type de bonus, ou null.
   */
  roll(rng: Rng, x: number, y: number, onBoard: number, boost = false): string | null {
    // le tirage de chance est toujours fait (séquence aléatoire stable)
    const lucky = rng.chance(this.cfg.dropChance);
    if (!boost && !lucky) return null;
    if (onBoard >= this.cfg.maxOnBoard + (boost ? this.cfg.boostExtraOnBoard : 0)) return null;
    const q = this.quadrant(x, y);
    if (!boost && this.homes.includes(q)) {
      const min = Math.min(...this.homes.map((h) => this.perQuadrant[h]));
      if (this.perQuadrant[q] - min >= this.cfg.quadrantLead) return null;
    }
    const pool = this.available();
    if (!Object.keys(pool).length) return null;
    const type = rng.weighted(pool);
    this.record(type, x, y);
    return type;
  }

  /** Bonus apparu (tirage ou événement) : il compte dans les quotas. */
  record(type: string, x: number, y: number) {
    this.perType[type] = (this.perType[type] ?? 0) + 1;
    this.perQuadrant[this.quadrant(x, y)]++;
  }
}
