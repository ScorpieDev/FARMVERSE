import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FARM_PATH,
  FARM_PLANT_PATH,
  OBJECT_MOVE_PATH,
  OBJECT_PLACE_PATH,
  OBJECT_REMOVE_PATH,
  OBJECT_ROTATE_PATH,
  SESSION_PATH,
  SHOP_BUY_PATH,
  isBuyDecorationResponse,
  isFarmState,
  isObjectActionResponse,
  type BuyDecorationResponse,
  type FarmState,
  type ObjectActionResponse,
  type SessionResponse,
} from "@farmverse/shared/api";
import type { DecorationId } from "@farmverse/shared/building";
import { totalXpForLevel } from "@farmverse/shared/progression";
import type { ErrorPayload } from "@farmverse/shared/errors";
import { registerFarmRoutes } from "../farming/routes.js";
import { MEMORY_DATABASE, openDatabase, transaction, type Database } from "../storage/database.js";
import { loadBuilding, saveBuilding } from "../storage/farmStore.js";
import { authenticate } from "../players/session.js";
import { grantDecoration } from "./rules.js";

const T = 1_700_000_000_000;

let db: Database;
let app: FastifyInstance;

beforeEach(() => {
  db = openDatabase(MEMORY_DATABASE);
  app = Fastify({ logger: false });
  registerFarmRoutes(app, { db, now: () => T });
});

afterEach(async () => {
  await app.close();
  db.close();
});

async function newSession(): Promise<SessionResponse> {
  const response = await app.inject({ method: "POST", url: SESSION_PATH });
  expect(response.statusCode).toBe(201);
  return response.json<SessionResponse>();
}

function auth(session: SessionResponse): Record<string, string> {
  return { authorization: `Bearer ${session.token}` };
}

/** Gives a player unplaced decorations (there is no shop yet, P3-4). */
function grant(session: SessionResponse, decorationId: DecorationId, count: number): void {
  const playerId = authenticate(db, `Bearer ${session.token}`)!;
  transaction(db, () => saveBuilding(db, playerId, grantDecoration(loadBuilding(db, playerId)!, decorationId, count)));
}

function post(session: SessionResponse, url: string, payload: object) {
  return app.inject({ method: "POST", url, headers: auth(session), payload });
}

async function getFarm(session: SessionResponse): Promise<FarmState> {
  const response = await app.inject({ method: "GET", url: FARM_PATH, headers: auth(session) });
  expect(response.statusCode).toBe(200);
  return response.json<FarmState>();
}

const place = (decorationId: string, x: number, y: number, rotation = 0, requestId: string = randomUUID()) => ({
  requestId,
  decorationId,
  x,
  y,
  rotation,
});

async function expectError(response: Awaited<ReturnType<typeof post>>, status: number, code: string): Promise<void> {
  expect(response.statusCode).toBe(status);
  expect(response.json<ErrorPayload>().code).toBe(code);
}

describe("FarmState with building (Phase 3)", () => {
  it("a new player has no decorations and no objects", async () => {
    const farm = await getFarm(await newSession());
    expect(isFarmState(farm)).toBe(true);
    expect(farm.decorations).toEqual([]);
    expect(farm.objects).toEqual([]);
  });

  it("existing farming actions still work and report the building state", async () => {
    const session = await newSession();
    grant(session, "bench", 2);
    const response = await post(session, FARM_PLANT_PATH, { requestId: randomUUID(), plotIndex: 0, cropId: "wheat" });
    expect(response.statusCode).toBe(200);
    const farm = response.json<FarmState>();
    expect(isFarmState(farm)).toBe(true);
    expect(farm.plots[0]?.crop?.cropId).toBe("wheat");
    expect(farm.decorations).toEqual([{ decorationId: "bench", quantity: 2 }]);
  });
});

