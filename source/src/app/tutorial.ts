/**
 * TUTORIEL DES NOUVEAUX JOUEURS
 *
 * - Proposé au premier lancement (et une fois aux joueurs qui ne l'ont jamais
 *   vu), jamais imposé : « Passer » est toujours là.
 * - 6 étapes illustrées avec les VRAIS dessins du jeu (personnages, bombes,
 *   caisses, bonus) ; les textes décrivent les règles réellement en place
 *   (bonus et capacités lus dans le registre du jeu, malus Chaos aussi).
 * - Terrain d'entraînement : une vraie partie en mode « training »
 *   (core/training.ts) avec objectifs à cocher.
 * - L'état (proposé / passé / terminé) est dans le profil, donc dans la
 *   sauvegarde en ligne : il ne revient pas sur un autre appareil.
 */
import { BONUSES } from "../core/bonuses";
import { CHAOS_EVENTS } from "../core/chaos";
import { HILL_RULES } from "../core/hill";
import type { Match } from "../core/match";
import { RULES } from "../core/rules";
import { SPECIALS } from "../core/specials";
import { MAX_ROOM_PLAYERS } from "../net/protocol";
import type { Profile } from "../meta/profile";
import { lookOf, drawCharacter } from "../render/bodies";
import { drawBomb, drawBonus, drawBonusIcon, drawCrate, drawGrassTile, drawStone } from "../render/sprites";
import { THEMES } from "../render/themes";
import { drawPortrait } from "../ui/thumbs";
import type { AppCtx } from "./ctx";

const $ = (id: string) => document.getElementById(id)!;

import { setTutorial, shouldOfferTutorial } from "../meta/tutorial-state";
export { setTutorial, shouldOfferTutorial };

/** Fenêtre d'accueil : présentation du jeu + tutoriel proposé (jamais imposé). */
export function offerTutorial(ctx: AppCtx, start: () => void, skipped: () => void): void {
  const p = ctx.profile;
  const veteran = p.played > 0;
  setTutorial(p, "offered");
  ctx.persist();
  ctx.modal.open(
    (sheet, close) => {
      sheet.insertAdjacentHTML(
        "beforeend",
        `<div class="tut-offer">
          <p class="kicker">${veteran ? "Nouveau" : "Bienvenue dans l'arène !"}</p>
          <h2>${veteran ? "Le tutoriel est arrivé" : "Bienvenue dans BOMBE RUSH"}</h2>
          <p class="sub">Pose des bombes, casse des caisses, ramasse des bonus… et sois le dernier debout !</p>
          <ul class="tut-goals">
            <li><span>💣</span>Piège tes adversaires</li>
            <li><span>🔥</span>Évite les explosions</li>
            <li><span>🏆</span>Gagne la partie</li>
          </ul>
          <p class="tut-note">${veteran ? "Un petit tour des règles, des bonus et des modes, avec un terrain d'entraînement." : "Un tutoriel de 2 minutes t'apprend les commandes, les bonus et les modes de jeu."} Tu pourras le revoir dans les Paramètres.</p>
        </div>`,
      );
      const actions = document.createElement("div");
      actions.className = "sheet-actions";
      const skip = document.createElement("button");
      skip.className = "btn btn-ghost";
      skip.id = "btnTutSkipOffer";
      skip.innerHTML = "<span>Passer</span>";
      const go = document.createElement("button");
      go.className = "btn btn-yellow";
      go.id = "btnTutStart";
      go.innerHTML = "<span>▶ SUIVRE LE TUTORIEL</span>";
      skip.addEventListener("click", () => {
        ctx.click();
        setTutorial(p, "skipped");
        ctx.persist();
        close();
        skipped();
      });
      go.addEventListener("click", () => {
        ctx.click();
        close();
        start();
      });
      actions.append(skip, go);
      sheet.appendChild(actions);
    },
    { closable: false, cls: "tut-sheet" },
  );
}

// ------------------------------------------------------- démo animée
type Cell = "g" | "s" | "c";
/**
 * Petite arène animée dessinée avec les sprites du jeu : sert à montrer le
 * déplacement et l'explosion en croix. Une scène = une fonction du temps.
 */
