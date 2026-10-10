import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FARM_HARVEST_PATH,
  FARM_PATH,
  FARM_PLANT_PATH,
  FARM_REFILL_SEEDS_PATH,
  SESSION_PATH,
  isFarmState,
  isHarvestResponse,
  isSessionResponse,
  type FarmState,
  type SessionResponse,
} from "@farmverse/shared/api";
import { SEED_REFILL_COOLDOWN_MS } from "@farmverse/shared/farming";
import { buildApp } from "../app.js";
import type { ServerConfig } from "../config.js";
import { hashToken } from "../players/session.js";
import { openDatabase, transaction } from "../storage/database.js";

const T = 1_700_000_000_000;
const WHEAT_MS = 30_000;

let time = T;
let dir: string;
let dbPath: string;
let app: FastifyInstance;

function config(): ServerConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    clientOrigin: "http://localhost:5173",
    logLevel: "silent",
    databasePath: dbPath,
  };
}

beforeEach(() => {
  time = T;
  dir = mkdtempSync(join(tmpdir(), "farmverse-api-"));
  dbPath = join(dir, "farm.db");
  app = buildApp(config(), { now: () => time });
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

async function newSession(): Promise<SessionResponse> {
  const response = await app.inject({ method: "POST", url: SESSION_PATH });
  expect(response.statusCode).toBe(201);
  return response.json<SessionResponse>();
}

function auth(session: SessionResponse): Record<string, string> {
  return { authorization: `Bearer ${session.token}` };
}

async function getFarm(session: SessionResponse): Promise<FarmState> {
  const response = await app.inject({ method: "GET", url: FARM_PATH, headers: auth(session) });
  expect(response.statusCode).toBe(200);
  return response.json<FarmState>();
}

function post(session: SessionResponse, url: string, payload: unknown) {
  return app.inject({ method: "POST", url, headers: auth(session), payload: payload as object });
}

const plantBody = (plotIndex: number, cropId: string, requestId: string = randomUUID()) => ({
  requestId,
  plotIndex,
  cropId,
});
const harvestBody = (plotIndex: number, requestId: string = randomUUID()) => ({ requestId, plotIndex });

function quantity(farm: FarmState, itemId: string): number {
  return farm.inventory.find((entry) => entry.itemId === itemId)?.quantity ?? 0;
}

/** Runs SQL against the same database file (test setup only). */
function withDb(work: (db: ReturnType<typeof openDatabase>) => void): void {
  const db = openDatabase(dbPath);
  try {
    transaction(db, () => work(db));
  } finally {
    db.close();
  }
}

describe("POST /api/session", () => {
  it("creates a guest player with a token and a starter farm", async () => {
    const session = await newSession();

    expect(isSessionResponse(session)).toBe(true);
    const farm = await getFarm(session);
    expect(isFarmState(farm)).toBe(true);
    expect(farm.plots.every((plot) => plot.crop === null)).toBe(true);
    expect(farm.inventory).toEqual([
      { itemId: "wheat_seed", quantity: 5 },
      { itemId: "carrot_seed", quantity: 5 },
      { itemId: "tomato_seed", quantity: 5 },
    ]);
    expect([farm.coins, farm.xp]).toEqual([0, 0]);
    expect(farm.serverTime).toBe(T);
  });

  it("creates distinct players and tokens", async () => {
    const a = await newSession();
    const b = await newSession();

    expect(a.playerId).not.toBe(b.playerId);
    expect(a.token).not.toBe(b.token);
  });

  it("stores only the token hash", async () => {
    const session = await newSession();

    const db = openDatabase(dbPath);
    const row = db.prepare("SELECT token_hash FROM players WHERE id = ?").get(session.playerId);
    db.close();
    expect(row?.["token_hash"]).toBe(hashToken(session.token));
    expect(row?.["token_hash"]).not.toContain(session.token);
  });
});

describe("authentication", () => {
  it.each<[string, Record<string, string>]>([
    ["no header", {}],
    ["wrong scheme", { authorization: "Basic abc" }],
    ["malformed token", { authorization: "Bearer not-a-token" }],
    ["unknown token", { authorization: `Bearer ${"A".repeat(43)}` }],
  ])("rejects %s with 401 UNAUTHORIZED", async (_label, headers) => {
    const responses = await Promise.all([
      app.inject({ method: "GET", url: FARM_PATH, headers }),
      app.inject({ method: "POST", url: FARM_PLANT_PATH, headers, payload: plantBody(0, "wheat") }),
      app.inject({ method: "POST", url: FARM_HARVEST_PATH, headers, payload: harvestBody(0) }),
      app.inject({ method: "POST", url: FARM_REFILL_SEEDS_PATH, headers, payload: { requestId: randomUUID() } }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("only ever acts on the token owner's farm", async () => {
    const alice = await newSession();
    const bob = await newSession();

    // A playerId in the body is ignored; the token decides the farm.
    const response = await post(bob, FARM_PLANT_PATH, { ...plantBody(0, "wheat"), playerId: alice.playerId });

    expect(response.statusCode).toBe(200);
    expect((await getFarm(bob)).plots[0]?.crop).not.toBeNull();
    expect((await getFarm(alice)).plots[0]?.crop).toBeNull();
  });
});

describe("POST /api/farm/plant", () => {
  it("plants at server time and uses one seed", async () => {
    const session = await newSession();
    time = T + 5;

    const response = await post(session, FARM_PLANT_PATH, { ...plantBody(2, "carrot"), plantedAt: 0 });

    expect(response.statusCode).toBe(200);
    const farm = response.json<FarmState>();
    expect(isFarmState(farm)).toBe(true);
    expect(farm.plots[2]?.crop).toEqual({ cropId: "carrot", plantedAt: T + 5, readyAt: T + 5 + 120_000 });
    expect(quantity(farm, "carrot_seed")).toBe(4);
    expect(await getFarm(session)).toEqual(farm);
  });

  it("rejects an occupied plot with 409 PLOT_NOT_EMPTY", async () => {
    const session = await newSession();
    await post(session, FARM_PLANT_PATH, plantBody(0, "wheat"));

    const response = await post(session, FARM_PLANT_PATH, plantBody(0, "tomato"));

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "PLOT_NOT_EMPTY" });
    expect(quantity(await getFarm(session), "tomato_seed")).toBe(5);
  });

  it("rejects a locked plot or crop with 409 LEVEL_TOO_LOW and changes nothing", async () => {
    const session = await newSession();

    for (const body of [plantBody(6, "wheat"), plantBody(0, "corn"), plantBody(0, "strawberry")]) {
      const response = await post(session, FARM_PLANT_PATH, body);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "LEVEL_TOO_LOW" });
    }
    const farm = await getFarm(session);
    expect(farm.plots.every((plot) => plot.crop === null)).toBe(true);
    expect(quantity(farm, "wheat_seed")).toBe(5);
  });

  it("rejects a crop without seeds with 409 ITEM_NOT_OWNED", async () => {
    const session = await newSession();
    for (let plot = 0; plot < 5; plot++) {
      expect((await post(session, FARM_PLANT_PATH, plantBody(plot, "wheat"))).statusCode).toBe(200);
    }

    const response = await post(session, FARM_PLANT_PATH, plantBody(5, "wheat"));

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "ITEM_NOT_OWNED" });
  });

  it.each<[string, unknown]>([
    ["missing cropId", { requestId: randomUUID(), plotIndex: 0 }],
    ["unknown crop", plantBody(0, "rice")],
    ["plot index 9", plantBody(9, "wheat")],
    ["fractional plot index", plantBody(1.5, "wheat")],
    ["uppercase request ID", plantBody(0, "wheat", randomUUID().toUpperCase())],
    ["non-UUID request ID", plantBody(0, "wheat", "request-1")],
    ["array body", [0, "wheat"]],
  ])("rejects %s with 400 INVALID_REQUEST", async (_label, payload) => {
    const session = await newSession();

    const response = await post(session, FARM_PLANT_PATH, payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "INVALID_REQUEST" });
    expect(quantity(await getFarm(session), "wheat_seed")).toBe(5);
  });

  it("rejects malformed JSON with 400 INVALID_REQUEST", async () => {
    const session = await newSession();

    const response = await app.inject({
      method: "POST",
      url: FARM_PLANT_PATH,
      headers: { ...auth(session), "content-type": "application/json" },
      payload: "{bad json",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: "INVALID_REQUEST", message: "Invalid request" });
  });

  it("rejects a body larger than the limit", async () => {
    const session = await newSession();

    const response = await post(session, FARM_PLANT_PATH, { ...plantBody(0, "wheat"), padding: "x".repeat(2000) });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ code: "INVALID_REQUEST" });
  });
});

