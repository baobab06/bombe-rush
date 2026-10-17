import { test } from "node:test";
import assert from "node:assert/strict";
import { App, AppError, GRACE_MS } from "../lib/app.mjs";
import { Store } from "../lib/store.mjs";
import { play } from "./bots.mjs";

const HOUR = 3600_000, DAY = 24 * HOUR;

function setup(n = 4, { start = Date.UTC(2026, 9, 1, 16, 30) } = {}) {
  const clock = { t: start };
  const app = new App({ store: new Store(null), now: () => clock.t });
  app.clock = clock;
  const us = Array.from({ length: n }, (_, i) => app.auth(app.createUser({ pseudo: `joueur${i}`, avatar: "🦊", ageConfirmed: true }).token));
  const gid = app.createGroup(us[0], { name: "Les amis" }).group.id;
  const code = app.db.groups[gid].invite.code;
  for (const u of us.slice(1)) app.joinGroup(u, code);
  return { app, clock, us, gid };
}

const rejects = (fn, status) => assert.throws(fn, (e) => e instanceof AppError && e.status === status);

/** Entraînement jusqu'au seuil puis vraie partie. */
function playDay(app, u, ctx, { quality = 1, rt = 250 } = {}) {
  const tr = app.trainStart(u, ctx);
  const sub = app.trainSubmit(u, ctx, tr.index, play(tr.gameId, tr.seed));
  assert.ok(sub.gate.canLaunch);
  const at = app.attemptStart(u, ctx);
  app.clock.t += 160_000; // durée réelle de la partie
  return app.attemptSubmit(u, at.attemptId, play(at.gameId, at.seed, { quality, rt }));
}

test("pseudo unique, âge requis, avatar prédéfini", () => {
  const { app } = setup(1);
  rejects(() => app.createUser({ pseudo: "JOUEUR0", avatar: "🦊", ageConfirmed: true }), 409);
  rejects(() => app.createUser({ pseudo: "ab", avatar: "🦊", ageConfirmed: true }), 400);
  rejects(() => app.createUser({ pseudo: "nouveau", avatar: "🦊", ageConfirmed: false }), 400);
  rejects(() => app.createUser({ pseudo: "nouveau", avatar: "X", ageConfirmed: true }), 400);
});

test("groupe : 10 joueurs max, code d'invitation valable 7 jours", () => {
  const { app, us, gid, clock } = setup(10);
  const extra = app.db.users[app.createUser({ pseudo: "onzieme", avatar: "🐼", ageConfirmed: true }).user.id];
  rejects(() => app.joinGroup(extra, app.db.groups[gid].invite.code), 409);
  app.removeMember(us[0], gid, us[9].id);
  clock.t += 8 * DAY;
  rejects(() => app.joinGroup(extra, app.db.groups[gid].invite.code), 404);
  app.renewInvite(us[0], gid);
  app.joinGroup(extra, app.db.groups[gid].invite.code);
  assert.equal(app.db.groups[gid].members.length, 10);
});

test("boucle quotidienne : seuil => vraie partie ; sinon « Lancer quand même » après 3 essais", () => {
  const { app, us, gid } = setup(2);
  const v = app.launchChallenge(us[0], gid, { durationDays: 3, tz: "Europe/Paris" });
  const ctx = { kind: "day", challengeId: v.challenge.id, day: 0 };
  rejects(() => app.attemptStart(us[1], ctx), 403); // pas encore entraîné
  for (let k = 0; k < 3; k++) {
    const tr = app.trainStart(us[1], ctx);
    const res = app.trainSubmit(us[1], ctx, tr.index, []); // essai raté
    assert.equal(res.gate.canLaunch, k === 2);
    assert.equal(res.gate.forceLaunch, k === 2);
  }
  const at = app.attemptStart(us[1], ctx);
  assert.ok(at.attemptId);
  // entraînement réussi dès le premier essai => vraie partie autorisée
  const tr = app.trainStart(us[0], ctx);
  assert.notEqual(tr.seed, at.seed, "seed d'entraînement ≠ seed officielle");
  assert.ok(app.trainSubmit(us[0], ctx, tr.index, play(tr.gameId, tr.seed)).gate.canLaunch);
});

