import { describe, expect, it } from "vitest";
import {
  CROPS,
  FARM_PLOT_COUNT,
  ITEM_IDS,
  SEED_REFILL_COOLDOWN_MS,
  type CropId,
  type ItemId,
} from "@farmverse/shared/farming";
import { isFarmState, isHarvestResponse } from "@farmverse/shared/api";
import { levelFromXp, plotCountForLevel } from "@farmverse/shared/progression";
import { startingQuestState } from "./quests.js";
import {
  createStarterFarm,
  getReadyAt,
  harvest,
  isCropReady,
  isSeedRefillEligible,
  plant,
  refillSeeds,
  toFarmState,
  type FarmData,
  type FarmPlot,
  type RuleResult,
} from "./rules.js";

const T = 1_700_000_000_000;
/** Quest state of a new player (toFarmState needs one). */
const NEW_QUESTS = startingQuestState();
const WHEAT_MS = 30_000;
const CARROT_MS = 120_000;
const TOMATO_MS = 300_000;

function inventory(values: Partial<Record<ItemId, number>> = {}): Record<ItemId, number> {
  const all = Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<ItemId, number>;
  return { ...all, ...values };
}

function farmWith(options: {
  plots?: Array<FarmPlot | null>;
  inventory?: Partial<Record<ItemId, number>>;
  seedRefillAvailableAt?: number | null;
  coins?: number;
  xp?: number;
}): FarmData {
  return {
    plots: options.plots ?? Array.from({ length: FARM_PLOT_COUNT }, () => null),
    inventory: inventory(options.inventory),
    seedRefillAvailableAt: options.seedRefillAvailableAt ?? null,
    coins: options.coins ?? 0,
    xp: options.xp ?? 0,
  };
}

