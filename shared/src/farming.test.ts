import { describe, expect, it } from "vitest";
import {
  CROPS,
  CROP_IDS,
  FARM_PLOT_COUNT,
  ITEMS,
  ITEM_IDS,
  SEED_REFILL_COOLDOWN_MS,
  SEED_REFILL_PER_CROP,
  STARTER_SEEDS_PER_CROP,
  getCrop,
  getItem,
  isCropId,
  isItemId,
  isPlotIndex,
  isProduceItemId,
} from "./farming.js";

describe("farming constants", () => {
  it("match the approved Phase 1 design", () => {
    expect(FARM_PLOT_COUNT).toBe(6);
    expect(STARTER_SEEDS_PER_CROP).toBe(5);
    expect(SEED_REFILL_PER_CROP).toBe(5);
    expect(SEED_REFILL_COOLDOWN_MS).toBe(60_000);
  });
});

describe("static definitions", () => {
  it("define exactly the listed crops and items, without duplicates", () => {
    expect(CROPS.map((crop) => crop.id)).toEqual([...CROP_IDS]);
    expect(ITEMS.map((item) => item.id)).toEqual([...ITEM_IDS]);
    expect(new Set(CROP_IDS).size).toBe(3);
    expect(new Set(ITEM_IDS).size).toBe(6);
  });

  it("name items <crop>_seed and <crop>_produce with matching kinds", () => {
    for (const item of ITEMS) {
      const suffix = item.kind === "seed" ? "_seed" : "_produce";
      expect(item.id.endsWith(suffix)).toBe(true);
    }
    for (const crop of CROPS) {
      expect(crop.seedItemId).toBe(`${crop.id}_seed`);
      expect(crop.produceItemId).toBe(`${crop.id}_produce`);
      expect(getItem(crop.seedItemId).kind).toBe("seed");
      expect(getItem(crop.produceItemId).kind).toBe("produce");
    }
  });

  it("use each seed and produce item for exactly one crop", () => {
    const used = CROPS.flatMap((crop) => [crop.seedItemId, crop.produceItemId]);
    expect(new Set(used).size).toBe(used.length);
    expect([...used].sort()).toEqual([...ITEM_IDS].sort());
  });

  it("use the approved growth times and yield", () => {
    expect(getCrop("wheat").growthMs).toBe(30_000);
    expect(getCrop("carrot").growthMs).toBe(120_000);
    expect(getCrop("tomato").growthMs).toBe(300_000);
    for (const crop of CROPS) {
      expect(crop.harvestYield).toBe(1);
    }
  });

  it("grant the provisional coin and XP rewards per harvest", () => {
    expect([getCrop("wheat").coinReward, getCrop("wheat").xpReward]).toEqual([2, 1]);
    expect([getCrop("carrot").coinReward, getCrop("carrot").xpReward]).toEqual([6, 3]);
    expect([getCrop("tomato").coinReward, getCrop("tomato").xpReward]).toEqual([12, 6]);
    for (const crop of CROPS) {
      expect(Number.isSafeInteger(crop.coinReward) && crop.coinReward > 0).toBe(true);
      expect(Number.isSafeInteger(crop.xpReward) && crop.xpReward > 0).toBe(true);
    }
  });

  it("have non-empty display names", () => {
    for (const definition of [...CROPS, ...ITEMS]) {
      expect(definition.name.trim()).not.toBe("");
    }
  });
});

describe("getCrop / getItem", () => {
  it("return the matching definition", () => {
    expect(getCrop("carrot")).toMatchObject({ id: "carrot", seedItemId: "carrot_seed" });
    expect(getItem("tomato_produce")).toMatchObject({ id: "tomato_produce", kind: "produce" });
  });
});

describe("isCropId", () => {
  it.each(CROP_IDS)("accepts %s", (id) => {
    expect(isCropId(id)).toBe(true);
  });

  it.each([["Wheat"], ["wheat_seed"], ["wheat_produce"], ["corn"], [""], [1], [null], [undefined]])(
    "rejects %j",
    (value) => {
      expect(isCropId(value)).toBe(false);
    },
  );
});

describe("isItemId", () => {
  it.each(ITEM_IDS)("accepts %s", (id) => {
    expect(isItemId(id)).toBe(true);
  });

  it.each([["wheat"], ["WHEAT_SEED"], ["corn_seed"], [""], [0], [null]])(
    "rejects %j",
    (value) => {
      expect(isItemId(value)).toBe(false);
    },
  );
});

describe("isProduceItemId", () => {
  it.each(["wheat_produce", "carrot_produce", "tomato_produce"])("accepts %s", (id) => {
    expect(isProduceItemId(id)).toBe(true);
  });

  it.each([
    ["wheat_seed"],
    ["carrot_seed"],
    ["tomato_seed"],
    ["wheat"],
    ["WHEAT_PRODUCE"],
    ["corn_produce"],
    [""],
    [null],
  ])("rejects %j", (value) => {
    expect(isProduceItemId(value)).toBe(false);
  });

  it("matches every produce item and no seed item", () => {
    for (const item of ITEMS) {
      expect(isProduceItemId(item.id)).toBe(item.kind === "produce");
    }
  });
});

describe("isPlotIndex", () => {
  it.each([0, 1, 2, 3, 4, 5])("accepts %i", (index) => {
    expect(isPlotIndex(index)).toBe(true);
  });

  it.each([[-1], [6], [1.5], [NaN], [Infinity], ["1"], [null], [undefined]])(
    "rejects %j",
    (value) => {
      expect(isPlotIndex(value)).toBe(false);
    },
  );
});
