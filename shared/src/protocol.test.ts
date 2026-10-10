import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  decodeClientMessage,
  decodeServerMessage,
  isClientMessage,
  isServerMessage,
} from "./protocol.js";

const invalid = { ok: false, error: "INVALID_MESSAGE" };

describe("decodeClientMessage", () => {
  it("decodes a valid hello", () => {
    const message = { type: "hello", protocolVersion: PROTOCOL_VERSION };
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
    ["missing protocolVersion", { type: "hello" }],
    ["string protocolVersion", { type: "hello", protocolVersion: "1" }],
    ["zero protocolVersion", { type: "hello", protocolVersion: 0 }],
    ["negative protocolVersion", { type: "hello", protocolVersion: -1 }],
    ["fractional protocolVersion", { type: "hello", protocolVersion: 1.5 }],
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
    ["welcome without serverTime", JSON.stringify({ type: "welcome", protocolVersion: 1 })],
    ["welcome with invalid protocolVersion", JSON.stringify({ type: "welcome", protocolVersion: 0, serverTime: 0 })],
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
