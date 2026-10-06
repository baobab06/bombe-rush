import type { ClientMsg, ServerMsg } from "./protocol";

export type NetStatus = "idle" | "connecting" | "online" | "reconnecting" | "unavailable";

/**
 * Connexion WebSocket avec reconnexion automatique (backoff 0,5 s → 5 s).
 * Le message `hello` (jeton secret) est renvoyé à chaque reconnexion : le
 * serveur reconnaît le joueur et lui rend sa place dans la salle / la partie.
 */
export class Connection {
  status: NetStatus = "idle";
  onStatus: (s: NetStatus) => void = () => {};
  onMessage: (m: ServerMsg) => void = () => {};
  private ws: WebSocket | null = null;
  private want = false;
  private retry = 0;
  private everOnline = false;
  private outbox: ClientMsg[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastMsg = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  /** sans aucun message pendant ce délai, la connexion est considérée morte
   *  (réseau mobile coupé, passage Wi-Fi → 4G : le navigateur ne le voit pas toujours) */
  static DEAD_AFTER_MS = 6000;

  constructor(private url: string, private hello: () => ClientMsg) {}

  private set(s: NetStatus) {
    if (this.status === s) return;
    this.status = s;
    this.onStatus(s);
  }

  open() {
    this.want = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.set(this.everOnline ? "reconnecting" : "connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.set("unavailable");
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.lastMsg = Date.now();
      this.startWatchdog();
      this.everOnline = true;
      ws.send(JSON.stringify(this.hello()));
      for (const m of this.outbox) ws.send(JSON.stringify(m));
      this.outbox = [];
      this.set("online");
    };
    ws.onmessage = (e) => {
      this.lastMsg = Date.now();
      try {
        this.onMessage(JSON.parse(String(e.data)) as ServerMsg);
      } catch {
        /* message illisible */
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.want) return this.set("idle");
      // jamais connecté après plusieurs essais : serveur injoignable
      if (!this.everOnline && this.retry >= 2) return this.set("unavailable");
      this.set(this.everOnline ? "reconnecting" : "connecting");
      const delay = Math.min(5000, 500 * 2 ** this.retry++);
      this.timer = setTimeout(() => this.open(), delay);
    };
  }

  private startWatchdog() {
    if (this.watchdog) return;
    let n = 0;
    this.watchdog = setInterval(() => {
      if (this.status !== "online" || !this.ws) return;
      if (++n % 2 === 0) this.ws.send(JSON.stringify({ t: "ping" }));
      if (Date.now() - this.lastMsg > Connection.DEAD_AFTER_MS) this.forceReconnect();
    }, 1000);
  }

  /** Abandonne la connexion actuelle (morte ou coupée) et relance la reconnexion. */
  forceReconnect() {
    const ws = this.ws;
    if (!ws) return;
    const onclose = ws.onclose;
    ws.onmessage = null;
    try {
      ws.close();
    } catch {
      /* déjà fermée */
    }
    // on n'attend pas la fin de la poignée de main de fermeture (elle peut
    // ne jamais arriver hors réseau) : on déclenche tout de suite la suite
    onclose?.call(ws, new CloseEvent("close"));
    ws.onclose = null;
  }

  /** Coupe volontairement (quitter le multijoueur). */
  close() {
    this.want = false;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
    this.set("idle");
  }

  /** Simule une coupure réseau (tests) : la reconnexion se fait toute seule. */
  dropForTest() {
    this.forceReconnect();
  }

  send(m: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
    else if (m.t !== "input") this.outbox.push(m);
  }
}
