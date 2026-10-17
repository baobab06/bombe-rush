// Les quatre mini-jeux de la v1 (section 3 du cahier des charges).
// Ce fichier est partagé : le navigateur l'utilise pour jouer, le serveur pour
// rejouer les événements et calculer le score officiel. Le client n'envoie
// jamais de score, seulement ses événements horodatés (t = ms depuis le début).
//
// Chaque jeu expose :
//   generate(seed)            -> contenu de la partie (identique pour une même seed)
//   evaluate(content, events) -> { verdict, reasons, raw, score, secondary, passed, state }
//     verdict : "ok" | "suspect" (accepté, à examiner) | "invalid" (refusé, 0 point)
//     passed  : seuil d'entraînement atteint
//     state   : état courant, utilisé par le client pendant la partie
//   secondaryOrder : "asc" (plus petit = mieux) ou "desc"

import { hashSeed, makeRng } from "./rng.mjs";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
/** Score borné 0..1000, arrondi à l'entier le plus proche (0,5 vers le haut). */
export const officialScore = (x) => clamp(Math.floor(x + 0.5), 0, 1000);

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stddev = (xs) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** Contrôles communs : forme des événements, horodatages croissants et bornés. */
function checkEvents(events, maxMs, type, maxCount) {
  if (!Array.isArray(events)) return "événements illisibles";
  if (events.length > maxCount) return "trop d'événements";
  let last = 0;
  for (const e of events) {
    if (!e || e.type !== type) return "type d'événement inconnu";
    if (!Number.isFinite(e.t) || e.t < 0) return "horodatage invalide";
    if (e.t > maxMs) return "événement après la fin de la partie";
    if (e.t < last) return "horodatages non croissants";
    last = e.t;
  }
  return null;
}

function result({ reasons = [], suspect = [], raw, score, secondary, passed, state }) {
  if (reasons.length) {
    return { verdict: "invalid", reasons, raw, score: 0, secondary, passed: false, state };
  }
  return {
    verdict: suspect.length ? "suspect" : "ok",
    reasons: suspect,
    raw,
    score: officialScore(score),
    secondary,
    passed,
    state,
  };
}

// ---------------------------------------------------------------------------
// Reflex Rush — toucher dès qu'un signal valide apparaît, ignorer les leurres.
// Bonne réponse = toucher un signal valide en ≥ 100 ms pendant qu'il est affiché.
// Erreur = toucher un leurre ou le vide. Un signal manqué ne rapporte rien.
// ---------------------------------------------------------------------------
export const REFLEX = { signals: 20, decoys: 6, windowMs: 900, minGapMs: 500, maxGapMs: 1400, leadMs: 1500 };

const reflex = {
  id: "reflex",
  name: "Reflex Rush",
  emoji: "⚡",
  rules: "Touche l'écran dès qu'un rond vert ✓ apparaît. Ignore les carrés rouges ✕.",
  version: "1",
  secondaryOrder: "asc",
  secondaryLabel: "temps de réaction moyen",
  threshold: "14 bonnes réponses sur 20",
  maxDurationMs: 60000,
  generate(seed) {
    const rng = makeRng(seed);
    const kinds = rng.shuffle([
      ...Array(REFLEX.signals).fill("go"),
      ...Array(REFLEX.decoys).fill("decoy"),
    ]);
    let at = REFLEX.leadMs;
    const stimuli = kinds.map((kind) => {
      const s = { at, kind, x: rng.range(0.2, 0.8), y: rng.range(0.2, 0.8) };
      at += REFLEX.windowMs + rng.int(REFLEX.minGapMs, REFLEX.maxGapMs);
      return s;
    });
    const last = stimuli[stimuli.length - 1];
    return { stimuli, durationMs: last.at + REFLEX.windowMs + 300 };
  },
  evaluate(content, events) {
    const { stimuli, durationMs } = content;
    const bad = checkEvents(events, durationMs + 1000, "tap", 150);
    let good = 0, errors = 0, anticipations = 0;
    const rts = [], handled = new Set();
    if (!bad) {
      for (const e of events) {
        const i = stimuli.findIndex((s) => s.at <= e.t && e.t < s.at + REFLEX.windowMs);
        if (i < 0) { errors++; continue; }
        if (handled.has(i)) continue;
        handled.add(i);
        const s = stimuli[i];
        if (s.kind === "decoy") { errors++; continue; }
        const rt = e.t - s.at;
        if (rt < 100) { anticipations++; errors++; continue; }
        good++;
        rts.push(rt);
      }
    }
    const avgRt = rts.length ? Math.round(mean(rts)) : null;
    const suspect = [];
    if (anticipations >= 5) suspect.push("nombreuses réactions sous 100 ms");
    if (rts.length >= 10 && stddev(rts) < 12) suspect.push("régularité non humaine");
    if (rts.length >= 10 && avgRt < 130) suspect.push("temps moyen improbable");
    const penalty = good ? Math.max(0, (avgRt - 200) / 2) : 0;
    return result({
      reasons: bad ? [bad] : [],
      suspect,
      raw: { good, errors, missed: REFLEX.signals - good - anticipations, avgRt },
      score: good ? 50 * good - penalty : 0,
      secondary: avgRt,
      passed: good >= 14,
      state: { handled: [...handled] },
    });
  },
};

