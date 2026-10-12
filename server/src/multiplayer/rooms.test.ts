import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHARACTER_EQUIP_PATH,
  ONLINE_PLAYERS_PATH,
  SESSION_PATH,
  isOnlinePlayersResponse,
  isVisitedFarm,
  visitFarmPath,
  type SessionResponse,
} from "@farmverse/shared/api";
import { DEFAULT_APPEARANCE } from "@farmverse/shared/character";
import { PROTOCOL_VERSION, WS_PATH, type ServerMessage, type WelcomeMessage } from "@farmverse/shared/protocol";
import { buildApp } from "../app.js";
import type { ServerConfig } from "../config.js";

const ORIGIN = "http://localhost:5173";
const config: ServerConfig = { host: "127.0.0.1", port: 0, clientOrigins: [ORIGIN], logLevel: "silent", databasePath: ":memory:" };

let app: FastifyInstance;
let base = "";
const sockets: WebSocket[] = [];

beforeEach(async () => {
  app = buildApp(config);
  await app.listen({ host: config.host, port: config.port });
  base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await app.close();
});

/** A connected, authenticated player with an inbox of server messages. */
interface Player {
  token: string;
  farmCode: string;
  socket: WebSocket;
  inbox: ServerMessage[];
  send(message: object): void;
  /** Resolves with the next message of `type` (already received or future). */
  next<T extends ServerMessage["type"]>(type: T): Promise<Extract<ServerMessage, { type: T }>>;
}

async function player(): Promise<Player> {
  const session = (await (await fetch(`http://${base}${SESSION_PATH}`, { method: "POST" })).json()) as SessionResponse;
  const socket = new WebSocket(`ws://${base}${WS_PATH}`, { origin: ORIGIN });
  sockets.push(socket);
  const inbox: ServerMessage[] = [];
  const waiters: Array<{ type: string; resolve: (message: ServerMessage) => void }> = [];
  let read = 0;
  socket.on("message", (data) => {
    const message = JSON.parse(String(data)) as ServerMessage;
    inbox.push(message);
    for (const waiter of waiters.splice(0)) {
      if (waiter.type === message.type) waiter.resolve(message);
      else waiters.push(waiter);
    }
  });
  await new Promise((resolve) => socket.once("open", resolve));
  const created: Player = {
    token: session.token,
    farmCode: "",
    socket,
    inbox,
    send: (message) => socket.send(JSON.stringify(message)),
    next: (type) =>
      new Promise((resolve) => {
        const index = inbox.findIndex((message, position) => position >= read && message.type === type);
        if (index >= 0) {
          read = index + 1;
          resolve(inbox[index] as never);
          return;
        }
        waiters.push({ type, resolve: (message) => { read = inbox.length; resolve(message as never); } });
      }),
  };
  created.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, token: session.token });
  created.farmCode = ((await created.next("welcome")) as WelcomeMessage).you.farmCode;
  return created;
}

const get = (path: string, token?: string) =>
  fetch(`http://${base}${path}`, token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } });

describe("farm rooms over WebSocket (Step 5.3)", () => {
  it("lets a visitor join, move, emote and leave the owner's farm", async () => {
    const owner = await player();
    const visitor = await player();

    owner.send({ type: "join", farmCode: owner.farmCode });
    expect((await owner.next("room")).players.map((p) => p.id)).toEqual([owner.farmCode]);

    visitor.send({ type: "join", farmCode: owner.farmCode });
    const snapshot = await visitor.next("room");
    expect(snapshot.farmCode).toBe(owner.farmCode);
    expect(snapshot.players.map((p) => p.id)).toEqual([owner.farmCode, visitor.farmCode]);
    expect((await owner.next("player_joined")).player).toMatchObject({ id: visitor.farmCode, x: 3, y: 7 });

    visitor.send({ type: "move", x: 0, y: 0 });
    expect(await owner.next("player_moved")).toEqual({ type: "player_moved", id: visitor.farmCode, x: 0, y: 0 });
    expect(await visitor.next("player_moved")).toEqual({ type: "player_moved", id: visitor.farmCode, x: 0, y: 0 });

    visitor.send({ type: "emote", emote: "heart" });
    expect(await owner.next("player_emote")).toEqual({ type: "player_emote", id: visitor.farmCode, emote: "heart" });

    visitor.send({ type: "leave" });
    expect(await owner.next("player_left")).toEqual({ type: "player_left", id: visitor.farmCode });
  });

  it("tells the room when a member disconnects", async () => {
    const owner = await player();
    const visitor = await player();
    owner.send({ type: "join", farmCode: owner.farmCode });
    await owner.next("room");
    visitor.send({ type: "join", farmCode: owner.farmCode });
    await owner.next("player_joined");
    visitor.socket.close();
    expect(await owner.next("player_left")).toEqual({ type: "player_left", id: visitor.farmCode });
  });

  it("pushes a visitor's new appearance (HTTP equip) to the room", async () => {
    const owner = await player();
    const visitor = await player();
    owner.send({ type: "join", farmCode: owner.farmCode });
    await owner.next("room");
    visitor.send({ type: "join", farmCode: owner.farmCode });
    await owner.next("player_joined");

    const appearance = { ...DEFAULT_APPEARANCE, skin: "dark", hair: "hair_long_black" };
    const response = await fetch(`http://${base}${CHARACTER_EQUIP_PATH}`, {
      method: "POST",
      headers: { authorization: `Bearer ${visitor.token}`, "content-type": "application/json" },
      body: JSON.stringify({ requestId: randomUUID(), appearance }),
    });
    expect(response.status).toBe(200);
    expect(await owner.next("player_updated")).toEqual({ type: "player_updated", id: visitor.farmCode, appearance });
  });

  it("answers room errors to the sender only", async () => {
    const lonely = await player();
    lonely.send({ type: "move", x: 0, y: 0 });
    expect((await lonely.next("error")).error.code).toBe("NOT_IN_ROOM");
    lonely.send({ type: "join", farmCode: "ZZZZZZ" });
    expect((await lonely.next("error")).error.code).toBe("ROOM_NOT_FOUND");
    lonely.send({ type: "join", farmCode: lonely.farmCode });
    await lonely.next("room");
    lonely.send({ type: "move", x: 0, y: 0 });
    lonely.send({ type: "move", x: 1, y: 0 });
    expect((await lonely.next("error")).error.code).toBe("RATE_LIMITED");
  });
});

describe("GET /api/players/online", () => {
  it("lists connected players except the caller, and needs a session", async () => {
    const first = await player();
    const second = await player();
    const response = await get(ONLINE_PLAYERS_PATH, first.token);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isOnlinePlayersResponse(body)).toBe(true);
    expect((body as { players: Array<{ farmCode: string }> }).players.map((p) => p.farmCode)).toEqual([second.farmCode]);

    second.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(((await (await get(ONLINE_PLAYERS_PATH, first.token)).json()) as { players: unknown[] }).players).toEqual([]);
    expect((await get(ONLINE_PLAYERS_PATH)).status).toBe(401);
  });
});

describe("GET /api/farms/:farmCode (visitor view)", () => {
  it("shows plots, objects, level, name and appearance, and nothing private", async () => {
    const owner = await player();
    const visitor = await player();
    const response = await get(visitFarmPath(owner.farmCode), visitor.token);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(isVisitedFarm(body)).toBe(true);
    expect(body["farmCode"]).toBe(owner.farmCode);
    expect(body["level"]).toBe(1);
    expect(Object.keys(body).sort()).toEqual(["appearance", "farmCode", "level", "name", "objects", "plots", "serverTime"]);
    for (const secret of ["coins", "xp", "inventory", "quest", "decorations", "character", "playerId"]) {
      expect(body).not.toHaveProperty(secret);
    }
  });

  it("answers 404 ROOM_NOT_FOUND for unknown or malformed codes and 401 without a session", async () => {
    const visitor = await player();
    for (const code of ["ZZZZZZ", "abc", "../farm"]) {
      const response = await get(visitFarmPath(code), visitor.token);
      expect(response.status).toBe(404);
      expect(((await response.json()) as { code: string }).code).toBe("ROOM_NOT_FOUND");
    }
    expect((await get(visitFarmPath(visitor.farmCode))).status).toBe(401);
  });
});