test("une seule vraie partie : relance, resoumission, autre appareil, réseau", () => {
  const { app, us, gid, clock } = setup(2);
  const v = app.launchChallenge(us[0], gid, { durationDays: 3, tz: "Europe/Paris" });
  const ctx = { kind: "day", challengeId: v.challenge.id, day: 0 };
  const tr = app.trainStart(us[0], ctx);
  app.trainSubmit(us[0], ctx, tr.index, play(tr.gameId, tr.seed));
  const at = app.attemptStart(us[0], ctx);
  // fermeture de l'app / autre appareil : impossible de rejouer, l'état serveur est renvoyé
  assert.throws(() => app.attemptStart(us[0], ctx), (e) => e.status === 409 && e.extra.attempt.id === at.attemptId);
  clock.t += 60_000;
  const events = play(at.gameId, at.seed);
  const first = app.attemptSubmit(us[0], at.attemptId, events);
  // soumission répétée : idempotente, même avec d'autres événements
  const again = app.attemptSubmit(us[0], at.attemptId, play(at.gameId, at.seed, { quality: 0.2 }));
  assert.equal(again.score, first.score);
  rejects(() => app.attemptStart(us[0], ctx), 409);
  // Tout le groupe a la même seed officielle
  const tr1 = app.trainStart(us[1], ctx);
  app.trainSubmit(us[1], ctx, tr1.index, play(tr1.gameId, tr1.seed));
  assert.equal(app.attemptStart(us[1], ctx).seed, at.seed);
});

test("partie lancée mais jamais soumise : close à 0 après clôture + marge ; aucune partie ne démarre après la clôture", () => {
  const { app, us, gid, clock } = setup(2);
  const v = app.launchChallenge(us[0], gid, { durationDays: 3, tz: "Europe/Paris" });
  const ctx = { kind: "day", challengeId: v.challenge.id, day: 0 };
  const tr = app.trainStart(us[0], ctx);
  app.trainSubmit(us[0], ctx, tr.index, play(tr.gameId, tr.seed));
  clock.t = v.challenge.days[0].closesAt - 10_000; // lancée 10 s avant la clôture
  const at = app.attemptStart(us[0], ctx);
  clock.t += 30_000; // soumise après la clôture mais dans la marge : acceptée
  const events = play(at.gameId, at.seed).filter((e) => e.t < 20_000);
  assert.notEqual(app.attemptSubmit(us[0], at.attemptId, events).closedReason, "late");
  // joueur 1 : lance juste avant la clôture et ne soumet jamais
  clock.t = v.challenge.days[0].closesAt - 1000;
  const tr1 = app.trainStart(us[1], ctx);
  app.trainSubmit(us[1], ctx, tr1.index, play(tr1.gameId, tr1.seed));
  const at1 = app.attemptStart(us[1], ctx);
  clock.t = at1.submitDeadline + 1;
  const late = app.attemptSubmit(us[1], at1.attemptId, play(at1.gameId, at1.seed));
  assert.equal(late.score, 0);
});

test("résultat impossible refusé (0 point, non classé), durée incohérente refusée", () => {
  const { app, us, gid } = setup(2);
  const v = app.launchChallenge(us[0], gid, { durationDays: 3, tz: "Europe/Paris" });
  const ctx = { kind: "day", challengeId: v.challenge.id, day: 0 };
  const tr = app.trainStart(us[0], ctx);
  app.trainSubmit(us[0], ctx, tr.index, play(tr.gameId, tr.seed));
  const at = app.attemptStart(us[0], ctx);
  // l'horloge n'a pas avancé : des événements à 40 s sont impossibles
  const r = app.attemptSubmit(us[0], at.attemptId, play(at.gameId, at.seed));
  assert.equal(r.verdict, "invalid");
  assert.equal(r.score, 0);
  const day = app.groupView(us[1], gid).challenge.days[0];
  assert.equal(day.results.length, 0);
});

