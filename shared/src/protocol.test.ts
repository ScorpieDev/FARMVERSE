import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  decodeClientMessage,
  decodeServerMessage,
  isClientMessage,
  isServerMessage,
} from "./protocol.js";
import { DEFAULT_APPEARANCE } from "./character.js";

const invalid = { ok: false, error: "INVALID_MESSAGE" };
const TOKEN = "A".repeat(40) + "-_9";
const YOU = { farmCode: "ABC234", name: "Farmer 0042" };
const PLAYER = { id: "ABC234", name: "Farmer 0042", appearance: { ...DEFAULT_APPEARANCE }, x: 3, y: 7 };

describe("decodeClientMessage", () => {
  it("decodes a valid hello", () => {
    const message = { type: "hello", protocolVersion: PROTOCOL_VERSION, token: TOKEN };
    expect(decodeClientMessage(JSON.stringify(message))).toEqual({
      ok: true,
      message,
    });
  });

  it("decodes a valid ping", () => {
    const message = { type: "ping", sentAt: 1_700_000_000_000 };
    expect(decodeClientMessage(JSON.stringify(message))).toEqual({
      ok: true,
      message,
    });
  });

  it("ignores extra fields", () => {
    const raw = JSON.stringify({ type: "ping", sentAt: 0, extra: true });
    expect(decodeClientMessage(raw).ok).toBe(true);
  });

  it.each([
    ["broken JSON", "{not json"],
    ["empty string", ""],
    ["JSON null", "null"],
    ["JSON array", "[]"],
    ["JSON string", '"hello"'],
    ["missing type", JSON.stringify({ protocolVersion: 1 })],
    ["unknown type", JSON.stringify({ type: "harvest" })],
    ["server message type", JSON.stringify({ type: "pong", sentAt: 0, serverTime: 0 })],
  ])("rejects %s", (_label, raw) => {
    expect(decodeClientMessage(raw)).toEqual(invalid);
  });

  it.each([
    ["missing protocolVersion", { type: "hello", token: TOKEN }],
    ["string protocolVersion", { type: "hello", protocolVersion: "1", token: TOKEN }],
    ["zero protocolVersion", { type: "hello", protocolVersion: 0, token: TOKEN }],
    ["negative protocolVersion", { type: "hello", protocolVersion: -1, token: TOKEN }],
    ["fractional protocolVersion", { type: "hello", protocolVersion: 1.5, token: TOKEN }],
    ["missing token (protocol 1 hello)", { type: "hello", protocolVersion: PROTOCOL_VERSION }],
    ["malformed token", { type: "hello", protocolVersion: PROTOCOL_VERSION, token: "short" }],
  ])("rejects hello with %s", (_label, value) => {
    expect(decodeClientMessage(JSON.stringify(value))).toEqual(invalid);
  });

  it.each([
    ["missing sentAt", { type: "ping" }],
    ["string sentAt", { type: "ping", sentAt: "123" }],
    ["negative sentAt", { type: "ping", sentAt: -1 }],
    ["null sentAt", { type: "ping", sentAt: null }],
  ])("rejects ping with %s", (_label, value) => {
    expect(decodeClientMessage(JSON.stringify(value))).toEqual(invalid);
  });

  it("rejects non-finite sentAt", () => {
    // JSON cannot encode Infinity, so check the type guard directly.
    expect(isClientMessage({ type: "ping", sentAt: Infinity })).toBe(false);
    expect(isClientMessage({ type: "ping", sentAt: NaN })).toBe(false);
  });
});

