import { describe, expect, it } from "vitest";
import { CROP_IDS, FARM_PLOT_COUNT } from "@farmverse/shared/farming";
import { QUESTS } from "@farmverse/shared/progression";
import {
  activeQuest,
  assertQuestState,
  claimQuest,
  levelChange,
  recordQuestEvent,
  startingQuestState,
  type QuestState,
} from "./progression.js";
import { createStarterFarm, plant, unlockError, type FarmData } from "./rules.js";

const T = 1_700_000_000_000;

function farmWith(values: Partial<FarmData> = {}): FarmData {
  return { ...createStarterFarm(), ...values };
}

/** Quest state at the quest with this id. */
function at(id: string, progress = 0): QuestState {
  const index = QUESTS.findIndex((quest) => quest.id === id);
  if (index < 0) throw new Error(id);
  return { index, progress };
}

describe("unlockError", () => {
  it("allows every Phase 1 plot and crop at level 1", () => {
    for (let plotIndex = 0; plotIndex < FARM_PLOT_COUNT; plotIndex++) {
      for (const cropId of CROP_IDS) expect(unlockError(0, plotIndex, cropId)).toBeNull();
    }
  });

  it("locks plots 7–9 until levels 2, 4 and 6", () => {
    expect(unlockError(49, 6, "wheat")).toBe("LEVEL_TOO_LOW");
    expect(unlockError(50, 6, "wheat")).toBeNull();
    expect(unlockError(299, 7, "wheat")).toBe("LEVEL_TOO_LOW");
    expect(unlockError(300, 7, "wheat")).toBeNull();
    expect(unlockError(749, 8, "wheat")).toBe("LEVEL_TOO_LOW"); // level 6 starts at 750 XP
    expect(unlockError(750, 8, "wheat")).toBeNull();
  });

  it("locks Corn until level 3 and Strawberry until level 5", () => {
    expect(unlockError(149, 0, "corn")).toBe("LEVEL_TOO_LOW");
    expect(unlockError(150, 0, "corn")).toBeNull();
    expect(unlockError(499, 0, "strawberry")).toBe("LEVEL_TOO_LOW");
    expect(unlockError(500, 0, "strawberry")).toBeNull();
  });

  it("treats plots outside the unlock table as locked", () => {
    expect(unlockError(1_000_000, 9, "wheat")).toBe("LEVEL_TOO_LOW");
    expect(unlockError(1_000_000, -1, "wheat")).toBe("LEVEL_TOO_LOW");
  });
});

describe("plant keeps Phase 1 behaviour", () => {
  it("still plants every Phase 1 crop on a level-1 farm", () => {
    for (const cropId of CROP_IDS) expect(plant(createStarterFarm(), 0, cropId, T).ok).toBe(true);
  });
});

describe("levelChange", () => {
  it("is null when the level does not change", () => {
    expect(levelChange(0, 49)).toBeNull();
    expect(levelChange(60, 60)).toBeNull();
  });

  it("reports the new level and its unlocks", () => {
    expect(levelChange(45, 51)).toEqual({ from: 1, to: 2, unlocks: [{ kind: "plot", plotIndex: 6 }] });
    expect(levelChange(140, 160)).toEqual({ from: 2, to: 3, unlocks: [{ kind: "crop", cropId: "corn" }] });
  });

  it("lists every unlock when several levels are crossed at once", () => {
    expect(levelChange(0, 500)).toEqual({
      from: 1,
      to: 5,
      unlocks: [
        { kind: "plot", plotIndex: 6 },
        { kind: "crop", cropId: "corn" },
        { kind: "plot", plotIndex: 7 },
        { kind: "crop", cropId: "strawberry" },
      ],
    });
  });
});

