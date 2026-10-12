import { describe, expect, it } from "vitest";
import type { FarmState, ProgressionState } from "@farmverse/shared/api";
import { DEFAULT_APPEARANCE, STARTER_COSMETIC_IDS, type CosmeticId } from "@farmverse/shared/character";
import { FARM_PLOT_COUNT } from "@farmverse/shared/farming";
import {
  CHARACTER_TABS,
  buyCosmeticText,
  canBuy,
  canWear,
  characterErrorText,
  draftText,
  isCosmeticLocked,
  optionLabel,
  startDraft,
  tabName,
  tabOptions,
  tapBuy,
  tapOption,
  tapTab,
  tapWear,
  unownedInDraft,
  type CharacterDraft,
} from "./characterView.js";

const LEVELS: Record<number, ProgressionState> = {
  1: { level: 1, xpIntoLevel: 0, xpForNextLevel: 50, unlockedPlotCount: 6 },
  2: { level: 2, xpIntoLevel: 0, xpForNextLevel: 100, unlockedPlotCount: 7 },
};

function state(options: { coins?: number; level?: 1 | 2; owned?: CosmeticId[] } = {}): FarmState {
  const level = options.level ?? 1;
  return {
    serverTime: 0,
    plots: Array.from({ length: FARM_PLOT_COUNT }, (_, index) => ({ index, crop: null })),
    inventory: [],
    seedRefill: { eligible: false, availableAt: null },
    coins: options.coins ?? 0,
    xp: level === 1 ? 0 : 50,
    progression: LEVELS[level]!,
    quest: null,
    decorations: [],
    objects: [],
    character: { appearance: { ...DEFAULT_APPEARANCE }, owned: [...STARTER_COSMETIC_IDS, ...(options.owned ?? [])] },
  };
}

const draft = (overrides: Partial<CharacterDraft["appearance"]> = {}, tab: CharacterDraft["tab"] = "hair"): CharacterDraft => ({
  tab,
  appearance: { ...DEFAULT_APPEARANCE, ...overrides },
});

describe("tabs and options", () => {
  it("has Hair / Shirt / Pants / Skin with 4 options each", () => {
    expect(CHARACTER_TABS.map(tabName)).toEqual(["Hair", "Shirt", "Pants", "Skin"]);
    for (const tab of CHARACTER_TABS) expect(tabOptions(tab)).toHaveLength(4);
    expect(tabOptions("skin")).toEqual(["light", "tan", "brown", "dark"]);
    expect(tabOptions("pants")[0]).toBe("pants_blue_jeans");
  });

  it("opens on Hair with the worn look", () => {
    expect(startDraft(state())).toEqual({ tab: "hair", appearance: DEFAULT_APPEARANCE });
  });

  it("labels options as owned, priced, locked or free", () => {
    const s = state({ level: 2 });
    expect(optionLabel(s, "hair_short_brown")).toBe("Short Brown\nOwned");
    expect(optionLabel(s, "hair_spiky_blond")).toBe("Spiky Blond\n40c");
    expect(optionLabel(s, "hair_bun_red")).toBe("Bun Red\nLevel 4");
    expect(optionLabel(s, "tan")).toBe("Tan\nFree");
    expect(optionLabel(state({ owned: ["hair_bun_red"] }), "hair_bun_red")).toBe("Bun Red\nOwned");
  });

  it("never treats owned items as locked", () => {
    expect(isCosmeticLocked(state(), "shirt_overalls")).toBe(true);
    expect(isCosmeticLocked(state({ owned: ["shirt_overalls"] }), "shirt_overalls")).toBe(false);
  });
});

describe("trying on", () => {
  it("switching tabs keeps the draft", () => {
    expect(tapTab(draft({ skin: "dark" }), "skin")).toEqual({ kind: "select", draft: draft({ skin: "dark" }, "skin") });
  });

  it("tries on skin tones, owned and buyable items locally", () => {
    const s = state({ level: 2 });
    expect(tapOption(s, draft({}, "skin"), "brown")).toEqual({ kind: "select", draft: draft({ skin: "brown" }, "skin") });
    expect(tapOption(s, draft(), "hair_spiky_blond")).toEqual({ kind: "select", draft: draft({ hair: "hair_spiky_blond" }) });
    expect(tapOption(s, draft({}, "pants"), "pants_brown")).toEqual({
      kind: "select",
      draft: draft({ pants: "pants_brown" }, "pants"),
    });
  });

  it("only shows the level for locked items", () => {
    expect(tapOption(state(), draft(), "hair_bun_red")).toEqual({ kind: "message", text: "Bun Red unlocks at level 4." });
  });
});

describe("Buy", () => {
  it("asks the server for the unowned item tried on in the open tab", () => {
    expect(tapBuy(state(), draft({ shirt: "shirt_plaid" }, "shirt"))).toEqual({ kind: "buy", cosmeticId: "shirt_plaid" });
  });

  it("explains when there is nothing to buy", () => {
    expect(tapBuy(state(), draft())).toEqual({ kind: "message", text: "You already own Short Brown." });
    expect(tapBuy(state(), draft({}, "skin")).kind).toBe("message");
  });

  it("highlights Buy only for an unlocked, affordable item (the server decides)", () => {
    expect(canBuy(state({ coins: 40, level: 2 }), draft({ hair: "hair_spiky_blond" }))).toBe(true);
    expect(canBuy(state({ coins: 39, level: 2 }), draft({ hair: "hair_spiky_blond" }))).toBe(false);
    expect(canBuy(state({ coins: 999 }), draft())).toBe(false);
    expect(canBuy(state({ coins: 999 }), draft({}, "skin"))).toBe(false);
  });
});

describe("Wear", () => {
  it("asks the server to save a changed look of owned items", () => {
    const look = draft({ skin: "tan", hair: "hair_long_black" });
    expect(tapWear(state(), look)).toEqual({ kind: "equip", appearance: look.appearance });
    expect(canWear(state(), look)).toBe(true);
  });

  it("asks to buy unowned items first", () => {
    const look = draft({ hair: "hair_spiky_blond", pants: "pants_work" });
    expect(unownedInDraft(state(), look)).toEqual(["hair_spiky_blond", "pants_work"]);
    expect(tapWear(state(), look)).toEqual({ kind: "message", text: "Buy Spiky Blond first." });
    expect(canWear(state(), look)).toBe(false);
  });

  it("does nothing for the look already worn", () => {
    expect(tapWear(state(), draft())).toEqual({ kind: "message", text: "You are already wearing this look." });
  });
});

describe("texts", () => {
  it("shows coins and what to do next", () => {
    expect(draftText(state({ coins: 12 }), draft())).toBe("Coins 12 · This is your look.");
    expect(draftText(state(), draft({ hair: "hair_spiky_blond" }))).toBe("Coins 0 · Spiky Blond: 40 coins · tap Buy");
    expect(draftText(state(), draft({ hair: "hair_spiky_blond" }, "skin"))).toBe(
      "Coins 0 · Buy the items you are trying on to wear them.",
    );
    expect(draftText(state(), draft({ skin: "dark" }))).toBe("Coins 0 · Tap Wear to keep this look.");
  });

  it("describes purchases and errors", () => {
    expect(buyCosmeticText({ cosmeticId: "pants_work", price: 90 })).toBe(
      "Bought Work Pants for 90 coins. Tap Wear to put it on.",
    );
    expect(characterErrorText("ALREADY_OWNED")).toMatch(/already own/);
    expect(characterErrorText("INSUFFICIENT_CURRENCY")).toMatch(/Not enough coins/);
    expect(characterErrorText("PLOT_EMPTY")).toBeUndefined();
  });
});
