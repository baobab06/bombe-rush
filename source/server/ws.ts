/**
 * Serveur WebSocket minimal (RFC 6455) sur `node:http`, sans dépendance.
 * Messages texte uniquement, fragmentation gérée, ping/pong pour détecter
 * rapidement les connexions mortes (utile à la reconnexion).
 */
import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export class WsConn {
  private buf = Buffer.alloc(0);
  private frag: Buffer[] = [];
  private alive = true;
  closed = false;
  onMessage: (text: string) => void = () => {};
  onClose: () => void = () => {};
  readonly ip: string;

  constructor(private socket: Duplex, ip: string) {
    this.ip = ip;
    socket.on("data", (d: Buffer) => this.onData(d));
    socket.on("close", () => this.finish());
    socket.on("end", () => this.finish());
    socket.on("error", () => this.finish());
  }

  private finish() {
    if (this.closed) return;
    this.closed = true;
    this.socket.destroy();
    this.onClose();
  }

  private onData(d: Buffer) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.buf.length >= 2) {
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(1 << 20)) return this.close(1009);
        len = Number(big);
        off = 10;
      }
      if (!masked) return this.close(1002); // les clients DOIVENT masquer
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const payload = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      this.handle(op, fin, payload);
      if (this.closed) return;
    }
  }

  private handle(op: number, fin: boolean, payload: Buffer) {
    switch (op) {
      case 0x0: // continuation
      case 0x1: // texte
      case 0x2: // binaire (non utilisé : traité comme texte)
        this.frag.push(payload);
        if (fin) {
          const msg = Buffer.concat(this.frag).toString("utf8");
          this.frag = [];
          this.onMessage(msg);
        }
        break;
      case 0x8:
        this.close(1000);
        break;
      case 0x9:
        this.frame(0xa, payload);
        break;
      case 0xa:
        this.alive = true;
        break;
    }
  }

  private frame(op: number, payload: Buffer) {
    if (this.closed) return;
    const len = payload.length;
    let head: Buffer;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) {
      head = Buffer.alloc(4);
      head[0] = 0x80 | op;
      head[1] = 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 0x80 | op;
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(len), 2);
    }
    this.socket.write(Buffer.concat([head, payload]));
  }

  send(text: string) {
    this.frame(0x1, Buffer.from(text, "utf8"));
  }

  /** Appelé périodiquement : coupe la connexion si le pong précédent n'est pas revenu. */
  heartbeat() {
    if (!this.alive) return this.finish();
    this.alive = false;
    this.frame(0x9, Buffer.alloc(0));
  }

  close(code = 1000) {
    if (this.closed) return;
    const p = Buffer.alloc(2);
    p.writeUInt16BE(code, 0);
    try {
      this.frame(0x8, p);
    } catch {
      /* déjà fermé */
    }
    this.finish();
  }
}

export function acceptUpgrade(req: IncomingMessage, socket: Duplex): WsConn | null {
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string" || req.headers.upgrade?.toLowerCase() !== "websocket") {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return null;
  }
  const accept = createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
  return new WsConn(socket, ip);
}