/** The given leading plots followed by empty plots up to FARM_PLOT_COUNT. */
function plotsOf(...leading: Array<FarmPlot | null>): Array<FarmPlot | null> {
  return [...leading, ...Array.from({ length: FARM_PLOT_COUNT - leading.length }, () => null)];
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Returns the farm of a successful result, failing the test otherwise. */
function expectOk<T extends object>(result: RuleResult<T>): FarmData {
  if (!result.ok) throw new Error(`Expected success, got ${result.error}`);
  return result.farm;
}

/** Checks the invariants that must hold after every rule. */
function expectInvariants(farm: FarmData, now: number): void {
  expect(farm.plots).toHaveLength(FARM_PLOT_COUNT);
  expect(Object.keys(farm.inventory).sort()).toEqual([...ITEM_IDS].sort());
  for (const quantity of Object.values(farm.inventory)) {
    expect(Number.isInteger(quantity)).toBe(true);
    expect(quantity).toBeGreaterThanOrEqual(0);
  }
  expect(isFarmState(toFarmState(farm, NEW_QUESTS, now))).toBe(true);
}

function seedTotal(farm: FarmData): number {
  return CROPS.reduce((total, crop) => total + farm.inventory[crop.seedItemId], 0);
}

describe("createStarterFarm", () => {
  it("has 9 empty plots, 5 seeds of each level-1 crop, no produce and no refill cooldown", () => {
    const farm = createStarterFarm();

    expect(farm.plots).toEqual(plotsOf());
    expect(farm.inventory).toEqual(
      inventory({ wheat_seed: 5, carrot_seed: 5, tomato_seed: 5 }),
    );
    expect(farm.seedRefillAvailableAt).toBeNull();
    expect([farm.coins, farm.xp]).toEqual([0, 0]);
    expectInvariants(farm, T);
  });

  it("returns a new farm each time", () => {
    expect(createStarterFarm()).not.toBe(createStarterFarm());
    expect(createStarterFarm().inventory).not.toBe(createStarterFarm().inventory);
  });

  it("converts to the shared FarmState contract", () => {
    expect(toFarmState(createStarterFarm(), NEW_QUESTS, T)).toEqual({
      serverTime: T,
      plots: plotsOf().map((_, index) => ({ index, crop: null })),
      inventory: [
        { itemId: "wheat_seed", quantity: 5 },
        { itemId: "carrot_seed", quantity: 5 },
        { itemId: "tomato_seed", quantity: 5 },
      ],
      seedRefill: { eligible: false, availableAt: null },
      coins: 0,
      xp: 0,
      progression: { level: 1, xpIntoLevel: 0, xpForNextLevel: 50, unlockedPlotCount: 6 },
      quest: {
        id: "harvest_wheat_3",
        title: "Harvest 3 Wheat",
        progress: 0,
        target: 3,
        complete: false,
        reward: { coins: 10, xp: 5 },
      },
    });
  });
});

describe("plant", () => {
  it("uses one seed and plants the crop at server time now", () => {
    const before = deepFreeze(createStarterFarm());

    const farm = expectOk(plant(before, 0, "wheat", T));

    expect(farm.plots[0]).toEqual({ cropId: "wheat", plantedAt: T });
    expect(farm.plots.slice(1)).toEqual(plotsOf().slice(1));
    expect(farm.inventory.wheat_seed).toBe(4);
    expect(farm.inventory.carrot_seed).toBe(5);
    expect(farm.seedRefillAvailableAt).toBeNull();
    expect(before).toEqual(createStarterFarm());
    expectInvariants(farm, T);
  });

  it.each<[string, number]>([
    ["a growing crop", T + 1],
    ["a ready crop", T + WHEAT_MS],
  ])("rejects a plot with %s (PLOT_NOT_EMPTY)", (_label, now) => {
    const farm = deepFreeze(expectOk(plant(createStarterFarm(), 2, "wheat", T)));

    expect(plant(farm, 2, "carrot", now)).toEqual({ ok: false, error: "PLOT_NOT_EMPTY" });
  });

  it("rejects a crop without seeds (ITEM_NOT_OWNED) even if other seeds remain", () => {
    const farm = deepFreeze(farmWith({ inventory: { wheat_seed: 0, carrot_seed: 3 } }));

    expect(plant(farm, 0, "wheat", T)).toEqual({ ok: false, error: "ITEM_NOT_OWNED" });
    expect(expectOk(plant(farm, 0, "carrot", T)).inventory.carrot_seed).toBe(2);
  });

  it("checks the plot before the seed (P2-3)", () => {
    const farm = farmWith({ plots: plotsOf({ cropId: "wheat", plantedAt: T }) });

    expect(plant(farm, 0, "tomato", T)).toEqual({ ok: false, error: "PLOT_NOT_EMPTY" });
  });

  it("runs out after 5 seeds of one crop", () => {
    let farm = createStarterFarm();
    for (let plot = 0; plot < 5; plot++) {
      farm = expectOk(plant(farm, plot, "carrot", T));
    }

    expect(farm.inventory.carrot_seed).toBe(0);
    expect(plant(farm, 5, "carrot", T)).toEqual({ ok: false, error: "ITEM_NOT_OWNED" });
    expect(expectOk(plant(farm, 5, "tomato", T)).plots).toHaveLength(FARM_PLOT_COUNT);
  });

  it("can fill the 6 level-1 plots, and plots 7–9 stay locked", () => {
    const crops: CropId[] = ["wheat", "wheat", "carrot", "carrot", "tomato", "tomato"];
    let farm = createStarterFarm();
    crops.forEach((cropId, plot) => {
      farm = expectOk(plant(farm, plot, cropId, T));
    });

    expect(farm.plots.slice(0, 6).every((plot) => plot !== null)).toBe(true);
    for (const plot of [6, 7, 8]) expect(plant(farm, plot, "wheat", T)).toEqual({ ok: false, error: "LEVEL_TOO_LOW" });
    expect(seedTotal(farm)).toBe(15 - 6);
    expectInvariants(farm, T);
  });
});

describe("growth time", () => {
  it.each<[CropId, number]>([
    ["wheat", WHEAT_MS],
    ["carrot", CARROT_MS],
    ["tomato", TOMATO_MS],
  ])("%s is ready exactly growthMs after planting", (cropId, growthMs) => {
    const plot: FarmPlot = { cropId, plantedAt: T };

    expect(getReadyAt(plot)).toBe(T + growthMs);
    expect(isCropReady(plot, T)).toBe(false);
    expect(isCropReady(plot, T + growthMs - 1)).toBe(false);
    expect(isCropReady(plot, T + growthMs)).toBe(true);
    expect(isCropReady(plot, T + growthMs * 100)).toBe(true);
  });

  it("is not ready if the server clock is before plantedAt", () => {
    expect(isCropReady({ cropId: "wheat", plantedAt: T }, T - 1)).toBe(false);
  });

  it("exposes plantedAt and readyAt in the FarmState", () => {
    const farm = expectOk(plant(createStarterFarm(), 3, "tomato", T));

    expect(toFarmState(farm, NEW_QUESTS, T + 5).plots[3]).toEqual({
      index: 3,
      crop: { cropId: "tomato", plantedAt: T, readyAt: T + TOMATO_MS },
    });
  });
});

describe("harvest", () => {
  const planted = deepFreeze(expectOk(plant(createStarterFarm(), 1, "wheat", T)));

  it("rejects an empty plot (PLOT_EMPTY)", () => {
    expect(harvest(planted, 0, T + WHEAT_MS)).toEqual({ ok: false, error: "PLOT_EMPTY" });
  });

  it("rejects a crop one millisecond before it is ready (CROP_NOT_READY)", () => {
    expect(harvest(planted, 1, T + WHEAT_MS - 1)).toEqual({
      ok: false,
      error: "CROP_NOT_READY",
    });
  });

  it("harvests exactly at readyAt: empties the plot and adds 1 produce", () => {
    const result = harvest(planted, 1, T + WHEAT_MS);
    const farm = expectOk(result);

    expect(result.ok && result.harvested).toEqual({ itemId: "wheat_produce", quantity: 1 });
    expect(farm.plots[1]).toBeNull();
    expect(farm.inventory.wheat_produce).toBe(1);
    expect(farm.inventory.wheat_seed).toBe(4);
    expect(farm.seedRefillAvailableAt).toBeNull();
    expectInvariants(farm, T + WHEAT_MS);
  });

  it("produces a valid HarvestResponse", () => {
    const now = T + WHEAT_MS;
    const result = harvest(planted, 1, now);
    if (!result.ok) throw new Error(result.error);

    expect(
      isHarvestResponse({
        ...toFarmState(result.farm, NEW_QUESTS, now),
        harvested: result.harvested,
        reward: result.reward,
      }),
    ).toBe(true);
  });

  it.each<[CropId, number, number, number]>([
    ["wheat", WHEAT_MS, 2, 1],
    ["carrot", CARROT_MS, 6, 3],
    ["tomato", TOMATO_MS, 12, 6],
  ])("grants the %s coin and XP reward on top of existing totals", (cropId, growthMs, coins, xp) => {
    const farm = expectOk(plant(farmWith({ inventory: { [`${cropId}_seed`]: 1 }, coins: 10, xp: 4 }), 0, cropId, T));
    const result = harvest(farm, 0, T + growthMs);
    if (!result.ok) throw new Error(result.error);

    expect(result.reward).toEqual({ coins, xp });
    expect([result.farm.coins, result.farm.xp]).toEqual([10 + coins, 4 + xp]);
    expect(toFarmState(result.farm, NEW_QUESTS, T + growthMs)).toMatchObject({ coins: 10 + coins, xp: 4 + xp });
  });

  it("grants no reward when the harvest fails", () => {
    expect(harvest(planted, 1, T + WHEAT_MS - 1)).toEqual({ ok: false, error: "CROP_NOT_READY" });
    expect(harvest(planted, 0, T + WHEAT_MS)).toEqual({ ok: false, error: "PLOT_EMPTY" });
    expect([planted.coins, planted.xp]).toEqual([0, 0]);
  });

  it("rewards each crop only once", () => {
    const farm = expectOk(harvest(planted, 1, T + WHEAT_MS));

    expect(harvest(farm, 1, T + WHEAT_MS + 1)).toEqual({ ok: false, error: "PLOT_EMPTY" });
    expect([farm.coins, farm.xp]).toEqual([2, 1]);
  });

  it("does not harvest the same plot twice", () => {
    const farm = expectOk(harvest(planted, 1, T + WHEAT_MS));

    expect(harvest(farm, 1, T + WHEAT_MS + 1)).toEqual({ ok: false, error: "PLOT_EMPTY" });
    expect(farm.inventory.wheat_produce).toBe(1);
  });

  it("still yields 1 produce long after the crop is ready (no withering)", () => {
    const result = harvest(planted, 1, T + 365 * 24 * 60 * 60 * 1000);

    expect(result.ok && result.harvested.quantity).toBe(1);
  });

  it.each<[CropId, number]>([
    ["carrot", CARROT_MS],
    ["tomato", TOMATO_MS],
  ])("gives %s_produce for %s", (cropId, growthMs) => {
    const farm = expectOk(plant(createStarterFarm(), 0, cropId, T));
    const result = harvest(farm, 0, T + growthMs);

    expect(result.ok && result.harvested).toEqual({ itemId: `${cropId}_produce`, quantity: 1 });
  });

  it("does not modify its input", () => {
    const snapshot = structuredClone(planted);
    harvest(planted, 1, T + WHEAT_MS);
    harvest(planted, 1, T);

    expect(planted).toEqual(snapshot);
  });
});

describe("seed refill eligibility", () => {
  it("is false while seeds remain", () => {
    expect(isSeedRefillEligible(farmWith({ inventory: { tomato_seed: 1 } }))).toBe(false);
  });

  it("is false while a crop is on the farm, even a ready one", () => {
    const farm = farmWith({ plots: plotsOf(null, null, null, null, null, { cropId: "wheat", plantedAt: T }) });

    expect(isSeedRefillEligible(farm)).toBe(false);
    expect(toFarmState(farm, NEW_QUESTS, T + WHEAT_MS * 2).seedRefill).toEqual({
      eligible: false,
      availableAt: null,
    });
  });

  it("is true with no seeds and no crops, regardless of produce", () => {
    expect(isSeedRefillEligible(farmWith({ inventory: { wheat_produce: 7 } }))).toBe(true);
  });
});

describe("seed refill cooldown", () => {
  /** No seeds left and one wheat planted at T: harvesting it is the last harvest. */
  const lastCrop = deepFreeze(
    farmWith({ plots: plotsOf({ cropId: "wheat", plantedAt: T }) }),
  );
  const H = T + WHEAT_MS;

  it("starts at the harvest that leaves no seeds and no crops", () => {
    const farm = expectOk(harvest(lastCrop, 0, H));

    expect(farm.seedRefillAvailableAt).toBe(H + SEED_REFILL_COOLDOWN_MS);
    expect(toFarmState(farm, NEW_QUESTS, H).seedRefill).toEqual({
      eligible: true,
      availableAt: H + 60_000,
    });
  });

  it("does not start when another crop remains", () => {
    const farm = farmWith({
      plots: plotsOf({ cropId: "wheat", plantedAt: T }, { cropId: "tomato", plantedAt: T }),
    });

    expect(expectOk(harvest(farm, 0, H)).seedRefillAvailableAt).toBeNull();
  });

  it("does not start when seeds remain", () => {
    const farm = farmWith({
      plots: plotsOf({ cropId: "wheat", plantedAt: T }),
      inventory: { carrot_seed: 1 },
    });

    expect(expectOk(harvest(farm, 0, H)).seedRefillAvailableAt).toBeNull();
  });

  it("is not started or changed by failed harvests", () => {
    expect(harvest(lastCrop, 0, H - 1)).toEqual({ ok: false, error: "CROP_NOT_READY" });
    expect(harvest(lastCrop, 3, H)).toEqual({ ok: false, error: "PLOT_EMPTY" });

    const waiting = deepFreeze(expectOk(harvest(lastCrop, 0, H)));
    expect(harvest(waiting, 0, H + 10)).toEqual({ ok: false, error: "PLOT_EMPTY" });
    expect(waiting.seedRefillAvailableAt).toBe(H + SEED_REFILL_COOLDOWN_MS);
  });

  it("rejects a refill 1 ms before the cooldown ends without extending it", () => {
    const waiting = deepFreeze(expectOk(harvest(lastCrop, 0, H)));

    expect(refillSeeds(waiting, H)).toEqual({ ok: false, error: "REFILL_NOT_ALLOWED" });
    expect(refillSeeds(waiting, H + SEED_REFILL_COOLDOWN_MS - 1)).toEqual({
      ok: false,
      error: "REFILL_NOT_ALLOWED",
    });
    expect(waiting.seedRefillAvailableAt).toBe(H + SEED_REFILL_COOLDOWN_MS);
  });

  it("refills 5 seeds of each crop when the cooldown ends, keeping produce", () => {
    const waiting = deepFreeze(expectOk(harvest(lastCrop, 0, H)));
    const now = H + SEED_REFILL_COOLDOWN_MS;

    const farm = expectOk(refillSeeds(waiting, now));

    expect(farm.inventory).toEqual(
      inventory({ wheat_seed: 5, carrot_seed: 5, tomato_seed: 5, wheat_produce: 1 }),
    );
    expect([farm.coins, farm.xp]).toEqual([2, 1]);
    expect(farm.seedRefillAvailableAt).toBeNull();
    expect(toFarmState(farm, NEW_QUESTS, now).seedRefill).toEqual({ eligible: false, availableAt: null });
    expectInvariants(farm, now);
  });

  it("does not refill twice", () => {
    const waiting = expectOk(harvest(lastCrop, 0, H));
    const refilled = expectOk(refillSeeds(waiting, H + SEED_REFILL_COOLDOWN_MS));

    expect(refillSeeds(refilled, H + SEED_REFILL_COOLDOWN_MS * 10)).toEqual({
      ok: false,
      error: "REFILL_NOT_ALLOWED",
    });
    expect(seedTotal(refilled)).toBe(15);
  });

  it("rejects a refill while seeds or crops remain", () => {
    expect(refillSeeds(createStarterFarm(), T)).toEqual({ ok: false, error: "REFILL_NOT_ALLOWED" });
    expect(refillSeeds(lastCrop, H + SEED_REFILL_COOLDOWN_MS)).toEqual({
      ok: false,
      error: "REFILL_NOT_ALLOWED",
    });
  });

  it("allows an immediate refill when eligible but no cooldown was recorded (P2-5)", () => {
    const farm = deepFreeze(farmWith({ seedRefillAvailableAt: null }));

    expect(toFarmState(farm, NEW_QUESTS, T).seedRefill).toEqual({ eligible: true, availableAt: T });
    expect(seedTotal(expectOk(refillSeeds(farm, T)))).toBe(15);
  });
});

describe("full loop from a new farm", () => {
  it("uses all 15 seeds, waits 60 s, then refills exactly once", () => {
    let farm = createStarterFarm();
    let now = T;
    const crops: CropId[] = ["wheat", "carrot", "tomato"];

    // Plant every free plot with any remaining seed, then harvest when ready.
    while (seedTotal(farm) > 0 || farm.plots.some((plot) => plot !== null)) {
      farm.plots.forEach((plot, index) => {
        if (plot !== null || index >= plotCountForLevel(levelFromXp(farm.xp))) return;
        const cropId = crops.find((id) => farm.inventory[`${id}_seed`] > 0);
        if (cropId) farm = expectOk(plant(farm, index, cropId, now));
      });
      expect(farm.seedRefillAvailableAt).toBeNull();

      now += TOMATO_MS;
      farm.plots.forEach((plot, index) => {
        if (plot !== null) farm = expectOk(harvest(farm, index, now));
      });
      expectInvariants(farm, now);
    }

    expect(farm.inventory).toEqual(
      inventory({ wheat_produce: 5, carrot_produce: 5, tomato_produce: 5 }),
    );
    expect([farm.coins, farm.xp]).toEqual([5 * 2 + 5 * 6 + 5 * 12, 5 * 1 + 5 * 3 + 5 * 6]);
    expect(farm.seedRefillAvailableAt).toBe(now + SEED_REFILL_COOLDOWN_MS);

    expect(refillSeeds(farm, now + SEED_REFILL_COOLDOWN_MS - 1).ok).toBe(false);
    farm = expectOk(refillSeeds(farm, now + SEED_REFILL_COOLDOWN_MS));

    expect(seedTotal(farm)).toBe(15);
    expect(farm.inventory.wheat_produce).toBe(5);
    expect(refillSeeds(farm, now + SEED_REFILL_COOLDOWN_MS * 2).ok).toBe(false);
  });
});

describe("toFarmState", () => {
  it("lists inventory in ITEM_IDS order and omits zero quantities (P2-4)", () => {
    const farm = farmWith({
      inventory: { tomato_produce: 2, wheat_seed: 1, carrot_produce: 0, carrot_seed: 3 },
    });

    expect(toFarmState(farm, NEW_QUESTS, T).inventory).toEqual([
      { itemId: "wheat_seed", quantity: 1 },
      { itemId: "carrot_seed", quantity: 3 },
      { itemId: "tomato_produce", quantity: 2 },
    ]);
  });

  it("uses now as serverTime", () => {
    expect(toFarmState(createStarterFarm(), NEW_QUESTS, T + 42).serverTime).toBe(T + 42);
  });
});

describe("out-of-range input (P2-2)", () => {
  const farm = createStarterFarm();

  it.each([-1, 9, 1.5, NaN])("throws RangeError for plot index %s", (plotIndex) => {
    expect(() => plant(farm, plotIndex, "wheat", T)).toThrow(RangeError);
    expect(() => harvest(farm, plotIndex, T)).toThrow(RangeError);
  });

  it("throws RangeError for an unknown crop id", () => {
    expect(() => plant(farm, 0, "rice" as CropId, T)).toThrow(RangeError);
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "throws RangeError for server time %s",
    (now) => {
      expect(() => plant(farm, 0, "wheat", now)).toThrow(RangeError);
      expect(() => harvest(farm, 0, now)).toThrow(RangeError);
      expect(() => refillSeeds(farm, now)).toThrow(RangeError);
      expect(() => toFarmState(farm, NEW_QUESTS, now)).toThrow(RangeError);
      expect(() => isCropReady({ cropId: "wheat", plantedAt: T }, now)).toThrow(RangeError);
    },
  );
});

describe("malformed FarmData (RangeError, never a gameplay error)", () => {
  const wheatAt = (plantedAt: unknown) => ({ cropId: "wheat", plantedAt }) as unknown as FarmPlot;
  const plotsWith = (plot: unknown): Array<FarmPlot | null> =>
    [plot as FarmPlot | null, null, null, null, null, null];

  /** Calls every public function that receives a FarmData. */
  const callers: Array<[string, (farm: FarmData) => unknown]> = [
    ["plant", (farm) => plant(farm, 0, "wheat", T)],
    ["harvest", (farm) => harvest(farm, 0, T + TOMATO_MS)],
    ["refillSeeds", (farm) => refillSeeds(farm, T)],
    ["toFarmState", (farm) => toFarmState(farm, NEW_QUESTS, T)],
    ["isSeedRefillEligible", (farm) => isSeedRefillEligible(farm)],
  ];

  const sparsePlots = new Array<FarmPlot | null>(FARM_PLOT_COUNT);
  sparsePlots.fill(null, 1);

  const malformed: Array<[string, unknown]> = [
    ["null farm", null],
    ["plots not an array", { ...createStarterFarm(), plots: {} }],
    ["4 plots", farmWith({ plots: [null, null, null, null] })],
    ["7 plots", farmWith({ plots: [null, null, null, null, null, null, null] })],
    ["sparse plots (hole)", farmWith({ plots: sparsePlots })],
    ["undefined plot", farmWith({ plots: plotsWith(undefined) })],
    ["plot not an object", farmWith({ plots: plotsWith("wheat") })],
    ["unknown cropId", farmWith({ plots: plotsWith({ cropId: "rice", plantedAt: T }) })],
    ["wrong-case cropId", farmWith({ plots: plotsWith({ cropId: "Wheat", plantedAt: T }) })],
    ["missing plantedAt", farmWith({ plots: plotsWith({ cropId: "wheat" }) })],
    ["negative plantedAt", farmWith({ plots: plotsWith(wheatAt(-1)) })],
    ["fractional plantedAt", farmWith({ plots: plotsWith(wheatAt(1.5)) })],
    ["NaN plantedAt", farmWith({ plots: plotsWith(wheatAt(NaN)) })],
    ["string plantedAt", farmWith({ plots: plotsWith(wheatAt(String(T))) })],
    ["unsafe plantedAt", farmWith({ plots: plotsWith(wheatAt(Number.MAX_SAFE_INTEGER + 1)) })],
    ["inventory null", { ...createStarterFarm(), inventory: null }],
    ["missing item", { ...createStarterFarm(), inventory: { wheat_seed: 5, tomato_seed: 5 } }],
    ["missing produce item", { ...createStarterFarm(), inventory: { ...inventory(), wheat_produce: undefined } }],
    ["negative quantity", farmWith({ inventory: { wheat_seed: -1, carrot_seed: 1 } })],
    ["fractional quantity", farmWith({ inventory: { wheat_seed: 1.5 } })],
    ["NaN quantity", farmWith({ inventory: { carrot_seed: NaN } })],
    ["Infinity quantity", farmWith({ inventory: { tomato_produce: Infinity } })],
    ["string quantity", farmWith({ inventory: { wheat_seed: "5" as unknown as number } })],
    ["unsafe quantity", farmWith({ inventory: { wheat_produce: Number.MAX_SAFE_INTEGER + 1 } })],
    ["negative refill time", farmWith({ seedRefillAvailableAt: -1 })],
    ["fractional refill time", farmWith({ seedRefillAvailableAt: T + 0.5 })],
    ["NaN refill time", farmWith({ seedRefillAvailableAt: NaN })],
    ["string refill time", farmWith({ seedRefillAvailableAt: "0" as unknown as number })],
    ["undefined refill time", { ...createStarterFarm(), seedRefillAvailableAt: undefined }],
    ["missing coins", { ...createStarterFarm(), coins: undefined }],
    ["negative coins", farmWith({ coins: -1 })],
    ["fractional xp", farmWith({ xp: 1.5 })],
    ["string xp", farmWith({ xp: "3" as unknown as number })],
    ["unsafe coins", farmWith({ coins: Number.MAX_SAFE_INTEGER + 1 })],
  ];

  for (const [caller, call] of callers) {
    it.each(malformed)(`${caller} throws RangeError for %s`, (_label, farm) => {
      expect(() => call(farm as FarmData)).toThrow(RangeError);
    });
  }

  it("does not grant seeds when negative and positive seeds sum to zero", () => {
    const farm = farmWith({ inventory: { wheat_seed: -1, carrot_seed: 1 } });

    expect(() => refillSeeds(farm, T)).toThrow(RangeError);
  });

  it("does not turn a missing item into NaN", () => {
    const farm = { ...createStarterFarm(), inventory: { wheat_seed: 1 } } as unknown as FarmData;

    expect(() => plant(farm, 0, "carrot", T)).toThrow(RangeError);
  });

  it("accepts valid farms: starter, empty, all plots planted, waiting for refill", () => {
    const planted = farmWith({
      plots: Array.from({ length: FARM_PLOT_COUNT }, (): FarmPlot => ({ cropId: "tomato", plantedAt: 0 })),
    });
    const valid: FarmData[] = [
      createStarterFarm(),
      farmWith({}),
      planted,
      farmWith({ seedRefillAvailableAt: T + SEED_REFILL_COOLDOWN_MS }),
      farmWith({ inventory: { wheat_produce: Number.MAX_SAFE_INTEGER } }),
    ];

    for (const farm of valid) {
      expect(() => isSeedRefillEligible(farm)).not.toThrow();
      expect(() => toFarmState(farm, NEW_QUESTS, T)).not.toThrow();
      expect(() => refillSeeds(farm, T + SEED_REFILL_COOLDOWN_MS)).not.toThrow();
      expect(() => plant(farm, 0, "wheat", T)).not.toThrow();
      expect(() => harvest(farm, 0, T + TOMATO_MS)).not.toThrow();
    }
  });

  it("keeps every result of the rules valid for the next call", () => {
    let farm = createStarterFarm();
    farm = expectOk(plant(farm, 0, "wheat", T));
    farm = expectOk(harvest(farm, 0, T + WHEAT_MS));

    expect(() => toFarmState(farm, NEW_QUESTS, T + WHEAT_MS)).not.toThrow();
    expect(() => plant(farm, 0, "carrot", T + WHEAT_MS)).not.toThrow();
  });
});

describe("toFarmState progression and quest (Phase 2)", () => {
  it("derives level progress and usable plots from XP", () => {
    expect(toFarmState(farmWith({ xp: 190 }), NEW_QUESTS, T).progression).toEqual({
      level: 3,
      xpIntoLevel: 40,
      xpForNextLevel: 150,
      unlockedPlotCount: 7,
    });
    expect(toFarmState(farmWith({ xp: 5000 }), NEW_QUESTS, T).progression).toEqual({
      level: 10,
      xpIntoLevel: 2750,
      xpForNextLevel: null,
      unlockedPlotCount: 9,
    });
  });

  it("shows the active quest's counted progress, or reach-level progress from XP", () => {
    expect(toFarmState(farmWith({}), { index: 0, progress: 3 }, T).quest).toMatchObject({
      id: "harvest_wheat_3",
      progress: 3,
      complete: true,
    });
    expect(toFarmState(farmWith({ xp: 60 }), { index: 4, progress: 0 }, T).quest).toMatchObject({
      id: "reach_level_3",
      progress: 2,
      target: 3,
      complete: false,
    });
  });

  it("has no quest once the chain is finished, and rejects corrupted quest state", () => {
    expect(toFarmState(farmWith({}), { index: 8, progress: 0 }, T).quest).toBeNull();
    expect(() => toFarmState(farmWith({}), { index: 9, progress: 0 }, T)).toThrow(RangeError);
    expect(() => toFarmState(farmWith({}), { index: 0, progress: -1 }, T)).toThrow(RangeError);
  });

  it("always produces a FarmState that passes the shared validator", () => {
    for (const xp of [0, 49, 50, 149, 150, 499, 500, 2249, 2250, 9999]) {
      for (let index = 0; index <= 8; index++) {
        expect(isFarmState(toFarmState(farmWith({ xp }), { index, progress: 0 }, T))).toBe(true);
      }
    }
  });
});
