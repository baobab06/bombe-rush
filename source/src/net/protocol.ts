/**
 * Protocole réseau client ⇄ serveur (WebSocket, messages JSON).
 *
 * Trois systèmes séparés côté serveur :
 *  - lobby       : salles privées, joueurs, prêt, exclusion, reconnexion
 *  - matchmaking : file d'attente publique (préparée, pas encore exposée)
 *  - jeu         : simulation autoritaire (même code `core/` que le client)
 */
import type { InputCmd, PlayerSlot } from "../core/types";
import type { Snapshot } from "./snapshot";

export const PROTOCOL_VERSION = 1;
export const MAX_ROOM_PLAYERS = 4;
/** délai pendant lequel un joueur déconnecté garde sa place */
export const RECONNECT_GRACE_S = 45;

export interface LobbyPlayer {
  id: string; // identifiant public
  name: string;
  characterId: string;
  skinId?: string;
  accessoryId?: string;
  trailId?: string;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface RoomView {
  code: string;
  name: string;
  hostId: string;
  modeId: string;
  mapId: string;
  fillBots: boolean;
  state: "lobby" | "playing";
  maxPlayers: number;
  players: LobbyPlayer[];
}

export type ClientMsg =
  | { t: "hello"; v: number; token: string; name: string; characterId: string; skinId?: string; accessoryId?: string; trailId?: string }
  | { t: "ping" }
  | { t: "createRoom" }
  | { t: "peek"; code: string }
  | { t: "joinRoom"; code: string }
  | { t: "leaveRoom" }
  | { t: "setReady"; ready: boolean }
  | { t: "setName"; name: string }
  | { t: "setLook"; characterId: string; skinId?: string; accessoryId?: string; trailId?: string }
  | { t: "emote"; id: string }
  | { t: "setSettings"; modeId?: string; mapId?: string; fillBots?: boolean }
  | { t: "kick"; playerId: string }
  | { t: "start" }
  | { t: "input"; seq: number; cmd: InputCmd }
  | { t: "pushToken"; platform: "android" | "web"; token: string };

export type RoomEventKind = "joined" | "left" | "kicked" | "disconnected" | "reconnected" | "host";

export type ServerMsg =
  | { t: "welcome"; you: string; v: number }
  | { t: "pong" }
  | { t: "peek"; code: string; found: boolean; hostName?: string; modeId?: string; mapId?: string; players?: number; max?: number; playing?: boolean }
  | { t: "room"; room: RoomView | null }
  | { t: "roomEvent"; kind: RoomEventKind; name: string }
  | { t: "kicked" }
  | { t: "error"; code: string; message: string }
  | { t: "matchStart"; matchId: number; seed: number; mapId: string; modeId: string; slots: PlayerSlot[]; you: number }
  | { t: "snap"; s: Snapshot }
  | { t: "emote"; player: number; id: string }
  | { t: "matchEnd"; winner: number };

/** Codes de salle : 5 caractères sans lettres ambiguës (0/O, 1/I…). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateRoomCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}