// ---------------------------------------------------------------------------
// Memory Blitz — reproduire des séquences de plus en plus longues (3 à 14 cases).
// Fin à la 1re erreur, après 5 s sans toucher, ou après 12 séquences.
// Démonstration du niveau : une case allumée toutes les 550 ms, puis saisie.
// ---------------------------------------------------------------------------
export const MEMORY = { cells: 9, startLen: 3, levels: 12, stepMs: 550, litMs: 400, leadMs: 800, pauseMs: 900, timeoutMs: 5000, maxMs: 150000 };

const memory = {
  id: "memory",
  name: "Memory Blitz",
  emoji: "🧠",
  rules: "Regarde les cases s'allumer, puis touche-les dans le même ordre. La séquence s'allonge à chaque fois.",
  version: "1",
  secondaryOrder: "asc",
  secondaryLabel: "temps de saisie total",
  threshold: "4 séquences réussies",
  maxDurationMs: MEMORY.maxMs,
  generate(seed) {
    const rng = makeRng(seed);
    const levels = [];
    for (let k = 0; k < MEMORY.levels; k++) {
      const seq = [];
      for (let j = 0; j < MEMORY.startLen + k; j++) {
        let c;
        do c = rng.int(0, MEMORY.cells - 1);
        while (c === seq[j - 1]);
        seq.push(c);
      }
      levels.push(seq);
    }
    return { levels };
  },
  evaluate(content, events) {
    const { levels } = content;
    const reasons = [];
    const bad = checkEvents(events, MEMORY.maxMs, "tap", 400);
    if (bad) reasons.push(bad);
    let level = 0, pos = 0, success = 0, inputTime = 0, taps = 0, lastTap = 0, minGap = Infinity;
    let displayStart = MEMORY.leadMs, ended = false, endReason = null;
    for (const e of bad ? [] : events) {
      if (ended) { reasons.push("saisie après la fin"); break; }
      const seq = levels[level];
      const inputStart = displayStart + seq.length * MEMORY.stepMs;
      if (!Number.isInteger(e.cell) || e.cell < 0 || e.cell >= MEMORY.cells) { reasons.push("case inconnue"); break; }
      if (e.t < inputStart) { reasons.push("saisie pendant la démonstration"); break; }
      if (e.t - (pos === 0 ? inputStart : lastTap) > MEMORY.timeoutMs) { reasons.push("saisie après le délai"); break; }
      if (pos > 0) minGap = Math.min(minGap, e.t - lastTap);
      lastTap = e.t;
      if (e.cell !== seq[pos]) { ended = true; endReason = "erreur"; continue; }
      pos++;
      taps++;
      if (pos === seq.length) {
        success++;
        inputTime += e.t - inputStart;
        level++;
        pos = 0;
        displayStart = e.t + MEMORY.pauseMs;
        if (level === levels.length) { ended = true; endReason = "parfait"; }
      }
    }
    const seq = levels[level];
    const inputStart = seq ? displayStart + seq.length * MEMORY.stepMs : null;
    const state = {
      level, pos, ended, endReason, displayStart, inputStart,
      deadline: ended || !seq ? null : (pos === 0 ? inputStart : lastTap) + MEMORY.timeoutMs,
    };
    const msPerTap = taps ? inputTime / taps : null;
    const bonus = success ? 200 * clamp((1200 - msPerTap) / 900, 0, 1) : 0;
    const suspect = [];
    if (success >= 4 && msPerTap < 150) suspect.push("saisie trop rapide");
    if (minGap < 50) suspect.push("touches trop rapprochées");
    return result({
      reasons,
      suspect,
      raw: { success, maxLength: success ? levels[success - 1].length : 0, inputTimeMs: inputTime },
      score: 80 * success + bonus,
      secondary: inputTime,
      passed: success >= 4,
      state,
    });
  },
};

