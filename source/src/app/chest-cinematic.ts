/**
 * CINÉMATIQUE D'OUVERTURE D'UN COFFRE (canvas).
 *
 *  1. le coffre tombe du ciel, s'écrase au sol (poussière, secousse) ;
 *  2. il sautille de plus en plus fort, la lumière s'échappe par la fente ;
 *  3. il se ramasse, la serrure saute, le couvercle bascule : éclair,
 *     onde de choc, faisceau de lumière, pluie de pièces ;
 *  4. les récompenses jaillissent UNE PAR UNE (orbe à la couleur de la
 *     rareté, montée de tension pour Épique / Légendaire), le joueur
 *     touche l'écran pour passer à la suivante ;
 *  5. récapitulatif : toutes les cartes, RÉCUPÉRER / OUVRIR UN AUTRE.
 *
 * Le contenu est tiré et SAUVEGARDÉ avant la cinématique : elle ne fait
 * qu'afficher le résultat (passer, quitter ou recharger ne change rien).
 */
import { audio } from "../audio/audio";
import { RARITY_LABEL, type Rarity } from "../core/characters";
import type { ChestOpening, Granted } from "../meta/grants";
import { CHESTS, type ChestTier } from "../meta/progress-config";
import { haptics } from "../platform/haptics";
import { CHEST_PAL, CHEST_SEAM, drawChest, drawLock } from "../ui/chest-art";
import { fmt, type AppCtx } from "./ctx";
import { grantCard } from "./rewards";

const RARITY_COLOR: Record<Rarity, string> = { common: "#c3d2e2", rare: "#4fb0ff", epic: "#c27bff", legend: "#ffd23f" };
const COIN_COLOR = "#ffd23f";
const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legend: 3 };
/** durée des sautillements, nombre de sauts, pièces qui jaillissent */
const TIER: Record<ChestTier, { shake: number; hops: number; coins: number; power: number }> = {
  common: { shake: 1.0, hops: 3, coins: 10, power: 0.7 },
  rare: { shake: 1.15, hops: 3, coins: 14, power: 0.85 },
  epic: { shake: 1.45, hops: 4, coins: 20, power: 1 },
  legend: { shake: 1.85, hops: 5, coins: 28, power: 1.25 },
};
/** montée de tension avant qu'une récompense jaillisse */
const CHARGE: Record<Rarity, number> = { common: 0.16, rare: 0.3, epic: 0.75, legend: 1.15 };
const FLY = 0.46;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const easeOutBack = (x: number) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hex = (v: number[]) => "#" + v.map((n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, k: number) => {
  const x = rgb(a), y = rgb(b);
  return hex([lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)]);
};

type Kind = "dust" | "spark" | "coin" | "star" | "ring" | "trail";
interface Part {
  k: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  g: number;
  floor?: number;
}

interface Reveal {
  g: Granted;
  color: string;
  rarity: Rarity | null;
  state: "charge" | "fly" | "shown";
  t0: number;
  charge: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  pos: { x: number; y: number };
}

export class ChestCinematic {
  private el: HTMLElement;
  private cv: HTMLCanvasElement;
  private c: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private u = 1;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private t = 0;
  private closed = false;
  private phase: "intro" | "reveal" | "summary" = "intro";
  private tier: ChestTier;
  private ch = { x: 0, base: 0, size: 0, tx: 0, tb: 0, ts: 0, yOff: 0, jx: 0, rot: 0, open: 0, glow: 0, beam: 0, beamT: 1, lock: true, alpha: 0 };
  /** dernier « rebond » : écrasement (amp > 0) ou étirement (amp < 0) */
  private sq = { t0: -9, amp: 0 };
  private light: string;
  private lightT: string;
  private rays = { a: 0, aT: 0, rot: 0 };
  private shake = 0;
  /** caméra : zoom lent pendant la montée de tension, coup de zoom à l'explosion */
  private zoom = 1;
  private zoomT = 1;
  /** ralenti (secondes restantes) au moment où le coffre s'ouvre */
  private slow = 0;
  private flash = 0;
  private flashColor = "#ffffff";
  private parts: Part[] = [];
  private lockP: { x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number } | null = null;
  private ev = { landed: false, hops: 0, wind: false, burst: false };
  private T: { drop: number; land: number; shake: number; wind: number; burst: number; reveal: number };
  private queue: Granted[];
  private idx = -1;
  private item: Reveal | null = null;
  private autoAt = 0;
  private onResize = () => this.layout();

