import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, STARTER_COSMETIC_IDS, type CharacterAppearance } from "@farmverse/shared/character";
import { totalXpForLevel } from "@farmverse/shared/progression";
import { createStarterFarm, type FarmData } from "../farming/rules.js";
import {
  assertCharacterData,
  buyCosmetic,
  createStarterCharacter,
  equipAppearance,
  toCharacterState,
  type CharacterData,
} from "./rules.js";

function farmWith(coins: number, level: number): FarmData {
  return { ...createStarterFarm(), coins, xp: totalXpForLevel(level) };
}

describe("starter character", () => {
  it("owns the 6 starter items and wears the default appearance", () => {
    const character = createStarterCharacter();
    expect(character).toEqual({ appearance: DEFAULT_APPEARANCE, owned: STARTER_COSMETIC_IDS });
    expect(() => assertCharacterData(character)).not.toThrow();
    expect(createStarterCharacter().owned).not.toBe(createStarterCharacter().owned);
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["missing starter", { appearance: DEFAULT_APPEARANCE, owned: STARTER_COSMETIC_IDS.slice(1) }],
    ["duplicate", { appearance: DEFAULT_APPEARANCE, owned: [...STARTER_COSMETIC_IDS, "pants_brown"] }],
    ["out of catalog order", { appearance: DEFAULT_APPEARANCE, owned: [...STARTER_COSMETIC_IDS].reverse() }],
    ["unknown item", { appearance: DEFAULT_APPEARANCE, owned: [...STARTER_COSMETIC_IDS, "cape"] }],
    ["wears an unowned item", { appearance: { ...DEFAULT_APPEARANCE, hair: "hair_bun_red" }, owned: STARTER_COSMETIC_IDS }],
    ["bad skin", { appearance: { ...DEFAULT_APPEARANCE, skin: "blue" }, owned: STARTER_COSMETIC_IDS }],
  ])("assertCharacterData rejects %s", (_label, value) => {
    expect(() => assertCharacterData(value as CharacterData)).toThrow(RangeError);
  });
});

describe("equipAppearance", () => {
  it("replaces the whole appearance with owned items and does not modify its input", () => {
    const character = createStarterCharacter();
    const look: CharacterAppearance = { skin: "brown", hair: "hair_long_black", shirt: "shirt_blue_tee", pants: "pants_brown" };
    const result = equipAppearance(character, look);
    expect(result).toEqual({ ok: true, character: { appearance: look, owned: STARTER_COSMETIC_IDS } });
    expect(character).toEqual(createStarterCharacter());
  });

  it("returns ITEM_NOT_OWNED for an item the player does not own", () => {
    expect(equipAppearance(createStarterCharacter(), { ...DEFAULT_APPEARANCE, pants: "pants_work" })).toEqual({
      ok: false,
      error: "ITEM_NOT_OWNED",
    });
  });

  it("throws on a malformed appearance (requests are validated before)", () => {
    expect(() =>
      equipAppearance(createStarterCharacter(), { ...DEFAULT_APPEARANCE, hair: "shirt_white_tee" } as CharacterAppearance),
    ).toThrow(RangeError);
  });
});

describe("buyCosmetic (K-A)", () => {
  it("charges the catalog price, adds the item in catalog order and keeps the appearance", () => {
    const character = createStarterCharacter();
    const result = buyCosmetic(farmWith(100, 5), character, "shirt_overalls");
    if (!result.ok) throw new Error(result.error);
    expect(result.price).toBe(100);
    expect(result.farm.coins).toBe(0);
    expect(result.character.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(result.character.owned).toEqual([
      "hair_short_brown",
      "hair_long_black",
      "shirt_white_tee",
      "shirt_blue_tee",
      "shirt_overalls",
      "pants_blue_jeans",
      "pants_brown",
    ]);
    expect(character).toEqual(createStarterCharacter());
  });

  it("checks ownership, then level, then coins", () => {
    const character = createStarterCharacter();
    expect(buyCosmetic(farmWith(0, 1), character, "hair_short_brown")).toEqual({ ok: false, error: "ALREADY_OWNED" });
    expect(buyCosmetic(farmWith(0, 1), character, "hair_spiky_blond")).toEqual({ ok: false, error: "LEVEL_TOO_LOW" });
    expect(buyCosmetic(farmWith(39, 2), character, "hair_spiky_blond")).toEqual({
      ok: false,
      error: "INSUFFICIENT_CURRENCY",
    });
    const bought = buyCosmetic(farmWith(40, 2), character, "hair_spiky_blond");
    if (!bought.ok) throw new Error(bought.error);
    expect(buyCosmetic(farmWith(1000, 10), bought.character, "hair_spiky_blond")).toEqual({
      ok: false,
      error: "ALREADY_OWNED",
    });
  });

  it("toCharacterState copies the data", () => {
    const character = createStarterCharacter();
    const state = toCharacterState(character);
    expect(state).toEqual(character);
    expect(state.owned).not.toBe(character.owned);
  });
});