// ---------------------------------------------------------------------------
// Precision Shot — toucher des cibles mobiles pendant 45 s.
// Arène carrée normalisée [0,1]², les cibles rebondissent sur les bords.
// Score = 1000 × touchées/total × (0,5 + 0,5 × précision), précision = touchées/tirs.
// (Décision alpha : la formule « × précision » du CDC pénalisait deux fois.)
// ---------------------------------------------------------------------------
export const PRECISION = { durationMs: 45000, spawnEveryMs: 1100, jitterMs: 300, lifeMs: 2600, leadMs: 800, tolerance: 1.15 };

function reflect(v, lo, hi) {
  const span = hi - lo;
  const m = (((v - lo) % (2 * span)) + 2 * span) % (2 * span);
  return lo + (m <= span ? m : 2 * span - m);
}

/** Position d'une cible à l'instant t, ou null si elle n'est pas visible. */
export function targetAt(tg, t) {
  if (t < tg.spawnAt || t >= tg.spawnAt + PRECISION.lifeMs || t >= PRECISION.durationMs) return null;
  const dt = (t - tg.spawnAt) / 1000;
  return { x: reflect(tg.x0 + tg.vx * dt, tg.r, 1 - tg.r), y: reflect(tg.y0 + tg.vy * dt, tg.r, 1 - tg.r) };
}

const precision = {
  id: "precision",
  name: "Precision Shot",
  emoji: "🎯",
  rules: "Touche les cibles mobiles avant qu'elles disparaissent. Chaque tir raté baisse ta précision.",
  version: "1",
  secondaryOrder: "desc",
  secondaryLabel: "précision",
  threshold: "60 % de précision et 5 cibles",
  maxDurationMs: PRECISION.durationMs,
  generate(seed) {
    const rng = makeRng(seed);
    const targets = [];
    for (let i = 0; ; i++) {
      const spawnAt = PRECISION.leadMs + i * PRECISION.spawnEveryMs + rng.int(0, PRECISION.jitterMs);
      if (spawnAt + 1000 > PRECISION.durationMs) break;
      const r = rng.range(0.055, 0.085);
      const angle = rng.range(0, 2 * Math.PI);
      const speed = rng.range(0.15, 0.35);
      targets.push({
        id: i, spawnAt, r,
        x0: rng.range(r, 1 - r), y0: rng.range(r, 1 - r),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      });
    }
    return { targets, durationMs: PRECISION.durationMs };
  },
  evaluate(content, events) {
    const { targets } = content;
    const reasons = [];
    const bad = checkEvents(events, PRECISION.durationMs + 500, "shot", 600);
    if (bad) reasons.push(bad);
    const hitIds = new Set(), dists = [], delays = [];
    let shots = 0;
    for (const e of bad ? [] : events) {
      if (!(e.x >= 0 && e.x <= 1 && e.y >= 0 && e.y <= 1)) { reasons.push("tir hors de l'arène"); break; }
      shots++;
      let best = null;
      for (const tg of targets) {
        if (hitIds.has(tg.id)) continue;
        const p = targetAt(tg, e.t);
        if (!p) continue;
        const d = Math.hypot(p.x - e.x, p.y - e.y) / tg.r;
        if (d <= PRECISION.tolerance && (!best || d < best.d)) best = { tg, d };
      }
      if (best) {
        hitIds.add(best.tg.id);
        dists.push(Math.min(1, best.d));
        delays.push(e.t - best.tg.spawnAt);
      }
    }
    if (!bad) {
      for (let i = 15; i < events.length; i++) {
        if (events[i].t - events[i - 15].t < 1000) { reasons.push("cadence de tir impossible"); break; }
      }
    }
    const hits = hitIds.size;
    const accuracy = shots ? hits / shots : 0;
    const suspect = [];
    if (hits >= 10 && mean(delays) < 200) suspect.push("cibles touchées trop vite");
    if (hits >= 10 && mean(dists) < 0.05) suspect.push("tirs trop centrés");
    return result({
      reasons,
      suspect,
      raw: { hits, shots, total: targets.length, accuracy: Math.round(accuracy * 1000) / 10, centerDistance: hits ? Math.round(mean(dists) * 100) / 100 : null },
      score: (1000 * hits / targets.length) * (0.5 + 0.5 * accuracy),
      secondary: Math.round(accuracy * 1000) / 10,
      passed: accuracy >= 0.6 && hits >= 5,
      state: { hitIds: [...hitIds], hits, shots },
    });
  },
};

// ---------------------------------------------------------------------------
// Logic Sprint — petits problèmes de logique pendant 60 s.
// Suites, calcul mental, comparaisons. 50 par bonne réponse, −15 par erreur.
// (Calibrage alpha : le barème 100/−30 du CDC plafonnait à 1000 dès 10 réponses,
// alors qu'un joueur moyen en donne une vingtaine en 60 s.)
// ---------------------------------------------------------------------------
export const LOGIC = { durationMs: 60000 };

