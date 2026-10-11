import { describe, expect, it } from "vitest";
import type { FarmState } from "@farmverse/shared/api";
import type { PlacedObject } from "@farmverse/shared/building";
import { FARM_PLOT_COUNT } from "@farmverse/shared/farming";
import {
  DECORATION_ORDER,
  NO_SELECTION,
  editErrorText,
  editSuccessText,
  isPlotTile,
  nextRotation,
  objectAt,
  objectLabel,
  reconcileSelection,
  selectionText,
  stockLabel,
  stockOf,
  tapDecoration,
  tapRemove,
  tapRotate,
  tapTile,
  type EditSelection,
} from "./buildView.js";

const TREE: PlacedObject = { objectId: 1, decorationId: "tree", x: 0, y: 0, rotation: 0 };
const BENCH: PlacedObject = { objectId: 2, decorationId: "bench", x: 6, y: 0, rotation: 90 };

function state(overrides: Partial<FarmState> = {}): FarmState {
  return {
    serverTime: 0,
    plots: Array.from({ length: FARM_PLOT_COUNT }, (_, index) => ({ index, crop: null })),
    inventory: [],
    seedRefill: { eligible: false, availableAt: null },
    coins: 0,
    xp: 0,
    progression: { level: 1, xpIntoLevel: 0, xpForNextLevel: 50, unlockedPlotCount: 6 },
    quest: null,
    decorations: [
      { decorationId: "fence", quantity: 3 },
      { decorationId: "tree", quantity: 1 },
    ],
    objects: [TREE, BENCH],
    ...overrides,
  };
}

const placingFence: EditSelection = { kind: "decoration", decorationId: "fence", rotation: 90 };
const treeSelected: EditSelection = { kind: "object", objectId: 1 };

describe("reading the server state", () => {
  it("counts unplaced decorations from the server", () => {
    expect(stockOf(state(), "fence")).toBe(3);
    expect(stockOf(state(), "bench")).toBe(0);
    expect(stockLabel(state(), "fence")).toBe("Fence\n×3");
  });

  it("finds the object covering a tile, including every tile of a 2×2 object", () => {
    for (const tile of [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]) {
      expect(objectAt(state(), tile)?.objectId).toBe(1);
    }
    expect(objectAt(state(), { x: 6, y: 0 })?.objectId).toBe(2);
    expect(objectAt(state(), { x: 2, y: 0 })).toBeUndefined();
  });

  it("knows the plot block tiles", () => {
    expect(isPlotTile({ x: 2, y: 2 })).toBe(true);
    expect(isPlotTile({ x: 4, y: 4 })).toBe(true);
    expect(isPlotTile({ x: 5, y: 4 })).toBe(false);
  });

  it("labels objects with their facing", () => {
    expect(objectLabel(BENCH)).toBe("Bench →");
    expect([0, 90, 180, 270].map((rotation) => objectLabel({ ...TREE, rotation: rotation as 0 }))).toEqual([
      "Tree ↑",
      "Tree →",
      "Tree ↓",
      "Tree ←",
    ]);
    expect(nextRotation(270)).toBe(0);
  });

  it("has one button per decoration in catalog order", () => {
    expect(DECORATION_ORDER).toEqual(["fence", "path", "flower_bed", "bush", "bench", "tree", "small_house"]);
  });
});

describe("tapDecoration", () => {
  it("selects an owned decoration at rotation 0", () => {
    expect(tapDecoration(state(), NO_SELECTION, "fence")).toEqual({
      kind: "select",
      selection: { kind: "decoration", decorationId: "fence", rotation: 0 },
    });
  });

  it("deselects the selected decoration", () => {
    expect(tapDecoration(state(), placingFence, "fence")).toEqual({ kind: "select", selection: NO_SELECTION });
  });

  it("explains when none are owned instead of selecting", () => {
    expect(tapDecoration(state(), NO_SELECTION, "bench")).toEqual({ kind: "message", text: "You have no Bench to place." });
  });
});

