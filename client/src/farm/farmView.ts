/**
 * Pure presentation helpers for the farm scene.
 *
 * Everything here only formats what the server sent. Growth progress uses the
 * server's `readyAt` and an estimate of the server clock (`serverTime` plus the
 * time elapsed on the client since that response); the server alone decides
 * whether a harvest or a seed refill is allowed.
 */
import type { FarmState, PlotState, ProgressionState, QuestReward, QuestView, SeedRefillState } from "@farmverse/shared/api";
import type { ErrorCode } from "@farmverse/shared/errors";
import { CROPS, getCrop, getItem, type CropId, type ItemId } from "@farmverse/shared/farming";
import { cropUnlockLevel, plotUnlockLevel, unlocksBetween, type Unlock } from "@farmverse/shared/progression";

/** Converts client time to an estimate of server time. */
export interface ServerClock {
  /** serverTime − client Date.now() when the state was received. */
  offsetMs: number;
}

export function clockFromState(state: FarmState, clientNow: number): ServerClock {
  return { offsetMs: state.serverTime - clientNow };
}

export function serverNow(clock: ServerClock, clientNow: number): number {
  return clientNow + clock.offsetMs;
}

export type PlotView =
  | { kind: "empty" }
  | { kind: "growing"; cropId: CropId; remainingMs: number; progress: number }
  | { kind: "ready"; cropId: CropId };

export function plotView(plot: PlotState, now: number): PlotView {
  const crop = plot.crop;
  if (crop === null) return { kind: "empty" };
  if (now >= crop.readyAt) return { kind: "ready", cropId: crop.cropId };

  const total = crop.readyAt - crop.plantedAt;
  const elapsed = Math.max(0, now - crop.plantedAt);
  return {
    kind: "growing",
    cropId: crop.cropId,
    remainingMs: crop.readyAt - now,
    progress: total > 0 ? Math.min(1, elapsed / total) : 1,
  };
}

/** "45 s", "2 min", "4 min 5 s" — rounded up to whole seconds. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

export function quantityOf(state: FarmState, itemId: ItemId): number {
  return state.inventory.find((entry) => entry.itemId === itemId)?.quantity ?? 0;
}

export function seedCount(state: FarmState, cropId: CropId): number {
  return quantityOf(state, getCrop(cropId).seedItemId);
}

/** "Wheat 2 · Carrot 0 · Tomato 1" for the given item ids (seeds or produce). */
export function inventoryLine(state: FarmState, itemIds: readonly ItemId[]): string {
  return itemIds.map((itemId) => `${getItem(itemId).name} ${quantityOf(state, itemId)}`).join(" · ");
}

/** "Harvest: Wheat 2 · Carrot 0 · …" for unlocked crops and any produce still held. */
export function produceLine(state: FarmState): string {
  const ids = CROPS.filter((crop) => !isCropLocked(state, crop.id) || quantityOf(state, crop.produceItemId) > 0).map(
    (crop) => crop.produceItemId,
  );
  return `Harvest: ${inventoryLine(state, ids)}`;
}

/** Second line of an empty plot's label: what a tap will do with the selected seed. */
export function emptyPlotHint(state: FarmState, cropId: CropId): string {
  return seedCount(state, cropId) > 0 ? "Tap to plant" : `No ${getCrop(cropId).name} seeds`;
}

/** Label for the seed refill button, or null when it should be hidden. */
export function refillLabel(refill: SeedRefillState, now: number): string | null {
  if (!refill.eligible || refill.availableAt === null) return null;
  const waitMs = refill.availableAt - now;
  return waitMs > 0 ? `Free seeds in ${formatDuration(waitMs)}` : "Get free seeds";
}

// ---------- progression (Phase 2) ----------

/** "Level 3 · 40/150 XP", or "Level 10 · Max level". */
export function levelLine(progression: ProgressionState): string {
  const { level, xpIntoLevel, xpForNextLevel } = progression;
  return xpForNextLevel === null ? `Level ${level} · Max level` : `Level ${level} · ${xpIntoLevel}/${xpForNextLevel} XP`;
}

/** Filled share of the XP bar, 0 … 1 (full at the maximum level). */
export function xpFraction(progression: ProgressionState): number {
  const { xpIntoLevel, xpForNextLevel } = progression;
  if (xpForNextLevel === null) return 1;
  return Math.min(1, Math.max(0, xpIntoLevel / xpForNextLevel));
}

/** Locked plots are shown with the level that unlocks them; only the server can unlock them. */
export function isPlotLocked(state: FarmState, plotIndex: number): boolean {
  return plotIndex >= state.progression.unlockedPlotCount;
}

/** Level that unlocks a plot (for "Level N" labels). */
export function plotLevel(plotIndex: number): number {
  return plotUnlockLevel(plotIndex) ?? 1;
}

export function isCropLocked(state: FarmState, cropId: CropId): boolean {
  return cropUnlockLevel(cropId) > state.progression.level;
}

/** "Quest: Harvest 3 Wheat (1/3)"; "All quests done!" at the end of the chain. */
export function questLine(quest: QuestView | null): string {
  if (quest === null) return "All quests done!";
  if (quest.complete) return `Quest done: ${quest.title}`;
  return `Quest: ${quest.title} (${quest.progress}/${quest.target})`;
}

/** "+10 coins · +5 XP" */
export function rewardText(reward: QuestReward): string {
  return `+${reward.coins} coins · +${reward.xp} XP`;
}

function unlockName(unlock: Unlock): string {
  return unlock.kind === "plot" ? `Plot ${unlock.plotIndex + 1}` : getCrop(unlock.cropId).name;
}

/** "Level 3! Corn unlocked." when `after` is a higher level than `before`, else null. */
export function levelUpText(before: ProgressionState, after: ProgressionState): string | null {
  if (after.level <= before.level) return null;
  const names = unlocksBetween(before.level, after.level).map(unlockName);
  if (names.length === 0) return `Level ${after.level}!`;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Level ${after.level}! ${list} unlocked.`;
}

const ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  PLOT_NOT_EMPTY: "This plot already has a crop.",
  PLOT_EMPTY: "Nothing to harvest here.",
  CROP_NOT_READY: "Not ready yet.",
  ITEM_NOT_OWNED: "No seeds left for that crop.",
  REFILL_NOT_ALLOWED: "Free seeds are not available yet.",
  REQUEST_ID_REUSED: "That action was already handled. Farm refreshed.",
  INVALID_REQUEST: "The game sent an invalid request. Farm refreshed.",
  UNAUTHORIZED: "Your farm could not be found.",
  LEVEL_TOO_LOW: "Your level is too low for that yet.",
  QUEST_NOT_COMPLETE: "Finish the quest first.",
};

export function errorText(code: ErrorCode): string {
  return ERROR_TEXT[code] ?? "Something went wrong. Please try again.";
}