class DemoBoard {
  private raf = 0;
  private t0 = performance.now();
  private ctx: CanvasRenderingContext2D;
  private readonly W = 7;
  private readonly H = 5;
  constructor(
    private canvas: HTMLCanvasElement,
    private scene: "move" | "bomb",
    private characterId: string,
    private skinId?: string,
  ) {
    this.ctx = canvas.getContext("2d")!;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.draw((performance.now() - this.t0) / 1000);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    cancelAnimationFrame(this.raf);
  }

  private layout(t: number): Cell[][] {
    const g: Cell[][] = Array.from({ length: this.H }, () => Array.from({ length: this.W }, () => "g" as Cell));
    // piliers de pierre (comme dans les arènes)
    for (const [x, y] of [[1, 1], [3, 1], [5, 1], [1, 3], [3, 3], [5, 3]]) g[y][x] = "s";
    if (this.scene === "bomb") {
      const cyc = t % 7;
      // caisses : celle de droite saute à l'explosion
      g[2][6] = cyc < 3.1 ? "c" : "g";
      g[0][3] = "c";
    }
    return g;
  }

  private draw(t: number) {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = c.clientWidth || 280;
    const ch = c.clientHeight || 200;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const s = Math.floor(Math.min(c.width / this.W, c.height / this.H));
    const ox = Math.floor((c.width - s * this.W) / 2);
    const oy = Math.floor((c.height - s * this.H) / 2);
    const th = THEMES.forest;
    const g = this.layout(t);
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) drawGrassTile(ctx, ox + x * s, oy + y * s, s, x, y, th);
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) {
        if (g[y][x] === "s") drawStone(ctx, ox + x * s, oy + y * s, s, th, x * 7 + y);
        if (g[y][x] === "c") drawCrate(ctx, ox + x * s, oy + y * s, s, th);
      }
    const look = lookOf(this.characterId, this.skinId);
    const at = (x: number, y: number) => [ox + (x + 0.5) * s, oy + (y + 0.5) * s] as const;

    if (this.scene === "move") {
      // tour du pilier central : droite, bas, gauche, haut
      const path: [number, number][] = [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]];
      const seg = 1.1;
      const k = (t % (seg * 4)) / seg;
      const i = Math.floor(k);
      const f = k - i;
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      const x = ax + (bx - ax) * f;
      const y = ay + (by - ay) * f;
      const [cx, cy] = at(x, y);
      drawCharacter(ctx, cx, cy, s * 0.95, look, { faceX: Math.sign(bx - ax), faceY: Math.sign(by - ay), walk: t * 9, moving: true, t });
      // joystick qui suit la direction
      const jr = s * 0.62;
      const jx = ox + jr + s * 0.15;
      const jy = oy + this.H * s - jr - s * 0.1;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(10,6,40,.55)";
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.beginPath();
      ctx.arc(jx, jy, jr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(jx + Math.sign(bx - ax) * jr * 0.5, jy + Math.sign(by - ay) * jr * 0.5, jr * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // ---- explosion en croix : pose, cachette, BOUM, bonus ramassé
    const cyc = t % 7;
    const bomb: [number, number] = [4, 2];
    // trajet : pose la bombe, file se cacher derrière le pilier (4,2)->(4,... ) : coin (3,2)->(2,2)->(2,... )
    let px = 4;
    let py = 2;
    let moving = false;
    let fx = 0;
    let fy = 1;
    if (cyc < 0.5) {
      px = 4;
    } else if (cyc < 1.6) {
      // recule vers la gauche puis se cache en haut, derrière le pilier (3,1)
      const k = (cyc - 0.5) / 1.1;
      if (k < 0.5) {
        px = 4 - k * 2 * 2;
        fx = -1;
        fy = 0;
      } else {
        px = 2;
        py = 2 - (k - 0.5) * 2;
        fx = 0;
        fy = -1;
      }
      moving = true;
    } else if (cyc < 4.3) {
      px = 2;
      py = 1;
      fx = 1;
      fy = 0;
    } else if (cyc < 5.6) {
      // revient chercher le bonus apparu à la place de la caisse
      const k = (cyc - 4.3) / 1.3;
      if (k < 0.25) {
        px = 2;
        py = 1 + k * 4;
      } else {
        px = 2 + ((k - 0.25) / 0.75) * 4;
        py = 2;
      }
      fx = k < 0.25 ? 0 : 1;
      fy = k < 0.25 ? 1 : 0;
      moving = true;
    } else {
      px = 6;
      py = 2;
    }
    const fuse = 1.5;
    const boomAt = 0.3 + fuse; // 1.8 s
    if (cyc >= 0.3 && cyc < boomAt) {
      const [bx, by] = at(bomb[0], bomb[1]);
      drawBomb(ctx, bx, by, s, (cyc - 0.3) / fuse, t, 0, boomAt - cyc, 0.55);
    }
    // flamme : 2 cases dans chaque direction, arrêtée par la pierre, la caisse casse
    if (cyc >= boomAt && cyc < boomAt + 0.9) {
      const k = 1 - (cyc - boomAt) / 0.9;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.6);
      const cells: [number, number][] = [[4, 2]];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let r = 1; r <= 2; r++) {
          const x = bomb[0] + dx * r;
          const y = bomb[1] + dy * r;
          if (x < 0 || y < 0 || x >= this.W || y >= this.H) break;
          if (g[y][x] === "s") break;
          cells.push([x, y]);
          if (x === 6 && y === 2) break;
        }
      }
      for (const [x, y] of cells) {
        const [cx, cy] = at(x, y);
        const r = s * 0.46;
        const grd = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
        grd.addColorStop(0, "#fff7c2");
        grd.addColorStop(0.45, "#ffb01f");
        grd.addColorStop(1, "rgba(255,77,40,0.85)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.45);
        ctx.fill();
      }
      ctx.restore();
    }
    // bonus « flamme » à la place de la caisse
    if (cyc >= boomAt + 0.4 && cyc < 5.5) {
      const [bx, by] = at(6, 2);
      drawBonusIcon(ctx, bx, by + Math.sin(t * 4) * s * 0.04, s * 0.8, "flame");
    }
    const [cx, cy] = at(px, py);
    drawCharacter(ctx, cx, cy, s * 0.95, look, { faceX: fx, faceY: fy, walk: t * 9, moving, t, action: cyc < 0.45 ? 1 - cyc / 0.45 : 0, celebrate: cyc > 5.6 });
  }
}

