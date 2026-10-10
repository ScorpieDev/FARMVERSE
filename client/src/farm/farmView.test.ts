import { describe, expect, it } from "vitest";
import type { FarmState, ProgressionState } from "@farmverse/shared/api";
import { FARM_PLOT_COUNT } from "@farmverse/shared/farming";
import { createRequestIdFactory } from "../network/requestId.js";
import {
  clockFromState,
  emptyPlotHint,
  errorText,
  formatDuration,
  inventoryLine,
  isCropLocked,
  isPlotLocked,
  levelLine,
  levelUpText,
  plotLevel,
  plotView,
  produceLine,
  questLine,
  rewardText,
  xpFraction,
  refillLabel,
  seedCount,
  serverNow,
} from "./farmView.js";

const T = 1_700_000_000_000;

const STATE: FarmState = {
  serverTime: T,
  plots: Array.from({ length: FARM_PLOT_COUNT }, (_, index) => ({ index, crop: null })),
  inventory: [
    { itemId: "wheat_seed", quantity: 3 },
    { itemId: "tomato_produce", quantity: 2 },
  ],
  seedRefill: { eligible: false, availableAt: null },
  coins: 12,
  xp: 6,
  progression: { level: 1, xpIntoLevel: 6, xpForNextLevel: 50, unlockedPlotCount: 6 },
  quest: {
    id: "harvest_wheat_3",
    title: "Harvest 3 Wheat",
    progress: 0,
    target: 3,
    complete: false,
    reward: { coins: 10, xp: 5 },
  },
};

describe("server clock", () => {
  it("estimates server time from the response time", () => {
    const clock = clockFromState(STATE, T - 5_000); // client clock is 5 s behind

    expect(serverNow(clock, T - 5_000)).toBe(T);
    expect(serverNow(clock, T - 4_000)).toBe(T + 1_000);
  });
});

describe("plotView", () => {
  const crop = { cropId: "wheat" as const, plantedAt: T, readyAt: T + 30_000 };

  it("shows empty plots", () => {
    expect(plotView({ index: 0, crop: null }, T)).toEqual({ kind: "empty" });
  });

  it("shows growth progress until readyAt", () => {
    expect(plotView({ index: 0, crop }, T + 15_000)).toEqual({
      kind: "growing",
      cropId: "wheat",
      remainingMs: 15_000,
      progress: 0.5,
    });
    expect(plotView({ index: 0, crop }, T - 1_000)).toMatchObject({ kind: "growing", progress: 0 });
  });

  it("shows ready from readyAt on", () => {
    expect(plotView({ index: 0, crop }, T + 30_000)).toEqual({ kind: "ready", cropId: "wheat" });
    expect(plotView({ index: 0, crop }, T + 999_999)).toEqual({ kind: "ready", cropId: "wheat" });
  });
});

