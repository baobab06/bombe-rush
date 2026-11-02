/**
 * Interface du COMPTE GOOGLE : bouton de connexion, chargement, erreurs,
 * choix en cas de conflit de progression, état de la sauvegarde en ligne.
 */
import { CloudSync, type ProfileSummary, type SignInResult } from "../meta/cloud";
import { localBackend } from "../meta/save";
import type { Profile } from "../meta/profile";
import { serverBase } from "../net/config";
import { AuthError, authKind, forgetGoogleAccount, nativeSignIn, renderWebButton, testSignIn } from "../platform/google-auth";
import type { Modal } from "./ctx";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fr = (n: number) => Math.round(n).toLocaleString("fr-FR");

const G_LOGO =
  '<svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 7.2-9.6 7.2-16.9z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.2-8.8 2.2-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

export interface AccountHost {
  modal: Modal;
  toast(text: string, kind?: "" | "hot" | "bad" | "good"): void;
  profile(): Profile;
  /** la progression a été remplacée par celle du compte : tout réafficher */
  replaced(p: Profile): void;
}

/** Appel JSON vers le serveur du jeu (même adresse que le multijoueur). */
async function api(path: string, init: { method: string; body?: unknown; session?: string | null }) {
  const base = serverBase();
  if (!base) throw new Error("pas de serveur");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(base.replace(/\/$/, "") + path, {
      method: init.method,
      headers: { ...(init.body !== undefined ? { "content-type": "application/json" } : {}), ...(init.session ? { authorization: `Bearer ${init.session}` } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
    let json: unknown = {};
    try {
      json = await r.json();
    } catch {
      /* corps vide */
    }
    return { status: r.status, json };
  } finally {
    clearTimeout(t);
  }
}

export class AccountUI {
  readonly cloud: CloudSync;
  onChange: (() => void) | null = null;

  constructor(private host: AccountHost) {
    this.cloud = new CloudSync({
      api,
      storage: localBackend,
      getProfile: () => host.profile(),
      setProfile: (p) => host.replaced(p),
    });
    this.cloud.onChange = () => {
      this.onChange?.();
      // conflit découvert en synchronisant (deux appareils) : on demande au joueur
      const c = this.cloud.pendingConflict();
      if (c && !this.host.modal.isOpen && this.cloud.status === "error") this.openConflict(c.local, c.cloud, c.updatedAt);
    };
  }

  /** Démarrage + resynchronisation au retour du réseau / de l'appli. */
  start() {
    void this.cloud.init();
    window.addEventListener("online", () => void this.cloud.sync());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void this.cloud.sync();
      else if (this.cloud.meta.dirty) void this.cloud.push(); // l'appli passe en arrière-plan : on envoie tout de suite
    });
  }

  /** Libellé court de l'état (réglages, profil). */
  statusLine(): { text: string; kind: "ok" | "wait" | "warn" | "off" } {
    const c = this.cloud;
    switch (c.status) {
      case "disabled":
        return { text: "Sauvegarde en ligne indisponible pour le moment (progression gardée sur cet appareil).", kind: "off" };
      case "signedOut":
        return { text: c.lastError || "Connecte-toi pour sauvegarder ta progression et la retrouver sur n'importe quel téléphone.", kind: c.lastError ? "warn" : "off" };
      case "busy":
        return { text: "Synchronisation…", kind: "wait" };
      case "synced":
        return { text: "Progression sauvegardée en ligne ✓", kind: "ok" };
      case "pending":
        return { text: "Envoi de la progression…", kind: "wait" };
      case "offline":
        return { text: c.lastError || "Hors ligne : envoi dès le retour du réseau.", kind: "warn" };
      default:
        return { text: c.lastError || "Erreur de synchronisation.", kind: "warn" };
    }
  }

  /** Bloc « Compte » des réglages. */
  renderBox(el: HTMLElement) {
    const c = this.cloud;
    const st = this.statusLine();
    el.innerHTML = "";
    const h = document.createElement("h3");
    h.className = "label";
    h.textContent = "Compte";
    el.appendChild(h);
    const line = document.createElement("p");
    line.className = `acct-status ${st.kind}`;
    line.textContent = st.text;
    if (c.signedIn) {
      const who = document.createElement("p");
      who.className = "acct-who";
      who.innerHTML = `${G_LOGO}<span>Connecté${c.meta.email ? " : <b>" + esc(c.meta.email) + "</b>" : " avec Google"}</span>`;
      el.appendChild(who);
      el.appendChild(line);
      const row = document.createElement("div");
      row.className = "acct-actions";
      const sync = document.createElement("button");
      sync.className = "btn btn-blue small";
      sync.innerHTML = "<span>Synchroniser</span>";
      sync.onclick = () => void this.cloud.sync();
      const out = document.createElement("button");
      out.className = "btn-link";
      out.textContent = "Se déconnecter";
      out.onclick = () => this.confirmSignOut();
      row.append(sync, out);
      el.appendChild(row);
      const del = document.createElement("button");
      del.className = "btn-link acct-delete";
      del.textContent = "Supprimer mon compte en ligne";
      del.onclick = () => this.confirmDelete();
      el.appendChild(del);
    } else {
      el.appendChild(line);
      if (c.enabled) {
        const b = document.createElement("button");
        b.className = "btn-google";
        b.innerHTML = `${G_LOGO}<span>Se connecter avec Google</span>`;
        b.onclick = () => this.openSignIn();
        el.appendChild(b);
      }
    }
  }

  /** Suppression du compte en ligne (double confirmation). */
  private confirmDelete() {
    this.host.modal.open((sheet, close) => {
      sheet.insertAdjacentHTML(
        "beforeend",
        `<h2>Supprimer le compte en ligne ?</h2><p class="sub">Ta sauvegarde en ligne et le lien avec ton compte Google seront <b>définitivement supprimés</b> de notre serveur. La progression reste sur ce téléphone (en compte invité).</p><p class="acct-msg" hidden></p>`,
      );
      const msg = sheet.querySelector<HTMLElement>(".acct-msg")!;
      const row = document.createElement("div");
      row.className = "sheet-actions";
      const no = document.createElement("button");
      no.className = "btn btn-ghost";
      no.innerHTML = "<span>Annuler</span>";
      no.onclick = close;
      const yes = document.createElement("button");
      yes.className = "btn btn-red";
      yes.innerHTML = "<span>Supprimer définitivement</span>";
      yes.onclick = async () => {
        yes.disabled = no.disabled = true;
        msg.hidden = false;
        msg.className = "acct-msg wait";
        msg.innerHTML = '<i class="spin"></i>Suppression…';
        const ok = await this.cloud.deleteAccount();
        if (!ok) {
          yes.disabled = no.disabled = false;
          msg.className = "acct-msg bad";
          msg.textContent = this.cloud.lastError || "Suppression impossible pour l'instant.";
          return;
        }
        forgetGoogleAccount();
        close();
        this.host.toast("Compte en ligne supprimé. Ta progression reste sur ce téléphone.", "");
      };
      row.append(no, yes);
      sheet.appendChild(row);
    });
  }

  private confirmSignOut() {
    this.host.modal.open((sheet, close) => {
      sheet.insertAdjacentHTML(
        "beforeend",
        `<h2>Se déconnecter ?</h2><p class="sub">Ta progression reste sur ce téléphone et dans ton compte Google. Reconnecte-toi au même compte pour la retrouver.</p>`,
      );
      const row = document.createElement("div");
      row.className = "sheet-actions";
      const no = document.createElement("button");
      no.className = "btn btn-ghost";
      no.innerHTML = "<span>Annuler</span>";
      no.onclick = close;
      const yes = document.createElement("button");
      yes.className = "btn btn-red";
      yes.innerHTML = "<span>Se déconnecter</span>";
      yes.onclick = async () => {
        yes.disabled = true;
        await this.cloud.signOut();
        forgetGoogleAccount();
        close();
        this.host.toast("Déconnecté. Ta progression reste sur ce téléphone.", "");
      };
      row.append(no, yes);
      sheet.appendChild(row);
    });
  }

  /**
   * Fenêtre de connexion : bouton officiel Google, chargement, erreurs.
   * `fromWelcome` : arrivée sur un nouvel appareil (récupérer sa progression).
   */
  openSignIn(fromWelcome = false, done?: (r: SignInResult) => void) {
    const kind = authKind();
    const clientId = this.cloud.googleClientId;
    this.host.modal.open((sheet, close) => {
      sheet.classList.add("acct-sheet");
      sheet.insertAdjacentHTML(
        "beforeend",
        `<h2>Compte Google</h2>
         <p class="sub">${fromWelcome ? "Tu as déjà joué ? Connecte-toi pour retrouver ta progression." : "Sauvegarde ta progression (pièces, skins, niveau, rang…) et retrouve-la sur n'importe quel téléphone."}</p>
         <div class="acct-btn-slot"></div>
         <p class="acct-msg" hidden></p>
         <p class="hint">Google ne nous donne que ton identifiant de compte et ton adresse e-mail. Aucun mot de passe n'est transmis au jeu.</p>`,
      );
      const slot = sheet.querySelector<HTMLElement>(".acct-btn-slot")!;
      const msg = sheet.querySelector<HTMLElement>(".acct-msg")!;
      const busy = (on: boolean, text = "Connexion à ton compte…") => {
        slot.classList.toggle("busy", on);
        if (on) {
          msg.hidden = false;
          msg.className = "acct-msg wait";
          msg.innerHTML = `<i class="spin"></i>${esc(text)}`;
        }
      };
      const fail = (e: unknown) => {
        busy(false);
        msg.hidden = false;
        msg.className = "acct-msg bad";
        msg.textContent = (e as Error)?.message || "La connexion a échoué. Réessaie.";
        if ((e as AuthError)?.cancelled) msg.className = "acct-msg";
      };
      const withToken = async (token: string) => {
        busy(true);
        try {
          const r = await this.cloud.signInWithGoogleToken(token);
          close();
          this.after(r, done);
        } catch (e) {
          fail(e);
        }
      };
      if (!this.cloud.enabled || !clientId) {
        fail(new Error("La connexion Google n'est pas encore activée sur le serveur. Ta progression reste sur ce téléphone."));
        return;
      }
      if (kind === "web") {
        busy(true, "Chargement de Google…");
        void renderWebButton(slot, clientId, (t) => void withToken(t), fail).then(() => {
          if (!msg.classList.contains("bad")) msg.hidden = true;
          slot.classList.remove("busy");
        });
        return;
      }
      if (kind === "none") {
        fail(new Error("Connexion Google indisponible ici (il faut l'appli ou le site sécurisé https)."));
        return;
      }
      const b = document.createElement("button");
      b.className = "btn-google big";
      b.innerHTML = `${G_LOGO}<span>Se connecter avec Google</span>`;
      b.onclick = async () => {
        busy(true, "Choix du compte Google…");
        try {
          const token = kind === "android" ? await nativeSignIn(clientId) : await testSignIn();
          await withToken(token);
        } catch (e) {
          fail(e);
        }
      };
      slot.appendChild(b);
    });
  }

  /** Après la connexion : message clair, ou choix si deux progressions différentes. */
  private after(r: SignInResult, done?: (r: SignInResult) => void) {
    if (r.kind === "linked") this.host.toast("Progression associée à ton compte Google ✓", "good");
    else if (r.kind === "restored") this.host.toast("Progression du compte récupérée ✓", "good");
    else if (r.kind === "synced") this.host.toast("Connecté — progression à jour ✓", "good");
    else return this.openConflict(r.local, r.cloud, r.updatedAt, done && (() => done(r)));
    done?.(r);
  }

  /** Deux progressions différentes : le joueur choisit, rien n'est perdu (l'autre est mise de côté). */
  openConflict(local: ProfileSummary, cloud: ProfileSummary, updatedAt: number, done?: () => void) {
    const card = (title: string, s: ProfileSummary, extra: string) =>
      `<div class="acct-card"><b>${title}</b><span class="acct-name">${esc(s.name)}</span>
        <ul><li>Niveau <b>${s.level}</b></li><li><b>${fr(s.coins)}</b> pièces · <b>${fr(s.bombers)}</b> bombers</li><li><b>${s.played}</b> parties · <b>${s.wins}</b> victoires</li><li><b>${s.items}</b> objets</li></ul><small>${extra}</small></div>`;
    const when = updatedAt ? new Date(updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
    this.host.modal.open(
      (sheet, close) => {
        sheet.classList.add("acct-sheet");
        sheet.insertAdjacentHTML(
          "beforeend",
          `<h2>Deux progressions différentes</h2>
           <p class="sub">Ce compte Google a déjà une progression, différente de celle de ce téléphone. Laquelle veux-tu garder ?</p>
           <div class="acct-compare">${card("☁️ Compte Google", cloud, when ? "Sauvegardée le " + when : "")}${card("📱 Ce téléphone", local, "Progression actuelle")}</div>
           <p class="acct-msg" hidden></p>`,
        );
        const msg = sheet.querySelector<HTMLElement>(".acct-msg")!;
        const row = document.createElement("div");
        row.className = "sheet-actions wrap";
        const keepCloud = document.createElement("button");
        keepCloud.className = "btn btn-yellow";
        keepCloud.innerHTML = "<span>Garder le compte Google</span>";
        const keepLocal = document.createElement("button");
        keepLocal.className = "btn btn-blue";
        keepLocal.innerHTML = "<span>Garder ce téléphone</span>";
        const cancel = document.createElement("button");
        cancel.className = "btn-link";
        cancel.textContent = "Annuler (ne rien changer)";
        const run = async (fn: () => Promise<void>, ok: string) => {
          row.querySelectorAll("button").forEach((b) => ((b as HTMLButtonElement).disabled = true));
          msg.hidden = false;
          msg.className = "acct-msg wait";
          msg.innerHTML = '<i class="spin"></i>Enregistrement…';
          await fn();
          close();
          this.host.toast(ok, "good");
          done?.();
        };
        keepCloud.onclick = () => void run(() => this.cloud.resolveConflict("cloud"), "Progression du compte récupérée ✓ (l'ancienne est gardée de côté sur ce téléphone)");
        let armed = false;
        keepLocal.onclick = () => {
          // double confirmation : la version en ligne sera remplacée (le serveur en garde une copie)
          if (!armed) {
            armed = true;
            keepLocal.innerHTML = "<span>Confirmer : remplacer le compte</span>";
            msg.hidden = false;
            msg.className = "acct-msg bad";
            msg.textContent = "La progression du compte Google sera remplacée par celle de ce téléphone (une copie de secours est gardée).";
            return;
          }
          void run(() => this.cloud.resolveConflict("local"), "Progression de ce téléphone enregistrée dans ton compte ✓");
        };
        cancel.onclick = () => {
          void this.cloud.cancelConflict();
          close();
          this.host.toast("Rien n'a été changé. Tu n'es pas connecté.", "");
        };
        row.append(keepCloud, keepLocal);
        sheet.appendChild(row);
        sheet.appendChild(cancel);
      },
      { closable: false },
    );
  }
}
