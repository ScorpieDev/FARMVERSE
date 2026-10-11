import { describe, expect, it } from "vitest";
import type { PlacedObject, Placement } from "@farmverse/shared/building";
import {
  assertBuildingData,
  createEmptyBuilding,
  grantDecoration,
  moveObject,
  placeDecoration,
  removeObject,
  rotateObject,
  type BuildingData,
  type BuildingResult,
} from "./rules.js";

function ok<T extends object>(result: BuildingResult<T>): BuildingData & { result: T } {
  if (!result.ok) throw new Error(`expected success, got ${result.error}`);
  const { ok: _ok, building, ...rest } = result;
  return { ...building, result: rest as unknown as T };
}

/** A player owning 2 fences and 1 tree, nothing placed. */
function stocked(): BuildingData {
  return grantDecoration(grantDecoration(createEmptyBuilding(), "fence", 2), "tree", 1);
}

const fenceAt = (x: number, y: number): Placement => ({ decorationId: "fence", x, y, rotation: 0 });
const treeAt = (x: number, y: number): Placement => ({ decorationId: "tree", x, y, rotation: 0 });

/** Building with a tree at (0, 0) as object 1 and a fence at (2, 0) as object 2. */
function withTreeAndFence(): BuildingData {
  return ok(placeDecoration(ok(placeDecoration(stocked(), treeAt(0, 0))), fenceAt(2, 0)));
}

describe("createEmptyBuilding / grantDecoration", () => {
  it("starts with no stock, no objects and object IDs from 1", () => {
    const building = createEmptyBuilding();
    assertBuildingData(building);
    expect(Object.values(building.stock).every((count) => count === 0)).toBe(true);
    expect(building.objects).toEqual([]);
    expect(building.nextObjectId).toBe(1);
  });

  it("adds to the stock without changing the input", () => {
    const empty = createEmptyBuilding();
    const granted = grantDecoration(empty, "bench", 3);
    expect(granted.stock.bench).toBe(3);
    expect(empty.stock.bench).toBe(0);
  });

  it.each([0, -1, 1.5])("rejects count %s", (count) => {
    expect(() => grantDecoration(createEmptyBuilding(), "bench", count)).toThrow(RangeError);
  });

  it("rejects an unknown decoration", () => {
    expect(() => grantDecoration(createEmptyBuilding(), "castle" as never, 1)).toThrow(RangeError);
  });
});

describe("placeDecoration", () => {
  it("places from the stock and assigns the next object ID", () => {
    const before = stocked();
    const after = ok(placeDecoration(before, { decorationId: "tree", x: 6, y: 6, rotation: 90 }));
    expect(after.result.object).toEqual({ objectId: 1, decorationId: "tree", x: 6, y: 6, rotation: 90 });
    expect(after.objects).toEqual([after.result.object]);
    expect(after.stock.tree).toBe(0);
    expect(after.stock.fence).toBe(2);
    expect(after.nextObjectId).toBe(2);
    expect(before.objects).toEqual([]);
    expect(before.stock.tree).toBe(1);
  });

  it("rejects a decoration the player does not own", () => {
    expect(placeDecoration(stocked(), { decorationId: "bench", x: 0, y: 0, rotation: 0 })).toEqual({
      ok: false,
      error: "ITEM_NOT_OWNED",
    });
  });

  it("rejects placing more than the stock (each placement uses one)", () => {
    const building = ok(placeDecoration(stocked(), treeAt(0, 0)));
    expect(placeDecoration(building, treeAt(5, 5))).toEqual({ ok: false, error: "ITEM_NOT_OWNED" });
  });

  it.each([
    ["past the right edge", treeAt(7, 0)],
    ["past the bottom edge", treeAt(0, 7)],
    ["on the plot block", treeAt(1, 1)],
    ["on a plot tile", fenceAt(3, 3)],
    ["off the grid", fenceAt(8, 0)],
    ["at a negative tile", fenceAt(-1, 0)],
    ["at a fractional tile", fenceAt(0.5, 0)],
    ["with a bad rotation", { ...fenceAt(0, 0), rotation: 45 as never }],
    ["of an unknown decoration", { ...fenceAt(0, 0), decorationId: "castle" as never }],
  ])("rejects a placement %s", (_label, placement) => {
    const before = stocked();
    expect(placeDecoration(before, placement)).toEqual({ ok: false, error: "PLACEMENT_INVALID" });
  });

  it("rejects overlap with a placed object", () => {
    const building = withTreeAndFence();
    expect(placeDecoration(building, fenceAt(1, 1))).toEqual({ ok: false, error: "PLACEMENT_INVALID" });
    expect(placeDecoration(building, fenceAt(2, 0))).toEqual({ ok: false, error: "PLACEMENT_INVALID" });
  });

  it("rejects the same placement sent twice (second one overlaps the first)", () => {
    const once = ok(placeDecoration(stocked(), fenceAt(0, 0)));
    expect(placeDecoration(once, fenceAt(0, 0))).toEqual({ ok: false, error: "PLACEMENT_INVALID" });
    expect(once.stock.fence).toBe(1);
  });

  it("checks ownership before the tile", () => {
    expect(placeDecoration(createEmptyBuilding(), fenceAt(3, 3))).toEqual({ ok: false, error: "ITEM_NOT_OWNED" });
  });

  it("never reuses an object ID after a removal", () => {
    const placed = ok(placeDecoration(stocked(), fenceAt(0, 0)));
    const removed = ok(removeObject(placed, 1));
    const again = ok(placeDecoration(removed, fenceAt(0, 0)));
    expect(again.result.object.objectId).toBe(2);
  });
});

