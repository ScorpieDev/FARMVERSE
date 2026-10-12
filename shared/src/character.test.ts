import { describe, expect, it } from "vitest";
import {
  COSMETICS,
  COSMETIC_IDS,
  COSMETIC_SLOTS,
  DEFAULT_APPEARANCE,
  SKIN_TONES,
  SKIN_TONE_COLORS,
  STARTER_COSMETIC_IDS,
  checkAppearance,
  getCosmetic,
  isCharacterAppearance,
  isCosmeticForSlot,
  isCosmeticId,
  isSkinTone,
  type CharacterAppearance,
} from "./character.js";
import { MAX_LEVEL } from "./progression.js";

const COLOR = /^#[0-9a-f]{6}$/;

describe("catalog (C-A, K-A)", () => {
  it("lists every cosmetic ID once, in catalog order", () => {
    expect(COSMETICS.map((item) => item.id)).toEqual([...COSMETIC_IDS]);
  });

  it("has 4 items per slot: 2 free starters and 2 bought with coins", () => {
    for (const slot of COSMETIC_SLOTS) {
      const items = COSMETICS.filter((item) => item.slot === slot);
      expect(items).toHaveLength(4);
      expect(items.filter((item) => item.price === 0 && item.unlockLevel === 1)).toHaveLength(2);
      expect(items.filter((item) => item.price > 0 && item.unlockLevel >= 2)).toHaveLength(2);
    }
  });

  it("uses integer prices and reachable unlock levels", () => {
    for (const item of COSMETICS) {
      expect(Number.isInteger(item.price)).toBe(true);
      expect(item.price).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(item.unlockLevel)).toBe(true);
      expect(item.unlockLevel).toBeGreaterThanOrEqual(1);
      expect(item.unlockLevel).toBeLessThanOrEqual(MAX_LEVEL);
      expect(item.name.length).toBeGreaterThan(0);
    }
  });

  it("matches the approved prices and levels (plan §2.2)", () => {
    const paid = COSMETICS.filter((item) => item.price > 0).map((item) => [item.id, item.price, item.unlockLevel]);
    expect(paid).toEqual([
      ["hair_spiky_blond", 40, 2],
      ["hair_bun_red", 80, 4],
      ["shirt_plaid", 50, 3],
      ["shirt_overalls", 100, 5],
      ["pants_green_shorts", 40, 2],
      ["pants_work", 90, 5],
    ]);
  });

  it("gives drawable colours to items and skin tones", () => {
    for (const item of COSMETICS) expect(item.color).toMatch(COLOR);
    expect(Object.keys(SKIN_TONE_COLORS)).toEqual([...SKIN_TONES]);
    for (const tone of SKIN_TONES) expect(SKIN_TONE_COLORS[tone]).toMatch(COLOR);
  });

  it("starts players with the 6 free items, and the default appearance uses them", () => {
    expect(STARTER_COSMETIC_IDS).toHaveLength(6);
    expect(checkAppearance(STARTER_COSMETIC_IDS, { ...DEFAULT_APPEARANCE })).toEqual({ ok: true });
  });

  it("getCosmetic returns the definition and throws for unknown IDs", () => {
    expect(getCosmetic("shirt_plaid").name).toBe("Plaid Shirt");
    expect(() => getCosmetic("hat" as never)).toThrow();
  });
});

describe("shape checks", () => {
  it.each([["hair_bun_red", true], ["pants_work", true], ["fence", false], ["", false], [1, false], [null, false]])(
    "isCosmeticId(%j) is %s",
    (value, expected) => {
      expect(isCosmeticId(value)).toBe(expected);
    },
  );

  it("isSkinTone accepts only the 4 tones", () => {
    for (const tone of SKIN_TONES) expect(isSkinTone(tone)).toBe(true);
    expect(isSkinTone("green")).toBe(false);
    expect(isSkinTone(undefined)).toBe(false);
  });

  it("isCosmeticForSlot checks the slot", () => {
    expect(isCosmeticForSlot("hair_long_black", "hair")).toBe(true);
    expect(isCosmeticForSlot("hair_long_black", "shirt")).toBe(false);
    expect(isCosmeticForSlot("nope", "hair")).toBe(false);
  });

  it("isCharacterAppearance accepts a full appearance", () => {
    expect(isCharacterAppearance({ ...DEFAULT_APPEARANCE })).toBe(true);
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["array", []],
    ["missing slot", { skin: "light", hair: "hair_short_brown", shirt: "shirt_white_tee" }],
    ["extra field", { ...DEFAULT_APPEARANCE, hat: "x" }],
    ["unknown skin", { ...DEFAULT_APPEARANCE, skin: "blue" }],
    ["unknown item", { ...DEFAULT_APPEARANCE, hair: "hair_mohawk" }],
    ["item in the wrong slot", { ...DEFAULT_APPEARANCE, hair: "shirt_white_tee" }],
  ])("isCharacterAppearance rejects %s", (_label, value) => {
    expect(isCharacterAppearance(value)).toBe(false);
  });
});

describe("checkAppearance", () => {
  const owned = [...STARTER_COSMETIC_IDS, "hair_bun_red" as const];

  it("accepts owned items and any skin tone", () => {
    const look: CharacterAppearance = { skin: "dark", hair: "hair_bun_red", shirt: "shirt_blue_tee", pants: "pants_brown" };
    expect(checkAppearance(owned, look)).toEqual({ ok: true });
  });

  it("rejects an item the player does not own and names it", () => {
    const look = { ...DEFAULT_APPEARANCE, shirt: "shirt_overalls" };
    expect(checkAppearance(owned, look)).toEqual({ ok: false, problem: "not_owned", cosmeticId: "shirt_overalls" });
  });

  it("rejects a malformed appearance before checking ownership", () => {
    expect(checkAppearance(owned, { ...DEFAULT_APPEARANCE, pants: "hair_bun_red" })).toEqual({
      ok: false,
      problem: "invalid",
    });
  });
});
