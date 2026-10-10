/**
 * Connection states shown to the player, and their display text.
 */

export type ConnectionStatus =
  | { kind: "connecting"; attempt: number }
  | { kind: "connected"; serverVersion: string; rttMs?: number }
  | { kind: "reconnecting"; attempt: number; maxAttempts: number; retryInMs: number }
  | { kind: "offline" }
  | { kind: "incompatible" }
  | { kind: "misconfigured"; reason: string }
  | { kind: "closed" };

export type StatusTone = "ok" | "pending" | "error";

export interface StatusDisplay {
  text: string;
  tone: StatusTone;
}

export function formatStatus(status: ConnectionStatus): StatusDisplay {
  switch (status.kind) {
    case "connecting":
      return { text: "Connecting…", tone: "pending" };
    case "connected": {
      const parts = ["Connected", `v${status.serverVersion}`];
      if (status.rttMs !== undefined) parts.push(`${Math.round(status.rttMs)} ms`);
      return { text: parts.join(" · "), tone: "ok" };
    }
    case "reconnecting": {
      const seconds = Math.max(1, Math.ceil(status.retryInMs / 1000));
      return {
        text: `Reconnecting in ${seconds} s (${status.attempt}/${status.maxAttempts})`,
        tone: "pending",
      };
    }
    case "offline":
      return { text: "Offline · Tap to retry", tone: "error" };
    case "incompatible":
      return { text: "Please reload the game (version mismatch)", tone: "error" };
    case "misconfigured":
      return { text: "Server URL is not configured correctly", tone: "error" };
    case "closed":
      return { text: "Disconnected", tone: "error" };
  }
}
