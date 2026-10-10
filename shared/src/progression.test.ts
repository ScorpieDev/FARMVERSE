import { describe, expect, it } from "vitest";
import { CROP_IDS, FARM_PLOT_COUNT, getCrop } from "./farming.js";

const PHASE1_CROPS = ["wheat", "carrot", "tomato"] as const;
import {
  BASE_PLOT_COUNT,
  LEVEL_UNLOCKS,
  MAX_LEVEL,
  MAX_PLOT_COUNT,
  PROGRESSION_CROP_IDS,
  QUESTS,
  cropUnlockLevel,
  levelFromXp,
  levelProgress,
  plotCountForLevel,
  plotUnlockLevel,
  questAt,
  questTarget,
  totalXpForLevel,
  unlocksBetween,
  xpToAdvanceFrom,
} from "./progression.js";

describe("level curve (P2-2, L-A)", () => {
  it("needs 50 × L XP to go from level L to L + 1, up to level 10", () => {
    expect(MAX_LEVEL).toBe(10);
    for (let level = 1; level < MAX_LEVEL; level++) {
      expect(totalXpForLevel(level + 1) - totalXpForLevel(level)).toBe(xpToAdvanceFrom(level));
      expect(xpToAdvanceFrom(level)).toBe(50 * level);
    }
  });

  it("matches the approved table of total XP", () => {
    expect([1, 2, 3, 4, 5, 10].map(totalXpForLevel)).toEqual([0, 50, 150, 300, 500, 2250]);
  });

  it.each([
    [0, 1],
    [49, 1],
    [50, 2],
    [149, 2],
    [150, 3],
    [500, 5],
    [2249, 9],
    [2250, 10],
    [1_000_000, 10],
  ])("%i XP is level %i", (xp, level) => {
    expect(levelFromXp(xp)).toBe(level);
  });

  it("reports progress inside the current level", () => {
    expect(levelProgress(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 50 });
    expect(levelProgress(190)).toEqual({ level: 3, xpIntoLevel: 40, xpForNextLevel: 150 });
    expect(levelProgress(2300)).toEqual({ level: 10, xpIntoLevel: 50, xpForNextLevel: null });
  });

  it("treats invalid XP as 0", () => {
    for (const xp of [-5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(levelProgress(xp)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 50 });
    }
    expect(levelFromXp(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("clamps totalXpForLevel to levels 1–10", () => {
    expect(totalXpForLevel(0)).toBe(0);
    expect(totalXpForLevel(11)).toBe(totalXpForLevel(10));
  });
});

describe("unlocks (P2-3, U-A)", () => {
  it("unlocks plots 7–9 at levels 2, 4, 6 and Corn / Strawberry at levels 3, 5", () => {
    expect(LEVEL_UNLOCKS).toEqual([
      { level: 2, unlock: { kind: "plot", plotIndex: 6 } },
      { level: 3, unlock: { kind: "crop", cropId: "corn" } },
      { level: 4, unlock: { kind: "plot", plotIndex: 7 } },
      { level: 5, unlock: { kind: "crop", cropId: "strawberry" } },
      { level: 6, unlock: { kind: "plot", plotIndex: 8 } },
    ]);
  });

  it("keeps every Phase 1 plot and crop available from level 1", () => {
    expect(BASE_PLOT_COUNT).toBe(6);
    expect(plotCountForLevel(1)).toBe(6);
    for (let index = 0; index < BASE_PLOT_COUNT; index++) expect(plotUnlockLevel(index)).toBe(1);
    for (const cropId of PHASE1_CROPS) expect(cropUnlockLevel(cropId)).toBe(1);
  });

  it("counts usable plots per level", () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(plotCountForLevel)).toEqual([6, 7, 7, 8, 8, 9, 9]);
    expect(MAX_PLOT_COUNT).toBe(plotCountForLevel(MAX_LEVEL));
    expect(FARM_PLOT_COUNT).toBe(MAX_PLOT_COUNT);
  });

  it("gives each new plot's unlock level and rejects out-of-range plots", () => {
    expect([6, 7, 8].map(plotUnlockLevel)).toEqual([2, 4, 6]);
    for (const index of [-1, 9, 1.5, Number.NaN]) expect(plotUnlockLevel(index)).toBeUndefined();
  });

  it("gives the progression crops' unlock levels", () => {
    expect(cropUnlockLevel("corn")).toBe(3);
    expect(cropUnlockLevel("strawberry")).toBe(5);
  });

  it("adds the progression crops to the farming crops with the approved values (P2-4)", () => {
    for (const cropId of PROGRESSION_CROP_IDS) expect(CROP_IDS).toContain(cropId);
    expect(getCrop("corn")).toMatchObject({ growthMs: 180_000, coinReward: 9, xpReward: 4 });
    expect(getCrop("strawberry")).toMatchObject({ growthMs: 480_000, coinReward: 20, xpReward: 9 });
  });

  it("lists the unlocks gained between two levels", () => {
    expect(unlocksBetween(1, 1)).toEqual([]);
    expect(unlocksBetween(2, 3)).toEqual([{ kind: "crop", cropId: "corn" }]);
    expect(unlocksBetween(1, 10)).toHaveLength(LEVEL_UNLOCKS.length);
  });
});

describe("quests (P2-5, Q-A)", () => {
  it("defines the approved chain of 8 quests in order", () => {
    expect(QUESTS.map((quest) => [quest.title, quest.reward.coins, quest.reward.xp])).toEqual([
      ["Harvest 3 Wheat", 10, 5],
      ["Plant 1 Carrot", 10, 5],
      ["Harvest 2 Carrots", 20, 10],
      ["Harvest 1 Tomato", 20, 10],
      ["Reach level 3", 30, 15],
      ["Harvest 2 Corn", 30, 15],
      ["Harvest 20 crops", 50, 25],
      ["Reach level 5", 80, 40],
    ]);
    expect(new Set(QUESTS.map((quest) => quest.id)).size).toBe(QUESTS.length);
  });

  it("only names known crops, unlocked no later than the quests reach that level", () => {
    const knownCrops: readonly string[] = CROP_IDS;
    let guaranteedLevel = 1;
    for (const { goal } of QUESTS) {
      if (goal.kind === "reach_level") {
        guaranteedLevel = goal.level;
        continue;
      }
      if (goal.cropId === undefined) continue;
      expect(knownCrops).toContain(goal.cropId);
      expect(cropUnlockLevel(goal.cropId)).toBeLessThanOrEqual(guaranteedLevel);
    }
  });

  it("has positive targets and rewards", () => {
    for (const quest of QUESTS) {
      expect(questTarget(quest.goal)).toBeGreaterThan(0);
      expect(quest.reward.coins).toBeGreaterThan(0);
      expect(quest.reward.xp).toBeGreaterThan(0);
    }
    expect(questTarget({ kind: "reach_level", level: 3 })).toBe(3);
  });

  it("returns the quest at a chain position, or undefined past the end", () => {
    expect(questAt(0)?.id).toBe("harvest_wheat_3");
    expect(questAt(QUESTS.length)).toBeUndefined();
    expect(questAt(-1)).toBeUndefined();
    expect(questAt(0.5)).toBeUndefined();
  });
});
