import { describe, expect, it } from "vitest";
import { SEED_REFILL_COOLDOWN_MS, type CropId } from "@farmverse/shared/farming";
import { QUESTS } from "@farmverse/shared/progression";
import { claimQuest, levelChange } from "./progression.js";
import { activeQuest, assertQuestState, recordQuestEvent, startingQuestState, type QuestState } from "./quests.js";
import { createStarterFarm, gainXp, harvest, plant, refillSeeds, unlockError, type FarmData } from "./rules.js";

const T = 1_700_000_000_000;
const PHASE1_CROPS: readonly CropId[] = ["wheat", "carrot", "tomato"];

/** A level-1-style farm with no seeds unless given, so refill eligibility is easy to set up. */
function farmWith(values: Partial<FarmData> = {}): FarmData {
  const empty = Object.fromEntries(Object.keys(createStarterFarm().inventory).map((id) => [id, 0]));
  return { ...createStarterFarm(), inventory: empty as FarmData["inventory"], ...values };
}

/** Quest state at the quest with this id. */
function at(id: string, progress = 0): QuestState {
  const index = QUESTS.findIndex((quest) => quest.id === id);
  if (index < 0) throw new Error(id);
  return { index, progress };
}

describe("unlockError", () => {
  it("allows every Phase 1 plot and crop at level 1", () => {
    for (let plotIndex = 0; plotIndex < 6; plotIndex++) {
      for (const cropId of PHASE1_CROPS) expect(unlockError(0, plotIndex, cropId)).toBeNull();
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
    for (const cropId of PHASE1_CROPS) expect(plant(createStarterFarm(), 0, cropId, T).ok).toBe(true);
  });

  it("refuses Corn, Strawberry and plots 7–9 on a level-1 farm, even with seeds", () => {
    const farm = farmWith({ inventory: { ...createStarterFarm().inventory, corn_seed: 5, strawberry_seed: 5 } });
    expect(plant(farm, 0, "corn", T)).toEqual({ ok: false, error: "LEVEL_TOO_LOW" });
    expect(plant(farm, 0, "strawberry", T)).toEqual({ ok: false, error: "LEVEL_TOO_LOW" });
    expect(plant(farm, 6, "wheat", T)).toEqual({ ok: false, error: "LEVEL_TOO_LOW" });
  });

  it("plants unlocked content once the level is reached", () => {
    const farm = farmWith({ xp: 500, inventory: { ...createStarterFarm().inventory, corn_seed: 1, strawberry_seed: 1 } });
    expect(plant(farm, 6, "corn", T).ok).toBe(true);
    expect(plant(farm, 7, "strawberry", T).ok).toBe(true);
    expect(plant(farm, 8, "wheat", T)).toEqual({ ok: false, error: "LEVEL_TOO_LOW" }); // level 6
  });
});

describe("seeds for unlocked crops", () => {
  it("starts new players with seeds of the level-1 crops only", () => {
    const { inventory } = createStarterFarm();
    expect([inventory.wheat_seed, inventory.carrot_seed, inventory.tomato_seed]).toEqual([5, 5, 5]);
    expect([inventory.corn_seed, inventory.strawberry_seed]).toEqual([0, 0]);
  });

  it("grants 5 seeds of a crop exactly when its level is reached", () => {
    expect(gainXp(farmWith({ xp: 140 }), 9).inventory.corn_seed).toBe(0); // 149: still level 2
    const unlocked = gainXp(farmWith({ xp: 140 }), 10); // 150: level 3
    expect(unlocked).toMatchObject({ xp: 150 });
    expect(unlocked.inventory.corn_seed).toBe(5);
    // Further XP inside or above level 3 does not grant Corn again.
    expect(gainXp(unlocked, 100).inventory.corn_seed).toBe(5);
  });

  it("grants every crop unlocked by a multi-level jump, keeping existing seeds", () => {
    const farm = gainXp(farmWith({ inventory: { ...createStarterFarm().inventory, corn_seed: 2 } }), 500);
    expect([farm.inventory.corn_seed, farm.inventory.strawberry_seed]).toEqual([7, 5]);
  });

  it("grants unlock seeds from the harvest that levels up, and does not start the refill cooldown", () => {
    const farm = farmWith({ xp: 144, plots: [{ cropId: "tomato", plantedAt: T }, ...createStarterFarm().plots.slice(1)] });
    const result = harvest(farm, 0, T + 300_000); // tomato: +6 XP → 150
    if (!result.ok) throw new Error(result.error);
    expect(result.farm.xp).toBe(150);
    expect(result.farm.inventory.corn_seed).toBe(5);
    expect(result.farm.seedRefillAvailableAt).toBeNull();
  });

  it("refills seeds of every crop unlocked at the player's level", () => {
    const level1 = refillSeeds(farmWith({}), T);
    const level3 = refillSeeds(farmWith({ xp: 150 }), T);
    const level5 = refillSeeds(farmWith({ xp: 500 }), T + SEED_REFILL_COOLDOWN_MS);
    if (!level1.ok || !level3.ok || !level5.ok) throw new Error("refill failed");
    expect(level1.farm.inventory.corn_seed).toBe(0);
    expect(level3.farm.inventory).toMatchObject({ wheat_seed: 5, corn_seed: 5, strawberry_seed: 0 });
    expect(level5.farm.inventory).toMatchObject({ corn_seed: 5, strawberry_seed: 5 });
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

  it("reports a level-up caused by the reward and grants the unlocked crop's seeds", () => {
    const result = claimQuest(farmWith({ xp: 140 }), at("harvest_tomato_1", 1));
    expect(result).toMatchObject({ ok: true, farm: { xp: 150, inventory: { corn_seed: 5 } }, levelChange: { from: 2, to: 3 } });
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
