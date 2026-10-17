// Règles du jeu côté serveur. Le serveur fait foi : heure, paramètres, score
// officiel et classement sont décidés ici. L'horloge est injectable (tests).

import { createHash, randomBytes } from "node:crypto";
import { GAMES, GAME_IDS } from "./games.mjs";
import { hashSeed, makeRng } from "./rng.mjs";
import { challengeStandings, compareEntries, rankDay } from "./scoring.mjs";
import { catchupEnd, challengeEnd, currentDay, dayClose, dayOpen, isValidTimeZone } from "./calendar.mjs";

export const AVATARS = ["🦊", "🐼", "🐸", "🦁", "🐙", "🦉", "🐯", "🐨", "🐵", "🦄", "🐧", "🐲"];
export const TAUNTS = {
  ready: "Prépare-toi à perdre 😏",
  easy: "C'était trop facile aujourd'hui",
  beat: "Bats ça si tu peux !",
  slow: "Tu joues quand, au juste ? ⏰",
  lucky: "Pure chance, avoue",
  gg: "Bien joué, respect 🙌",
  revenge: "Je veux ma revanche",
  watch: "Regarde le classement 👀",
};
export const REACTIONS = ["😂", "😤", "🔥", "👏", "😱", "🙄"];
export const NOTIF_TYPES = {
  dayOpen: { label: "Défi du jour ouvert", default: true },
  missedDay: { label: "Jour manqué, rattrapage possible", default: true },
  closingReminder: { label: "Rappel avant la clôture", default: true },
  friendPlayed: { label: "Un ami a joué", default: false },
  rematch: { label: "Revanche proposée", default: true },
  taunt: { label: "Provocation reçue", default: true },
  dayResults: { label: "Résultats du jour", default: true },
  challengeEnded: { label: "Challenge terminé", default: true },
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Marge après une échéance : durée max d'un mini-jeu (150 s) + 2 min, arrondie. */
export const GRACE_MS = 5 * 60_000;
const MARGIN_MS = 2 * 60_000;
const INVITE_MS = 7 * DAY;
const EVENTS_KEPT_MS = 90 * DAY;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export class AppError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
const fail = (status, message, extra) => { throw new AppError(status, message, extra); };

const newId = () => randomBytes(8).toString("hex");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const ctxKey = (ctx) => (ctx.kind === "day" ? `d:${ctx.challengeId}:${ctx.day}` : `r:${ctx.rematchId}`);

export class App {
  constructor({ store, now = () => Date.now(), allowFastDays = true }) {
    this.store = store;
    this.db = store.data;
    this.now = now;
    this.allowFastDays = allowFastDays;
    this.tokens = new Map();
    this.attemptIndex = new Map();
    this.openAttempts = new Set();
    for (const u of Object.values(this.db.users)) if (u.tokenHash) this.tokens.set(u.tokenHash, u.id);
    for (const a of Object.values(this.db.attempts)) {
      this.attemptIndex.set(`${a.ctxKey}|${a.userId}`, a.id);
      if (a.status === "started") this.openAttempts.add(a.id);
    }
  }

  // ------------------------------------------------------------------ comptes

  createUser({ pseudo, avatar, ageConfirmed }) {
    if (ageConfirmed !== true) fail(400, "Il faut avoir au moins 15 ans pour jouer.");
    const name = this.#checkPseudo(pseudo);
    if (!AVATARS.includes(avatar)) fail(400, "Avatar inconnu.");
    const token = randomBytes(24).toString("base64url");
    const user = {
      id: newId(), pseudo: name, avatar, createdAt: this.now(), tokenHash: sha(token),
      prefs: { notif: {}, muteTaunts: false },
    };
    this.db.users[user.id] = user;
    this.tokens.set(user.tokenHash, user.id);
    this.store.save();
    return { token, user: this.#me(user) };
  }

  auth(token) {
    const id = token && this.tokens.get(sha(token));
    const user = id && this.db.users[id];
    if (!user || user.deleted) fail(401, "Session inconnue, reconnecte-toi.");
    return user;
  }

  updateMe(user, { pseudo, avatar, prefs }) {
    if (pseudo !== undefined && pseudo.trim().toLowerCase() !== user.pseudo.toLowerCase()) user.pseudo = this.#checkPseudo(pseudo);
    else if (pseudo !== undefined) user.pseudo = pseudo.trim();
    if (avatar !== undefined) {
      if (!AVATARS.includes(avatar)) fail(400, "Avatar inconnu.");
      user.avatar = avatar;
    }
    if (prefs?.notif) {
      for (const [k, v] of Object.entries(prefs.notif)) if (k in NOTIF_TYPES) user.prefs.notif[k] = !!v;
    }
    if (prefs && "muteTaunts" in prefs) user.prefs.muteTaunts = !!prefs.muteTaunts;
    this.store.save();
    return this.#me(user);
  }

  /** Suppression du compte : données personnelles effacées, pseudo remplacé dans l'historique. */
  deleteMe(user) {
    for (const g of Object.values(this.db.groups)) {
      if (g.members.some((m) => m.userId === user.id)) this.#removeFromGroup(g, user.id);
    }
    this.tokens.delete(user.tokenHash);
    Object.assign(user, { deleted: true, pseudo: "Joueur supprimé", avatar: "👤", tokenHash: null, prefs: { notif: {}, muteTaunts: true } });
    delete this.db.notifications[user.id];
    this.store.save();
  }

  #checkPseudo(pseudo) {
    const name = String(pseudo ?? "").trim();
    if (!/^[\p{L}\p{N}_.\- ]{3,16}$/u.test(name)) fail(400, "Pseudo : 3 à 16 caractères (lettres, chiffres, espace, _ . -).");
    const taken = Object.values(this.db.users).some((u) => !u.deleted && u.pseudo.toLowerCase() === name.toLowerCase());
    if (taken) fail(409, "Ce pseudo est déjà pris.");
    return name;
  }

  #me(user) {
    const notif = {};
    for (const [k, t] of Object.entries(NOTIF_TYPES)) notif[k] = user.prefs.notif[k] ?? t.default;
    return { id: user.id, pseudo: user.pseudo, avatar: user.avatar, prefs: { notif, muteTaunts: user.prefs.muteTaunts } };
  }

  #public(uid) {
    const u = this.db.users[uid];
    return u ? { id: u.id, pseudo: u.pseudo, avatar: u.avatar } : { id: uid, pseudo: "Joueur supprimé", avatar: "👤" };
  }

  // ------------------------------------------------------------------ groupes

  createGroup(user, { name }) {
    const n = String(name ?? "").trim();
    if (n.length < 2 || n.length > 30) fail(400, "Nom du groupe : 2 à 30 caractères.");
    const g = {
      id: newId(), name: n, adminId: user.id, createdAt: this.now(),
      members: [{ userId: user.id, joinedAt: this.now() }],
      invite: this.#newInvite(), activeChallengeId: null,
    };
    this.db.groups[g.id] = g;
    this.store.save();
    return this.groupView(user, g.id);
  }

  #newInvite() {
    let code;
    do code = Array.from(randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    while (Object.values(this.db.groups).some((g) => g.invite.code === code));
    return { code, expiresAt: this.now() + INVITE_MS };
  }

  #group(user, gid) {
    const g = this.db.groups[gid];
    if (!g || !g.members.some((m) => m.userId === user.id)) fail(404, "Groupe introuvable.");
    return g;
  }

  #admin(user, gid) {
    const g = this.#group(user, gid);
    if (g.adminId !== user.id) fail(403, "Réservé à l'administrateur du groupe.");
    return g;
  }

  joinGroup(user, code) {
    const c = String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const g = Object.values(this.db.groups).find((x) => x.invite.code === c);
    if (!g || g.invite.expiresAt < this.now()) fail(404, "Code d'invitation invalide ou expiré.");
    if (g.members.some((m) => m.userId === user.id)) return this.groupView(user, g.id);
    if (g.members.length >= 10) fail(409, "Ce groupe est complet (10 joueurs maximum).");
    g.members.push({ userId: user.id, joinedAt: this.now() });
    const ch = g.activeChallengeId && this.db.challenges[g.activeChallengeId];
    if (ch) {
      // Rejoint en cours de challenge : participe dès le jour suivant.
      const from = currentDay(ch, this.now()) + 1;
      const prev = ch.enrollments[user.id];
      ch.enrollments[user.id] = { from: prev ? Math.max(from, prev.from) : from, to: null };
    }
    this.store.save();
    return this.groupView(user, g.id);
  }

  leaveGroup(user, gid) {
    this.#removeFromGroup(this.#group(user, gid), user.id);
    this.store.save();
  }

  removeMember(user, gid, uid) {
    const g = this.#admin(user, gid);
    if (uid === user.id) fail(400, "Utilise « Quitter le groupe ».");
    if (!g.members.some((m) => m.userId === uid)) fail(404, "Joueur introuvable.");
    this.#removeFromGroup(g, uid);
    this.store.save();
    return this.groupView(user, gid);
  }

  transferAdmin(user, gid, uid) {
    const g = this.#admin(user, gid);
    if (!g.members.some((m) => m.userId === uid)) fail(404, "Joueur introuvable.");
    g.adminId = uid;
    this.store.save();
    return this.groupView(user, gid);
  }

  renewInvite(user, gid) {
    const g = this.#admin(user, gid);
    g.invite = this.#newInvite();
    this.store.save();
    return this.groupView(user, gid);
  }

  /** Quitter pendant un challenge : les points passés restent, plus de jours suivants. */
  #removeFromGroup(g, uid) {
    g.members = g.members.filter((m) => m.userId !== uid);
    const ch = g.activeChallengeId && this.db.challenges[g.activeChallengeId];
    if (ch?.enrollments[uid]) ch.enrollments[uid].to = currentDay(ch, this.now());
    if (!g.members.length) {
      delete this.db.groups[g.id];
      return;
    }
    if (g.adminId === uid) g.adminId = g.members[0].userId;
  }

  // -------------------------------------------------------------- challenges

  launchChallenge(user, gid, { durationDays = 7, tz, dayMinutes = null }) {
    const g = this.#admin(user, gid);
    if (g.activeChallengeId) fail(409, "Un challenge est déjà en cours dans ce groupe.");
    if (g.members.length < 2) fail(400, "Il faut au moins deux joueurs pour lancer un challenge.");
    if (!Number.isInteger(durationDays) || durationDays < 3 || durationDays > 30) fail(400, "Durée : 3 à 30 jours.");
    if (!tz || !isValidTimeZone(tz)) fail(400, "Fuseau horaire inconnu.");
    let dayMs = null;
    if (dayMinutes !== null && dayMinutes !== undefined) {
      if (!this.allowFastDays) fail(400, "Jours rapides désactivés sur ce serveur.");
      if (!Number.isInteger(dayMinutes) || dayMinutes < 2 || dayMinutes > 120) fail(400, "Jour rapide : 2 à 120 minutes.");
      dayMs = dayMinutes * 60_000;
    }
    const id = newId();
    const ch = {
      id, groupId: g.id, createdBy: user.id, launchedAt: this.now(), tz, durationDays, dayMs,
      games: drawGames(id, durationDays),
      enrollments: Object.fromEntries(g.members.map((m) => [m.userId, { from: 0, to: null }])),
      status: "active", final: null,
    };
    this.db.challenges[id] = ch;
    g.activeChallengeId = id;
    this.tick();
    this.store.save();
    return this.groupView(user, gid);
  }

  /** Contexte de jeu : un jour de challenge ou une revanche. */
  #resolve(user, ctx) {
    const now = this.now();
    if (ctx?.kind === "day") {
      const ch = this.db.challenges[ctx.challengeId];
      if (!ch) fail(404, "Challenge introuvable.");
      this.#group(user, ch.groupId);
      const day = ctx.day;
      const e = ch.enrollments[user.id];
      if (!Number.isInteger(day) || day < 0 || day >= ch.durationDays) fail(400, "Jour inconnu.");
      if (!e || day < e.from || (e.to !== null && day > e.to)) fail(403, "Tu ne participes pas à ce jour.");
      if (now < dayOpen(ch, day)) fail(403, "Ce jour n'est pas encore ouvert.");
      const mode = now < dayClose(ch, day) ? "normal" : now < catchupEnd(ch, day) ? "catchup" : "closed";
      return {
        key: ctxKey(ctx), ctx: { kind: "day", challengeId: ch.id, day }, mode, gameId: ch.games[day],
        seed: hashSeed(ch.id, day, "official"),
        startDeadline: mode === "normal" ? dayClose(ch, day) : catchupEnd(ch, day),
        groupId: ch.groupId,
      };
    }
    if (ctx?.kind === "rematch") {
      const rm = this.db.rematches[ctx.rematchId];
      if (!rm || (rm.from !== user.id && rm.to !== user.id)) fail(404, "Revanche introuvable.");
      this.#group(user, rm.groupId);
      const playable = rm.status === "accepted" || (rm.status === "pending" && rm.from === user.id);
      const mode = playable && now < rm.expiresAt ? "normal" : "closed";
      return {
        key: ctxKey(ctx), ctx: { kind: "rematch", rematchId: rm.id }, mode, gameId: rm.gameId,
        seed: rm.seed, startDeadline: rm.expiresAt, groupId: rm.groupId,
      };
    }
    fail(400, "Contexte de jeu inconnu.");
  }

  #training(key, uid) {
    const k = `${key}|${uid}`;
    return (this.db.trainings[k] ??= { issued: 0, submitted: [], count: 0, catchupCount: 0, reached: false, best: null });
  }

  #gate(r, tr) {
    const attempt = this.#attemptFor(r.key, tr.uid);
    return {
      mode: r.mode,
      trainings: tr.count,
      reached: tr.reached,
      best: tr.best,
      canTrain: r.mode === "normal" || (r.mode === "catchup" && tr.catchupCount < 1),
      canLaunch: !attempt && (r.mode === "catchup" || (r.mode === "normal" && (tr.reached || tr.count >= 3))),
      forceLaunch: r.mode === "normal" && !tr.reached && tr.count >= 3,
      attempt: attempt ? this.#attemptSummary(attempt, true) : null,
    };
  }

  playState(user, ctx) {
    this.#closeExpired();
    const r = this.#resolve(user, ctx);
    const tr = this.#training(r.key, user.id);
    return { ctx: r.ctx, gameId: r.gameId, gate: this.#gate(r, { ...tr, uid: user.id }) };
  }

  trainStart(user, ctx) {
    const r = this.#resolve(user, ctx);
    if (r.mode === "closed") fail(403, "Ce jour est clos.");
    const tr = this.#training(r.key, user.id);
    if (r.mode === "catchup") {
      if (tr.catchupCount >= 1) fail(403, "En rattrapage, un seul essai d'entraînement.");
      tr.catchupCount++;
    }
    const index = tr.issued++;
    this.store.save();
    // Seed d'entraînement : nouvelle à chaque essai, jamais celle de la vraie partie.
    return { index, gameId: r.gameId, seed: hashSeed(r.key, user.id, "train", index) };
  }

  trainSubmit(user, ctx, index, events) {
    const r = this.#resolve(user, ctx);
    const tr = this.#training(r.key, user.id);
    if (!Number.isInteger(index) || index < 0 || index >= tr.issued) fail(400, "Essai inconnu.");
    const game = GAMES[r.gameId];
    const res = game.evaluate(game.generate(hashSeed(r.key, user.id, "train", index)), events);
    if (!tr.submitted.includes(index)) {
      tr.submitted.push(index);
      tr.count++;
      if (res.passed) tr.reached = true;
      // Seul le meilleur score d'entraînement du jour est conservé.
      if (res.verdict !== "invalid" && (tr.best === null || res.score > tr.best)) tr.best = res.score;
    }
    this.store.save();
    return {
      result: { score: res.score, raw: res.raw, passed: res.passed, verdict: res.verdict, reasons: res.reasons },
      gate: this.#gate(r, { ...tr, uid: user.id }),
    };
  }

  #attemptFor(key, uid) {
    const id = this.attemptIndex.get(`${key}|${uid}`);
    return id ? this.db.attempts[id] : null;
  }

  /** Vraie partie : une seule par joueur et par contexte, quoi qu'il arrive. */
  attemptStart(user, ctx) {
    this.#closeExpired();
    const r = this.#resolve(user, ctx);
    const existing = this.#attemptFor(r.key, user.id);
    if (existing) fail(409, "Tu as déjà lancé ta vraie partie.", { attempt: this.#attemptSummary(existing, true) });
    if (r.mode === "closed") fail(403, "Trop tard : plus aucune vraie partie ne peut démarrer.");
    const tr = this.#training(r.key, user.id);
    if (!this.#gate(r, { ...tr, uid: user.id }).canLaunch) fail(403, "Entraîne-toi d'abord (seuil ou 3 essais).");
    const game = GAMES[r.gameId];
    const a = {
      id: newId(), userId: user.id, ctxKey: r.key, ctx: r.ctx, groupId: r.groupId,
      gameId: r.gameId, version: game.version, seed: r.seed, mode: r.mode,
      status: "started", startedAt: this.now(),
      submitDeadline: r.startDeadline + game.maxDurationMs + MARGIN_MS,
      events: null, verdict: null, reasons: [], raw: null, score: null, secondary: null,
    };
    this.db.attempts[a.id] = a;
    this.attemptIndex.set(`${r.key}|${user.id}`, a.id);
    this.openAttempts.add(a.id);
    this.store.save();
    return { attemptId: a.id, gameId: a.gameId, seed: a.seed, version: a.version, submitDeadline: a.submitDeadline };
  }

  /** Soumission idempotente : renvoyer deux fois les événements ne change rien. */
  attemptSubmit(user, attemptId, events) {
    const a = this.db.attempts[attemptId];
    if (!a || a.userId !== user.id) fail(404, "Tentative introuvable.");
    if (a.status === "finished") return this.#attemptSummary(a, true);
    const now = this.now();
    if (now > a.submitDeadline) {
      this.#finish(a, [], { verdict: "ok", reasons: ["aucune soumission avant la clôture"], raw: null, score: 0, secondary: null }, "late");
    } else {
      const game = GAMES[a.gameId];
      const res = game.evaluate(game.generate(a.seed), events);
      const lastT = Array.isArray(events) && events.length ? events[events.length - 1].t : 0;
      if (res.verdict !== "invalid" && lastT > now - a.startedAt + 5000) {
        Object.assign(res, { verdict: "invalid", reasons: ["durée de partie incohérente"], score: 0 });
      }
      this.#finish(a, Array.isArray(events) ? events : [], res, null);
    }
    this.store.save();
    return this.#attemptSummary(a, true);
  }

  attemptGet(user, attemptId) {
    this.#closeExpired();
    const a = this.db.attempts[attemptId];
    if (!a || a.userId !== user.id) fail(404, "Tentative introuvable.");
    return this.#attemptSummary(a, true);
  }

  #finish(a, events, res, closedReason) {
    a.status = "finished";
    a.submittedAt = this.now();
    a.events = events;
    a.verdict = res.verdict;
    a.reasons = res.reasons;
    a.raw = res.raw;
    a.score = res.verdict === "invalid" ? 0 : res.score;
    a.secondary = res.secondary;
    a.closedReason = closedReason;
    this.openAttempts.delete(a.id);
    const g = this.db.groups[a.groupId];
    const u = this.db.users[a.userId];
    if (g && a.ctx.kind === "day" && a.verdict !== "invalid") {
      for (const m of g.members) if (m.userId !== a.userId) this.#notify(m.userId, "friendPlayed", `${u.pseudo} a joué : ${a.score} pts`, g.id);
    }
    if (a.ctx.kind === "rematch") {
      const rm = this.db.rematches[a.ctx.rematchId];
      const other = rm.from === a.userId ? rm.to : rm.from;
      const oa = this.#attemptFor(a.ctxKey, other);
      if (oa?.status === "finished") rm.status = "done";
    }
  }

  #attemptSummary(a, mine) {
    return {
      id: a.id, ctx: a.ctx, gameId: a.gameId, status: a.status, mode: a.mode,
      score: a.score, verdict: a.verdict, secondary: a.secondary,
      raw: mine ? a.raw : undefined, reasons: mine ? a.reasons : undefined,
      startedAt: a.startedAt, submitDeadline: a.submitDeadline,
    };
  }

  /** Tentatives jamais soumises : closes avec 0 une fois le délai passé. */
  #closeExpired() {
    const now = this.now();
    for (const id of this.openAttempts) {
      const a = this.db.attempts[id];
      if (now > a.submitDeadline) {
        this.#finish(a, [], { verdict: "ok", reasons: ["aucune soumission avant la clôture"], raw: null, score: 0, secondary: null }, "late");
      }
    }
  }

  // ----------------------------------------------------------- classements

  #dayResults(ch, day) {
    const game = GAMES[ch.games[day]];
    const entries = [];
    for (const uid of Object.keys(ch.enrollments)) {
      const a = this.#attemptFor(`d:${ch.id}:${day}`, uid);
      // Résultat impossible : refusé, 0 point, non classé.
      if (a?.status === "finished" && a.verdict !== "invalid") {
        entries.push({ userId: uid, score: a.score, secondary: a.secondary, raw: a.raw, suspect: a.verdict === "suspect" });
      }
    }
    return rankDay(entries, game.secondaryOrder);
  }

  #challengeView(ch, user) {
    const now = this.now();
    const days = [];
    const ranked = [];
    for (let i = 0; i < ch.durationDays; i++) {
      const opensAt = dayOpen(ch, i);
      if (now < opensAt) { days.push({ day: i, opensAt, status: "locked" }); continue; }
      const closesAt = dayClose(ch, i), catchupEndsAt = catchupEnd(ch, i);
      const results = this.#dayResults(ch, i);
      ranked.push(results);
      // Les résultats restent provisoires (et le détail masqué) jusqu'à la fin du rattrapage.
      const provisional = now < catchupEndsAt + GRACE_MS;
      const e = ch.enrollments[user.id];
      const enrolled = !!e && i >= e.from && (e.to === null || i <= e.to);
      const mine = this.#attemptFor(`d:${ch.id}:${i}`, user.id);
      days.push({
        day: i, gameId: ch.games[i], opensAt, closesAt, catchupEndsAt,
        status: now < closesAt ? "open" : now < catchupEndsAt ? "catchup" : "final",
        provisional,
        results: results.map((r) => ({
          user: this.#public(r.userId), rank: r.rank, points: r.points, score: r.score,
          secondary: !provisional || r.userId === user.id ? r.secondary : undefined,
          raw: !provisional || r.userId === user.id ? r.raw : undefined,
          suspect: r.suspect && !provisional ? true : undefined,
        })),
        me: { enrolled, attempt: mine ? this.#attemptSummary(mine, true) : null },
      });
    }
    const standings = challengeStandings(Object.keys(ch.enrollments), ranked).map((s) => ({
      ...s, user: this.#public(s.userId), left: ch.enrollments[s.userId].to !== null,
    }));
    return {
      id: ch.id, status: ch.status, launchedAt: ch.launchedAt, tz: ch.tz, durationDays: ch.durationDays,
      dayMs: ch.dayMs, endsAt: challengeEnd(ch), currentDay: currentDay(ch, now), days, standings,
    };
  }

  groupView(user, gid) {
    this.#closeExpired();
    const g = this.#group(user, gid);
    const now = this.now();
    const ch = g.activeChallengeId && this.db.challenges[g.activeChallengeId];
    const history = Object.values(this.db.challenges)
      .filter((c) => c.groupId === g.id && c.status === "finished")
      .sort((a, b) => b.launchedAt - a.launchedAt)
      .map((c) => ({ id: c.id, launchedAt: c.launchedAt, durationDays: c.durationDays, podium: c.final.standings.slice(0, 3) }));
    const rematches = Object.values(this.db.rematches)
      .filter((r) => r.groupId === g.id && r.createdAt > now - 7 * DAY)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((r) => this.#rematchView(r, user));
    const taunts = Object.values(this.db.taunts)
      .filter((t) => t.groupId === g.id && (t.to === null || t.to === user.id || t.from === user.id))
      .filter((t) => !user.prefs.muteTaunts || t.from === user.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30)
      .map((t) => ({ id: t.id, from: this.#public(t.from), to: t.to ? this.#public(t.to) : null, text: TAUNTS[t.messageId], createdAt: t.createdAt, reactions: t.reactions }));
    return {
      group: {
        id: g.id, name: g.name, adminId: g.adminId,
        invite: g.invite.expiresAt > now ? g.invite : null,
        members: g.members.map((m) => this.#public(m.userId)),
      },
      challenge: ch ? this.#challengeView(ch, user) : null,
      history, rematches, taunts,
    };
  }

  historyView(user, gid, cid) {
    const g = this.#group(user, gid);
    const ch = this.db.challenges[cid];
    if (!ch || ch.groupId !== g.id || ch.status !== "finished") fail(404, "Challenge introuvable.");
    return this.#challengeView(ch, user);
  }

  home(user) {
    this.#closeExpired();
    const now = this.now();
    const groups = Object.values(this.db.groups)
      .filter((g) => g.members.some((m) => m.userId === user.id))
      .map((g) => {
        const ch = g.activeChallengeId && this.db.challenges[g.activeChallengeId];
        let today = null;
        if (ch) {
          const d = currentDay(ch, now);
          if (d >= 0 && d < ch.durationDays) {
            const a = this.#attemptFor(`d:${ch.id}:${d}`, user.id);
            today = { day: d, gameId: ch.games[d], closesAt: dayClose(ch, d), played: !!a };
          }
        }
        return { id: g.id, name: g.name, members: g.members.map((m) => this.#public(m.userId)), challenge: ch ? { id: ch.id, durationDays: ch.durationDays, today } : null };
      });
    const unread = (this.db.notifications[user.id] ?? []).filter((n) => !n.read).length;
    return { me: this.#me(user), groups, unread };
  }

  stats(user) {
    const per = Object.fromEntries(GAME_IDS.map((id) => [id, { played: 0, best: null, total: 0, wins: 0 }]));
    for (const a of Object.values(this.db.attempts)) {
      if (a.userId !== user.id || a.ctx.kind !== "day" || a.status !== "finished" || a.verdict === "invalid") continue;
      const s = per[a.gameId];
      s.played++;
      s.total += a.score;
      s.best = Math.max(s.best ?? 0, a.score);
      const ch = this.db.challenges[a.ctx.challengeId];
      if (ch && this.#dayResults(ch, a.ctx.day).find((r) => r.userId === user.id)?.rank === 1) s.wins++;
    }
    return Object.fromEntries(Object.entries(per).map(([id, s]) => [id, { played: s.played, best: s.best, average: s.played ? Math.round(s.total / s.played) : null, wins: s.wins }]));
  }

  // ------------------------------------------------------------- revanches

  proposeRematch(user, { challengeId, day, opponentId }) {
    const ch = this.db.challenges[challengeId];
    if (!ch) fail(404, "Challenge introuvable.");
    const g = this.#group(user, ch.groupId);
    if (opponentId === user.id || !g.members.some((m) => m.userId === opponentId)) fail(400, "Adversaire introuvable.");
    if (!Number.isInteger(day) || day < 0 || day >= ch.durationDays) fail(400, "Jour inconnu.");
    const now = this.now();
    if (now < dayClose(ch, day)) fail(403, "Une revanche se propose après la clôture du jour.");
    const pair = [user.id, opponentId].sort().join("|");
    const active = Object.values(this.db.rematches).some((r) =>
      [r.from, r.to].sort().join("|") === pair && (r.status === "pending" || r.status === "accepted") && now < r.expiresAt);
    if (active) fail(409, "Une revanche est déjà en cours entre vous deux.");
    const id = newId();
    const rm = {
      id, groupId: g.id, challengeId, day, gameId: ch.games[day], seed: hashSeed(id, "official"),
      from: user.id, to: opponentId, createdAt: now, expiresAt: now + (ch.dayMs ?? DAY), status: "pending",
    };
    this.db.rematches[id] = rm;
    this.#notify(opponentId, "rematch", `${user.pseudo} te propose une revanche sur ${GAMES[rm.gameId].name}`, g.id);
    this.store.save();
    return this.#rematchView(rm, user);
  }

  respondRematch(user, rematchId, accept) {
    const rm = this.db.rematches[rematchId];
    if (!rm || rm.to !== user.id) fail(404, "Revanche introuvable.");
    if (rm.status !== "pending" || this.now() >= rm.expiresAt) fail(409, "Cette revanche n'est plus en attente.");
    rm.status = accept ? "accepted" : "declined";
    this.#notify(rm.from, "rematch", `${user.pseudo} a ${accept ? "accepté" : "refusé"} ta revanche`, rm.groupId);
    this.store.save();
    return this.#rematchView(rm, user);
  }

  #rematchView(rm, user) {
    const key = ctxKey({ kind: "rematch", rematchId: rm.id });
    const side = (uid) => {
      const a = this.#attemptFor(key, uid);
      return { user: this.#public(uid), played: a?.status === "finished", score: a?.status === "finished" ? a.score : null, secondary: a?.secondary ?? null };
    };
    const from = side(rm.from), to = side(rm.to);
    let winner = null;
    if (rm.status === "done") {
      const c = compareEntries(from, to, GAMES[rm.gameId].secondaryOrder);
      winner = c < 0 ? rm.from : c > 0 ? rm.to : "tie";
    }
    return {
      id: rm.id, gameId: rm.gameId, day: rm.day, status: rm.status, createdAt: rm.createdAt, expiresAt: rm.expiresAt,
      from, to, winner, mine: rm.from === user.id || rm.to === user.id,
    };
  }

  // ----------------------------------------------------------- provocations

  sendTaunt(user, gid, { to = null, messageId }) {
    const g = this.#group(user, gid);
    if (!(messageId in TAUNTS)) fail(400, "Message inconnu.");
    if (to !== null && (to === user.id || !g.members.some((m) => m.userId === to))) fail(400, "Destinataire introuvable.");
    const now = this.now();
    const recent = Object.values(this.db.taunts).filter((t) => t.groupId === g.id && t.from === user.id && t.to === to && t.createdAt > now - DAY);
    if (recent.length >= 3) fail(429, "3 provocations par jour et par destinataire, pas plus.");
    const t = { id: newId(), groupId: g.id, from: user.id, to, messageId, createdAt: now, reactions: {} };
    this.db.taunts[t.id] = t;
    const targets = to ? [to] : g.members.map((m) => m.userId).filter((u) => u !== user.id);
    for (const uid of targets) {
      if (!this.db.users[uid]?.prefs.muteTaunts) this.#notify(uid, "taunt", `${user.pseudo} : « ${TAUNTS[messageId]} »`, g.id);
    }
    this.store.save();
    return { ok: true };
  }

  reactTaunt(user, tauntId, emoji) {
    const t = this.db.taunts[tauntId];
    if (!t) fail(404, "Provocation introuvable.");
    this.#group(user, t.groupId);
    if (t.from === user.id || (t.to !== null && t.to !== user.id)) fail(403, "Seul le destinataire peut réagir.");
    if (!REACTIONS.includes(emoji)) fail(400, "Réaction inconnue.");
    t.reactions[user.id] = emoji;
    this.store.save();
    return { ok: true };
  }

  // ----------------------------------------------------------- notifications

  #notify(uid, type, text, groupId, dedupeKey = null) {
    const u = this.db.users[uid];
    if (!u || u.deleted) return;
    if (dedupeKey) {
      if (this.db.sent[dedupeKey]) return;
      this.db.sent[dedupeKey] = this.now();
    }
    if ((u.prefs.notif[type] ?? NOTIF_TYPES[type].default) === false) return;
    const list = (this.db.notifications[uid] ??= []);
    list.unshift({ id: newId(), type, text, groupId, createdAt: this.now(), read: false });
    list.length = Math.min(list.length, 100);
  }

  notifications(user) {
    return this.db.notifications[user.id] ?? [];
  }

  markRead(user) {
    for (const n of this.db.notifications[user.id] ?? []) n.read = true;
    this.store.save();
  }

  // ------------------------------------------------------------------ tick

  /** Tâches planifiées : clôtures, notifications horaires, fin des challenges, purge. */
  tick() {
    const now = this.now();
    this.#closeExpired();
    for (const ch of Object.values(this.db.challenges)) {
      if (ch.status !== "active") continue;
      const g = this.db.groups[ch.groupId];
      const members = new Set(g ? g.members.map((m) => m.userId) : []);
      const cur = currentDay(ch, now);
      for (let i = 0; i <= Math.min(cur, ch.durationDays - 1); i++) {
        const open = dayOpen(ch, i), close = dayClose(ch, i), cu = catchupEnd(ch, i);
        const game = GAMES[ch.games[i]];
        const reminderAt = close - Math.min(HOUR, (close - open) / 4);
        const ranked = now >= close && now < cu ? this.#dayResults(ch, i) : null;
        for (const [uid, e] of Object.entries(ch.enrollments)) {
          if (!members.has(uid) || i < e.from || (e.to !== null && i > e.to)) continue;
          const played = !!this.#attemptFor(`d:${ch.id}:${i}`, uid);
          const k = `${ch.id}:${i}:${uid}`;
          if (now < close) this.#notify(uid, "dayOpen", `Jour ${i + 1} : ${game.emoji} ${game.name} t'attend`, ch.groupId, `open:${k}`);
          if (!played && now >= reminderAt && now < close) this.#notify(uid, "closingReminder", `Plus que quelques minutes pour jouer le jour ${i + 1}`, ch.groupId, `remind:${k}`);
          if (ranked) {
            if (!played) this.#notify(uid, "missedDay", `Jour ${i + 1} manqué : tu peux encore le rattraper`, ch.groupId, `missed:${k}`);
            const me = ranked.find((r) => r.userId === uid);
            const text = me ? `Jour ${i + 1} : tu es ${me.rank}${me.rank === 1 ? "er" : "e"} (+${me.points} pts, provisoire)` : `Résultats provisoires du jour ${i + 1} disponibles`;
            this.#notify(uid, "dayResults", text, ch.groupId, `results:${k}`);
          }
        }
      }
      if (now >= challengeEnd(ch) + GRACE_MS) this.#finalize(ch, g);
    }
    for (const rm of Object.values(this.db.rematches)) {
      if ((rm.status === "pending" || rm.status === "accepted") && now >= rm.expiresAt + GRACE_MS) rm.status = "expired";
    }
    for (const a of Object.values(this.db.attempts)) {
      if (a.events && a.submittedAt < now - EVENTS_KEPT_MS) a.events = null;
    }
    this.store.save();
  }

  #finalize(ch, g) {
    const ranked = [];
    for (let i = 0; i < ch.durationDays; i++) ranked.push(this.#dayResults(ch, i));
    const standings = challengeStandings(Object.keys(ch.enrollments), ranked);
    ch.status = "finished";
    ch.final = { standings: standings.map((s) => ({ ...s, user: this.#public(s.userId) })), finishedAt: this.now() };
    if (g) {
      g.activeChallengeId = null;
      for (const m of g.members) {
        const me = standings.find((s) => s.userId === m.userId);
        const text = me ? `Challenge terminé : tu finis ${me.rank}${me.rank === 1 ? "er 🏆" : "e"} avec ${me.points} pts` : "Challenge terminé";
        this.#notify(m.userId, "challengeEnded", text, g.id, `end:${ch.id}:${m.userId}`);
      }
    }
  }
}

/** Mini-jeu de chaque jour : par blocs de quatre, sans répétition avant que les quatre aient été joués. */
export function drawGames(challengeId, durationDays) {
  const out = [];
  for (let block = 0; out.length < durationDays; block++) {
    let order = makeRng(hashSeed(challengeId, "draw", block)).shuffle(GAME_IDS);
    if (order[0] === out[out.length - 1]) order = [...order.slice(1), order[0]];
    out.push(...order);
  }
  return out.slice(0, durationDays);
}
