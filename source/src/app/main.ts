import "../platform/polyfills";
import { audio } from "../audio/audio";
import { CHARACTERS, getCharacter, getSkin } from "../core/characters";
import { EMOTE_SLOTS, getEmote } from "../core/cosmetics";
import { MODES } from "../core/modes";
import type { Difficulty } from "../core/types";
import { MAPS, RANDOM_MAP } from "../maps";
import { activeEvents } from "../meta/economy";
import { applyMatch, xpToNext, type RewardSummary } from "../meta/progression";
import { ONLINE_STAKE, STAKES, STAKE_ORDER, placeMedal, placeName, type StakeId } from "../meta/economy";
import { beginMatch, isSettled, maxLoss, settleAbandoned, settleMatch, stakeOf, stakeTable, type CoinTransaction, type MatchContext } from "../meta/rewards";
import type { Profile } from "../meta/profile";
import { SaveSystem } from "../meta/save";
import { cleanName, countOwned, dailyState, ensureMissions, equippedSkin, featured, grantStarterGift, missionsToClaim, priceOf, renameCost } from "../meta/store";
import { openRename } from "./rename";
import { haptics } from "../platform/haptics";
import { bonusIconURL, drawMapThumb, drawPortrait } from "../ui/thumbs";
import { viewport } from "../platform/viewport";
import { notify } from "../platform/notify";
import { copyText, shareInvite } from "../platform/share";
import { inviteUrl, joinCodeFromUrl } from "../net/config";
import { normalizeCode } from "../net/protocol";
import { androidApp } from "../platform/native";
import { serverBase } from "../net/config";
import { UiFx } from "../ui/fx";
import { hydrateIcons, icon } from "../ui/icons";
import { Stage } from "../ui/stage";
import { ItemBrowser } from "./browser";
import { Modal, Wallet, fmt, type AppCtx, type ScreenId } from "./ctx";
import { Locker } from "./locker";
import { OnlineController } from "./online";
import { openDaily, showGranted } from "./rewards";
import { MissionsScreen } from "./missions-screen";
import { ProfileScreen } from "./profile-screen";
import { RankScreen } from "./rank-screen";
import { ChestsScreen } from "./chests-screen";
import { achievementsToClaim, checkAchievements } from "../meta/achievements";
import { chestCount, nextLevelReward, rewardText, type Granted } from "../meta/grants";
import { masteryOf } from "../meta/mastery";
import { rankProgress } from "../meta/rank";
import { ensureWeekly, weeklyToClaim } from "../meta/weekly";
import { setServerTime } from "../meta/clock";
import { getTitle } from "../core/cosmetics";
import { CHESTS, levelXp, masteryXp, MASTERY_MAX } from "../meta/progress-config";
import { GameScreen, type GameResult, type StandingRow } from "./game";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const SCREENS: ScreenId[] = ["home", "setup", "chars", "settings", "pause", "results", "private", "lobby", "boot", "welcome", "invite", "shop", "collection", "missions", "profile", "rank", "chests"];
const MENU_SCREENS: ScreenId[] = ["setup", "chars", "settings", "private", "lobby", "welcome", "invite", "shop", "collection", "missions", "profile", "rank", "chests"];

class App implements AppCtx {
  private save = new SaveSystem();
  private _profile: Profile = this.save.load();
  get profile() {
    return this._profile;
  }
  game: GameScreen;
  private screen: ScreenId = "home";
  private history: ScreenId[] = [];
  private setupState = { ...this._profile.lastSetup };
  readonly fx = new UiFx($<HTMLCanvasElement>("uiFx"));
  readonly wallet = new Wallet(() => this._profile.coins);
  readonly modal = new Modal();
  private shop: ItemBrowser;
  private coll: ItemBrowser;
  private locker: Locker;
  private homeStage: Stage;
  private resStage: Stage;
  private identStages: Record<"welcome" | "invite", Stage>;
  private dailyShown = false;
  private missionsScr: MissionsScreen;
  private profileScr: ProfileScreen;
  private rankScr: RankScreen;
  private chestsScr: ChestsScreen;

