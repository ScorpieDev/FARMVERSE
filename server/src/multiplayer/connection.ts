/**
 * Per-connection WebSocket message handling (protocol 2, Phase 5 Step 5.1).
 *
 * Pure logic with no socket access, so every rule can be unit tested:
 * the caller sends `replies` and closes the socket when `close` is set.
 *
 * `hello` must carry a valid session token: the connection is then bound to
 * that player for its whole life and `welcome` tells the client its public
 * identity. Nothing else is accepted before that. Farm room messages (join,
 * leave, move, emote) are returned as `room` requests for the presence hub
 * (hub.ts, Step 5.3), which decides them.
 */
import type { ErrorCode } from "@farmverse/shared/errors";
import {
  PROTOCOL_VERSION,
  decodeClientMessage,
  type ErrorMessage,
  type ServerMessage,
} from "@farmverse/shared/protocol";
import type { PlayerProfile } from "../players/profile.js";
import type { RoomRequest } from "./hub.js";

/** The player a connection belongs to (never sent to clients except the profile). */
export interface ConnectionPlayer {
  playerId: string;
  profile: PlayerProfile;
}

/** A connection must send `hello` before anything else. */
export type ConnectionState = { kind: "awaiting-hello" } | { kind: "ready"; player: ConnectionPlayer };

export const AWAITING_HELLO: ConnectionState = { kind: "awaiting-hello" };

/** Close code sent after an `UNSUPPORTED_PROTOCOL_VERSION` error. */
export const CLOSE_UNSUPPORTED_PROTOCOL = 4000;
/** Close code sent after an `UNAUTHORIZED` error (unknown session token). */
export const CLOSE_UNAUTHORIZED = 4001;

export interface MessageResult {
  state: ConnectionState;
  replies: ServerMessage[];
  close?: { code: number; reason: string };
  /** A farm room request for the presence hub (only when ready). */
  room?: RoomRequest;
}

/** Resolves a session token to its player, or null if the token is unknown. */
export type Authenticate = (token: string) => ConnectionPlayer | null;

export function errorMessage(code: ErrorCode, message: string): ErrorMessage {
  return { type: "error", error: { code, message } };
}

/** Handles one text message from the client. `now` is the server time in ms. */
export function handleClientMessage(
  state: ConnectionState,
  raw: string,
  now: number,
  authenticate: Authenticate,
): MessageResult {
  const decoded = decodeClientMessage(raw);
  if (!decoded.ok) {
    return {
      state,
      replies: [errorMessage("INVALID_MESSAGE", "Message does not match the protocol")],
    };
  }

  const message = decoded.message;
  if (message.type === "hello") {
    if (state.kind === "ready") {
      return { state, replies: [errorMessage("INVALID_MESSAGE", "hello was already received")] };
    }
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      return {
        state,
        replies: [
          errorMessage("UNSUPPORTED_PROTOCOL_VERSION", `Server speaks protocol version ${PROTOCOL_VERSION}`),
        ],
        close: { code: CLOSE_UNSUPPORTED_PROTOCOL, reason: "Unsupported protocol version" },
      };
    }
    const player = authenticate(message.token);
    if (player === null) {
      return {
        state,
        replies: [errorMessage("UNAUTHORIZED", "Missing or invalid session token")],
        close: { code: CLOSE_UNAUTHORIZED, reason: "Unauthorized" },
      };
    }
    return {
      state: { kind: "ready", player },
      replies: [
        {
          type: "welcome",
          protocolVersion: PROTOCOL_VERSION,
          serverTime: now,
          you: { farmCode: player.profile.farmCode, name: player.profile.name },
        },
      ],
    };
  }

  if (state.kind !== "ready") {
    return { state, replies: [errorMessage("INVALID_MESSAGE", "Send hello first")] };
  }

  switch (message.type) {
    case "ping":
      return { state, replies: [{ type: "pong", sentAt: message.sentAt, serverTime: now }] };
    case "join":
      return { state, replies: [], room: { type: "join", farmCode: message.farmCode } };
    case "leave":
      return { state, replies: [], room: { type: "leave" } };
    case "move":
      return { state, replies: [], room: { type: "move", x: message.x, y: message.y } };
    case "emote":
      return { state, replies: [], room: { type: "emote", emote: message.emote } };
  }
}
