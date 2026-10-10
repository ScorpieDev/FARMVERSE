/**
 * Builds the Fastify application without starting it, so tests can use
 * `app.inject()` and index.ts decides when to listen.
 */
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { HEALTH_PATH, type HealthResponse } from "@farmverse/shared/api";
import type { ErrorPayload } from "@farmverse/shared/errors";
import packageJson from "../package.json" with { type: "json" };
import type { ServerConfig } from "./config.js";
import { registerWebSocket } from "./multiplayer/websocket.js";

export const SERVER_VERSION = packageJson.version;

export function buildApp(config: ServerConfig): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } });

  void app.register(cors, { origin: config.clientOrigin });

  app.get(HEALTH_PATH, (): HealthResponse => {
    return { status: "ok", version: SERVER_VERSION, serverTime: Date.now() };
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ErrorPayload = {
      code: "NOT_FOUND",
      message: `Route ${request.method} ${request.url} not found`,
    };
    return reply.code(404).send(body);
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : 500;

    if (statusCode >= 400 && statusCode < 500) {
      // Client errors raised by Fastify itself (e.g. malformed JSON body).
      // The fixed message avoids echoing parser or framework internals.
      const body: ErrorPayload = {
        code: "INVALID_REQUEST",
        message: "Invalid request",
      };
      return reply.code(statusCode).send(body);
    }

    request.log.error({ err: error }, "Unhandled error");
    // Never leak internal error details to the client.
    const body: ErrorPayload = {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    };
    return reply.code(500).send(body);
  });

  registerWebSocket(app, config);

  return app;
}