  constructor() {
    hydrateIcons();
    // paysage uniquement : pivote l'interface si l'écran est en portrait
    viewport.init($("app"), () => this.showRotateHint());
    this.game = new GameScreen($<HTMLCanvasElement>("game"));
    this.game.onLayout = (a) => this.layoutHud(a);
    this.game.onFinished = (r) => this.showResults(r);
    this.game.onOutcome = (r) => this.settleOutcome(r);
    this.game.onEnding = () => {
      const pend = this._profile.pending;
      if (pend && pend.matchId === this.game.matchKey) {
        pend.ending = true;
        this.persist();
      }
    };
    this.game.onHud = () => this.updateHud();
    this.game.onBanner = (k, t) => this.banner(k, t);
    this.game.controls.onPause = () => {
      if (this.screen === "game") this.pause();
      else if (this.screen === "pause") this.resume();
    };
    this.shop = new ItemBrowser($("shopBrowser"), "shop", this);
    this.coll = new ItemBrowser($("collBrowser"), "collection", this);
    this.locker = new Locker(this);
    this.missionsScr = new MissionsScreen(this, () => this.renderBadges());
    this.profileScr = new ProfileScreen(this, () => this.renderBadges(), {
      rename: () => this.askRename(),
      titles: () => {
        this.coll.open(undefined, "title");
        this.go("collection");
      },
      rank: () => this.go("rank"),
    });
    this.rankScr = new RankScreen(this);
    this.chestsScr = new ChestsScreen(this, () => this.renderBadges());
    this.homeStage = new Stage($<HTMLCanvasElement>("homeStage"), { y: 0.58, scale: 1.05 });
    this.resStage = new Stage($<HTMLCanvasElement>("resStage"), { y: 0.56 });
    this.identStages = {
      welcome: new Stage($<HTMLCanvasElement>("welcomeHero"), { y: 0.56 }),
      invite: new Stage($<HTMLCanvasElement>("inviteHero"), { y: 0.5 }),
    };
    ensureMissions(this._profile);
    ensureWeekly(this._profile);
    // succès déjà mérités par les anciens profils (débloqués sans fenêtre)
    checkAchievements(this._profile);
    this.persist();
    this.syncServerTime();
    this.applySettings();
    this.wire();
    this.wireOnline();
    this.wireHud();
    this.renderHome();
    this.game.startDemo();
    this.wireIdent();
    this.inviteCode = joinCodeFromUrl();
    if (this.inviteCode) {
      history.replaceState?.(null, "", location.pathname.replace(/\/(j|join)\/[A-Za-z0-9]+\/?$/, "/") + location.hash);
      // on demande l'aperçu de la salle pendant le chargement
      this.online.peek(this.inviteCode);
    }
    // rechargement pendant une partie en ligne : on reprend sa place
    else if (this.online.available && this.online.wasInRoom) this.online.connect();
    this.boot();
    const capApp = (window as unknown as { Capacitor?: { Plugins?: { App?: { addListener(e: string, cb: (d: { url: string }) => void): void } } } })
      .Capacitor?.Plugins?.App;
    capApp?.addListener("appUrlOpen", (d) => {
      const c = joinCodeFromUrl(d.url);
      if (c) {
        this.inviteCode = c;
        this.online.peek(c);
        this.go("invite");
      }
    });

    // l'audio ne peut démarrer qu'après un geste de l'utilisateur
    let locked = false;
    const unlock = () => {
      audio.unlock();
      if (!locked) {
        locked = true;
        void viewport.lockLandscape();
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    // iOS Safari : l'audio ne se débloque qu'au relâchement du doigt
    window.addEventListener("touchend", () => audio.unlock());
    window.addEventListener("click", () => audio.unlock());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        // en ligne la partie continue sans nous : pas de pause
        if (this.screen === "game" && !this.game.online) this.pause();
        audio.suspend();
      } else {
        audio.resume();
        this.startStages();
        // retour au premier plan : on vérifie tout de suite la connexion
        if (this.online.conn && this.online.status !== "online") this.online.connect();
      }
    });
    this.wallet.sync();
    this.wireAndroid();
  }

  // ------------------------------------------------------------ Android
  /** Appli Android : bouton retour du téléphone + adresse du serveur. */
  private wireAndroid() {
    const app = androidApp();
    (window as unknown as { __bombeRushBack: () => boolean }).__bombeRushBack = () => {
      if (document.querySelector(".reveal")) return true;
      if (this.modal.isOpen) {
        if ($("modal").dataset.closable !== "0") this.modal.close();
        return true;
      }
      if (!$("emoteWheel").hidden) return void ($("emoteWheel").hidden = true), true;
      switch (this.screen) {
        case "game":
          if (!this.game.online) this.pause();
          else this.go("pause");
          return true;
        case "pause":
          this.resume();
          return true;
        case "results":
          $("btnMenu").click();
          return true;
        case "lobby":
          $("btnLeaveRoom").click();
          return true;
        case "home":
        case "boot":
        case "welcome":
          return false; // l'appli passe en arrière-plan
        default:
          this.click();
          this.back();
          return true;
      }
    };
    if (!app) return;
    $("serverRow").hidden = false;
    const input = $<HTMLInputElement>("serverUrl");
    input.value = serverBase() ?? "";
    $("serverHint").textContent = "Colle ici l'adresse de ton serveur Render. Elle est enregistrée sur ce téléphone.";
    $("btnServer").addEventListener("click", () => {
      let v = input.value.trim().replace(/\/+$/, "");
      if (v && !/^https?:\/\//.test(v)) v = "https://" + v;
      try {
        if (v) localStorage.setItem("bomberush.server", v);
        else localStorage.removeItem("bomberush.server");
      } catch {
        /* stockage indisponible */
      }
      this.toast("Serveur enregistré : redémarrage…", "good");
      window.setTimeout(() => location.reload(), 700);
    });
  }

  // ------------------------------------------------------------ navigation
  go(id: ScreenId, push = true) {
    if (push && this.screen !== id && this.screen !== "game" && this.screen !== "pause") this.history.push(this.screen);
    if (this.history.length > 12) this.history.splice(0, this.history.length - 12);
    const prev = this.screen;
    this.screen = id;
    if (this.modal.isOpen) this.modal.close();
    $("emoteWheel").hidden = true;
    for (const s of SCREENS) $(s).hidden = s !== id;
    const inGame = id === "game" || id === "pause";
    this.game.background = !inGame;
    $("hud").hidden = !inGame;
    $("veil").classList.toggle("off", inGame);
    $("veil").classList.toggle("deep", id === "results");
    $("veil").classList.toggle("dim", MENU_SCREENS.includes(id));
    if (id === "home") this.renderHome();
    if (id === "setup") this.renderSetup();
    if (id === "chars") this.locker.open();
    if (id === "shop" && prev !== "shop") this.shop.open(this.shopTarget?.id, this.shopTarget?.tab);
    if (id === "collection" && prev !== "collection") this.coll.open(this.collTab ?? undefined, this.collTab ?? undefined);
    this.collTab = null;
    if (id === "missions") this.missionsScr.render();
    if (id === "profile") this.profileScr.render();
    if (id === "rank") this.rankScr.render();
    if (id === "chests") this.chestsScr.render();
    this.shopTarget = null;
    if (id === "settings") this.renderSettings();
    if (id === "private") this.renderPrivate();
    if (id === "lobby") this.renderLobby();
    if (id === "welcome" || id === "invite") this.renderIdent(id);
    $("netOverlay").hidden = !(this.game.online && (id === "game" || id === "pause") && this.online.status !== "online");
    // menu pause en ligne : la partie continue, pas de « Recommencer »
    $("btnRestart").hidden = this.game.online;
    $("btnAgain").querySelector("span")!.textContent = this.game.online ? "SALON" : "REJOUER";
    audio.playMusic(inGame ? "game" : "menu");
    if (!inGame && prev !== id && prev !== "boot") audio.play("whoosh", 0.35);
    this.wallet.sync();
    this.startStages();
    if (id === "home") this.afterHome();
  }

  private collTab: string | null = null;

  /** Heure du serveur (si joignable) : les renouvellements ne dépendent plus de l'horloge du téléphone. */
  private syncServerTime() {
    const base = serverBase();
    if (!base) return;
    const ctl = new AbortController();
    const to = window.setTimeout(() => ctl.abort(), 9000);
    const t0 = Date.now();
    fetch(`${base}/health`, { signal: ctl.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((j: { now?: number }) => {
        if (typeof j.now !== "number") return;
        setServerTime(this._profile, j.now + (Date.now() - t0) / 2, Date.now());
        this.persist();
      })
      .catch(() => {})
      .finally(() => window.clearTimeout(to));
  }

  private startStages() {
    for (const st of [this.homeStage, this.resStage, this.identStages.welcome, this.identStages.invite, this.locker.stage]) st.start();
  }

  private back() {
    const prev = this.history.pop() ?? "home";
    this.go(prev, false);
  }

  click() {
    audio.unlock();
    audio.play("click");
  }

  private shopTarget: { id?: string; tab?: string } | null = null;
  openShop(itemId?: string, tab?: string) {
    this.shopTarget = { id: itemId, tab };
    if (this.screen === "shop") {
      this.shop.open(itemId, tab);
      this.shopTarget = null;
    } else this.go("shop");
  }

  lookChanged() {
    this.online.updateIdentity();
    drawPortrait($<HTMLCanvasElement>("homeAvatar"), this._profile.characterId, this.equippedSkin(this._profile.characterId), 1, 0, this._profile.equipped.accessory);
  }

  private wire() {
    document.querySelectorAll<HTMLElement>("[data-back]").forEach((b) =>
      b.addEventListener("click", () => {
        this.click();
        this.back();
      }),
    );
    document.querySelectorAll<HTMLElement>("[data-go]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.click();
        this.openShop(undefined, "featured");
      }),
    );
    const nav = (id: string, to: ScreenId) =>
      $(id).addEventListener("click", () => {
        this.click();
        this.go(to);
      });
    nav("btnPlay", "setup");
    nav("btnChars", "chars");
    nav("btnCollection", "collection");
    nav("btnSettings", "settings");
    nav("homeNameplate", "chars");
    nav("homeProfile", "profile");
    nav("btnRank", "rank");
    nav("btnMissions", "missions");
    nav("btnChests", "chests");
    nav("btnChestsTop", "chests");
    $("btnShop").addEventListener("click", () => {
      this.click();
      this.openShop(undefined, "featured");
    });
    $("btnDaily").addEventListener("click", () => {
      this.click();
      openDaily(this, () => this.renderBadges());
    });
    $("btnRandomMap").addEventListener("click", () => {
      this.click();
      this.setupState.mapId = RANDOM_MAP;
      this.renderSetup();
    });
    $("btnLaunch").addEventListener("click", () => {
      this.click();
      this.launch();
    });
    $("btnPause").addEventListener("click", () => {
      this.click();
      this.pause();
    });
    $("btnResume").addEventListener("click", () => {
      this.click();
      this.resume();
    });
    $("btnRestart").addEventListener("click", () => {
      this.click();
      // recommencer une partie en cours = l'abandonner (pas d'esquive d'une défaite)
      this.abandonLive();
      this.game.restart();
      this.game.setPaused(false);
      this.startStake();
      this.go("game");
    });
    $("btnQuit").addEventListener("click", () => {
      this.click();
      this.abandonLive();
      if (this.game.online) {
        this.online.leaveRoom();
        this.game.setPaused(false);
        this.game.startDemo();
        this.go("private", false);
      } else this.toMenu();
    });
    $("btnAgain").addEventListener("click", () => {
      this.click();
      if (this.game.online) {
        // retour au salon : l'hôte relance quand tout le monde est prêt
        this.game.startDemo();
        this.go("lobby", false);
        return;
      }
      this.game.restart();
      this.startStake();
      this.go("game");
    });
    $("btnMenu").addEventListener("click", () => {
      this.click();
      if (this.game.online || this.online.room) this.online.leaveRoom();
      this.toMenu();
    });
    // segments
    this.segment("segBots", (v) => (this.setupState.botCount = Number(v)));

    // réglages
    const bind = (id: string, key: keyof Profile["settings"]) => {
      const el = $<HTMLInputElement>(id);
      el.addEventListener("change", () => {
        this._profile.settings[key] = el.checked;
        this.persist();
        this.applySettings();
        if (key === "vibration" && el.checked) haptics.pulse(40);
      });
    };
    bind("setMusic", "music");
    bind("setSfx", "sfx");
    bind("setVibe", "vibration");
    $("btnRename").addEventListener("click", () => {
      this.click();
      this.askRename();
    });
    $("inviteName").addEventListener("click", () => {
      if (!this._profile.named) return;
      this.click();
      this.askRename();
    });
    $("btnReset").addEventListener("click", () => {
      $("resetConfirm").hidden = false;
    });
    $("btnResetNo").addEventListener("click", () => {
      $("resetConfirm").hidden = true;
    });
    $("btnResetYes").addEventListener("click", () => {
      const settings = this._profile.settings;
      const name = this._profile.name;
      const named = this._profile.named;
      this._profile = this.save.reset();
      this._profile.settings = settings;
      this._profile.name = name;
      this._profile.named = named;
      ensureMissions(this._profile);
      this.persist();
      $("resetConfirm").hidden = true;
      this.wallet.sync();
      this.renderSettings();
      this.toast("Progression réinitialisée", "");
    });
  }

  private segment(id: string, onPick: (v: string) => void) {
    const root = $(id);
    root.querySelectorAll<HTMLButtonElement>("button").forEach((b) =>
      b.addEventListener("click", () => {
        this.click();
        onPick(b.dataset.v!);
        this.renderSetup();
      }),
    );
  }

  private applySettings() {
    const st = this._profile.settings;
    audio.setMusic(st.music);
    audio.setSfx(st.sfx);
    haptics.setEnabled(st.vibration);
  }

  persist() {
    // succès : vérifiés à chaque sauvegarde (achat, coffre, mission, partie…)
    const fresh = checkAchievements(this._profile);
    this.save.save(this._profile);
    if (fresh.length && this.screen !== "game" && this.screen !== "boot")
      fresh.forEach((a, i) => window.setTimeout(() => this.toast(`🏅 Succès débloqué : ${a.name} — récupère ta récompense dans le Profil !`, "good"), 300 + i * 1300));
    if (fresh.length) this.renderBadges();
  }

  // ------------------------------------------------------------------ accueil
  private renderHome() {
    const p = this._profile;
    $("homeName").textContent = p.name;
    $("homeLevel").textContent = String(p.level);
    $("homeXpBar").style.width = `${(p.xp / xpToNext(p.level)) * 100}%`;
    $("homeXpNum").textContent = `${fmt(p.xp)}/${fmt(xpToNext(p.level))}`;
    $("homeTitle").textContent = getTitle(p.equipped.title)?.name ?? "";
    const nx = nextLevelReward(p);
    $("homeNext").innerHTML = nx ? `🎁 Niv. ${nx.level} : <b>${nx.rewards.map(rewardText).join(" + ")}</b>` : "";
    const rp = rankProgress(p.rank.points);
    $("homeRankIco").textContent = rp.rank.icon;
    $("homeRank").textContent = rp.rank.name;
    $("homeRankBar").style.width = `${rp.ratio * 100}%`;
    $("btnRank").style.setProperty("--rc", rp.rank.color);
    const ms = masteryOf(p, p.characterId);
    $("charMastery").textContent = `Maîtrise ${ms.level}`;
    const c = getCharacter(p.characterId);
    const skin = getSkin(c.id, this.equippedSkin(c.id));
    drawPortrait($<HTMLCanvasElement>("homeAvatar"), p.characterId, skin.id, 1, 0, p.equipped.accessory);
    this.homeStage.set({ characterId: c.id, skinId: skin.id, accessoryId: p.equipped.accessory, trailId: p.equipped.trail }, skin.free ? null : skin.rarity);
    this.homeStage.idleEmotes = p.equipped.emotes;
    $("heroName").textContent = c.name;
    $("heroSkin").textContent = `${skin.name} · ${c.tagline}`;
    const mode = MODES.find((m) => m.id === p.lastSetup.modeId)?.name ?? "Classique";
    const map = MAPS.find((m) => m.id === p.lastSetup.mapId)?.name ?? "Carte aléatoire";
    const sid = (p.lastSetup.difficulty as StakeId) in STAKES ? (p.lastSetup.difficulty as StakeId) : "normal";
    const tbl = stakeTable(sid, p.lastSetup.botCount + 1);
    $("playSub").innerHTML = `${mode} · ${map} · ${STAKES[sid].label} <span class="ps-win">🥇 ${signed(tbl[0].amount)}</span> <span class="ps-loss">💀 ${signed(tbl[tbl.length - 1].amount)}</span>`;
    const cc = countOwned(p);
    $("collCount").textContent = `${cc.owned}/${cc.total}`;
    const deal = featured();
    const dp = priceOf(deal.dealId);
    $("shopRibbon").hidden = !dp.deal;
    $("shopRibbon").textContent = `-${Math.round((1 - dp.price / dp.full) * 100)}%`;
    const ev = activeEvents();
    const chip = $("homeEvent");
    chip.hidden = !ev.length;
    if (ev.length) chip.innerHTML = `${ev[0].icon} <b>${ev[0].name}</b> · ${ev[0].desc}`;
    this.renderBadges();
  }

  private renderBadges() {
    const p = this._profile;
    const daily = dailyState(p).available;
    $("dailyDot").hidden = !daily;
    $("btnDaily").classList.toggle("has", daily);
    const n = missionsToClaim(p) + weeklyToClaim(p);
    $("missionDot").hidden = !n;
    $("missionDot").textContent = String(n);
    $("btnMissions").classList.toggle("has", n > 0);
    const a = achievementsToClaim(p);
    $("profileDot").hidden = !a;
    $("profileDot").textContent = String(a);
    const ch = chestCount(p);
    $("chestDot").hidden = !ch;
    $("chestDot").textContent = String(ch);
    $("btnChestsTop").classList.toggle("has", ch > 0);
    $("chestCount").textContent = ch ? `× ${ch}` : "";
  }

  /** Arrivée sur l'accueil : cadeau de bienvenue, puis récompense du jour. */
  private afterHome() {
    const p = this._profile;
    if (!p.starterGift) {
      window.setTimeout(() => {
        if (this.screen !== "home" || p.starterGift) return;
        const before = p.coins;
        const got = grantStarterGift(p);
        this.persist();
        this.modal.open(
          (sheet, close) => {
            sheet.insertAdjacentHTML(
              "beforeend",
              `<h2>Cadeau de bienvenue !</h2><p class="sub">La boutique est ouverte : voici de quoi te faire plaisir.</p>
               <div class="buy" style="grid-template-columns:1fr"><div class="cost" style="justify-content:center;font-size:1.8em"><i class="coin"></i>+${fmt(got)}</div></div>`,
            );
            const actions = document.createElement("div");
            actions.className = "sheet-actions";
            const b = document.createElement("button");
            b.className = "btn btn-yellow";
            b.innerHTML = `${icon("gift")}<span>RÉCUPÉRER</span>`;
            b.addEventListener("click", () => {
              audio.play("unlock");
              this.wallet.earn(this.fx, b, got, before);
              const c = this.fx.center(b);
              this.fx.confetti(c.x, c.y, 60);
              b.disabled = true;
              window.setTimeout(() => {
                close();
              }, 900);
            });
            actions.appendChild(b);
            sheet.appendChild(actions);
          },
          { closable: false, onClose: () => this.wallet.sync() },
        );
      }, 450);
      return;
    }
    if (!this.dailyShown && dailyState(p).available) {
      this.dailyShown = true;
      window.setTimeout(() => {
        if (this.screen === "home" && !this.modal.isOpen) openDaily(this, () => this.renderBadges());
      }, 600);
    }
  }

  // ---------------------------------------------------------- préparation
  private renderSetup() {
    const st = this.setupState;
    const modeRow = $("modeRow");
    modeRow.innerHTML = "";
    for (const m of MODES) {
      const b = document.createElement("button");
      b.className = "choice" + (m.id === st.modeId ? " sel" : "") + (m.available ? "" : " locked");
      b.dataset.mode = m.id;
      b.innerHTML = `<b>${m.id === "chaos" ? "💀 " : "🎮 "}${m.name}</b><span>${m.tagline}</span>${m.available ? "" : '<em class="tag">Bientôt</em>'}`;
      b.disabled = !m.available;
      b.setAttribute("aria-pressed", String(m.id === st.modeId));
      b.addEventListener("click", () => {
        this.click();
        st.modeId = m.id;
        this.renderSetup();
      });
      modeRow.appendChild(b);
    }
    const mapRow = $("mapRow");
    if (!mapRow.childElementCount) {
      for (const m of MAPS) {
        const b = document.createElement("button");
        b.className = "map";
        b.dataset.id = m.id;
        const c = document.createElement("canvas");
        c.width = 260;
        c.height = 240;
        b.appendChild(c);
        const n = document.createElement("span");
        n.className = "map-name";
        n.textContent = m.name;
        b.appendChild(n);
        b.addEventListener("click", () => {
          this.click();
          st.mapId = m.id;
          this.renderSetup();
        });
        mapRow.appendChild(b);
        drawMapThumb(c, m);
      }
    }
    mapRow.querySelectorAll<HTMLElement>(".map[data-id]").forEach((el) => el.classList.toggle("sel", el.dataset.id === st.mapId));
    const rnd = $("btnRandomMap");
    rnd.classList.toggle("sel", st.mapId === RANDOM_MAP);
    rnd.setAttribute("aria-pressed", String(st.mapId === RANDOM_MAP));
    const mark = (id: string, v: string) =>
      $(id).querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
        b.classList.toggle("sel", b.dataset.v === v);
        b.setAttribute("aria-checked", String(b.dataset.v === v));
      });
    mark("segBots", String(st.botCount));
    // difficulté = mise : ce qu'on peut gagner / perdre
    const diff = $("segDiff");
    diff.innerHTML = "";
    for (const id of STAKE_ORDER) {
      const k = STAKES[id];
      const tb = stakeTable(id, st.botCount + 1);
      const b = document.createElement("button");
      b.className = "stake-card" + (id === st.difficulty ? " sel" : "");
      b.dataset.v = id;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(id === st.difficulty));
      b.innerHTML = `<b>${k.label}</b><span class="gain">🥇 ${signed(tb[0].amount)}<i class="coin"></i></span><span class="risk">💀 ${signed(tb[tb.length - 1].amount)}<i class="coin"></i></span>`;
      b.addEventListener("click", () => {
        this.click();
        st.difficulty = id as Difficulty;
        this.renderSetup();
      });
      diff.appendChild(b);
    }
    this.renderStakeBanner($("stakeBanner"), st.difficulty as StakeId, st.botCount + 1);
  }

  /** Bandeau « risque / récompense » : pièces selon la place finale. */
  private renderStakeBanner(el: HTMLElement, id: StakeId, players: number) {
    const k = STAKES[id];
    el.dataset.tier = id;
    el.innerHTML = `<div class="sb-title"><b>${k.label.toUpperCase()} ${k.emoji}</b><small>${k.tag}</small></div>
      <div class="sb-places">${stakeTable(id, players)
        .map((r) => `<span class="sbp ${r.amount > 0 ? "up" : "down"}" title="${placeName(r.place)}"><i>${placeMedal(r.place, players)}</i><b>${signed(r.amount)}</b></span>`)
        .join("")}</div>`;
  }

  // ------------------------------------------------- mises et règlement
  private currentStake(): MatchContext {
    const pend = this._profile.pending;
    if (pend && pend.matchId === this.game.matchKey) return pend;
    return {
      matchId: this.game.matchKey,
      stake: this.game.online ? ONLINE_STAKE : ((this.game.setup?.difficulty ?? "normal") as StakeId),
      modeId: this.game.session?.match.config.modeId ?? "classic",
      online: this.game.online,
      players: this.game.session?.match.players.length ?? 4,
    };
  }

  /** Une partie démarre : elle est notée « en cours » (quitter = défaite). */
  private startStake() {
    const key = this.game.matchKey;
    if (!key || isSettled(this._profile, key) || this._profile.pending?.matchId === key) return;
    beginMatch(this._profile, this.currentStake());
    this.persist();
  }

  /** Quitter / recommencer une partie en cours : dernière place. */
  private abandonLive(): CoinTransaction | null {
    if (!this.game.live) return null;
    const ctx = this.currentStake();
    const n = ctx.players ?? 4;
    const tx = settleMatch(this._profile, ctx, { place: n, players: n, abandon: true });
    this.persist();
    if (tx) this.toast(`Partie abandonnée : −${fmt(-tx.applied)} 🪙`, "bad");
    return tx;
  }

  private lastSummary: RewardSummary | null = null;
  private lastTx: CoinTransaction | null = null;

  /** L'issue est connue : UNE transaction, enregistrée tout de suite. */
  private settleOutcome(r: GameResult) {
    const summary = applyMatch(this._profile, r, this.currentStake());
    this.lastSummary = summary;
    this.lastTx = summary?.tx ?? null;
    this.persist();
  }

  private launch() {
    const p = this._profile;
    p.lastSetup = { ...this.setupState };
    this.persist();
    this.game.start({
      ...this.setupState,
      characterId: p.characterId,
      skinId: this.equippedSkin(p.characterId),
      accessoryId: p.equipped.accessory ?? undefined,
      trailId: p.equipped.trail,
      boomId: p.equipped.boom,
      playerName: "Toi",
    });
    this.startStake();
    this.history = [];
    this.go("game");
  }

  private equippedSkin(characterId: string): string {
    return equippedSkin(this._profile, characterId);
  }

  // ---------------------------------------------------------------- réglages
  private renderSettings() {
    const st = this._profile.settings;
    $<HTMLInputElement>("setMusic").checked = st.music;
    $<HTMLInputElement>("setSfx").checked = st.sfx;
    $<HTMLInputElement>("setVibe").checked = st.vibration;
    const p = this._profile;
    const cc = countOwned(p);
    const rows: [string, string][] = [
      [String(p.played), "Parties"],
      [String(p.wins), "Victoires"],
      [String(p.kills), "Éliminations"],
      [fmt(p.blocksDestroyed), "Blocs détruits"],
      [fmt(p.coinsEarned), "Pièces gagnées"],
      [`${cc.owned}/${cc.total}`, "Collection"],
    ];
    $("setName").textContent = p.name;
    $("renameCostLbl").textContent = fmt(renameCost(p, p.name + "!"));
    $("profileStats").innerHTML = rows.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  }

  // ==================================================== PARTIE PRIVÉE
  private online = new OnlineController(() => ({
    name: this._profile.name,
    characterId: this._profile.characterId,
    skinId: this.equippedSkin(this._profile.characterId),
    accessoryId: this._profile.equipped.accessory ?? undefined,
    trailId: this._profile.equipped.trail,
    boomId: this._profile.equipped.boom,
  }));
  private notifAsked = false;

  private ensurePseudo() {
    if (!this._profile.name || this._profile.name === "Joueur") {
      this._profile.name = `Joueur ${100 + Math.floor(Math.random() * 900)}`;
      this.persist();
    }
  }

  toast(text: string, kind: "" | "hot" | "bad" | "good" = "") {
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = text;
    $("toasts").appendChild(el);
    while ($("toasts").childElementCount > 3) $("toasts").firstElementChild?.remove();
    window.setTimeout(() => el.remove(), 2900);
  }

  private askNotifications() {
    if (this.notifAsked) return;
    this.notifAsked = true;
    void notify.requestPermission();
    void notify.registerPush((token) => this.online.registerPush("android", token));
  }

  // ======================================== CHARGEMENT / PSEUDO / INVITATION
  private inviteCode: string | null = null;
  private peeked: Extract<import("../net/protocol").ServerMsg, { t: "peek" }> | null = null;

  /** Écran de chargement : polices, puis « touche pour jouer » (débloque son + plein écran). */
  private boot() {
    this.go("boot", false);
    const bar = $("bootBar");
    let p = 0;
    const tick = window.setInterval(() => {
      p = Math.min(90, p + 7 + Math.random() * 10);
      bar.style.width = p + "%";
    }, 90);
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve();
    const ready = Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]);
    void ready.then(() => {
      window.setTimeout(() => {
        window.clearInterval(tick);
        bar.style.width = "100%";
        $("bootTap").hidden = false;
        const tip = $("bootTip");
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
        if (ios && !standalone) {
          tip.hidden = false;
          tip.textContent = "Astuce iPhone : bouton Partager → « Sur l'écran d'accueil » pour jouer en plein écran comme une vraie app.";
        }
      }, 250);
    });
    const start = () => {
      if ($("bootTap").hidden || this.screen !== "boot") return;
      audio.unlock();
      void viewport.lockLandscape();
      haptics.pulse(15);
      this.afterBoot();
    };
    $("boot").addEventListener("click", start);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") start();
    });
  }

  /** Partie restée « en cours » (rechargement, appli fermée…) = abandon. */
  private settlePendingAtBoot() {
    const pend = this._profile.pending;
    if (!pend) return;
    const settle = () => {
      if (!this._profile.pending || this._profile.pending.matchId !== pend.matchId) return;
      if (this.game.matchKey === pend.matchId && this.game.live) return; // partie en ligne reprise
      const tx = settleAbandoned(this._profile);
      this.persist();
      this.wallet.sync();
      if (tx) this.toast(tx.outcome === "abandon" ? `Partie quittée en cours : dernière place, −${fmt(-tx.applied)} 🪙` : `Partie quittée à la fin : ${signed(tx.applied)} 🪙`, tx.applied < 0 ? "bad" : "good");
    };
    // en ligne, on laisse au joueur le temps de reprendre sa place
    if (pend.online && this.online.wasInRoom) window.setTimeout(settle, 10000);
    else settle();
  }

  private afterBoot() {
    this.settlePendingAtBoot();
    if (this.inviteCode) return this.go("invite");
    if (this.online.room) return this.go("lobby");
    if (!this._profile.named) return this.go("welcome");
    this.go("home");
  }

  private identChar = "";
  private renderIdent(id: "welcome" | "invite") {
    const p = this._profile;
    if (!this.identChar) this.identChar = p.characterId;
    const name = $<HTMLInputElement>(id === "welcome" ? "welcomeName" : "inviteName");
    if (!name.value || p.named) name.value = p.named ? p.name : "";
    // une fois le pseudo choisi, le modifier passe par la fenêtre payante
    name.readOnly = p.named;
    name.classList.toggle("tap-edit", p.named);
    const grid = $(id === "welcome" ? "welcomeChars" : "inviteChars");
    grid.innerHTML = "";
    for (const c of CHARACTERS.filter((ch) => p.ownedCharacters.includes(ch.id))) {
      const b = document.createElement("button");
      b.className = c.id === this.identChar ? "sel" : "";
      b.title = c.name;
      b.setAttribute("aria-label", c.name);
      const cv = document.createElement("canvas");
      cv.width = cv.height = 72;
      b.appendChild(cv);
      drawPortrait(cv, c.id, this.equippedSkin(c.id));
      b.addEventListener("click", () => {
        this.click();
        this.identChar = c.id;
        this.identStages[id].poke();
        this.renderIdent(id);
      });
      grid.appendChild(b);
    }
    const st = this.identStages[id];
    st.set({ characterId: this.identChar, skinId: this.equippedSkin(this.identChar), accessoryId: p.equipped.accessory, trailId: p.equipped.trail });
    st.idleEmotes = ["emo-hello"];
    if (id === "invite") this.renderInvite();
  }

  private renderInvite() {
    const pk = this.peeked;
    const room = $("inviteRoom");
    const btn = $<HTMLButtonElement>("btnInviteJoin");
    const title = $("inviteTitle");
    const kicker = $("inviteKicker");
    room.innerHTML = "";
    if (!this.online.available) {
      kicker.textContent = "Invitation";
      title.textContent = "Ouvre ce lien depuis le site du jeu";
      btn.disabled = true;
      return;
    }
    if (!pk) {
      kicker.textContent = `Partie ${this.inviteCode}`;
      title.textContent = this.online.status === "unavailable" ? "Serveur injoignable…" : "Connexion à la partie…";
      btn.disabled = this.online.status !== "online";
      return;
    }
    if (!pk.found) {
      kicker.textContent = `Partie ${pk.code}`;
      title.textContent = "Cette partie n'existe plus";
      room.innerHTML = "<span>Demande un nouveau lien à ton ami</span>";
      btn.disabled = true;
      return;
    }
    kicker.textContent = "🎮 Invitation";
    title.textContent = `${pk.hostName} t'invite à jouer !`;
    const mode = pk.modeId === "chaos" ? '<span class="chaos">💀 Chaos</span>' : "<span>🎮 Classique</span>";
    const map = MAPS.find((m) => m.id === pk.mapId)?.name ?? "🎲 Aléatoire";
    room.innerHTML = `${mode}<span>🗺️ ${map}</span><span>👥 ${pk.players}/${pk.max}</span>`;
    const full = (pk.players ?? 0) >= (pk.max ?? 4);
    btn.disabled = full || this.online.status !== "online";
    btn.querySelector("span")!.textContent = full ? "SALLE PLEINE" : pk.playing ? "REJOINDRE (manche en cours)" : "REJOINDRE LA PARTIE";
  }

  /** Changement de pseudo payant, puis mise à jour de tous les écrans. */
  private askRename() {
    openRename(this, () => {
      this.online.updateIdentity();
      $<HTMLInputElement>("pseudo").value = this._profile.name;
      $<HTMLInputElement>("inviteName").value = this._profile.name;
      $("homeName").textContent = this._profile.name;
      if (this.screen === "settings") this.renderSettings();
    });
  }

  /** Enregistre pseudo + personnage choisis sur l'écran d'identité. */
  private saveIdent(input: string): boolean {
    // déjà nommé : le pseudo ne change que via askRename (payant)
    const v = this._profile.named ? this._profile.name : cleanName($<HTMLInputElement>(input).value);
    if (v.length < 2) {
      this.toast("Choisis un pseudo (2 caractères minimum)", "bad");
      $<HTMLInputElement>(input).focus();
      return false;
    }
    this._profile.name = v;
    this._profile.named = true;
    this._profile.characterId = this.identChar || this._profile.characterId;
    this.persist();
    this.online.updateIdentity();
    return true;
  }

  private wireIdent() {
    $("btnWelcome").addEventListener("click", () => {
      if (!this.saveIdent("welcomeName")) return;
      this.click();
      this.go("home");
    });
    $<HTMLInputElement>("welcomeName").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("btnWelcome").click();
    });
    $("btnInviteJoin").addEventListener("click", () => {
      if (!this.inviteCode || !this.saveIdent("inviteName")) return;
      this.click();
      this.askNotifications();
      this.online.joinRoom(normalizeCode(this.inviteCode));
    });
    $<HTMLInputElement>("inviteName").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("btnInviteJoin").click();
    });
    $("btnInviteMenu").addEventListener("click", () => {
      this.click();
      this.inviteCode = null;
      this.go(this._profile.named ? "home" : "welcome");
    });
    this.online.onPeek = (pk) => {
      this.peeked = pk;
      if (this.screen === "invite") this.renderInvite();
    };
  }

  private netLabel(): [string, string] {
    switch (this.online.status) {
      case "online": return ["online", "En ligne"];
      case "connecting": return ["connecting", "Connexion…"];
      case "reconnecting": return ["reconnecting", "Reconnexion…"];
      case "unavailable": return ["unavailable", "Serveur injoignable"];
      default: return ["", "Hors ligne"];
    }
  }

  private wireOnline() {
    const o = this.online;
    this.game.sendEmote = (id) => o.sendEmote(id);
    o.onEmote = (player, id) => this.game.remoteEmote(player, id);
    $("btnPrivate").addEventListener("click", () => {
      this.click();
      this.ensurePseudo();
      this.go("private");
      if (o.available) o.connect();
    });
    $("pseudo").addEventListener("click", () => {
      this.click();
      this.askRename();
    });
    $("btnCreateRoom").addEventListener("click", () => {
      this.click();
      this.askNotifications();
      o.createRoom();
    });
    const join = () => {
      const code = normalizeCode($<HTMLInputElement>("joinCode").value);
      if (code.length < 5) return this.privateInfo("Le code fait 5 caractères (ex. K7XP2).", true);
      this.click();
      this.askNotifications();
      o.joinRoom(code);
    };
    $("btnJoinRoom").addEventListener("click", join);
    $<HTMLInputElement>("joinCode").addEventListener("keydown", (e) => {
      if (e.key === "Enter") join();
    });
    $<HTMLInputElement>("joinCode").addEventListener("input", (e) => {
      const el = e.target as HTMLInputElement;
      el.value = normalizeCode(el.value);
    });
    $("btnLeaveRoom").addEventListener("click", () => {
      this.click();
      o.leaveRoom();
      this.go("private", false);
    });
    $("btnLobbyMain").addEventListener("click", () => {
      this.click();
      const r = o.room;
      if (!r) return;
      if (o.isHost) o.start();
      else {
        const me = r.players.find((p) => p.id === o.you);
        o.setReady(!me?.ready);
      }
    });
    $("lobbyModes").querySelectorAll<HTMLButtonElement>("button").forEach((b) =>
      b.addEventListener("click", () => {
        if (!o.isHost) return;
        this.click();
        o.setSettings({ modeId: b.dataset.mode });
      }),
    );
    $<HTMLInputElement>("lobbyBots").addEventListener("change", (e) => {
      if (o.isHost) o.setSettings({ fillBots: (e.target as HTMLInputElement).checked });
    });
    const maps = $("lobbyMaps");
    for (const m of [...MAPS.map((mm) => ({ id: mm.id, name: mm.name })), { id: RANDOM_MAP, name: "🎲 Aléatoire" }]) {
      const b = document.createElement("button");
      b.className = "chip";
      b.dataset.map = m.id;
      b.textContent = m.name;
      b.addEventListener("click", () => {
        if (!o.isHost) return;
        this.click();
        o.setSettings({ mapId: m.id });
      });
      maps.appendChild(b);
    }
    $("btnInvite").addEventListener("click", async () => {
      this.click();
      const r = o.room;
      if (!r || !o.base) return;
      const url = inviteUrl(o.base, r.code);
      const text = `🎮 Viens jouer avec nous !\nRejoins ma partie privée sur BOMBE RUSH 🔥\n\n👉 ${url}\n\nCode : ${r.code}\n\nÀ toi de jouer 😈`;
      const res = await shareInvite({ title: "BOMBE RUSH — partie privée", text, url });
      if (res === "copied") this.toast("Invitation copiée : colle-la dans WhatsApp, Discord…", "hot");
      if (res === "failed") this.toast("Partage impossible ici : utilise « Copier le lien ».", "bad");
    });
    $("btnCopyCode").addEventListener("click", async () => {
      this.click();
      if (o.room) this.toast((await copyText(o.room.code)) ? `Code ${o.room.code} copié` : "Copie impossible", "hot");
    });
    $("btnCopyLink").addEventListener("click", async () => {
      this.click();
      if (o.room && o.base) this.toast((await copyText(inviteUrl(o.base, o.room.code))) ? "Lien copié" : "Copie impossible", "hot");
    });

    // ------------------------------------------- événements réseau
    o.onStatus = () => {
      if (this.screen === "invite") this.renderInvite();
      $("netOverlay").hidden = !(this.game.online && (this.screen === "game" || this.screen === "pause") && o.status !== "online");
      if (this.screen === "private") this.renderPrivate();
      if (this.screen === "lobby") this.renderLobby();
      const [cls, label] = this.netLabel();
      for (const id of ["netStatus", "lobbyNet"]) {
        $(id).className = "net " + cls;
        $(id).textContent = label;
      }
      if (o.status === "reconnecting" && (this.screen === "game" || this.screen === "lobby")) this.toast("Connexion perdue… reconnexion en cours", "bad");
    };
    o.onRoom = (r) => {
      if (r && ["private", "home", "invite", "welcome"].includes(this.screen)) {
        this.inviteCode = null;
        this.go("lobby");
      } else if (this.screen === "lobby") {
        if (r) this.renderLobby();
        else this.go("private", false);
      }
    };
    o.onRoomEvent = (kind, name) => {
      const msg: Record<string, [string, "" | "hot" | "bad"]> = {
        joined: [`🔥 ${name} a rejoint la partie !`, "hot"],
        left: [`${name} a quitté la partie.`, ""],
        kicked: [`${name} a été exclu de la salle.`, "bad"],
        disconnected: [`📶 ${name} a perdu la connexion… on l'attend.`, "bad"],
        reconnected: [`✅ ${name} est de retour !`, "hot"],
        host: [`👑 ${name} est le nouvel hôte.`, ""],
      };
      const [text, k] = msg[kind];
      this.toast(text, k);
      if (kind === "joined") audio.play("pickup");
      if (kind === "joined") void notify.show("Bombe Rush", `🔥 ${name} a rejoint ta partie !`);
    };
    o.onError = (m) => {
      this.toast(m, "bad");
      if (this.screen === "invite" && this.inviteCode) this.online.peek(this.inviteCode);
      if (this.screen === "private") this.privateInfo(m, true);
    };
    o.onKicked = () => {
      // exclu par l'hôte : ce n'est pas un abandon, la partie ne coûte rien
      if (this.game.live && this.game.online) settleMatch(this._profile, this.currentStake(), { place: 1, players: 4, void: true });
      this.persist();
      this.toast("Tu as été exclu de la salle par l'hôte.", "bad");
      if (this.screen === "game" || this.screen === "pause") this.game.startDemo();
      this.go("private", false);
    };
    o.onMatchStart = (session) => {
      void notify.show("Bombe Rush", "💣 La partie commence !");
      this.game.setPaused(false);
      this.game.startOnline(session);
      this.startStake();
      this.history = [];
      this.go("game");
    };
    o.onMatchEnd = () => {
      /* l'écran de résultats s'affiche via la fin de partie locale */
    };
  }

  private privateInfo(text: string, err = false) {
    const el = $("privateInfo");
    el.textContent = text;
    el.classList.toggle("err", err);
  }

  private renderPrivate() {
    const o = this.online;
    $<HTMLInputElement>("pseudo").value = this._profile.name;
    const can = o.available && o.status !== "unavailable";
    $<HTMLButtonElement>("btnCreateRoom").disabled = !can;
    $<HTMLButtonElement>("btnJoinRoom").disabled = !can;
    const [cls, label] = this.netLabel();
    $("netStatus").className = "net " + cls;
    $("netStatus").textContent = label;
    if (!o.available || o.status === "unavailable") {
      this.privateInfo(
        o.base
          ? androidApp()
            ? "Impossible de joindre le serveur de jeu. Vérifie ta connexion internet, et l'adresse du serveur dans Paramètres."
            : "Impossible de joindre le serveur de jeu. Vérifie ta connexion, puis réessaie dans un instant."
          : "Les parties privées passent par le serveur de jeu : ouvre le jeu depuis son adresse en ligne.",
        true,
      );
    } else if (o.status === "online") this.privateInfo("Le plus simple : ouvre le lien d'invitation reçu, tu rejoins la salle automatiquement.");
  }

  private renderLobby() {
    const o = this.online;
    const r = o.room;
    if (!r) return;
    const host = o.isHost;
    $("roomName").textContent = r.name;
    $("roomCode").textContent = r.code;
    const [cls, label] = this.netLabel();
    $("lobbyNet").className = "net " + cls;
    $("lobbyNet").textContent = label;
    $("modeHint").textContent = host ? "" : "(choisi par l'hôte)";
    const ot = stakeTable(ONLINE_STAKE, Math.max(2, r.players.length));
    $("lobbyStake").innerHTML = `· pièces : ${ot.map((x) => `<span class="${x.amount > 0 ? "ps-win" : "ps-loss"}">${placeMedal(x.place, ot.length)} ${signed(x.amount)}</span>`).join(" ")} 🪙`;
    $("lobbyModes").querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.classList.toggle("sel", b.dataset.mode === r.modeId);
      b.disabled = !host;
    });
    $("lobbyMaps").querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.classList.toggle("sel", b.dataset.map === r.mapId);
      b.disabled = !host;
    });
    const bots = $<HTMLInputElement>("lobbyBots");
    bots.checked = r.fillBots;
    bots.disabled = !host;
    $("playerCount").textContent = `${r.players.length}/${r.maxPlayers}`;
    const ul = $("lobbySlots");
    ul.innerHTML = "";
    for (let i = 0; i < r.maxPlayers; i++) {
      const p = r.players[i];
      const li = document.createElement("li");
      if (!p) {
        li.className = "slot empty";
        li.textContent = r.fillBots ? "🤖 Un bot prendra cette place" : "En attente d'un joueur…";
        ul.appendChild(li);
        continue;
      }
      li.className = "slot" + (p.connected ? "" : " off");
      const cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      li.appendChild(cv);
      drawPortrait(cv, p.characterId, p.skinId, 1, 0, p.accessoryId);
      const who = document.createElement("div");
      who.className = "who";
      const b = document.createElement("b");
      b.textContent = p.name;
      if (p.id === o.you) b.insertAdjacentHTML("beforeend", "<em>(toi)</em>");
      const st = document.createElement("span");
      st.textContent = `${getCharacter(p.characterId).name} · ${getSkin(p.characterId, p.skinId).name}`;
      who.append(b, st);
      li.appendChild(who);
      const badge = document.createElement("span");
      if (!p.connected) {
        badge.className = "badge off";
        badge.textContent = "DÉCONNECTÉ";
      } else if (p.isHost) {
        badge.className = "badge host";
        badge.textContent = "👑 HÔTE";
      } else if (p.ready) {
        badge.className = "badge ready";
        badge.textContent = "PRÊT ✓";
      } else {
        badge.className = "badge wait";
        badge.textContent = "PAS PRÊT";
      }
      li.appendChild(badge);
      if (host && p.id !== o.you) {
        const k = document.createElement("button");
        k.className = "kick";
        k.textContent = "✕";
        k.title = `Exclure ${p.name}`;
        k.setAttribute("aria-label", `Exclure ${p.name}`);
        k.addEventListener("click", () => {
          this.click();
          o.kick(p.id);
        });
        li.appendChild(k);
      }
      ul.appendChild(li);
    }
    // bouton principal : PRÊT (invité) ou LANCER (hôte)
    const btn = $<HTMLButtonElement>("btnLobbyMain");
    const lbl = btn.querySelector("span")!;
    const me = r.players.find((p) => p.id === o.you);
    let why = "";
    if (r.state === "playing") {
      btn.disabled = true;
      lbl.textContent = "PARTIE EN COURS";
      why = "Une manche est en cours.";
    } else if (host) {
      const humans = r.players.length;
      const total = r.fillBots ? Math.max(humans, r.maxPlayers) : humans;
      const notReady = r.players.filter((p) => !p.isHost && (!p.ready || !p.connected));
      if (total < 2) why = "Invite au moins un ami, ou active « Compléter avec des bots ».";
      else if (notReady.length) why = `En attente : ${notReady.map((p) => p.name).join(", ")}.`;
      btn.disabled = !!why || o.status !== "online";
      btn.classList.remove("on");
      lbl.textContent = "LANCER LA PARTIE";
    } else {
      btn.disabled = o.status !== "online";
      btn.classList.toggle("on", !!me?.ready);
      lbl.textContent = me?.ready ? "PRÊT ✓" : "JE SUIS PRÊT";
      why = me?.ready ? "L'hôte va lancer la partie." : "Appuie sur « Je suis prêt » quand tu es prêt.";
    }
    $("lobbyWhy").textContent = why;
  }

  private pause() {
    if (this.screen !== "game") return;
    this.game.setPaused(true);
    this.go("pause");
    const live = this.game.live;
    const cs = this.currentStake();
    const loss = maxLoss(cs.stake, cs.players ?? 4);
    $("btnRestart").querySelector("span")!.textContent = live ? `Recommencer (−${fmt(loss)} 🪙)` : "Recommencer";
    $("btnQuit").querySelector("span")!.textContent = live ? `Abandonner (−${fmt(loss)} 🪙)` : "Quitter la partie";
  }
  private resume() {
    this.game.setPaused(false);
    this.go("game");
  }
  private toMenu() {
    this.game.setPaused(false);
    this.history = [];
    this.game.startDemo();
    this.go("home", false);
  }

  private showRotateHint() {
    const el = $("rotateHint");
    el.hidden = true;
    void el.offsetWidth;
    el.hidden = false;
    window.setTimeout(() => (el.hidden = true), 2900);
  }

  // ------------------------------------------------------------------ HUD
  private wireHud() {
    const wheel = $("emoteWheel");
    $("btnEmote").addEventListener("click", () => {
      this.click();
      if (!wheel.hidden) return void (wheel.hidden = true);
      wheel.innerHTML = "";
      for (const id of this._profile.equipped.emotes.slice(0, EMOTE_SLOTS)) {
        const def = getEmote(id);
        if (!def) continue;
        const b = document.createElement("button");
        b.textContent = def.emoji;
        b.title = def.name;
        b.setAttribute("aria-label", def.name);
        b.addEventListener("click", () => {
          this.game.emote(id);
          wheel.hidden = true;
        });
        wheel.appendChild(b);
      }
      wheel.hidden = false;
    });
    window.addEventListener("keydown", (e) => {
      if (this.screen !== "game") return;
      const n = Number(e.key);
      if (n >= 1 && n <= EMOTE_SLOTS) {
        const id = this._profile.equipped.emotes[n - 1];
        if (id) this.game.emote(id);
      }
    });
  }

  /** Aligne le HUD sur les colonnes libres à gauche et à droite de l'arène. */
  private layoutHud(a: { x: number; w: number }) {
    const app = $("app");
    const colL = a.x;
    const colR = viewport.w - (a.x + a.w);
    app.style.setProperty("--colL", colL + "px");
    app.style.setProperty("--colR", colR + "px");
    $("hud").classList.toggle("compact", Math.min(colL - viewport.safe.l, colR - viewport.safe.r) < 150 || viewport.h < 340);
  }

  private updateHud() {
    const h = this.game.hudState();
    if (!h) return;
    const timer = $("hudTimer");
    timer.textContent = h.timer;
    timer.classList.toggle("hot", h.hot);
    $("hudChaos").hidden = !h.chaos;
    const alive = h.players.filter((p) => p.alive).length;
    $("hudAlive").textContent = `${alive} en vie`;
    const pw = $("hudPowers");
    const psig = h.powers.map((p) => p.value).join();
    if (pw.dataset.sig !== psig) {
      const old = (pw.dataset.sig ?? "").split(",");
      pw.dataset.sig = psig;
      pw.innerHTML = h.powers
        .map((p, i) => `<span class="pw${old[i] && old[i] !== String(p.value) ? " up" : ""}" title="${p.label}"><img src="${bonusIconURL(p.type)}" alt="" width="20" height="20" class="pwi">${p.value}<small>${p.label}</small></span>`)
        .join("");
    }
  }

  private banner(kicker: string, text: string) {
    const b = $("banner");
    $("bannerKicker").textContent = kicker;
    $("bannerText").textContent = text;
    b.hidden = true;
    void b.offsetWidth;
    b.hidden = false;
    window.setTimeout(() => (b.hidden = true), 2300);
  }

  // ------------------------------------------------------------ résultats
  private rankTimer = 0;
  private rankSig = "";

  /** Ambiance de l'écran de fin selon la place (colonne du barème). */
  private tierOf(r: GameResult, tx: CoinTransaction | null): "gold" | "silver" | "bronze" | "ko" | "draw" {
    if (r.won) return "gold";
    if (r.draw) return "draw";
    const col = tx?.column ?? (r.place === r.players ? 4 : r.place === 2 ? 2 : 3);
    return col <= 1 ? "gold" : col === 2 ? "silver" : col === 3 ? "bronze" : "ko";
  }

  private showResults(r: GameResult) {
    const p = this._profile;
    // le règlement a eu lieu à la fin de la partie (une seule fois) ;
    // filet de sécurité si l'issue n'avait pas été signalée
    if (!this.lastSummary || this.lastTx?.matchId !== this.game.matchKey) this.settleOutcome(r);
    const summary = this.lastSummary;
    const tx = this.lastTx;
    this.go("results");
    const tier = this.tierOf(r, tx);
    const ord = placeName(r.place);
    const medal = r.draw ? "🤝" : placeMedal(r.place, r.players);
    const KICK = { gold: "VICTOIRE !", silver: "BIEN JOUÉ !", bronze: "PRESQUE…", ko: "AÏE… DERNIER", draw: "ÉGALITÉ !" } as const;
    $("resKicker").textContent = KICK[tier];
    const title = $("resTitle");
    title.innerHTML = r.draw ? `<small>Personne ne gagne</small><span class="rt-place">${medal} ${ord} ex aequo</span>` : `<small>Tu termines</small><span class="rt-place">${medal} ${ord} !</span>`;
    title.className = `res-title t-${tier}`;
    const hero = $("resHero");
    hero.className = `res-hero-col t-${tier}`;
    void hero.offsetWidth;
    hero.classList.add("go");
    this.resStage.set({ characterId: r.characterId, skinId: r.skinId, accessoryId: p.equipped.accessory, trailId: p.equipped.trail }, null);
    this.resStage.setMode(tier === "gold" ? "win" : tier === "silver" ? "happy" : tier === "bronze" ? "sad" : tier === "ko" ? "ko" : "idle");
    this.resStage.showEmote(tier === "gold" ? (p.equipped.emotes.includes("emo-party") ? "emo-party" : "emo-gg") : tier === "ko" ? "emo-cry" : null);
    // classement : affiché tout de suite, complété en direct si la partie continue
    this.rankSig = "";
    this.renderRanking(r.standings, r.players, true);
    window.clearInterval(this.rankTimer);
    const key = this.game.matchKey;
    this.rankTimer = window.setInterval(() => {
      if (this.screen !== "results" || this.game.matchKey !== key || !this.game.session) return window.clearInterval(this.rankTimer);
      const rows = this.game.standings();
      if (!rows.length) return;
      this.renderRanking(rows, r.players, false);
      if (rows.every((x) => x.decided)) window.clearInterval(this.rankTimer);
    }, 200);
    const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
    $("resFacts").innerHTML = [`💣 <b>${r.bombsPlaced}</b> bombes`, `💥 <b>${r.kills}</b> élim.`, `🧱 <b>${r.blocksDestroyed}</b> blocs`, `⏱️ <b>${mmss(r.survivalTime)}</b>`].map((t) => `<span>${t}</span>`).join("");
    this.animateStake(tx, tier);
    // célébration selon la place
    window.setTimeout(() => {
      if (this.screen !== "results") return;
      const c = this.fx.center(title);
      const st = this.fx.center($("resStage"));
      if (tier === "gold") {
        this.fx.confetti(c.x, c.y, 110, 1.4);
        window.setTimeout(() => this.screen === "results" && this.fx.confetti(st.x, st.y, 60, 1.1), 450);
        this.fx.sparkle(st.x, st.y, 24, "#ffd23f");
      } else if (tier === "silver") {
        this.fx.confetti(c.x, c.y, 34, 0.9);
        this.fx.sparkle(st.x, st.y, 14, "#dfe8ff");
      } else if (tier === "ko") {
        haptics.pulse(120);
        audio.play("thud");
      }
    }, 350);
    const notes = [
      ...(summary?.missionsDone ?? []).map((d) => `🎯 Mission du jour terminée : ${d.label.replace("{n}", String(d.goal))}`),
      ...(summary?.weeklyDone ?? []).map((d) => `📆 Mission de la semaine terminée : ${d.label.replace("{n}", String(d.goal))}`),
      ...(summary?.achievements ?? []).map((a) => `🏅 Succès débloqué : ${a.name} !`),
    ];
    notes.forEach((t, i) => window.setTimeout(() => this.screen === "results" && this.toast(t, "good"), 2600 + i * 1300));
    this.renderProgress(summary);
    if (summary) this.animateXp(summary);
  }

  /** Classement final : médaille, portrait, pseudo ; le joueur est mis en avant. */
  private renderRanking(rows: StandingRow[], players: number, first: boolean) {
    const sorted = [...rows].sort((a, b) => Number(b.decided === false) - Number(a.decided === false) || a.place - b.place || a.id - b.id);
    const sig = sorted.map((x) => `${x.id}:${x.place}:${x.decided}`).join("|");
    if (sig === this.rankSig) return;
    const prev = this.rankSig;
    this.rankSig = sig;
    const ol = $("resRank");
    ol.innerHTML = "";
    const n = sorted.length;
    sorted.forEach((x, i) => {
      const li = document.createElement("li");
      const tie = rows.filter((o) => o.decided && x.decided && o.place === x.place).length > 1;
      li.className = `rk${x.me ? " me" : ""}${x.decided ? ` p${Math.min(x.place, 4)}${x.place === players ? " last" : ""}` : " pending"}`;
      // apparition du dernier vers le premier, pour le suspense
      if (first) li.style.animationDelay = `${0.12 + (n - 1 - i) * 0.12}s`;
      else if (prev && !prev.includes(`${x.id}:${x.place}:${x.decided}`)) li.classList.add("flip");
      const medal = !x.decided ? "⏳" : placeMedal(x.place, players);
      const face = document.createElement("canvas");
      face.className = "rk-face";
      face.width = face.height = 64;
      drawPortrait(face, x.characterId, x.skinId, 1, 0, x.accessoryId ?? null, 0.95);
      li.innerHTML = `<span class="rk-medal">${medal}</span>`;
      li.appendChild(face);
      li.insertAdjacentHTML(
        "beforeend",
        `<span class="rk-name"><b>${esc(x.me ? this._profile.name : x.name)}</b>${x.me ? '<em class="rk-you">TOI</em>' : ""}</span>
        <span class="rk-place">${x.decided ? `${placeName(x.place)}${tie ? " ex aequo" : ""}` : "en jeu…"}</span>
        <span class="rk-kills" title="Éliminations">💥 ${x.kills}</span>`,
      );
      ol.appendChild(li);
    });
  }

  /** Bloc « pièces » des résultats : gain doré ou perte rouge, animés. */
  private animateStake(tx: CoinTransaction | null, tier: string) {
    const box = $("resStake");
    const delta = $("resDelta");
    const note = $("resNote");
    const mods = $("resMods");
    if (!tx) {
      box.className = "stake-result neutral";
      $("resDiff").textContent = "";
      delta.textContent = "0";
      note.textContent = "Cette partie a déjà été comptée.";
      mods.innerHTML = "";
      this.wallet.sync();
      return;
    }
    const k = stakeOf(tx.stake);
    const gain = tx.requested > 0;
    const kind = gain ? "win" : tx.requested < 0 ? "loss" : "neutral";
    box.className = `stake-result ${kind} t-${tier}`;
    box.dataset.tier = tx.stake;
    const placeLbl = tx.outcome === "draw" ? "égalité" : tx.outcome === "abandon" ? "abandon" : `${placeName(tx.place)} place`;
    $("resDiff").innerHTML = `${k.label.toUpperCase()} ${k.emoji} · <b>${placeLbl}</b>${this.game.online ? " · en ligne" : ""}`;
    mods.innerHTML = tx.modifiers.length
      ? [`<span>Barème <b>${signed(tx.base)}</b></span>`, ...tx.modifiers.map((m) => `<span>${m.icon ?? "✨"} ${m.label} <b>+${fmt(m.amount)}</b></span>`)].join("")
      : "";
    note.textContent =
      kind === "loss" && tx.applied !== tx.requested
        ? `Solde protégé : tu ne descends jamais sous 0 🪙 (−${fmt(-tx.applied)} réellement)`
        : kind === "loss"
          ? `Ton solde passe de ${fmt(tx.before)} à ${fmt(tx.after)} 🪙`
          : kind === "win"
            ? tx.outcome === "draw"
              ? "Égalité pour la 1re place : récompense de 2e"
              : "Ajouté à ton solde (boutique, personnage…)"
            : "Ni gain ni perte";
    // le compteur part de l'ancien solde
    document.querySelectorAll<HTMLElement>("[data-coins]").forEach((el) => (el.textContent = fmt(tx.before)));
    const sign = kind === "loss" ? "−" : "+";
    const total = Math.abs(tx.requested);
    delta.textContent = `${sign}0`;
    box.classList.remove("go");
    void box.offsetWidth;
    box.classList.add("go");
    // laisse le classement apparaître d'abord
    const t0 = performance.now() + 900;
    const tick = (now: number) => {
      if (this.screen !== "results") return;
      const kk = Math.max(0, Math.min(1, (now - t0) / 650));
      delta.textContent = `${sign}${fmt(total * (1 - Math.pow(1 - kk, 3)))}`;
      if (kk < 1) return void requestAnimationFrame(tick);
      if (kind === "win") {
        audio.play("buy");
        const c = this.fx.center(delta);
        this.fx.sparkle(c.x, c.y, tier === "gold" ? 26 : 14, "#ffd23f");
        this.wallet.earn(this.fx, delta, tx.after - tx.before, tx.before);
      } else if (kind === "loss") {
        audio.play("deny");
        haptics.pulse(tier === "ko" ? 90 : 50);
        this.wallet.lose(this.fx, delta, tx.before - tx.after, tx.before);
      } else this.wallet.sync();
    };
    requestAnimationFrame(tick);
  }

  /** Maîtrise, rang, série et récompenses gagnées pendant la partie. */
  private renderProgress(s: RewardSummary | null) {
    const box = $("resProg");
    const gr = $("resGrants");
    box.innerHTML = "";
    gr.innerHTML = "";
    if (!s) return;
    const chips: string[] = [];
    if (s.mastery) {
      const m = s.mastery;
      const c = getCharacter(m.characterId);
      const max = m.levelAfter >= MASTERY_MAX;
      chips.push(
        `<div class="rp mast${m.levelAfter > m.levelBefore ? " up" : ""}"><small>Maîtrise ${c.name}</small><b><span class="lvl">${m.levelAfter}</span>${m.levelAfter > m.levelBefore ? " ⬆️" : ""}</b><span class="xpbar"><i style="width:${max ? 100 : (m.xpAfter / masteryXp(m.levelAfter)) * 100}%"></i></span><em>+${m.xp}</em></div>`,
      );
    }
    const rk = s.tx.rank;
    if (rk) {
      const rp = rankProgress(rk.after);
      const sgn = rk.delta > 0 ? `+${rk.delta}` : rk.delta < 0 ? `−${-rk.delta}` : "±0";
      chips.push(
        `<div class="rp rank${rk.tierAfter > rk.tierBefore ? " up" : rk.tierAfter < rk.tierBefore ? " down" : ""}" style="--rc:${rp.rank.color}"><small>Rang</small><b>${rp.rank.icon} ${rp.rank.name}</b><span class="xpbar"><i style="width:${rp.ratio * 100}%"></i></span><em class="${rk.delta < 0 ? "neg" : ""}">${sgn} pts${rk.protected ? " 🛡️" : ""}</em></div>`,
      );
    } else chips.push(`<div class="rp rank off"><small>Rang</small><b>Non classée</b><em>partie en ligne</em></div>`);
    const st = s.tx.streak ?? 0;
    chips.push(`<div class="rp streak${st >= 3 ? " hot" : ""}"><small>Série</small><b>🔥 ${st}</b><em>${st ? `victoire${st > 1 ? "s" : ""} d'affilée` : "remise à zéro"}</em></div>`);
    box.innerHTML = chips.join("");
    if (s.granted.length) {
      const items = s.granted.filter((g) => g.reward.kind !== "xp");
      gr.innerHTML = items
        .map((g, i) => `<span class="rg" style="animation-delay:${2.2 + i * 0.25}s" title="${esc(g.source ?? "")}">${g.icon} ${esc(g.label)}${g.source ? ` <small>${esc(g.source)}</small>` : ""}</span>`)
        .join("");
      const chest = s.granted.find((g) => g.chest);
      if (chest) window.setTimeout(() => this.screen === "results" && this.toast(`🎁 ${CHESTS[chest.chest!].name} gagné ! Ouvre-le dans COFFRES`, "good"), 2400);
    }
  }

  private animateXp(s: RewardSummary) {
    const bar = $("resXpBar");
    const lvl = $("resLevel");
    const txt = $("resXpText");
    const up = $("resLevelUp");
    up.hidden = true;
    lvl.textContent = String(s.levelBefore);
    bar.style.transition = "none";
    bar.style.width = `${(s.xpBefore / xpToNext(s.levelBefore)) * 100}%`;
    txt.textContent = `${s.xpBefore} / ${xpToNext(s.levelBefore)} XP`;
    void bar.offsetWidth;
    bar.style.transition = "";
    window.setTimeout(() => {
      if (s.levelsGained > 0) {
        bar.style.width = "100%";
        window.setTimeout(() => {
          lvl.textContent = String(s.levelAfter);
          const lvlCoins = s.granted.filter((g) => g.source?.startsWith("Niveau") && g.reward.kind === "coins").reduce((a, g) => a + g.coins, 0);
          up.textContent = `NIVEAU ${s.levelAfter} !${lvlCoins ? ` +${fmt(lvlCoins)} 🪙` : ""}`;
          up.hidden = false;
          audio.play("levelup");
          bar.style.transition = "none";
          bar.style.width = "0%";
          void bar.offsetWidth;
          bar.style.transition = "";
          bar.style.width = `${(s.xpAfter / xpToNext(s.levelAfter)) * 100}%`;
          txt.textContent = `+${s.xp} XP · ${s.xpAfter} / ${xpToNext(s.levelAfter)}`;
        }, 950);
      } else {
        bar.style.width = `${(s.xpAfter / xpToNext(s.levelAfter)) * 100}%`;
        txt.textContent = `+${s.xp} XP · ${s.xpAfter} / ${xpToNext(s.levelAfter)}`;
      }
    }, 450);
  }
}

/** « +70 » / « −25 » (vrai signe moins) */
function esc(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function signed(n: number): string {
  return n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : "0";
}

const app = new App();
// accès de débogage (tests automatisés, console)
(window as unknown as { __bombeRush: unknown }).__bombeRush = app;
