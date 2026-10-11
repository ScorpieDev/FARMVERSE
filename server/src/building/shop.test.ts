import { describe, expect, it } from "vitest";
import { DECORATIONS } from "@farmverse/shared/building";
import { totalXpForLevel } from "@farmverse/shared/progression";
import { createStarterFarm, type FarmData } from "../farming/rules.js";
import { createEmptyBuilding } from "./rules.js";
import { buyDecoration } from "./shop.js";

function farmWith(coins: number, level = 1): FarmData {
  return { ...createStarterFarm(), coins, xp: totalXpForLevel(level) };
}

describe("buyDecoration", () => {
  it("charges the catalog price and adds one to the stock", () => {
    const farm = farmWith(12);
    const building = createEmptyBuilding();
    const result = buyDecoration(farm, building, "fence");
    if (!result.ok) throw new Error(result.error);
    expect(result.price).toBe(5);
    expect(result.farm.coins).toBe(7);
    expect(result.building.stock.fence).toBe(1);
    expect(result.farm.xp).toBe(farm.xp);
    expect(result.farm.inventory).toEqual(farm.inventory);
    expect(result.building.objects).toEqual([]);
    // Inputs are not modified.
    expect(farm.coins).toBe(12);
    expect(building.stock.fence).toBe(0);
  });

  it("allows spending the exact balance down to 0", () => {
    const result = buyDecoration(farmWith(300, 6), createEmptyBuilding(), "small_house");
    expect(result.ok && result.farm.coins).toBe(0);
  });

  it("rejects a purchase the coins do not cover", () => {
    expect(buyDecoration(farmWith(4), createEmptyBuilding(), "fence")).toEqual({
      ok: false,
      error: "INSUFFICIENT_CURRENCY",
    });
  });

  it.each(DECORATIONS.map((decoration) => [decoration.id, decoration.unlockLevel] as const))(
    "%s needs level %i",
    (decorationId, level) => {
      const rich = 10_000;
      if (level > 1) {
        expect(buyDecoration(farmWith(rich, level - 1), createEmptyBuilding(), decorationId)).toEqual({
          ok: false,
          error: "LEVEL_TOO_LOW",
        });
      }
      expect(buyDecoration(farmWith(rich, level), createEmptyBuilding(), decorationId).ok).toBe(true);
    },
  );

  it("checks the level before the coins", () => {
    expect(buyDecoration(farmWith(0, 1), createEmptyBuilding(), "tree")).toEqual({ ok: false, error: "LEVEL_TOO_LOW" });
  });

  it("rejects an unknown decoration and corrupted data", () => {
    expect(() => buyDecoration(farmWith(100), createEmptyBuilding(), "castle" as never)).toThrow(RangeError);
    expect(() => buyDecoration({ ...farmWith(100), coins: -1 }, createEmptyBuilding(), "fence")).toThrow(RangeError);
    expect(() => buyDecoration(farmWith(100), { ...createEmptyBuilding(), nextObjectId: 0 }, "fence")).toThrow(RangeError);
  });
});
