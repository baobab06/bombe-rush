/* Dessine l'icône de l'app (utilisé par make-assets.py pour produire les PNG). */
import { drawCharacter, lookOf } from "../src/render/bodies";
import { drawBomb } from "../src/render/sprites";

type Shape = "square" | "round" | "maskable" | "foreground" | "background";

function background(ctx: CanvasRenderingContext2D, S: number) {
  const g = ctx.createRadialGradient(S * 0.5, S * 0.4, S * 0.05, S * 0.5, S * 0.5, S * 0.78);
  g.addColorStop(0, "#5b45d6");
  g.addColorStop(0.55, "#2e2385");
  g.addColorStop(1, "#140f3c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // rayons dorés
  ctx.save();
  ctx.translate(S * 0.5, S * 0.46);
  ctx.fillStyle = "rgba(255,210,63,0.13)";
  for (let i = 0; i < 14; i++) {
    ctx.rotate((Math.PI * 2) / 14);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-S * 0.09, -S * 0.8);
    ctx.lineTo(S * 0.09, -S * 0.8);
    ctx.fill();
  }
  ctx.restore();
}

function art(ctx: CanvasRenderingContext2D, S: number) {
  // halo d'explosion
  const h = ctx.createRadialGradient(S * 0.66, S * 0.42, 0, S * 0.66, S * 0.42, S * 0.3);
  h.addColorStop(0, "rgba(255,200,80,0.55)");
  h.addColorStop(1, "rgba(255,160,40,0)");
  ctx.fillStyle = h;
  ctx.beginPath();
  ctx.arc(S * 0.66, S * 0.42, S * 0.3, 0, Math.PI * 2);
  ctx.fill();
  drawBomb(ctx, S * 0.66, S * 0.44, S * 0.5, 0.9, 0.3, 1);
  drawCharacter(ctx, S * 0.4, S * 0.55, S * 0.76, lookOf("renard"), { faceX: 0, faceY: 1, walk: 0, moving: false, t: 0, expr: "happy", noShadow: false }, "#140f3c");
}

(window as unknown as { drawIcon: (c: HTMLCanvasElement, shape: Shape | boolean) => void }).drawIcon = (c, shapeArg) => {
  const shape: Shape = shapeArg === true ? "maskable" : shapeArg === false ? "square" : shapeArg;
  const ctx = c.getContext("2d")!;
  const S = c.width;
  ctx.clearRect(0, 0, S, S);
  if (shape === "background") return background(ctx, S);
  ctx.save();
  if (shape === "square" || shape === "round") {
    ctx.beginPath();
    if (shape === "round") ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    else ctx.roundRect(0, 0, S, S, S * 0.22);
    ctx.clip();
  }
  if (shape !== "foreground") background(ctx, S);
  // zone de sécurité : icônes « maskable » (80 %) et premier plan adaptatif Android (66/108)
  const k = shape === "maskable" ? 0.8 : shape === "foreground" ? 0.62 : shape === "round" ? 0.9 : 1;
  ctx.translate(S / 2, S / 2);
  ctx.scale(k, k);
  ctx.translate(-S / 2, -S / 2);
  art(ctx, S);
  ctx.restore();
};
