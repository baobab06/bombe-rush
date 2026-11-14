/**
 * « JOUER EN LIGNE » : fenêtre de recherche de la Partie rapide et
 * parrainage « Invite un ami ».
 */
import type { QueuePlayer } from "../net/protocol";
import { STORE_URL } from "../net/update-policy";
import { normalizeCode } from "../net/protocol";
import { drawPortrait } from "../ui/thumbs";
import { shareInvite, copyText } from "../platform/share";
import { grant, type Granted } from "../meta/grants";
import { audio } from "../audio/audio";
import { fmt, type AppCtx } from "./ctx";
import { showGranted } from "./rewards";
import type { OnlineController } from "./online";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ------------------------------------------------------------ recherche
/** Fenêtre « Recherche de joueurs… » de la Partie rapide. */
export class QuickSearch {
  private sheet: HTMLElement | null = null;
  private started = 0;
  private timer = 0;
  private last: { players: QueuePlayer[]; waited: number; maxWait: number } | null = null;

  constructor(
    private ctx: AppCtx,
    private online: OnlineController,
    private me: () => { name: string; characterId: string },
  ) {}

  get open() {
    return !!this.sheet;
  }

  start() {
    this.started = Date.now();
    this.last = null;
    this.ctx.modal.open(
      (sheet, close) => {
        this.sheet = sheet;
        sheet.insertAdjacentHTML(
          "beforeend",
          `<h2>RECHERCHE DE JOUEURS…</h2>
          <div class="srch-sub">🌍 Partie rapide · <b class="srch-time">0:00</b></div>
          <div class="slots"></div>
          <div class="srch-bar"><i></i></div>
          <p class="srch-hint">Si personne d'autre n'arrive d'ici 15 s, la partie démarre quand même.</p>
          <button class="btn btn-red small srch-cancel"><span>ANNULER</span></button>`,
        );
        sheet.querySelector(".srch-cancel")!.addEventListener("click", () => {
          this.ctx.click();
          close();
        });
        this.render();
      },
      {
        cls: "search",
        onClose: () => {
          this.sheet = null;
          clearInterval(this.timer);
          this.online.quickLeave();
        },
      },
    );
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 250);
    this.online.quickJoin();
  }

  /** La partie démarre : on ferme sans quitter la file (le serveur l'a déjà fait). */
  matched() {
    if (!this.sheet) return;
    this.online.inQueue = false;
    this.ctx.modal.close();
  }

  update(q: { players: QueuePlayer[]; waited: number; maxWait: number } | null) {
    if (!this.sheet) return;
    if (!q) return; // sortie de file : la partie démarre (matchStart suit) ou annulation
    const before = this.last?.players.length ?? 1;
    this.last = q;
    // recale le minuteur local sur celui du serveur
    this.started = Date.now() - q.waited * 1000;
    if (q.players.length > before) audio.play("pickup");
    this.render();
  }

  private tick() {
    if (!this.sheet) return;
    const s = Math.floor((Date.now() - this.started) / 1000);
    const t = this.sheet.querySelector(".srch-time");
    if (t) t.textContent = `0:${String(Math.min(59, s)).padStart(2, "0")}`;
    const max = this.last?.maxWait ?? 15;
    const bar = this.sheet.querySelector<HTMLElement>(".srch-bar i");
    if (bar) bar.style.width = `${Math.min(100, ((Date.now() - this.started) / 1000 / max) * 100)}%`;
    if (this.online.status === "unavailable") {
      this.ctx.toast("Serveur injoignable : vérifie ta connexion internet.", "bad");
      this.ctx.modal.close();
    }
  }

  private render() {
    const box = this.sheet?.querySelector(".slots");
    if (!box) return;
    const me = this.me();
    const list: QueuePlayer[] = this.last?.players.length ? this.last.players : [{ name: me.name, characterId: me.characterId, you: true }];
    // toi en premier
    const ordered = [...list.filter((p) => p.you), ...list.filter((p) => !p.you)].slice(0, 4);
    box.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const p = ordered[i];
      const el = document.createElement("div");
      if (p) {
        el.className = "slot" + (p.you ? " me" : "");
        el.innerHTML = `<canvas width="220" height="220"></canvas><b>${esc(p.name)}</b><em>${p.you ? "TOI" : "✔ TROUVÉ"}</em>`;
        drawPortrait(el.querySelector("canvas")!, p.characterId, undefined, 1, 0);
      } else {
        el.className = "slot wait";
        el.innerHTML = `<div class="dots"><i></i><i></i><i></i></div><b>Recherche…</b>`;
      }
      box.appendChild(el);
    }
  }
}

