/**
 * Effets visuels autour des personnages : auras de skins (même à l'arrêt),
 * traînées équipées (en courant), traces au sol et éclats de capacité.
 * Débits volontairement faibles : ça doit habiller, pas gêner la lecture.
 */
import type { AuraId, Palette } from "../core/characters";
import { getTrail, type TrailKind } from "../core/cosmetics";
import type { Particles } from "./particles";

const rnd = (a = 1) => (Math.random() - 0.5) * a;
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/** Taux d'émission (particules par seconde) des auras. */
const AURA_RATE: Record<AuraId, number> = {
  none: 0,
  leaves: 1.4,
  embers: 5,
  snow: 3.5,
  sparkle: 4,
  stars: 3,
  bubbles: 2.5,
  bolts: 2.2,
  smoke: 3,
  cosmos: 5,
  petals: 2.5,
  hearts: 1.6,
};

export function emitAura(P: Particles, aura: AuraId, x: number, y: number, c: Palette, dt: number, acc: { a: number }, scale = 1) {
  const rate = AURA_RATE[aura] * scale;
  if (!rate) return;
  acc.a += rate * dt;
  while (acc.a >= 1) {
    acc.a -= 1;
    const px = x + rnd(0.7);
    const py = y + rnd(0.3);
    switch (aura) {
      case "leaves":
        P.spawn("petal", px, py, { z: 0.9 + Math.random() * 0.3, vz: -0.35, vx: rnd(0.4), life: 2, size: 0.07, color: pick(["#7bd389", "#c9e265", "#f4a259"]), vr: rnd(4) });
        break;
      case "embers":
        P.spawn("ember", px, py, { z: 0.2 + Math.random() * 0.4, vz: 0.6 + Math.random() * 0.5, vx: rnd(0.3), life: 0.9 + Math.random() * 0.5, size: 0.035, color: pick(["#ffb347", "#ff6a1f", "#ffd166"]) });
        break;
      case "snow":
        P.spawn("flake", px, py, { z: 1 + Math.random() * 0.3, vz: -0.45, life: 2.2, size: 0.06, color: "#ffffff", vr: rnd(2) });
        break;
      case "sparkle":
        P.spawn("twinkle", px, py, { z: 0.3 + Math.random() * 0.8, vz: 0.15, life: 0.8, size: 0.1, color: pick(["#fff3b0", "#ffd60a", "#ffffff"]) });
        break;
      case "stars":
        P.spawn("twinkle", px, py, { z: 0.4 + Math.random() * 0.7, vz: 0.2, life: 0.9, size: 0.09, color: pick([c.accent, "#ffffff"]) });
        break;
      case "bubbles":
        P.spawn("bubble", px, py, { z: 0.2 + Math.random() * 0.3, vz: 0.5, life: 1.6, size: 0.05 + Math.random() * 0.04, color: "#bdf2ff" });
        break;
      case "bolts":
        P.spawn("bolt", px + rnd(0.3), py, { z: 0.3 + Math.random() * 0.6, life: 0.22, size: 0.13, color: pick([c.accent, "#ffffff", "#7df9ff"]) });
        break;
      case "smoke":
        P.spawn("smoke", px, y + 0.2, { z: 0.05, vz: 0.25, vx: rnd(0.3), life: 1, size: 0.11, color: pick(["#4a4458", "#6e6680"]) });
        break;
      case "cosmos":
        if (Math.random() < 0.5) P.spawn("twinkle", px + rnd(0.3), py, { z: 0.3 + Math.random() * 0.9, vz: 0.1, life: 1, size: 0.09, color: pick(["#ffffff", "#ffe8a3", "#c8b6ff"]) });
        else P.spawn("glow", px, py, { z: 0.3 + Math.random() * 0.6, vz: 0.15, life: 1.2, size: 0.06, color: pick(["#ff7ad9", "#7b61ff", "#4cc9f0"]) });
        break;
      case "petals":
        P.spawn("petal", px, py, { z: 1 + Math.random() * 0.3, vz: -0.4, vx: rnd(0.5), life: 2, size: 0.065, color: pick(["#ffb3c6", "#ff86b8", "#ffffff"]), vr: rnd(5) });
        break;
      case "hearts":
        P.spawn("heart", px, py, { z: 0.6 + Math.random() * 0.4, vz: 0.4, life: 1.2, size: 0.07, color: pick(["#ff5d8f", "#ffb3c6"]) });
        break;
    }
  }
}