// ---------------------------------------------------------------- étapes
interface Step {
  kicker: string;
  title: string;
  html: () => string;
  /** prépare l'illustration ; renvoie de quoi l'arrêter */
  mount?: (host: HTMLElement, p: Profile) => (() => void) | void;
}

const BASIC_BONUSES = ["bomb", "flame", "speed", "shield"];

function bonusCard(id: string): string {
  const b = BONUSES[id];
  return `<li class="tut-bonus"><canvas data-bonus="${id}" width="96" height="96"></canvas><span><b>${b.label}</b><small>${b.description}</small></span></li>`;
}

const STEPS: Step[] = [
  {
    kicker: "Étape 1",
    title: "Bienvenue dans BOMBE RUSH",
    html: () => `<p class="tut-lead">Un jeu d'arène à bombes, de 2 à 4 joueurs.</p>
      <ul class="tut-list">
        <li><span>💣</span><p><b>Piège tes adversaires</b> avec tes bombes : une explosion élimine.</p></li>
        <li><span>🔥</span><p><b>Évite les explosions</b> (les tiennes aussi !).</p></li>
        <li><span>🏆</span><p><b>Gagne</b> : sois le dernier debout… ou marque le plus de points en Domination.</p></li>
      </ul>`,
    mount: (host, p) => {
      const cv = document.createElement("canvas");
      cv.className = "tut-hero";
      cv.width = 360;
      cv.height = 360;
      host.appendChild(cv);
      let raf = 0;
      const t0 = performance.now();
      const loop = () => {
        raf = requestAnimationFrame(loop);
        drawPortrait(cv, p.characterId, p.equippedSkins[p.characterId], 1, (performance.now() - t0) / 1000, p.equipped.accessory, 0.9);
      };
      loop();
      return () => cancelAnimationFrame(raf);
    },
  },
  {
    kicker: "Étape 2",
    title: "Se déplacer",
    html: () => `<ul class="tut-list">
        <li><span>👍</span><p>Pose ton <b>pouce gauche</b> n'importe où sur la moitié gauche de l'écran : le <b>joystick apparaît sous ton doigt</b>.</p></li>
        <li><span>➡️</span><p>Fais-le glisser dans une direction pour courir. On se déplace dans les allées, entre les blocs.</p></li>
        <li><span>⌨️</span><p>Au clavier : <b>flèches</b> ou <b>ZQSD</b>.</p></li>
      </ul>`,
    mount: (host, p) => {
      const cv = document.createElement("canvas");
      cv.className = "tut-board";
      host.appendChild(cv);
      const d = new DemoBoard(cv, "move", p.characterId, p.equippedSkins[p.characterId]);
      return () => d.stop();
    },
  },
  {
    kicker: "Étape 3",
    title: "Poser des bombes",
    html: () => `<ul class="tut-list">
        <li><span>💣</span><p>Le gros bouton <b>💣 à droite</b> (Espace au clavier) pose une bombe sous tes pieds.</p></li>
        <li><span>✚</span><p>Elle explose au bout de quelques secondes <b>en croix</b> : haut, bas, gauche, droite, sur toute ta <b>portée</b>.</p></li>
        <li><span>🧱</span><p>Les <b>blocs de pierre arrêtent la flamme</b> : cache-toi derrière, ou tourne au coin d'une allée. Les <b>caisses</b> se cassent.</p></li>
        <li><span>⚠️</span><p>Avant de poser, <b>prévois ta sortie</b> : une bombe bloque le passage, ne te coince pas !</p></li>
      </ul>`,
    mount: (host, p) => {
      const cv = document.createElement("canvas");
      cv.className = "tut-board";
      host.appendChild(cv);
      const d = new DemoBoard(cv, "bomb", p.characterId, p.equippedSkins[p.characterId]);
      return () => d.stop();
    },
  },
  {
    kicker: "Étape 4",
    title: "Bonus et capacités",
    html: () => `<p class="tut-lead">Casse des caisses : parfois un <b>bonus</b> apparaît. <b>Marche dessus</b> pour le ramasser.</p>
      <ul class="tut-bonuses">${BASIC_BONUSES.map(bonusCard).join("")}</ul>
      <p class="tut-lead">Les <b>capacités</b> transforment ta <b>prochaine bombe</b>. Elles apparaissent au sol pendant la partie ; la bombe à lancer et la télécommandée ont leur bouton (<b>LANCER</b>, <b>BOUM</b>).</p>
      <ul class="tut-bonuses small">${SPECIALS.map((sp) => bonusCard(sp.id)).join("")}</ul>`,
    mount: (host) => {
      // les icônes de la colonne de texte sont dessinées avec les vrais sprites
      const root = host.closest(".tut-card") ?? document;
      root.querySelectorAll<HTMLCanvasElement>("canvas[data-bonus]").forEach((c) => {
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, c.width, c.height);
        // le bonus tel qu'il apparaît au sol (bulle + icône)
        drawBonus(ctx, c.width / 2, c.height * 0.56, c.width * 0.86, c.dataset.bonus!, 0, 10);
      });
      const big = document.createElement("canvas");
      big.className = "tut-hero";
      big.width = 300;
      big.height = 300;
      host.appendChild(big);
      let raf = 0;
      const t0 = performance.now();
      const list = [...BASIC_BONUSES, ...SPECIALS.map((s) => s.id)];
      const ctx = big.getContext("2d")!;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const t = (performance.now() - t0) / 1000;
        const id = list[Math.floor(t / 1.4) % list.length];
        ctx.clearRect(0, 0, 300, 300);
        const k = (t % 1.4) / 1.4;
        const sc = k < 0.15 ? k / 0.15 : k > 0.88 ? (1 - k) / 0.12 : 1;
        drawBonus(ctx, 150, 165 + Math.sin(t * 3) * 6, 250 * Math.max(0.05, sc), id, t, 10);
      };
      loop();
      return () => cancelAnimationFrame(raf);
    },
  },
  {
    kicker: "Étape 5",
    title: "Les modes de jeu",
    html: () => {
      const malus = CHAOS_EVENTS.filter((e) => e.weight > 0).map((e) => `<i title="${e.label}">${e.emoji}</i>`).join("");
      const sd = RULES.suddenDeathAt;
      const total = `${Math.floor(RULES.matchDuration / 60)} min ${String(RULES.matchDuration % 60).padStart(2, "0")}`;
      return `<div class="tut-modes">
        <div class="tut-mode m-classic"><b>🎮 Classique</b><p>Le <b>dernier debout</b> gagne. Partie de ${total} ; à ${sd} s de la fin, la <b>mort subite</b> fait tomber des murs : l'arène rétrécit.</p></div>
        <div class="tut-mode m-koth"><b>👑 Domination 2 contre 2</b><p>Toi et un coéquipier contre deux adversaires. <b>Reste sur la zone</b> : 1 point par seconde si seule ton équipe y est (personne ne marque si les deux équipes y sont). La zone <b>change de place</b> toutes les ${HILL_RULES.moveMin} à ${HILL_RULES.moveMax} s, annoncée ${HILL_RULES.moveWarn} s avant. Première équipe à <b>${HILL_RULES.target} points</b>. Éliminé ? Retour en ${HILL_RULES.respawnDelay} s.</p></div>
        <div class="tut-mode m-chaos"><b>💀 Chaos</b><p>Le Classique… avec des <b>malus</b> toutes les quelques secondes (après 15 s) : ${malus}. Les malus dangereux sont <b>annoncés</b> (compte à rebours, cases en rouge) : sors-en à temps !</p></div>
        <div class="tut-mode m-friends"><b>👥 Jouer entre amis</b><p><b>Crée une salle</b> : tu obtiens un <b>code</b> et un <b>lien</b> à partager. Tes amis arrivent directement dans ta salle (jusqu'à ${MAX_ROOM_PLAYERS} joueurs, avec des bots si tu veux). Tu peux aussi <b>rejoindre</b> avec un code.</p></div>
      </div>`;
    },
  },
  {
    kicker: "Étape 6",
    title: "À toi de jouer !",
    html: () => `<p class="tut-lead">Essaie tout ça sur le <b>terrain d'entraînement</b>, sans risque et sans perdre de pièces :</p>
      <ol class="tut-checks">${TRAINING_GOALS.map((g) => `<li><span>${g.emoji}</span>${g.text}</li>`).join("")}</ol>
      <p class="tut-note">Tu peux aussi terminer le tutoriel maintenant et aller jouer directement.</p>`,
    mount: (host, p) => {
      const cv = document.createElement("canvas");
      cv.className = "tut-board";
      host.appendChild(cv);
      const d = new DemoBoard(cv, "bomb", p.characterId, p.equippedSkins[p.characterId]);
      return () => d.stop();
    },
  },
];