describe("POST /api/farm/objects/place", () => {
  it("places an owned decoration; the server assigns the object ID and saves it", async () => {
    const session = await newSession();
    grant(session, "tree", 1);
    const response = await post(session, OBJECT_PLACE_PATH, place("tree", 6, 6, 90));
    expect(response.statusCode).toBe(200);
    const body = response.json<ObjectActionResponse>();
    expect(isObjectActionResponse(body)).toBe(true);
    expect(body.object).toEqual({ objectId: 1, decorationId: "tree", x: 6, y: 6, rotation: 90 });
    expect(body.decorations).toEqual([]);
    expect((await getFarm(session)).objects).toEqual([body.object]);
  });

  it("does not change coins, XP, plots, inventory or quests", async () => {
    const session = await newSession();
    const before = await getFarm(session);
    grant(session, "fence", 1);
    const body = (await post(session, OBJECT_PLACE_PATH, place("fence", 0, 0))).json<ObjectActionResponse>();
    const { decorations: _d, objects: _o, object: _object, ...rest } = body;
    const { decorations: _bd, objects: _bo, ...beforeRest } = before;
    expect(rest).toEqual(beforeRest);
  });

  it("rejects a decoration the player does not own", async () => {
    const session = await newSession();
    await expectError(await post(session, OBJECT_PLACE_PATH, place("small_house", 0, 0)), 409, "ITEM_NOT_OWNED");
    expect((await getFarm(session)).objects).toEqual([]);
  });

  it.each([
    ["past the right edge", place("tree", 7, 0)],
    ["past the bottom edge", place("tree", 0, 7)],
    ["off the grid", place("fence", 8, 0)],
    ["at a negative tile", place("fence", -1, 3)],
    ["on the plot block", place("tree", 1, 1)],
    ["on a plot tile", place("fence", 4, 4)],
  ])("rejects a placement %s and keeps the stock", async (_label, body) => {
    const session = await newSession();
    grant(session, "tree", 1);
    grant(session, "fence", 1);
    await expectError(await post(session, OBJECT_PLACE_PATH, body), 409, "PLACEMENT_INVALID");
    const farm = await getFarm(session);
    expect(farm.objects).toEqual([]);
    expect(farm.decorations).toEqual([
      { decorationId: "fence", quantity: 1 },
      { decorationId: "tree", quantity: 1 },
    ]);
  });

  it("rejects overlap with a placed object", async () => {
    const session = await newSession();
    grant(session, "tree", 1);
    grant(session, "fence", 1);
    expect((await post(session, OBJECT_PLACE_PATH, place("tree", 0, 0))).statusCode).toBe(200);
    await expectError(await post(session, OBJECT_PLACE_PATH, place("fence", 1, 1)), 409, "PLACEMENT_INVALID");
  });

  it.each([
    ["unknown decoration", place("castle", 0, 0)],
    ["bad rotation", place("fence", 0, 0, 45)],
    ["fractional tile", place("fence", 0.5, 0)],
    ["string tile", { ...place("fence", 0, 0), x: "0" }],
    ["missing request ID", { decorationId: "fence", x: 0, y: 0, rotation: 0 }],
    ["client-chosen object ID only", { requestId: randomUUID(), objectId: 7 }],
  ])("rejects a malformed request (%s) with 400", async (_label, body) => {
    const session = await newSession();
    grant(session, "fence", 1);
    await expectError(await post(session, OBJECT_PLACE_PATH, body), 400, "INVALID_REQUEST");
  });

  it("ignores a client-sent object ID", async () => {
    const session = await newSession();
    grant(session, "fence", 1);
    const response = await post(session, OBJECT_PLACE_PATH, { ...place("fence", 0, 0), objectId: 99 });
    expect(response.json<ObjectActionResponse>().object.objectId).toBe(1);
  });

  it("requires a session", async () => {
    const response = await app.inject({ method: "POST", url: OBJECT_PLACE_PATH, payload: place("fence", 0, 0) });
    expect(response.statusCode).toBe(401);
  });
});

