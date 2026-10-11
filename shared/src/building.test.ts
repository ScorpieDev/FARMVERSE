import { describe, expect, it } from "vitest";
import {
  DECORATIONS,
  DECORATION_IDS,
  FARM_GRID_HEIGHT,
  FARM_GRID_WIDTH,
  PLOT_BLOCK_AREA,
  ROTATIONS,
  areasOverlap,
  checkLayout,
  checkPlacement,
  footprint,
  getDecoration,
  isAreaInsideGrid,
  isDecorationId,
  isGridPosition,
  isPlacedObject,
  isPlacement,
  isRotation,
  plotTile,
  rotatedSize,
  type PlacedObject,
  type Placement,
} from "./building.js";
import { FARM_PLOT_COUNT } from "./farming.js";

function placed(objectId: number, decorationId: PlacedObject["decorationId"], x: number, y: number): PlacedObject {
  return { objectId, decorationId, x, y, rotation: 0 };
}

const fence: Placement = { decorationId: "fence", x: 0, y: 0, rotation: 0 };
const tree: Placement = { decorationId: "tree", x: 0, y: 0, rotation: 0 };

describe("grid and catalog (G-A, C-A draft)", () => {
  it("is an 8×8 grid with the 3×3 plot block inside it", () => {
    expect([FARM_GRID_WIDTH, FARM_GRID_HEIGHT]).toEqual([8, 8]);
    expect(PLOT_BLOCK_AREA).toEqual({ x: 2, y: 2, width: 3, height: 3 });
    expect(isAreaInsideGrid(PLOT_BLOCK_AREA)).toBe(true);
  });

  it("gives every plot (locked ones included) its own tile in the plot block, row by row", () => {
    const tiles = Array.from({ length: FARM_PLOT_COUNT }, (_, index) => plotTile(index));
    expect(tiles[0]).toEqual({ x: 2, y: 2 });
    expect(tiles[2]).toEqual({ x: 4, y: 2 });
    expect(tiles[3]).toEqual({ x: 2, y: 3 });
    expect(tiles[8]).toEqual({ x: 4, y: 4 });
    expect(new Set(tiles.map((tile) => `${tile?.x},${tile?.y}`)).size).toBe(FARM_PLOT_COUNT);
    for (const tile of tiles) {
      expect(tile && areasOverlap({ ...tile, width: 1, height: 1 }, PLOT_BLOCK_AREA)).toBe(true);
    }
  });

  it.each([-1, FARM_PLOT_COUNT, 1.5, Number.NaN])("has no tile for plot %s", (index) => {
    expect(plotTile(index)).toBeUndefined();
  });

  it("defines the seven decorations with 1×1 or 2×2 footprints", () => {
    expect(DECORATIONS.map((decoration) => decoration.id)).toEqual([...DECORATION_IDS]);
    expect(DECORATIONS.map((decoration) => [decoration.id, decoration.size.width, decoration.size.height])).toEqual([
      ["fence", 1, 1],
      ["path", 1, 1],
      ["flower_bed", 1, 1],
      ["bush", 1, 1],
      ["bench", 1, 1],
      ["tree", 2, 2],
      ["small_house", 2, 2],
    ]);
    expect(getDecoration("small_house").category).toBe("building");
    expect(new Set(DECORATIONS.map((decoration) => decoration.name)).size).toBe(DECORATIONS.length);
  });

  it("prices and unlock levels match the approved provisional table (P3-4, P3-5)", () => {
    expect(DECORATIONS.map((decoration) => [decoration.id, decoration.price, decoration.unlockLevel])).toEqual([
      ["fence", 5, 1],
      ["path", 5, 1],
      ["flower_bed", 20, 2],
      ["bush", 30, 3],
      ["bench", 60, 4],
      ["tree", 120, 5],
      ["small_house", 300, 6],
    ]);
  });

  it("does not share IDs with farming items", async () => {
    const { ITEM_IDS } = await import("./farming.js");
    for (const id of DECORATION_IDS) expect((ITEM_IDS as readonly string[]).includes(id)).toBe(false);
  });

  it("throws on an unknown decoration lookup", () => {
    expect(() => getDecoration("castle" as never)).toThrow("Unknown decoration");
  });
});