  constructor(
    private ctx: AppCtx,
    private res: ChestOpening,
    private before: number,
    private hooks: { onClose: () => void; again: () => (() => void) | null },
  ) {
    const tier = (this.tier = res.tier);
    const k = TIER[tier];
    this.T = { drop: 0.12, land: 0.6, shake: 1.0, wind: 1.0 + k.shake, burst: 1.32 + k.shake, reveal: 2.1 + k.shake };
    this.light = this.lightT = CHEST_PAL[tier].glow;
    // pièces d'abord, puis les objets du moins rare au plus rare (le meilleur pour la fin)
    const coinG: Granted = { reward: { kind: "coins", amount: res.coins }, label: `+${fmt(res.coins)} pièces`, icon: "🪙", coins: res.coins };
    this.queue = [coinG, ...[...res.items].sort((a, b) => RARITY_RANK[a.rarity ?? "common"] - RARITY_RANK[b.rarity ?? "common"])];

    const el = document.createElement("div");
    el.className = `chest-fx c-${tier}`;
    el.id = "chestFx";
    el.innerHTML = `
      <canvas class="cf-canvas"></canvas>
      <div class="cf-top"><span class="cf-name">${CHESTS[tier].name}</span><div class="wallet" data-wallet data-wallet-top><i class="coin"></i><b data-coins>0</b></div></div>
      <div class="cf-reveal" hidden></div>
      <div class="cf-spot" hidden></div>
      <div class="cf-cards" hidden></div>
      <div class="cf-actions" hidden></div>
      <button class="cf-skip" id="btnChestSkip">PASSER ⏩</button>
      <p class="cf-hint">Touche l'écran pour ouvrir plus vite</p>`;
    const app = document.getElementById("app")!;
    app.insertBefore(el, document.getElementById("uiFx"));
    this.el = el;
    this.cv = el.querySelector("canvas")!;
    this.c = this.cv.getContext("2d")!;
    // le compteur affiche l'ancien solde jusqu'au récapitulatif
    el.querySelector<HTMLElement>("[data-coins]")!.textContent = fmt(before);
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".cf-actions")) return;
      this.tap();
    });
    el.querySelector("#btnChestSkip")!.addEventListener("click", (e) => {
      e.stopPropagation();
      this.skip();
    });
    window.addEventListener("resize", this.onResize);
    this.layout(true);
    audio.play("whoosh");
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) this.skip();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------ mise en page
  private layout(snap = false) {
    const el = this.el;
    this.W = el.clientWidth || 800;
    this.H = el.clientHeight || 400;
    this.u = this.H / 100;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.target(snap);
    if (this.item?.state === "shown") this.placeCard();
  }
  private get wide() {
    return this.W / this.H >= 1.25;
  }
  private cardPos() {
    return this.wide ? { x: this.W * 0.66, y: this.H * 0.5 } : { x: this.W / 2, y: this.H * 0.36 };
  }
  /** Où le coffre doit aller selon l'étape. */
  private target(snap = false) {
    const { W, H, u, ch } = this;
    if (this.phase === "intro") {
      ch.tx = W / 2;
      ch.tb = H * 0.77;
      ch.ts = Math.min(58 * u, W * 0.46);
    } else if (this.phase === "reveal") {
      if (this.wide) {
        ch.tx = W * 0.29;
        ch.tb = H * 0.76;
        ch.ts = Math.min(42 * u, W * 0.3);
      } else {
        ch.tx = W / 2;
        ch.tb = H * 0.9;
        ch.ts = Math.min(30 * u, W * 0.42);
      }
    } else {
      const spot = this.el.querySelector<HTMLElement>(".cf-spot")!;
      ch.tx = spot.offsetLeft + spot.offsetWidth / 2;
      ch.tb = spot.offsetTop + spot.offsetHeight - 0.6 * u;
      ch.ts = spot.offsetHeight * 1.12;
    }
    if (snap) {
      ch.x = ch.tx;
      ch.base = ch.tb;
      ch.size = ch.ts;
    }
  }

  // --------------------------------------------------------------- particules
  private add(k: Kind, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, g = 0, floor?: number) {
    if (this.parts.length > 420) return;
    this.parts.push({ k, x, y, vx, vy, life, max: life, size, color, rot: rnd(0, 6.28), vr: rnd(-9, 9), g, floor });
  }
  private dust(x: number, y: number, n: number, power = 1) {
    const u = this.u;
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.add("dust", x + dir * rnd(0.1, 0.5) * this.ch.size, y - rnd(0, 1.5) * u, dir * rnd(8, 34) * u * power, -rnd(2, 10) * u * power, rnd(0.45, 0.85), rnd(2, 4.6) * u, "#cdc6ff");
    }
  }
  private sparks(x: number, y: number, n: number, speed: number, color: string, up = 0) {
    const u = this.u;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.28), v = rnd(0.35, 1) * speed * u;
      this.add("spark", x, y, Math.cos(a) * v, Math.sin(a) * v - up * u, rnd(0.35, 0.8), rnd(0.5, 1.1) * u, color, 60 * u);
    }
  }
  private stars(x: number, y: number, n: number, speed: number, color: string) {
    const u = this.u;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.28), v = rnd(0.3, 1) * speed * u;
      this.add("star", x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.5, 1.1), rnd(1.2, 2.8) * u, Math.random() < 0.35 ? "#ffffff" : color, 14 * u);
    }
  }
  private coins(x: number, y: number, n: number) {
    const u = this.u;
    for (let i = 0; i < n; i++) this.add("coin", x + rnd(-0.25, 0.25) * this.ch.size, y, rnd(-40, 40) * u, -rnd(62, 108) * u, rnd(1.2, 1.9), rnd(1.5, 2.2) * u, COIN_COLOR, 205 * u, this.ch.base + rnd(-1, 3) * u);
  }
  private ring(x: number, y: number, size: number, color: string, life = 0.55) {
    this.add("ring", x, y, 0, 0, life, size, color);
  }

  // ------------------------------------------------------------------ étapes
  private seam() {
    const ch = this.ch;
    return { x: ch.x, y: ch.base - CHEST_SEAM * ch.size };
  }
  private land() {
    this.ev.landed = true;
    const ch = this.ch;
    this.sq = { t0: this.t, amp: 0.3 };
    this.shake = Math.max(this.shake, 1.7 * this.u);
    this.dust(ch.x, ch.base, 16);
    audio.play("chestLand");
    haptics.pulse(28);
  }
  private hop(amp: number) {
    const ch = this.ch;
    this.sq = { t0: this.t, amp: 0.13 * amp };
    this.shake = Math.max(this.shake, 0.9 * this.u * amp);
    this.dust(ch.x, ch.base, 5, 0.6);
    const s = this.seam();
    this.sparks(s.x + rnd(-0.3, 0.3) * ch.size, s.y, 6, 34, this.light, 14);
    audio.play("chestHop", 0.5 + 0.5 * amp);
    haptics.pulse(12 + 14 * amp);
  }
  private burst() {
    this.ev.burst = true;
    this.ev.landed = true;
    const ch = this.ch, u = this.u, tier = this.tier, k = TIER[tier];
    const s = this.seam();
    ch.lock = false;
    ch.yOff = 0;
    ch.jx = 0;
    ch.rot = 0;
    this.lockP = { x: s.x, y: s.y + 0.035 * ch.size, vx: rnd(-34, 34) * u, vy: -rnd(70, 90) * u, rot: 0, vr: rnd(-14, 14), life: 1.4 };
    this.sq = { t0: this.t, amp: -0.24 };
    this.flash = 0.9;
    this.flashColor = "#ffffff";
    this.slow = 0.3;
    this.zoom = 0.93;
    this.zoomT = 1;
    this.shake = Math.max(this.shake, 3 * u * k.power);
    this.rays.aT = 0.95;
    this.ring(s.x, s.y, 7 * u, "#ffffff", 0.6);
    this.ring(s.x, s.y, 4 * u, CHESTS[tier].color, 0.85);
    this.coins(s.x, s.y, k.coins);
    this.sparks(s.x, s.y, Math.round(46 * k.power), 95, this.light, 30);
    this.stars(s.x, s.y - 4 * u, Math.round(16 * k.power), 60, CHEST_PAL[tier].glow);
    audio.play("chestBurst");
    haptics.pulse(tier === "legend" ? 95 : tier === "epic" ? 70 : 45);
    if (tier === "legend" || tier === "epic") {
      const cc = this.ctx.fx.center(this.el);
      this.ctx.fx.confetti(cc.x, cc.y, tier === "legend" ? 120 : 70, 1.4);
    }
  }

  private startReveal() {
    this.phase = "reveal";
    this.zoomT = 1;
    this.el.classList.add("revealing");
    this.target();
    this.ch.beamT = 0.6;
    this.next();
  }

  /** Récompense suivante (ou récapitulatif). */
  private next() {
    this.dropCard();
    this.idx++;
    this.autoAt = 0;
    if (this.idx >= this.queue.length) return this.summary();
    const g = this.queue[this.idx];
    const rarity = g.rarity ?? null;
    const color = rarity ? RARITY_COLOR[rarity] : COIN_COLOR;
    const charge = rarity ? CHARGE[rarity] : 0.16;
    this.item = { g, color, rarity, state: "charge", t0: this.t, charge, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, pos: { x: 0, y: 0 } };
    this.lightT = color;
    this.hint("");
    if (rarity === "epic" || rarity === "legend") {
      audio.play("chestCharge", rarity === "legend" ? 1 : 0.7);
      this.ch.beamT = 1;
    } else this.ch.beamT = 0.6;
  }
  private spit() {
    const it = this.item!, ch = this.ch, u = this.u;
    const s = this.seam();
    it.state = "fly";
    it.t0 = this.t;
    it.from = { x: s.x, y: s.y - 2 * u };
    it.to = this.cardPos();
    it.pos = { ...it.from };
    ch.jx = 0;
    this.sq = { t0: this.t, amp: -0.17 };
    this.sparks(s.x, s.y, 14, 60, it.color, 40);
    audio.play("orb");
    haptics.pulse(14);
  }
  private arrive() {
    const it = this.item!, u = this.u;
    it.state = "shown";
    it.pos = { ...it.to };
    const r = it.rarity;
    const rank = r ? RARITY_RANK[r] : 0;
    this.flash = [0.16, 0.3, 0.55, 0.9][rank];
    this.flashColor = rank >= 2 ? mix(it.color, "#ffffff", 0.45) : it.color;
    this.shake = Math.max(this.shake, [0.5, 0.9, 2, 3.4][rank] * u);
    this.ring(it.to.x, it.to.y, 6 * u, it.color, 0.6);
    if (rank >= 2) this.ring(it.to.x, it.to.y, 10 * u, "#ffffff", 0.8);
    this.stars(it.to.x, it.to.y, [10, 16, 28, 44][rank], [50, 60, 80, 100][rank], it.color);
    this.sparks(it.to.x, it.to.y, [8, 14, 26, 40][rank], 80, it.color);
    if (!r) for (let i = 0; i < 12; i++) this.add("coin", it.to.x, it.to.y, rnd(-36, 36) * u, -rnd(30, 70) * u, rnd(0.9, 1.4), rnd(1.4, 2) * u, COIN_COLOR, 190 * u);
    audio.play(r === "legend" ? "revealLegend" : r === "epic" ? "revealEpic" : r === "rare" ? "revealRare" : r ? "revealCommon" : "coin");
    haptics.pulse([18, 25, 55, 95][rank]);
    this.rays.aT = [0.6, 0.7, 0.9, 1][rank];
    if (rank >= 2) {
      this.zoom = rank === 3 ? 1.07 : 1.04;
      this.slow = rank === 3 ? 0.22 : 0.12;
    }
    // la carte
    const box = this.el.querySelector<HTMLElement>(".cf-reveal")!;
    box.innerHTML = "";
    const tag = document.createElement("span");
    tag.className = `cf-rarity ${r ? "r-" + r : "r-coins"}`;
    tag.textContent = r ? RARITY_LABEL[r].toUpperCase() + (rank >= 2 ? " !" : "") : "PIÈCES";
    const card = grantCard(it.g, this.ctx);
    if (rank >= 2) card.classList.add("shine");
    box.append(tag, card);
    box.className = `cf-reveal in ${r ? "r-" + r : "r-coins"}`;
    box.hidden = false;
    this.placeCard();
    if (rank >= 2) {
      const cc = this.ctx.fx.center(card);
      this.ctx.fx.confetti(cc.x, cc.y, rank === 3 ? 110 : 60, 1.3);
    }
    const left = this.queue.length - this.idx - 1;
    this.hint(left ? "Touche pour continuer" : "Touche pour voir le récapitulatif");
    this.autoAt = this.t + [2.4, 2.6, 3.2, 3.8][rank];
  }
  private placeCard() {
    const box = this.el.querySelector<HTMLElement>(".cf-reveal")!;
    const p = this.cardPos();
    box.style.left = `${p.x}px`;
    box.style.top = `${p.y}px`;
  }
  private dropCard() {
    const box = this.el.querySelector<HTMLElement>(".cf-reveal");
    if (box && !box.hidden) {
      box.hidden = true;
      box.innerHTML = "";
    }
    this.item = null;
  }
  private hint(text: string) {
    const h = this.el.querySelector<HTMLElement>(".cf-hint");
    if (!h) return;
    h.textContent = text;
    h.hidden = !text;
  }

  /** Récapitulatif : exactement ce qui a été donné, puis RÉCUPÉRER / OUVRIR UN AUTRE. */
  private summary() {
    if (this.phase === "summary") return;
    this.phase = "summary";
    this.dropCard();
    const el = this.el, res = this.res, tier = this.tier;
    el.classList.remove("revealing");
    el.classList.add("revealed");
    el.querySelector(".cf-skip")?.remove();
    this.hint("");
    this.lightT = CHEST_PAL[tier].glow;
    this.ch.beamT = 0.35;
    this.rays.aT = 0.6;
    const spot = el.querySelector<HTMLElement>(".cf-spot")!;
    const cards = el.querySelector<HTMLElement>(".cf-cards")!;
    const actions = el.querySelector<HTMLElement>(".cf-actions")!;
    spot.hidden = false;
    cards.hidden = false;
    this.queue.forEach((g, i) => {
      const card = grantCard(g, this.ctx);
      const rare = g.rarity === "epic" || g.rarity === "legend";
      if (rare) card.classList.add("shine");
      card.style.animationDelay = `${0.05 + i * 0.12}s`;
      if (g.rarity) card.insertAdjacentHTML("afterbegin", `<span class="gc-rar">${RARITY_LABEL[g.rarity].toUpperCase()}${g.rarity === "legend" ? " !" : ""}</span>`);
      cards.appendChild(card);
    });
    const ok = document.createElement("button");
    ok.className = "btn btn-yellow";
    ok.id = "btnChestOk";
    ok.innerHTML = "<span>RÉCUPÉRER</span>";
    ok.addEventListener("click", () => {
      this.ctx.click();
      this.close();
    });
    actions.appendChild(ok);
    const again = this.hooks.again();
    if (again) {
      const b = document.createElement("button");
      b.className = "btn btn-blue";
      b.id = "btnChestAgain";
      b.innerHTML = `<span>OUVRIR UN AUTRE (${this.ctx.profile.chests[tier]})</span>`;
      b.addEventListener("click", () => {
        this.ctx.click();
        this.close();
        again();
      });
      actions.appendChild(b);
    }
    actions.hidden = false;
    this.target();
    audio.play("unlock", 0.7);
    const gained = res.coins + res.items.reduce((a, g) => a + g.coins, 0);
    window.setTimeout(() => !this.closed && this.ctx.wallet.earn(this.ctx.fx, cards, gained, this.before), 350);
  }

  /** Toucher l'écran : accélère l'étape en cours. */
  private tap() {
    if (this.closed) return;
    if (this.phase === "intro") {
      if (this.t < this.T.burst) {
        this.ev.landed = true;
        this.ev.hops = 99;
        this.ev.wind = true;
        this.ch.alpha = 1;
        this.t = this.T.burst;
      } else this.t = Math.max(this.t, this.T.reveal);
    } else if (this.phase === "reveal" && this.item) {
      if (this.item.state === "shown") {
        this.ctx.click();
        this.next();
      } else {
        if (this.item.state === "charge") this.spit();
        this.arrive();
      }
    }
  }

  /** PASSER : directement au récapitulatif. */
  private skip() {
    if (this.closed || this.phase === "summary") return;
    const ch = this.ch;
    this.ev = { landed: true, hops: 99, wind: true, burst: true };
    this.zoom = this.zoomT = 1;
    this.slow = 0;
    ch.alpha = 1;
    ch.open = 1;
    ch.glow = 1;
    ch.beam = 0.5;
    ch.lock = false;
    ch.yOff = ch.jx = ch.rot = 0;
    this.lockP = null;
    this.flash = 0.5;
    this.flashColor = "#ffffff";
    this.summary();
    this.target(true);
  }

  // ----------------------------------------------------------------- boucle
  private frame = (now: number) => {
    if (this.closed) return;
    const real = clamp((now - this.last) / 1000, 0, 0.05);
    let dt = real;
    this.last = now;
    if (this.slow > 0) {
      this.slow -= dt;
      dt *= 0.32;
    }
    // l'éclair et les secousses s'éteignent en temps réel (pas au ralenti)
    this.flash *= Math.exp(-real * 6.5);
    this.shake *= Math.exp(-real * 9);
    this.t += dt;
    this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number) {
    const { ch, T, u, tier } = this;
    const t = this.t;
    const k = TIER[tier];
    if (this.phase === "intro") {
      if (t < T.drop) ch.alpha = 0;
      else if (t < T.land && !this.ev.landed) {
        const p = (t - T.drop) / (T.land - T.drop);
        ch.alpha = Math.min(1, p * 5);
        ch.yOff = -(1 - p * p) * this.H * 0.9;
        ch.rot = (1 - p) * -0.32;
      } else {
        if (!this.ev.landed) this.land();
        ch.alpha = 1;
        ch.yOff = 0;
        ch.rot = 0;
        ch.jx = 0;
        if (t >= T.shake && t < T.wind) {
          // sautille de plus en plus fort, la lumière monte
          const a = (t - T.shake) / (T.wind - T.shake);
          const f = a * k.hops;
          const n = Math.floor(f), h = f - n;
          const amp = 0.4 + 0.6 * ((n + 1) / k.hops);
          ch.yOff = -Math.sin(Math.PI * h) * 7.5 * u * amp;
          ch.rot = Math.sin(h * Math.PI * 2) * 0.1 * amp * (n % 2 ? 1 : -1);
          if (n > this.ev.hops) {
            this.ev.hops = n;
            this.hop(amp);
          }
          ch.glow = a * a * 0.9;
          this.rays.aT = 0.1 + 0.5 * a;
          this.zoomT = 1 + 0.1 * a;
          if (Math.random() < dt * 34 * a) {
            const s = this.seam();
            this.add("spark", s.x + rnd(-0.42, 0.42) * ch.size, s.y + ch.yOff, rnd(-14, 14) * u, -rnd(18, 46) * u, rnd(0.3, 0.7), rnd(0.4, 0.9) * u, this.light, 40 * u);
          }
        } else if (t >= T.wind && t < T.burst) {
          // se ramasse avant d'exploser
          const w = (t - T.wind) / (T.burst - T.wind);
          if (!this.ev.wind) {
            this.ev.wind = true;
            audio.play("chestCharge", 0.8);
            this.hop(1);
          }
          ch.glow = 1;
          ch.jx = (Math.random() - 0.5) * 1.6 * u * w;
          this.sq = { t0: t, amp: 0.2 * easeOut(w) };
          this.rays.aT = 0.6 + 0.25 * w;
          this.zoomT = 1.1 + 0.08 * w;
        } else if (t >= T.burst) {
          if (!this.ev.burst) this.burst();
          const o = (t - T.burst) / 0.42;
          ch.open = easeOutBack(Math.min(1, o));
          ch.beam = Math.min(1, o * 1.6);
          ch.glow = 1;
          if (t >= T.reveal) this.startReveal();
        }
      }
    } else {
      ch.alpha = 1;
      ch.open = lerp(ch.open, 1, 1 - Math.exp(-dt * 10));
      ch.glow = 1;
      ch.beam = lerp(ch.beam, ch.beamT, 1 - Math.exp(-dt * 6));
      ch.jx = 0;
      const it = this.item;
      if (this.phase === "reveal" && it) {
        const s = t - it.t0;
        if (it.state === "charge") {
          const q = clamp(s / it.charge, 0, 1);
          const big = it.rarity === "epic" || it.rarity === "legend";
          if (big) {
            ch.jx = (Math.random() - 0.5) * 1.5 * u * q;
            this.sq = { t0: t, amp: 0.12 * q };
            this.rays.aT = 0.5 + 0.5 * q;
            if (Math.random() < dt * 40) {
              const m = this.seam();
              this.add("spark", m.x + rnd(-0.4, 0.4) * ch.size, m.y, rnd(-10, 10) * u, -rnd(30, 70) * u, rnd(0.3, 0.6), rnd(0.5, 1) * u, it.color, 30 * u);
            }
          }
          if (s >= it.charge) this.spit();
        } else if (it.state === "fly") {
          const q = clamp(s / FLY, 0, 1);
          const e = easeOut(q);
          const cx = lerp(it.from.x, it.to.x, 0.35), cy = Math.min(it.from.y, it.to.y) - 34 * u;
          it.pos.x = (1 - e) * (1 - e) * it.from.x + 2 * (1 - e) * e * cx + e * e * it.to.x;
          it.pos.y = (1 - e) * (1 - e) * it.from.y + 2 * (1 - e) * e * cy + e * e * it.to.y;
          this.add("trail", it.pos.x, it.pos.y, 0, 0, 0.32, 2.6 * u, it.color);
          if (Math.random() < 0.6) this.add("star", it.pos.x, it.pos.y, rnd(-12, 12) * u, rnd(-12, 12) * u, 0.4, rnd(0.8, 1.6) * u, it.color);
          if (q >= 1) this.arrive();
        } else if (this.autoAt && t >= this.autoAt) this.next();
      }
    }
    // déplacement doux vers la position de l'étape
    const m = 1 - Math.exp(-dt * 7);
    ch.x = lerp(ch.x, ch.tx, m);
    ch.base = lerp(ch.base, ch.tb, m);
    ch.size = lerp(ch.size, ch.ts, m);
    this.light = mix(this.light, this.lightT, 1 - Math.exp(-dt * 9));
    this.rays.a = lerp(this.rays.a, this.rays.aT, 1 - Math.exp(-dt * 5));
    this.rays.rot += dt * 0.35;
    this.zoom = lerp(this.zoom, this.zoomT, 1 - Math.exp(-dt * 6));
    // serrure qui s'envole
    const L = this.lockP;
    if (L) {
      L.vy += 230 * u * dt;
      L.x += L.vx * dt;
      L.y += L.vy * dt;
      L.rot += L.vr * dt;
      L.life -= dt;
      if (L.life <= 0) this.lockP = null;
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.k === "dust") {
        p.vx *= Math.exp(-dt * 3);
        p.vy *= Math.exp(-dt * 3);
      }
      // les pièces rebondissent sur le sol
      if (p.floor !== undefined && p.y > p.floor && p.vy > 0) {
        p.y = p.floor;
        p.vy *= -0.42;
        p.vx *= 0.7;
        if (Math.abs(p.vy) < 12 * u) p.floor = undefined;
      }
    }
  }

  private draw() {
    const { c, W, H, u, ch, tier } = this;
    const t = this.t;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.save();
    if (this.shake > 0.05) c.translate((Math.random() - 0.5) * 2 * this.shake, (Math.random() - 0.5) * 2 * this.shake);
    if (Math.abs(this.zoom - 1) > 0.002) {
      const zy = ch.base - ch.size * 0.4;
      c.translate(ch.x, zy);
      c.scale(this.zoom, this.zoom);
      c.translate(-ch.x, -zy);
    }
    const cx = ch.x + ch.jx;
    const s = ch.size;
    const color = this.phase === "reveal" && this.item ? this.item.color : CHESTS[tier].color;

    // rayons tournants derrière le coffre
    if (this.rays.a > 0.01 && ch.alpha > 0) {
      const ry = ch.base - s * 0.42;
      const R = Math.hypot(W, H) * 0.62;
      c.save();
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = this.rays.a * 0.5;
      const g = c.createRadialGradient(cx, ry, s * 0.2, cx, ry, R);
      g.addColorStop(0, color);
      g.addColorStop(0.5, color + "55");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.beginPath();
      const N = 12;
      for (let i = 0; i < N; i++) {
        const a = this.rays.rot + (i * Math.PI * 2) / N;
        c.moveTo(cx, ry);
        c.arc(cx, ry, R, a, a + (Math.PI / N) * 0.82);
        c.closePath();
      }
      c.fill();
      // halo
      c.globalAlpha = this.rays.a * 0.6;
      const h = c.createRadialGradient(cx, ry, 0, cx, ry, s * 1.25);
      h.addColorStop(0, color + "cc");
      h.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = h;
      c.fillRect(cx - s * 1.3, ry - s * 1.3, s * 2.6, s * 2.6);
      c.restore();
    }

    // ombre au sol (reste au sol quand le coffre saute)
    if (ch.alpha > 0) {
      const lift = clamp(1 + ch.yOff / (H * 0.5), 0.25, 1);
      c.fillStyle = `rgba(0,0,0,${0.4 * lift * ch.alpha})`;
      c.beginPath();
      c.ellipse(cx, ch.base + 0.012 * s, 0.56 * s * lift, 0.07 * s * lift, 0, 0, 7);
      c.fill();
    }
    this.drawParts((p) => p.k === "dust" || p.k === "ring");

    if (ch.alpha > 0) {
      // écrasement / étirement amorti
      const e = t - this.sq.t0;
      const w = this.sq.amp * Math.exp(-e * 7) * Math.cos(e * 20);
      const fall = this.phase === "intro" && !this.ev.landed ? 0.13 : 0;
      c.save();
      c.globalAlpha = ch.alpha;
      drawChest(c, cx, ch.base + ch.yOff, s, tier, {
        open: ch.open,
        glow: ch.glow,
        beam: ch.beam,
        light: this.light,
        lock: ch.lock,
        sx: 1 + w * 0.8 - fall * 0.6,
        sy: 1 - w + fall,
        rot: ch.rot,
        t,
        shadow: 0,
      });
      c.restore();
    }
    if (this.lockP) drawLock(c, this.lockP.x, this.lockP.y, s, tier, this.lockP.rot, clamp(this.lockP.life * 2, 0, 1));

    // nombre de récompenses encore dans le coffre
    if (this.phase === "reveal") {
      const left = this.queue.length - this.idx - (this.item?.state === "shown" ? 1 : 0);
      if (left > 0) {
        const bx = cx + s * 0.44, by = ch.base - s * 0.78, r = 3.6 * u * (1 + 0.06 * Math.sin(t * 6));
        c.beginPath();
        c.arc(bx, by, r, 0, 7);
        c.fillStyle = "#ff4d6d";
        c.fill();
        c.lineWidth = 0.7 * u;
        c.strokeStyle = "#140f3c";
        c.stroke();
        c.fillStyle = "#fff";
        c.font = `${4.2 * u}px "Dela Gothic One", "Arial Black", sans-serif`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(String(left), bx, by + 0.2 * u);
      }
    }

    // orbe de la récompense en vol
    const it = this.item;
    if (it && it.state === "fly") {
      const q = clamp((t - it.t0) / FLY, 0, 1);
      const r = (3.2 + 3 * q) * u;
      c.save();
      c.globalCompositeOperation = "lighter";
      const g = c.createRadialGradient(it.pos.x, it.pos.y, 0, it.pos.x, it.pos.y, r * 2.4);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.25, it.color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(it.pos.x, it.pos.y, r * 2.4, 0, 7);
      c.fill();
      c.restore();
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(it.pos.x, it.pos.y, r * 0.42, 0, 7);
      c.fill();
    }
    this.drawParts((p) => p.k !== "dust" && p.k !== "ring");
    c.restore();
    if (this.flash > 0.01) {
      c.globalAlpha = Math.min(1, this.flash);
      c.fillStyle = this.flashColor;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  }

  private drawParts(pick: (p: Part) => boolean) {
    const c = this.c;
    for (const p of this.parts) {
      if (!pick(p)) continue;
      const k = p.life / p.max;
      c.save();
      switch (p.k) {
        case "dust": {
          // nuage doux
          const r = p.size * (2.2 - k * 0.9);
          const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, p.color + "aa");
          g.addColorStop(1, p.color + "00");
          c.globalAlpha = Math.min(1, k * 1.4);
          c.fillStyle = g;
          c.beginPath();
          c.arc(p.x, p.y, r, 0, 7);
          c.fill();
          break;
        }
        case "ring": {
          const r = p.size * (1 + (1 - k) * 9);
          c.globalCompositeOperation = "lighter";
          c.strokeStyle = p.color;
          c.beginPath();
          c.ellipse(p.x, p.y, r, r * 0.62, 0, 0, 7);
          // onde de choc : large et douce + trait vif
          c.globalAlpha = k * k * 0.35;
          c.lineWidth = p.size * 1.6 * k + 2;
          c.stroke();
          c.globalAlpha = k * 0.8;
          c.lineWidth = p.size * 0.35 * k + 1;
          c.stroke();
          break;
        }
        case "spark": {
          c.globalCompositeOperation = "lighter";
          c.globalAlpha = Math.min(1, k * 1.6);
          c.strokeStyle = p.color;
          c.lineWidth = p.size;
          c.lineCap = "round";
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
          c.stroke();
          break;
        }
        case "trail":
          c.globalCompositeOperation = "lighter";
          c.globalAlpha = k * 0.7;
          c.fillStyle = p.color;
          c.beginPath();
          c.arc(p.x, p.y, p.size * k, 0, 7);
          c.fill();
          break;
        case "star": {
          c.globalCompositeOperation = "lighter";
          c.globalAlpha = Math.min(1, k * 1.8);
          c.fillStyle = p.color;
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          const r = p.size * (0.5 + 0.5 * k);
          c.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4, q = i % 2 ? r * 0.28 : r;
            c.lineTo(Math.cos(a) * q, Math.sin(a) * q);
          }
          c.closePath();
          c.fill();
          break;
        }
        case "coin": {
          c.globalAlpha = Math.min(1, k * 4);
          c.translate(p.x, p.y);
          const wv = Math.abs(Math.cos(p.rot)) * 0.85 + 0.15;
          c.beginPath();
          c.ellipse(0, 0, p.size * wv, p.size, 0, 0, 7);
          c.fillStyle = "#ffd23f";
          c.fill();
          c.lineWidth = Math.max(1, p.size * 0.22);
          c.strokeStyle = "#8a4b00";
          c.stroke();
          c.beginPath();
          c.ellipse(-p.size * 0.2 * wv, -p.size * 0.25, p.size * 0.28 * wv, p.size * 0.2, 0, 0, 7);
          c.fillStyle = "rgba(255,255,255,.75)";
          c.fill();
          break;
        }
      }
      c.restore();
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.el.remove();
    this.ctx.wallet.sync();
    this.hooks.onClose();
  }
}
