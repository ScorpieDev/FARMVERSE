/**
 * WebSocket endpoint at WS_PATH, attached to Fastify's HTTP server with `ws`.
 *
 * Upgrades are only accepted on WS_PATH and from the configured client
 * origin, which blocks cross-site WebSocket hijacking from other web pages.
 * The Origin check is not authentication: each connection is bound to a
 * player by the session token in its `hello` (protocol 2).
 *
 * Connection protection (Step 5.2, Phase 0 audit S-3 / S-4):
 * - `hello` must arrive within HELLO_TIMEOUT_MS;
 * - the server pings every heartbeat interval and terminates connections
 *   that miss HEARTBEAT_MAX_MISSES pongs in a row;
 * - one connection per player: a newer authenticated connection replaces the
 *   older one, which is closed with CLOSE_REPLACED;
 * - at most `maxConnections` sockets; further upgrades get 503;
 * - every text message takes a token from a per-connection bucket; empty
 *   bucket → RATE_LIMITED (message ignored); too many refusals → close 1008.
 */
import type { Duplex } from "node:stream";
import type { FastifyInstance } from "fastify";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { WS_PATH, type ServerMessage } from "@farmverse/shared/protocol";
import type { ServerConfig } from "../config.js";
import {
  AWAITING_HELLO,
  errorMessage,
  handleClientMessage,
  type Authenticate,
  type ConnectionState,
} from "./connection.js";
import { TokenBucket, type RateLimit } from "./rateLimit.js";

/** Larger messages are rejected by `ws` with close code 1009. */
export const MAX_MESSAGE_BYTES = 4096;

const CLOSE_GOING_AWAY = 1001;
/** Close code for policy violations (no hello in time, sustained flooding). */
export const CLOSE_POLICY = 1008;
/** Close code sent to an older connection when the same player connects again. */
export const CLOSE_REPLACED = 4002;

/** Limits; the defaults are provisional and can be lowered in tests. */
export interface WebSocketLimits {
  helloTimeoutMs: number;
  heartbeatIntervalMs: number;
  heartbeatMaxMisses: number;
  maxConnections: number;
  messageRate: RateLimit;
  /** Refused messages after which the connection is closed. */
  maxRateViolations: number;
}

export const DEFAULT_WEBSOCKET_LIMITS: Readonly<WebSocketLimits> = {
  helloTimeoutMs: 10_000,
  heartbeatIntervalMs: 15_000,
  heartbeatMaxMisses: 2,
  maxConnections: 500,
  messageRate: { perSecond: 20, burst: 40 },
  maxRateViolations: 50,
};

const STATUS_TEXT = { 403: "Forbidden", 404: "Not Found", 503: "Service Unavailable" } as const;

