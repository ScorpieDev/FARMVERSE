/**
 * Static character data and appearance rules shared by client and server
 * (Phase 4, Step 4.1).
 *
 * Design: docs/reports/phase4/PHASE4_CHARACTER_PLAN_REPORT.md, approved by
 * the Game Director 2026-10-12 (R-A shape drawing, C-A catalog, K-A coin
 * shop, D-A Character screen). Values are provisional:
 * - Every player has one character with a skin tone and one cosmetic worn in
 *   each slot (hair, shirt, pants).
 * - Each slot has 4 cosmetics: 2 free starter items owned from the start and
 *   2 bought with coins once the player's level reaches the unlock level.
 * - Skin tones are free to choose and are not items.
 * - Cosmetics are kept forever: no resale, never stolen (GAME_RULES.md §10–11),
 *   and they give no gameplay advantage.
 *
 * `style` and `color` describe how the client draws an item with Phaser
 * shapes (R-A, no image assets). The server owns the cosmetic inventory,
 * worn items, coins and levels, and runs these checks on every change.
 */

export const COSMETIC_SLOTS = ["hair", "shirt", "pants"] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

export const COSMETIC_IDS = [
  "hair_short_brown",
  "hair_long_black",
  "hair_spiky_blond",
  "hair_bun_red",
  "shirt_white_tee",
  "shirt_blue_tee",
  "shirt_plaid",
  "shirt_overalls",
  "pants_blue_jeans",
  "pants_brown",
  "pants_green_shorts",
  "pants_work",
] as const;
export type CosmeticId = (typeof COSMETIC_IDS)[number];

/** Shape the client draws for an item. */
export type CosmeticStyle = "short" | "long" | "spiky" | "bun" | "tee" | "plaid" | "overalls" | "trousers" | "shorts";

export interface CosmeticDefinition {
  id: CosmeticId;
  /** Display name shown to players. */
  name: string;
  slot: CosmeticSlot;
  style: CosmeticStyle;
  /** Main colour as `#rrggbb`. */
  color: string;
  /** Coins for one, charged by the server; 0 for starter items (provisional). */
  price: number;
  /** Level from which it can be bought (provisional). */
  unlockLevel: number;
}

export const COSMETICS: readonly CosmeticDefinition[] = [
  { id: "hair_short_brown", name: "Short Brown", slot: "hair", style: "short", color: "#6b4226", price: 0, unlockLevel: 1 },
  { id: "hair_long_black", name: "Long Black", slot: "hair", style: "long", color: "#222222", price: 0, unlockLevel: 1 },
  { id: "hair_spiky_blond", name: "Spiky Blond", slot: "hair", style: "spiky", color: "#e8c75a", price: 40, unlockLevel: 2 },
  { id: "hair_bun_red", name: "Bun Red", slot: "hair", style: "bun", color: "#b5432f", price: 80, unlockLevel: 4 },
  { id: "shirt_white_tee", name: "White Tee", slot: "shirt", style: "tee", color: "#f2f2f2", price: 0, unlockLevel: 1 },
  { id: "shirt_blue_tee", name: "Blue Tee", slot: "shirt", style: "tee", color: "#3f7fd1", price: 0, unlockLevel: 1 },
  { id: "shirt_plaid", name: "Plaid Shirt", slot: "shirt", style: "plaid", color: "#c0392b", price: 50, unlockLevel: 3 },
  { id: "shirt_overalls", name: "Overalls Top", slot: "shirt", style: "overalls", color: "#4a6fa5", price: 100, unlockLevel: 5 },
  { id: "pants_blue_jeans", name: "Blue Jeans", slot: "pants", style: "trousers", color: "#2f4f7f", price: 0, unlockLevel: 1 },
  { id: "pants_brown", name: "Brown Pants", slot: "pants", style: "trousers", color: "#7a5a3a", price: 0, unlockLevel: 1 },
  { id: "pants_green_shorts", name: "Green Shorts", slot: "pants", style: "shorts", color: "#4f8a3c", price: 40, unlockLevel: 2 },
  { id: "pants_work", name: "Work Pants", slot: "pants", style: "trousers", color: "#8a7f5a", price: 90, unlockLevel: 5 },
];

export const SKIN_TONES = ["light", "tan", "brown", "dark"] as const;
export type SkinTone = (typeof SKIN_TONES)[number];

/** Colour of each skin tone as `#rrggbb`. */
export const SKIN_TONE_COLORS: Readonly<Record<SkinTone, string>> = {
  light: "#f6d7b8",
  tan: "#e0ac7e",
  brown: "#a86b45",
  dark: "#6b4329",
};

/** What a character looks like: skin tone plus the item worn in each slot. */
export interface CharacterAppearance {
  skin: SkinTone;
  hair: CosmeticId;
  shirt: CosmeticId;
  pants: CosmeticId;
}

/** Items every player owns from the start (price 0). */
export const STARTER_COSMETIC_IDS: readonly CosmeticId[] = COSMETICS.filter((item) => item.price === 0).map(
  (item) => item.id,
);

/** Appearance of a new character. */
export const DEFAULT_APPEARANCE: Readonly<CharacterAppearance> = {
  skin: "light",
  hair: "hair_short_brown",
  shirt: "shirt_white_tee",
  pants: "pants_blue_jeans",
};

// ---------- lookups and shape checks ----------

export function isCosmeticId(value: unknown): value is CosmeticId {
  return typeof value === "string" && (COSMETIC_IDS as readonly string[]).includes(value);
}

export function isSkinTone(value: unknown): value is SkinTone {
  return typeof value === "string" && (SKIN_TONES as readonly string[]).includes(value);
}

export function getCosmetic(id: CosmeticId): CosmeticDefinition {
  const cosmetic = COSMETICS.find((definition) => definition.id === id);
  if (!cosmetic) throw new Error(`Unknown cosmetic: ${id}`);
  return cosmetic;
}

/** True when `value` is a known cosmetic that belongs in `slot`. */
export function isCosmeticForSlot(value: unknown, slot: CosmeticSlot): value is CosmeticId {
  return isCosmeticId(value) && getCosmetic(value).slot === slot;
}

/**
 * Checks the shape of an appearance: a known skin tone and, for each slot, a
 * known cosmetic of that slot. Extra fields are rejected. Ownership is
 * decided by checkAppearance.
 */
export function isCharacterAppearance(value: unknown): value is CharacterAppearance {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(",") !== ["hair", "pants", "shirt", "skin"].join(",")) return false;
  return isSkinTone(record["skin"]) && COSMETIC_SLOTS.every((slot) => isCosmeticForSlot(record[slot], slot));
}

// ---------- appearance rules ----------

/**
 * Why an appearance is rejected:
 * - `invalid`: wrong shape, unknown skin tone or item, or an item in the wrong slot;
 * - `not_owned`: a worn item is not in the player's cosmetic inventory.
 */
export type AppearanceProblem = "invalid" | "not_owned";

export type AppearanceCheck =
  | { ok: true }
  | { ok: false; problem: AppearanceProblem; /** Set for `not_owned`. */ cosmeticId?: CosmeticId };

/** Decides whether a player owning `owned` may wear `appearance`. */
export function checkAppearance(owned: readonly CosmeticId[], appearance: unknown): AppearanceCheck {
  if (!isCharacterAppearance(appearance)) return { ok: false, problem: "invalid" };
  for (const slot of COSMETIC_SLOTS) {
    const cosmeticId = appearance[slot];
    if (!owned.includes(cosmeticId)) return { ok: false, problem: "not_owned", cosmeticId };
  }
  return { ok: true };
}
