/**
 * HTTP API contract shared by client and server.
 *
 * Phase 0: health check. Phase 1: guest session and farming endpoints.
 * Phase 2: level progress and the active quest in FarmState; quest claim.
 *
 * Validators here only check structure and types. The server still enforces
 * ownership, gameplay rules and stored data; clients never send time,
 * quantities, player IDs or crop readiness.
 */
import {
  FARM_PLOT_COUNT,
  isCropId,
  isItemId,
  isPlotIndex,
  isProduceItemId,
  type CropId,
  type ItemId,
  type ProduceItemId,
} from "./farming.js";
import { MAX_LEVEL, QUESTS, levelProgress, plotCountForLevel } from "./progression.js";

export const HEALTH_PATH = "/api/health";
export const SESSION_PATH = "/api/session";
export const FARM_PATH = "/api/farm";
export const FARM_PLANT_PATH = "/api/farm/plant";
export const FARM_HARVEST_PATH = "/api/farm/harvest";
export const FARM_REFILL_SEEDS_PATH = "/api/farm/refill-seeds";
export const QUEST_CLAIM_PATH = "/api/quests/claim";

/** Response body of GET /api/health. */
export interface HealthResponse {
  status: "ok";
  /** Server version string. */
  version: string;
  /** Server time in milliseconds since the Unix epoch. */
  serverTime: number;
}

/** Response body of POST /api/session (201). The token is only returned once. */
export interface SessionResponse {
  playerId: string;
  token: string;
}

export interface PlantedCrop {
  cropId: CropId;
  /** Server time (ms) when the crop was planted. */
  plantedAt: number;
  /** Server time (ms) when the crop becomes ready to harvest. */
  readyAt: number;
}

export interface PlotState {
  index: number;
  crop: PlantedCrop | null;
}

export interface InventoryEntry {
  itemId: ItemId;
  quantity: number;
}

/**
 * MVP seed refill state, computed by the server from its own clock.
 *
 * `availableAt` and `FarmState.serverTime` are both server times; the client
 * may only use `availableAt - serverTime` to show a countdown. The client never
 * decides when a refill is allowed: it sends refill-seeds and the server
 * accepts it or answers REFILL_NOT_ALLOWED.
 */
export interface SeedRefillState {
  /** True when the player has no seeds of any kind and no crops on the farm. */
  eligible: boolean;
  /** Server time (ms) from which the refill is allowed; null when not eligible. */
  availableAt: number | null;
}

/** Level progress, derived by the server from total XP (progression.ts). */
export interface ProgressionState {
  level: number;
  /** XP earned since the current level started. */
  xpIntoLevel: number;
  /** XP needed for the next level; null at the maximum level. */
  xpForNextLevel: number | null;
  /** Plots usable at this level: indices 0 … unlockedPlotCount − 1. */
  unlockedPlotCount: number;
}

export interface QuestReward {
  coins: number;
  xp: number;
}

/** The active quest as computed by the server. */
export interface QuestView {
  /** Id from progression.ts QUESTS. */
  id: string;
  title: string;
  progress: number;
  target: number;
  /** True when the reward can be claimed. */
  complete: boolean;
  reward: QuestReward;
}

/**
 * GET /api/farm (200); also the success body of plant and refill-seeds.
 * A replayed request returns the state saved when it first succeeded.
 */
export interface FarmState {
  /** Server time (ms) when this state was produced. */
  serverTime: number;
  /** Exactly FARM_PLOT_COUNT plots, ordered by index. */
  plots: PlotState[];
  /** Items with quantity > 0, each item at most once. */
  inventory: InventoryEntry[];
  seedRefill: SeedRefillState;
  /** Coin balance (server-authoritative). */
  coins: number;
  /** Total XP (server-authoritative). */
  xp: number;
  /** Level progress for `xp`. */
  progression: ProgressionState;
  /** The active quest; null once every quest is claimed. */
  quest: QuestView | null;
}

/** Coins and XP granted by one harvest. */
export interface HarvestReward {
  coins: number;
  xp: number;
}

/** Produce added to the inventory by a harvest. Never a seed item. */
export interface HarvestedProduce {
  itemId: ProduceItemId;
  quantity: number;
}

/** POST /api/farm/harvest (200). */
export interface HarvestResponse extends FarmState {
  harvested: HarvestedProduce;
  reward: HarvestReward;
}

/** POST /api/quests/claim (200): the new state and what was claimed. */
export interface QuestClaimResponse extends FarmState {
  claimed: { questId: string; reward: QuestReward };
}

/** POST /api/farm/plant body. */
export interface PlantRequest {
  requestId: string;
  plotIndex: number;
  cropId: CropId;
}

/** POST /api/farm/harvest body. */
export interface HarvestRequest {
  requestId: string;
  plotIndex: number;
}

/** POST /api/farm/refill-seeds body. */
export interface RefillSeedsRequest {
  requestId: string;
}

/** POST /api/quests/claim body: claims the active quest. The client never sends the quest or reward. */
export interface QuestClaimRequest {
  requestId: string;
}

// ---------- validation ----------

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/** UUID version 4, lowercase, as produced by `crypto.randomUUID()`. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 32 random bytes encoded as base64url without padding. */
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Checks that a value is a well-formed health response. Extra fields are ignored. */
export function isHealthResponse(value: unknown): value is HealthResponse {
  if (!isObject(value)) return false;
  return (
    value["status"] === "ok" &&
    typeof value["version"] === "string" &&
    typeof value["serverTime"] === "number" &&
    Number.isFinite(value["serverTime"]) &&
    value["serverTime"] >= 0
  );
}

