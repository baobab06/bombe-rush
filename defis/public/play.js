// Moteurs d'affichage des quatre mini-jeux. Ils n'enregistrent que des
// événements horodatés ; le score est recalculé par le serveur avec la même seed.
import { GAMES, MEMORY, REFLEX, logicProblem, targetAt } from "/lib/games.mjs";

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export const fx = {
  prefs: { sound: true, vibration: true },
  ctx: null,
  beep(freq, ms) {
    if (!this.prefs.sound) return;
    try {
      this.ctx ??= new AudioContext();
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.08, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + ms / 1000);
      o.connect(g).connect(this.ctx.destination);
      o.start();
      o.stop(this.ctx.currentTime + ms / 1000);
    } catch { /* audio indisponible */ }
  },
  good() { this.beep(880, 90); },
  bad() {
    this.beep(180, 160);
    if (this.prefs.vibration) navigator.vibrate?.(60);
  },
};

/**
 * Lance une partie plein écran.
 * @param {object} o  { gameId, seed, label, official, onEvents(events) } — onEvents sert à
 *                    sauvegarder la partie en cours (fermeture de l'app, perte de réseau).
 * @returns {Promise<object[]>} événements de la partie
 */
export async function runGame({ gameId, seed, label, official = false, onEvents = () => {}, skipCountdown = false }) {
  const game = GAMES[gameId];
  const root = el("div", "game");
  const head = el("div", "game-head");
  head.append(el("span", "", `${game.emoji} ${game.name}`), el("span", `pill tag ${official ? "warn" : ""}`, label));
  const bar = el("div", "timebar");
  const fill = el("div");
  bar.append(fill);
  const arena = el("div", "arena");
  root.append(head, bar, arena);
  document.body.append(root);
  document.body.style.overflow = "hidden";
  try {
    if (!skipCountdown) await countdown(arena, 3);
    const content = game.generate(seed);
    const runner = { reflex: runReflex, memory: runMemory, precision: runPrecision, logic: runLogic }[gameId];
    return await runner({ content, arena, fill, onEvents });
  } finally {
    root.remove();
    document.body.style.overflow = "";
  }
}

export function countdown(container, n, title = "") {
  return new Promise((resolve) => {
    const o = el("div", "overlay");
    if (title) o.append(el("h2", "", title));
    const num = el("div", "huge", String(n));
    o.append(num);
    container.append(o);
    let k = n;
    const iv = setInterval(() => {
      k--;
      if (k <= 0) { clearInterval(iv); o.remove(); resolve(); return; }
      num.textContent = String(k);
    }, 1000);
  });
}

/** Boucle d'animation commune ; t = ms depuis le début de la partie. */
function loop(durationMs, fill, frame) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let done = false;
    const finish = () => { done = true; resolve(); };
    const step = () => {
      if (done) return;
      const t = performance.now() - t0;
      if (durationMs) fill.style.transform = `scaleX(${Math.max(0, 1 - t / durationMs)})`;
      if ((durationMs && t >= durationMs) || frame(t, finish) === false) return finish();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    loop.now = () => Math.round(performance.now() - t0);
  });
}

// ---------------------------------------------------------------- Reflex Rush
async function runReflex({ content, arena, fill, onEvents }) {
  const events = [];
  const handled = new Set();
  const node = el("div", "stim");
  node.setAttribute("aria-hidden", "true");
  let shown = -1;
  arena.addEventListener("pointerdown", () => {
    const t = loop.now();
    events.push({ type: "tap", t });
    onEvents(events);
    const i = content.stimuli.findIndex((s) => s.at <= t && t < s.at + REFLEX.windowMs);
    if (i >= 0 && !handled.has(i)) {
      handled.add(i);
      const s = content.stimuli[i];
      s.kind === "go" && t - s.at >= 100 ? fx.good() : fx.bad();
    } else if (i < 0) fx.bad();
  });
  const hint = el("div", "overlay muted", "Touche n'importe où quand le rond vert ✓ apparaît");
  arena.append(hint, node);
  await loop(content.durationMs, fill, (t) => {
    if (t > 1200) hint.remove();
    const i = content.stimuli.findIndex((s) => s.at <= t && t < s.at + REFLEX.windowMs);
    const vis = i >= 0 && !handled.has(i) ? i : -1;
    if (vis !== shown) {
      shown = vis;
      if (vis < 0) node.className = "stim hidden";
      else {
        const s = content.stimuli[vis];
        node.className = `stim ${s.kind}`;
        node.textContent = s.kind === "go" ? "✓" : "✕";
        node.style.left = `${s.x * 100}%`;
        node.style.top = `${s.y * 100}%`;
      }
    }
  });
  return events;
}

