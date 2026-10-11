/**
 * Edit mode helpers for the farm grid and decoration shop (Phase 3). Pure functions.
 *
 * The client only keeps a UI selection (a decoration to buy or place, or a
 * placed object) and the rotation for the next placement. Every tap that
 * would change the farm becomes an intent for the server (buy / place / move /
 * rotate / remove); prices, levels, coins, ownership, bounds, plots and
 * overlap are decided by the server, and the grid is always drawn from the
 * server's FarmState. Prices and levels shown here come from the shared
 * catalog and are only hints.
 */
import type { DecorationEntry, FarmState } from "@farmverse/shared/api";
import {
  DECORATIONS,
  PLOT_BLOCK_AREA,
  areasOverlap,
  footprint,
  getDecoration,
  type DecorationId,
  type GridPosition,
  type PlacedObject,
  type Rotation,
} from "@farmverse/shared/building";
import type { ErrorCode } from "@farmverse/shared/errors";

export type EditSelection =
  | { kind: "none" }
  | { kind: "decoration"; decorationId: DecorationId; rotation: Rotation }
  | { kind: "object"; objectId: number };

export const NO_SELECTION: EditSelection = { kind: "none" };

/** What a tap or button press in edit mode asks for. */
export type EditIntent =
  | { kind: "select"; selection: EditSelection }
  | { kind: "place"; decorationId: DecorationId; x: number; y: number; rotation: Rotation }
  | { kind: "move"; objectId: number; x: number; y: number }
  | { kind: "rotate"; objectId: number; rotation: Rotation }
  | { kind: "remove"; objectId: number }
  | { kind: "buy"; decorationId: DecorationId }
  | { kind: "message"; text: string };

/** True when the player's level is below the decoration's unlock level. */
export function isDecorationLocked(state: FarmState, decorationId: DecorationId): boolean {
  return state.progression.level < getDecoration(decorationId).unlockLevel;
}

export function stockOf(state: FarmState, decorationId: DecorationId): number {
  return state.decorations.find((entry: DecorationEntry) => entry.decorationId === decorationId)?.quantity ?? 0;
}

/** The placed object covering a tile, if any. */
export function objectAt(state: FarmState, tile: GridPosition): PlacedObject | undefined {
  const cell = { x: tile.x, y: tile.y, width: 1, height: 1 };
  return state.objects.find((object) => areasOverlap(footprint(object), cell));
}

export function isPlotTile(tile: GridPosition): boolean {
  return areasOverlap({ x: tile.x, y: tile.y, width: 1, height: 1 }, PLOT_BLOCK_AREA);
}

export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation;
}

/** Arrow showing which way an object faces (0° = up, clockwise). */
export function rotationArrow(rotation: Rotation): string {
  return { 0: "↑", 90: "→", 180: "↓", 270: "←" }[rotation];
}

/** Short text drawn on a placed object, e.g. "Bench →". */
export function objectLabel(object: PlacedObject): string {
  return `${getDecoration(object.decorationId).name} ${rotationArrow(object.rotation)}`;
}

/** Label of a decoration button: name, then owned-but-unplaced count and price, or the unlock level. */
export function stockLabel(state: FarmState, decorationId: DecorationId): string {
  const { name, price, unlockLevel } = getDecoration(decorationId);
  if (isDecorationLocked(state, decorationId)) return `${name}\nLevel ${unlockLevel}`;
  return `${name}\n×${stockOf(state, decorationId)} · ${price}c`;
}

/**
 * Drops a selection the server state no longer supports: an object that is
 * gone. A decoration stays selected when its last one was placed, so more
 * can be bought.
 */
export function reconcileSelection(state: FarmState, selection: EditSelection): EditSelection {
  if (selection.kind === "object") {
    return state.objects.some((object) => object.objectId === selection.objectId) ? selection : NO_SELECTION;
  }
  if (selection.kind === "decoration") {
    return isDecorationLocked(state, selection.decorationId) ? NO_SELECTION : selection;
  }
  return selection;
}

/**
 * Tapping a decoration button: select it (rotation 0) to buy or place it, or
 * deselect it if already selected. Locked decorations show their level.
 */
export function tapDecoration(state: FarmState, selection: EditSelection, decorationId: DecorationId): EditIntent {
  const { name, unlockLevel } = getDecoration(decorationId);
  if (selection.kind === "decoration" && selection.decorationId === decorationId) {
    return { kind: "select", selection: NO_SELECTION };
  }
  if (isDecorationLocked(state, decorationId)) return { kind: "message", text: `${name} unlocks at level ${unlockLevel}.` };
  return { kind: "select", selection: { kind: "decoration", decorationId, rotation: 0 } };
}

/** Buy button: asks the server to sell one of the selected decoration. */
export function tapBuy(selection: EditSelection): EditIntent {
  if (selection.kind === "decoration") return { kind: "buy", decorationId: selection.decorationId };
  return { kind: "message", text: "Pick a decoration to buy." };
}

