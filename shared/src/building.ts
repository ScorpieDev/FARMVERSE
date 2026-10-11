/**
 * Static building data and placement rules shared by client and server
 * (Phase 3, Step 3.1).
 *
 * Design draft: docs/reports/phase3/PHASE3_BUILDING_PLAN_REPORT.md
 * (G-A grid, C-A decoration catalog). Values are provisional:
 * - Each farm has an 8×8 grid of tiles; (0, 0) is the top-left tile, x grows
 *   to the right and y downwards.
 * - The 3×3 block of crop plots (farming.ts) is fixed on the grid. Its tiles
 *   are reserved for every plot, including plots still locked by level.
 * - Decorations cover 1×1 or 2×2 tiles, must lie inside the grid, must not
 *   cover a plot tile and must not overlap another object. No overlap is
 *   allowed, except with the object being moved itself.
 * - Rotation is in 90° steps. A 90° or 270° rotation swaps width and height
 *   of the footprint (all Phase 3 decorations are square, so only their
 *   facing changes).
 *
 * Only definitions and pure calculations live here. The server owns object
 * IDs and stored layouts and runs these checks on every change; prices,
 * unlock levels and the shop are added with the step that implements them.
 */
import { FARM_PLOT_COUNT } from "./farming.js";

/** Grid width in tiles. */
export const FARM_GRID_WIDTH = 8;
/** Grid height in tiles. */
export const FARM_GRID_HEIGHT = 8;

/** Plots per row of the crop plot block (plot index i is at column i % 3). */
export const PLOT_BLOCK_COLUMNS = 3;

/** Grid tiles covered by the crop plot block (fixed in Phase 3). */
export const PLOT_BLOCK_AREA: Readonly<GridArea> = {
  x: 2,
  y: 2,
  width: PLOT_BLOCK_COLUMNS,
  height: Math.ceil(FARM_PLOT_COUNT / PLOT_BLOCK_COLUMNS),
};

/** A tile on the farm grid. */
export interface GridPosition {
  x: number;
  y: number;
}

/** Width and height in tiles. */
export interface GridSize {
  width: number;
  height: number;
}

/** A rectangle of tiles: top-left tile plus size. */
export interface GridArea extends GridPosition, GridSize {}

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

export const DECORATION_IDS = ["fence", "path", "flower_bed", "bush", "bench", "tree", "small_house"] as const;
export type DecorationId = (typeof DECORATION_IDS)[number];

/** Kind of placeable object. Phase 3 objects are decorative only (no function). */
export type DecorationCategory = "fence" | "path" | "plant" | "furniture" | "building";

export interface DecorationDefinition {
  id: DecorationId;
  /** Display name shown to players. */
  name: string;
  category: DecorationCategory;
  /** Footprint at rotation 0. */
  size: GridSize;
}

export const DECORATIONS: readonly DecorationDefinition[] = [
  { id: "fence", name: "Fence", category: "fence", size: { width: 1, height: 1 } },
  { id: "path", name: "Path", category: "path", size: { width: 1, height: 1 } },
  { id: "flower_bed", name: "Flower Bed", category: "plant", size: { width: 1, height: 1 } },
  { id: "bush", name: "Bush", category: "plant", size: { width: 1, height: 1 } },
  { id: "bench", name: "Bench", category: "furniture", size: { width: 1, height: 1 } },
  { id: "tree", name: "Tree", category: "plant", size: { width: 2, height: 2 } },
  { id: "small_house", name: "Small House", category: "building", size: { width: 2, height: 2 } },
];

/** An object placed on a farm. `objectId` is assigned by the server. */
export interface PlacedObject {
  objectId: number;
  decorationId: DecorationId;
  /** Top-left tile of the footprint. */
  x: number;
  y: number;
  rotation: Rotation;
}

/** Where and how to put a decoration (no object ID yet). */
export type Placement = Omit<PlacedObject, "objectId">;

// ---------- lookups and shape checks ----------

export function isDecorationId(value: unknown): value is DecorationId {
  return typeof value === "string" && (DECORATION_IDS as readonly string[]).includes(value);
}

export function isRotation(value: unknown): value is Rotation {
  return typeof value === "number" && (ROTATIONS as readonly number[]).includes(value);
}

/** True for an integer tile coordinate pair inside the grid. */
export function isGridPosition(value: unknown): value is GridPosition {
  if (typeof value !== "object" || value === null) return false;
  const { x, y } = value as Record<string, unknown>;
  return isGridCoordinate(x, FARM_GRID_WIDTH) && isGridCoordinate(y, FARM_GRID_HEIGHT);
}

function isGridCoordinate(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < limit;
}

/**
 * Checks the shape of a placement (known decoration, top-left tile inside
 * the grid, valid rotation). Whether it fits is decided by checkPlacement.
 */
export function isPlacement(value: unknown): value is Placement {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return isDecorationId(record["decorationId"]) && isGridPosition(record) && isRotation(record["rotation"]);
}