describe("formatting", () => {
  it.each([
    [0, "0 s"],
    [1, "1 s"],
    [29_001, "30 s"],
    [60_000, "1 min"],
    [125_000, "2 min 5 s"],
  ])("formats %i ms as %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });

  it("reads seed counts and inventory lines from the state", () => {
    expect(seedCount(STATE, "wheat")).toBe(3);
    expect(seedCount(STATE, "carrot")).toBe(0);
    expect(inventoryLine(STATE, ["wheat_produce", "carrot_produce", "tomato_produce"])).toBe(
      "Wheat 0 · Carrot 0 · Tomato 2",
    );
  });

  it("hints at the selected seed on empty plots", () => {
    expect(emptyPlotHint(STATE, "wheat")).toBe("Tap to plant");
    expect(emptyPlotHint(STATE, "carrot")).toBe("No Carrot seeds");
  });

  it("labels the refill button only when eligible", () => {
    expect(refillLabel({ eligible: false, availableAt: null }, T)).toBeNull();
    expect(refillLabel({ eligible: true, availableAt: T + 42_000 }, T)).toBe("Free seeds in 42 s");
    expect(refillLabel({ eligible: true, availableAt: T }, T)).toBe("Get free seeds");
  });

  it("explains every gameplay error in English", () => {
    expect(errorText("CROP_NOT_READY")).toBe("Not ready yet.");
    expect(errorText("ITEM_NOT_OWNED")).toBe("No seeds left for that crop.");
    expect(errorText("INTERNAL_ERROR")).toBe("Something went wrong. Please try again.");
  });
});

describe("progression", () => {
  const level = (n: number, xpIntoLevel = 0): ProgressionState => ({
    level: n,
    xpIntoLevel,
    xpForNextLevel: n < 10 ? 50 * n : null,
    unlockedPlotCount: 6,
  });

  it("shows level and XP progress, and a full bar at the maximum level", () => {
    expect(levelLine(STATE.progression)).toBe("Level 1 · 6/50 XP");
    expect(xpFraction(STATE.progression)).toBeCloseTo(0.12, 9);
    expect(levelLine(level(10))).toBe("Level 10 · Max level");
    expect(xpFraction(level(10))).toBe(1);
    expect(xpFraction({ ...level(2), xpIntoLevel: 500 })).toBe(1);
  });

  it("locks plots beyond the unlocked count and labels them with their level", () => {
    expect(isPlotLocked(STATE, 5)).toBe(false);
    expect(isPlotLocked(STATE, 6)).toBe(true);
    expect(isPlotLocked({ ...STATE, progression: { ...STATE.progression, unlockedPlotCount: 7 } }, 6)).toBe(false);
    expect([6, 7, 8].map(plotLevel)).toEqual([2, 4, 6]);
  });

  it("locks Corn and Strawberry until levels 3 and 5", () => {
    const at = (n: number): FarmState => ({ ...STATE, progression: level(n) });
    expect(isCropLocked(at(1), "tomato")).toBe(false);
    expect(isCropLocked(at(2), "corn")).toBe(true);
    expect(isCropLocked(at(3), "corn")).toBe(false);
    expect(isCropLocked(at(4), "strawberry")).toBe(true);
    expect(isCropLocked(at(5), "strawberry")).toBe(false);
  });

  it("lists produce of unlocked crops, plus locked produce still held", () => {
    expect(produceLine(STATE)).toBe("Harvest: Wheat 0 · Carrot 0 · Tomato 2");
    expect(produceLine({ ...STATE, progression: level(5) })).toBe(
      "Harvest: Wheat 0 · Carrot 0 · Tomato 2 · Corn 0 · Strawberry 0",
    );
    const held: FarmState = { ...STATE, inventory: [{ itemId: "corn_produce", quantity: 1 }] };
    expect(produceLine(held)).toBe("Harvest: Wheat 0 · Carrot 0 · Tomato 0 · Corn 1");
  });

  it("describes the active quest, a completed one and the end of the chain", () => {
    expect(questLine(STATE.quest)).toBe("Quest: Harvest 3 Wheat (0/3)");
    expect(questLine({ ...STATE.quest!, progress: 3, complete: true })).toBe("Quest done: Harvest 3 Wheat");
    expect(questLine(null)).toBe("All quests done!");
    expect(rewardText({ coins: 10, xp: 5 })).toBe("+10 coins · +5 XP");
  });

  it("announces level-ups with what they unlock", () => {
    expect(levelUpText(level(1), level(1, 20))).toBeNull();
    expect(levelUpText(level(1), level(2))).toBe("Level 2! Plot 7 unlocked.");
    expect(levelUpText(level(2), level(3))).toBe("Level 3! Corn unlocked.");
    expect(levelUpText(level(2), level(4))).toBe("Level 4! Corn and Plot 8 unlocked.");
    expect(levelUpText(level(1), level(5))).toBe("Level 5! Plot 7, Corn, Plot 8 and Strawberry unlocked.");
    expect(levelUpText(level(6), level(7))).toBe("Level 7!");
  });

  it("explains the progression errors", () => {
    expect(errorText("LEVEL_TOO_LOW")).toBe("Your level is too low for that yet.");
    expect(errorText("QUEST_NOT_COMPLETE")).toBe("Finish the quest first.");
  });
});

describe("createRequestIdFactory", () => {
  it("uses crypto.randomUUID when available", () => {
    const factory = createRequestIdFactory({ randomUUID: () => "id-1" });
    expect(factory?.()).toBe("id-1");
  });

  it("returns null without randomUUID (never falls back to Math.random)", () => {
    expect(createRequestIdFactory(undefined)).toBeNull();
    expect(createRequestIdFactory({})).toBeNull();
  });

  it("produces lowercase UUID v4 values in this environment", () => {
    const factory = createRequestIdFactory(globalThis.crypto);
    expect(factory?.()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