// ---------------------------------------------------------------- Memory Blitz
async function runMemory({ content, arena, fill, onEvents }) {
  const events = [];
  const grid = el("div", "mem-grid");
  const cells = Array.from({ length: MEMORY.cells }, (_, c) => {
    const b = el("button", "", "•");
    b.setAttribute("aria-label", `Case ${c + 1}`);
    grid.append(b);
    return b;
  });
  const info = el("div", "overlay small muted");
  info.style.inset = "auto 0 0 0";
  info.style.padding = "8px";
  arena.append(grid, info);
  let state = GAMES.memory.evaluate(content, events).state;
  let flash = { c: -1, until: 0, cls: "" };
  cells.forEach((b, c) => b.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    const t = loop.now();
    if (state.ended || t < state.inputStart) return;
    events.push({ type: "tap", t, cell: c });
    onEvents(events);
    const before = state;
    state = GAMES.memory.evaluate(content, events).state;
    const ok = state.endReason !== "erreur";
    flash = { c, until: t + 220, cls: ok ? "ok" : "ko" };
    ok ? (state.level > before.level ? fx.good() : null) : fx.bad();
  }));
  await loop(MEMORY.maxMs, fill, (t) => {
    if (state.ended && t > flash.until + 300) return false;
    if (!state.ended && state.deadline !== null && t > state.deadline) return false;
    const seq = content.levels[state.level];
    const demo = seq && t < state.inputStart;
    grid.classList.toggle("input", !demo && !state.ended);
    let lit = -1;
    if (demo && t >= state.displayStart) {
      const k = Math.floor((t - state.displayStart) / MEMORY.stepMs);
      if (k < seq.length && t - state.displayStart - k * MEMORY.stepMs < MEMORY.litMs) lit = seq[k];
    }
    cells.forEach((b, c) => {
      b.className = c === lit ? "lit" : c === flash.c && t < flash.until ? flash.cls : "";
    });
    info.textContent = seq ? `Séquence ${state.level + 1} · ${seq.length} cases · ${demo ? "regarde…" : "à toi !"}` : "Parfait !";
  });
  return events;
}

// -------------------------------------------------------------- Precision Shot
async function runPrecision({ content, arena, fill, onEvents }) {
  const events = [];
  const canvas = el("canvas", "prec");
  arena.append(canvas);
  const ctx2d = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  let size = 0;
  const resize = () => {
    size = Math.min(arena.clientWidth, arena.clientHeight);
    canvas.style.width = canvas.style.height = `${size}px`;
    canvas.width = canvas.height = Math.round(size * dpr);
  };
  resize();
  let hit = new Set();
  let marks = [];
  const css = getComputedStyle(document.documentElement);
  const colors = { brand: css.getPropertyValue("--brand").trim(), line: css.getPropertyValue("--line").trim(), good: css.getPropertyValue("--good").trim(), bad: css.getPropertyValue("--bad").trim() };
  canvas.addEventListener("pointerdown", (ev) => {
    const r = canvas.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
    const t = loop.now();
    events.push({ type: "shot", t, x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 });
    onEvents(events);
    const st = GAMES.precision.evaluate(content, events).state;
    const touched = st.hitIds.length > hit.size;
    hit = new Set(st.hitIds);
    marks.push({ x, y, t, ok: touched });
    touched ? fx.good() : fx.bad();
  });
  await loop(content.durationMs, fill, (t) => {
    const s = size * dpr;
    ctx2d.clearRect(0, 0, s, s);
    ctx2d.strokeStyle = colors.line;
    ctx2d.lineWidth = 2 * dpr;
    ctx2d.strokeRect(0, 0, s, s);
    for (const tg of content.targets) {
      if (hit.has(tg.id)) continue;
      const p = targetAt(tg, t);
      if (!p) continue;
      const fade = Math.min(1, (tg.spawnAt + 2600 - t) / 500);
      ctx2d.globalAlpha = Math.max(0.25, fade);
      for (const [k, col] of [[1, colors.brand], [0.62, "#ffffff"], [0.28, colors.brand]]) {
        ctx2d.beginPath();
        ctx2d.arc(p.x * s, p.y * s, tg.r * s * k, 0, Math.PI * 2);
        ctx2d.fillStyle = col;
        ctx2d.fill();
      }
      ctx2d.globalAlpha = 1;
    }
    marks = marks.filter((m) => t - m.t < 300);
    for (const m of marks) {
      ctx2d.beginPath();
      ctx2d.arc(m.x * s, m.y * s, 6 * dpr, 0, Math.PI * 2);
      ctx2d.fillStyle = m.ok ? colors.good : colors.bad;
      ctx2d.fill();
    }
  });
  return events;
}

// ---------------------------------------------------------------- Logic Sprint
async function runLogic({ content, arena, fill, onEvents }) {
  const events = [];
  const wrap = el("div");
  wrap.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;";
  const q = el("div", "logic-q");
  const choices = el("div", "logic-choices");
  const score = el("div", "center muted small");
  wrap.append(q, choices, score);
  arena.append(wrap);
  let ok = 0, ko = 0;
  const show = () => {
    const i = events.length;
    const p = logicProblem(content.seed, i);
    q.textContent = p.text;
    choices.className = `logic-choices ${p.choices.length === 3 ? "three" : ""}`;
    choices.replaceChildren(...p.choices.map((label, c) => {
      const b = el("button", "", label);
      b.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        events.push({ type: "answer", t: loop.now(), i, choice: c });
        onEvents(events);
        const right = c === p.answer;
        right ? (ok++, fx.good()) : (ko++, fx.bad());
        arena.classList.remove("flash-good", "flash-bad");
        void arena.offsetWidth;
        arena.classList.add(right ? "flash-good" : "flash-bad");
        score.textContent = `✓ ${ok}   ✕ ${ko}`;
        show();
      });
      return b;
    }));
  };
  show();
  await loop(content.durationMs, fill, () => {});
  return events;
}
