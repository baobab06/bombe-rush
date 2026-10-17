import { GAMES } from "/lib/games.mjs";
import { countdown, fx, runGame } from "./play.js";

// ------------------------------------------------------------------ outils

const $app = document.getElementById("app");
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(`defis.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`defis.${k}`, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem(`defis.${k}`); } catch { /* idem */ } },
};

/** h("div.card", {onclick}, enfants...) */
function h(sel, attrs, ...kids) {
  const [tag, ...cls] = sel.split(".");
  const e = document.createElement(tag || "div");
  if (cls.length) e.className = cls.join(" ");
  if (attrs !== null && attrs !== undefined && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style") e.style.cssText = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2600);
}

let config = null;
let clockOffset = 0;
/** Profil du joueur connecté (rechargé à chaque changement de compte). */
let session = { token: null, me: null };
const now = () => Date.now() + clockOffset;

class ApiError extends Error {
  constructor(status, body) { super(body?.error ?? "Erreur réseau"); this.status = status; this.body = body; }
}

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { "content-type": "application/json", ...(store.get("token") ? { authorization: `Bearer ${store.get("token")}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { error: "Pas de connexion. Réessaie dans un instant." });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { store.del("token"); route(); }
    throw new ApiError(res.status, data);
  }
  return data;
}

function fmtDuration(ms) {
  if (ms <= 0) return "0 s";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60);
  if (d) return `${d} j ${hh} h`;
  if (hh) return `${hh} h ${String(mm).padStart(2, "0")}`;
  if (mm) return `${mm} min ${String(s % 60).padStart(2, "0")}`;
  return `${s % 60} s`;
}
const fmtTime = (ms) => new Date(ms).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const countdownEl = (target, prefix = "") => h("span", { "data-until": target, "data-prefix": prefix }, prefix + fmtDuration(target - now()));
setInterval(() => {
  for (const e of document.querySelectorAll("[data-until]")) e.textContent = e.dataset.prefix + fmtDuration(Number(e.dataset.until) - now());
}, 1000);

