/**
 * Persistence of players, farms and the action log.
 *
 * Every player always has exactly FARM_PLOT_COUNT plot rows, one inventory
 * row per item (quantity 0 included), one quest_state row (schema v2 added
 * the Phase 2 rows for existing players), one building_state row and one
 * decoration_stock row per decoration (schema v3), plus zero or more
 * farm_objects rows; one character_appearance row and one cosmetic_inventory
 * row per owned cosmetic (schema v4). Missing rows are never filled
 * in: loaded data is checked with assertFarmData / assertQuestState, so
 * corrupted data fails loudly instead of being repaired silently
 * (assertBuildingData for building state, assertCharacterData for the
 * character).
 *
 * Writes are expected to run inside `transaction()` from database.ts.
 */
import { DECORATION_IDS, type DecorationId, type PlacedObject, type Rotation } from "@farmverse/shared/building";
import { FARM_PLOT_COUNT, ITEM_IDS, type CropId, type ItemId } from "@farmverse/shared/farming";
import { COSMETIC_IDS, type CosmeticId, type SkinTone } from "@farmverse/shared/character";
import { assertBuildingData, createEmptyBuilding, type BuildingData } from "../building/rules.js";
import { assertCharacterData, createStarterCharacter, type CharacterData } from "../character/rules.js";
import { assertQuestState, startingQuestState, type QuestState } from "../farming/quests.js";
import { assertFarmData, type FarmData, type FarmPlot } from "../farming/rules.js";
import type { Database } from "./database.js";

export interface NewPlayer {
  id: string;
  /** SHA-256 hash of the session token; the token itself is never stored. */
  tokenHash: string;
  /** Server time (ms). */
  createdAt: number;
}

/** A successful state-changing action, stored so a replay returns the same result. */
export interface ActionRecord {
  action: string;
  /** Canonical JSON of the validated request fields. */
  requestJson: string;
  /** JSON of the response that was returned. */
  responseJson: string;
}