describe("repeated requests", () => {
  it("replays the same request ID without placing twice", async () => {
    const session = await newSession();
    grant(session, "fence", 2);
    const body = place("fence", 0, 0);
    const first = await post(session, OBJECT_PLACE_PATH, body);
    const second = await post(session, OBJECT_PLACE_PATH, body);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    const farm = await getFarm(session);
    expect(farm.objects).toHaveLength(1);
    expect(farm.decorations).toEqual([{ decorationId: "fence", quantity: 1 }]);
  });

  it("rejects a request ID reused for a different body or action", async () => {
    const session = await newSession();
    grant(session, "fence", 2);
    const requestId = randomUUID();
    expect((await post(session, OBJECT_PLACE_PATH, place("fence", 0, 0, 0, requestId))).statusCode).toBe(200);
    await expectError(await post(session, OBJECT_PLACE_PATH, place("fence", 1, 0, 0, requestId)), 409, "REQUEST_ID_REUSED");
    await expectError(await post(session, OBJECT_REMOVE_PATH, { requestId, objectId: 1 }), 409, "REQUEST_ID_REUSED");
  });

  it("rejects the same placement sent again with a new request ID", async () => {
    const session = await newSession();
    grant(session, "fence", 2);
    expect((await post(session, OBJECT_PLACE_PATH, place("fence", 0, 0))).statusCode).toBe(200);
    await expectError(await post(session, OBJECT_PLACE_PATH, place("fence", 0, 0)), 409, "PLACEMENT_INVALID");
  });

  it("replays a remove without returning the object to the stock twice", async () => {
    const session = await newSession();
    grant(session, "bench", 1);
    await post(session, OBJECT_PLACE_PATH, place("bench", 0, 0));
    const body = { requestId: randomUUID(), objectId: 1 };
    expect((await post(session, OBJECT_REMOVE_PATH, body)).statusCode).toBe(200);
    expect((await post(session, OBJECT_REMOVE_PATH, body)).statusCode).toBe(200);
    expect((await getFarm(session)).decorations).toEqual([{ decorationId: "bench", quantity: 1 }]);
    await expectError(await post(session, OBJECT_REMOVE_PATH, { requestId: randomUUID(), objectId: 1 }), 409, "OBJECT_NOT_FOUND");
  });
});

