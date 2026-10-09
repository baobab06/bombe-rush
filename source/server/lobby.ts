/**
 * SYSTÈME DE LOBBY — salles privées : création, code, arrivée/départ,
 * prêt, exclusion, choix du mode/de la map par l'hôte, reconnexion.
 * Ne connaît rien de la simulation : il délègue à GameRunner.
 */
import { CHARACTERS } from "../src/core/characters";
import { MODES } from "../src/core/modes";
import { MAPS, RANDOM_MAP } from "../src/maps";
import {
  MAX_ROOM_PLAYERS,
  RECONNECT_GRACE_S,
  generateRoomCode,
  normalizeCode,
  type LobbyPlayer,
  type RoomEventKind,
  type RoomView,
  type ServerMsg,
} from "../src/net/protocol";
import { GameRunner } from "./game";

export interface Client {
  token: string; // secret, sert à la reconnexion
  id: string; // public
  name: string;
  characterId: string;
  skinId?: string;
  accessoryId?: string;
  trailId?: string;
  boomId?: string;
  room: string | null;
  connected: boolean;
}

interface Member {
  token: string;
  ready: boolean;
  connected: boolean;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

interface Room {
  code: string;
  name: string;
  hostToken: string;
  modeId: string;
  mapId: string;
  fillBots: boolean;
  members: Member[];
  game: GameRunner | null;
  isPublic: boolean;
}

export interface LobbyHooks {
  send(token: string, msg: ServerMsg): void;
  client(token: string): Client | undefined;
  /** appelé quand un joueur hors ligne devrait être prévenu (notifications push) */
  notifyOffline(tokens: string[], title: string, body: string): void;
}

export class Lobby {
  readonly rooms = new Map<string, Room>();

  constructor(private hooks: LobbyHooks) {}

  // ----------------------------------------------------------- vues
  private view(r: Room): RoomView {
    const players: LobbyPlayer[] = r.members.map((mb) => {
      const c = this.hooks.client(mb.token)!;
      return {
        id: c.id,
        name: c.name,
        characterId: c.characterId,
        skinId: c.skinId,
        accessoryId: c.accessoryId,
        trailId: c.trailId,
        boomId: c.boomId,
        ready: mb.ready,
        connected: mb.connected,
        isHost: mb.token === r.hostToken,
      };
    });
    return {
      code: r.code,
      name: r.name,
      hostId: this.hooks.client(r.hostToken)?.id ?? "",
      modeId: r.modeId,
      mapId: r.mapId,
      fillBots: r.fillBots,
      state: r.game ? "playing" : "lobby",
      maxPlayers: MAX_ROOM_PLAYERS,
      players,
    };
  }

  private broadcast(r: Room) {
    const room = this.view(r);
    for (const mb of r.members) this.hooks.send(mb.token, { t: "room", room });
  }

  private event(r: Room, kind: RoomEventKind, name: string, except?: string) {
    for (const mb of r.members) if (mb.token !== except) this.hooks.send(mb.token, { t: "roomEvent", kind, name });
  }

  private error(token: string, code: string, message: string) {
    this.hooks.send(token, { t: "error", code, message });
  }

  private roomOf(c: Client): Room | undefined {
    return c.room ? this.rooms.get(c.room) : undefined;
  }

  /** Aperçu d'une salle (page d'invitation) sans y entrer. */
  peek(code: string) {
    const r = this.rooms.get(normalizeCode(code));
    if (!r) return { code: normalizeCode(code), found: false };
    return {
      code: r.code,
      found: true,
      hostName: this.hooks.client(r.hostToken)?.name ?? "",
      modeId: r.modeId,
      mapId: r.mapId,
      players: r.members.length,
      max: MAX_ROOM_PLAYERS,
      playing: !!r.game,
    };
  }

