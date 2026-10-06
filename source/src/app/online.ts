import { Connection, type NetStatus } from "../net/connection";
import { serverBase, wsUrl } from "../net/config";
import { OnlineSession } from "../net/onlineSession";
import { PROTOCOL_VERSION, type ClientMsg, type RoomEventKind, type RoomView, type ServerMsg } from "../net/protocol";

export interface OnlineIdentity {
  name: string;
  characterId: string;
  skinId?: string;
  accessoryId?: string;
  trailId?: string;
}

/**
 * Contrôleur réseau côté client (aucun accès au DOM) : connexion, état de la
 * salle, démarrage des parties en ligne. L'interface s'abonne à ses rappels.
 */
export class OnlineController {
  conn: Connection | null = null;
  status: NetStatus = "idle";
  room: RoomView | null = null;
  you = "";
  session: OnlineSession | null = null;
  readonly base: string | null = serverBase();
  /** action à rejouer dès que la connexion est établie */
  private pendingAction: ClientMsg | null = null;

  onStatus: (s: NetStatus) => void = () => {};
  onRoom: (r: RoomView | null) => void = () => {};
  onRoomEvent: (kind: RoomEventKind, name: string) => void = () => {};
  onError: (message: string) => void = () => {};
  onKicked: () => void = () => {};
  onPeek: (p: Extract<ServerMsg, { t: "peek" }>) => void = () => {};
  onMatchStart: (s: OnlineSession) => void = () => {};
  onMatchEnd: () => void = () => {};
  onEmote: (player: number, id: string) => void = () => {};

  constructor(private identity: () => OnlineIdentity) {}

  get available(): boolean {
    return !!this.base && typeof WebSocket !== "undefined";
  }

  get isHost(): boolean {
    return !!this.room && this.room.hostId === this.you;
  }

  private token(): string {
    const KEY = "bomberush.token";
    try {
      let t = localStorage.getItem(KEY);
      if (!t) {
        t = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(KEY, t);
      }
      return t;
    } catch {
      // stockage indisponible : jeton de session (pas de reconnexion après rechargement)
      const w = window as unknown as { __brToken?: string };
      w.__brToken ??= Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      return w.__brToken;
    }
  }

  /** Mémorise la salle en cours : après un rechargement, on s'y reconnecte tout seul. */
  private rememberRoom(code: string | null) {
    try {
      if (code) localStorage.setItem("bomberush.room", code);
      else localStorage.removeItem("bomberush.room");
    } catch {
      /* stockage indisponible */
    }
  }

  get wasInRoom(): boolean {
    try {
      return !!localStorage.getItem("bomberush.room");
    } catch {
      return false;
    }
  }

  connect() {
    if (!this.base) {
      this.status = "unavailable";
      this.onStatus(this.status);
      return;
    }
    if (this.conn) return this.conn.open();
    const conn = new Connection(wsUrl(this.base), () => ({ t: "hello", v: PROTOCOL_VERSION, token: this.token(), ...this.identity() }));
    conn.onStatus = (s) => {
      this.status = s;
      this.onStatus(s);
      if (s === "online" && this.pendingAction) {
        conn.send(this.pendingAction);
        this.pendingAction = null;
      }
    };
    conn.onMessage = (m) => this.handle(m);
    this.conn = conn;
    conn.open();
  }

  disconnect() {
    this.conn?.close();
    this.conn = null;
    this.room = null;
    this.session = null;
  }

  private act(m: ClientMsg) {
    if (!this.conn || this.status !== "online") {
      this.pendingAction = m;
      this.connect();
    } else this.conn.send(m);
  }

  peek(code: string) {
    this.act({ t: "peek", code });
  }
  createRoom() {
    this.act({ t: "createRoom" });
  }
  joinRoom(code: string) {
    this.act({ t: "joinRoom", code });
  }
  leaveRoom() {
    this.conn?.send({ t: "leaveRoom" });
    this.rememberRoom(null);
    this.room = null;
    this.session = null;
  }
  setReady(ready: boolean) {
    this.conn?.send({ t: "setReady", ready });
  }
  setSettings(s: { modeId?: string; mapId?: string; fillBots?: boolean }) {
    this.conn?.send({ t: "setSettings", ...s });
  }
  kick(playerId: string) {
    this.conn?.send({ t: "kick", playerId });
  }
  start() {
    this.conn?.send({ t: "start" });
  }
  updateIdentity() {
    const id = this.identity();
    this.conn?.send({ t: "setName", name: id.name });
    this.conn?.send({ t: "setLook", characterId: id.characterId, skinId: id.skinId, accessoryId: id.accessoryId, trailId: id.trailId });
  }
  sendEmote(id: string) {
    this.conn?.send({ t: "emote", id });
  }
  registerPush(platform: "android" | "web", token: string) {
    this.conn?.send({ t: "pushToken", platform, token });
  }

  private handle(m: ServerMsg) {
    switch (m.t) {
      case "peek":
        this.onPeek(m);
        break;
      case "welcome":
        this.you = m.you;
        break;
      case "room":
        this.room = m.room;
        this.rememberRoom(m.room?.code ?? null);
        if (!m.room) this.session = null;
        this.onRoom(m.room);
        break;
      case "roomEvent":
        this.onRoomEvent(m.kind, m.name);
        break;
      case "kicked":
        this.rememberRoom(null);
        this.room = null;
        this.session = null;
        this.onKicked();
        break;
      case "error":
        this.onError(m.message);
        break;
      case "matchStart": {
        // reconnexion pendant une partie : on reprend la même session si possible
        if (this.session && this.session.matchId === m.matchId) return;
        this.session = new OnlineSession(m, this.conn!);
        this.onMatchStart(this.session);
        break;
      }
      case "snap":
        this.session?.push(m.s);
        break;
      case "emote":
        this.onEmote(m.player, m.id);
        break;
      case "matchEnd":
        if (this.session) this.session.serverEnded = true;
        this.onMatchEnd();
        break;
    }
  }
}