test("challenge de 7 jours à 4 joueurs, de bout en bout, avec rattrapage et détail masqué", () => {
  const { app, us, gid, clock } = setup(4);
  const start = clock.t;
  const v = app.launchChallenge(us[0], gid, { durationDays: 7, tz: "Europe/Paris" });
  const cid = v.challenge.id;
  const games = new Set();
  for (let d = 0; d < 7; d++) {
    clock.t = start + d * DAY + 2 * HOUR;
    app.tick();
    const view = app.groupView(us[0], gid).challenge;
    assert.equal(view.currentDay, d);
    games.add(view.days[d].gameId);
    const ctx = { kind: "day", challengeId: cid, day: d };
    for (const [k, u] of us.entries()) {
      if (d === 2 && k === 3) continue; // joueur 3 manque le jour 2
      clock.t += 120_000;
      playDay(app, u, ctx, { quality: 1 - k * 0.15, rt: 220 + k * 40 });
    }
    // le jour même : les autres voient le score officiel, jamais le détail
    const seen = app.groupView(us[1], gid).challenge.days[d].results.find((r) => r.user.id === us[0].id);
    assert.ok(seen.score > 0);
    assert.equal(seen.raw, undefined);
    if (d === 3) {
      // jour 3 : le joueur 3 rattrape le jour 2 (un seul essai, puis vraie partie sans seuil)
      const ctx2 = { kind: "day", challengeId: cid, day: 2 };
      const before = app.groupView(us[0], gid).challenge.days[2];
      assert.equal(before.results.length, 3);
      assert.equal(before.status, "catchup");
      const st = app.playState(us[3], ctx2);
      assert.equal(st.gate.mode, "catchup");
      assert.ok(st.gate.canLaunch);
      const tr = app.trainStart(us[3], ctx2);
      app.trainSubmit(us[3], ctx2, tr.index, []);
      rejects(() => app.trainStart(us[3], ctx2), 403);
      const at = app.attemptStart(us[3], ctx2);
      clock.t += 120_000;
      app.attemptSubmit(us[3], at.attemptId, play(at.gameId, at.seed, { quality: 1, rt: 200 }));
      const after = app.groupView(us[0], gid).challenge.days[2];
      assert.equal(after.results.length, 4, "classement du jour recalculé");
      assert.equal(after.provisional, true);
    }
  }
  assert.equal(games.size, 4);
  // fin du rattrapage du jour 2 : détail visible, résultats définitifs
  const d2 = app.groupView(us[1], gid).challenge.days[2];
  assert.equal(d2.provisional, false);
  assert.ok(d2.results.find((r) => r.user.id === us[0].id).raw);
  // fin du challenge : 24 h après la clôture du dernier jour (+ marge des parties en cours)
  clock.t = start + 8 * DAY + GRACE_MS + 1000;
  app.tick();
  const g = app.groupView(us[0], gid);
  assert.equal(g.challenge, null);
  assert.equal(g.history.length, 1);
  const podium = g.history[0].podium;
  assert.equal(podium[0].user.id, us[0].id);
  assert.ok(podium[0].points >= 60);
  const notifs = app.notifications(us[3]).map((n) => n.type);
  for (const t of ["dayOpen", "missedDay", "dayResults", "challengeEnded"]) assert.ok(notifs.includes(t), t);
  assert.ok(!notifs.includes("friendPlayed"), "« Un ami a joué » désactivé par défaut");
  const stats = app.stats(us[0]);
  assert.equal(Object.values(stats).reduce((a, s) => a + s.played, 0), 7);
  // un nouveau challenge peut être relancé
  app.launchChallenge(us[0], gid, { durationDays: 3, tz: "Europe/Paris" });
});

