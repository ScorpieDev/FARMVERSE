import { describe, expect, it } from "vitest";
import {
  isFarmState,
  isHarvestRequest,
  isHarvestResponse,
  isHealthResponse,
  isPlantRequest,
  isQuestClaimRequest,
  isQuestClaimResponse,
  isQuestView,
  isRefillSeedsRequest,
  isRequestId,
  isSeedRefillState,
  isSessionResponse,
} from "./api.js";

describe("isHealthResponse", () => {
  it("accepts a valid health response", () => {
    expect(
      isHealthResponse({ status: "ok", version: "0.0.0", serverTime: 1_700_000_000_000 }),
    ).toBe(true);
  });

  it("ignores extra fields", () => {
    expect(
      isHealthResponse({ status: "ok", version: "1.2.3", serverTime: 0, extra: true }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["array", []],
    ["string", "ok"],
    ["missing status", { version: "0.0.0", serverTime: 0 }],
    ["status not ok", { status: "down", version: "0.0.0", serverTime: 0 }],
    ["missing version", { status: "ok", serverTime: 0 }],
    ["numeric version", { status: "ok", version: 1, serverTime: 0 }],
    ["missing serverTime", { status: "ok", version: "0.0.0" }],
    ["string serverTime", { status: "ok", version: "0.0.0", serverTime: "0" }],
    ["negative serverTime", { status: "ok", version: "0.0.0", serverTime: -1 }],
    ["infinite serverTime", { status: "ok", version: "0.0.0", serverTime: Infinity }],
    ["NaN serverTime", { status: "ok", version: "0.0.0", serverTime: NaN }],
  ])("rejects %s", (_label, value) => {
    expect(isHealthResponse(value)).toBe(false);
  });
});

const REQUEST_ID = "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7b9e0f12";
const TOKEN = "A".repeat(40) + "-_9";

/** A valid farm: plot 0 growing wheat, the rest empty. */
function farm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    serverTime: 1_700_000_010_000,
    plots: [
      { index: 0, crop: { cropId: "wheat", plantedAt: 1_700_000_000_000, readyAt: 1_700_000_030_000 } },
      { index: 1, crop: null },
      { index: 2, crop: null },
      { index: 3, crop: null },
      { index: 4, crop: null },
      { index: 5, crop: null },
      { index: 6, crop: null },
      { index: 7, crop: null },
      { index: 8, crop: null },
    ],
    inventory: [
      { itemId: "wheat_seed", quantity: 4 },
      { itemId: "carrot_seed", quantity: 5 },
    ],
    seedRefill: { eligible: false, availableAt: null },
    coins: 0,
    xp: 0,
    progression: { level: 1, xpIntoLevel: 0, xpForNextLevel: 50, unlockedPlotCount: 6 },
    quest: {
      id: "harvest_wheat_3",
      title: "Harvest 3 Wheat",
      progress: 1,
      target: 3,
      complete: false,
      reward: { coins: 10, xp: 5 },
    },
    ...overrides,
  };
}

function withPlot(index: number, plot: unknown): Record<string, unknown> {
  const plots = [...(farm()["plots"] as unknown[])];
  plots[index] = plot;
  return farm({ plots });
}

describe("isRequestId", () => {
  it("accepts a lowercase UUID v4", () => {
    expect(isRequestId(REQUEST_ID)).toBe(true);
    expect(isRequestId("00000000-0000-4000-8000-000000000000")).toBe(true);
    expect(isRequestId("ffffffff-ffff-4fff-bfff-ffffffffffff")).toBe(true);
  });

  it.each([
    ["uppercase", REQUEST_ID.toUpperCase()],
    ["version 1", "3f2b8c1e-9a4d-1f6b-8e2a-1c5d7b9e0f12"],
    ["wrong variant", "3f2b8c1e-9a4d-4f6b-ce2a-1c5d7b9e0f12"],
    ["no dashes", REQUEST_ID.replaceAll("-", "")],
    ["braces", `{${REQUEST_ID}}`],
    ["too long", `${REQUEST_ID}0`],
    ["non-hex", "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7b9e0f1g"],
    ["empty", ""],
    ["number", 123],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(isRequestId(value)).toBe(false);
  });
});

