/**
 * HTTP API contract shared by client and server.
 *
 * Phase 0: health check. Phase 1: guest session and farming endpoints.
 * Phase 2: level progress and the active quest in FarmState; quest claim.
 * Phase 3: decorations and placed objects in FarmState; place / move /
 * rotate / remove object endpoints; decoration shop.
 * Phase 4: character (appearance and owned cosmetics) in FarmState;
 * character equip; cosmetic shop.
 * Phase 5: a farm as a visitor sees it (by farm code); the online list.
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
import {
  checkLayout,
  isDecorationId,
  isPlacedObject,
  isRotation,
  type DecorationId,
  type PlacedObject,
  type Rotation,
} from "./building.js";
import {
  STARTER_COSMETIC_IDS,
  checkAppearance,
  isCharacterAppearance,
  isCosmeticId,
  type CharacterAppearance,
  type CosmeticId,
} from "./character.js";
import { ONLINE_LIST_LIMIT, isDisplayName, isFarmCode } from "./presence.js";

export const HEALTH_PATH = "/api/health";
export const SESSION_PATH = "/api/session";
export const FARM_PATH = "/api/farm";
export const FARM_PLANT_PATH = "/api/farm/plant";
export const FARM_HARVEST_PATH = "/api/farm/harvest";
export const FARM_REFILL_SEEDS_PATH = "/api/farm/refill-seeds";
export const QUEST_CLAIM_PATH = "/api/quests/claim";
export const OBJECT_PLACE_PATH = "/api/farm/objects/place";
export const OBJECT_MOVE_PATH = "/api/farm/objects/move";
export const OBJECT_ROTATE_PATH = "/api/farm/objects/rotate";
export const OBJECT_REMOVE_PATH = "/api/farm/objects/remove";
export const SHOP_BUY_PATH = "/api/shop/buy";
export const CHARACTER_EQUIP_PATH = "/api/character/equip";
export const SHOP_BUY_COSMETIC_PATH = "/api/shop/buy-cosmetic";
/** GET: players with a live realtime connection (Phase 5). */
export const ONLINE_PLAYERS_PATH = "/api/players/online";
/** GET `${VISIT_FARM_PATH}/:farmCode`: a farm as a visitor sees it (Phase 5). */
export const VISIT_FARM_PATH = "/api/farms";

export function visitFarmPath(farmCode: string): string {
  return `${VISIT_FARM_PATH}/${encodeURIComponent(farmCode)}`;
}

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

/** Unplaced decorations the player owns. */
export interface DecorationEntry {
  decorationId: DecorationId;
  quantity: number;
}

/** The player's character (Phase 4). */
export interface CharacterState {
  /** Skin tone and the item worn in each slot; every worn item is owned. */
  appearance: CharacterAppearance;
  /** Owned cosmetics in catalog order, each at most once; always includes the starter items. */
  owned: CosmeticId[];
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
  /** Unplaced decorations with quantity > 0, each decoration at most once (Phase 3). */
  decorations: DecorationEntry[];
  /** Objects on the farm grid, a valid layout (building.ts checkLayout) (Phase 3). */
  objects: PlacedObject[];
  /** The player's character (Phase 4). */
  character: CharacterState;
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

/** Success body of the object endpoints: the new state and the object acted on. */
export interface ObjectActionResponse extends FarmState {
  /** The placed / moved / rotated object, or the removed object as it was. */
  object: PlacedObject;
}

/**
 * POST /api/shop/buy body: buys one decoration. The server decides the price
 * (building.ts DECORATIONS), checks the level and coins, and adds it to the
 * player's decorations. The client never sends a price or quantity.
 */
export interface BuyDecorationRequest {
  requestId: string;
  decorationId: DecorationId;
}

/** POST /api/shop/buy (200): the new state and what was bought. */
export interface BuyDecorationResponse extends FarmState {
  bought: { decorationId: DecorationId; price: number };
}

/**
 * GET /api/farms/:farmCode (200): what a visitor may see (P5-1 R-A). No coins,
 * XP, inventory, quests or unplaced decorations. Unknown code → 404
 * ROOM_NOT_FOUND.
 */
export interface VisitedFarm {
  serverTime: number;
  farmCode: string;
  name: string;
  level: number;
  /** Exactly FARM_PLOT_COUNT plots, ordered by index. */
  plots: PlotState[];
  objects: PlacedObject[];
  appearance: CharacterAppearance;
}

/** A player with a live realtime connection. */
export interface OnlinePlayer {
  farmCode: string;
  name: string;
}

/** GET /api/players/online (200): most recently connected first, the caller excluded. */
export interface OnlinePlayersResponse {
  players: OnlinePlayer[];
}

/**
 * POST /api/character/equip body: the whole new appearance. The server checks
 * that every worn item is owned (ITEM_NOT_OWNED). Success body: FarmState.
 */
export interface EquipCharacterRequest {
  requestId: string;
  appearance: CharacterAppearance;
}

/**
 * POST /api/shop/buy-cosmetic body: buys one cosmetic. The server decides the
 * price (character.ts COSMETICS) and checks ownership (ALREADY_OWNED), level
 * and coins. Buying does not change what the character wears.
 */
export interface BuyCosmeticRequest {
  requestId: string;
  cosmeticId: CosmeticId;
}

/** POST /api/shop/buy-cosmetic (200): the new state and what was bought. */
export interface BuyCosmeticResponse extends FarmState {
  bought: { cosmeticId: CosmeticId; price: number };
}

/**
 * POST /api/farm/objects/place body. Tile bounds, plots and overlap are game
 * rules checked by the server (PLACEMENT_INVALID), not by this validator.
 */
export interface PlaceObjectRequest {
  requestId: string;
  decorationId: DecorationId;
  x: number;
  y: number;
  rotation: Rotation;
}

/** POST /api/farm/objects/move body: new top-left tile, rotation kept. */
export interface MoveObjectRequest {
  requestId: string;
  objectId: number;
  x: number;
  y: number;
}

/** POST /api/farm/objects/rotate body: new rotation, tile kept. */
export interface RotateObjectRequest {
  requestId: string;
  objectId: number;
  rotation: Rotation;
}

/** POST /api/farm/objects/remove body: the object goes back to the decorations. */
export interface RemoveObjectRequest {
  requestId: string;
  objectId: number;
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

/** True for a session token as returned by POST /api/session (32 bytes, base64url). */
export function isSessionToken(value: unknown): value is string {
  return typeof value === "string" && SESSION_TOKEN.test(value);
}

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