/** Traînée en courant (+ empreintes au sol pour certains effets). */
export function emitTrail(P: Particles, trailId: string | undefined, x: number, y: number, fx: number, fy: number, dt: number, acc: { t: number; step: number }, fast: boolean) {
  const def = getTrail(trailId);
  const k = def.kind;
  const bx = x - fx * 0.28;
  const by = y + 0.26 - fy * 0.2;
  acc.t += dt * (fast ? 16 : 10);
  acc.step += dt;
  while (acc.t >= 1) {
    acc.t -= 1;
    trailParticle(P, k, bx + rnd(0.2), by + rnd(0.12), def.colors, fx, fy);
  }
  // empreintes
  if (acc.step > 0.22) {
    acc.step = 0;
    const side = Math.random() < 0.5 ? -1 : 1;
    const mx = x + fy * 0.1 * side;
    const my = y + 0.3 + fx * 0.06 * side;
    if (k === "fire") P.mark("glow", mx, my, { life: 1.2, size: 0.18, color: "#ff7a1a" });
    else if (k === "snow") P.mark("frost", mx, my, { life: 2, size: 0.14, color: "#e8f6ff" });
    else if (k === "rainbow") P.mark("print", mx, my, { life: 1.6, size: 0.22, color: pick(def.colors) });
    else if (k === "stardust") P.mark("glow", mx, my, { life: 1.2, size: 0.16, color: "#fff3b0" });
  }
}

function trailParticle(P: Particles, k: TrailKind, x: number, y: number, colors: string[], fx: number, fy: number) {
  const back = { vx: -fx * 0.6 + rnd(0.4), vy: -fy * 0.6 + rnd(0.3) };
  switch (k) {
    case "dust":
      if (Math.random() < 0.55) P.spawn("smoke", x, y, { ...back, vz: 0.25, life: 0.45, size: 0.08, color: pick(colors) });
      break;
    case "sparks":
      P.spawn("spark", x, y, { vx: back.vx * 2, vy: back.vy * 2, vz: 1.5 + Math.random() * 1.5, life: 0.35, size: 0.045, color: pick(colors) });
      break;
    case "leaves":
      P.spawn("leaf", x, y, { ...back, z: 0.1, vz: 1.2 + Math.random(), life: 0.7, size: 0.06, color: pick(colors) });
      break;
    case "bubbles":
      if (Math.random() < 0.6) P.spawn("bubble", x, y, { ...back, z: 0.15, vz: 0.5, life: 1.1, size: 0.04 + Math.random() * 0.04, color: pick(colors) });
      break;
    case "snow":
      P.spawn("flake", x, y, { ...back, z: 0.15, vz: 0.3, life: 0.9, size: 0.05, color: pick(colors), vr: rnd(3) });
      break;
    case "hearts":
      if (Math.random() < 0.5) P.spawn("heart", x, y, { ...back, z: 0.2, vz: 0.55, life: 0.9, size: 0.06, color: pick(colors) });
      break;
    case "fire":
      P.spawn("ember", x, y, { ...back, z: 0.05, vz: 0.7 + Math.random() * 0.5, life: 0.5, size: 0.05, color: pick(colors) });
      break;
    case "bolts":
      if (Math.random() < 0.5) P.spawn("bolt", x, y, { z: 0.15 + Math.random() * 0.25, life: 0.16, size: 0.12, color: pick(colors) });
      break;
    case "notes":
      if (Math.random() < 0.35) P.spawn("note", x, y, { ...back, z: 0.3, vz: 0.6, life: 1, size: 0.08, color: pick(colors) });
      break;
    case "rainbow":
      P.spawn("glow", x, y, { vx: back.vx * 0.3, vy: back.vy * 0.3, z: 0.1, vz: 0.05, life: 0.55, size: 0.07, color: pick(colors) });
      break;
    case "stardust":
      P.spawn("twinkle", x, y, { ...back, z: 0.1 + Math.random() * 0.3, vz: 0.3, life: 0.6, size: 0.08, color: pick(colors) });
      break;
  }
}

/** Éclat à la pose d'une bombe (« capacité »), aux couleurs de l'effet équipé. */
export function abilityBurst(P: Particles, trailId: string | undefined, x: number, y: number) {
  const def = getTrail(trailId);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    trailParticle(P, def.kind, x + Math.cos(a) * 0.2, y + 0.2 + Math.sin(a) * 0.12, def.colors, -Math.cos(a), -Math.sin(a));
  }
  P.spawn("ring", x, y + 0.25, { life: 0.3, size: 0.12, color: def.colors[0] });
}

/** Lignes de vitesse derrière un joueur rapide. */
export function speedLines(P: Particles, x: number, y: number, fx: number, fy: number) {
  if (Math.random() < 0.45)
    P.spawn("streak", x - fx * 0.3 + rnd(0.25) * Math.abs(fy || 0.6), y - 0.1 - fy * 0.3 + rnd(0.35) * Math.abs(fx || 0.6), {
      vx: fx * 3, vy: fy * 3, z: 0.05 + Math.random() * 0.25, life: 0.18, size: 0.08, color: "rgba(255,255,255,0.9)",
    });
}
