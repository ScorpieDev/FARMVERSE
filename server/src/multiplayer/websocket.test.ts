import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HEALTH_PATH } from "@farmverse/shared/api";
import { PROTOCOL_VERSION, WS_PATH } from "@farmverse/shared/protocol";
import { buildApp } from "../app.js";
import type { ServerConfig } from "../config.js";
import { CLOSE_UNSUPPORTED_PROTOCOL } from "./connection.js";
import { MAX_MESSAGE_BYTES } from "./websocket.js";

const CLIENT_ORIGIN = "http://localhost:5173";

const config: ServerConfig = {
  host: "127.0.0.1",
  port: 0,
  clientOrigin: CLIENT_ORIGIN,
  logLevel: "silent",
  databasePath: ":memory:",
};

let app: FastifyInstance;
let baseUrl: string;
const clients: WebSocket[] = [];

beforeEach(async () => {
  app = buildApp(config);
  await app.listen({ host: config.host, port: config.port });
  const { port } = app.server.address() as AddressInfo;
  baseUrl = `127.0.0.1:${port}`;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  await app.close();
});

interface ConnectOptions {
  path?: string;
  origin?: string | null;
}

function connect({ path = WS_PATH, origin = CLIENT_ORIGIN }: ConnectOptions = {}) {
  const client = new WebSocket(
    `ws://${baseUrl}${path}`,
    origin === null ? {} : { origin },
  );
  clients.push(client);
  return client;
}

function opened(client: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once("open", () => resolve());
    client.once("error", reject);
  });
}

function nextMessage(client: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    client.once("message", (data) => resolve(JSON.parse(String(data))));
  });
}

function closed(client: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    client.once("close", (code, reason) =>
      resolve({ code, reason: reason.toString() }),
    );
  });
}

/** Resolves with the HTTP status of a rejected upgrade. */
function rejectedStatus(client: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    client.once("open", () => reject(new Error("upgrade was accepted")));
    client.once("unexpected-response", (request, response) => {
      resolve(response.statusCode ?? 0);
      request.destroy();
    });
    client.once("error", () => {});
  });
}

async function send(client: WebSocket, message: unknown): Promise<unknown> {
  const reply = nextMessage(client);
  client.send(typeof message === "string" ? message : JSON.stringify(message));
  return reply;
}

async function handshake(): Promise<WebSocket> {
  const client = connect();
  await opened(client);
  await send(client, { type: "hello", protocolVersion: PROTOCOL_VERSION });
  return client;
}

describe("WebSocket success", () => {
  it("answers hello with welcome", async () => {
    const client = connect();
    await opened(client);

    const reply = await send(client, { type: "hello", protocolVersion: PROTOCOL_VERSION });

    expect(reply).toEqual({
      type: "welcome",
      protocolVersion: PROTOCOL_VERSION,
      serverTime: expect.any(Number),
    });
  });

  it("answers ping with pong echoing sentAt", async () => {
    const client = await handshake();

    const reply = await send(client, { type: "ping", sentAt: 12345 });

    expect(reply).toEqual({
      type: "pong",
      sentAt: 12345,
      serverTime: expect.any(Number),
    });
  });

  it("keeps HTTP routes working alongside WebSocket", async () => {
    await handshake();
    const response = await fetch(`http://${baseUrl}${HEALTH_PATH}`);
    expect(response.status).toBe(200);
  });
});

describe("WebSocket errors", () => {
  it("sends UNSUPPORTED_PROTOCOL_VERSION then closes with 4000", async () => {
    const client = connect();
    await opened(client);
    const close = closed(client);

    const reply = await send(client, {
      type: "hello",
      protocolVersion: PROTOCOL_VERSION + 1,
    });

    expect(reply).toMatchObject({
      type: "error",
      error: { code: "UNSUPPORTED_PROTOCOL_VERSION" },
    });
    expect((await close).code).toBe(CLOSE_UNSUPPORTED_PROTOCOL);
  });

  it("answers ping before hello with INVALID_MESSAGE and stays open", async () => {
    const client = connect();
    await opened(client);

    const reply = await send(client, { type: "ping", sentAt: 1 });

    expect(reply).toMatchObject({ type: "error", error: { code: "INVALID_MESSAGE" } });
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it("answers invalid JSON with INVALID_MESSAGE and stays usable", async () => {
    const client = await handshake();

    const reply = await send(client, "{not json");
    expect(reply).toMatchObject({ type: "error", error: { code: "INVALID_MESSAGE" } });

    const pong = await send(client, { type: "ping", sentAt: 7 });
    expect(pong).toMatchObject({ type: "pong", sentAt: 7 });
  });

  it("answers binary frames with INVALID_MESSAGE", async () => {
    const client = await handshake();

    const reply = nextMessage(client);
    client.send(Buffer.from([1, 2, 3]), { binary: true });

    expect(await reply).toMatchObject({
      type: "error",
      error: { code: "INVALID_MESSAGE" },
    });
  });

  it("closes with 1009 when a message exceeds the size limit", async () => {
    const client = await handshake();
    const close = closed(client);

    client.send("x".repeat(MAX_MESSAGE_BYTES + 1));

    expect((await close).code).toBe(1009);
  });

  it("accepts a message exactly at the size limit", async () => {
    const client = await handshake();
    const padding = MAX_MESSAGE_BYTES - JSON.stringify({ type: "ping", sentAt: 1, p: "" }).length;

    const reply = await send(client, { type: "ping", sentAt: 1, p: "x".repeat(padding) });

    expect(reply).toMatchObject({ type: "pong", sentAt: 1 });
  });
});

describe("WebSocket upgrade checks", () => {
  it("rejects unknown paths with 404", async () => {
    expect(await rejectedStatus(connect({ path: "/not-ws" }))).toBe(404);
  });

  it("rejects other origins with 403", async () => {
    expect(await rejectedStatus(connect({ origin: "https://evil.example.com" }))).toBe(403);
  });

  it("rejects connections without an Origin header with 403", async () => {
    expect(await rejectedStatus(connect({ origin: null }))).toBe(403);
  });

  it("accepts the WebSocket path with a query string", async () => {
    const client = connect({ path: `${WS_PATH}?v=1` });
    await expect(opened(client)).resolves.toBeUndefined();
  });
});

describe("WebSocket shutdown", () => {
  it("closes open clients with 1001 and app.close() does not hang", async () => {
    const first = await handshake();
    const second = connect();
    await opened(second);
    const closes = Promise.all([closed(first), closed(second)]);

    await app.close();

    const codes = (await closes).map((close) => close.code);
    expect(codes).toEqual([1001, 1001]);
  }, 5000);
});