const medal = (rank) => h("span.medal", rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`);
const who = (u) => `${u.avatar} ${u.pseudo}`;
const gameLabel = (id) => `${GAMES[id].emoji} ${GAMES[id].name}`;

function rawText(gameId, raw) {
  if (!raw) return "";
  switch (gameId) {
    case "reflex": return `${raw.good}/20 bons · ${raw.avgRt ?? "–"} ms · ${raw.errors} erreur${raw.errors > 1 ? "s" : ""}`;
    case "memory": return `${raw.success} séquence${raw.success > 1 ? "s" : ""} · ${raw.maxLength} cases max · saisie ${(raw.inputTimeMs / 1000).toFixed(1)} s`;
    case "precision": return `${raw.hits}/${raw.total} cibles · ${raw.accuracy} % de précision`;
    case "logic": return `${raw.correct} bonnes · ${raw.errors} erreur${raw.errors > 1 ? "s" : ""}`;
    default: return "";
  }
}

function applyLocalPrefs() {
  const p = store.get("prefs", { sound: true, vibration: true, reduceMotion: matchMedia("(prefers-reduced-motion: reduce)").matches });
  fx.prefs = p;
  document.documentElement.classList.toggle("reduce-motion", !!p.reduceMotion);
  return p;
}

// --------------------------------------------- envois en attente (hors ligne)
// Une vraie partie en cours est sauvegardée en continu. Si l'app se ferme ou
// si le réseau tombe, les événements sont envoyés plus tard avec le même
// identifiant de tentative : le serveur ne crée jamais de seconde partie.

const pending = {
  all: () => store.get("pending", {}),
  put(id, events) { const p = this.all(); p[id] = events; store.set("pending", p); },
  drop(id) { const p = this.all(); delete p[id]; store.set("pending", p); },
};

async function flushPending() {
  for (const [id, events] of Object.entries(pending.all())) {
    try {
      await api("POST", `/api/attempts/${id}/submit`, { events });
      pending.drop(id);
    } catch (e) {
      if (e.status && e.status !== 0) pending.drop(id); // refus définitif (tentative inconnue…)
    }
  }
}
addEventListener("online", flushPending);
setInterval(flushPending, 15_000);

// ---------------------------------------------------------------- routage

function go(hash) { location.hash = hash; }
addEventListener("hashchange", () => route());

let refreshTimer = null;
async function route() {
  clearInterval(refreshTimer);
  const hash = location.hash.slice(1) || "/";
  const joinCode = new URLSearchParams(location.search).get("join");
  if (joinCode) {
    store.set("joinCode", joinCode);
    history.replaceState(null, "", "/");
  }
  if (!store.get("token")) return renderOnboarding();
  if (session.token !== store.get("token") || !session.me) {
    try {
      session = { token: store.get("token"), me: (await api("GET", "/api/home")).me };
    } catch (e) {
      if (e.status === 401) return;
      return render(h("div.card", h("p", e.message), h("button.btn", { onclick: () => route() }, "Réessayer")));
    }
  }
  const pendingJoin = store.get("joinCode");
  if (pendingJoin) {
    store.del("joinCode");
    try {
      const v = await api("POST", "/api/groups/join", { code: pendingJoin });
      return go(`/g/${v.group.id}`);
    } catch (e) { toast(e.message); }
  }
  const parts = hash.split("/").filter(Boolean);
  try {
    if (parts[0] === "g" && parts[2] === "play") return await renderPlay(parts[1], { kind: "day", challengeId: parts[3], day: Number(parts[4]) });
    if (parts[0] === "g" && parts[2] === "rematch") return await renderPlay(parts[1], { kind: "rematch", rematchId: parts[3] });
    if (parts[0] === "g" && parts[2] === "history") return await renderHistory(parts[1], parts[3]);
    if (parts[0] === "g") return await renderGroup(parts[1]);
    if (parts[0] === "settings") return await renderSettings();
    if (parts[0] === "stats") return await renderStats();
    if (parts[0] === "notifs") return await renderNotifs();
    return await renderHome();
  } catch (e) {
    render(topbar("Oups"), h("div.card", h("p", e.message), h("button.btn", { onclick: () => go("/") }, "Retour à l'accueil")));
  }
}

function render(...nodes) {
  $app.replaceChildren(...nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
  window.scrollTo(0, 0);
}

function topbar(title, { back = "/", actions = [] } = {}) {
  return h("div.topbar",
    back !== null ? h("button.iconbtn", { "aria-label": "Retour", onclick: () => go(back) }, "←") : null,
    h("div.title", title),
    actions);
}

// ------------------------------------------------------------- inscription

function avatarPicker(selected, onPick) {
  const wrap = h("div.avatars", { role: "group", "aria-label": "Avatar" });
  const draw = () => wrap.replaceChildren(...config.avatars.map((a) =>
    h("button", { type: "button", "aria-pressed": String(a === selected), "aria-label": `Avatar ${a}`, onclick: () => { selected = a; onPick(a); draw(); } }, a)));
  draw();
  return wrap;
}

function renderOnboarding() {
  let avatar = config.avatars[0];
  const pseudo = h("input", { type: "text", maxlength: 16, placeholder: "Ton pseudo", autocomplete: "nickname", id: "pseudo" });
  const age = h("input", { type: "checkbox", id: "age" });
  const err = h("p.small", { style: "color:var(--bad)" });
  const submit = async () => {
    err.textContent = "";
    try {
      const r = await api("POST", "/api/users", { pseudo: pseudo.value, avatar, ageConfirmed: age.checked });
      store.set("token", r.token);
      route();
    } catch (e) { err.textContent = e.message; }
  };
  const restore = h("input", { type: "text", placeholder: "Code de récupération" });
  render(
    h("div.stack",
      h("div.center", h("div.huge", "🏆"), h("h1", "Défis entre amis"), h("p.muted", "Un mini-jeu par jour. Une seule vraie partie. Le meilleur du groupe gagne.")),
      h("div.card.stack",
        h("div", h("label.field", { for: "pseudo" }, "Pseudo"), pseudo, h("p.small.muted", "3 à 16 caractères, unique.")),
        h("div", h("label.field", "Avatar"), avatarPicker(avatar, (a) => (avatar = a))),
        h("label.check", age, h("span", "J'ai au moins 15 ans (ou l'accord de mes parents).")),
        err,
        h("button.btn.block", { onclick: submit }, "C'est parti")),
      h("details.card",
        h("summary", "J'ai déjà un compte"),
        h("p.small.muted", "Colle le code de récupération affiché dans les réglages de ton ancien appareil."),
        h("div.row", restore, h("button.btn", { onclick: async () => {
          store.set("token", restore.value.trim());
          try { await api("GET", "/api/home"); route(); } catch { store.del("token"); toast("Code inconnu"); }
        } }, "OK"))),
      window.DefisAndroid ? null : h("a.btn.ghost.block", { href: "/apk/DefisEntreAmis.apk", download: "" }, "📱 Télécharger l'appli Android"),
      h("p.small.muted.center", "Version alpha · ", h("a", { href: "#/privacy", onclick: (e) => { e.preventDefault(); showPrivacy(); } }, "Confidentialité"))));
}

function showPrivacy() {
  render(topbar("Confidentialité", { back: store.get("token") ? "/settings" : null }),
    h("div.card.stack",
      h("p", "Données conservées : ton pseudo, ton avatar, tes préférences et tes résultats. Pas d'e-mail dans cette alpha."),
      h("p", "Les événements bruts de tes vraies parties sont gardés 90 jours pour vérifier les résultats suspects, puis effacés."),
      h("p", "Tu peux supprimer ton compte à tout moment dans les réglages : tes données personnelles sont effacées et ton pseudo devient « Joueur supprimé » dans l'historique des groupes."),
      store.get("token") ? null : h("button.btn", { onclick: () => route() }, "Retour")));
}

// ------------------------------------------------------------------ accueil

async function renderHome() {
  const home = await api("GET", "/api/home");
  session.me = home.me;
  const name = h("input", { type: "text", placeholder: "Nom du groupe", maxlength: 30 });
  const code = h("input", { type: "text", placeholder: "Code à 6 caractères", maxlength: 8, style: "text-transform:uppercase" });
  render(
    h("div.topbar",
      h("div.title", `${home.me.avatar} ${home.me.pseudo}`),
      h("button.iconbtn", { "aria-label": "Statistiques", onclick: () => go("/stats") }, "📊"),
      h("button.iconbtn", { "aria-label": `Notifications (${home.unread} non lues)`, onclick: () => go("/notifs") }, "🔔", home.unread ? h("span.badge", home.unread) : null),
      h("button.iconbtn", { "aria-label": "Réglages", onclick: () => go("/settings") }, "⚙️")),
    h("div.stack",
      home.groups.length ? null : h("div.card.hero", h("h2", "Bienvenue !"), h("p", "Crée un groupe et invite tes amis, ou rejoins un groupe avec son code.")),
      home.groups.map((g) => {
        const t = g.challenge?.today;
        return h("div.card.clickable", { onclick: () => go(`/g/${g.id}`), role: "link", tabindex: 0 },
          h("div.row.spread",
            h("div.grow", h("h3", g.name), h("p.small.muted", g.members.map((m) => m.avatar).join(" "), ` · ${g.members.length} joueur${g.members.length > 1 ? "s" : ""}`)),
            t ? (t.played ? h("span.pill.good", "✓ Joué") : h("span.pill.warn", "À jouer")) : h("span.pill", g.challenge ? "Rattrapage" : "Pas de challenge")),
          t ? h("p.small", `Jour ${t.day + 1}/${g.challenge.durationDays} · ${gameLabel(t.gameId)} · clôture dans `, countdownEl(t.closesAt)) : null);
      }),
      h("div.card.stack",
        h("h2", "Nouveau groupe"),
        h("div.row", name, h("button.btn", { onclick: async () => {
          try { const v = await api("POST", "/api/groups", { name: name.value }); go(`/g/${v.group.id}`); } catch (e) { toast(e.message); }
        } }, "Créer"))),
      h("div.card.stack",
        h("h2", "Rejoindre un groupe"),
        h("div.row", code, h("button.btn.ghost", { onclick: async () => {
          try { const v = await api("POST", "/api/groups/join", { code: code.value }); go(`/g/${v.group.id}`); } catch (e) { toast(e.message); }
        } }, "Rejoindre")))));
}

// ------------------------------------------------------------------- groupe

let groupTab = "today";

async function renderGroup(gid) {
  const v = await api("GET", `/api/groups/${gid}`);
  const me = session.me;
  const isAdmin = v.group.adminId === me.id;
  const ch = v.challenge;
  const tabs = [["today", "Aujourd'hui"], ["rank", "Classement"], ["social", "Social"], ["group", "Groupe"]];
  const body = { today: tabToday, rank: tabRank, social: tabSocial, group: tabGroup }[groupTab](v, me, isAdmin);
  render(
    topbar(v.group.name, { actions: [h("button.iconbtn", { "aria-label": "Actualiser", onclick: () => renderGroup(gid) }, "↻")] }),
    ch ? h("p.small.muted", `Challenge · jour ${Math.min(ch.currentDay + 1, ch.durationDays)}/${ch.durationDays} · fin `, fmtTime(ch.endsAt)) : null,
    h("div.tabs", { role: "tablist" }, tabs.map(([id, label]) =>
      h("button", { role: "tab", "aria-selected": String(groupTab === id), onclick: () => { groupTab = id; renderGroup(gid); } }, label))),
    h("div.stack", body));
  refreshTimer = setInterval(async () => {
    if (location.hash.slice(1) !== `/g/${gid}` || document.querySelector(".game, input:focus")) return;
    renderGroup(gid).catch(() => {});
  }, 30_000);
}

function tabToday(v, me, isAdmin) {
  const ch = v.challenge;
  if (!ch) {
    return [
      v.history.length ? h("div.card", h("h2", "Dernier challenge"), podium(v.history[0].podium, me), h("button.btn.ghost.block", { onclick: () => go(`/g/${v.group.id}/history/${v.history[0].id}`) }, "Voir le détail")) : null,
      isAdmin ? launchForm(v) : h("div.card", h("p", "Pas de challenge en cours."), h("p.muted.small", "L'administrateur du groupe peut en lancer un.")),
    ];
  }
  const out = [];
  const today = ch.days[ch.currentDay];
  if (today && today.status === "open") {
    const a = today.me.attempt;
    out.push(h("div.card.hero.stack",
      h("div.row.spread", h("span.pill", `Jour ${today.day + 1}`), h("span.small", "Clôture dans ", countdownEl(today.closesAt))),
      h("div", h("div.big", gameLabel(today.gameId)), h("p.muted", GAMES[today.gameId].rules)),
      !today.me.enrolled ? h("p", "Tu participes à partir de demain.")
        : a ? h("div", h("p", "Ta vraie partie : ", h("b", a.status === "finished" ? `${a.score} pts` : "en cours d'envoi…")), h("p.small.muted", rawText(today.gameId, a.raw)))
        : h("button.btn.white.block", { onclick: () => go(`/g/${v.group.id}/play/${ch.id}/${today.day}`) }, "Jouer")));
    out.push(dayCard(v, today, me, "Classement du jour"));
  } else if (ch.currentDay >= ch.durationDays) {
    out.push(h("div.card", h("h2", "Dernier jour terminé"), h("p.muted", "Le classement final sera figé à la fin du rattrapage : "), countdownEl(ch.endsAt)));
  }
  for (const d of ch.days) {
    if (d.status === "catchup" && d.me.enrolled && !d.me.attempt) {
      out.push(h("div.card.stack",
        h("div.row.spread", h("h3", `Jour ${d.day + 1} manqué`), h("span.pill.warn", "Rattrapage")),
        h("p.small", `${gameLabel(d.gameId)} · un essai pour comprendre, puis ta vraie partie. Encore `, countdownEl(d.catchupEndsAt)),
        h("button.btn.block", { onclick: () => go(`/g/${v.group.id}/play/${ch.id}/${d.day}`) }, "Rattraper")));
    }
  }
  const past = ch.days.filter((d) => d.status !== "locked" && d.status !== "open").reverse();
  if (past.length) out.push(h("h2", { style: "margin-top:20px" }, "Jours précédents"), past.map((d) => dayCard(v, d, me)));
  return out;
}

function dayCard(v, d, me, title) {
  return h("div.card",
    h("div.row.spread",
      h("h3", title ?? `Jour ${d.day + 1} · ${gameLabel(d.gameId)}`),
      d.provisional ? h("span.pill.warn", "Provisoire") : h("span.pill.good", "Définitif")),
    d.results.length
      ? h("table.rank", h("thead", h("tr", h("th", "#"), h("th", "Joueur"), h("th.num", "Score"), h("th.num", "Pts"))),
        h("tbody", d.results.map((r) => h(`tr${r.user.id === me.id ? ".me" : ""}`,
          h("td", medal(r.rank)),
          h("td", who(r.user), r.suspect ? h("span.pill.warn", { title: "Résultat à examiner" }, " ⚑") : null, r.raw ? h("div.small.muted", rawText(d.gameId, r.raw)) : null),
          h("td.num", r.score), h("td.num", `+${r.points}`)))))
      : h("p.muted.small", "Personne n'a encore joué."),
    d.provisional && d.status !== "open" ? h("p.small.muted", "Détail des parties visible à la fin du rattrapage.") : null);
}

function podium(standings, me) {
  return h("table.rank", h("tbody", standings.map((s) => h(`tr${s.userId === me.id ? ".me" : ""}`,
    h("td", medal(s.rank)), h("td", who(s.user)), h("td.num", `${s.points} pts`)))));
}

function launchForm(v) {
  const dur = h("input", { type: "number", min: 3, max: 30, value: 7, id: "dur" });
  const pace = h("select", { id: "pace" },
    h("option", { value: "" }, "Journées de 24 h (normal)"),
    config.allowFastDays ? [5, 15, 60].map((m) => h("option", { value: m }, `Jours rapides de ${m} min (test)`)) : null);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return h("div.card.stack",
    h("h2", "Lancer un challenge"),
    h("p.small.muted", `Chaque jour s'ouvrira à l'heure du lancement (${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}, fuseau ${tz}).`),
    h("div", h("label.field", { for: "dur" }, "Durée (jours)"), dur),
    h("div", h("label.field", { for: "pace" }, "Rythme"), pace),
    v.group.members.length < 2 ? h("p.small", { style: "color:var(--warn)" }, "Il faut au moins deux joueurs : invite tes amis (onglet Groupe).") : null,
    h("button.btn.block", { disabled: v.group.members.length < 2, onclick: async () => {
      try {
        await api("POST", `/api/groups/${v.group.id}/challenge`, { durationDays: Number(dur.value), tz, dayMinutes: pace.value ? Number(pace.value) : null });
        groupTab = "today";
        renderGroup(v.group.id);
      } catch (e) { toast(e.message); }
    } }, "Lancer maintenant"));
}

function tabRank(v, me) {
  const ch = v.challenge;
  return [
    ch ? h("div.card",
      h("h2", "Classement du challenge"),
      h("table.rank", h("thead", h("tr", h("th", "#"), h("th", "Joueur"), h("th.num", "🥇"), h("th.num", "Pts"))),
        h("tbody", ch.standings.map((s) => h(`tr${s.userId === me.id ? ".me" : ""}`,
          h("td", medal(s.rank)), h("td", who(s.user), s.left ? h("span.small.muted", " (parti)") : null),
          h("td.num", s.wins), h("td.num", s.points))))),
      h("p.small.muted", "Égalité : nombre de premières places, puis total des scores.")) : h("div.card", h("p.muted", "Pas de challenge en cours.")),
    v.history.length ? h("div.card", h("h2", "Historique"), h("div.list", v.history.map((c) =>
      h("div.row.spread.clickable", { style: "cursor:pointer", onclick: () => go(`/g/${v.group.id}/history/${c.id}`) },
        h("div", h("b", new Date(c.launchedAt).toLocaleDateString("fr-FR")), h("div.small.muted", `${c.durationDays} jours · 🏆 ${c.podium[0] ? who(c.podium[0].user) : "–"}`)), "›")))) : null,
  ];
}

function tabSocial(v, me) {
  const ch = v.challenge;
  const others = v.group.members.filter((m) => m.id !== me.id);
  const to = h("select", h("option", { value: "" }, "Tout le groupe"), others.map((m) => h("option", { value: m.id }, who(m))));
  const tauntCard = h("div.card.stack",
    h("h2", "Provoquer"),
    to,
    h("div.row.wrap", Object.entries(config.taunts).map(([id, text]) => h("button.btn.ghost.small", { onclick: async () => {
      try { await api("POST", `/api/groups/${v.group.id}/taunts`, { to: to.value || null, messageId: id }); toast("Envoyé !"); renderGroup(v.group.id); } catch (e) { toast(e.message); }
    } }, text))),
    v.taunts.length ? h("div.list", v.taunts.map((t) => h("div",
      h("div.small.muted", `${who(t.from)} → ${t.to ? who(t.to) : "le groupe"} · ${fmtTime(t.createdAt)}`),
      h("div", t.text, " ", Object.values(t.reactions).join(" ")),
      t.from.id !== me.id ? h("div.row", config.reactions.map((r) => h("button.btn.ghost.small", { "aria-label": `Réagir ${r}`, onclick: async () => {
        try { await api("POST", `/api/taunts/${t.id}/react`, { emoji: r }); renderGroup(v.group.id); } catch (e) { toast(e.message); }
      } }, r))) : null))) : null);

  const closedDays = ch ? ch.days.filter((d) => d.status === "catchup" || d.status === "final") : [];
  const rmDay = h("select", closedDays.map((d) => h("option", { value: d.day }, `Jour ${d.day + 1} · ${gameLabel(d.gameId)}`)));
  const rmOpp = h("select", others.map((m) => h("option", { value: m.id }, who(m))));
  const rematchCard = h("div.card.stack",
    h("h2", "Revanches"),
    h("p.small.muted", "Hors classement · 24 h pour accepter et jouer · même nouvelle seed pour vous deux."),
    closedDays.length && others.length ? h("div.stack", rmDay, rmOpp, h("button.btn.block", { onclick: async () => {
      try {
        await api("POST", "/api/rematches", { challengeId: ch.id, day: Number(rmDay.value), opponentId: rmOpp.value });
        toast("Revanche proposée");
        renderGroup(v.group.id);
      } catch (e) { toast(e.message); }
    } }, "Proposer une revanche")) : h("p.small.muted", "Disponible après la clôture d'un jour."),
    v.rematches.length ? h("div.list", v.rematches.map((r) => rematchRow(v, r, me))) : null);
  return [rematchCard, tauntCard];
}

function rematchRow(v, r, me) {
  const label = { pending: "En attente", accepted: "En cours", done: "Terminée", declined: "Refusée", expired: "Expirée" }[r.status];
  const mySide = r.from.user.id === me.id ? r.from : r.to.user.id === me.id ? r.to : null;
  const canPlay = mySide && !mySide.played && now() < r.expiresAt && (r.status === "accepted" || (r.status === "pending" && r.from.user.id === me.id));
  const side = (s) => `${who(s.user)} ${s.played ? `${s.score}` : "…"}${r.winner === s.user.id ? " 🏆" : ""}`;
  return h("div.stack",
    h("div.row.spread", h("b", gameLabel(r.gameId)), h("span.pill", label)),
    h("div.small", side(r.from), " vs ", side(r.to)),
    r.status === "pending" && r.to.user.id === me.id ? h("div.row",
      h("button.btn.small", { onclick: () => respond(true) }, "Accepter"),
      h("button.btn.ghost.small", { onclick: () => respond(false) }, "Refuser")) : null,
    canPlay ? h("button.btn.small", { onclick: () => go(`/g/${v.group.id}/rematch/${r.id}`) }, "Jouer ma revanche · ", countdownEl(r.expiresAt)) : null);
  async function respond(accept) {
    try { await api("POST", `/api/rematches/${r.id}/respond`, { accept }); renderGroup(v.group.id); } catch (e) { toast(e.message); }
  }
}

function tabGroup(v, me, isAdmin) {
  const inv = v.group.invite;
  const link = inv ? `${location.origin}/?join=${inv.code}` : null;
  return [
    h("div.card.stack",
      h("h2", "Inviter des amis"),
      inv ? [
        h("div.big.center", { style: "letter-spacing:0.15em" }, inv.code),
        h("p.small.muted.center", "Valable jusqu'au ", fmtTime(inv.expiresAt)),
        h("button.btn.block", { onclick: async () => {
          const text = `Rejoins « ${v.group.name} » sur Défis entre amis : ${link}`;
          if (window.DefisAndroid) window.DefisAndroid.share(text);
          else if (navigator.share) navigator.share({ text }).catch(() => {});
          else { await navigator.clipboard?.writeText(link); toast("Lien copié"); }
        } }, "Partager le lien"),
      ] : h("p.muted", "Code expiré."),
      isAdmin ? h("button.btn.ghost.block", { onclick: async () => { await api("POST", `/api/groups/${v.group.id}/invite`); renderGroup(v.group.id); } }, "Nouveau code") : null),
    h("div.card",
      h("h2", `Joueurs (${v.group.members.length}/10)`),
      h("div.list", v.group.members.map((m) => h("div.row.spread",
        h("div", who(m), m.id === v.group.adminId ? h("span.pill", { style: "margin-left:6px" }, "admin") : null),
        isAdmin && m.id !== me.id ? h("div.row",
          h("button.btn.ghost.small", { onclick: async () => { if (confirm(`Donner le rôle d'admin à ${m.pseudo} ?`)) { await api("POST", `/api/groups/${v.group.id}/admin`, { userId: m.id }); renderGroup(v.group.id); } } }, "Admin"),
          h("button.btn.danger.small", { onclick: async () => { if (confirm(`Retirer ${m.pseudo} du groupe ?`)) { await api("POST", `/api/groups/${v.group.id}/remove`, { userId: m.id }); renderGroup(v.group.id); } } }, "Retirer")) : null)))),
    h("button.btn.danger.block", { onclick: async () => {
      if (!confirm("Quitter ce groupe ? Tes points passés restent dans le classement.")) return;
      await api("POST", `/api/groups/${v.group.id}/leave`);
      go("/");
    } }, "Quitter le groupe"),
  ];
}