// -------------------------------------------------------- l'écran tutoriel
export interface TutorialHooks {
  /** lancer le terrain d'entraînement */
  practice(): void;
  /** tutoriel fermé (passé ou terminé) : retour au menu */
  exit(): void;
}

export class TutorialScreen {
  private i = 0;
  private cleanup: (() => void) | null = null;
  constructor(
    private ctx: AppCtx,
    private hooks: TutorialHooks,
  ) {
    $("btnTutNext").addEventListener("click", () => {
      this.ctx.click();
      if (this.i < STEPS.length - 1) this.show(this.i + 1);
      else this.finish();
    });
    $("btnTutPrev").addEventListener("click", () => {
      this.ctx.click();
      if (this.i > 0) this.show(this.i - 1);
    });
    $("btnTutSkip").addEventListener("click", () => {
      this.ctx.click();
      setTutorial(this.ctx.profile, "skipped");
      this.ctx.persist();
      this.close();
      this.hooks.exit();
    });
    $("btnTutPractice").addEventListener("click", () => {
      this.ctx.click();
      // tout le tutoriel a été vu : il compte comme terminé (l'entraînement est un bonus)
      setTutorial(this.ctx.profile, "done");
      this.ctx.persist();
      this.close();
      this.hooks.practice();
    });
  }