  if (!isPlotList(value["plots"])) return false;

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
    (value["quest"] === null || isQuestView(value["quest"])) &&
    isDecorationList(value["decorations"]) &&
    checkLayout(value["objects"]).ok &&
    isCharacterState(value["character"])
  );
}

function isPlotList(plots: unknown): plots is PlotState[] {
  if (!Array.isArray(plots) || plots.length !== FARM_PLOT_COUNT) return false;
  return plots.every(
    (plot: unknown, index) =>
      isObject(plot) &&
      plot["index"] === index &&
      (plot["crop"] === null || isPlantedCrop(plot["crop"])),
  );
}

export function isVisitedFarm(value: unknown): value is VisitedFarm {
  return (
    isObject(value) &&
    isNonNegativeInteger(value["serverTime"]) &&
    isFarmCode(value["farmCode"]) &&
    isDisplayName(value["name"]) &&
    isPositiveInteger(value["level"]) &&
    value["level"] <= MAX_LEVEL &&
    isPlotList(value["plots"]) &&
    checkLayout(value["objects"]).ok &&
    isCharacterAppearance(value["appearance"])
  );
}

export function isOnlinePlayersResponse(value: unknown): value is OnlinePlayersResponse {
  if (!isObject(value)) return false;
  const players = value["players"];
  if (!Array.isArray(players) || players.length > ONLINE_LIST_LIMIT) return false;
  const valid = players.every(
    (player: unknown) => isObject(player) && isFarmCode(player["farmCode"]) && isDisplayName(player["name"]),
  );
  return valid && new Set(players.map((player: OnlinePlayer) => player.farmCode)).size === players.length;
}

export function isCharacterState(value: unknown): value is CharacterState {
  if (!isObject(value)) return false;
  const owned = value["owned"];
  if (!Array.isArray(owned) || !owned.every(isCosmeticId)) return false;
  if (new Set(owned).size !== owned.length) return false;
  return (
    STARTER_COSMETIC_IDS.every((id) => owned.includes(id)) && checkAppearance(owned, value["appearance"]).ok
  );
}

export function isBuyCosmeticResponse(value: unknown): value is BuyCosmeticResponse {
  if (!isObject(value) || !isFarmState(value)) return false;
  const bought = value["bought"];
  return isObject(bought) && isCosmeticId(bought["cosmeticId"]) && isPositiveInteger(bought["price"]);
}

function isDecorationList(value: unknown): value is DecorationEntry[] {
  if (!Array.isArray(value)) return false;
  const valid = value.every(
    (entry: unknown) => isObject(entry) && isDecorationId(entry["decorationId"]) && isPositiveInteger(entry["quantity"]),
  );
  return valid && new Set(value.map((entry: DecorationEntry) => entry.decorationId)).size === value.length;
}

export function isBuyDecorationResponse(value: unknown): value is BuyDecorationResponse {
  if (!isObject(value) || !isFarmState(value)) return false;
  const bought = value["bought"];
  return isObject(bought) && isDecorationId(bought["decorationId"]) && isPositiveInteger(bought["price"]);
}

export function isObjectActionResponse(value: unknown): value is ObjectActionResponse {
  return isObject(value) && isFarmState(value) && isPlacedObject(value["object"]);
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

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function isPlaceObjectRequest(value: unknown): value is PlaceObjectRequest {
  return (
    isObject(value) &&
    isRequestId(value["requestId"]) &&
    isDecorationId(value["decorationId"]) &&
    isSafeInteger(value["x"]) &&
    isSafeInteger(value["y"]) &&
    isRotation(value["rotation"])
  );
}

export function isMoveObjectRequest(value: unknown): value is MoveObjectRequest {
  return (
    isObject(value) &&
    isRequestId(value["requestId"]) &&
    isPositiveInteger(value["objectId"]) &&
    isSafeInteger(value["x"]) &&
    isSafeInteger(value["y"])
  );
}

export function isRotateObjectRequest(value: unknown): value is RotateObjectRequest {
  return (
    isObject(value) &&
    isRequestId(value["requestId"]) &&
    isPositiveInteger(value["objectId"]) &&
    isRotation(value["rotation"])
  );
}

export function isRemoveObjectRequest(value: unknown): value is RemoveObjectRequest {
  return isObject(value) && isRequestId(value["requestId"]) && isPositiveInteger(value["objectId"]);
}

export function isBuyDecorationRequest(value: unknown): value is BuyDecorationRequest {
  return isObject(value) && isRequestId(value["requestId"]) && isDecorationId(value["decorationId"]);
}

export function isEquipCharacterRequest(value: unknown): value is EquipCharacterRequest {
  return isObject(value) && isRequestId(value["requestId"]) && isCharacterAppearance(value["appearance"]);
}

export function isBuyCosmeticRequest(value: unknown): value is BuyCosmeticRequest {
  return isObject(value) && isRequestId(value["requestId"]) && isCosmeticId(value["cosmeticId"]);
}
