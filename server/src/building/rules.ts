/**
 * Server-side building rules (Phase 3, Step 3.2). Pure functions: no I/O,
 * no clock.
 *
 * A player's building state is kept beside FarmData: the decorations they
 * own but have not placed (`stock`), the objects on their grid, and the next
 * object ID to hand out. Placement checks come from @farmverse/shared/building
 * (inside the grid, off the plot block, no overlap). The client only sends
 * intents (decoration, tile, rotation, object ID); every result is decided
 * here and object IDs are assigned here.
 *
 * Gameplay failures are returned as `{ ok: false, error }`:
 * - ITEM_NOT_OWNED: no unplaced decoration of that kind in stock;
 * - OBJECT_NOT_FOUND: no object with that ID on this player's farm (objects
 *   of other players are never visible here, so they are "not found" too);
 * - PLACEMENT_INVALID: malformed placement, outside the grid, on the plots
 *   or overlapping another object.
 * Malformed BuildingData (e.g. corrupted storage) throws a RangeError.
 * Functions never modify their input.
 */
import {
  DECORATION_IDS,
  checkLayout,
  checkPlacement,
  isDecorationId,
  type DecorationId,
  type GridPosition,
  type PlacedObject,
  type Placement,
  type Rotation,
} from "@farmverse/shared/building";
import type { ErrorCode } from "@farmverse/shared/errors";

/** Unplaced decorations owned by the player; always non-negative integers. */
export type DecorationStock = Readonly<Record<DecorationId, number>>;

export interface BuildingData {
  readonly stock: DecorationStock;
  /** Placed objects; a valid layout (shared checkLayout). */
  readonly objects: readonly PlacedObject[];
  /** Next object ID to assign; greater than every ID ever used by this player. */
  readonly nextObjectId: number;
}

export type BuildingError = Extract<ErrorCode, "ITEM_NOT_OWNED" | "OBJECT_NOT_FOUND" | "PLACEMENT_INVALID">;

export type BuildingResult<Extra extends object = Record<never, never>> =
  | ({ ok: true; building: BuildingData } & Extra)
  | { ok: false; error: BuildingError };

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Checks the BuildingData invariants: a non-negative integer stock for every
 * decoration (and nothing else), a valid layout, and a nextObjectId above
 * every placed object ID. Exported so storage can reject corrupted data.
 */
export function assertBuildingData(building: BuildingData): void {
  if (typeof building !== "object" || building === null) throw new RangeError("Invalid building data");
  const { stock, objects, nextObjectId } = building;
  if (typeof stock !== "object" || stock === null) throw new RangeError("Invalid decoration stock");
  const stockKeys = Object.keys(stock);
  if (stockKeys.length !== DECORATION_IDS.length || !stockKeys.every(isDecorationId)) {
    throw new RangeError("Invalid decoration stock");
  }
  for (const id of DECORATION_IDS) {
    if (!isNonNegativeSafeInteger(stock[id])) throw new RangeError(`Invalid stock of ${id}`);
  }
  const layout = checkLayout(objects);
  if (!layout.ok) throw new RangeError(`Invalid layout: ${layout.problem}`);
  if (!Number.isSafeInteger(nextObjectId) || nextObjectId < 1) throw new RangeError("Invalid next object ID");
  if (objects.some((object) => object.objectId >= nextObjectId)) {
    throw new RangeError("Next object ID is not above every placed object");
  }
}

/** A new player: nothing owned, nothing placed. */
export function createEmptyBuilding(): BuildingData {
  return {
    stock: Object.fromEntries(DECORATION_IDS.map((id) => [id, 0])) as Record<DecorationId, number>,
    objects: [],
    nextObjectId: 1,
  };
}

/**
 * Adds decorations to the stock. Used by whatever grants decorations (not
 * decided yet: shop or rewards, P3-4); `count` must be a positive integer.
 */
export function grantDecoration(building: BuildingData, decorationId: DecorationId, count: number): BuildingData {
  assertBuildingData(building);
  if (!isDecorationId(decorationId)) throw new RangeError(`Invalid decoration id: ${decorationId}`);
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError(`Invalid count: ${count}`);
  return { ...building, stock: { ...building.stock, [decorationId]: building.stock[decorationId] + count } };
}

/** Places one decoration from the stock; the server assigns its object ID. */
export function placeDecoration(building: BuildingData, placement: Placement): BuildingResult<{ object: PlacedObject }> {
  assertBuildingData(building);
  if (!isDecorationId(placement?.decorationId)) return { ok: false, error: "PLACEMENT_INVALID" };
  if (building.stock[placement.decorationId] < 1) return { ok: false, error: "ITEM_NOT_OWNED" };
  if (!checkPlacement(building.objects, placement).ok) return { ok: false, error: "PLACEMENT_INVALID" };

  const object: PlacedObject = {
    objectId: building.nextObjectId,
    decorationId: placement.decorationId,
    x: placement.x,
    y: placement.y,
    rotation: placement.rotation,
  };
  return {
    ok: true,
    object,
    building: {
      stock: { ...building.stock, [object.decorationId]: building.stock[object.decorationId] - 1 },
      objects: [...building.objects, object],
      nextObjectId: building.nextObjectId + 1,
    },
  };
}

/** Moves and/or rotates a placed object; its old tiles do not block the new ones. */
function reposition(
  building: BuildingData,
  objectId: number,
  change: (object: PlacedObject) => PlacedObject,
): BuildingResult<{ object: PlacedObject }> {
  assertBuildingData(building);
  const current = building.objects.find((object) => object.objectId === objectId);
  if (current === undefined) return { ok: false, error: "OBJECT_NOT_FOUND" };

  const object = change(current);
  const { objectId: _id, ...placement } = object;
  if (!checkPlacement(building.objects, placement, { ignoreObjectId: objectId }).ok) {
    return { ok: false, error: "PLACEMENT_INVALID" };
  }
  return {
    ok: true,
    object,
    building: { ...building, objects: building.objects.map((entry) => (entry.objectId === objectId ? object : entry)) },
  };
}

/** Moves a placed object so its top-left tile is `to`; rotation is kept. */
export function moveObject(
  building: BuildingData,
  objectId: number,
  to: GridPosition,
): BuildingResult<{ object: PlacedObject }> {
  return reposition(building, objectId, (object) => ({ ...object, x: to?.x, y: to?.y }));
}

/** Turns a placed object to `rotation`, keeping its top-left tile. */
export function rotateObject(
  building: BuildingData,
  objectId: number,
  rotation: Rotation,
): BuildingResult<{ object: PlacedObject }> {
  return reposition(building, objectId, (object) => ({ ...object, rotation }));
}

/** Takes a placed object off the grid and returns it to the stock. */
export function removeObject(building: BuildingData, objectId: number): BuildingResult<{ object: PlacedObject }> {
  assertBuildingData(building);
  const object = building.objects.find((entry) => entry.objectId === objectId);
  if (object === undefined) return { ok: false, error: "OBJECT_NOT_FOUND" };
  return {
    ok: true,
    object,
    building: {
      ...building,
      stock: { ...building.stock, [object.decorationId]: building.stock[object.decorationId] + 1 },
      objects: building.objects.filter((entry) => entry.objectId !== objectId),
    },
  };
}
