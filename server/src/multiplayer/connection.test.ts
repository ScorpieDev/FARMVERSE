import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "@farmverse/shared/protocol";
import {
  AWAITING_HELLO,
  CLOSE_UNAUTHORIZED,
  CLOSE_UNSUPPORTED_PROTOCOL,
  handleClientMessage,
  type Authenticate,
  type ConnectionPlayer,
  type ConnectionState,
} from "./connection.js";

const NOW = 1_700_000_000_000;
const TOKEN = "A".repeat(40) + "-_9";
const OTHER_TOKEN = "B".repeat(43);
const PLAYER: ConnectionPlayer = {
  playerId: "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7b9e0f12",
  profile: { farmCode: "ABC234", name: "Farmer 0042" },
};
const READY: ConnectionState = { kind: "ready", player: PLAYER };
/** Knows only TOKEN. */
const authenticate: Authenticate = (token) => (token === TOKEN ? PLAYER : null);

const hello = (protocolVersion = PROTOCOL_VERSION, token = TOKEN) =>
  JSON.stringify({ type: "hello", protocolVersion, token });
const ping = (sentAt = 123) => JSON.stringify({ type: "ping", sentAt });
const handle = (state: ConnectionState, raw: string) => handleClientMessage(state, raw, NOW, authenticate);

function errorCodes(result: ReturnType<typeof handleClientMessage>) {
  return result.replies.map((reply) =>
    reply.type === "error" ? reply.error.code : reply.type,
  );
}

describe("handleClientMessage", () => {
  it("authenticates hello and answers welcome with the public identity only", () => {
    const result = handle(AWAITING_HELLO, hello());

    expect(result).toEqual({
      state: READY,
      replies: [
        {
          type: "welcome",
          protocolVersion: PROTOCOL_VERSION,
          serverTime: NOW,
          you: { farmCode: "ABC234", name: "Farmer 0042" },
        },
      ],
    });
    expect(JSON.stringify(result.replies)).not.toContain(PLAYER.playerId);
    expect(JSON.stringify(result.replies)).not.toContain(TOKEN);
  });

  it("rejects an unknown token with UNAUTHORIZED and asks to close", () => {
    const result = handle(AWAITING_HELLO, hello(PROTOCOL_VERSION, OTHER_TOKEN));

    expect(result.state).toEqual(AWAITING_HELLO);
    expect(errorCodes(result)).toEqual(["UNAUTHORIZED"]);
    expect(result.close?.code).toBe(CLOSE_UNAUTHORIZED);
  });

  it("rejects a protocol 1 hello (no token) as an invalid message", () => {
    const result = handle(AWAITING_HELLO, JSON.stringify({ type: "hello", protocolVersion: 1 }));
    expect(result.state).toEqual(AWAITING_HELLO);
    expect(errorCodes(result)).toEqual(["INVALID_MESSAGE"]);
  });

  it("rejects an unsupported protocol version before looking at the token", () => {
    let calls = 0;
    const result = handleClientMessage(AWAITING_HELLO, hello(PROTOCOL_VERSION + 1), NOW, () => {
      calls++;
      return PLAYER;
    });

    expect(result.state).toEqual(AWAITING_HELLO);
    expect(errorCodes(result)).toEqual(["UNSUPPORTED_PROTOCOL_VERSION"]);
    expect(result.close?.code).toBe(CLOSE_UNSUPPORTED_PROTOCOL);
    expect(calls).toBe(0);
  });

  it("answers ping with pong after hello, echoing sentAt", () => {
    expect(handle(READY, ping(42))).toEqual({
      state: READY,
      replies: [{ type: "pong", sentAt: 42, serverTime: NOW }],
    });
  });

  it.each([
    ["ping", ping()],
    ["join", JSON.stringify({ type: "join", farmCode: "ABC234" })],
    ["move", JSON.stringify({ type: "move", x: 1, y: 1 })],
  ])("rejects %s before hello and keeps the connection", (_label, raw) => {
    const result = handle(AWAITING_HELLO, raw);

    expect(result.state).toEqual(AWAITING_HELLO);
    expect(errorCodes(result)).toEqual(["INVALID_MESSAGE"]);
    expect(result.close).toBeUndefined();
  });

  it("rejects a second hello and keeps the connection and its player", () => {
    const result = handle(READY, hello(PROTOCOL_VERSION, OTHER_TOKEN));

    expect(result.state).toEqual(READY);
    expect(errorCodes(result)).toEqual(["INVALID_MESSAGE"]);
    expect(result.close).toBeUndefined();
  });

  it.each([
    ["join", { type: "join", farmCode: "ABC234" }],
    ["leave", { type: "leave" }],
    ["move", { type: "move", x: 1, y: 1 }],
    ["emote", { type: "emote", emote: "wave" }],
  ])("answers %s with an error until farm rooms exist (Step 5.3)", (_label, message) => {
    const result = handle(READY, JSON.stringify(message));
    expect(result.state).toEqual(READY);
    expect(errorCodes(result)).toEqual(["INVALID_MESSAGE"]);
  });

  it.each([
    ["broken JSON", "{oops"],
    ["unknown type", JSON.stringify({ type: "harvest" })],
    ["missing field", JSON.stringify({ type: "ping" })],
    ["server message", JSON.stringify({ type: "pong", sentAt: 1, serverTime: 1 })],
  ])("rejects %s without closing", (_label, raw) => {
    for (const state of [AWAITING_HELLO, READY]) {
      const result = handle(state, raw);

      expect(result.state).toEqual(state);
      expect(errorCodes(result)).toEqual(["INVALID_MESSAGE"]);
      expect(result.close).toBeUndefined();
    }
  });

  it("does not echo raw client input in error messages", () => {
    const result = handle(READY, "<script>secret</script>");
    expect(JSON.stringify(result.replies)).not.toContain("secret");
  });
});