  // ------------------------------------------------------- actions
  create(c: Client, isPublic = false): Room {
    if (c.room) this.leave(c);
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();
    const r: Room = {
      code,
      name: `Partie de ${c.name}`,
      hostToken: c.token,
      modeId: "classic",
      mapId: "forest",
      fillBots: false,
      members: [{ token: c.token, ready: true, connected: true, graceTimer: null }],
      game: null,
      isPublic,
    };
    this.rooms.set(code, r);
    c.room = code;
    this.broadcast(r);
    return r;
  }

  join(c: Client, rawCode: string) {
    const code = normalizeCode(rawCode);
    const r = this.rooms.get(code);
    if (!r) return this.error(c.token, "not_found", "Cette partie n'existe pas (ou plus). Vérifie le code.");
    const existing = r.members.find((mb) => mb.token === c.token);
    if (existing) return this.reconnect(c);
    if (r.game) return this.error(c.token, "in_game", "La partie a déjà commencé. Attends la fin de la manche.");
    if (r.members.length >= MAX_ROOM_PLAYERS) return this.error(c.token, "full", "La salle est pleine (4 joueurs).");
    if (c.room && c.room !== code) this.leave(c);
    r.members.push({ token: c.token, ready: false, connected: true, graceTimer: null });
    c.room = code;
    this.broadcast(r);
    this.event(r, "joined", c.name, c.token);
    // l'hôte n'a pas l'app ouverte : notification
    const host = r.members.find((mb) => mb.token === r.hostToken);
    if (host && !host.connected) this.hooks.notifyOffline([host.token], "Bombe Rush", `🔥 ${c.name} a rejoint ta partie !`);
  }

  leave(c: Client, kind: RoomEventKind = "left") {
    const r = this.roomOf(c);
    c.room = null;
    if (!r) return;
    const mb = r.members.find((m) => m.token === c.token);
    if (mb?.graceTimer) clearTimeout(mb.graceTimer);
    r.members = r.members.filter((m) => m.token !== c.token);
    r.game?.freeze(c.token);
    if (!r.members.length) {
      r.game?.stop();
      this.rooms.delete(r.code);
      return;
    }
    if (r.hostToken === c.token) {
      // l'hôte part : le plus ancien joueur prend le relais
      const next = r.members.find((m) => m.connected) ?? r.members[0];
      r.hostToken = next.token;
      next.ready = true;
      const nc = this.hooks.client(next.token);
      if (nc) {
        r.name = `Partie de ${nc.name}`;
        this.event(r, "host", nc.name);
      }
    }
    this.broadcast(r);
    this.event(r, kind, c.name);
  }

  kick(host: Client, playerId: string) {
    const r = this.roomOf(host);
    if (!r || r.hostToken !== host.token) return this.error(host.token, "not_host", "Seul l'hôte peut exclure un joueur.");
    const target = r.members.map((m) => this.hooks.client(m.token)!).find((c) => c.id === playerId);
    if (!target || target.token === host.token) return;
    this.hooks.send(target.token, { t: "kicked" });
    this.leave(target, "kicked");
  }

  setReady(c: Client, ready: boolean) {
    const r = this.roomOf(c);
    const mb = r?.members.find((m) => m.token === c.token);
    if (!r || !mb || r.game) return;
    mb.ready = r.hostToken === c.token ? true : ready;
    this.broadcast(r);
  }

  updateProfile(c: Client) {
    const r = this.roomOf(c);
    if (!r) return;
    if (r.hostToken === c.token) r.name = `Partie de ${c.name}`;
    this.broadcast(r);
  }

  setSettings(c: Client, s: { modeId?: string; mapId?: string; fillBots?: boolean }) {
    const r = this.roomOf(c);
    if (!r || r.game) return;
    if (r.hostToken !== c.token) return this.error(c.token, "not_host", "Seul l'hôte choisit le mode et la carte.");
    if (s.modeId && MODES.some((m) => m.id === s.modeId && m.available)) r.modeId = s.modeId;
    if (s.mapId && (s.mapId === RANDOM_MAP || MAPS.some((m) => m.id === s.mapId))) r.mapId = s.mapId;
    if (typeof s.fillBots === "boolean") r.fillBots = s.fillBots;
    this.broadcast(r);
  }

