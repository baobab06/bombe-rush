import { TERRAIN, TILE, type TileType } from "./types";
import type { Arena } from "../maps/generator";

/** État spatial de l'arène : cases, bombes, bonus et flammes indexés par case. */
export class Grid {
  readonly w: number;
  readonly h: number;
  readonly tiles: Uint8Array;
  readonly hiddenBonus: (string | null)[];
  /** sol spécial (lave, eau, glace, cheminée) */
  readonly terrain: Uint8Array;
  /** temps de flamme restant par case (0 = pas de feu) */
  readonly fire: Float32Array;
  readonly fireShape: Uint8Array;
  readonly fireOwner: Int16Array;
  /** id de bombe par case, -1 sinon */
  readonly bombAt: Int32Array;
  /** id de bonus par case, -1 sinon */
  readonly bonusAt: Int32Array;

  constructor(arena: Arena) {
    this.w = arena.width;
    this.h = arena.height;
    this.tiles = arena.tiles.slice();
    this.hiddenBonus = arena.hiddenBonus.slice();
    this.terrain = arena.terrain.slice();
    const n = this.w * this.h;
    this.fire = new Float32Array(n);
    this.fireShape = new Uint8Array(n);
    this.fireOwner = new Int16Array(n).fill(-1);
    this.bombAt = new Int32Array(n).fill(-1);
    this.bonusAt = new Int32Array(n).fill(-1);
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  tile(x: number, y: number): TileType {
    if (!this.inside(x, y)) return TILE.WALL;
    return this.tiles[this.idx(x, y)] as TileType;
  }
  terrainAt(x: number, y: number): number {
    if (!this.inside(x, y)) return TERRAIN.NONE;
    return this.terrain[this.idx(x, y)];
  }
  /** lave / eau : on ne peut pas y marcher ni y poser de bombe */
  isHazard(x: number, y: number): boolean {
    const t = this.terrainAt(x, y);
    return t === TERRAIN.LAVA || t === TERRAIN.WATER;
  }
  /** case où l'on ne peut pas marcher (mur, bloc, lave, eau) */
  blocksMove(x: number, y: number): boolean {
    return this.isSolid(x, y) || this.isHazard(x, y);
  }
  isSolid(x: number, y: number): boolean {
    return this.tile(x, y) !== TILE.FLOOR;
  }
}

export const DIRS: readonly [number, number, number][] = [
  // dx, dy, bit de forme côté « bras »
  [-1, 0, 1],
  [1, 0, 2],
  [0, -1, 4],
  [0, 1, 8],
];