async function renderHistory(gid, cid) {
  const ch = await api("GET", `/api/groups/${gid}/history/${cid}`);
  const me = session.me;
  render(topbar(`Challenge du ${new Date(ch.launchedAt).toLocaleDateString("fr-FR")}`, { back: `/g/${gid}` }),
    h("div.stack",
      h("div.card", h("h2", "Classement final"), podium(ch.standings, me)),
      ch.days.filter((d) => d.status !== "locked").map((d) => dayCard({ group: { id: gid } }, d, me))));
}

// --------------------------------------------------------- jouer (une journée)

async function renderPlay(gid, ctx) {
  const st = await api("POST", "/api/play/state", { ctx });
  const game = GAMES[st.gameId];
  const g = st.gate;
  const back = `/g/${gid}`;
  const title = ctx.kind === "day" ? `Jour ${ctx.day + 1}` : "Revanche";
  if (g.attempt) {
    return render(topbar(title, { back }), resultCard(st.gameId, g.attempt, "Ta vraie partie"), h("button.btn.block", { onclick: () => go(back) }, "Voir le classement"));
  }
  const catchup = g.mode === "catchup";
  const lastTraining = renderPlay.lastTraining;
  renderPlay.lastTraining = null;
  render(
    topbar(title, { back }),
    h("div.stack",
      h("div.card.stack",
        h("div.big", gameLabel(st.gameId)),
        h("p", game.rules),
        h("p.small.muted", catchup
          ? "Rattrapage : un seul essai pour comprendre (facultatif), puis ta vraie partie, sans seuil."
          : `Entraîne-toi autant que tu veux. Seuil : ${game.threshold}. Le seuil atteint lance ta vraie partie.`)),
      lastTraining ? h("div.card", h("div.row.spread", h("h3", "Essai d'entraînement"), lastTraining.passed ? h("span.pill.good", "Seuil atteint") : h("span.pill", "Sous le seuil")),
        h("div.big", `${lastTraining.score}`), h("p.small.muted", rawText(st.gameId, lastTraining.raw)), h("p.small.muted", "Ce score ne compte pas.")) : null,
      h("div.card.stack",
        h("div.row.spread", h("span", `Essais d'entraînement : ${g.trainings}`), g.best !== null ? h("span.small.muted", `meilleur : ${g.best}`) : null),
        g.canTrain ? h("button.btn.block.ghost", { onclick: () => train(gid, ctx, st) }, catchup ? "Mon essai pour comprendre" : "S'entraîner") : null,
        g.canLaunch ? h("button.btn.block", { onclick: () => official(gid, ctx, st) }, catchup ? "Jouer ma vraie partie" : g.forceLaunch ? "Lancer quand même" : "Lancer la vraie partie") : null,
        g.canLaunch ? h("p.small.muted.center", "⚠️ Une seule tentative. Elle compte pour le classement.") : null)));
}

