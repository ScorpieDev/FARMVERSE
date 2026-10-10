/**
 * WebSocket endpoint at WS_PATH, attached to Fastify's HTTP server with `ws`.
 *
 * Upgrades are only accepted on WS_PATH and from the configured client
 * origin, which blocks cross-site WebSocket hijacking from other web pages.
 */
import type { Duplex } from "node:stream";
import type { FastifyInstance } from "fastify";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { WS_PATH, type ServerMessage } from "@farmverse/shared/protocol";
import type { ServerConfig } from "../config.js";
import {
  errorMessage,
  handleClientMessage,
  type ConnectionState,
} from "./connection.js";

/** Larger messages are rejected by `ws` with close code 1009. */
export const MAX_MESSAGE_BYTES = 4096;

const CLOSE_GOING_AWAY = 1001;

function rejectUpgrade(socket: Duplex, status: 403 | 404): void {
  const statusText = status === 403 ? "Forbidden" : "Not Found";
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

export function registerWebSocket(
  app: FastifyInstance,
  config: ServerConfig,
): void {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
  });
  let nextConnectionId = 1;

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
    if (origin !== config.clientOrigin) {
      app.log.warn({ origin }, "WebSocket upgrade rejected: origin not allowed");
      rejectUpgrade(socket, 403);
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      handleConnection(ws, request.socket.remoteAddress);
    });
  });

  function handleConnection(ws: WebSocket, ip: string | undefined): void {
    const log = app.log.child({ connectionId: nextConnectionId++ });
    let state: ConnectionState = "awaiting-hello";
    log.info({ ip }, "WebSocket connected");

    const send = (message: ServerMessage): void => {
      ws.send(JSON.stringify(message));
    };

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        log.debug("Rejected binary message");
        send(errorMessage("INVALID_MESSAGE", "Binary messages are not supported"));
        return;
      }

      const result = handleClientMessage(state, toText(data), Date.now());
      if (result.replies.some((reply) => reply.type === "error")) {
        log.debug("Rejected client message");
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
      log.info({ code }, "WebSocket disconnected");
    });
  }

  // Upgraded sockets keep the HTTP server open, so close them before Fastify
  // closes the server; otherwise app.close() would wait for every client.
  app.addHook("preClose", async () => {
    for (const client of wss.clients) {
      client.close(CLOSE_GOING_AWAY, "Server shutting down");
    }
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
}