export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

export function isSessionResponse(value: unknown): value is SessionResponse {
  return (
    isObject(value) &&
    isRequestId(value["playerId"]) &&
    typeof value["token"] === "string" &&
    SESSION_TOKEN.test(value["token"])
  );
}

function isPlantedCrop(value: unknown): value is PlantedCrop {
  return (
    isObject(value) &&
    isCropId(value["cropId"]) &&
    isNonNegativeInteger(value["plantedAt"]) &&
    isNonNegativeInteger(value["readyAt"]) &&
    value["readyAt"] >= value["plantedAt"]
  );
}

function isInventoryEntry(value: unknown): value is InventoryEntry {
  return (
    isObject(value) &&
    isItemId(value["itemId"]) &&
    isPositiveInteger(value["quantity"])
  );
}

function isHarvestedProduce(value: unknown): value is HarvestedProduce {
  return (
    isObject(value) &&
    isProduceItemId(value["itemId"]) &&
    isPositiveInteger(value["quantity"])
  );
}

export function isSeedRefillState(value: unknown): value is SeedRefillState {
  if (!isObject(value) || typeof value["eligible"] !== "boolean") return false;
  return value["eligible"]
    ? isNonNegativeInteger(value["availableAt"])
    : value["availableAt"] === null;
}

function isQuestReward(value: unknown): value is QuestReward {
  return isObject(value) && isNonNegativeInteger(value["coins"]) && isNonNegativeInteger(value["xp"]);
}

/** Checks the shape and that level, XP into level and plot count agree with `xp`. */
function isProgressionStateFor(value: unknown, xp: number): value is ProgressionState {
  if (!isObject(value)) return false;
  const expected = levelProgress(xp);
  return (
    value["level"] === expected.level &&
    value["xpIntoLevel"] === expected.xpIntoLevel &&
    value["xpForNextLevel"] === expected.xpForNextLevel &&
    value["unlockedPlotCount"] === plotCountForLevel(expected.level) &&
    (expected.level === MAX_LEVEL) === (expected.xpForNextLevel === null)
  );
}

export function isQuestView(value: unknown): value is QuestView {
  if (!isObject(value)) return false;
  const { id, title, progress, target, complete, reward } = value;
  return (
    QUESTS.some((quest) => quest.id === id) &&
    typeof title === "string" &&
    isPositiveInteger(target) &&
    isNonNegativeInteger(progress) &&
    progress <= target &&
    complete === (progress >= target) &&
    isQuestReward(reward)
  );
}

export function isFarmState(value: unknown): value is FarmState {
  if (!isObject(value) || !isNonNegativeInteger(value["serverTime"])) {
    return false;
  }

  const plots = value["plots"];
  if (!Array.isArray(plots) || plots.length !== FARM_PLOT_COUNT) return false;
  const plotsValid = plots.every(
    (plot: unknown, index) =>
      isObject(plot) &&
      plot["index"] === index &&
      (plot["crop"] === null || isPlantedCrop(plot["crop"])),
  );
  if (!plotsValid) return false;

  const inventory = value["inventory"];
  if (!Array.isArray(inventory) || !inventory.every(isInventoryEntry)) {
    return false;
  }
  const itemIds = inventory.map((entry: InventoryEntry) => entry.itemId);
  if (new Set(itemIds).size !== itemIds.length) return false;

  return (
    isSeedRefillState(value["seedRefill"]) &&
    isNonNegativeInteger(value["coins"]) &&
    isNonNegativeInteger(value["xp"]) &&
    isProgressionStateFor(value["progression"], value["xp"]) &&
    (value["quest"] === null || isQuestView(value["quest"]))
  );
}

export function isQuestClaimResponse(value: unknown): value is QuestClaimResponse {
  if (!isObject(value) || !isFarmState(value)) return false;
  const claimed = value["claimed"];
  return (
    isObject(claimed) &&
    QUESTS.some((quest) => quest.id === claimed["questId"]) &&
    isQuestReward(claimed["reward"])
  );
}

export function isHarvestResponse(value: unknown): value is HarvestResponse {
  return (
    isObject(value) &&
    isFarmState(value) &&
    isHarvestedProduce(value["harvested"]) &&
    isObject(value["reward"]) &&
    isNonNegativeInteger(value["reward"]["coins"]) &&
    isNonNegativeInteger(value["reward"]["xp"])
  );
}

export function isPlantRequest(value: unknown): value is PlantRequest {
  return (
    isObject(value) &&
    isRequestId(value["requestId"]) &&
    isPlotIndex(value["plotIndex"]) &&
    isCropId(value["cropId"])
  );
}

export function isHarvestRequest(value: unknown): value is HarvestRequest {
  return (
    isObject(value) &&
    isRequestId(value["requestId"]) &&
    isPlotIndex(value["plotIndex"])
  );
}

export function isRefillSeedsRequest(value: unknown): value is RefillSeedsRequest {
  return isObject(value) && isRequestId(value["requestId"]);
}

export function isQuestClaimRequest(value: unknown): value is QuestClaimRequest {
  return isObject(value) && isRequestId(value["requestId"]);
}
