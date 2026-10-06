/**
 * Compatibilité navigateurs plus anciens (iPhone sous iOS 15, vieux Android).
 * CanvasRenderingContext2D.roundRect n'existe qu'à partir de Safari 16 / Chrome 99.
 */
type RR = (x: number, y: number, w: number, h: number, r?: number | number[]) => void;

for (const proto of [CanvasRenderingContext2D.prototype, (globalThis as { Path2D?: { prototype: object } }).Path2D?.prototype]) {
  if (!proto || "roundRect" in proto) continue;
  (proto as unknown as { roundRect: RR }).roundRect = function (this: CanvasRenderingContext2D, x, y, w, h, r = 0) {
    const rad = Math.max(0, Math.min(Array.isArray(r) ? r[0] ?? 0 : r, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y, x + w, y + h, rad);
    this.arcTo(x + w, y + h, x, y + h, rad);
    this.arcTo(x, y + h, x, y, rad);
    this.arcTo(x, y, x + w, y, rad);
    this.closePath();
  };
}
export {};