describe("shape checks", () => {
  it("accepts known decoration IDs and 90° rotations only", () => {
    for (const id of DECORATION_IDS) expect(isDecorationId(id)).toBe(true);
    for (const rotation of ROTATIONS) expect(isRotation(rotation)).toBe(true);
    for (const value of ["castle", "Fence", "", 1, null, undefined]) expect(isDecorationId(value)).toBe(false);
    for (const value of [45, -90, 360, "90", 90.5, null]) expect(isRotation(value)).toBe(false);
  });

  it.each([
    [{ x: 0, y: 0 }, true],
    [{ x: 7, y: 7 }, true],
    [{ x: 8, y: 0 }, false],
    [{ x: 0, y: 8 }, false],
    [{ x: -1, y: 0 }, false],
    [{ x: 1.5, y: 0 }, false],
    [{ x: "1", y: 0 }, false],
    [{ x: 1 }, false],
    [null, false],
    [3, false],
  ])("isGridPosition(%j) is %s", (value, expected) => {
    expect(isGridPosition(value)).toBe(expected);
  });

  it("accepts well-formed placements and placed objects", () => {
    expect(isPlacement(fence)).toBe(true);
    expect(isPlacement({ ...tree, x: 6, y: 6, rotation: 270 })).toBe(true);
    expect(isPlacedObject({ ...fence, objectId: 1 })).toBe(true);
  });

  it.each([
    ["unknown decoration", { ...fence, decorationId: "castle" }],
    ["missing rotation", { decorationId: "fence", x: 0, y: 0 }],
    ["bad rotation", { ...fence, rotation: 45 }],
    ["tile outside the grid", { ...fence, x: 8 }],
    ["negative tile", { ...fence, y: -1 }],
    ["fractional tile", { ...fence, x: 0.5 }],
    ["string tile", { ...fence, x: "0" }],
    ["array", [fence]],
    ["null", null],
  ])("rejects a placement with %s", (_label, value) => {
    expect(isPlacement(value)).toBe(false);
    expect(isPlacedObject({ ...(value as object), objectId: 1 })).toBe(false);
  });

  it.each([0, -1, 1.5, "1", null, undefined])("rejects object ID %j", (objectId) => {
    expect(isPlacedObject({ ...fence, objectId })).toBe(false);
  });
});

describe("geometry", () => {
  it("swaps width and height for 90° and 270° rotations", () => {
    const size = { width: 2, height: 1 };
    expect(rotatedSize(size, 0)).toEqual({ width: 2, height: 1 });
    expect(rotatedSize(size, 90)).toEqual({ width: 1, height: 2 });
    expect(rotatedSize(size, 180)).toEqual({ width: 2, height: 1 });
    expect(rotatedSize(size, 270)).toEqual({ width: 1, height: 2 });
  });

  it("measures the footprint from the top-left tile", () => {
    expect(footprint({ ...tree, x: 5, y: 6, rotation: 90 })).toEqual({ x: 5, y: 6, width: 2, height: 2 });
    expect(footprint({ ...fence, x: 7, y: 1 })).toEqual({ x: 7, y: 1, width: 1, height: 1 });
  });

  it("counts shared tiles as overlap, touching edges or corners as not", () => {
    const a = { x: 0, y: 0, width: 2, height: 2 };
    expect(areasOverlap(a, { x: 1, y: 1, width: 1, height: 1 })).toBe(true);
    expect(areasOverlap(a, { x: 1, y: 1, width: 2, height: 2 })).toBe(true);
    expect(areasOverlap(a, a)).toBe(true);
    expect(areasOverlap(a, { x: 2, y: 0, width: 1, height: 1 })).toBe(false);
    expect(areasOverlap(a, { x: 0, y: 2, width: 1, height: 1 })).toBe(false);
    expect(areasOverlap(a, { x: 2, y: 2, width: 2, height: 2 })).toBe(false);
  });
});