describe("move, rotate and remove", () => {
  async function farmWithTreeAndFence(): Promise<SessionResponse> {
    const session = await newSession();
    grant(session, "tree", 1);
    grant(session, "fence", 1);
    await post(session, OBJECT_PLACE_PATH, place("tree", 0, 0));
    await post(session, OBJECT_PLACE_PATH, place("fence", 2, 0));
    return session;
  }

  it("moves an object, keeping its ID and rotation", async () => {
    const session = await farmWithTreeAndFence();
    const response = await post(session, OBJECT_MOVE_PATH, { requestId: randomUUID(), objectId: 1, x: 6, y: 6 });
    expect(response.statusCode).toBe(200);
    expect(response.json<ObjectActionResponse>().object).toEqual({
      objectId: 1,
      decorationId: "tree",
      x: 6,
      y: 6,
      rotation: 0,
    });
    expect((await getFarm(session)).objects.find((object) => object.objectId === 1)).toMatchObject({ x: 6, y: 6 });
  });

  it("allows a move overlapping only the object's own old tiles", async () => {
    const session = await farmWithTreeAndFence();
    expect((await post(session, OBJECT_MOVE_PATH, { requestId: randomUUID(), objectId: 1, x: 0, y: 1 })).statusCode).toBe(200);
  });

  it.each([
    ["onto another object", { x: 1, y: 0 }],
    ["past the edge", { x: 7, y: 7 }],
    ["onto the plots", { x: 3, y: 3 }],
    ["off the grid", { x: -1, y: 0 }],
  ])("rejects a move %s and keeps the object in place", async (_label, to) => {
    const session = await farmWithTreeAndFence();
    await expectError(
      await post(session, OBJECT_MOVE_PATH, { requestId: randomUUID(), objectId: 1, ...to }),
      409,
      "PLACEMENT_INVALID",
    );
    expect((await getFarm(session)).objects.find((object) => object.objectId === 1)).toMatchObject({ x: 0, y: 0 });
  });

  it("rotates an object in place", async () => {
    const session = await farmWithTreeAndFence();
    const response = await post(session, OBJECT_ROTATE_PATH, { requestId: randomUUID(), objectId: 2, rotation: 270 });
    expect(response.statusCode).toBe(200);
    expect(response.json<ObjectActionResponse>().object).toMatchObject({ objectId: 2, x: 2, y: 0, rotation: 270 });
    await expectError(
      await post(session, OBJECT_ROTATE_PATH, { requestId: randomUUID(), objectId: 2, rotation: 45 }),
      400,
      "INVALID_REQUEST",
    );
  });

  it("removes an object back to the stock and frees its tiles", async () => {
    const session = await farmWithTreeAndFence();
    const response = await post(session, OBJECT_REMOVE_PATH, { requestId: randomUUID(), objectId: 1 });
    expect(response.statusCode).toBe(200);
    const body = response.json<ObjectActionResponse>();
    expect(body.object.decorationId).toBe("tree");
    expect(body.objects.map((object) => object.objectId)).toEqual([2]);
    expect(body.decorations).toEqual([{ decorationId: "tree", quantity: 1 }]);
    const again = await post(session, OBJECT_PLACE_PATH, place("tree", 0, 0));
    expect(again.json<ObjectActionResponse>().object.objectId).toBe(3);
  });

  it.each([OBJECT_MOVE_PATH, OBJECT_ROTATE_PATH, OBJECT_REMOVE_PATH])("%s rejects an unknown object", async (url) => {
    const session = await farmWithTreeAndFence();
    await expectError(
      await post(session, url, { requestId: randomUUID(), objectId: 9, x: 6, y: 6, rotation: 90 }),
      409,
      "OBJECT_NOT_FOUND",
    );
  });

  it("does not let a player touch another player's objects", async () => {
    const owner = await farmWithTreeAndFence();
    const other = await newSession();
    for (const [url, extra] of [
      [OBJECT_MOVE_PATH, { x: 6, y: 6 }],
      [OBJECT_ROTATE_PATH, { rotation: 90 }],
      [OBJECT_REMOVE_PATH, {}],
    ] as const) {
      await expectError(await post(other, url, { requestId: randomUUID(), objectId: 1, ...extra }), 409, "OBJECT_NOT_FOUND");
    }
    expect((await getFarm(owner)).objects).toHaveLength(2);
    expect((await getFarm(other)).objects).toEqual([]);
  });
});

