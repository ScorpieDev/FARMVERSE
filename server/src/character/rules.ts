/**
 * Server-side character rules (Phase 4, Step 4.2). Pure functions: no I/O,
 * no clock.
 *
 * A player's character is kept beside FarmData: the appearance (skin tone
 * and the cosmetic worn in each slot) and the cosmetics the player owns.
 * Cosmetic data comes from @farmverse/shared/character (P4-2 catalog, P4-3
 * starters plus coin shop). The client sends only intents (a whole new
 * appearance, or one cosmetic to buy); prices, levels and ownership are
 * decided here.
 *
 * Gameplay failures are returned as `{ ok: false, error }`:
 * - ITEM_NOT_OWNED: equipping a cosmetic the player does not own;
 * - ALREADY_OWNED: buying a cosmetic the player owns (cosmetics are kept
 *   forever, so one of each is enough);
 * - LEVEL_TOO_LOW, then INSUFFICIENT_CURRENCY: like the decoration shop.
 * Malformed CharacterData (e.g. corrupted storage) throws a RangeError.
 * Functions never modify their input.
 */
import {
  COSMETIC_IDS,
  DEFAULT_APPEARANCE,
  STARTER_COSMETIC_IDS,
  checkAppearance,
  getCosmetic,
  isCharacterAppearance,
  isCosmeticId,
  type CharacterAppearance,
  type CosmeticId,
} from "@farmverse/shared/character";
import type { CharacterState } from "@farmverse/shared/api";
import type { ErrorCode } from "@farmverse/shared/errors";
import { levelFromXp } from "@farmverse/shared/progression";
import { assertFarmData, type FarmData } from "../farming/rules.js";

export interface CharacterData {
  readonly appearance: Readonly<CharacterAppearance>;
  /** Owned cosmetics in catalog order, each once; includes every starter item. */
  readonly owned: readonly CosmeticId[];
}

export type EquipError = Extract<ErrorCode, "ITEM_NOT_OWNED">;
export type CosmeticShopError = Extract<ErrorCode, "ALREADY_OWNED" | "LEVEL_TOO_LOW" | "INSUFFICIENT_CURRENCY">;

export type EquipResult = { ok: true; character: CharacterData } | { ok: false; error: EquipError };

export type BuyCosmeticResult =
  | { ok: true; farm: FarmData; character: CharacterData; price: number }
  | { ok: false; error: CosmeticShopError };

/** Owned cosmetics sorted into catalog order. */
function inCatalogOrder(owned: Iterable<CosmeticId>): CosmeticId[] {
  const set = new Set(owned);
  return COSMETIC_IDS.filter((id) => set.has(id));
}

/**
 * Checks the CharacterData invariants: known cosmetics in catalog order
 * without duplicates, every starter item owned, and a well-formed appearance
 * that only wears owned items. Exported so storage can reject corrupted data.
 */
export function assertCharacterData(character: CharacterData): void {
  if (typeof character !== "object" || character === null) throw new RangeError("Invalid character data");
  const { appearance, owned } = character;
  if (!Array.isArray(owned) || !owned.every(isCosmeticId)) throw new RangeError("Invalid owned cosmetics");
  const ordered = inCatalogOrder(owned);
  if (ordered.length !== owned.length || ordered.some((id, index) => id !== owned[index])) {
    throw new RangeError("Owned cosmetics are duplicated or out of catalog order");
  }
  if (!STARTER_COSMETIC_IDS.every((id) => owned.includes(id))) throw new RangeError("Missing starter cosmetics");
  if (!isCharacterAppearance(appearance)) throw new RangeError("Invalid appearance");
  if (!checkAppearance(owned, appearance).ok) throw new RangeError("Appearance wears a cosmetic that is not owned");
}

/** A new player: the starter items, wearing the default appearance. */
export function createStarterCharacter(): CharacterData {
  return { appearance: { ...DEFAULT_APPEARANCE }, owned: [...STARTER_COSMETIC_IDS] };
}

/** Replaces the whole appearance; every worn item must be owned. */
export function equipAppearance(character: CharacterData, appearance: CharacterAppearance): EquipResult {
  assertCharacterData(character);
  const check = checkAppearance(character.owned, appearance);
  if (!check.ok) {
    if (check.problem === "invalid") throw new RangeError("Invalid appearance");
    return { ok: false, error: "ITEM_NOT_OWNED" };
  }
  const { skin, hair, shirt, pants } = appearance;
  return { ok: true, character: { appearance: { skin, hair, shirt, pants }, owned: [...character.owned] } };
}

/**
 * Buys one cosmetic at the catalog price: not owned yet, then the player's
 * level (from XP) reaches the unlock level, then the coins cover the price.
 * Coins go down and the cosmetic is owned, in one result the caller saves in
 * one transaction. The appearance is unchanged.
 */
export function buyCosmetic(farm: FarmData, character: CharacterData, cosmeticId: CosmeticId): BuyCosmeticResult {
  assertFarmData(farm);
  assertCharacterData(character);
  if (!isCosmeticId(cosmeticId)) throw new RangeError(`Invalid cosmetic id: ${cosmeticId}`);

  if (character.owned.includes(cosmeticId)) return { ok: false, error: "ALREADY_OWNED" };
  const { price, unlockLevel } = getCosmetic(cosmeticId);
  if (levelFromXp(farm.xp) < unlockLevel) return { ok: false, error: "LEVEL_TOO_LOW" };
  if (farm.coins < price) return { ok: false, error: "INSUFFICIENT_CURRENCY" };

  return {
    ok: true,
    farm: { ...farm, coins: farm.coins - price },
    character: { appearance: { ...character.appearance }, owned: inCatalogOrder([...character.owned, cosmeticId]) },
    price,
  };
}

/** The character part of FarmState. */
export function toCharacterState(character: CharacterData): CharacterState {
  assertCharacterData(character);
  return { appearance: { ...character.appearance }, owned: [...character.owned] };
}
