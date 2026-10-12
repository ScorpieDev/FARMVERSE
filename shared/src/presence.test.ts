import { describe, expect, it } from "vitest";
import { FARM_GRID_HEIGHT, FARM_GRID_WIDTH, type PlacedObject } from "./building.js";
import {
  EMOTES,
  FARM_CODE_ALPHABET,
  entryTile,
  isDisplayName,
  isEmote,
  isFarmCode,
  isWalkable,
  parseFarmCode,
} from "./presence.js";

const fence = (objectId: number, x: number, y: number): PlacedObject => ({ objectId, decorationId: "fence", x, y, rotation: 0 });

describe("farm codes and names (F-A, N-A)", () => {
  it("uses 32 characters without look-alikes", () => {
    expect(FARM_CODE_ALPHABET).toHaveLength(32);
    expect(FARM_CODE_ALPHABET).not.toMatch(/[IO01]/);
  });

  it.each([["ABC234", true], ["ZZZZZZ", true], ["abc234", false], ["ABC23", false], ["ABC2345", false], ["ABCI23", false], ["ABC 23", false], [123456, false]])(
    "isFarmCode(%j) is %s",
    (value, expected) => expect(isFarmCode(value)).toBe(expected),
  );

  it("normalises typed codes", () => {
    expect(parseFarmCode(" abc 234 ")).toBe("ABC234");
    expect(parseFarmCode("abc23")).toBeUndefined();
    expect(parseFarmCode("abc2o4")).toBeUndefined();
  });

  it.each([["Farmer 0042", true], ["Farmer 9999", true], ["Farmer 42", false], ["farmer 0042", false], ["Farmer 0042 ", false], ["Admin", false]])(
    "isDisplayName(%j) is %s",
    (value, expected) => expect(isDisplayName(value)).toBe(expected),
  );

  it("has a fixed emote set", () => {
    expect([...EMOTES]).toEqual(["wave", "heart", "laugh", "thumbs_up"]);
    expect(isEmote("heart")).toBe(true);
    expect(isEmote("dance")).toBe(false);
  });
});

describe("walkable tiles (M-A)", () => {
  it("allows every grid tile, crop plots included, on an empty farm", () => {
    for (let y = 0; y < FARM_GRID_HEIGHT; y++) {
      for (let x = 0; x < FARM_GRID_WIDTH; x++) expect(isWalkable([], { x, y })).toBe(true);
    }
  });

  it("blocks tiles covered by objects, including every tile of a 2×2 object", () => {
    const tree: PlacedObject = { objectId: 1, decorationId: "tree", x: 0, y: 0, rotation: 0 };
    for (const tile of [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]) expect(isWalkable([tree], tile)).toBe(false);
    expect(isWalkable([tree], { x: 2, y: 0 })).toBe(true);
  });

  it.each([[{ x: 8, y: 0 }], [{ x: -1, y: 0 }], [{ x: 0.5, y: 0 }], [null], ["3,3"]])("rejects %j", (tile) => {
    expect(isWalkable([], tile)).toBe(false);
  });
});

describe("entryTile", () => {
  it("is the middle of the bottom row on an empty farm", () => {
    expect(entryTile([])).toEqual({ x: 3, y: 7 });
  });

  it("moves outwards from the middle when tiles are taken", () => {
    expect(entryTile([fence(1, 3, 7)])).toEqual({ x: 4, y: 7 });
    expect(entryTile([fence(1, 3, 7), fence(2, 4, 7)])).toEqual({ x: 2, y: 7 });
  });

  it("goes up a row when the bottom row is full, and always finds a tile (plots stay free)", () => {
    const bottom = Array.from({ length: 8 }, (_, x) => fence(x + 1, x, 7));
    expect(entryTile(bottom)).toEqual({ x: 3, y: 6 });
    const everywhereButPlots: PlacedObject[] = [];
    let id = 1;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (x >= 2 && x <= 4 && y >= 2 && y <= 4) continue;
        everywhereButPlots.push(fence(id++, x, y));
      }
    }
    expect(entryTile(everywhereButPlots)).toEqual({ x: 3, y: 4 });
  });
});
