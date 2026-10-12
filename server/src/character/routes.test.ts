import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHARACTER_EQUIP_PATH,
  FARM_PATH,
  FARM_PLANT_PATH,
  SESSION_PATH,
  SHOP_BUY_COSMETIC_PATH,
  isBuyCosmeticResponse,
  isFarmState,
  type BuyCosmeticResponse,
  type FarmState,
  type SessionResponse,
} from "@farmverse/shared/api";
import { DEFAULT_APPEARANCE, STARTER_COSMETIC_IDS } from "@farmverse/shared/character";
import type { ErrorPayload } from "@farmverse/shared/errors";
import { totalXpForLevel } from "@farmverse/shared/progression";
import { registerFarmRoutes } from "../farming/routes.js";
import { authenticate } from "../players/session.js";
import { MEMORY_DATABASE, openDatabase, type Database } from "../storage/database.js";

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

function post(session: SessionResponse, url: string, payload: object) {
  return app.inject({ method: "POST", url, headers: { authorization: `Bearer ${session.token}` }, payload });
}

async function getFarm(session: SessionResponse): Promise<FarmState> {
  const response = await app.inject({ method: "GET", url: FARM_PATH, headers: { authorization: `Bearer ${session.token}` } });
  expect(response.statusCode).toBe(200);
  return response.json<FarmState>();
}

async function expectError(response: Awaited<ReturnType<typeof post>>, status: number, code: string): Promise<void> {
  expect(response.statusCode).toBe(status);
  expect(response.json<ErrorPayload>().code).toBe(code);
}

/** Sets a player's coins and level directly (tests only). */
function setWallet(session: SessionResponse, coins: number, level = 1): void {
  const playerId = authenticate(db, `Bearer ${session.token}`)!;
  db.prepare("UPDATE players SET coins = ?, xp = ? WHERE id = ?").run(coins, totalXpForLevel(level), playerId);
}

const equip = (appearance: object, requestId: string = randomUUID()) => ({ requestId, appearance });
const buy = (cosmeticId: string, requestId: string = randomUUID()) => ({ requestId, cosmeticId });

describe("FarmState with character (Phase 4)", () => {
  it("a new player owns the starter items and wears the default appearance", async () => {
    const farm = await getFarm(await newSession());
    expect(isFarmState(farm)).toBe(true);
    expect(farm.character).toEqual({ appearance: DEFAULT_APPEARANCE, owned: STARTER_COSMETIC_IDS });
  });

  it("farming actions report the character", async () => {
    const session = await newSession();
    const response = await post(session, FARM_PLANT_PATH, { requestId: randomUUID(), plotIndex: 0, cropId: "wheat" });
    expect(response.statusCode).toBe(200);
    expect(response.json<FarmState>().character.appearance).toEqual(DEFAULT_APPEARANCE);
  });
});

