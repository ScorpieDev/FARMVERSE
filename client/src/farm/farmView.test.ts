import { describe, expect, it } from "vitest";
import type { FarmState } from "@farmverse/shared/api";
import { FARM_PLOT_COUNT } from "@farmverse/shared/farming";
import { createRequestIdFactory } from "../network/requestId.js";
import {
  clockFromState,
  emptyPlotHint,
  errorText,
  formatDuration,
  inventoryLine,
  plotView,
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