describe("POST /api/farm/harvest", () => {
  it("rejects an empty plot and an unripe crop, then harvests with rewards", async () => {
    const session = await newSession();
    await post(session, FARM_PLANT_PATH, plantBody(1, "wheat"));

    const empty = await post(session, FARM_HARVEST_PATH, harvestBody(0));
    expect(empty.statusCode).toBe(409);
    expect(empty.json()).toMatchObject({ code: "PLOT_EMPTY" });

    time = T + WHEAT_MS - 1;
    const early = await post(session, FARM_HARVEST_PATH, harvestBody(1));
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({ code: "CROP_NOT_READY" });

    time = T + WHEAT_MS;
    const response = await post(session, FARM_HARVEST_PATH, harvestBody(1));
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(isHarvestResponse(body)).toBe(true);
    expect(body).toMatchObject({
      harvested: { itemId: "wheat_produce", quantity: 1 },
      reward: { coins: 2, xp: 1 },
      coins: 2,
      xp: 1,
    });
    expect(body.plots[1].crop).toBeNull();
    expect(quantity(body, "wheat_produce")).toBe(1);
  });
});

describe("request ID idempotency", () => {
  it("replays a successful action without applying it again", async () => {
    const session = await newSession();
    const body = plantBody(0, "wheat");

    const first = await post(session, FARM_PLANT_PATH, body);
    time = T + 1000;
    const replay = await post(session, FARM_PLANT_PATH, body);

    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(quantity(await getFarm(session), "wheat_seed")).toBe(4);
  });

  it("replays a harvest without a second reward", async () => {
    const session = await newSession();
    await post(session, FARM_PLANT_PATH, plantBody(0, "wheat"));
    time = T + WHEAT_MS;
    const body = harvestBody(0);

    const first = await post(session, FARM_HARVEST_PATH, body);
    const replay = await post(session, FARM_HARVEST_PATH, body);

    expect(replay.json()).toEqual(first.json());
    const farm = await getFarm(session);
    expect([farm.coins, farm.xp, quantity(farm, "wheat_produce")]).toEqual([2, 1, 1]);
  });

  it("rejects the same request ID with a different body or action (REQUEST_ID_REUSED)", async () => {
    const session = await newSession();
    const requestId = randomUUID();
    const first = await post(session, FARM_PLANT_PATH, plantBody(0, "wheat", requestId));

    const otherBody = await post(session, FARM_PLANT_PATH, plantBody(1, "wheat", requestId));
    const otherAction = await post(session, FARM_HARVEST_PATH, harvestBody(0, requestId));

    for (const response of [otherBody, otherAction]) {
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "REQUEST_ID_REUSED" });
    }
    // The original result is kept and still replayable.
    expect((await post(session, FARM_PLANT_PATH, plantBody(0, "wheat", requestId))).json()).toEqual(first.json());
    expect(quantity(await getFarm(session), "wheat_seed")).toBe(4);
  });

  it("does not record failed actions: a retry is evaluated again (E-1)", async () => {
    const session = await newSession();
    await post(session, FARM_PLANT_PATH, plantBody(0, "wheat"));
    const body = harvestBody(0);

    time = T + 1;
    expect((await post(session, FARM_HARVEST_PATH, body)).json()).toMatchObject({ code: "CROP_NOT_READY" });
    time = T + WHEAT_MS;
    const retry = await post(session, FARM_HARVEST_PATH, body);

    expect(retry.statusCode).toBe(200);
    expect((await getFarm(session)).coins).toBe(2);
  });

  it("scopes request IDs to the player", async () => {
    const alice = await newSession();
    const bob = await newSession();
    const requestId = randomUUID();

    expect((await post(alice, FARM_PLANT_PATH, plantBody(0, "wheat", requestId))).statusCode).toBe(200);
    expect((await post(bob, FARM_PLANT_PATH, plantBody(3, "tomato", requestId))).statusCode).toBe(200);
  });
});

