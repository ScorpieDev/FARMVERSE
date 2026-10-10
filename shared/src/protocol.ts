/**
 * WebSocket protocol contract shared by client and server (Phase 0).
 *
 * Messages are JSON objects with a `type` field.
 *
 *   client → server: hello, ping
 *   server → client: welcome, pong, error
 *
 * No player state, gameplay or authentication in Phase 0.
 */
import { isErrorCode } from "./errors.js";
import type { ErrorCode, ErrorPayload } from "./errors.js";

/** Bump when the message contract changes in an incompatible way. */
export const PROTOCOL_VERSION = 1;

export const WS_PATH = "/ws";

// ---------- client → server ----------

export interface HelloMessage {
  type: "hello";
  protocolVersion: number;
}

export interface PingMessage {
  type: "ping";
  /** Client time (ms since epoch) when the ping was sent; echoed back in pong. */
  sentAt: number;
}

export type ClientMessage = HelloMessage | PingMessage;

// ---------- server → client ----------

export interface WelcomeMessage {
  type: "welcome";
  protocolVersion: number;
  /** Server time in ms since epoch. */
  serverTime: number;
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

export type ServerMessage = WelcomeMessage | PongMessage | ErrorMessage;

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

/** Checks that a value is a well-formed client message. Extra fields are ignored. */
export function isClientMessage(value: unknown): value is ClientMessage {
  if (!isObject(value)) return false;
  switch (value["type"]) {
    case "hello":
      return isProtocolVersion(value["protocolVersion"]);
    case "ping":
      return isTimestamp(value["sentAt"]);
    default:
      return false;
  }
}

/** Checks that a value is a well-formed server message. Extra fields are ignored. */
export function isServerMessage(value: unknown): value is ServerMessage {
  if (!isObject(value)) return false;
  switch (value["type"]) {
    case "welcome":
      return (
        isProtocolVersion(value["protocolVersion"]) &&
        isTimestamp(value["serverTime"])
      );
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