test("rejoindre ou quitter en cours de challenge", () => {
  const { app, us, gid, clock } = setup(3);
  const v = app.launchChallenge(us[0], gid, { durationDays: 5, tz: "UTC" });
  const cid = v.challenge.id;
  playDay(app, us[2], { kind: "day", challengeId: cid, day: 0 });
  const late = app.db.users[app.createUser({ pseudo: "retard", avatar: "🐼", ageConfirmed: true }).user.id];
  app.joinGroup(late, app.db.groups[gid].invite.code);
  rejects(() => app.trainStart(late, { kind: "day", challengeId: cid, day: 0 }), 403);
  clock.t += DAY;
  app.trainStart(late, { kind: "day", challengeId: cid, day: 1 });
  app.leaveGroup(us[2], gid);
  const st = app.groupView(us[0], gid).challenge.standings.find((s) => s.userId === us[2].id);
  assert.equal(st.points, 10, "points passés conservés");
  assert.equal(st.left, true);
});

test("revanches : après clôture, une active par paire, hors classement", () => {
  const { app, us, gid, clock } = setup(3);
  const v = app.launchChallenge(us[0], gid, { durationDays: 3, tz: "UTC" });
  const cid = v.challenge.id;
  rejects(() => app.proposeRematch(us[0], { challengeId: cid, day: 0, opponentId: us[1].id }), 403);
  clock.t += DAY;
  const rm = app.proposeRematch(us[0], { challengeId: cid, day: 0, opponentId: us[1].id });
  rejects(() => app.proposeRematch(us[1], { challengeId: cid, day: 0, opponentId: us[0].id }), 409);
  const ctx = { kind: "rematch", rematchId: rm.id };
  rejects(() => app.trainStart(us[1], ctx), 403); // pas encore acceptée
  app.respondRematch(us[1], rm.id, true);
  playDay(app, us[0], ctx, { quality: 1 });
  playDay(app, us[1], ctx, { quality: 0.5 });
  const view = app.groupView(us[2], gid);
  assert.equal(view.rematches[0].status, "done");
  assert.equal(view.rematches[0].winner, us[0].id);
  assert.equal(view.challenge.days[0].results.length, 0, "hors classement");
  assert.equal(app.notifications(us[1])[0].type, "rematch");
});

test("provocations : messages prédéfinis, 3 par jour et par destinataire, coupables", () => {
  const { app, us, gid, clock } = setup(3);
  for (let k = 0; k < 3; k++) app.sendTaunt(us[0], gid, { to: us[1].id, messageId: "beat" });
  rejects(() => app.sendTaunt(us[0], gid, { to: us[1].id, messageId: "beat" }), 429);
  rejects(() => app.sendTaunt(us[0], gid, { to: null, messageId: "texte libre" }), 400);
  app.sendTaunt(us[0], gid, { to: null, messageId: "gg" });
  const tid = app.groupView(us[1], gid).taunts[0].id;
  app.reactTaunt(us[1], tid, "😂");
  rejects(() => app.reactTaunt(us[0], tid, "😂"), 403);
  app.updateMe(us[2], { prefs: { muteTaunts: true } });
  app.sendTaunt(us[0], gid, { to: us[2].id, messageId: "slow" });
  assert.equal(app.groupView(us[2], gid).taunts.length, 0);
  assert.ok(!app.notifications(us[2]).some((n) => n.type === "taunt" && n.text.includes("jouer quand")));
  clock.t += DAY + 1;
  app.sendTaunt(us[0], gid, { to: us[1].id, messageId: "beat" });
});

test("suppression du compte : données effacées, pseudo « Joueur supprimé »", () => {
  const { app, us, gid } = setup(3);
  const v = app.launchChallenge(us[0], gid, { durationDays: 3, tz: "UTC" });
  playDay(app, us[1], { kind: "day", challengeId: v.challenge.id, day: 0 });
  const token = app.createUser({ pseudo: "temp", avatar: "🐼", ageConfirmed: true }).token;
  app.deleteMe(us[1]);
  assert.equal(app.db.users[us[1].id].pseudo, "Joueur supprimé");
  assert.equal(app.db.users[us[1].id].tokenHash, null);
  const res = app.groupView(us[0], gid).challenge.days[0].results;
  assert.equal(res[0].user.pseudo, "Joueur supprimé");
  // le pseudo est libéré
  app.updateMe(app.auth(token), { pseudo: "joueur1" });
});
