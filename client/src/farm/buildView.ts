/**
 * Edit mode helpers for the farm grid (Phase 3). Pure functions.
 *
 * The client only keeps a UI selection (a decoration to place, or a placed
 * object) and the rotation for the next placement. Every tap that would
 * change the farm becomes an intent for the server (place / move / rotate /
 * remove); ownership, bounds, plots and overlap are decided by the server,
 * and the grid is always drawn from the server's FarmState.
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
  | { kind: "message"; text: string };

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

/** Label of a decoration button: name and how many are owned but not placed. */
export function stockLabel(state: FarmState, decorationId: DecorationId): string {
  return `${getDecoration(decorationId).name}\n×${stockOf(state, decorationId)}`;
}

/**
 * Drops a selection the server state no longer supports: an object that is
 * gone, or a decoration with no stock left.
 */
export function reconcileSelection(state: FarmState, selection: EditSelection): EditSelection {
  if (selection.kind === "object") {
    return state.objects.some((object) => object.objectId === selection.objectId) ? selection : NO_SELECTION;
  }
  if (selection.kind === "decoration") {
    return stockOf(state, selection.decorationId) > 0 ? selection : NO_SELECTION;
  }
  return selection;
}

/** Tapping a decoration button: select it (rotation 0), or deselect it if already selected. */
export function tapDecoration(state: FarmState, selection: EditSelection, decorationId: DecorationId): EditIntent {
  const name = getDecoration(decorationId).name;
  if (selection.kind === "decoration" && selection.decorationId === decorationId) {
    return { kind: "select", selection: NO_SELECTION };
  }
  if (stockOf(state, decorationId) === 0) return { kind: "message", text: `You have no ${name} to place.` };
  return { kind: "select", selection: { kind: "decoration", decorationId, rotation: 0 } };
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

/** Status line for the current selection. */
export function selectionText(state: FarmState, selection: EditSelection): string {
  if (selection.kind === "decoration") {
    const name = getDecoration(selection.decorationId).name;
    return `Placing ${name} ${rotationArrow(selection.rotation)} · tap a free tile`;
  }
  if (selection.kind === "object") {
    const object = state.objects.find((entry) => entry.objectId === selection.objectId);
    if (object !== undefined) return `${objectLabel(object)} selected · tap a tile to move it`;
  }
  if (state.decorations.length === 0 && state.objects.length === 0) return "You have no decorations yet.";
  return "Pick a decoration, or tap an object.";
}

/** Message after the server accepted an edit. */
export function editSuccessText(kind: "place" | "move" | "rotate" | "remove", object: PlacedObject): string {
  const name = getDecoration(object.decorationId).name;
  return { place: `${name} placed.`, move: `${name} moved.`, rotate: `${name} rotated.`, remove: `${name} put away.` }[
    kind
  ];
}

const EDIT_ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  PLACEMENT_INVALID: "It does not fit there: keep it inside the farm, off the crop plots and other objects.",
  OBJECT_NOT_FOUND: "That object is no longer on your farm. Farm refreshed.",
  ITEM_NOT_OWNED: "You have none of that decoration left.",
};

/** Error text for a rejected edit, or undefined to use the general farm error text. */
export function editErrorText(code: ErrorCode): string | undefined {
  return EDIT_ERROR_TEXT[code];
}

/** Decorations in catalog order (one button each). */
export const DECORATION_ORDER: readonly DecorationId[] = DECORATIONS.map((decoration) => decoration.id);