export function insertPlayer(db: Database, player: NewPlayer, farm: FarmData): void {
  assertFarmData(farm);
  db.prepare(
    "INSERT INTO players (id, token_hash, created_at, seed_refill_available_at, coins, xp) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(player.id, player.tokenHash, player.createdAt, farm.seedRefillAvailableAt, farm.coins, farm.xp);

  const insertPlot = db.prepare(
    "INSERT INTO plots (player_id, plot_index, crop_id, planted_at) VALUES (?, ?, ?, ?)",
  );
  farm.plots.forEach((plot, index) => {
    insertPlot.run(player.id, index, plot?.cropId ?? null, plot?.plantedAt ?? null);
  });

  const insertItem = db.prepare(
    "INSERT INTO inventory (player_id, item_id, quantity) VALUES (?, ?, ?)",
  );
  for (const itemId of ITEM_IDS) {
    insertItem.run(player.id, itemId, farm.inventory[itemId]);
  }

  const quests = startingQuestState();
  db.prepare("INSERT INTO quest_state (player_id, quest_index, progress) VALUES (?, ?, ?)").run(
    player.id,
    quests.index,
    quests.progress,
  );

  const building = createEmptyBuilding();
  db.prepare("INSERT INTO building_state (player_id, next_object_id) VALUES (?, ?)").run(
    player.id,
    building.nextObjectId,
  );
  const insertStock = db.prepare(
    "INSERT INTO decoration_stock (player_id, decoration_id, quantity) VALUES (?, ?, ?)",
  );
  for (const decorationId of DECORATION_IDS) {
    insertStock.run(player.id, decorationId, building.stock[decorationId]);
  }

  const character = createStarterCharacter();
  const { skin, hair, shirt, pants } = character.appearance;
  db.prepare("INSERT INTO character_appearance (player_id, skin, hair, shirt, pants) VALUES (?, ?, ?, ?, ?)").run(
    player.id,
    skin,
    hair,
    shirt,
    pants,
  );
  const insertCosmetic = db.prepare("INSERT INTO cosmetic_inventory (player_id, cosmetic_id) VALUES (?, ?)");
  for (const cosmeticId of character.owned) {
    insertCosmetic.run(player.id, cosmeticId);
  }
}

export function findPlayerIdByTokenHash(db: Database, tokenHash: string): string | null {
  const row = db.prepare("SELECT id FROM players WHERE token_hash = ?").get(tokenHash);
  return row === undefined ? null : String(row["id"]);
}

/** Loads a player's farm, or null if the player does not exist. Throws RangeError on corrupted data. */
export function loadFarm(db: Database, playerId: string): FarmData | null {
  const player = db
    .prepare("SELECT seed_refill_available_at, coins, xp FROM players WHERE id = ?")
    .get(playerId);
  if (player === undefined) return null;

  const plots: Array<FarmPlot | null> = new Array<FarmPlot | null>(FARM_PLOT_COUNT);
  const plotRows = db
    .prepare("SELECT plot_index, crop_id, planted_at FROM plots WHERE player_id = ?")
    .all(playerId);
  for (const row of plotRows) {
    const index = Number(row["plot_index"]);
    if (index >= FARM_PLOT_COUNT) {
      throw new RangeError(`Invalid farm data: plot ${index} out of range`);
    }
    plots[index] =
      row["crop_id"] === null
        ? null
        : { cropId: row["crop_id"] as CropId, plantedAt: Number(row["planted_at"]) };
  }

  const inventory: Partial<Record<ItemId, number>> = {};
  const itemRows = db
    .prepare("SELECT item_id, quantity FROM inventory WHERE player_id = ?")
    .all(playerId);
  for (const row of itemRows) {
    inventory[row["item_id"] as ItemId] = Number(row["quantity"]);
  }

  const refill = player["seed_refill_available_at"];
  const farm = {
    plots,
    inventory: inventory as Record<ItemId, number>,
    seedRefillAvailableAt: refill === null ? null : Number(refill),
    coins: Number(player["coins"]),
    xp: Number(player["xp"]),
  };
  assertFarmData(farm);
  return farm;
}

/** Overwrites a player's farm. The player and all its rows must already exist. */
export function saveFarm(db: Database, playerId: string, farm: FarmData): void {
  assertFarmData(farm);

  const player = db
    .prepare("UPDATE players SET seed_refill_available_at = ?, coins = ?, xp = ? WHERE id = ?")
    .run(farm.seedRefillAvailableAt, farm.coins, farm.xp, playerId);
  if (player.changes !== 1) throw new Error(`Unknown player: ${playerId}`);

  const updatePlot = db.prepare(
    "UPDATE plots SET crop_id = ?, planted_at = ? WHERE player_id = ? AND plot_index = ?",
  );
  farm.plots.forEach((plot, index) => {
    const result = updatePlot.run(plot?.cropId ?? null, plot?.plantedAt ?? null, playerId, index);
    if (result.changes !== 1) throw new RangeError(`Invalid farm data: missing plot ${index}`);
  });

  const updateItem = db.prepare(
    "UPDATE inventory SET quantity = ? WHERE player_id = ? AND item_id = ?",
  );
  for (const itemId of ITEM_IDS) {
    const result = updateItem.run(farm.inventory[itemId], playerId, itemId);
    if (result.changes !== 1) throw new RangeError(`Invalid farm data: missing item ${itemId}`);
  }
}

/** Loads a player's quest state, or null if the player does not exist. Throws RangeError on corrupted data. */
export function loadQuestState(db: Database, playerId: string): QuestState | null {
  const row = db.prepare("SELECT quest_index, progress FROM quest_state WHERE player_id = ?").get(playerId);
  if (row === undefined) {
    const player = db.prepare("SELECT 1 FROM players WHERE id = ?").get(playerId);
    if (player === undefined) return null;
    throw new RangeError("Invalid farm data: missing quest state");
  }
  const state = { index: Number(row["quest_index"]), progress: Number(row["progress"]) };
  assertQuestState(state);
  return state;
}

/** Overwrites a player's quest state. The row must already exist. */
export function saveQuestState(db: Database, playerId: string, state: QuestState): void {
  assertQuestState(state);
  const result = db
    .prepare("UPDATE quest_state SET quest_index = ?, progress = ? WHERE player_id = ?")
    .run(state.index, state.progress, playerId);
  if (result.changes !== 1) throw new RangeError(`Invalid farm data: missing quest state for ${playerId}`);
}

/**
 * Loads a player's building state (decorations and placed objects), or null
 * if the player does not exist. Throws RangeError on corrupted data.
 */
export function loadBuilding(db: Database, playerId: string): BuildingData | null {
  const row = db.prepare("SELECT next_object_id FROM building_state WHERE player_id = ?").get(playerId);
  if (row === undefined) {
    const player = db.prepare("SELECT 1 FROM players WHERE id = ?").get(playerId);
    if (player === undefined) return null;
    throw new RangeError("Invalid farm data: missing building state");
  }

  const stock: Partial<Record<DecorationId, number>> = {};
  for (const stockRow of db
    .prepare("SELECT decoration_id, quantity FROM decoration_stock WHERE player_id = ?")
    .all(playerId)) {
    stock[stockRow["decoration_id"] as DecorationId] = Number(stockRow["quantity"]);
  }

  const objects: PlacedObject[] = db
    .prepare(
      "SELECT object_id, decoration_id, x, y, rotation FROM farm_objects WHERE player_id = ? ORDER BY object_id",
    )
    .all(playerId)
    .map((objectRow) => ({
      objectId: Number(objectRow["object_id"]),
      decorationId: objectRow["decoration_id"] as DecorationId,
      x: Number(objectRow["x"]),
      y: Number(objectRow["y"]),
      rotation: Number(objectRow["rotation"]) as Rotation,
    }));

  const building = {
    stock: stock as Record<DecorationId, number>,
    objects,
    nextObjectId: Number(row["next_object_id"]),
  };
  assertBuildingData(building);
  return building;
}

/** Overwrites a player's building state. The building_state and stock rows must already exist. */
export function saveBuilding(db: Database, playerId: string, building: BuildingData): void {
  assertBuildingData(building);

  const state = db
    .prepare("UPDATE building_state SET next_object_id = ? WHERE player_id = ?")
    .run(building.nextObjectId, playerId);
  if (state.changes !== 1) throw new RangeError(`Invalid farm data: missing building state for ${playerId}`);

  const updateStock = db.prepare(
    "UPDATE decoration_stock SET quantity = ? WHERE player_id = ? AND decoration_id = ?",
  );
  for (const decorationId of DECORATION_IDS) {
    const result = updateStock.run(building.stock[decorationId], playerId, decorationId);
    if (result.changes !== 1) throw new RangeError(`Invalid farm data: missing decoration ${decorationId}`);
  }

  db.prepare("DELETE FROM farm_objects WHERE player_id = ?").run(playerId);
  const insertObject = db.prepare(
    "INSERT INTO farm_objects (player_id, object_id, decoration_id, x, y, rotation) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const object of building.objects) {
    insertObject.run(playerId, object.objectId, object.decorationId, object.x, object.y, object.rotation);
  }
}

/**
 * Loads a player's character (appearance and owned cosmetics), or null if the
 * player does not exist. Throws RangeError on corrupted data.
 */
export function loadCharacter(db: Database, playerId: string): CharacterData | null {
  const row = db
    .prepare("SELECT skin, hair, shirt, pants FROM character_appearance WHERE player_id = ?")
    .get(playerId);
  if (row === undefined) {
    const player = db.prepare("SELECT 1 FROM players WHERE id = ?").get(playerId);
    if (player === undefined) return null;
    throw new RangeError("Invalid farm data: missing character");
  }

  const stored = new Set(
    db
      .prepare("SELECT cosmetic_id FROM cosmetic_inventory WHERE player_id = ?")
      .all(playerId)
      .map((cosmeticRow) => String(cosmeticRow["cosmetic_id"])),
  );
  const owned: CosmeticId[] = COSMETIC_IDS.filter((id) => stored.has(id));
  if (owned.length !== stored.size) throw new RangeError("Invalid farm data: unknown cosmetic");

  const character = {
    appearance: {
      skin: row["skin"] as SkinTone,
      hair: row["hair"] as CosmeticId,
      shirt: row["shirt"] as CosmeticId,
      pants: row["pants"] as CosmeticId,
    },
    owned,
  };
  assertCharacterData(character);
  return character;
}

/**
 * Saves a player's character. The appearance row must already exist. Owned
 * cosmetics are only ever added (cosmetics are kept forever).
 */
export function saveCharacter(db: Database, playerId: string, character: CharacterData): void {
  assertCharacterData(character);
  const { skin, hair, shirt, pants } = character.appearance;
  const result = db
    .prepare("UPDATE character_appearance SET skin = ?, hair = ?, shirt = ?, pants = ? WHERE player_id = ?")
    .run(skin, hair, shirt, pants, playerId);
  if (result.changes !== 1) throw new RangeError(`Invalid farm data: missing character for ${playerId}`);

  const insertCosmetic = db.prepare("INSERT OR IGNORE INTO cosmetic_inventory (player_id, cosmetic_id) VALUES (?, ?)");
  for (const cosmeticId of character.owned) {
    insertCosmetic.run(playerId, cosmeticId);
  }
}

export function findAction(db: Database, playerId: string, requestId: string): ActionRecord | null {
  const row = db
    .prepare(
      "SELECT action, request_json, response_json FROM action_log WHERE player_id = ? AND request_id = ?",
    )
    .get(playerId, requestId);
  if (row === undefined) return null;
  return {
    action: String(row["action"]),
    requestJson: String(row["request_json"]),
    responseJson: String(row["response_json"]),
  };
}

/** Records a successful action. A second record with the same request ID fails. */
export function insertAction(
  db: Database,
  playerId: string,
  requestId: string,
  record: ActionRecord,
  createdAt: number,
): void {
  db.prepare(
    "INSERT INTO action_log (player_id, request_id, action, request_json, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(playerId, requestId, record.action, record.requestJson, record.responseJson, createdAt);
}