function uniqueChoices(rng, answer, candidates) {
  const set = new Set([answer]);
  for (const c of candidates) if (set.size < 4 && Number.isInteger(c) && c >= 0) set.add(c);
  let k = 2;
  while (set.size < 4) { set.add(answer + k); k++; }
  const choices = rng.shuffle([...set]);
  return { choices: choices.map(String), answer: choices.indexOf(answer) };
}

/** Problème n° i d'une partie (les problèmes sont générés à la demande). */
export function logicProblem(seed, i) {
  const rng = makeRng(hashSeed(seed, "logic", i));
  const kind = rng.pick(["seq", "seq", "calc", "calc", "cmp"]);
  if (kind === "seq") {
    if (rng.next() < 0.6) {
      const a = rng.int(1, 30), d = rng.int(2, 12) * (rng.next() < 0.25 ? -1 : 1);
      const start = d < 0 ? a + 5 * -d : a;
      const terms = [0, 1, 2, 3].map((k) => start + k * d);
      const ans = start + 4 * d;
      return { text: `${terms.join(", ")}, ?`, ...uniqueChoices(rng, ans, rng.shuffle([ans + d, ans - 1, ans + 2, ans - d * 2, ans + 1])) };
    }
    const a = rng.int(1, 5), q = rng.pick([2, 3]);
    const terms = [0, 1, 2, 3].map((k) => a * q ** k);
    const ans = a * q ** 4;
    return { text: `${terms.join(", ")}, ?`, ...uniqueChoices(rng, ans, rng.shuffle([terms[3] * 2, ans + terms[3], ans - a, ans + q])) };
  }
  if (kind === "calc") {
    const a = rng.int(3, 9), b = rng.int(3, 12), c = rng.int(2, 25);
    const plus = rng.next() < 0.5;
    const ans = plus ? a * b + c : a * b - c;
    if (ans < 0) return logicProblem(seed, `${i}b`);
    return {
      text: `${a} × ${b} ${plus ? "+" : "−"} ${c} = ?`,
      ...uniqueChoices(rng, ans, rng.shuffle([ans + 1, ans - 1, ans + 10, ans - 10, ans + a, ans - b])),
    };
  }
  const a = rng.int(2, 12), b = rng.int(2, 12);
  let c, d;
  if (rng.next() < 0.3) {
    const divs = [];
    for (let k = 2; k <= 12; k++) if ((a * b) % k === 0 && (a * b) / k <= 15 && k !== a && k !== b) divs.push(k);
    if (divs.length) { c = rng.pick(divs); d = (a * b) / c; }
  }
  if (c === undefined) { c = rng.int(2, 12); d = rng.int(2, 12); }
  const l = a * b, r = c * d;
  return { text: `${a} × ${b}  ?  ${c} × ${d}`, choices: ["<", "=", ">"], answer: l < r ? 0 : l === r ? 1 : 2 };
}

const logic = {
  id: "logic",
  name: "Logic Sprint",
  emoji: "🧩",
  rules: "Résous un maximum de petits problèmes en 60 secondes. Une erreur coûte des points.",
  version: "1",
  secondaryOrder: "asc",
  secondaryLabel: "nombre d'erreurs",
  threshold: "3 bonnes réponses",
  maxDurationMs: LOGIC.durationMs,
  generate(seed) {
    return { seed, durationMs: LOGIC.durationMs };
  },
  evaluate(content, events) {
    const reasons = [];
    const bad = checkEvents(events, LOGIC.durationMs + 500, "answer", 300);
    if (bad) reasons.push(bad);
    let correct = 0, errors = 0, prev = 0;
    const gaps = [];
    for (const [i, e] of (bad ? [] : events).entries()) {
      if (e.i !== i) { reasons.push("problèmes dans le désordre"); break; }
      const p = logicProblem(content.seed, i);
      if (!Number.isInteger(e.choice) || e.choice < 0 || e.choice >= p.choices.length) { reasons.push("réponse inconnue"); break; }
      if (e.choice === p.answer) correct++;
      else errors++;
      gaps.push(e.t - prev);
      prev = e.t;
    }
    const suspect = [];
    if (correct >= 8 && mean(gaps) < 400) suspect.push("réponses trop rapides");
    return result({
      reasons,
      suspect,
      raw: { correct, errors, answered: correct + errors },
      score: 50 * correct - 15 * errors,
      secondary: errors,
      passed: correct >= 3,
      state: { next: events.length },
    });
  },
};

export const GAMES = { reflex, memory, precision, logic };
export const GAME_IDS = Object.keys(GAMES);
