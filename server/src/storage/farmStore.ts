/**
 * Persistence of players, farms and the action log.
 *
 * Every player always has exactly FARM_PLOT_COUNT plot rows and one inventory
 * row per item (quantity 0 included). Missing rows are never filled in: a farm
 * loaded from the database is checked with assertFarmData, so corrupted data
 * fails loudly instead of being repaired silently.
 *
 * Writes are expected to run inside `transaction()` from database.ts.
 */
import { FARM_PLOT_COUNT, ITEM_IDS, type CropId, type ItemId } from "@farmverse/shared/farming";
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
