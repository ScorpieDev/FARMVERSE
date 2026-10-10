import { describe, expect, it } from "vitest";
import { formatStatus, type ConnectionStatus } from "./connectionStatus.js";

describe("formatStatus", () => {
  it.each<[ConnectionStatus, string, string]>([
    [{ kind: "connecting", attempt: 1 }, "Connecting…", "pending"],
    [{ kind: "connected", serverVersion: "0.0.0" }, "Connected · v0.0.0", "ok"],
    [
      { kind: "connected", serverVersion: "0.0.0", rttMs: 41.6 },
      "Connected · v0.0.0 · 42 ms",
      "ok",
    ],
    [
      { kind: "reconnecting", attempt: 2, maxAttempts: 5, retryInMs: 3_200 },
      "Reconnecting in 4 s (2/5)",
      "pending",
    ],
    [
      { kind: "reconnecting", attempt: 1, maxAttempts: 5, retryInMs: 200 },
      "Reconnecting in 1 s (1/5)",
      "pending",
    ],
    [{ kind: "offline" }, "Offline · Tap to retry", "error"],
    [{ kind: "incompatible" }, "Please reload the game (version mismatch)", "error"],
    [
      { kind: "misconfigured", reason: "bad" },
      "Server URL is not configured correctly",
      "error",
    ],
    [{ kind: "closed" }, "Disconnected", "error"],
  ])("formats %j", (status, text, tone) => {
    expect(formatStatus(status)).toEqual({ text, tone });
  });
});
