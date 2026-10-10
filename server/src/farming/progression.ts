/**
 * Server-side progression rules (Phase 2): level changes and quest claims.
 * Pure functions: no I/O, no clock.
 *
 * Level is always derived from FarmData.xp (shared/progression.ts), so it is
 * never stored and cannot drift. Quest state lives in ./quests.ts.
 */
import type { ErrorCode } from "@farmverse/shared/errors";
import { levelFromXp, unlocksBetween, type QuestDefinition, type Unlock } from "@farmverse/shared/progression";
import { activeQuest, type QuestState } from "./quests.js";
import { assertFarmData, gainXp, type FarmData } from "./rules.js";

// ---------- level-ups ----------

export interface LevelChange {
  from: number;
  to: number;
  /** Plots and crops unlocked by this change, in level order. */
  unlocks: Unlock[];
}

/** The level-up caused by going from `xpBefore` to `xpAfter`, or null if the level did not change. */
export function levelChange(xpBefore: number, xpAfter: number): LevelChange | null {
  const from = levelFromXp(xpBefore);
  const to = levelFromXp(xpAfter);
  return to > from ? { from, to, unlocks: unlocksBetween(from, to) } : null;
}

// ---------- quests ----------

export type QuestError = Extract<ErrorCode, "QUEST_NOT_COMPLETE">;

/**
 * Claims the active quest's reward: adds its coins and XP to the farm (with
 * seeds for any crop the level-up unlocks) and moves to the next quest.
 * Fails with QUEST_NOT_COMPLETE when the active quest is not complete or the
 * chain is finished.
 */
export function claimQuest(
  farm: FarmData,
  state: QuestState,
):
  | { ok: true; farm: FarmData; quests: QuestState; quest: QuestDefinition; levelChange: LevelChange | null }
  | { ok: false; error: QuestError } {
  assertFarmData(farm);
  const active = activeQuest(state, farm.xp);
  if (active === null || !active.complete) return { ok: false, error: "QUEST_NOT_COMPLETE" };

  const { coins, xp } = active.quest.reward;
  return {
    ok: true,
    farm: gainXp({ ...farm, coins: farm.coins + coins }, xp),
    quests: { index: state.index + 1, progress: 0 },
    quest: active.quest,
    levelChange: levelChange(farm.xp, farm.xp + xp),
  };
}
