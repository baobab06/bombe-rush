/**
 * CAPACITÉS DE BOMBES — système commun.
 *
 *  1. SPECIALS : la liste des capacités (bonus « spéciaux ») et le champ du
 *     joueur qui la stocke. Ajouter une capacité = une entrée ici (+ son effet
 *     dans match.ts et son dessin).
 *  2. SPECIAL_RULES : règles de détention (combien de capacités à la fois,
 *     ce qui se passe si on en a déjà une).
 *  3. clearAbilities() : remise à zéro UNIQUE (élimination, réapparition,
 *     fin de manche) — capacités et effets subis.
 *  4. SpecialSpawner : apparition des bonus spéciaux pendant la partie,
 *     réglée par mode (modes.ts → `specials`), toujours au rng de la partie
 *     (même résultat pour tous en ligne).
 *
 * Les bonus « classiques » (bombe +1, flamme, vitesse, bouclier) restent dans
 * le butin des caisses (loot.ts) ; les capacités n'apparaissent QUE par le
 * spawner, avec leurs propres poids et quotas.
 */
import { DT } from "./rules";
import { DIRS } from "./grid";
import { TERRAIN, TILE, type PlayerState } from "./types";
import type { Match } from "./match";

/** Champs « réserve » des capacités (0 ou 1) dans PlayerState. */
export type ChargeField =
  | "throwCharges"
  | "bigCharges"
  | "elecCharges"
  | "freezeCharges"
  | "toxicCharges"
  | "chainCharges"
  | "remoteCharges";

export interface SpecialDef {
  id: string;
  field: ChargeField;
  label: string;
}

export const SPECIALS: SpecialDef[] = [
  { id: "throw", field: "throwCharges", label: "Bombe à lancer" },
  { id: "big", field: "bigCharges", label: "Grosse bombe" },
  { id: "elec", field: "elecCharges", label: "Bombe électrique" },
  { id: "freeze", field: "freezeCharges", label: "Bombe gelante" },
  { id: "toxic", field: "toxicCharges", label: "Bombe toxique" },
  { id: "chain", field: "chainCharges", label: "Réaction en chaîne" },
  { id: "remote", field: "remoteCharges", label: "Bombe télécommandée" },
];

export const SPECIAL_BY_ID: Record<string, SpecialDef> = Object.fromEntries(SPECIALS.map((s) => [s.id, s]));

/**
 * Règles de détention :
 *  - une seule réserve de chaque capacité ;
 *  - au plus `maxHeld` capacités différentes en même temps (elles se
 *    combinent sur la prochaine bombe) ;
 *  - si le joueur ne peut pas prendre le bonus (déjà la même capacité, ou
 *    réserve pleine) : le bonus RESTE sur la carte (rien n'est perdu ni
 *    remplacé en silence) et le joueur voit « DÉJÀ ÉQUIPÉ » / « RÉSERVE PLEINE ».
 */
export const SPECIAL_RULES = {
  maxHeld: 2,
} as const;

/** Nombre de capacités différentes détenues. */
export function heldCount(p: PlayerState): number {
  let n = 0;
  for (const s of SPECIALS) if (p[s.field] > 0) n++;
  return n;
}

/** Peut-il ramasser cette capacité ? `null` = oui, sinon la raison du refus. */
export function refuseReason(p: PlayerState, id: string): "same" | "full" | null {
  const def = SPECIAL_BY_ID[id];
  if (!def) return null;
  if (p[def.field] > 0) return "same";
  if (heldCount(p) >= SPECIAL_RULES.maxHeld) return "full";
  return null;
}

/** Remise à zéro de TOUTES les capacités et de tous les effets subis. */
export function clearAbilities(p: PlayerState): void {
  for (const s of SPECIALS) p[s.field] = 0;
  p.stunTime = 0;
  p.stunImmune = 0;
  p.slowTime = 0;
  p.slowImmune = 0;
  p.toxDose = 0;
  p.toxTick = 0;
  p.toxRecover = 0;
}

// ------------------------------------------------------------ apparition

export interface SpecialSpawnConfig {
  /** première vérification (s de partie) */
  firstAt: number;
  /** apparitions rapides garanties au tout début (Domination : capacités dès les premières secondes) */
  opening: number;
  /** écart entre deux apparitions d'ouverture (s) */
  openingEvery: number;
  /** délai entre deux vérifications : tiré entre [min, max] secondes */
  interval: [number, number];
  /** probabilité d'apparition à chaque vérification (pas de garantie) */
  chance: number;
  /** bonus spéciaux visibles au maximum en même temps */
  maxOnBoard: number;
  /** poids relatifs de chaque capacité */
  weights: Record<string, number>;
  /** quantité maximale de chaque capacité par partie */
  maxPerMatch: Record<string, number>;
  /** multiplicateur de poids pour la capacité sortie juste avant (anti-répétition) */
  repeatPenalty: number;
  /** distance minimale (pas) entre le bonus et chaque joueur vivant */
  minPlayerDist: number;
  /** pas d'apparition s'il reste moins de N joueurs vivants */
  minAlive: number;
  /** équité : écart maximal d'accès (pas) entre les joueurs / équipes les plus proches */
  fairGap: number;
}