describe("request validators", () => {
  it("accept valid bodies and ignore extra fields", () => {
    expect(isPlantRequest({ requestId: REQUEST_ID, plotIndex: 0, cropId: "wheat" })).toBe(true);
    expect(
      isPlantRequest({ requestId: REQUEST_ID, plotIndex: 5, cropId: "tomato", extra: 1 }),
    ).toBe(true);
    expect(isHarvestRequest({ requestId: REQUEST_ID, plotIndex: 3 })).toBe(true);
    expect(isRefillSeedsRequest({ requestId: REQUEST_ID })).toBe(true);
  });

  it.each([
    ["missing requestId", { plotIndex: 0, cropId: "wheat" }],
    ["missing plotIndex", { requestId: REQUEST_ID, cropId: "wheat" }],
    ["missing cropId", { requestId: REQUEST_ID, plotIndex: 0 }],
    ["plotIndex -1", { requestId: REQUEST_ID, plotIndex: -1, cropId: "wheat" }],
    ["plotIndex 9", { requestId: REQUEST_ID, plotIndex: 9, cropId: "wheat" }],
    ["plotIndex 1.5", { requestId: REQUEST_ID, plotIndex: 1.5, cropId: "wheat" }],
    ["plotIndex string", { requestId: REQUEST_ID, plotIndex: "1", cropId: "wheat" }],
    ["unknown cropId", { requestId: REQUEST_ID, plotIndex: 0, cropId: "rice" }],
    ["wrong-case cropId", { requestId: REQUEST_ID, plotIndex: 0, cropId: "Wheat" }],
    ["item id as cropId", { requestId: REQUEST_ID, plotIndex: 0, cropId: "wheat_seed" }],
    ["invalid requestId", { requestId: "abc", plotIndex: 0, cropId: "wheat" }],
    ["null", null],
    ["array", [REQUEST_ID, 0, "wheat"]],
    ["string", "plant"],
  ])("isPlantRequest rejects %s", (_label, value) => {
    expect(isPlantRequest(value)).toBe(false);
  });

  it.each([
    ["missing requestId", { plotIndex: 0 }],
    ["missing plotIndex", { requestId: REQUEST_ID }],
    ["plotIndex 9", { requestId: REQUEST_ID, plotIndex: 9 }],
    ["plotIndex NaN", { requestId: REQUEST_ID, plotIndex: NaN }],
    ["invalid requestId", { requestId: REQUEST_ID.toUpperCase(), plotIndex: 0 }],
    ["null", null],
    ["array", []],
  ])("isHarvestRequest rejects %s", (_label, value) => {
    expect(isHarvestRequest(value)).toBe(false);
  });

  it.each([
    ["missing requestId", {}],
    ["invalid requestId", { requestId: "not-a-uuid" }],
    ["numeric requestId", { requestId: 1 }],
    ["null", null],
    ["string", REQUEST_ID],
  ])("isRefillSeedsRequest rejects %s", (_label, value) => {
    expect(isRefillSeedsRequest(value)).toBe(false);
  });
});

describe("isSessionResponse", () => {
  it("accepts a UUID v4 player ID and a 43-character base64url token", () => {
    expect(isSessionResponse({ playerId: REQUEST_ID, token: TOKEN })).toBe(true);
  });

  it.each([
    ["non-UUID playerId", { playerId: "player-1", token: TOKEN }],
    ["uppercase playerId", { playerId: REQUEST_ID.toUpperCase(), token: TOKEN }],
    ["token too short", { playerId: REQUEST_ID, token: TOKEN.slice(1) }],
    ["token too long", { playerId: REQUEST_ID, token: `${TOKEN}A` }],
    ["token with +", { playerId: REQUEST_ID, token: `${TOKEN.slice(1)}+` }],
    ["token with /", { playerId: REQUEST_ID, token: `${TOKEN.slice(1)}/` }],
    ["token with padding", { playerId: REQUEST_ID, token: `${TOKEN.slice(1)}=` }],
    ["missing token", { playerId: REQUEST_ID }],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(isSessionResponse(value)).toBe(false);
  });
});

describe("isSeedRefillState", () => {
  it.each([
    ["not eligible", { eligible: false, availableAt: null }],
    ["eligible, waiting or available", { eligible: true, availableAt: 1_700_000_060_000 }],
    ["eligible at time 0", { eligible: true, availableAt: 0 }],
  ])("accepts %s", (_label, value) => {
    expect(isSeedRefillState(value)).toBe(true);
  });

  it.each([
    ["not eligible with a time", { eligible: false, availableAt: 1_700_000_060_000 }],
    ["eligible without a time", { eligible: true, availableAt: null }],
    ["negative time", { eligible: true, availableAt: -1 }],
    ["fractional time", { eligible: true, availableAt: 1.5 }],
    ["missing availableAt", { eligible: false }],
    ["missing eligible", { availableAt: null }],
    ["non-boolean eligible", { eligible: "yes", availableAt: null }],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(isSeedRefillState(value)).toBe(false);
  });
});

