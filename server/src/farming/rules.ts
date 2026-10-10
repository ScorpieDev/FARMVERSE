/**
 * Server-side farming rules (Phase 1 MVP, Phase 2 unlock checks). Pure
 * functions: no I/O, no clock.
 *
 * The caller always passes `now` from the server clock; nothing here reads
 * the time or trusts time, quantities or readiness from a client. Functions
 * never modify their input and return a new FarmData only on success, so the
 * caller can persist the result inside a transaction (later steps).
 *
 * Gameplay failures are returned as `{ ok: false, error }`. Out-of-range
 * input (plot index, crop id, time) is a programming error: request bodies
 * are validated with the shared validators before reaching these rules, so
 * it throws a RangeError instead. Malformed FarmData (e.g. corrupted storage)
 * also throws a RangeError; it is checked once at the start of each public
 * function that receives a FarmData.
 */
import {
  CROPS,
  FARM_PLOT_COUNT,
  ITEM_IDS,
  SEED_REFILL_COOLDOWN_MS,
  SEED_REFILL_PER_CROP,
  STARTER_SEEDS_PER_CROP,
  getCrop,
  isCropId,
  isPlotIndex,
  type CropId,
  type ItemId,
} from "@farmverse/shared/farming";
import type {
  FarmState,
  HarvestedProduce,
  HarvestReward,
  InventoryEntry,
  PlotState,
  SeedRefillState,
} from "@farmverse/shared/api";
import type { ErrorCode } from "@farmverse/shared/errors";
import { cropUnlockLevel, levelFromXp, plotUnlockLevel, unlocksBetween } from "@farmverse/shared/progression";

/** A plot with a crop. Readiness is derived from plantedAt; it is never stored. */
export interface FarmPlot {
  readonly cropId: CropId;
  /** Server time (ms) when the crop was planted. */
  readonly plantedAt: number;
}

/** Quantity of every item; always a non-negative integer. */
export type Inventory = Readonly<Record<ItemId, number>>;

/** Server-side state of one player's farm. */
export interface FarmData {
  /** Exactly FARM_PLOT_COUNT entries; null means an empty plot. */
  readonly plots: ReadonlyArray<FarmPlot | null>;
  readonly inventory: Inventory;
  /** Server time (ms) from which a seed refill is allowed; null if not started. */
  readonly seedRefillAvailableAt: number | null;
  /** Coin balance; only changed by server rules. */
  readonly coins: number;
  /** Total XP; only changed by server rules. */
  readonly xp: number;
}

export type RuleError = Extract<
  ErrorCode,
  | "PLOT_NOT_EMPTY"
  | "PLOT_EMPTY"
  | "CROP_NOT_READY"
  | "ITEM_NOT_OWNED"
  | "REFILL_NOT_ALLOWED"
  | "LEVEL_TOO_LOW"
>;

export type RuleResult<Extra extends object = Record<never, never>> =
  | ({ ok: true; farm: FarmData } & Extra)
  | { ok: false; error: RuleError };

// ---------- input checks (programming errors) ----------

function assertTime(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError(`Invalid server time: ${now}`);
  }
}

function assertPlotIndex(plotIndex: number): void {
  if (!isPlotIndex(plotIndex)) {
    throw new RangeError(`Invalid plot index: ${plotIndex}`);
  }
}