async function train(gid, ctx, st) {
  try {
    const tr = await api("POST", "/api/play/train/start", { ctx });
    const events = await runGame({ gameId: tr.gameId, seed: tr.seed, label: "Entraînement" });
    const res = await api("POST", "/api/play/train/submit", { ctx, index: tr.index, events });
    if (res.result.passed && res.gate.canLaunch && res.gate.mode === "normal") return ready(gid, ctx, st, res.result);
    renderPlay.lastTraining = res.result;
    renderPlay(gid, ctx);
  } catch (e) {
    toast(e.message);
    renderPlay(gid, ctx);
  }
}

/** Seuil atteint : « Tu es prêt ! » puis compte à rebours de 3 s et vraie partie. */
async function ready(gid, ctx, st, result) {
  const box = h("div.card.hero", { style: "position:relative;min-height:320px" });
  render(topbar(ctx.kind === "day" ? `Jour ${ctx.day + 1}` : "Revanche", { back: null }), h("div.stack",
    h("div.card.center", h("p.muted", "Entraînement"), h("div.big", `${result.score}`), h("p.small.muted", "Seuil atteint ✓")),
    box));
  await countdown(box, 3, "Tu es prêt ! Ta vraie partie démarre…");
  await official(gid, ctx, st, true);
}

async function official(gid, ctx, st, auto = false) {
  if (!auto && !confirm("Lancer ta vraie partie ? Une seule tentative, elle compte pour le classement.")) return;
  let at;
  try {
    at = await api("POST", "/api/play/attempt/start", { ctx });
  } catch (e) {
    toast(e.message);
    return renderPlay(gid, ctx);
  }
  pending.put(at.attemptId, []);
  const events = await runGame({
    gameId: at.gameId, seed: at.seed, label: "Vraie partie", official: true, skipCountdown: auto,
    onEvents: (evs) => pending.put(at.attemptId, evs),
  });
  pending.put(at.attemptId, events);
  render(topbar("Envoi…", { back: null }), h("div.card.center", h("p", "Envoi de ta partie au serveur…")));
  try {
    const r = await api("POST", `/api/attempts/${at.attemptId}/submit`, { events });
    pending.drop(at.attemptId);
    render(topbar("Vraie partie", { back: `/g/${gid}` }), resultCard(at.gameId, r, "Score officiel"), h("button.btn.block", { onclick: () => go(`/g/${gid}`) }, "Voir le classement"));
    fx.good();
  } catch (e) {
    if (e.status === 0) {
      render(topbar("Hors ligne", { back: `/g/${gid}` }), h("div.card.stack",
        h("h2", "Partie enregistrée sur ton téléphone"),
        h("p", "Elle sera envoyée automatiquement dès le retour du réseau, avant la clôture. Tu n'as rien à refaire.")));
    } else {
      pending.drop(at.attemptId);
      toast(e.message);
      renderPlay(gid, ctx);
    }
  }
}