describe("POST /api/shop/buy (Step 3.4)", () => {
  /** Sets a player's coins and level directly (tests only). */
  function setWallet(session: SessionResponse, coins: number, level = 1): void {
    const playerId = authenticate(db, `Bearer ${session.token}`)!;
    db.prepare("UPDATE players SET coins = ?, xp = ? WHERE id = ?").run(coins, totalXpForLevel(level), playerId);
  }
  const buy = (decorationId: string, requestId: string = randomUUID()) => ({ requestId, decorationId });

  it("charges the server price and adds the decoration, which can then be placed", async () => {
    const session = await newSession();
    setWallet(session, 12);
    const response = await post(session, SHOP_BUY_PATH, buy("fence"));
    expect(response.statusCode).toBe(200);
    const body = response.json<BuyDecorationResponse>();
    expect(isBuyDecorationResponse(body)).toBe(true);
    expect(body.bought).toEqual({ decorationId: "fence", price: 5 });
    expect(body.coins).toBe(7);
    expect(body.decorations).toEqual([{ decorationId: "fence", quantity: 1 }]);
    expect((await post(session, OBJECT_PLACE_PATH, place("fence", 0, 0))).statusCode).toBe(200);
    const farm = await getFarm(session);
    expect(farm.coins).toBe(7);
    expect(farm.objects).toHaveLength(1);
    expect(farm.decorations).toEqual([]);
  });

  it("does not change XP, level, plots, seeds or quests", async () => {
    const session = await newSession();
    setWallet(session, 50);
    const before = await getFarm(session);
    const body = (await post(session, SHOP_BUY_PATH, buy("path"))).json<BuyDecorationResponse>();
    expect(body.xp).toBe(before.xp);
    expect(body.progression).toEqual(before.progression);
    expect(body.plots).toEqual(before.plots);
    expect(body.inventory).toEqual(before.inventory);
    expect(body.quest).toEqual(before.quest);
  });

  it("rejects a purchase the coins do not cover, without charging", async () => {
    const session = await newSession();
    setWallet(session, 4);
    await expectError(await post(session, SHOP_BUY_PATH, buy("fence")), 409, "INSUFFICIENT_CURRENCY");
    const farm = await getFarm(session);
    expect(farm.coins).toBe(4);
    expect(farm.decorations).toEqual([]);
  });

  it("rejects a decoration above the player's level", async () => {
    const session = await newSession();
    setWallet(session, 1000, 5);
    await expectError(await post(session, SHOP_BUY_PATH, buy("small_house")), 409, "LEVEL_TOO_LOW");
    expect((await post(session, SHOP_BUY_PATH, buy("tree"))).statusCode).toBe(200);
    expect((await getFarm(session)).coins).toBe(880);
  });

  it.each([
    ["unknown decoration", { requestId: randomUUID(), decorationId: "castle" }],
    ["missing request ID", { decorationId: "fence" }],
    ["missing decoration", { requestId: randomUUID() }],
  ])("rejects a malformed request (%s) with 400", async (_label, body) => {
    const session = await newSession();
    setWallet(session, 100);
    await expectError(await post(session, SHOP_BUY_PATH, body), 400, "INVALID_REQUEST");
  });

  it("ignores a client-sent price or quantity", async () => {
    const session = await newSession();
    setWallet(session, 100);
    const body = (await post(session, SHOP_BUY_PATH, { ...buy("fence"), price: 0, quantity: 50 })).json<BuyDecorationResponse>();
    expect(body.coins).toBe(95);
    expect(body.decorations).toEqual([{ decorationId: "fence", quantity: 1 }]);
  });

  it("replays the same request ID without charging twice", async () => {
    const session = await newSession();
    setWallet(session, 20);
    const body = buy("fence");
    const first = await post(session, SHOP_BUY_PATH, body);
    const second = await post(session, SHOP_BUY_PATH, body);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect((await getFarm(session)).coins).toBe(15);
    await expectError(await post(session, SHOP_BUY_PATH, buy("path", body.requestId)), 409, "REQUEST_ID_REUSED");
  });

  it("charges again for a new request ID", async () => {
    const session = await newSession();
    setWallet(session, 20);
    await post(session, SHOP_BUY_PATH, buy("fence"));
    await post(session, SHOP_BUY_PATH, buy("fence"));
    const farm = await getFarm(session);
    expect(farm.coins).toBe(10);
    expect(farm.decorations).toEqual([{ decorationId: "fence", quantity: 2 }]);
  });

  it("requires a session", async () => {
    const response = await app.inject({ method: "POST", url: SHOP_BUY_PATH, payload: buy("fence") });
    expect(response.statusCode).toBe(401);
  });

  it("removing a placed object returns it to the stock without a refund", async () => {
    const session = await newSession();
    setWallet(session, 5);
    await post(session, SHOP_BUY_PATH, buy("fence"));
    await post(session, OBJECT_PLACE_PATH, place("fence", 0, 0));
    await post(session, OBJECT_REMOVE_PATH, { requestId: randomUUID(), objectId: 1 });
    const farm = await getFarm(session);
    expect(farm.coins).toBe(0);
    expect(farm.decorations).toEqual([{ decorationId: "fence", quantity: 1 }]);
  });
});