function rejectUpgrade(socket: Duplex, status: keyof typeof STATUS_TEXT): void {
  const statusText = STATUS_TEXT[status];
  socket.once("finish", () => socket.destroy());
  socket.end(
    `HTTP/1.1 ${status} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
}

function getPathname(url: string | undefined): string | undefined {
  try {
    return new URL(url ?? "/", "http://localhost").pathname;
  } catch {
    return undefined;
  }
}

function toText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

export interface WebSocketOptions {
  /** Resolves the session token sent in `hello` to its player. */
  authenticate: Authenticate;
  limits?: Partial<WebSocketLimits>;
}

export function registerWebSocket(
  app: FastifyInstance,
  config: ServerConfig,
  { authenticate, limits: overrides = {} }: WebSocketOptions,
): void {
  const limits: WebSocketLimits = { ...DEFAULT_WEBSOCKET_LIMITS, ...overrides };
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
  });
  let nextConnectionId = 1;
  /** The live authenticated connection of each player (one per player). */
  const playerSockets = new Map<string, WebSocket>();
  /** Pongs missed in a row, per socket. */
  const missedPongs = new WeakMap<WebSocket, number>();

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const missed = missedPongs.get(client) ?? 0;
      if (missed >= limits.heartbeatMaxMisses) {
        app.log.info("WebSocket terminated: no pong");
        client.terminate();
        continue;
      }
      missedPongs.set(client, missed + 1);
      client.ping();
    }
  }, limits.heartbeatIntervalMs);
  heartbeat.unref();

  app.server.on("upgrade", (request, socket, head) => {
    // Ignore resets on sockets we are rejecting.
    socket.on("error", () => {});

    if (getPathname(request.url) !== WS_PATH) {
      app.log.warn({ url: request.url }, "WebSocket upgrade rejected: unknown path");
      rejectUpgrade(socket, 404);
      return;
    }

    // Browsers always send Origin; a missing one is rejected as well.
    const origin = request.headers.origin;
    if (!origin || !config.clientOrigins.includes(origin)) {
      app.log.warn({ origin }, "WebSocket upgrade rejected: origin not allowed");
      rejectUpgrade(socket, 403);
      return;
    }

    if (wss.clients.size >= limits.maxConnections) {
      app.log.warn({ connections: wss.clients.size }, "WebSocket upgrade rejected: connection limit");
      rejectUpgrade(socket, 503);
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      handleConnection(ws, request.socket.remoteAddress);
    });
  });

  function handleConnection(ws: WebSocket, ip: string | undefined): void {
    const log = app.log.child({ connectionId: nextConnectionId++ });
    let state: ConnectionState = AWAITING_HELLO;
    const bucket = new TokenBucket(limits.messageRate, Date.now());
    let rateViolations = 0;
    log.info({ ip }, "WebSocket connected");

    const send = (message: ServerMessage): void => {
      ws.send(JSON.stringify(message));
    };

    const helloTimer = setTimeout(() => {
      log.warn("WebSocket closed: no hello in time");
      ws.close(CLOSE_POLICY, "No hello in time");
    }, limits.helloTimeoutMs);

    ws.on("pong", () => missedPongs.set(ws, 0));

    ws.on("message", (data, isBinary) => {
      if (!bucket.take(Date.now())) {
        rateViolations += 1;
        if (rateViolations >= limits.maxRateViolations) {
          log.warn("WebSocket closed: too many messages");
          ws.close(CLOSE_POLICY, "Too many messages");
          return;
        }
        send(errorMessage("RATE_LIMITED", "Too many messages"));
        return;
      }

      if (isBinary) {
        log.debug("Rejected binary message");
        send(errorMessage("INVALID_MESSAGE", "Binary messages are not supported"));
        return;
      }

      const result = handleClientMessage(state, toText(data), Date.now(), authenticate);
      if (result.replies.some((reply) => reply.type === "error")) {
        log.debug("Rejected client message");
      }
      if (state.kind !== "ready" && result.state.kind === "ready") {
        const { playerId } = result.state.player;
        clearTimeout(helloTimer);
        // Player ID only, never the token.
        log.info({ playerId }, "WebSocket authenticated");
        const previous = playerSockets.get(playerId);
        if (previous !== undefined && previous !== ws) {
          log.info({ playerId }, "Older connection of the same player replaced");
          previous.close(CLOSE_REPLACED, "Replaced by a newer connection");
        }
        playerSockets.set(playerId, ws);
      }
      state = result.state;
      for (const reply of result.replies) send(reply);

      if (result.close) {
        log.warn({ code: result.close.code }, result.close.reason);
        ws.close(result.close.code, result.close.reason);
      }
    });

    ws.on("error", (error) => {
      // e.g. message larger than MAX_MESSAGE_BYTES; ws closes the socket itself.
      log.warn({ err: error }, "WebSocket error");
    });

    ws.on("close", (code) => {
      clearTimeout(helloTimer);
      if (state.kind === "ready" && playerSockets.get(state.player.playerId) === ws) {
        playerSockets.delete(state.player.playerId);
      }
      log.info({ code }, "WebSocket disconnected");
    });
  }

  // Upgraded sockets keep the HTTP server open, so close them before Fastify
  // closes the server; otherwise app.close() would wait for every client.
  app.addHook("preClose", async () => {
    clearInterval(heartbeat);
    for (const client of wss.clients) {
      client.close(CLOSE_GOING_AWAY, "Server shutting down");
    }
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
}