describe("tapTile", () => {
  it("asks the server to place the selected decoration with its rotation", () => {
    expect(tapTile(state(), placingFence, { x: 7, y: 7 })).toEqual({
      kind: "place",
      decorationId: "fence",
      x: 7,
      y: 7,
      rotation: 90,
    });
  });

  it("leaves bounds and plots to the server (no client-side rejection)", () => {
    expect(tapTile(state(), placingFence, { x: 3, y: 3 }).kind).toBe("place");
    expect(tapTile(state(), { kind: "decoration", decorationId: "tree", rotation: 0 }, { x: 7, y: 7 }).kind).toBe("place");
  });

  it("asks the server to move the selected object", () => {
    expect(tapTile(state(), treeSelected, { x: 6, y: 6 })).toEqual({ kind: "move", objectId: 1, x: 6, y: 6 });
  });

  it("selects an object when one is tapped, and deselects it on a second tap", () => {
    expect(tapTile(state(), NO_SELECTION, { x: 1, y: 1 })).toEqual({ kind: "select", selection: treeSelected });
    expect(tapTile(state(), placingFence, { x: 6, y: 0 })).toEqual({
      kind: "select",
      selection: { kind: "object", objectId: 2 },
    });
    expect(tapTile(state(), treeSelected, { x: 6, y: 0 })).toEqual({
      kind: "select",
      selection: { kind: "object", objectId: 2 },
    });
    expect(tapTile(state(), treeSelected, { x: 1, y: 0 })).toEqual({ kind: "select", selection: NO_SELECTION });
  });

  it("gives a hint when nothing is selected", () => {
    expect(tapTile(state(), NO_SELECTION, { x: 3, y: 3 })).toMatchObject({ kind: "message", text: expect.stringContaining("crop plots") });
    expect(tapTile(state(), NO_SELECTION, { x: 7, y: 7 })).toMatchObject({ kind: "message" });
  });
});

describe("rotate and remove", () => {
  it("asks the server to rotate a placed object by 90°", () => {
    expect(tapRotate(state(), { kind: "object", objectId: 2 })).toEqual({ kind: "rotate", objectId: 2, rotation: 180 });
  });

  it("turns the decoration about to be placed locally", () => {
    expect(tapRotate(state(), placingFence)).toEqual({ kind: "select", selection: { ...placingFence, rotation: 180 } });
  });

  it("explains when nothing is selected", () => {
    expect(tapRotate(state(), NO_SELECTION).kind).toBe("message");
    expect(tapRotate(state(), { kind: "object", objectId: 9 }).kind).toBe("message");
    expect(tapRemove(NO_SELECTION).kind).toBe("message");
    expect(tapRemove(placingFence).kind).toBe("message");
  });

  it("asks the server to remove the selected object", () => {
    expect(tapRemove(treeSelected)).toEqual({ kind: "remove", objectId: 1 });
  });
});

describe("following the server state", () => {
  it("drops a selected object the server no longer has", () => {
    expect(reconcileSelection(state({ objects: [BENCH] }), treeSelected)).toEqual(NO_SELECTION);
    expect(reconcileSelection(state(), treeSelected)).toEqual(treeSelected);
  });

  it("drops a decoration selection when the last one was placed", () => {
    expect(reconcileSelection(state({ decorations: [] }), placingFence)).toEqual(NO_SELECTION);
    expect(reconcileSelection(state(), placingFence)).toEqual(placingFence);
  });

  it("describes the selection", () => {
    expect(selectionText(state(), placingFence)).toBe("Placing Fence → · tap a free tile");
    expect(selectionText(state(), treeSelected)).toBe("Tree ↑ selected · tap a tile to move it");
    expect(selectionText(state({ decorations: [], objects: [] }), NO_SELECTION)).toBe("You have no decorations yet.");
  });

  it("reports results and errors in words", () => {
    expect(editSuccessText("place", BENCH)).toBe("Bench placed.");
    expect(editSuccessText("remove", TREE)).toBe("Tree put away.");
    expect(editErrorText("PLACEMENT_INVALID")).toContain("does not fit");
    expect(editErrorText("OBJECT_NOT_FOUND")).toContain("no longer on your farm");
    expect(editErrorText("ITEM_NOT_OWNED")).toContain("none of that decoration");
    expect(editErrorText("PLOT_EMPTY")).toBeUndefined();
  });
});
