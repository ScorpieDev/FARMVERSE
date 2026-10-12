import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { WebSocket, type ClientOptions } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { SESSION_PATH, type SessionResponse } from "@farmverse/shared/api";
import { PROTOCOL_VERSION, WS_PATH } from "@farmverse/shared/protocol";
import { buildApp } from "../app.js";
import type { ServerConfig } from "../config.js";
import { CLOSE_POLICY, CLOSE_REPLACED, type WebSocketLimits } from "./websocket.js";

const ORIGIN = "http://localhost:5173";
const config: ServerConfig = {
  host: "127.0.0.1",
  port: 0,
  clientOrigins: [ORIGIN],
  logLevel: "silent",
  databasePath: ":memory:",
};

let app: FastifyInstance | undefined;
let baseUrl = "";
const clients: WebSocket[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  await app?.close();
  app = undefined;
});

async function start(limits: Partial<WebSocketLimits>): Promise<void> {
  app = buildApp(config, { webSocketLimits: limits });
  await app.listen({ host: config.host, port: config.port });
  baseUrl = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

async function newToken(): Promise<string> {
  const response = await fetch(`http://${baseUrl}${SESSION_PATH}`, { method: "POST" });
  return ((await response.json()) as SessionResponse).token;
}

function connect(options: ClientOptions = {}): WebSocket {
  const client = new WebSocket(`ws://${baseUrl}${WS_PATH}`, { origin: ORIGIN, ...options });
  clients.push(client);
  return client;
}

const opened = (client: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    client.once("open", () => resolve());
    client.once("error", reject);
  });
const closed = (client: WebSocket) =>
  new Promise<number>((resolve) => client.once("close", (code) => resolve(code)));
const nextMessage = (client: WebSocket) =>
  new Promise<{ type: string; error?: { code: string } }>((resolve) =>
    client.once("message", (data) => resolve(JSON.parse(String(data)))),
  );

async function handshake(token: string, options: ClientOptions = {}): Promise<WebSocket> {
  const client = connect(options);
  await opened(client);
  const welcome = nextMessage(client);
  client.send(JSON.stringify({ type: "hello", protocolVersion: PROTOCOL_VERSION, token }));
  expect((await welcome).type).toBe("welcome");
  return client;
}

describe("WebSocket connection protection (Step 5.2)", () => {
  it("closes a connection that does not send hello in time", async () => {
    await start({ helloTimeoutMs: 150 });
    const client = connect();
    await opened(client);
    expect(await closed(client)).toBe(CLOSE_POLICY);
  });

  it("does not close an authenticated connection when the hello timer would have fired", async () => {
    await start({ helloTimeoutMs: 150 });
    const client = await handshake(await newToken());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it("terminates connections that stop answering pings, and keeps live ones", async () => {
    await start({ heartbeatIntervalMs: 60, heartbeatMaxMisses: 2 });
    const live = await handshake(await newToken());
    const silent = await handshake(await newToken(), { autoPong: false });
    const silentClosed = closed(silent);
    expect(await silentClosed).toBe(1006);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(live.readyState).toBe(WebSocket.OPEN);
  });

  it("keeps one connection per player: the newer one replaces the older one", async () => {
    await start({});
    const token = await newToken();
    const older = await handshake(token);
    const olderClosed = closed(older);
    const newer = await handshake(token);
    expect(await olderClosed).toBe(CLOSE_REPLACED);
    const pong = nextMessage(newer);
    newer.send(JSON.stringify({ type: "ping", sentAt: 1 }));
    expect((await pong).type).toBe("pong");
  });

  it("does not let different players replace each other", async () => {
    await start({});
    const first = await handshake(await newToken());
    await handshake(await newToken());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(first.readyState).toBe(WebSocket.OPEN);
  });

  it("rejects upgrades beyond the connection limit with 503", async () => {
    await start({ maxConnections: 2 });
    await opened(connect());
    await opened(connect());
    const third = connect();
    const status = await new Promise<number>((resolve) => {
      third.once("unexpected-response", (request, response) => {
        resolve(response.statusCode ?? 0);
        request.destroy();
      });
      third.once("error", () => {});
    });
    expect(status).toBe(503);
  });

  it("answers floods with RATE_LIMITED, then closes with 1008", async () => {
    await start({ messageRate: { perSecond: 0.001, burst: 3 }, maxRateViolations: 3 });
    const client = await handshake(await newToken()); // hello took 1 token
    const replies: string[] = [];
    client.on("message", (data) => {
      const message = JSON.parse(String(data)) as { type: string; error?: { code: string } };
      replies.push(message.error?.code ?? message.type);
    });
    const done = closed(client);
    for (let index = 0; index < 6; index++) client.send(JSON.stringify({ type: "ping", sentAt: index }));
    expect(await done).toBe(CLOSE_POLICY);
    expect(replies).toEqual(["pong", "pong", "RATE_LIMITED", "RATE_LIMITED"]);
  });
});