describe("moveObject", () => {
  it("moves an object and keeps its rotation and ID", () => {
    const building = withTreeAndFence();
    const moved = ok(moveObject(building, 1, { x: 6, y: 6 }));
    expect(moved.result.object).toEqual({ objectId: 1, decorationId: "tree", x: 6, y: 6, rotation: 0 });
    expect(moved.objects).toHaveLength(2);
    expect(moved.stock).toEqual(building.stock);
    expect(building.objects[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("allows a move that overlaps only the object's own old tiles", () => {
    expect(ok(moveObject(withTreeAndFence(), 1, { x: 0, y: 1 })).result.object).toMatchObject({ x: 0, y: 1 });
  });

  it("allows moving to the same tile", () => {
    expect(moveObject(withTreeAndFence(), 2, { x: 2, y: 0 }).ok).toBe(true);
  });

  it.each([
    ["onto another object", { x: 1, y: 0 }],
    ["past the edge", { x: 7, y: 7 }],
    ["onto the plots", { x: 3, y: 3 }],
    ["off the grid", { x: -1, y: 0 }],
    ["to a non-integer tile", { x: 0.5, y: 0 }],
    ["to a malformed tile", { x: "1", y: 0 } as never],
  ])("rejects a move %s", (_label, to) => {
    expect(moveObject(withTreeAndFence(), 1, to)).toEqual({ ok: false, error: "PLACEMENT_INVALID" });
  });

  it.each([3, 0, -1, 1.5])("rejects unknown object ID %s", (objectId) => {
    expect(moveObject(withTreeAndFence(), objectId, { x: 6, y: 6 })).toEqual({ ok: false, error: "OBJECT_NOT_FOUND" });
  });
});

describe("rotateObject", () => {
  it("rotates an object in place", () => {
    const rotated = ok(rotateObject(withTreeAndFence(), 2, 270));
    expect(rotated.result.object).toEqual({ objectId: 2, decorationId: "fence", x: 2, y: 0, rotation: 270 });
  });

  it("rejects a bad rotation", () => {
    expect(rotateObject(withTreeAndFence(), 2, 45 as never)).toEqual({ ok: false, error: "PLACEMENT_INVALID" });
  });

  it("rejects an unknown object", () => {
    expect(rotateObject(withTreeAndFence(), 9, 90)).toEqual({ ok: false, error: "OBJECT_NOT_FOUND" });
  });
});

describe("removeObject", () => {
  it("removes an object and returns it to the stock", () => {
    const building = withTreeAndFence();
    const removed = ok(removeObject(building, 1));
    expect(removed.result.object.decorationId).toBe("tree");
    expect(removed.objects.map((object) => object.objectId)).toEqual([2]);
    expect(removed.stock.tree).toBe(building.stock.tree + 1);
    expect(removed.nextObjectId).toBe(building.nextObjectId);
  });

  it("frees the tiles for another object", () => {
    const removed = ok(removeObject(withTreeAndFence(), 2));
    expect(placeDecoration(removed, fenceAt(2, 0)).ok).toBe(true);
  });

  it("rejects removing the same object twice", () => {
    const removed = ok(removeObject(withTreeAndFence(), 1));
    expect(removeObject(removed, 1)).toEqual({ ok: false, error: "OBJECT_NOT_FOUND" });
  });
});

describe("assertBuildingData (corrupted storage)", () => {
  const valid = withTreeAndFence();
  const tree: PlacedObject = { objectId: 1, decorationId: "tree", x: 0, y: 0, rotation: 0 };

  it.each([
    ["negative stock", { ...valid, stock: { ...valid.stock, fence: -1 } }],
    ["missing stock entry", { ...valid, stock: { fence: 1 } }],
    ["unknown stock entry", { ...valid, stock: { ...valid.stock, castle: 1 } }],
    ["overlapping objects", { ...valid, objects: [tree, { ...tree, objectId: 2, x: 1, y: 1 }], nextObjectId: 3 }],
    ["object on the plots", { ...valid, objects: [{ ...tree, x: 2, y: 2 }] }],
    ["duplicate object IDs", { ...valid, objects: [tree, { ...tree, x: 5, y: 5 }] }],
    ["next ID not above placed IDs", { ...valid, nextObjectId: 2 }],
    ["next ID below 1", { ...createEmptyBuilding(), nextObjectId: 0 }],
  ])("throws on %s", (_label, building) => {
    expect(() => assertBuildingData(building as BuildingData)).toThrow(RangeError);
    expect(() => placeDecoration(building as BuildingData, fenceAt(7, 7))).toThrow(RangeError);
  });
});