  get count() {
    return STEPS.length;
  }
  get index() {
    return this.i;
  }

  open(from = 0) {
    this.show(from);
  }

  close() {
    this.cleanup?.();
    this.cleanup = null;
  }

  private finish() {
    setTutorial(this.ctx.profile, "done");
    this.ctx.persist();
    this.close();
    this.ctx.toast("✅ Tutoriel terminé ! Tu peux le revoir dans les Paramètres.", "good");
    this.hooks.exit();
  }

  show(i: number) {
    this.cleanup?.();
    this.cleanup = null;
    this.i = Math.max(0, Math.min(STEPS.length - 1, i));
    const st = STEPS[this.i];
    const last = this.i === STEPS.length - 1;
    $("tutKicker").textContent = `${st.kicker} sur ${STEPS.length}`;
    $("tutTitle").textContent = st.title;
    const body = $("tutBody");
    body.innerHTML = st.html();
    body.scrollTop = 0;
    const vis = $("tutVisual");
    vis.innerHTML = "";
    const card = $("tutCard");
    card.dataset.step = String(this.i + 1);
    // étape sans illustration (modes de jeu) : le texte prend toute la largeur
    card.classList.toggle("wide", !st.mount);
    card.classList.remove("in");
    void card.offsetWidth;
    card.classList.add("in");
    this.cleanup = st.mount?.(vis, this.ctx.profile) ?? null;
    // progression
    $("tutDots").innerHTML = STEPS.map((_, k) => `<i class="${k < this.i ? "done" : k === this.i ? "cur" : ""}"></i>`).join("");
    $("btnTutPrev").toggleAttribute("disabled", this.i === 0);
    $("btnTutNext").querySelector("span")!.textContent = last ? "TERMINER" : "SUIVANT";
    $("btnTutNext").classList.toggle("btn-yellow", !last);
    $("btnTutNext").classList.toggle("btn-blue", last);
    $("btnTutPractice").hidden = !last;
    $("btnTutSkip").hidden = last;
  }
}

