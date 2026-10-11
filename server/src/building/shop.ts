/**
 * Decoration shop (Phase 3, Step 3.4; decisions P3-4 coin shop, P3-5 prices
 * and levels). Pure function: no I/O, no clock.
 *
 * Buys one decoration at the fixed price from @farmverse/shared/building:
 * the player's level (from XP) must reach the decoration's unlock level, then
 * the coins must cover the price. Coins go down and the decoration is added
 * to the unplaced stock, in one result the caller saves in one transaction.
 * The client never sends a price or a quantity.
 */
import { getDecoration, isDecorationId, type DecorationId } from "@farmverse/shared/building";
import type { ErrorCode } from "@farmverse/shared/errors";
import { levelFromXp } from "@farmverse/shared/progression";
import { assertFarmData, type FarmData } from "../farming/rules.js";
import { assertBuildingData, grantDecoration, type BuildingData } from "./rules.js";

export type ShopError = Extract<ErrorCode, "LEVEL_TOO_LOW" | "INSUFFICIENT_CURRENCY">;

export type BuyResult =
  | { ok: true; farm: FarmData; building: BuildingData; price: number }
  | { ok: false; error: ShopError };

export function buyDecoration(farm: FarmData, building: BuildingData, decorationId: DecorationId): BuyResult {
  assertFarmData(farm);
  assertBuildingData(building);
  if (!isDecorationId(decorationId)) throw new RangeError(`Invalid decoration id: ${decorationId}`);

  const { price, unlockLevel } = getDecoration(decorationId);
  if (levelFromXp(farm.xp) < unlockLevel) return { ok: false, error: "LEVEL_TOO_LOW" };
  if (farm.coins < price) return { ok: false, error: "INSUFFICIENT_CURRENCY" };

  return {
    ok: true,
    farm: { ...farm, coins: farm.coins - price },
    building: grantDecoration(building, decorationId, 1),
    price,
  };
}