function resultCard(gameId, a, title) {
  const done = a.status === "finished";
  return h("div.card.stack.center",
    h("p.muted", title),
    h("div.huge", done ? a.score : "…"),
    h("p", done ? rawText(gameId, a.raw) : "Partie en cours d'envoi."),
    a.verdict === "invalid" ? h("p", { style: "color:var(--bad)" }, `Résultat refusé : ${a.reasons.join(", ")}`) : null,
    a.verdict === "suspect" ? h("p.small", { style: "color:var(--warn)" }, "Résultat accepté, marqué pour vérification.") : null,
    done && a.score === 0 && !a.raw ? h("p.small.muted", "Aucune partie reçue avant la clôture.") : null);
}

// ---------------------------------------------------------------- réglages

async function renderSettings() {
  const home = await api("GET", "/api/home");
  const me = (session.me = home.me);
  const local = applyLocalPrefs();
  const save = async (patch) => {
    try { session.me = await api("PATCH", "/api/me", patch); toast("Enregistré"); } catch (e) { toast(e.message); renderSettings(); }
  };
  const setLocal = (k, v) => { local[k] = v; store.set("prefs", local); applyLocalPrefs(); };
  const toggle = (label, checked, onChange) => {
    const box = h("input", { type: "checkbox", checked });
    box.addEventListener("change", () => onChange(box.checked));
    return h("label.check", box, h("span", label));
  };
  const pseudo = h("input", { type: "text", value: me.pseudo, maxlength: 16 });
  render(topbar("Réglages"), h("div.stack",
    h("div.card.stack",
      h("h2", "Profil"),
      h("div.row", pseudo, h("button.btn", { onclick: () => save({ pseudo: pseudo.value }) }, "OK")),
      avatarPicker(me.avatar, (a) => save({ avatar: a }))),
    h("div.card.stack",
      h("h2", "Notifications dans l'app"),
      h("p.small.muted", "Alpha : les notifications apparaissent dans la cloche 🔔 (pas encore de notifications push)."),
      Object.entries(config.notifTypes).map(([k, t]) => toggle(t.label, me.prefs.notif[k], (v) => save({ prefs: { notif: { [k]: v } } }))),
      toggle("Couper les provocations reçues", me.prefs.muteTaunts, (v) => save({ prefs: { muteTaunts: v } }))),
    h("div.card.stack",
      h("h2", "Jeu et accessibilité"),
      toggle("Sons", local.sound, (v) => setLocal("sound", v)),
      toggle("Vibrations", local.vibration, (v) => setLocal("vibration", v)),
      toggle("Réduire les animations", local.reduceMotion, (v) => setLocal("reduceMotion", v))),
    h("div.card.stack",
      h("h2", "Changer d'appareil"),
      h("p.small.muted", "Garde ce code secret : il permet de retrouver ton compte sur un autre téléphone."),
      h("button.btn.ghost.block", { onclick: async () => { await navigator.clipboard?.writeText(store.get("token")); toast("Code copié"); } }, "Copier mon code de récupération")),
    h("div.card.stack",
      window.DefisAndroid
        ? h("button.btn.ghost.block", { onclick: () => window.DefisAndroid.openSetup() }, "Changer de serveur")
        : h("a.btn.ghost.block", { href: "/apk/DefisEntreAmis.apk", download: "" }, "Télécharger l'appli Android"),
      h("button.btn.ghost.block", { onclick: showPrivacy }, "Politique de confidentialité"),
      h("button.btn.danger.block", { onclick: async () => {
        if (!confirm("Supprimer définitivement ton compte ? Tes données personnelles seront effacées.")) return;
        await api("DELETE", "/api/me");
        store.del("token");
        route();
      } }, "Supprimer mon compte"))));
}