// --------------------------------------------- terrain d'entraînement
export const TRAINING_GOALS = [
  { id: "move", emoji: "🕹️", text: "Déplace-toi de quelques cases" },
  { id: "bomb", emoji: "💣", text: "Pose une bombe et mets-toi à l'abri" },
  { id: "crates", emoji: "📦", text: "Casse 3 caisses" },
  { id: "bonus", emoji: "⭐", text: "Ramasse un bonus" },
  { id: "dummy", emoji: "🎯", text: "Élimine le mannequin" },
] as const;
type GoalId = (typeof TRAINING_GOALS)[number]["id"];

/** Objectifs de l'entraînement, cochés d'après l'état réel de la partie. */
export class TrainingCoach {
  done = new Set<GoalId>();
  private walked = 0;
  private last: [number, number] | null = null;
  private myBombs = new Set<number>();
  private wasAlive = true;
  private celebrated = false;
  constructor(
    private ctx: AppCtx,
    private onComplete: () => void,
  ) {}

  reset() {
    this.done.clear();
    this.walked = 0;
    this.last = null;
    this.myBombs.clear();
    this.wasAlive = true;
    this.celebrated = false;
    this.render();
  }

  update(m: Match) {
    const me = m.players[0];
    if (!me) return;
    const before = this.done.size;
    if (me.alive) {
      if (this.last) this.walked += Math.abs(me.x - this.last[0]) + Math.abs(me.y - this.last[1]);
      this.last = [me.x, me.y];
      if (this.walked >= 4) this.done.add("move");
    } else this.last = null;
    // bombe posée puis explosée, et toujours debout : « à l'abri » réussi
    const now = new Set<number>();
    for (const b of m.bombs.values()) if (b.ownerId === me.id) now.add(b.id);
    for (const id of this.myBombs) if (!now.has(id) && me.alive) this.done.add("bomb");
    this.myBombs = now;
    if (this.wasAlive && !me.alive) this.ctx.toast("Oups ! Ne reste pas dans la croix de l'explosion : cache-toi derrière un bloc.", "bad");
    this.wasAlive = me.alive;
    if (me.stats.blocksDestroyed >= 3) this.done.add("crates");
    if (me.stats.bonusesPicked >= 1) this.done.add("bonus");
    if (me.stats.kills >= 1) this.done.add("dummy");
    if (this.done.size !== before) {
      this.render(true);
      if (this.done.size === TRAINING_GOALS.length && !this.celebrated) {
        this.celebrated = true;
        window.setTimeout(() => this.onComplete(), 700);
      }
    }
  }

  /** Objectif en cours (le premier pas encore réussi). */
  private current() {
    return TRAINING_GOALS.find((g) => !this.done.has(g.id)) ?? null;
  }

  render(pop = false) {
    const el = $("tutCoach");
    const cur = this.current();
    const n = this.done.size;
    el.innerHTML = `<div class="tc-head"><b>🎯 ENTRAÎNEMENT</b><em>${n}/${TRAINING_GOALS.length}</em></div>
      <p class="tc-goal">${cur ? `${cur.emoji} ${cur.text}` : "🏆 Tout est réussi !"}</p>
      <div class="tc-dots">${TRAINING_GOALS.map((g) => `<i class="${this.done.has(g.id) ? "ok" : g === cur ? "cur" : ""}" title="${g.text}">${this.done.has(g.id) ? "✓" : g.emoji}</i>`).join("")}</div>`;
    if (pop) {
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
    }
  }
}