// ------------------------------------------------------------ parrainage
interface RefView {
  code: string;
  used: string | null;
  games: number;
  done: boolean;
  pending: number;
  friends: { name: string; games: number; done: boolean }[];
  max: number;
  need: number;
  welcome: number;
}

const ACTIVE_KEY = "bomberush.refActive";
/** Au-delà, un joueur n'est plus « nouveau » : il ne peut plus entrer de code. */
export const REF_NEWCOMER_GAMES = 30;

function store(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* stockage indisponible */
  }
}
function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export class Referral {
  constructor(
    private ctx: AppCtx,
    private online: OnlineController,
  ) {}

  private async call<T>(path: string, extra: Record<string, unknown> = {}): Promise<T & { error?: string }> {
    const base = this.online.base;
    if (!base) throw new Error("hors ligne");
    const r = await fetch(`${base}/api/ref/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: this.online.deviceToken(), name: this.ctx.profile.name, ...extra }),
    });
    return (await r.json()) as T & { error?: string };
  }

  /** Après chaque partie terminée : fait avancer le parrainage (3 parties). */
  async gamePlayed() {
    if (read(ACTIVE_KEY) !== "1") return;
    try {
      const r = await this.call<{ games: number; done: boolean }>("progress");
      if (r.done) {
        store(ACTIVE_KEY, null);
        await this.claim();
      }
    } catch {
      /* réessayé à la prochaine partie */
    }
  }

  /** Coffres gagnés grâce au parrainage : remis une seule fois. */
  async claim(): Promise<number> {
    if (!this.online.base) return 0;
    try {
      const r = await this.call<{ chests: number }>("claim");
      const n = Math.max(0, Math.min(20, Number(r.chests) || 0));
      if (!n) return 0;
      const out: Granted[] = [];
      grant(this.ctx.profile, { kind: "chest", tier: "rare", count: n }, out, "parrainage");
      this.ctx.persist();
      showGranted(this.ctx, "🎁 Parrainage réussi !", out, { sub: n > 1 ? "Tes amis ont joué leurs 3 parties" : "Ton ami et toi avez gagné un coffre" });
      return n;
    } catch {
      return 0;
    }
  }

  open() {
    let view: RefView | null = null;
    this.ctx.modal.open(
      (sheet) => {
        sheet.insertAdjacentHTML("beforeend", `<h2>INVITE TES AMIS 🎁</h2><div class="inv-body"><p class="sub">Chargement…</p></div>`);
        const body = sheet.querySelector<HTMLElement>(".inv-body")!;
        const render = () => {
          if (!view) return;
          const v = view;
          const p = this.ctx.profile;
          const canUse = !v.used && p.played < REF_NEWCOMER_GAMES;
          const friends = v.friends.length
            ? v.friends
                .slice(-4)
                .map((f) => `<div class="inv-friend"><span>👤 ${esc(f.name)}</span><span class="pg"><i style="width:${(f.games / v.need) * 100}%"></i></span><b>${f.done ? "✔ coffre gagné" : `${f.games}/${v.need} parties`}</b></div>`)
                .join("")
            : `<p class="inv-empty">Aucun ami pour l'instant : partage ton code !</p>`;
          const mine = v.used
            ? `<p class="inv-used">✔ Tu as utilisé le code de ton ami${v.done ? " · coffre gagné 🎁" : ` · ${v.games}/${v.need} parties pour ton coffre`}</p>`
            : canUse
              ? `<span class="inv-label">TU AS UN CODE AMI ?</span>
                 <div class="inv-have"><input maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false"><button class="btn btn-blue small inv-ok"><span>Valider</span></button></div>`
              : "";
          body.innerHTML = `<div class="inv-grid">
            <div class="inv-left">
              <span class="inv-label">TON CODE AMI</span>
              <button class="inv-code" title="Copier">${esc(v.code)}</button>
              <button class="btn btn-yellow inv-share"><span>PARTAGER</span></button>
              ${mine}
            </div>
            <div class="inv-right">
              <span class="inv-label">COMMENT ÇA MARCHE</span>
              <div class="inv-step"><span class="n">1</span><p>Ton ami installe Bombe Rush et entre ton code<span>Il reçoit ${fmt(v.welcome)} 🪙 de bienvenue</span></p></div>
              <div class="inv-step"><span class="n">2</span><p>Il joue ${v.need} parties<span>Vous gagnez chacun un Coffre rare 🎁</span></p></div>
              <div class="inv-count"><span>Amis invités</span><b>${v.friends.length} / ${v.max}</b></div>
              ${friends}
            </div>
          </div>`;
          body.querySelector(".inv-share")!.addEventListener("click", () => void this.share(v.code));
          body.querySelector(".inv-code")!.addEventListener("click", async () => {
            this.ctx.click();
            this.ctx.toast((await copyText(v.code)) ? `Code ${v.code} copié` : "Copie impossible", "hot");
          });
          const input = body.querySelector<HTMLInputElement>(".inv-have input");
          const ok = body.querySelector<HTMLButtonElement>(".inv-ok");
          if (input && ok) {
            input.addEventListener("input", () => (input.value = normalizeCode(input.value)));
            const submit = async () => {
              const code = normalizeCode(input.value);
              if (code.length !== 5) return this.ctx.toast("Le code ami fait 5 caractères.", "bad");
              this.ctx.click();
              ok.disabled = true;
              try {
                const r = await this.call<RefView & { ok?: boolean; welcome: number; friend: string }>("use", { code });
                if (r.error || !r.ok) {
                  ok.disabled = false;
                  return this.ctx.toast(r.error ?? "Code refusé.", "bad");
                }
                store(ACTIVE_KEY, "1");
                const out: Granted[] = [];
                grant(this.ctx.profile, { kind: "coins", amount: r.welcome }, out, "parrainage");
                this.ctx.persist();
                this.ctx.wallet.countTo();
                view = r;
                render();
                showGranted(this.ctx, "🎉 Bienvenue !", out, { sub: `Grâce au code de ${esc(r.friend)} · joue ${r.need} parties pour gagner un coffre rare` });
              } catch {
                ok.disabled = false;
                this.ctx.toast("Impossible de joindre le serveur. Réessaie.", "bad");
              }
            };
            ok.addEventListener("click", () => void submit());
            input.addEventListener("keydown", (e) => {
              if (e.key === "Enter") void submit();
            });
          }
        };
        this.call<RefView>("me")
          .then((v) => {
            if (v.error) throw new Error(v.error);
            view = v;
            // code utilisé mais parties pas encore toutes jouées : on suit la progression
            if (v.used && !v.done) store(ACTIVE_KEY, "1");
            render();
            if (v.pending) void this.claim();
          })
          .catch(() => {
            body.innerHTML = `<p class="sub">Impossible de joindre le serveur. Vérifie ta connexion internet, puis réessaie.</p>`;
          });
      },
      { cls: "invite" },
    );
  }

  private async share(code: string) {
    this.ctx.click();
    const text = `💣 Viens jouer à BOMBE RUSH avec moi !\n\nInstalle le jeu 👉 ${STORE_URL}\n\nPuis entre mon code ami ${code} (Jouer en ligne → Invite un ami) : tu gagnes 300 pièces 🪙, et on gagne chacun un coffre quand tu as joué 3 parties 🎁`;
    const res = await shareInvite({ title: "BOMBE RUSH — invite un ami", text, url: STORE_URL });
    if (res === "copied") this.ctx.toast("Invitation copiée : colle-la dans WhatsApp, Snapchat…", "hot");
    if (res === "failed") this.ctx.toast("Partage impossible ici : appuie sur ton code pour le copier.", "bad");
  }
}