describe("quest progress", () => {
  it("starts at the first quest with no progress", () => {
    expect(startingQuestState()).toEqual({ index: 0, progress: 0 });
    expect(activeQuest(startingQuestState(), 0)).toMatchObject({
      quest: { id: "harvest_wheat_3" },
      progress: 0,
      target: 3,
      complete: false,
    });
  });

  it("counts only events that match the active quest", () => {
    let state = startingQuestState();
    state = recordQuestEvent(state, { kind: "plant", cropId: "wheat" });
    state = recordQuestEvent(state, { kind: "harvest", cropId: "carrot" });
    expect(state.progress).toBe(0);
    state = recordQuestEvent(state, { kind: "harvest", cropId: "wheat" });
    expect(state).toEqual({ index: 0, progress: 1 });
  });

  it("caps progress at the target and marks the quest complete", () => {
    let state = startingQuestState();
    for (let i = 0; i < 5; i++) state = recordQuestEvent(state, { kind: "harvest", cropId: "wheat" });
    expect(state.progress).toBe(3);
    expect(activeQuest(state, 0)?.complete).toBe(true);
  });

  it("counts any crop for a harvest goal without a crop", () => {
    let state = at("harvest_any_20");
    for (const cropId of ["wheat", "carrot", "tomato", "corn"]) {
      state = recordQuestEvent(state, { kind: "harvest", cropId });
    }
    expect(state.progress).toBe(4);
    expect(recordQuestEvent(state, { kind: "plant", cropId: "wheat" })).toBe(state);
  });

  it("derives reach-level progress from XP instead of counting events", () => {
    const state = at("reach_level_3");
    expect(recordQuestEvent(state, { kind: "harvest", cropId: "wheat" })).toBe(state);
    expect(activeQuest(state, 60)).toMatchObject({ progress: 2, target: 3, complete: false });
    expect(activeQuest(state, 150)).toMatchObject({ progress: 3, complete: true });
    expect(activeQuest(state, 2250)).toMatchObject({ progress: 3, complete: true });
  });

  it("has no active quest and ignores events once the chain is finished", () => {
    const done = { index: QUESTS.length, progress: 0 };
    expect(activeQuest(done, 0)).toBeNull();
    expect(recordQuestEvent(done, { kind: "harvest", cropId: "wheat" })).toBe(done);
  });

  it("rejects corrupted quest state", () => {
    for (const state of [
      { index: -1, progress: 0 },
      { index: QUESTS.length + 1, progress: 0 },
      { index: 0.5, progress: 0 },
      { index: 0, progress: -1 },
      { index: 0, progress: Number.NaN },
    ]) {
      expect(() => assertQuestState(state)).toThrow(RangeError);
      expect(() => recordQuestEvent(state, { kind: "harvest", cropId: "wheat" })).toThrow(RangeError);
    }
  });
});

describe("claimQuest", () => {
  it("refuses an incomplete quest without changing anything", () => {
    const farm = farmWith();
    expect(claimQuest(farm, at("harvest_wheat_3", 2))).toEqual({ ok: false, error: "QUEST_NOT_COMPLETE" });
  });

  it("refuses when the chain is finished", () => {
    expect(claimQuest(farmWith(), { index: QUESTS.length, progress: 0 })).toEqual({
      ok: false,
      error: "QUEST_NOT_COMPLETE",
    });
  });

  it("adds the reward and moves to the next quest with fresh progress", () => {
    const farm = farmWith({ coins: 7, xp: 3 });
    const result = claimQuest(farm, at("harvest_wheat_3", 3));
    expect(result).toMatchObject({
      ok: true,
      farm: { coins: 17, xp: 8 },
      quests: { index: 1, progress: 0 },
      quest: { id: "harvest_wheat_3" },
      levelChange: null,
    });
    // Input is not modified.
    expect(farm).toMatchObject({ coins: 7, xp: 3 });
  });

  it("reports a level-up caused by the reward", () => {
    const result = claimQuest(farmWith({ xp: 140 }), at("harvest_tomato_1", 1));
    expect(result).toMatchObject({ ok: true, farm: { xp: 150 }, levelChange: { from: 2, to: 3 } });
  });

  it("lets a reach-level quest be claimed as soon as it becomes active if already satisfied", () => {
    const farm = farmWith({ xp: 200 });
    const result = claimQuest(farm, at("reach_level_3"));
    expect(result).toMatchObject({ ok: true, farm: { coins: 30, xp: 215 }, quests: at("harvest_corn_2") });
  });

  it("walks the whole chain and pays every reward exactly once", () => {
    let farm = farmWith();
    let quests = startingQuestState();
    for (const quest of QUESTS) {
      const goal = quest.goal;
      if (goal.kind === "reach_level") {
        farm = { ...farm, xp: Math.max(farm.xp, [0, 0, 50, 150, 300, 500][goal.level] ?? 0) };
      } else {
        for (let i = 0; i < goal.count; i++) quests = recordQuestEvent(quests, { kind: goal.kind, cropId: goal.cropId ?? "wheat" });
      }
      const result = claimQuest(farm, quests);
      if (!result.ok) throw new Error(`could not claim ${quest.id}`);
      expect(result.farm.coins - farm.coins).toBe(quest.reward.coins);
      expect(result.farm.xp - farm.xp).toBe(quest.reward.xp);
      farm = result.farm;
      quests = result.quests;
    }
    expect(quests).toEqual({ index: QUESTS.length, progress: 0 });
    expect(claimQuest(farm, quests).ok).toBe(false);
  });

  it("rejects corrupted farm data", () => {
    expect(() => claimQuest({ ...farmWith(), xp: -1 }, at("harvest_wheat_3", 3))).toThrow(RangeError);
  });
});
