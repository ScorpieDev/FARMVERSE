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
  QUEST_CLAIM_PATH,
  SESSION_PATH,
  isFarmState,
  isHarvestResponse,
  isQuestClaimResponse,
  type FarmState,
  type QuestClaimResponse,
  type SessionResponse,
} from "@farmverse/shared/api";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { openDatabase, transaction, type Database } from "../storage/database.js";

const T = 1_700_000_000_000;
const WHEAT_MS = 30_000;

let time = T;
let dir: string;
let dbPath: string;
let app: FastifyInstance;

beforeEach(() => {
  time = T;
  dir = mkdtempSync(join(tmpdir(), "farmverse-quests-"));
  dbPath = join(dir, "farm.db");
  const config = loadConfig({ HOST: "127.0.0.1", PORT: "0", LOG_LEVEL: "silent", DATABASE_PATH: dbPath });
  app = buildApp(config, { now: () => time });
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
  const farm = response.json<FarmState>();
  expect(isFarmState(farm)).toBe(true);
  return farm;
}

function post(session: SessionResponse, url: string, payload: unknown) {
  return app.inject({ method: "POST", url, headers: auth(session), payload: payload as object });
}

function claim(session: SessionResponse, requestId: string = randomUUID(), extra: object = {}) {
  return post(session, QUEST_CLAIM_PATH, { requestId, ...extra });
}

function quantity(farm: FarmState, itemId: string): number {
  return farm.inventory.find((entry) => entry.itemId === itemId)?.quantity ?? 0;
}

/** Runs SQL against the same database file (test setup only). */
function withDb(work: (db: Database) => void): void {
  const db = openDatabase(dbPath);
  try {
    transaction(db, () => work(db));
  } finally {
    db.close();
  }
}

function playerIdOf(session: SessionResponse): string {
  return session.playerId;
}

/** Plants wheat on plot 0 and harvests it (advances the clock). */
async function harvestWheat(session: SessionResponse): Promise<void> {
  expect((await post(session, FARM_PLANT_PATH, { requestId: randomUUID(), plotIndex: 0, cropId: "wheat" })).statusCode).toBe(200);
  time += WHEAT_MS;
  const response = await post(session, FARM_HARVEST_PATH, { requestId: randomUUID(), plotIndex: 0 });
  expect(response.statusCode).toBe(200);
  expect(isHarvestResponse(response.json())).toBe(true);
}

/** A session whose first quest (Harvest 3 Wheat) is complete. */
async function sessionWithCompleteQuest(): Promise<SessionResponse> {
  const session = await newSession();
  for (let i = 0; i < 3; i++) await harvestWheat(session);
  return session;
}

describe("progression and quest in the farm state", () => {
  it("starts a new player at level 1 with the first quest", async () => {
    const farm = await getFarm(await newSession());

    expect(farm.progression).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 50, unlockedPlotCount: 6 });
    expect(farm.quest).toEqual({
      id: "harvest_wheat_3",
      title: "Harvest 3 Wheat",
      progress: 0,
      target: 3,
      complete: false,
      reward: { coins: 10, xp: 5 },
    });
  });

  it("counts a harvest towards the active quest in the same response, but not a plant", async () => {
    const session = await newSession();

    const planted = await post(session, FARM_PLANT_PATH, { requestId: randomUUID(), plotIndex: 0, cropId: "wheat" });
    expect(planted.json<FarmState>().quest?.progress).toBe(0);

    time += WHEAT_MS;
    const harvested = await post(session, FARM_HARVEST_PATH, { requestId: randomUUID(), plotIndex: 0 });
    expect(harvested.json<FarmState>().quest?.progress).toBe(1);
    expect((await getFarm(session)).quest?.progress).toBe(1);
  });

  it("does not count harvests of other crops", async () => {
    const session = await newSession();
    await post(session, FARM_PLANT_PATH, { requestId: randomUUID(), plotIndex: 0, cropId: "carrot" });
    time += 120_000;
    await post(session, FARM_HARVEST_PATH, { requestId: randomUUID(), plotIndex: 0 });

    expect((await getFarm(session)).quest?.progress).toBe(0);
  });

  it("counts a plant towards a plant quest", async () => {
    const session = await newSession();
    withDb((db) => db.prepare("UPDATE quest_state SET quest_index = 1, progress = 0 WHERE player_id = ?").run(playerIdOf(session)));

    const response = await post(session, FARM_PLANT_PATH, { requestId: randomUUID(), plotIndex: 0, cropId: "carrot" });

    expect(response.json<FarmState>().quest).toMatchObject({ id: "plant_carrot_1", progress: 1, complete: true });
  });

  it("does not count a replayed harvest twice", async () => {
    const session = await newSession();
    await post(session, FARM_PLANT_PATH, { requestId: randomUUID(), plotIndex: 0, cropId: "wheat" });
    time += WHEAT_MS;
    const requestId = randomUUID();
    await post(session, FARM_HARVEST_PATH, { requestId, plotIndex: 0 });
    await post(session, FARM_HARVEST_PATH, { requestId, plotIndex: 0 });

    expect((await getFarm(session)).quest?.progress).toBe(1);
  });
});