describe("POST /api/character/equip", () => {
  it("changes the appearance with owned items and saves it", async () => {
    const session = await newSession();
    const look = { skin: "dark", hair: "hair_long_black", shirt: "shirt_blue_tee", pants: "pants_brown" };
    const response = await post(session, CHARACTER_EQUIP_PATH, equip(look));
    expect(response.statusCode).toBe(200);
    const body = response.json<FarmState>();
    expect(isFarmState(body)).toBe(true);
    expect(body.character.appearance).toEqual(look);
    expect((await getFarm(session)).character.appearance).toEqual(look);
  });

  it("rejects an item the player does not own and changes nothing", async () => {
    const session = await newSession();
    await expectError(await post(session, CHARACTER_EQUIP_PATH, equip({ ...DEFAULT_APPEARANCE, hair: "hair_bun_red" })), 409, "ITEM_NOT_OWNED");
    expect((await getFarm(session)).character.appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it.each<[string, unknown]>([
    ["missing appearance", { requestId: randomUUID() }],
    ["item in the wrong slot", equip({ ...DEFAULT_APPEARANCE, pants: "shirt_blue_tee" })],
    ["unknown skin", equip({ ...DEFAULT_APPEARANCE, skin: "purple" })],
    ["extra field", equip({ ...DEFAULT_APPEARANCE, hat: "cap" })],
    ["bad request ID", equip(DEFAULT_APPEARANCE, "x")],
  ])("rejects %s as INVALID_REQUEST", async (_label, payload) => {
    await expectError(await post(await newSession(), CHARACTER_EQUIP_PATH, payload as object), 400, "INVALID_REQUEST");
  });

  it("replays the same request ID and rejects its reuse for another body", async () => {
    const session = await newSession();
    const requestId = randomUUID();
    const look = { ...DEFAULT_APPEARANCE, skin: "tan" };
    const first = await post(session, CHARACTER_EQUIP_PATH, equip(look, requestId));
    await post(session, CHARACTER_EQUIP_PATH, equip({ ...DEFAULT_APPEARANCE, skin: "brown" }));
    const replay = await post(session, CHARACTER_EQUIP_PATH, equip(look, requestId));
    expect(replay.json()).toEqual(first.json());
    expect((await getFarm(session)).character.appearance.skin).toBe("brown");
    await expectError(await post(session, CHARACTER_EQUIP_PATH, equip(DEFAULT_APPEARANCE, requestId)), 409, "REQUEST_ID_REUSED");
  });

  it("requires a session", async () => {
    const response = await app.inject({ method: "POST", url: CHARACTER_EQUIP_PATH, payload: equip(DEFAULT_APPEARANCE) });
    expect(response.statusCode).toBe(401);
  });
});

describe("POST /api/shop/buy-cosmetic", () => {
  it("charges the server price, adds the item without wearing it, and the item can then be worn", async () => {
    const session = await newSession();
    setWallet(session, 45, 2);
    const response = await post(session, SHOP_BUY_COSMETIC_PATH, buy("hair_spiky_blond"));
    expect(response.statusCode).toBe(200);
    const body = response.json<BuyCosmeticResponse>();
    expect(isBuyCosmeticResponse(body)).toBe(true);
    expect(body.bought).toEqual({ cosmeticId: "hair_spiky_blond", price: 40 });
    expect(body.coins).toBe(5);
    expect(body.character.owned).toContain("hair_spiky_blond");
    expect(body.character.appearance).toEqual(DEFAULT_APPEARANCE);

    const worn = await post(session, CHARACTER_EQUIP_PATH, equip({ ...DEFAULT_APPEARANCE, hair: "hair_spiky_blond" }));
    expect(worn.statusCode).toBe(200);
    const farm = await getFarm(session);
    expect(farm.coins).toBe(5);
    expect(farm.character.appearance.hair).toBe("hair_spiky_blond");
  });

  it("checks ownership, level and coins on the server and changes nothing on failure", async () => {
    const session = await newSession();
    setWallet(session, 39, 1);
    await expectError(await post(session, SHOP_BUY_COSMETIC_PATH, buy("shirt_white_tee")), 409, "ALREADY_OWNED");
    await expectError(await post(session, SHOP_BUY_COSMETIC_PATH, buy("pants_green_shorts")), 409, "LEVEL_TOO_LOW");
    setWallet(session, 39, 2);
    await expectError(await post(session, SHOP_BUY_COSMETIC_PATH, buy("pants_green_shorts")), 409, "INSUFFICIENT_CURRENCY");
    const farm = await getFarm(session);
    expect(farm.coins).toBe(39);
    expect(farm.character.owned).toEqual(STARTER_COSMETIC_IDS);
  });

  it("charges once for a replayed request ID", async () => {
    const session = await newSession();
    setWallet(session, 100, 5);
    const requestId = randomUUID();
    const first = await post(session, SHOP_BUY_COSMETIC_PATH, buy("pants_work", requestId));
    const replay = await post(session, SHOP_BUY_COSMETIC_PATH, buy("pants_work", requestId));
    expect(replay.json()).toEqual(first.json());
    expect((await getFarm(session)).coins).toBe(10);
    await expectError(await post(session, SHOP_BUY_COSMETIC_PATH, buy("pants_work")), 409, "ALREADY_OWNED");
  });

  it.each<[string, unknown]>([
    ["unknown cosmetic", buy("cape")],
    ["a decoration", buy("fence")],
    ["a price from the client", { ...buy("pants_work"), price: 0 }],
  ])("rejects %s", async (label, payload) => {
    const session = await newSession();
    setWallet(session, 100, 5);
    const response = await post(session, SHOP_BUY_COSMETIC_PATH, payload as object);
    if (label === "a price from the client") {
      // Extra fields are ignored; the server price is charged.
      expect(response.json<BuyCosmeticResponse>().bought.price).toBe(90);
    } else {
      await expectError(response, 400, "INVALID_REQUEST");
    }
  });
});
