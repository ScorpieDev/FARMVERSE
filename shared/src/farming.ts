/**
 * Static farming data shared by client and server (Phase 1 MVP; Phase 2 adds
 * Corn, Strawberry and plots 7–9, unlocked by level — see progression.ts).
 *
 * Only definitions and shape checks live here. Gameplay rules (planting,
 * readiness, harvesting, seed refill eligibility) are decided by the server.
 */

/**
 * Plots per farm; indices are 0..FARM_PLOT_COUNT-1. Plots from 6 up are
 * locked until the level in progression.ts LEVEL_UNLOCKS.
 */
export const FARM_PLOT_COUNT = 9;

/** Seeds of each level-1 crop a new player starts with, and of a crop when it unlocks. */
export const STARTER_SEEDS_PER_CROP = 5;

/**
 * MVP seed refill (temporary until the Shop in Phase 6): seeds of each
 * unlocked crop granted when the player has no seeds and no crops left.
 */
export const SEED_REFILL_PER_CROP = 5;

/** Wait, measured on the server clock, before a seed refill is allowed. */
export const SEED_REFILL_COOLDOWN_MS = 60_000;

export const CROP_IDS = ["wheat", "carrot", "tomato", "corn", "strawberry"] as const;
export type CropId = (typeof CROP_IDS)[number];

export const ITEM_IDS = [
  "wheat_seed",
  "carrot_seed",
  "tomato_seed",
  "wheat_produce",
  "carrot_produce",
  "tomato_produce",
  "corn_seed",
  "strawberry_seed",
  "corn_produce",
  "strawberry_produce",
] as const;
export type ItemId = (typeof ITEM_IDS)[number];

/** Items produced by harvesting (`<crop>_produce`). */
export type ProduceItemId = Extract<ItemId, `${string}_produce`>;

export type ItemKind = "seed" | "produce";

export interface ItemDefinition {
  id: ItemId;
  /** Display name shown to players. */
  name: string;
  kind: ItemKind;
}

export interface CropDefinition {
  id: CropId;
  name: string;
  seedItemId: ItemId;
  produceItemId: ItemId;
  /** Time from planting until the crop is ready, in milliseconds. */
  growthMs: number;
  /** Produce items added to the inventory per harvest. */
  harvestYield: number;
  /** Coins granted per harvest (provisional MVP value, server-decided). */
  coinReward: number;
  /** XP granted per harvest (provisional MVP value, server-decided). */
  xpReward: number;
}

export const ITEMS: readonly ItemDefinition[] = [
  { id: "wheat_seed", name: "Wheat Seed", kind: "seed" },
  { id: "carrot_seed", name: "Carrot Seed", kind: "seed" },
  { id: "tomato_seed", name: "Tomato Seed", kind: "seed" },
  { id: "wheat_produce", name: "Wheat", kind: "produce" },
  { id: "carrot_produce", name: "Carrot", kind: "produce" },
  { id: "tomato_produce", name: "Tomato", kind: "produce" },
  { id: "corn_seed", name: "Corn Seed", kind: "seed" },
  { id: "strawberry_seed", name: "Strawberry Seed", kind: "seed" },
  { id: "corn_produce", name: "Corn", kind: "produce" },
  { id: "strawberry_produce", name: "Strawberry", kind: "produce" },
];

export const CROPS: readonly CropDefinition[] = [
  {
    id: "wheat",
    name: "Wheat",
    seedItemId: "wheat_seed",
    produceItemId: "wheat_produce",
    growthMs: 30_000,
    harvestYield: 1,
    coinReward: 2,
    xpReward: 1,
  },
  {
    id: "carrot",
    name: "Carrot",
    seedItemId: "carrot_seed",
    produceItemId: "carrot_produce",
    growthMs: 120_000,
    harvestYield: 1,
    coinReward: 6,
    xpReward: 3,
  },
  {
    id: "tomato",
    name: "Tomato",
    seedItemId: "tomato_seed",
    produceItemId: "tomato_produce",
    growthMs: 300_000,
    harvestYield: 1,
    coinReward: 12,
    xpReward: 6,
  },
  // Phase 2 (P2-4, provisional values): unlocked at levels 3 and 5.
  {
    id: "corn",
    name: "Corn",
    seedItemId: "corn_seed",
    produceItemId: "corn_produce",
    growthMs: 180_000,
    harvestYield: 1,
    coinReward: 9,
    xpReward: 4,
  },
  {
    id: "strawberry",
    name: "Strawberry",
    seedItemId: "strawberry_seed",
    produceItemId: "strawberry_produce",
    growthMs: 480_000,
    harvestYield: 1,
    coinReward: 20,
    xpReward: 9,
  },
];

export function isCropId(value: unknown): value is CropId {
  return (
    typeof value === "string" && (CROP_IDS as readonly string[]).includes(value)
  );
}

export function isItemId(value: unknown): value is ItemId {
  return (
    typeof value === "string" && (ITEM_IDS as readonly string[]).includes(value)
  );
}

/** True only for produce items (`kind: "produce"`), never for seeds. */
export function isProduceItemId(value: unknown): value is ProduceItemId {
  return isItemId(value) && getItem(value).kind === "produce";
}

export function isPlotIndex(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < FARM_PLOT_COUNT
  );
}

export function getCrop(id: CropId): CropDefinition {
  const crop = CROPS.find((definition) => definition.id === id);
  if (!crop) throw new Error(`Unknown crop: ${id}`);
  return crop;
}

export function getItem(id: ItemId): ItemDefinition {
  const item = ITEMS.find((definition) => definition.id === id);
  if (!item) throw new Error(`Unknown item: ${id}`);
  return item;
}