describe("checkPlacement", () => {
  it("accepts a placement on an empty farm and returns its tiles", () => {
    expect(checkPlacement([], fence)).toEqual({ ok: true, area: { x: 0, y: 0, width: 1, height: 1 } });
    expect(checkPlacement([], { ...tree, x: 6, y: 6 })).toEqual({ ok: true, area: { x: 6, y: 6, width: 2, height: 2 } });
  });

  it("accepts every free 1×1 tile and rejects exactly the 9 plot tiles", () => {
    let accepted = 0;
    let onPlots = 0;
    for (let y = 0; y < FARM_GRID_HEIGHT; y++) {
      for (let x = 0; x < FARM_GRID_WIDTH; x++) {
        for (const rotation of ROTATIONS) {
          const check = checkPlacement([], { ...fence, x, y, rotation });
          if (check.ok) accepted++;
          else if (check.problem === "overlaps_plots") onPlots++;
          else throw new Error(`unexpected ${check.problem} at ${x},${y}`);
        }
      }
    }
    expect(accepted).toBe((64 - 9) * ROTATIONS.length);
    expect(onPlots).toBe(9 * ROTATIONS.length);
  });

  it.each([
    ["right edge", 7, 0],
    ["bottom edge", 0, 7],
    ["bottom-right corner", 7, 7],
  ])("rejects a 2×2 object past the %s", (_label, x, y) => {
    expect(checkPlacement([], { ...tree, x, y })).toEqual({ ok: false, problem: "out_of_bounds" });
  });

  it.each([
    ["top-left corner of the block", 1, 1],
    ["right side of the block", 4, 3],
    ["bottom side of the block", 3, 4],
  ])("rejects a 2×2 object partly on the plots (%s)", (_label, x, y) => {
    expect(checkPlacement([], { ...tree, x, y })).toEqual({ ok: false, problem: "overlaps_plots" });
  });

  it("allows a 2×2 object right next to the plot block", () => {
    expect(checkPlacement([], { ...tree, x: 0, y: 2 }).ok).toBe(true);
    expect(checkPlacement([], { ...tree, x: 5, y: 2 }).ok).toBe(true);
    expect(checkPlacement([], { ...tree, x: 2, y: 5 }).ok).toBe(true);
  });

  it.each([
    ["unknown decoration", { ...fence, decorationId: "castle" }],
    ["tile outside the grid", { ...fence, x: -1 }],
    ["bad rotation", { ...fence, rotation: 30 }],
    ["not an object", "fence"],
  ])("rejects a malformed placement (%s) as invalid", (_label, value) => {
    expect(checkPlacement([], value)).toEqual({ ok: false, problem: "invalid" });
  });

  it("rejects overlap with another object and names it", () => {
    const objects = [placed(1, "fence", 0, 0), placed(2, "small_house", 5, 0)];
    expect(checkPlacement(objects, fence)).toEqual({ ok: false, problem: "overlaps_object", objectId: 1 });
    expect(checkPlacement(objects, { ...tree, x: 6, y: 1 })).toEqual({ ok: false, problem: "overlaps_object", objectId: 2 });
    expect(checkPlacement(objects, { ...fence, x: 6, y: 1 })).toEqual({ ok: false, problem: "overlaps_object", objectId: 2 });
  });

  it("allows objects that only touch", () => {
    const objects = [placed(1, "small_house", 5, 0)];
    expect(checkPlacement(objects, { ...fence, x: 7, y: 2 }).ok).toBe(true);
    expect(checkPlacement(objects, { ...tree, x: 3, y: 0 }).ok).toBe(true);
  });

  it("reports out of bounds before overlap", () => {
    expect(checkPlacement([placed(1, "fence", 7, 7)], { ...tree, x: 7, y: 7 })).toEqual({
      ok: false,
      problem: "out_of_bounds",
    });
  });

  it("lets a moved object overlap only its own old tiles", () => {
    const objects = [placed(1, "tree", 0, 0), placed(2, "fence", 2, 0)];
    const shifted: Placement = { ...tree, x: 1, y: 0 };
    expect(checkPlacement(objects, { ...tree, x: 0, y: 1 }, { ignoreObjectId: 1 }).ok).toBe(true);
    expect(checkPlacement(objects, { ...tree, x: 0, y: 1 }).ok).toBe(false);
    expect(checkPlacement(objects, shifted, { ignoreObjectId: 1 })).toEqual({
      ok: false,
      problem: "overlaps_object",
      objectId: 2,
    });
  });

  it("allows rotating an object in place", () => {
    const objects = [placed(1, "bench", 0, 0)];
    expect(checkPlacement(objects, { decorationId: "bench", x: 0, y: 0, rotation: 90 }, { ignoreObjectId: 1 }).ok).toBe(true);
  });
});

describe("checkLayout", () => {
  it("accepts an empty layout and a valid full layout", () => {
    expect(checkLayout([])).toEqual({ ok: true });
    expect(
      checkLayout([
        placed(1, "small_house", 0, 0),
        placed(2, "tree", 6, 6),
        placed(3, "fence", 2, 0),
        { ...placed(4, "bench", 7, 0), rotation: 180 },
        placed(10, "path", 2, 5),
      ]),
    ).toEqual({ ok: true });
  });

  it.each([
    ["not a list", { 0: placed(1, "fence", 0, 0) }, { ok: false, problem: "not_a_list" }],
    ["malformed entry", [placed(1, "fence", 0, 0), { objectId: 2 }], { ok: false, problem: "invalid", index: 1 }],
    [
      "duplicate object ID",
      [placed(1, "fence", 0, 0), placed(1, "path", 1, 0)],
      { ok: false, problem: "duplicate_object_id", index: 1 },
    ],
    ["object past the edge", [placed(1, "tree", 7, 3)], { ok: false, problem: "out_of_bounds", index: 0 }],
    ["object on the plots", [placed(1, "fence", 3, 3)], { ok: false, problem: "overlaps_plots", index: 0 }],
    [
      "overlapping objects",
      [placed(1, "tree", 0, 0), placed(2, "fence", 1, 1)],
      { ok: false, problem: "overlaps_object", index: 1 },
    ],
  ])("rejects a layout with %s", (_label, layout, expected) => {
    expect(checkLayout(layout)).toEqual(expected);
  });
});