/**
 * Tapping a grid tile:
 * - on a placed object: select it (tap the selected object again to deselect);
 * - with a decoration selected: ask the server to place it with its top-left here;
 * - with an object selected: ask the server to move its top-left here;
 * - otherwise a hint.
 * Placement validity is left to the server, which answers PLACEMENT_INVALID.
 */
export function tapTile(state: FarmState, selection: EditSelection, tile: GridPosition): EditIntent {
  const object = objectAt(state, tile);
  if (object !== undefined) {
    if (selection.kind === "object" && selection.objectId === object.objectId) {
      return { kind: "select", selection: NO_SELECTION };
    }
    return { kind: "select", selection: { kind: "object", objectId: object.objectId } };
  }
  if (selection.kind === "decoration") {
    if (stockOf(state, selection.decorationId) === 0) {
      const { name, price } = getDecoration(selection.decorationId);
      return { kind: "message", text: `You have no ${name} left. Tap Buy (${price} coins).` };
    }
    return { kind: "place", decorationId: selection.decorationId, x: tile.x, y: tile.y, rotation: selection.rotation };
  }
  if (selection.kind === "object") return { kind: "move", objectId: selection.objectId, x: tile.x, y: tile.y };
  if (isPlotTile(tile)) return { kind: "message", text: "These are your crop plots. Decorations go around them." };
  return { kind: "message", text: "Pick a decoration below, or tap an object to move it." };
}

/** Rotate button: turns a placed object (server) or the decoration about to be placed (local choice). */
export function tapRotate(state: FarmState, selection: EditSelection): EditIntent {
  if (selection.kind === "decoration") {
    return { kind: "select", selection: { ...selection, rotation: nextRotation(selection.rotation) } };
  }
  if (selection.kind === "object") {
    const object = state.objects.find((entry) => entry.objectId === selection.objectId);
    if (object !== undefined) return { kind: "rotate", objectId: object.objectId, rotation: nextRotation(object.rotation) };
  }
  return { kind: "message", text: "Select an object or a decoration to rotate." };
}

/** Remove button: puts the selected object back into the decorations. */
export function tapRemove(selection: EditSelection): EditIntent {
  if (selection.kind === "object") return { kind: "remove", objectId: selection.objectId };
  return { kind: "message", text: "Tap a placed object first, then Remove." };
}

/** Status line for the current selection, starting with the coin balance. */
export function selectionText(state: FarmState, selection: EditSelection): string {
  return `Coins ${state.coins} · ${selectionHint(state, selection)}`;
}

function selectionHint(state: FarmState, selection: EditSelection): string {
  if (selection.kind === "decoration") {
    const { name, price } = getDecoration(selection.decorationId);
    const owned = stockOf(state, selection.decorationId);
    if (owned === 0) return `${name}: ${price} coins · tap Buy`;
    return `Placing ${name} ${rotationArrow(selection.rotation)} (${owned} left) · tap a free tile`;
  }
  if (selection.kind === "object") {
    const object = state.objects.find((entry) => entry.objectId === selection.objectId);
    if (object !== undefined) return `${objectLabel(object)} selected · tap a tile to move it`;
  }
  return "Pick a decoration to buy or place, or tap an object.";
}

/** Message after the server accepted an edit. */
export function editSuccessText(kind: "place" | "move" | "rotate" | "remove", object: PlacedObject): string {
  const name = getDecoration(object.decorationId).name;
  return { place: `${name} placed.`, move: `${name} moved.`, rotate: `${name} rotated.`, remove: `${name} put away.` }[
    kind
  ];
}

/** Message after the server accepted a purchase. */
export function buySuccessText(bought: { decorationId: DecorationId; price: number }): string {
  return `Bought ${getDecoration(bought.decorationId).name} for ${bought.price} coins.`;
}

/** Hint colour for the Buy button: a decoration is selected, unlocked and affordable (the server decides). */
export function canAfford(state: FarmState, selection: EditSelection): boolean {
  return (
    selection.kind === "decoration" &&
    !isDecorationLocked(state, selection.decorationId) &&
    state.coins >= getDecoration(selection.decorationId).price
  );
}

const EDIT_ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  PLACEMENT_INVALID: "It does not fit there: keep it inside the farm, off the crop plots and other objects.",
  OBJECT_NOT_FOUND: "That object is no longer on your farm. Farm refreshed.",
  ITEM_NOT_OWNED: "You have none of that decoration left.",
  INSUFFICIENT_CURRENCY: "Not enough coins for that. Harvest crops to earn more.",
  LEVEL_TOO_LOW: "Reach a higher level to buy that.",
};

/** Error text for a rejected edit, or undefined to use the general farm error text. */
export function editErrorText(code: ErrorCode): string | undefined {
  return EDIT_ERROR_TEXT[code];
}

/** Decorations in catalog order (one button each). */
export const DECORATION_ORDER: readonly DecorationId[] = DECORATIONS.map((decoration) => decoration.id);
