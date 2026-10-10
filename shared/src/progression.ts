/**
 * Static progression data shared by client and server (Phase 2).
 *
 * Approved design (docs/reports/phase2/PHASE2_PROGRESSION_PLAN_REPORT.md,
 * decisions P2-2, P2-3, P2-5):
 * - Level is derived from total XP; it is never stored, so it cannot drift.
 *   XP needed to go from level L to L + 1 is 50 × L; the maximum is level 10.
 * - Levels only add content: plots 7–9 and two new crops. Phase 1 crops and
 *   plots stay available from level 1.
 * - Eight tutorial quests in a fixed order, claimed one at a time.
 *
 * Only definitions and pure calculations live here. The server decides when
 * XP is granted, enforces unlocks and counts quest progress.
 */

export const MAX_LEVEL = 10;

/** XP needed to go from `level` to `level + 1`. */
export function xpToAdvanceFrom(level: number): number {
  return 50 * level;
}

/** Total XP at which `level` starts (level 1 starts at 0). */
export function totalXpForLevel(level: number): number {
  const capped = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  // Sum of 50 × k for k = 1 … capped − 1.
  return 25 * capped * (capped - 1);
}

export interface LevelProgress {
  level: number;
  /** XP earned since the current level started. */
  xpIntoLevel: number;
  /** XP needed for the next level, or null at MAX_LEVEL. */
  xpForNextLevel: number | null;
}

/** Level and progress for a total XP amount. Invalid or negative XP counts as 0. */
export function levelProgress(totalXp: number): LevelProgress {
  const xp = Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(totalXp) : 0;
  let level = 1;
  while (level < MAX_LEVEL && xp >= totalXpForLevel(level + 1)) level++;
  return {
    level,
    xpIntoLevel: xp - totalXpForLevel(level),
    xpForNextLevel: level < MAX_LEVEL ? xpToAdvanceFrom(level) : null,
  };
}

export function levelFromXp(totalXp: number): number {
  return levelProgress(totalXp).level;
}

// ---------- unlocks ----------

/** Plots every player has from level 1 (the Phase 1 farm). */
export const BASE_PLOT_COUNT = 6;
/** Plots at the highest unlock. */
export const MAX_PLOT_COUNT = 9;

/** Crops added in Phase 2 (also in farming.ts CROP_IDS), unlocked by level. */
export const PROGRESSION_CROP_IDS = ["corn", "strawberry"] as const;
export type ProgressionCropId = (typeof PROGRESSION_CROP_IDS)[number];

export type Unlock =
  | { kind: "plot"; plotIndex: number }
  | { kind: "crop"; cropId: ProgressionCropId };

export interface LevelUnlock {
  level: number;
  unlock: Unlock;
}

/** Ordered by level. Levels 7–10 unlock nothing new in Phase 2. */
export const LEVEL_UNLOCKS: readonly LevelUnlock[] = [
  { level: 2, unlock: { kind: "plot", plotIndex: 6 } },
  { level: 3, unlock: { kind: "crop", cropId: "corn" } },
  { level: 4, unlock: { kind: "plot", plotIndex: 7 } },
  { level: 5, unlock: { kind: "crop", cropId: "strawberry" } },
  { level: 6, unlock: { kind: "plot", plotIndex: 8 } },
];

/** Usable plots at `level` (6 at level 1, up to MAX_PLOT_COUNT). */
export function plotCountForLevel(level: number): number {
  return BASE_PLOT_COUNT + LEVEL_UNLOCKS.filter((entry) => entry.unlock.kind === "plot" && entry.level <= level).length;
}

/** Level that unlocks a plot; 1 for the base plots, undefined if out of range. */
export function plotUnlockLevel(plotIndex: number): number | undefined {
  if (!Number.isInteger(plotIndex) || plotIndex < 0 || plotIndex >= MAX_PLOT_COUNT) return undefined;
  if (plotIndex < BASE_PLOT_COUNT) return 1;
  return LEVEL_UNLOCKS.find((entry) => entry.unlock.kind === "plot" && entry.unlock.plotIndex === plotIndex)?.level;
}

/** Level that unlocks a crop; 1 for every crop that is not a progression crop. */
export function cropUnlockLevel(cropId: string): number {
  return LEVEL_UNLOCKS.find((entry) => entry.unlock.kind === "crop" && entry.unlock.cropId === cropId)?.level ?? 1;
}

/** Unlocks gained when moving from `fromLevel` to `toLevel` (for level-up messages). */
export function unlocksBetween(fromLevel: number, toLevel: number): Unlock[] {
  return LEVEL_UNLOCKS.filter((entry) => entry.level > fromLevel && entry.level <= toLevel).map((entry) => entry.unlock);
}

// ---------- quests ----------

/** What a quest counts. `cropId` omitted on a harvest goal means any crop. */
export type QuestGoal =
  | { kind: "harvest"; cropId?: string; count: number }
  | { kind: "plant"; cropId: string; count: number }
  | { kind: "reach_level"; level: number };

export interface QuestReward {
  coins: number;
  xp: number;
}

export interface QuestDefinition {
  id: string;
  /** Short text shown to players, e.g. "Harvest 3 Wheat". */
  title: string;
  goal: QuestGoal;
  reward: QuestReward;
}

/** The tutorial chain, in the order players get it (P2-5, Q-A). */
export const QUESTS: readonly QuestDefinition[] = [
  { id: "harvest_wheat_3", title: "Harvest 3 Wheat", goal: { kind: "harvest", cropId: "wheat", count: 3 }, reward: { coins: 10, xp: 5 } },
  { id: "plant_carrot_1", title: "Plant 1 Carrot", goal: { kind: "plant", cropId: "carrot", count: 1 }, reward: { coins: 10, xp: 5 } },
  { id: "harvest_carrot_2", title: "Harvest 2 Carrots", goal: { kind: "harvest", cropId: "carrot", count: 2 }, reward: { coins: 20, xp: 10 } },
  { id: "harvest_tomato_1", title: "Harvest 1 Tomato", goal: { kind: "harvest", cropId: "tomato", count: 1 }, reward: { coins: 20, xp: 10 } },
  { id: "reach_level_3", title: "Reach level 3", goal: { kind: "reach_level", level: 3 }, reward: { coins: 30, xp: 15 } },
  { id: "harvest_corn_2", title: "Harvest 2 Corn", goal: { kind: "harvest", cropId: "corn", count: 2 }, reward: { coins: 30, xp: 15 } },
  { id: "harvest_any_20", title: "Harvest 20 crops", goal: { kind: "harvest", count: 20 }, reward: { coins: 50, xp: 25 } },
  { id: "reach_level_5", title: "Reach level 5", goal: { kind: "reach_level", level: 5 }, reward: { coins: 80, xp: 40 } },
];

/** Target number for a goal (the level for reach_level goals). */
export function questTarget(goal: QuestGoal): number {
  return goal.kind === "reach_level" ? goal.level : goal.count;
}

/** Quest at a position in the chain, or undefined when the chain is finished. */
export function questAt(index: number): QuestDefinition | undefined {
  return Number.isInteger(index) && index >= 0 ? QUESTS[index] : undefined;
}