/** Checks the shape of a placed object (placement plus a positive integer object ID). */
export function isPlacedObject(value: unknown): value is PlacedObject {
  if (!isPlacement(value)) return false;
  const objectId = (value as unknown as Record<string, unknown>)["objectId"];
  return typeof objectId === "number" && Number.isInteger(objectId) && objectId >= 1;
}

export function getDecoration(id: DecorationId): DecorationDefinition {
  const decoration = DECORATIONS.find((definition) => definition.id === id);
  if (!decoration) throw new Error(`Unknown decoration: ${id}`);
  return decoration;
}

// ---------- geometry ----------

/** Footprint size after rotation (90° and 270° swap width and height). */
export function rotatedSize(size: GridSize, rotation: Rotation): GridSize {
  return rotation === 90 || rotation === 270 ? { width: size.height, height: size.width } : { ...size };
}

/** Tiles covered by a placement. */
export function footprint(placement: Placement): GridArea {
  const size = rotatedSize(getDecoration(placement.decorationId).size, placement.rotation);
  return { x: placement.x, y: placement.y, ...size };
}

export function isAreaInsideGrid(area: GridArea): boolean {
  return (
    area.x >= 0 &&
    area.y >= 0 &&
    area.width >= 1 &&
    area.height >= 1 &&
    area.x + area.width <= FARM_GRID_WIDTH &&
    area.y + area.height <= FARM_GRID_HEIGHT
  );
}

/** True when two areas share at least one tile (touching edges do not count). */
export function areasOverlap(a: GridArea, b: GridArea): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Grid tile of a crop plot (row-major inside PLOT_BLOCK_AREA), or undefined if out of range. */
export function plotTile(plotIndex: number): GridPosition | undefined {
  if (!Number.isInteger(plotIndex) || plotIndex < 0 || plotIndex >= FARM_PLOT_COUNT) return undefined;
  return {
    x: PLOT_BLOCK_AREA.x + (plotIndex % PLOT_BLOCK_COLUMNS),
    y: PLOT_BLOCK_AREA.y + Math.floor(plotIndex / PLOT_BLOCK_COLUMNS),
  };
}

// ---------- placement rules ----------

/**
 * Why a placement is rejected:
 * - `invalid`: unknown decoration, non-integer or out-of-grid tile, bad rotation;
 * - `out_of_bounds`: the footprint extends past the grid edge;
 * - `overlaps_plots`: the footprint covers a crop plot tile;
 * - `overlaps_object`: the footprint covers another placed object.
 */
export type PlacementProblem = "invalid" | "out_of_bounds" | "overlaps_plots" | "overlaps_object";

export type PlacementCheck =
  | { ok: true; area: GridArea }
  | { ok: false; problem: PlacementProblem; /** Set for `overlaps_object`. */ objectId?: number };

export interface PlacementOptions {
  /** Object being moved: its current tiles do not block the new placement. */
  ignoreObjectId?: number;
}

/**
 * Decides whether `placement` fits on a farm that already has `objects`.
 * `objects` is assumed to be a valid layout (see checkLayout); objects that
 * cannot be measured are skipped here and reported by checkLayout instead.
 */
export function checkPlacement(
  objects: readonly PlacedObject[],
  placement: unknown,
  options: PlacementOptions = {},
): PlacementCheck {
  if (!isPlacement(placement)) return { ok: false, problem: "invalid" };
  const area = footprint(placement);
  if (!isAreaInsideGrid(area)) return { ok: false, problem: "out_of_bounds" };
  if (areasOverlap(area, PLOT_BLOCK_AREA)) return { ok: false, problem: "overlaps_plots" };
  for (const object of objects) {
    if (object.objectId === options.ignoreObjectId || !isPlacedObject(object)) continue;
    if (areasOverlap(area, footprint(object))) {
      return { ok: false, problem: "overlaps_object", objectId: object.objectId };
    }
  }
  return { ok: true, area };
}

export type LayoutProblem = PlacementProblem | "not_a_list" | "duplicate_object_id";

export type LayoutCheck =
  | { ok: true }
  | { ok: false; problem: LayoutProblem; /** Position in the list of the first bad object. */ index?: number };

/**
 * Checks a whole stored layout: every entry is a well-formed placed object,
 * object IDs are unique, and every object fits (inside the grid, off the
 * plot block, no overlap with an earlier object).
 */
export function checkLayout(objects: unknown): LayoutCheck {
  if (!Array.isArray(objects)) return { ok: false, problem: "not_a_list" };
  const accepted: PlacedObject[] = [];
  const seenIds = new Set<number>();
  for (const [index, object] of objects.entries()) {
    if (!isPlacedObject(object)) return { ok: false, problem: "invalid", index };
    if (seenIds.has(object.objectId)) return { ok: false, problem: "duplicate_object_id", index };
    const check = checkPlacement(accepted, object);
    if (!check.ok) return { ok: false, problem: check.problem, index };
    seenIds.add(object.objectId);
    accepted.push(object);
  }
  return { ok: true };
}
