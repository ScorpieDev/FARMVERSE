/**
 * Server-side progression rules (Phase 2). Pure functions: no I/O, no clock.
 *
 * Level is always derived from FarmData.xp (shared/progression.ts), so it is
 * never stored and cannot drift. Quest state is kept beside FarmData: the
 * caller records plant / harvest events in the same transaction as the
 * successful action and persists the returned state (storage: Phase 2 step
 * 2.3, API: step 2.4).
 *
 * Only the active quest counts progress; earlier actions do not carry over to
 * the next quest. "Reach level" quests are not counted: their progress is the
 * current level, so a quest that is already satisfied when it becomes active
 * can be claimed at once.
 */
import type { ErrorCode } from "@farmverse/shared/errors";
import {
  QUESTS,
  levelFromXp,
  questTarget,
  unlocksBetween,
  type QuestDefinition,
  type Unlock,
} from "@farmverse/shared/progression";
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

/** Position in the quest chain and progress of the active quest. */
export interface QuestState {
  /** Index into QUESTS; QUESTS.length once the chain is finished. */
  readonly index: number;
  /** Counted progress of the active quest (unused for reach_level quests). */
  readonly progress: number;
}

export type QuestEvent = { kind: "plant" | "harvest"; cropId: string };

export type QuestError = Extract<ErrorCode, "QUEST_NOT_COMPLETE">;

/** The active quest as players see it; null once the chain is finished. */
export interface ActiveQuest {
  quest: QuestDefinition;
  progress: number;
  target: number;
  complete: boolean;
}

export function startingQuestState(): QuestState {
  return { index: 0, progress: 0 };
}

/** Checks QuestState invariants (corrupted storage is a programming error). */
export function assertQuestState(state: QuestState): void {
  const { index, progress } = state;
  if (!Number.isSafeInteger(index) || index < 0 || index > QUESTS.length) {
    throw new RangeError(`Invalid quest state: index ${index}`);
  }
  if (!Number.isSafeInteger(progress) || progress < 0) {
    throw new RangeError(`Invalid quest state: progress ${progress}`);
  }
}

function goalMatches(quest: QuestDefinition, event: QuestEvent): boolean {
  const { goal } = quest;
  if (goal.kind === "reach_level" || goal.kind !== event.kind) return false;
  return goal.cropId === undefined || goal.cropId === event.cropId;
}

/** Counts a successful plant or harvest towards the active quest, capped at its target. */
export function recordQuestEvent(state: QuestState, event: QuestEvent): QuestState {
  assertQuestState(state);
  const quest = QUESTS[state.index];
  if (quest === undefined || !goalMatches(quest, event)) return state;
  const target = questTarget(quest.goal);
  return state.progress >= target ? state : { index: state.index, progress: state.progress + 1 };
}

/** The active quest with its progress for a farm with `xp`, or null when the chain is finished. */
export function activeQuest(state: QuestState, xp: number): ActiveQuest | null {
  assertQuestState(state);
  const quest = QUESTS[state.index];
  if (quest === undefined) return null;
  const target = questTarget(quest.goal);
  const progress = Math.min(target, quest.goal.kind === "reach_level" ? levelFromXp(xp) : state.progress);
  return { quest, progress, target, complete: progress >= target };
}

/**
 * Claims the active quest's reward: adds its coins and XP to the farm (with
 * seeds for any crop the level-up unlocks) and moves to the next quest. Fails with QUEST_NOT_COMPLETE when the active
 * quest is not complete or the chain is finished.
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