const ALL_WEIGHTS = { throw: 16, big: 16, elec: 14, freeze: 14, toxic: 14, chain: 12, remote: 14 };
const ALL_QUOTAS = { throw: 4, big: 4, elec: 4, freeze: 4, toxic: 4, chain: 4, remote: 4 };

/** Réglages par défaut (Classique). Les modes en changent une partie (modes.ts). */
export const SPECIAL_SPAWN: SpecialSpawnConfig = {
  firstAt: 12,
  opening: 0,
  openingEvery: 2,
  interval: [10, 15],
  chance: 0.6,
  maxOnBoard: 1,
  weights: ALL_WEIGHTS,
  maxPerMatch: ALL_QUOTAS,
  repeatPenalty: 0.25,
  minPlayerDist: 3,
  minAlive: 2,
  fairGap: 2,
};

/** Coût d'accès d'une caisse / d'une bombe sur le chemin (en pas). */
const ACCESS_COST = { block: 4, bomb: 2 } as const;

export class SpecialSpawner {
  readonly cfg: SpecialSpawnConfig;
  /** secondes avant la prochaine vérification */
  nextIn: number;
  /** tests / modes : coupe les apparitions */
  disabled = false;
  /** apparitions d'ouverture restantes */
  private openingLeft: number;
  /** nombre d'apparitions par capacité dans la partie */
  readonly spawned: Record<string, number> = {};
  /** dernière capacité et dernière case (évite les répétitions) */
  lastType = "";
  private lastCell = -1;
  /** journal (tests / équilibrage) */
  readonly log: { t: number; type: string; x: number; y: number }[] = [];

  constructor(private m: Match, cfg: Partial<SpecialSpawnConfig> = {}) {
    this.cfg = { ...SPECIAL_SPAWN, ...cfg };
    this.nextIn = this.cfg.firstAt;
    this.openingLeft = this.cfg.opening;
  }

  /** Bonus spéciaux actuellement sur la carte. */
  onBoard(): number {
    let n = 0;
    for (const b of this.m.bonuses.values()) if (SPECIAL_BY_ID[b.type]) n++;
    return n;
  }

  update(): void {
    const m = this.m;
    if (this.disabled || m.phase !== "playing") return;
    this.nextIn -= DT;
    if (this.nextIn > 0) return;
    const opening = this.openingLeft > 0;
    if (opening) {
      this.openingLeft--;
      this.nextIn = this.openingLeft > 0 ? this.cfg.openingEvery : this.rollInterval();
    } else this.nextIn = this.rollInterval();
    // on tire toujours la chance (séquence aléatoire stable), puis on vérifie la partie
    const lucky = m.rng.chance(this.cfg.chance);
    if (!opening && !lucky) return;
    this.trySpawn();
  }

  private rollInterval(): number {
    const [a, b] = this.cfg.interval;
    return a + (b - a) * this.m.rng.next();
  }

  /** Tente une apparition maintenant ; renvoie la capacité apparue ou null. */
  trySpawn(): string | null {
    const m = this.m;
    const alive = m.players.filter((p) => p.alive);
    if (alive.length < this.cfg.minAlive) return null;
    if (this.onBoard() >= this.cfg.maxOnBoard) return null;
    const type = this.pickType();
    if (!type) return null;
    const cell = this.pickCell();
    if (!cell) return null;
    if (!m.spawnBonus(type, cell[0], cell[1])) return null;
    // compteurs propres (les quotas des caisses, loot.ts, restent séparés)
    this.spawned[type] = (this.spawned[type] ?? 0) + 1;
    this.lastType = type;
    this.lastCell = m.grid.idx(cell[0], cell[1]);
    this.log.push({ t: m.time, type, x: cell[0], y: cell[1] });
    return type;
  }

