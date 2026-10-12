/**
 * WebSocket protocol contract shared by client and server.
 *
 * Messages are JSON objects with a `type` field.
 *
 * Version 2 (Phase 5, multiplayer farm rooms):
 *   client → server: hello (with the session token), ping,
 *                    join (a farm room by farm code), leave, move, emote
 *   server → client: welcome (who you are), pong, error,
 *                    room (snapshot after join), player_joined, player_left,
 *                    player_moved, player_emote, player_updated
 *
 * The token in `hello` binds the connection to a player; nothing else is
 * accepted before `welcome`. Players are identified in rooms by their public
 * farm code, never by player ID or token. Positions, membership and emotes
 * are decided by the server (presence.ts); farm contents still come from the
 * HTTP API.
 */
import { isSessionToken } from "./api.js";
import { isGridPosition } from "./building.js";
import { isCharacterAppearance, type CharacterAppearance } from "./character.js";
import { isErrorCode } from "./errors.js";
import type { ErrorCode, ErrorPayload } from "./errors.js";
import { MAX_ROOM_PLAYERS, isDisplayName, isEmote, isFarmCode, type Emote } from "./presence.js";

/** Bump when the message contract changes in an incompatible way. */
export const PROTOCOL_VERSION = 2;

export const WS_PATH = "/ws";

// ---------- client → server ----------

export interface HelloMessage {
  type: "hello";
  protocolVersion: number;
  /** Session token from POST /api/session (protocol 2). */
  token: string;
}

export interface PingMessage {
  type: "ping";
  /** Client time (ms since epoch) when the ping was sent; echoed back in pong. */
  sentAt: number;
}

/** Enter the farm room of `farmCode` (own farm or another player's); leaves the current room first. */
export interface JoinMessage {
  type: "join";
  farmCode: string;
}

export interface LeaveMessage {
  type: "leave";
}

/** Walk to a tile of the current room's farm grid. */
export interface MoveMessage {
  type: "move";
  x: number;
  y: number;
}

export interface EmoteMessage {
  type: "emote";
  emote: Emote;
}

export type ClientMessage = HelloMessage | PingMessage | JoinMessage | LeaveMessage | MoveMessage | EmoteMessage;

// ---------- server → client ----------

export interface WelcomeMessage {
  type: "welcome";
  protocolVersion: number;
  /** Server time in ms since epoch. */
  serverTime: number;
  /** The authenticated player's public identity. */
  you: { farmCode: string; name: string };
}

/** A character in a farm room. `id` is the player's farm code. */
export interface PresencePlayer {
  id: string;
  name: string;
  appearance: CharacterAppearance;
  x: number;
  y: number;
}

/** Sent after `join`: everyone in the room, the joining player included. */
export interface RoomMessage {
  type: "room";
  farmCode: string;
  players: PresencePlayer[];
}

export interface PlayerJoinedMessage {
  type: "player_joined";
  player: PresencePlayer;
}

export interface PlayerLeftMessage {
  type: "player_left";
  id: string;
}

export interface PlayerMovedMessage {
  type: "player_moved";
  id: string;
  x: number;
  y: number;
}

export interface PlayerEmoteMessage {
  type: "player_emote";
  id: string;
  emote: Emote;
}

/** A player in the room changed appearance (Character screen). */
export interface PlayerUpdatedMessage {
  type: "player_updated";
  id: string;
  appearance: CharacterAppearance;
}

export interface PongMessage {
  type: "pong";
  /** `sentAt` copied from the ping, so the client can measure round-trip time. */
  sentAt: number;
  /** Server time in ms since epoch. */
  serverTime: number;
}

export interface ErrorMessage {
  type: "error";
  error: ErrorPayload;
}

export type ServerMessage =
  | WelcomeMessage
  | PongMessage
  | ErrorMessage
  | RoomMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | PlayerMovedMessage
  | PlayerEmoteMessage
  | PlayerUpdatedMessage;

// ---------- validation ----------

export type DecodeResult<T> =
  | { ok: true; message: T }
  | { ok: false; error: ErrorCode };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isProtocolVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function isPresencePlayer(value: unknown): value is PresencePlayer {
  return (
    isObject(value) &&
    isFarmCode(value["id"]) &&
    isDisplayName(value["name"]) &&
    isCharacterAppearance(value["appearance"]) &&
    isGridPosition(value)
  );
}

/** Checks that a value is a well-formed client message. Extra fields are ignored. */
export function isClientMessage(value: unknown): value is ClientMessage {
  if (!isObject(value)) return false;
  switch (value["type"]) {
    case "hello":
      return isProtocolVersion(value["protocolVersion"]) && isSessionToken(value["token"]);
    case "ping":
      return isTimestamp(value["sentAt"]);
    case "join":
      return isFarmCode(value["farmCode"]);
    case "leave":
      return true;
    case "move":
      return isGridPosition(value);
    case "emote":
      return isEmote(value["emote"]);
    default:
      return false;
  }
}

/** Checks that a value is a well-formed server message. Extra fields are ignored. */
export function isServerMessage(value: unknown): value is ServerMessage {
  if (!isObject(value)) return false;
  switch (value["type"]) {
    case "welcome": {
      const you = value["you"];
      return (
        isProtocolVersion(value["protocolVersion"]) &&
        isTimestamp(value["serverTime"]) &&
        isObject(you) &&
        isFarmCode(you["farmCode"]) &&
        isDisplayName(you["name"])
      );
    }
    case "room": {
      const players = value["players"];
      if (!isFarmCode(value["farmCode"]) || !Array.isArray(players) || players.length > MAX_ROOM_PLAYERS) return false;
      if (!players.every(isPresencePlayer)) return false;
      return new Set(players.map((player: PresencePlayer) => player.id)).size === players.length;
    }
    case "player_joined":
      return isPresencePlayer(value["player"]);
    case "player_left":
      return isFarmCode(value["id"]);
    case "player_moved":
      return isFarmCode(value["id"]) && isGridPosition(value);
    case "player_emote":
      return isFarmCode(value["id"]) && isEmote(value["emote"]);
    case "player_updated":
      return isFarmCode(value["id"]) && isCharacterAppearance(value["appearance"]);
    case "pong":
      return isTimestamp(value["sentAt"]) && isTimestamp(value["serverTime"]);
    case "error": {
      const error = value["error"];
      return (
        isObject(error) &&
        isErrorCode(error["code"]) &&
        typeof error["message"] === "string"
      );
    }
    default:
      return false;
  }
}

/** Parses raw WebSocket text sent by a client. Used by the server. */
export function decodeClientMessage(raw: string): DecodeResult<ClientMessage> {
  const value = parseJson(raw);
  return isClientMessage(value)
    ? { ok: true, message: value }
    : { ok: false, error: "INVALID_MESSAGE" };
}

/** Parses raw WebSocket text sent by the server. Used by the client. */
export function decodeServerMessage(raw: string): DecodeResult<ServerMessage> {
  const value = parseJson(raw);
  return isServerMessage(value)
    ? { ok: true, message: value }
    : { ok: false, error: "INVALID_MESSAGE" };
}