  /** Raison pour laquelle l'hôte ne peut pas encore lancer (null = OK). */
  blocker(r: Room): string | null {
    const humans = r.members.length;
    const total = r.fillBots ? Math.max(humans, MAX_ROOM_PLAYERS) : humans;
    if (total < 2) return "Invite au moins un ami (ou ajoute des bots).";
    const notReady = r.members.filter((m) => m.token !== r.hostToken && (!m.ready || !m.connected));
    if (notReady.length) return "Tous les joueurs doivent être prêts.";
    return null;
  }

  start(c: Client) {
    const r = this.roomOf(c);
    if (!r || r.game) return;
    if (r.hostToken !== c.token) return this.error(c.token, "not_host", "Seul l'hôte peut lancer la partie.");
    const why = this.blocker(r);
    if (why) return this.error(c.token, "not_ready", why);
    const seats = r.members.map((mb) => {
      const cl = this.hooks.client(mb.token)!;
      return { token: cl.token, name: cl.name, characterId: cl.characterId, skinId: cl.skinId, accessoryId: cl.accessoryId, trailId: cl.trailId, boomId: cl.boomId };
    });
    // deux joueurs avec le même personnage : le second reçoit un autre perso libre
    const taken = new Set<string>();
    for (const s of seats) {
      if (taken.has(s.characterId)) {
        const alt = CHARACTERS.find((ch) => !taken.has(ch.id) && !seats.some((o) => o.characterId === ch.id));
        if (alt) {
          s.characterId = alt.id;
          s.skinId = undefined;
        }
      }
      taken.add(s.characterId);
    }
    r.game = new GameRunner(
      seats,
      { mapId: r.mapId, modeId: r.modeId, fillBots: r.fillBots, maxPlayers: MAX_ROOM_PLAYERS },
      this.hooks.send,
      () => this.endGame(r),
    );
    for (const mb of r.members) if (mb.token !== r.hostToken) mb.ready = false;
    this.broadcast(r);
    r.game.start();
    const offline = r.members.filter((m) => !m.connected).map((m) => m.token);
    if (offline.length) this.hooks.notifyOffline(offline, "Bombe Rush", "💣 La partie commence ! Reviens vite.");
  }

  private endGame(r: Room) {
    // petite pause pour laisser l'écran de résultats s'afficher
    setTimeout(() => {
      r.game = null;
      if (this.rooms.has(r.code)) this.broadcast(r);
    }, 1500);
  }

  input(c: Client, seq: number, cmd: Parameters<GameRunner["input"]>[2]) {
    this.roomOf(c)?.game?.input(c.token, seq, cmd);
  }

  /** Emote envoyée en partie : relayée à tous les joueurs de la salle. */
  emote(c: Client, id: string) {
    this.roomOf(c)?.game?.emote(c.token, id);
  }

  // ------------------------------------------------------ connexions
  disconnected(c: Client) {
    const r = this.roomOf(c);
    const mb = r?.members.find((m) => m.token === c.token);
    if (!r || !mb) return;
    mb.connected = false;
    r.game?.freeze(c.token);
    this.broadcast(r);
    this.event(r, "disconnected", c.name, c.token);
    // on garde sa place un moment : il peut revenir
    mb.graceTimer = setTimeout(() => {
      if (!mb.connected && c.room === r.code) this.leave(c);
    }, RECONNECT_GRACE_S * 1000);
  }

  reconnect(c: Client) {
    const r = this.roomOf(c);
    const mb = r?.members.find((m) => m.token === c.token);
    if (!r || !mb) {
      c.room = null;
      this.hooks.send(c.token, { t: "room", room: null });
      return;
    }
    if (mb.graceTimer) clearTimeout(mb.graceTimer);
    mb.graceTimer = null;
    const was = mb.connected;
    mb.connected = true;
    this.broadcast(r);
    if (!was) this.event(r, "reconnected", c.name, c.token);
    r.game?.sendStart(c.token);
  }
}