  /**
   * Capacité tirée au sort : poids du mode, quota par partie, pénalité si
   * c'est la même que la dernière, et moins de chances pour celles déjà
   * sorties souvent (aucune ne domine).
   */
  pickType(): string | null {
    const pool: Record<string, number> = {};
    const onBoard = new Set([...this.m.bonuses.values()].map((b) => b.type));
    for (const [id, w0] of Object.entries(this.cfg.weights)) {
      if (!SPECIAL_BY_ID[id] || w0 <= 0) continue;
      const max = this.cfg.maxPerMatch[id];
      const n = this.spawned[id] ?? 0;
      if (max !== undefined && n >= max) continue;
      if (onBoard.has(id)) continue; // jamais deux fois la même capacité visible
      let w = w0 / (1 + n);
      if (id === this.lastType) w *= this.cfg.repeatPenalty;
      pool[id] = w;
    }
    if (!Object.keys(pool).length) return null;
    return this.m.rng.weighted(pool);
  }

  /**
   * Case d'apparition : sol libre (pas de mur, caisse, lave, eau, cheminée,
   * bombe, bonus, feu, gaz, zone de Domination), loin des joueurs, jamais la
   * même que la précédente, ACCESSIBLE à au moins deux joueurs (aux deux
   * équipes en Domination ; une caisse à casser compte comme un détour, un
   * mur bloque) et à peu près à la même distance d'eux (équité).
   */
  pickCell(): [number, number] | null {
    const m = this.m;
    const g = m.grid;
    const alive = m.players.filter((p) => p.alive);
    const dists = alive.map((p) => this.walkDist(Math.floor(p.x), Math.floor(p.y)));
    const zone = m.hill?.cellSet;
    const teams = m.teams;
    const cands: { x: number; y: number; gap: number }[] = [];
    for (let y = 1; y < g.h - 1; y++)
      for (let x = 1; x < g.w - 1; x++) {
        const i = g.idx(x, y);
        if (!m.isFreeCell(x, y, true) || g.isHazard(x, y)) continue;
        if (g.terrainAt(x, y) === TERRAIN.VENT) continue;
        if (g.fire[i] > 0 || m.gasAt(i) || zone?.has(i) || i === this.lastCell) continue;
        if (alive.some((p) => Math.abs(Math.floor(p.x) - x) + Math.abs(Math.floor(p.y) - y) < this.cfg.minPlayerDist)) continue;
        // accès : distance de marche de chaque joueur (Infinity = inaccessible pour l'instant)
        const d = dists.map((arr) => arr[i]);
        let gap: number;
        if (teams) {
          const best = new Map<number, number>();
          alive.forEach((p, k) => {
            const t = teams[p.id];
            best.set(t, Math.min(best.get(t) ?? Infinity, d[k]));
          });
          const vals = [...best.values()];
          if (vals.length < 2 || vals.some((v) => v === Infinity)) continue; // chaque équipe doit pouvoir y aller
          gap = Math.max(...vals) - Math.min(...vals);
        } else {
          const reach = d.filter((v) => v !== Infinity).sort((a, b) => a - b);
          if (reach.length < Math.min(2, alive.length)) continue; // au moins deux joueurs y ont accès
          gap = reach.length >= 2 ? reach[1] - reach[0] : 0;
        }
        cands.push({ x, y, gap });
      }
    if (!cands.length) return null;
    // les cases les plus équitables d'abord, puis tirage au sort parmi elles
    const minGap = Math.min(...cands.map((c) => c.gap));
    const fair = cands.filter((c) => c.gap <= Math.max(minGap, this.cfg.fairGap));
    const c = fair[Math.floor(m.rng.next() * fair.length)];
    return [c.x, c.y];
  }

  /**
   * « Distance d'accès » depuis (sx, sy) : un pas de sol libre = 1 ; une
   * caisse ou une bombe compte plus cher (il faut la faire sauter / attendre)
   * mais n'empêche pas l'accès ; murs, lave et eau bloquent. Petit Dijkstra
   * à files par coût (grille minuscule).
   */
  private walkDist(sx: number, sy: number): Float32Array {
    const g = this.m.grid;
    const dist = new Float32Array(g.w * g.h).fill(Infinity);
    const start = g.idx(sx, sy);
    dist[start] = 0;
    const buckets: number[][] = [[start]];
    for (let d = 0; d < buckets.length; d++) {
      const bucket = buckets[d];
      if (!bucket) continue;
      for (const c of bucket) {
        if (dist[c] !== d) continue;
        const x = c % g.w;
        const y = (c - x) / g.w;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          const t = g.tile(nx, ny);
          if (t === TILE.WALL || g.isHazard(nx, ny)) continue;
          const n = g.idx(nx, ny);
          const cost = t === TILE.BLOCK ? ACCESS_COST.block : g.bombAt[n] >= 0 ? ACCESS_COST.bomb : 1;
          const nd = d + cost;
          if (nd >= dist[n]) continue;
          dist[n] = nd;
          (buckets[nd] ??= []).push(n);
        }
      }
    }
    return dist;
  }
}
