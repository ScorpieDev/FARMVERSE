import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "@farmverse/shared/protocol";
import {
  CLOSE_UNSUPPORTED_PROTOCOL,
  handleClientMessage,
} from "./connection.js";

const NOW = 1_700_000_000_000;
const hello = (protocolVersion = PROTOCOL_VERSION) =>
  JSON.stringify({ type: "hello", protocolVersion });
const ping = (sentAt = 123) => JSON.stringify({ type: "ping", sentAt });

function errorCodes(result: ReturnType<typeof handleClientMessage>) {
  return result.replies.map((reply) =>
    reply.type === "error" ? reply.error.code : reply.type,
  );
}

describe("handleClientMessage", () => {
  it("answers hello with welcome and becomes ready", () => {
    const result = handleClientMessage("awaiting-hello", hello(), NOW);

    expect(result).toEqual({
      state: "ready",
      replies: [
        { type: "welcome", protocolVersion: PROTOCOL_VERSION, serverTime: NOW },
      ],
    });
  });

  it("rejects an unsupported protocol version and asks to close", () => {
    const result = handleClientMessage(
      "awaiting-hello",
      hello(PROTOCOL_VERSION + 1),
      NOW,
    );

    expect(result.state).toBe("awaiting-hello");
    expect(errorCodes(result)).toEqual(["UNSUPPORTED_PROTOCOL_VERSION"]);
    expect(result.close?.code).toBe(CLOSE_UNSUPPORTED_PROTOCOL);
  });

  it("answers ping with pong after hello, echoing sentAt", () => {
    const result = handleClientMessage("ready", ping(42), NOW);

    expect(result).toEqual({
      state: "ready",
      replies: [{ type: "pong", sentAt: 42, serverTime: NOW }],
    });
  });

  it("rejects ping before hello and keeps the connection", () => {
    const result = handleClientMessage("awaiting-hello", ping(), NOW);

    expect(result.state).toBe("awaiting-hello");
    expect(errorCodes(result)).toEqual(["INVALID_MESSAGE"]);
    expect(result.close).toBeUndefined();
  });

  it("rejects a second hello and keeps the connection", () => {
    const result = handleClientMessage("ready", hello(), NOW);

    expect(result.state).toBe("ready");
    expect(errorCodes(result)).toEqual(["INVALID_MESSAGE"]);
    expect(result.close).toBeUndefined();
  });

  it.each([
    ["broken JSON", "{oops"],
    ["unknown type", JSON.stringify({ type: "harvest" })],
    ["missing field", JSON.stringify({ type: "ping" })],
    ["server message", JSON.stringify({ type: "pong", sentAt: 1, serverTime: 1 })],
  ])("rejects %s without closing", (_label, raw) => {
    for (const state of ["awaiting-hello", "ready"] as const) {
      const result = handleClientMessage(state, raw, NOW);

      expect(result.state).toBe(state);
      expect(errorCodes(result)).toEqual(["INVALID_MESSAGE"]);
      expect(result.close).toBeUndefined();
    }
  });

  it("does not echo raw client input in error messages", () => {
    const result = handleClientMessage("ready", "<script>secret</script>", NOW);
    expect(JSON.stringify(result.replies)).not.toContain("secret");
  });
});