describe("concurrent requests", () => {
  it("harvests a plot only once when two harvests arrive together", async () => {
    const session = await newSession();
    await post(session, FARM_PLANT_PATH, plantBody(0, "wheat"));
    time = T + WHEAT_MS;

    const responses = await Promise.all([
      post(session, FARM_HARVEST_PATH, harvestBody(0)),
      post(session, FARM_HARVEST_PATH, harvestBody(0)),
      post(session, FARM_HARVEST_PATH, harvestBody(0)),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409, 409]);
    const farm = await getFarm(session);
    expect([quantity(farm, "wheat_produce"), farm.coins, farm.xp]).toEqual([1, 2, 1]);
  });

  it("applies concurrent replays of one request ID once", async () => {
    const session = await newSession();
    const body = plantBody(0, "wheat");

    const responses = await Promise.all([1, 2, 3].map(() => post(session, FARM_PLANT_PATH, body)));

    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    expect(quantity(await getFarm(session), "wheat_seed")).toBe(4);
  });
});

describe("POST /api/farm/refill-seeds", () => {
  /** Leaves the player with no seeds and one wheat crop planted at T. */
  async function lastCropSession(): Promise<SessionResponse> {
    const session = await newSession();
    withDb((db) => {
      db.prepare("UPDATE inventory SET quantity = 0 WHERE player_id = ?").run(session.playerId);
      db.prepare("UPDATE plots SET crop_id = 'wheat', planted_at = ? WHERE player_id = ? AND plot_index = 0").run(
        T,
        session.playerId,
      );
    });
    return session;
  }

  it("refuses while seeds remain", async () => {
    const session = await newSession();

    const response = await post(session, FARM_REFILL_SEEDS_PATH, { requestId: randomUUID() });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "REFILL_NOT_ALLOWED" });
  });

  it("starts the cooldown at the last harvest and refills once it has passed", async () => {
    const session = await lastCropSession();
    const H = T + WHEAT_MS;
    time = H;
    await post(session, FARM_HARVEST_PATH, harvestBody(0));

    expect((await getFarm(session)).seedRefill).toEqual({
      eligible: true,
      availableAt: H + SEED_REFILL_COOLDOWN_MS,
    });

    time = H + SEED_REFILL_COOLDOWN_MS - 1;
    const early = await post(session, FARM_REFILL_SEEDS_PATH, { requestId: randomUUID() });
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({ code: "REFILL_NOT_ALLOWED" });

    time = H + SEED_REFILL_COOLDOWN_MS;
    const body = { requestId: randomUUID() };
    const refill = await post(session, FARM_REFILL_SEEDS_PATH, body);
    expect(refill.statusCode).toBe(200);
    const farm = refill.json<FarmState>();
    expect(["wheat_seed", "carrot_seed", "tomato_seed"].map((id) => quantity(farm, id))).toEqual([5, 5, 5]);
    expect(farm.seedRefill).toEqual({ eligible: false, availableAt: null });

    expect((await post(session, FARM_REFILL_SEEDS_PATH, body)).json()).toEqual(farm);
    const again = await post(session, FARM_REFILL_SEEDS_PATH, { requestId: randomUUID() });
    expect(again.json()).toMatchObject({ code: "REFILL_NOT_ALLOWED" });
    expect(quantity(await getFarm(session), "wheat_seed")).toBe(5);
  });

  it("grants only one refill to concurrent requests", async () => {
    const session = await lastCropSession();
    time = T + WHEAT_MS;
    await post(session, FARM_HARVEST_PATH, harvestBody(0));
    time += SEED_REFILL_COOLDOWN_MS;

    const responses = await Promise.all(
      [1, 2, 3].map(() => post(session, FARM_REFILL_SEEDS_PATH, { requestId: randomUUID() })),
    );

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409, 409]);
    expect(quantity(await getFarm(session), "wheat_seed")).toBe(5);
  });
});

describe("persistence", () => {
  it("keeps the farm after the server restarts", async () => {
    const session = await newSession();
    await post(session, FARM_PLANT_PATH, plantBody(4, "tomato"));
    const before = await getFarm(session);

    await app.close();
    app = buildApp(config(), { now: () => time });

    expect(await getFarm(session)).toEqual(before);
  });

  it("rejects corrupted stored data instead of serving it", async () => {
    const session = await newSession();
    withDb((db) => {
      db.prepare("DELETE FROM inventory WHERE player_id = ? AND item_id = 'wheat_seed'").run(session.playerId);
    });

    const response = await app.inject({ method: "GET", url: FARM_PATH, headers: auth(session) });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: "INTERNAL_ERROR", message: "Internal server error" });
  });
});
