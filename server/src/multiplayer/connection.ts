/**
 * Per-connection WebSocket message handling (Phase 0 protocol).
 *
 * Pure logic with no socket access, so every rule can be unit tested:
 * the caller sends `replies` and closes the socket when `close` is set.
 */
import type { ErrorCode } from "@farmverse/shared/errors";
import {
  PROTOCOL_VERSION,
  decodeClientMessage,
  type ErrorMessage,
  type ServerMessage,
} from "@farmverse/shared/protocol";

/** A connection must send `hello` before anything else. */
export type ConnectionState = "awaiting-hello" | "ready";

/** Close code sent after an `UNSUPPORTED_PROTOCOL_VERSION` error. */
export const CLOSE_UNSUPPORTED_PROTOCOL = 4000;

export interface MessageResult {
  state: ConnectionState;
  replies: ServerMessage[];
  close?: { code: number; reason: string };
}

export function errorMessage(code: ErrorCode, message: string): ErrorMessage {
  return { type: "error", error: { code, message } };
}

/** Handles one text message from the client. `now` is the server time in ms. */
export function handleClientMessage(
  state: ConnectionState,
  raw: string,
  now: number,
): MessageResult {
  const decoded = decodeClientMessage(raw);
  if (!decoded.ok) {
    return {
      state,
      replies: [errorMessage("INVALID_MESSAGE", "Message does not match the protocol")],
    };
  }

  const message = decoded.message;
  switch (message.type) {
    case "hello": {
      if (state === "ready") {
        return {
          state,
          replies: [errorMessage("INVALID_MESSAGE", "hello was already received")],
        };
      }
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        return {
          state,
          replies: [
            errorMessage(
              "UNSUPPORTED_PROTOCOL_VERSION",
              `Server speaks protocol version ${PROTOCOL_VERSION}`,
            ),
          ],
          close: {
            code: CLOSE_UNSUPPORTED_PROTOCOL,
            reason: "Unsupported protocol version",
          },
        };
      }
      return {
        state: "ready",
        replies: [
          { type: "welcome", protocolVersion: PROTOCOL_VERSION, serverTime: now },
        ],
      };
    }

    case "ping": {
      if (state !== "ready") {
        return {
          state,
          replies: [errorMessage("INVALID_MESSAGE", "Send hello first")],
        };
      }
      return {
        state,
        replies: [{ type: "pong", sentAt: message.sentAt, serverTime: now }],
      };
    }
  }
}