describe("POST /api/quests/claim", () => {
  it("pays the server's reward once and moves to the next quest", async () => {
    const session = await sessionWithCompleteQuest();
    const before = await getFarm(session);
    expect(before.quest).toMatchObject({ progress: 3, complete: true });

    const response = await claim(session);

    expect(response.statusCode).toBe(200);
    const body = response.json<QuestClaimResponse>();
    expect(isQuestClaimResponse(body)).toBe(true);
    expect(body.claimed).toEqual({ questId: "harvest_wheat_3", reward: { coins: 10, xp: 5 } });
    expect(body.coins).toBe(before.coins + 10);
    expect(body.xp).toBe(before.xp + 5);
    expect(body.quest).toMatchObject({ id: "plant_carrot_1", progress: 0, complete: false });
    expect(await getFarm(session)).toMatchObject({ coins: body.coins, xp: body.xp, quest: body.quest });
  });

  it("refuses an incomplete quest with 409 QUEST_NOT_COMPLETE and changes nothing", async () => {
    const session = await newSession();
    await harvestWheat(session);
    const before = await getFarm(session);

    const response = await claim(session);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "QUEST_NOT_COMPLETE" });
    expect(await getFarm(session)).toEqual(before);
  });

  it("ignores any reward or quest sent by the client", async () => {
    const session = await sessionWithCompleteQuest();
    const before = await getFarm(session);

    const response = await claim(session, randomUUID(), { questId: "reach_level_5", reward: { coins: 99_999, xp: 99_999 }, coins: 1e6 });

    expect(response.statusCode).toBe(200);
    expect(response.json<QuestClaimResponse>()).toMatchObject({
      claimed: { questId: "harvest_wheat_3", reward: { coins: 10, xp: 5 } },
      coins: before.coins + 10,
      xp: before.xp + 5,
    });
  });

  it("replays a claim with the same request ID without paying again", async () => {
    const session = await sessionWithCompleteQuest();
    const requestId = randomUUID();

    const first = await claim(session, requestId);
    const second = await claim(session, requestId);

    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect((await getFarm(session)).coins).toBe(first.json<QuestClaimResponse>().coins);
  });

  it("refuses a second claim with a new request ID once the quest was claimed", async () => {
    const session = await sessionWithCompleteQuest();
    const first = await claim(session);

    const second = await claim(session);

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: "QUEST_NOT_COMPLETE" });
    expect((await getFarm(session)).coins).toBe(first.json<QuestClaimResponse>().coins);
  });

  it("pays once when two claims with different request IDs arrive together", async () => {
    const session = await sessionWithCompleteQuest();
    const before = await getFarm(session);

    const responses = await Promise.all([claim(session), claim(session), claim(session)]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409, 409]);
    expect((await getFarm(session)).coins).toBe(before.coins + 10);
  });

  it("pays once when the same claim is sent twice at the same time", async () => {
    const session = await sessionWithCompleteQuest();
    const before = await getFarm(session);
    const requestId = randomUUID();

    const [a, b] = await Promise.all([claim(session, requestId), claim(session, requestId)]);

    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(a.json()).toEqual(b.json());
    expect((await getFarm(session)).coins).toBe(before.coins + 10);
  });

  it("evaluates a failed claim again on retry with the same request ID (failures are not recorded)", async () => {
    const session = await newSession();
    const requestId = randomUUID();
    expect((await claim(session, requestId)).statusCode).toBe(409);

    for (let i = 0; i < 3; i++) await harvestWheat(session);

    expect((await claim(session, requestId)).statusCode).toBe(200);
  });

  it("rejects a request ID already used by another action (REQUEST_ID_REUSED)", async () => {
    const session = await sessionWithCompleteQuest();
    const requestId = randomUUID();
    await post(session, FARM_PLANT_PATH, { requestId, plotIndex: 1, cropId: "carrot" });

    const response = await claim(session, requestId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "REQUEST_ID_REUSED" });
  });

  it.each<[string, unknown]>([
    ["missing request ID", {}],
    ["non-UUID request ID", { requestId: "claim-1" }],
    ["uppercase request ID", { requestId: randomUUID().toUpperCase() }],
    ["array body", [randomUUID()]],
  ])("rejects %s with 400 INVALID_REQUEST", async (_label, payload) => {
    const session = await sessionWithCompleteQuest();
    const before = await getFarm(session);

    const response = await post(session, QUEST_CLAIM_PATH, payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "INVALID_REQUEST" });
    expect(await getFarm(session)).toEqual(before);
  });

  it("requires a valid session token", async () => {
    const response = await app.inject({ method: "POST", url: QUEST_CLAIM_PATH, payload: { requestId: randomUUID() } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("claims a reach-level quest from XP and refuses it below that level", async () => {
    const session = await newSession();
    withDb((db) => {
      db.prepare("UPDATE quest_state SET quest_index = 4, progress = 0 WHERE player_id = ?").run(playerIdOf(session));
      db.prepare("UPDATE players SET xp = 149 WHERE id = ?").run(playerIdOf(session));
    });
    expect((await claim(session)).statusCode).toBe(409);

    withDb((db) => db.prepare("UPDATE players SET xp = 150 WHERE id = ?").run(playerIdOf(session)));
    const response = await claim(session);

    expect(response.statusCode).toBe(200);
    expect(response.json<QuestClaimResponse>().claimed.questId).toBe("reach_level_3");
  });

  it("levels up from a claim: new level, unlocked plot count and the unlocked crop's seeds", async () => {
    const session = await newSession();
    withDb((db) => {
      db.prepare("UPDATE quest_state SET quest_index = 3, progress = 1 WHERE player_id = ?").run(playerIdOf(session));
      db.prepare("UPDATE players SET xp = 140 WHERE id = ?").run(playerIdOf(session));
    });

    const body = (await claim(session)).json<QuestClaimResponse>();

    expect(body.xp).toBe(150);
    expect(body.progression).toEqual({ level: 3, xpIntoLevel: 0, xpForNextLevel: 150, unlockedPlotCount: 7 });
    expect(quantity(body, "corn_seed")).toBe(5);
    const planted = await post(session, FARM_PLANT_PATH, { requestId: randomUUID(), plotIndex: 6, cropId: "corn" });
    expect(planted.statusCode).toBe(200);
  });

  it("refuses to claim once the whole chain is finished", async () => {
    const session = await newSession();
    withDb((db) => db.prepare("UPDATE quest_state SET quest_index = 8, progress = 0 WHERE player_id = ?").run(playerIdOf(session)));

    expect((await getFarm(session)).quest).toBeNull();
    expect((await claim(session)).statusCode).toBe(409);
  });
});

describe("failures inside the transaction", () => {
  /** Makes every quest_state update fail, as an I/O error after the farm was saved would. */
  function breakQuestSaves(): void {
    withDb((db) =>
      db.exec("CREATE TRIGGER fail_quest_save BEFORE UPDATE ON quest_state BEGIN SELECT RAISE(ABORT, 'disk error'); END"),
    );
  }

  function repairQuestSaves(): void {
    withDb((db) => db.exec("DROP TRIGGER fail_quest_save"));
  }

  it("rolls back a harvest completely when saving the quest fails, and the retry applies it once", async () => {
    const session = await newSession();
    await post(session, FARM_PLANT_PATH, { requestId: randomUUID(), plotIndex: 0, cropId: "wheat" });
    time += WHEAT_MS;
    const before = await getFarm(session);
    breakQuestSaves();
    const requestId = randomUUID();

    const failed = await post(session, FARM_HARVEST_PATH, { requestId, plotIndex: 0 });

    expect(failed.statusCode).toBe(500);
    expect(failed.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(await getFarm(session)).toEqual(before); // crop, produce, coins, XP, quest unchanged

    repairQuestSaves();
    const retried = await post(session, FARM_HARVEST_PATH, { requestId, plotIndex: 0 });
    expect(retried.statusCode).toBe(200);
    const after = await getFarm(session);
    expect(after.xp).toBe(before.xp + 1);
    expect(quantity(after, "wheat_produce")).toBe(1);
    expect(after.quest?.progress).toBe(1);
  });

  it("rolls back a claim completely when saving fails, so the reward is never lost or doubled", async () => {
    const session = await sessionWithCompleteQuest();
    const before = await getFarm(session);
    breakQuestSaves();
    const requestId = randomUUID();

    expect((await claim(session, requestId)).statusCode).toBe(500);
    expect(await getFarm(session)).toEqual(before);

    repairQuestSaves();
    expect((await claim(session, requestId)).statusCode).toBe(200);
    expect((await claim(session, requestId)).statusCode).toBe(200);
    expect((await getFarm(session)).coins).toBe(before.coins + 10);
  });
});