describe("decodeServerMessage", () => {
  it("decodes a valid welcome", () => {
    const message = {
      type: "welcome",
      protocolVersion: PROTOCOL_VERSION,
      serverTime: 1_700_000_000_000,
      you: YOU,
    };
    expect(decodeServerMessage(JSON.stringify(message))).toEqual({
      ok: true,
      message,
    });
  });

  it("decodes a valid pong", () => {
    const message = { type: "pong", sentAt: 10, serverTime: 20 };
    expect(decodeServerMessage(JSON.stringify(message))).toEqual({
      ok: true,
      message,
    });
  });

  it("decodes a valid error", () => {
    const message = {
      type: "error",
      error: { code: "UNSUPPORTED_PROTOCOL_VERSION", message: "expected 1" },
    };
    expect(decodeServerMessage(JSON.stringify(message))).toEqual({
      ok: true,
      message,
    });
  });

  it.each([
    ["broken JSON", "{"],
    ["JSON null", "null"],
    ["unknown type", JSON.stringify({ type: "reward", amount: 100 })],
    ["client message type", JSON.stringify({ type: "ping", sentAt: 0 })],
    ["welcome without serverTime", JSON.stringify({ type: "welcome", protocolVersion: 2, you: YOU })],
    ["welcome with invalid protocolVersion", JSON.stringify({ type: "welcome", protocolVersion: 0, serverTime: 0, you: YOU })],
    ["welcome without you (protocol 1)", JSON.stringify({ type: "welcome", protocolVersion: 2, serverTime: 0 })],
    ["welcome with a bad name", JSON.stringify({ type: "welcome", protocolVersion: 2, serverTime: 0, you: { ...YOU, name: "<b>x</b>" } })],
    ["pong without sentAt", JSON.stringify({ type: "pong", serverTime: 0 })],
    ["pong with string serverTime", JSON.stringify({ type: "pong", sentAt: 0, serverTime: "0" })],
    ["error without payload", JSON.stringify({ type: "error" })],
    ["error with array payload", JSON.stringify({ type: "error", error: [] })],
    ["error without message", JSON.stringify({ type: "error", error: { code: "INTERNAL_ERROR" } })],
    ["error with unknown code", JSON.stringify({ type: "error", error: { code: "NOPE", message: "x" } })],
    ["error with numeric code", JSON.stringify({ type: "error", error: { code: 500, message: "x" } })],
  ])("rejects %s", (_label, raw) => {
    expect(decodeServerMessage(raw)).toEqual(invalid);
  });

  it("rejects non-object values in the type guard", () => {
    expect(isServerMessage(undefined)).toBe(false);
    expect(isServerMessage("welcome")).toBe(false);
  });
});

describe("room messages (protocol 2)", () => {
  it.each<[string, unknown]>([
    ["join", { type: "join", farmCode: "ABC234" }],
    ["leave", { type: "leave" }],
    ["move", { type: "move", x: 0, y: 7 }],
    ["emote", { type: "emote", emote: "wave" }],
  ])("accepts a client %s", (_label, message) => {
    expect(decodeClientMessage(JSON.stringify(message))).toEqual({ ok: true, message });
  });

  it.each<[string, unknown]>([
    ["join with a lowercase code", { type: "join", farmCode: "abc234" }],
    ["join with a look-alike character", { type: "join", farmCode: "ABC0I1" }],
    ["join with a player ID", { type: "join", farmCode: "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7b9e0f12" }],
    ["move off the grid", { type: "move", x: 8, y: 0 }],
    ["move to a fractional tile", { type: "move", x: 1.5, y: 0 }],
    ["move without y", { type: "move", x: 1 }],
    ["unknown emote", { type: "emote", emote: "dance" }],
  ])("rejects a client %s", (_label, message) => {
    expect(decodeClientMessage(JSON.stringify(message))).toEqual(invalid);
  });

  it.each<[string, unknown]>([
    ["room snapshot", { type: "room", farmCode: "ABC234", players: [PLAYER] }],
    ["empty room", { type: "room", farmCode: "ABC234", players: [] }],
    ["player_joined", { type: "player_joined", player: PLAYER }],
    ["player_left", { type: "player_left", id: "ABC234" }],
    ["player_moved", { type: "player_moved", id: "ABC234", x: 4, y: 4 }],
    ["player_emote", { type: "player_emote", id: "ABC234", emote: "heart" }],
    ["player_updated", { type: "player_updated", id: "ABC234", appearance: { ...DEFAULT_APPEARANCE, skin: "dark" } }],
  ])("accepts a server %s", (_label, message) => {
    expect(decodeServerMessage(JSON.stringify(message))).toEqual({ ok: true, message });
  });

  it.each<[string, unknown]>([
    ["room with the same player twice", { type: "room", farmCode: "ABC234", players: [PLAYER, PLAYER] }],
    ["room with 21 players", { type: "room", farmCode: "ABC234", players: Array.from({ length: 21 }, () => PLAYER) }],
    ["player with a bad appearance", { type: "player_joined", player: { ...PLAYER, appearance: { ...DEFAULT_APPEARANCE, hair: "cape" } } }],
    ["player off the grid", { type: "player_joined", player: { ...PLAYER, x: -1 } }],
    ["player with an injected name", { type: "player_joined", player: { ...PLAYER, name: "Farmer 12<script>" } }],
    ["player_moved without id", { type: "player_moved", x: 1, y: 1 }],
    ["player_updated with a bad appearance", { type: "player_updated", id: "ABC234", appearance: {} }],
  ])("rejects a server %s", (_label, message) => {
    expect(decodeServerMessage(JSON.stringify(message))).toEqual(invalid);
  });
});