async function renderStats() {
  const stats = await api("GET", "/api/stats");
  render(topbar("Mes statistiques"), h("div.card",
    h("table.rank", h("thead", h("tr", h("th", "Mini-jeu"), h("th.num", "Parties"), h("th.num", "Record"), h("th.num", "Moy."), h("th.num", "🥇"))),
      h("tbody", Object.entries(stats).map(([id, s]) => h("tr",
        h("td", gameLabel(id)), h("td.num", s.played), h("td.num", s.best ?? "–"), h("td.num", s.average ?? "–"), h("td.num", s.wins))))),
    h("p.small.muted", "Vraies parties uniquement. L'entraînement ne compte jamais.")));
}

async function renderNotifs() {
  const list = await api("GET", "/api/notifications");
  api("POST", "/api/notifications/read").catch(() => {});
  render(topbar("Notifications"), h("div.card",
    list.length ? h("div.list", list.map((n) => h("div.clickable", { style: `cursor:pointer;${n.read ? "" : "font-weight:650"}`, onclick: () => n.groupId && go(`/g/${n.groupId}`) },
      h("div", n.text), h("div.small.muted", fmtTime(n.createdAt))))) : h("p.muted", "Rien pour l'instant.")));
}

/** Bouton retour Android : rien pendant une partie, sinon écran précédent. */
window.__defisBack = () => {
  if (document.querySelector(".game")) return true;
  if (location.hash && location.hash !== "#/") { history.back(); return true; }
  return false;
};

// -------------------------------------------------------------- démarrage

(async function boot() {
  applyLocalPrefs();
  try {
    config = await api("GET", "/api/config");
    clockOffset = config.serverNow - Date.now();
  } catch {
    $app.replaceChildren(h("div.card", h("p", "Serveur injoignable. Vérifie ta connexion puis recharge la page.")));
    return;
  }
  await flushPending();
  route();
})();
