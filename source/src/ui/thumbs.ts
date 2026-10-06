import { drawCharacter, lookOf } from "../render/bodies";
import { TILE } from "../core/types";
import { generateArena } from "../maps/generator";
import type { MapDef } from "../maps/types";
import { BONUS_COLORS, drawBonusIcon } from "../render/sprites";
import { getArt } from "../render/art";

/** Portrait d'un personnage dans un petit canvas. */
export function drawPortrait(canvas: HTMLCanvasElement, characterId: string, skinId?: string, faceY = 1, t = 0, accessoryId?: string | null, scale = 0.95) {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, canvas.height);
  const s = Math.min(w, canvas.height) * scale;
  drawCharacter(ctx, w / 2, canvas.height * 0.5 - s * (0.08 - (0.95 - scale) * 0.25), s, lookOf(characterId, skinId, accessoryId), {
    faceX: 0, faceY, walk: 0, moving: false, t,
  });
}

/** Aperçu miniature d'une map (vue de dessus). */
export function drawMapThumb(canvas: HTMLCanvasElement, map: MapDef) {
  const arena = generateArena(map, 4, 7);
  const art = getArt(map.theme);
  const ctx = canvas.getContext("2d")!;
  const s = Math.floor(Math.min(canvas.width / arena.width, canvas.height / arena.height));
  const ox = (canvas.width - s * arena.width) / 2;
  const oy = (canvas.height - s * arena.height) / 2 + s * 0.2;
  ctx.fillStyle = art.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(ox, oy);
  const W = arena.width;
  const H = arena.height;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      art.floor(ctx, x * s, y * s, s, x, y);
      const k = arena.terrain[y * W + x];
      if (k) art.terrain(ctx, k, x * s, y * s, s, x, y);
    }
  for (let y = -2; y <= H + 1; y++)
    for (let x = -2; x <= W + 1; x++) {
      const outside = x < 0 || y < 0 || x > W - 1 || y > H - 1;
      if (outside) art.border(ctx, x * s, y * s, s, x, y, false);
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      if (border) art.border(ctx, x * s, y * s, s, x, y, true);
    }
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const t = arena.tiles[y * W + x];
      if (t === TILE.WALL) art.pillar(ctx, x * s, y * s, s, x, y);
      else if (t === TILE.BLOCK) art.block(ctx, x * s, y * s, s, x, y);
    }
  ctx.restore();
}

const iconCache = new Map<string, string>();
/** Icône de bonus (tuile arrondie) en data-URL, pour le HUD. */
export function bonusIconURL(type: string): string {
  const hit = iconCache.get(type);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const [c1, c2] = BONUS_COLORS[type] ?? ["#ccc", "#888"];
  ctx.fillStyle = c2;
  ctx.beginPath();
  ctx.roundRect(4, 8, 56, 54, 16);
  ctx.fill();
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.roundRect(4, 2, 56, 54, 16);
  ctx.fill();
  drawBonusIcon(ctx, 32, 29, 64, type);
  const url = c.toDataURL();
  iconCache.set(type, url);
  return url;
}
