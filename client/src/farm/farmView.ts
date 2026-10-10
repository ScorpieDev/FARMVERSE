/**
 * Pure presentation helpers for the farm scene.
 *
 * Everything here only formats what the server sent. Growth progress uses the
 * server's `readyAt` and an estimate of the server clock (`serverTime` plus the
 * time elapsed on the client since that response); the server alone decides
 * whether a harvest or a seed refill is allowed.
 */
import type { FarmState, PlotState, SeedRefillState } from "@farmverse/shared/api";
import type { ErrorCode } from "@farmverse/shared/errors";
import { getCrop, getItem, type CropId, type ItemId } from "@farmverse/shared/farming";

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

/** Label for the seed refill button, or null when it should be hidden. */
export function refillLabel(refill: SeedRefillState, now: number): string | null {
  if (!refill.eligible || refill.availableAt === null) return null;
  const waitMs = refill.availableAt - now;
  return waitMs > 0 ? `Free seeds in ${formatDuration(waitMs)}` : "Get free seeds";
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
};

export function errorText(code: ErrorCode): string {
  return ERROR_TEXT[code] ?? "Something went wrong. Please try again.";
}