function assertCropId(cropId: string): void {
  if (!isCropId(cropId)) {
    throw new RangeError(`Invalid crop id: ${cropId}`);
  }
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Checks the FarmData invariants: exactly FARM_PLOT_COUNT plots, each empty or
 * holding a known crop with a valid plantedAt; every item present with a
 * non-negative safe-integer quantity; a valid or null refill time; coins and
 * XP as non-negative safe integers.
 * Exported so storage can reject corrupted data as soon as it is loaded.
 */
export function assertFarmData(farm: FarmData): void {
  if (typeof farm !== "object" || farm === null) {
    throw new RangeError("Invalid farm data");
  }

  const { plots, inventory, seedRefillAvailableAt, coins, xp } = farm;
  if (!Array.isArray(plots) || plots.length !== FARM_PLOT_COUNT) {
    throw new RangeError(`Invalid farm data: expected ${FARM_PLOT_COUNT} plots`);
  }
  // Index loop (not forEach) so holes in a sparse array are rejected too.
  for (let index = 0; index < plots.length; index++) {
    const plot: unknown = plots[index];
    if (plot === null) continue;
    const valid =
      typeof plot === "object" &&
      plot !== undefined &&
      isCropId((plot as FarmPlot).cropId) &&
      isNonNegativeSafeInteger((plot as FarmPlot).plantedAt);
    if (!valid) throw new RangeError(`Invalid farm data: plot ${index}`);
  }

  if (typeof inventory !== "object" || inventory === null) {
    throw new RangeError("Invalid farm data: inventory");
  }
  for (const itemId of ITEM_IDS) {
    if (!isNonNegativeSafeInteger(inventory[itemId])) {
      throw new RangeError(`Invalid farm data: inventory ${itemId}`);
    }
  }

  if (seedRefillAvailableAt !== null && !isNonNegativeSafeInteger(seedRefillAvailableAt)) {
    throw new RangeError("Invalid farm data: seedRefillAvailableAt");
  }
  if (!isNonNegativeSafeInteger(coins)) throw new RangeError("Invalid farm data: coins");
  if (!isNonNegativeSafeInteger(xp)) throw new RangeError("Invalid farm data: xp");
}

function fail(error: RuleError): { ok: false; error: RuleError } {
  return { ok: false, error };
}

function withPlot(
  plots: ReadonlyArray<FarmPlot | null>,
  plotIndex: number,
  plot: FarmPlot | null,
): Array<FarmPlot | null> {
  return plots.map((current, index) => (index === plotIndex ? plot : current));
}

// ---------- queries ----------

/** Crops the player can plant at the level that `xp` gives. */
function unlockedCrops(xp: number): typeof CROPS {
  const level = levelFromXp(xp);
  return CROPS.filter((crop) => cropUnlockLevel(crop.id) <= level);
}

/**
 * LEVEL_TOO_LOW when the plot or the crop needs a higher level than `xp`
 * gives (Phase 2 unlocks), otherwise null. Plots outside the unlock table
 * count as locked.
 */
export function unlockError(xp: number, plotIndex: number, cropId: string): "LEVEL_TOO_LOW" | null {
  const level = levelFromXp(xp);
  const plotLevel = plotUnlockLevel(plotIndex);
  if (plotLevel === undefined || plotLevel > level) return "LEVEL_TOO_LOW";
  return cropUnlockLevel(cropId) > level ? "LEVEL_TOO_LOW" : null;
}

export function createStarterFarm(): FarmData {
  const inventory = Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<
    ItemId,
    number
  >;
  for (const crop of unlockedCrops(0)) {
    inventory[crop.seedItemId] = STARTER_SEEDS_PER_CROP;
  }
  return {
    plots: Array.from({ length: FARM_PLOT_COUNT }, () => null),
    inventory,
    seedRefillAvailableAt: null,
    coins: 0,
    xp: 0,
  };
}

/** Server time (ms) at which the crop becomes ready. */
export function getReadyAt(plot: FarmPlot): number {
  return plot.plantedAt + getCrop(plot.cropId).growthMs;
}

export function isCropReady(plot: FarmPlot, now: number): boolean {
  assertTime(now);
  return now >= getReadyAt(plot);
}

/** Eligibility for already-validated data (internal, no re-check). */
function seedRefillEligible(farm: FarmData): boolean {
  const seeds = CROPS.reduce(
    (total, crop) => total + farm.inventory[crop.seedItemId],
    0,
  );
  return seeds === 0 && farm.plots.every((plot) => plot === null);
}

/** No seeds of any kind and no crop on any plot (ready crops count as crops). */
export function isSeedRefillEligible(farm: FarmData): boolean {
  assertFarmData(farm);
  return seedRefillEligible(farm);
}

// ---------- actions ----------

/**
 * Adds XP and grants STARTER_SEEDS_PER_CROP seeds of every crop unlocked by
 * the resulting level-up. XP never decreases, so each crop is granted once.
 * Used by harvest and by quest claims.
 */
export function gainXp(farm: FarmData, xp: number): FarmData {
  const total = farm.xp + xp;
  const inventory: Record<ItemId, number> = { ...farm.inventory };
  for (const unlock of unlocksBetween(levelFromXp(farm.xp), levelFromXp(total))) {
    if (unlock.kind === "crop") inventory[getCrop(unlock.cropId).seedItemId] += STARTER_SEEDS_PER_CROP;
  }
  return { ...farm, inventory, xp: total };
}

/**
 * Plants one seed of `cropId` in an empty plot. Checks the player's level for
 * the plot and crop first, then the plot, then the seed.
 */
export function plant(
  farm: FarmData,
  plotIndex: number,
  cropId: CropId,
  now: number,
): RuleResult {
  assertFarmData(farm);
  assertPlotIndex(plotIndex);
  assertCropId(cropId);
  assertTime(now);

  const locked = unlockError(farm.xp, plotIndex, cropId);
  if (locked !== null) return fail(locked);
  if (farm.plots[plotIndex] !== null) return fail("PLOT_NOT_EMPTY");

  const seedItemId = getCrop(cropId).seedItemId;
  const seeds = farm.inventory[seedItemId];
  if (seeds < 1) return fail("ITEM_NOT_OWNED");

  return {
    ok: true,
    farm: {
      plots: withPlot(farm.plots, plotIndex, { cropId, plantedAt: now }),
      inventory: { ...farm.inventory, [seedItemId]: seeds - 1 },
      seedRefillAvailableAt: farm.seedRefillAvailableAt,
      coins: farm.coins,
      xp: farm.xp,
    },
  };
}

/**
 * Harvests a ready crop: adds the produce, the crop's coin and XP reward
 * (with seeds for any crop the level-up unlocks), and empties the plot. When
 * this harvest leaves the farm with no seeds and no crops, the seed refill
 * cooldown starts at `now`.
 */
export function harvest(
  farm: FarmData,
  plotIndex: number,
  now: number,
): RuleResult<{ harvested: HarvestedProduce; reward: HarvestReward }> {
  assertFarmData(farm);
  assertPlotIndex(plotIndex);
  assertTime(now);

  const plot = farm.plots[plotIndex];
  if (plot === null || plot === undefined) return fail("PLOT_EMPTY");
  if (now < getReadyAt(plot)) return fail("CROP_NOT_READY");

  const crop = getCrop(plot.cropId);
  const harvested = { itemId: crop.produceItemId, quantity: crop.harvestYield };
  const reward: HarvestReward = { coins: crop.coinReward, xp: crop.xpReward };
  const next = gainXp(
    {
      plots: withPlot(farm.plots, plotIndex, null),
      inventory: {
        ...farm.inventory,
        [crop.produceItemId]: farm.inventory[crop.produceItemId] + crop.harvestYield,
      },
      seedRefillAvailableAt: farm.seedRefillAvailableAt,
      coins: farm.coins + reward.coins,
      xp: farm.xp,
    },
    reward.xp,
  );

  return {
    ok: true,
    farm: seedRefillEligible(next)
      ? { ...next, seedRefillAvailableAt: now + SEED_REFILL_COOLDOWN_MS }
      : next,
    // Static data guarantees produceItemId is a produce item (shared tests).
    harvested: harvested as HarvestedProduce,
    reward,
  };
}

/**
 * MVP seed refill: allowed only when the farm has no seeds and no crops and
 * the cooldown has passed. Grants seeds of every crop unlocked at the
 * player's level. A failed attempt does not change the cooldown.
 */
export function refillSeeds(farm: FarmData, now: number): RuleResult {
  assertFarmData(farm);
  assertTime(now);

  if (!seedRefillEligible(farm)) return fail("REFILL_NOT_ALLOWED");
  // A missing cooldown on an eligible farm is unexpected; allow the refill.
  const availableAt = farm.seedRefillAvailableAt;
  if (availableAt !== null && now < availableAt) return fail("REFILL_NOT_ALLOWED");

  const inventory: Record<ItemId, number> = { ...farm.inventory };
  for (const crop of unlockedCrops(farm.xp)) {
    inventory[crop.seedItemId] += SEED_REFILL_PER_CROP;
  }
  return {
    ok: true,
    farm: { ...farm, inventory, seedRefillAvailableAt: null },
  };
}

// ---------- contract ----------

/** Builds the shared FarmState sent to clients, as of server time `now`. */
export function toFarmState(farm: FarmData, now: number): FarmState {
  assertFarmData(farm);
  assertTime(now);

  const plots: PlotState[] = farm.plots.map((plot, index) => ({
    index,
    crop:
      plot === null
        ? null
        : { cropId: plot.cropId, plantedAt: plot.plantedAt, readyAt: getReadyAt(plot) },
  }));

  const inventory: InventoryEntry[] = ITEM_IDS.filter(
    (itemId) => farm.inventory[itemId] > 0,
  ).map((itemId) => ({ itemId, quantity: farm.inventory[itemId] }));

  const seedRefill: SeedRefillState = seedRefillEligible(farm)
    ? { eligible: true, availableAt: farm.seedRefillAvailableAt ?? now }
    : { eligible: false, availableAt: null };

  return { serverTime: now, plots, inventory, seedRefill, coins: farm.coins, xp: farm.xp };
}