describe("isFarmState", () => {
  it("accepts a valid farm", () => {
    expect(isFarmState(farm())).toBe(true);
  });

  it("accepts an empty inventory, another crop type and an eligible refill", () => {
    expect(
      isFarmState(
        farm({
          inventory: [],
          seedRefill: { eligible: true, availableAt: 1_700_000_070_000 },
        }),
      ),
    ).toBe(true);
    expect(
      isFarmState(
        withPlot(1, {
          index: 1,
          crop: { cropId: "tomato", plantedAt: 1, readyAt: 300_001 },
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ["5 plots", farm({ plots: (farm()["plots"] as unknown[]).slice(0, 5) })],
    ["7 plots", farm({ plots: [...(farm()["plots"] as unknown[]), { index: 6, crop: null }] })],
    ["plot index out of order", withPlot(2, { index: 3, crop: null })],
    ["plot without crop field", withPlot(2, { index: 2 })],
    ["null plot", withPlot(2, null)],
    ["unknown cropId", withPlot(1, { index: 1, crop: { cropId: "rice", plantedAt: 0, readyAt: 1 } })],
    ["readyAt before plantedAt", withPlot(1, { index: 1, crop: { cropId: "wheat", plantedAt: 10, readyAt: 9 } })],
    ["negative plantedAt", withPlot(1, { index: 1, crop: { cropId: "wheat", plantedAt: -1, readyAt: 1 } })],
    ["fractional plantedAt", withPlot(1, { index: 1, crop: { cropId: "wheat", plantedAt: 0.5, readyAt: 1 } })],
    ["zero quantity", farm({ inventory: [{ itemId: "wheat_seed", quantity: 0 }] })],
    ["negative quantity", farm({ inventory: [{ itemId: "wheat_seed", quantity: -1 }] })],
    ["fractional quantity", farm({ inventory: [{ itemId: "wheat_seed", quantity: 1.5 }] })],
    ["duplicate itemId", farm({ inventory: [{ itemId: "wheat_seed", quantity: 1 }, { itemId: "wheat_seed", quantity: 2 }] })],
    ["unknown itemId", farm({ inventory: [{ itemId: "rice_seed", quantity: 1 }] })],
    ["crop id as itemId", farm({ inventory: [{ itemId: "wheat", quantity: 1 }] })],
    ["missing seedRefill", farm({ seedRefill: undefined })],
    ["invalid seedRefill", farm({ seedRefill: { eligible: true, availableAt: null } })],
    ["negative serverTime", farm({ serverTime: -1 })],
    ["fractional serverTime", farm({ serverTime: 1.5 })],
    ["plots not an array", farm({ plots: {} })],
    ["inventory not an array", farm({ inventory: {} })],
    ["missing coins", farm({ coins: undefined })],
    ["negative coins", farm({ coins: -1 })],
    ["fractional xp", farm({ xp: 0.5 })],
    ["string xp", farm({ xp: "3" })],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(isFarmState(value)).toBe(false);
  });
});

const REWARD = { coins: 2, xp: 1 };

describe("isHarvestResponse", () => {
  it.each(["wheat_produce", "carrot_produce", "tomato_produce"])(
    "accepts a farm state with harvested %s",
    (itemId) => {
      expect(isHarvestResponse({ ...farm(), reward: REWARD, harvested: { itemId, quantity: 1 } })).toBe(true);
    },
  );

  it.each([
    ["missing harvested", { ...farm(), reward: REWARD }],
    ["null harvested", { ...farm(), reward: REWARD, harvested: null }],
    ["wheat_seed instead of produce", { ...farm(), reward: REWARD, harvested: { itemId: "wheat_seed", quantity: 1 } }],
    ["carrot_seed instead of produce", { ...farm(), reward: REWARD, harvested: { itemId: "carrot_seed", quantity: 1 } }],
    ["tomato_seed instead of produce", { ...farm(), reward: REWARD, harvested: { itemId: "tomato_seed", quantity: 1 } }],
    ["crop id instead of item id", { ...farm(), reward: REWARD, harvested: { itemId: "wheat", quantity: 1 } }],
    ["unknown item", { ...farm(), reward: REWARD, harvested: { itemId: "rice_produce", quantity: 1 } }],
    ["zero quantity", { ...farm(), reward: REWARD, harvested: { itemId: "wheat_produce", quantity: 0 } }],
    ["fractional quantity", { ...farm(), reward: REWARD, harvested: { itemId: "wheat_produce", quantity: 1.5 } }],
    ["missing quantity", { ...farm(), reward: REWARD, harvested: { itemId: "wheat_produce" } }],
    ["missing reward", { ...farm(), harvested: { itemId: "wheat_produce", quantity: 1 } }],
    ["negative reward coins", { ...farm(), reward: { coins: -1, xp: 1 }, harvested: { itemId: "wheat_produce", quantity: 1 } }],
    ["fractional reward xp", { ...farm(), reward: { coins: 2, xp: 0.5 }, harvested: { itemId: "wheat_produce", quantity: 1 } }],
    ["invalid farm state", { ...farm({ plots: [] }), reward: REWARD, harvested: { itemId: "wheat_produce", quantity: 1 } }],
  ])("rejects %s", (_label, value) => {
    expect(isHarvestResponse(value)).toBe(false);
  });
});

describe("seedRefill uses server time only", () => {
  it("accepts a cooldown that ends after serverTime (refill not allowed yet)", () => {
    const state = farm({
      inventory: [],
      plots: (farm()["plots"] as Array<Record<string, unknown>>).map((plot) => ({ ...plot, crop: null })),
      seedRefill: { eligible: true, availableAt: 1_700_000_010_000 + 60_000 },
    });
    expect(isFarmState(state)).toBe(true);
  });

  it("accepts a cooldown that already ended (refill allowed by the server)", () => {
    const state = farm({ seedRefill: { eligible: true, availableAt: 1_700_000_000_000 } });
    expect(isFarmState(state)).toBe(true);
  });

  it("ignores time fields sent by the client: only requestId is read", () => {
    expect(isRefillSeedsRequest({ requestId: REQUEST_ID, availableAt: 0, now: 0 })).toBe(true);
    expect(isRefillSeedsRequest({ availableAt: 0 })).toBe(false);
  });
});

describe("progression and quest in FarmState (Phase 2)", () => {
  const QUEST = farm()["quest"] as Record<string, unknown>;

  it("accepts consistent level progress, a finished quest chain and the maximum level", () => {
    expect(isFarmState(farm())).toBe(true);
    expect(isFarmState(farm({ quest: null }))).toBe(true);
    expect(
      isFarmState(
        farm({ xp: 190, progression: { level: 3, xpIntoLevel: 40, xpForNextLevel: 150, unlockedPlotCount: 7 } }),
      ),
    ).toBe(true);
    expect(
      isFarmState(
        farm({ xp: 2300, progression: { level: 10, xpIntoLevel: 50, xpForNextLevel: null, unlockedPlotCount: 9 } }),
      ),
    ).toBe(true);
  });

  it.each<[string, Record<string, unknown>]>([
    ["missing progression", { progression: undefined }],
    ["missing quest", { quest: undefined }],
    ["level that does not match XP", { xp: 60 }],
    ["wrong XP into level", { progression: { level: 1, xpIntoLevel: 3, xpForNextLevel: 50, unlockedPlotCount: 6 } }],
    ["null next-level XP below the maximum", { progression: { level: 1, xpIntoLevel: 0, xpForNextLevel: null, unlockedPlotCount: 6 } }],
    ["unlocked plots beyond the level", { progression: { level: 1, xpIntoLevel: 0, xpForNextLevel: 50, unlockedPlotCount: 9 } }],
    ["unknown quest id", { quest: { ...QUEST, id: "harvest_gold_1" } }],
    ["progress above target", { quest: { ...QUEST, progress: 4 } }],
    ["complete flag that disagrees with progress", { quest: { ...QUEST, complete: true } }],
    ["negative reward", { quest: { ...QUEST, reward: { coins: -1, xp: 5 } } }],
    ["zero target", { quest: { ...QUEST, progress: 0, target: 0, complete: true } }],
  ])("rejects %s", (_label, overrides) => {
    expect(isFarmState(farm(overrides))).toBe(false);
  });

  it("validates a quest view on its own", () => {
    expect(isQuestView(QUEST)).toBe(true);
    expect(isQuestView({ ...QUEST, progress: 3, complete: true })).toBe(true);
    expect(isQuestView({ ...QUEST, title: 3 })).toBe(false);
    expect(isQuestView(null)).toBe(false);
  });
});

describe("quest claim", () => {
  it("accepts a claim request with only a request ID", () => {
    expect(isQuestClaimRequest({ requestId: REQUEST_ID })).toBe(true);
  });

  it.each([
    ["missing request ID", {}],
    ["non-UUID request ID", { requestId: "claim-1" }],
    ["array body", [REQUEST_ID]],
    ["null", null],
  ])("rejects a claim request with %s", (_label, value) => {
    expect(isQuestClaimRequest(value)).toBe(false);
  });

  it("validates the claim response: a farm state plus the claimed quest and reward", () => {
    const claimed = { questId: "harvest_wheat_3", reward: { coins: 10, xp: 5 } };
    expect(isQuestClaimResponse({ ...farm(), claimed })).toBe(true);
    expect(isQuestClaimResponse(farm())).toBe(false);
    expect(isQuestClaimResponse({ ...farm(), claimed: { ...claimed, questId: "nope" } })).toBe(false);
    expect(isQuestClaimResponse({ ...farm(), claimed: { ...claimed, reward: { coins: 1 } } })).toBe(false);
    expect(isQuestClaimResponse({ ...farm({ xp: 60 }), claimed })).toBe(false);
  });
});
