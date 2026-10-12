/**
 * SQLite database: opening, schema migrations and transactions.
 *
 * Uses Node's built-in `node:sqlite` (Node.js 24 LTS; no extra dependency).
 * All SQL lives in `server/src/storage/` so the engine can be replaced later.
 * The synchronous API means a transaction cannot interleave with another
 * request in the same process; BEGIN IMMEDIATE also guards against another
 * process writing the same file.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Database = DatabaseSync;

export const MEMORY_DATABASE = ":memory:";

/** Ordered schema migrations; index 0 upgrades to version 1, and so on. */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE players (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    seed_refill_available_at INTEGER
      CHECK (seed_refill_available_at IS NULL OR seed_refill_available_at >= 0)
  ) STRICT;

  CREATE TABLE plots (
    player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    plot_index INTEGER NOT NULL CHECK (plot_index >= 0),
    crop_id TEXT,
    planted_at INTEGER CHECK (planted_at IS NULL OR planted_at >= 0),
    PRIMARY KEY (player_id, plot_index),
    CHECK ((crop_id IS NULL) = (planted_at IS NULL))
  ) STRICT;

  CREATE TABLE inventory (
    player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    PRIMARY KEY (player_id, item_id)
  ) STRICT;

  CREATE TABLE action_log (
    player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    action TEXT NOT NULL,
    request_json TEXT NOT NULL,
    response_json TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    PRIMARY KEY (player_id, request_id)
  ) STRICT;
  `,
  // Version 2 (Phase 2 progression). Values are frozen here on purpose: a
  // migration must not change when game constants change later. Every
  // statement is idempotent (IF NOT EXISTS / INSERT OR IGNORE), so a re-run
  // never duplicates rows or seeds; existing rows are never modified.
  `
  -- Plots 7–9 (indices 6–8), empty; locked by level in the game rules.
  INSERT OR IGNORE INTO plots (player_id, plot_index, crop_id, planted_at)
    SELECT players.id, new_plot.plot_index, NULL, NULL
    FROM players CROSS JOIN (SELECT 6 AS plot_index UNION ALL SELECT 7 UNION ALL SELECT 8) AS new_plot;

  -- Corn and Strawberry items. Players whose XP already reached the unlock
  -- level (3: 150 XP, 5: 500 XP) get the 5 seeds granted on unlock.
  INSERT OR IGNORE INTO inventory (player_id, item_id, quantity)
    SELECT id, 'corn_seed', CASE WHEN xp >= 150 THEN 5 ELSE 0 END FROM players;
  INSERT OR IGNORE INTO inventory (player_id, item_id, quantity)
    SELECT id, 'strawberry_seed', CASE WHEN xp >= 500 THEN 5 ELSE 0 END FROM players;
  INSERT OR IGNORE INTO inventory (player_id, item_id, quantity)
    SELECT id, 'corn_produce', 0 FROM players;
  INSERT OR IGNORE INTO inventory (player_id, item_id, quantity)
    SELECT id, 'strawberry_produce', 0 FROM players;

  -- Quest chain position; every player starts at the first quest.
  CREATE TABLE IF NOT EXISTS quest_state (
    player_id TEXT PRIMARY KEY REFERENCES players (id) ON DELETE CASCADE,
    quest_index INTEGER NOT NULL CHECK (quest_index >= 0),
    progress INTEGER NOT NULL CHECK (progress >= 0)
  ) STRICT;
  INSERT OR IGNORE INTO quest_state (player_id, quest_index, progress)
    SELECT id, 0, 0 FROM players;
  `,
  // Version 3 (Phase 3 building). Only adds tables and rows; existing rows are
  // never modified. Decoration IDs are frozen here like the v2 values. Every
  // player starts with no decorations and no objects.
  `
  -- Next object ID to assign; IDs are never reused.
  CREATE TABLE IF NOT EXISTS building_state (
    player_id TEXT PRIMARY KEY REFERENCES players (id) ON DELETE CASCADE,
    next_object_id INTEGER NOT NULL CHECK (next_object_id >= 1)
  ) STRICT;
  INSERT OR IGNORE INTO building_state (player_id, next_object_id)
    SELECT id, 1 FROM players;

  -- Owned decorations that are not placed.
  CREATE TABLE IF NOT EXISTS decoration_stock (
    player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    decoration_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    PRIMARY KEY (player_id, decoration_id)
  ) STRICT;
  INSERT OR IGNORE INTO decoration_stock (player_id, decoration_id, quantity)
    SELECT players.id, decoration.id, 0
    FROM players CROSS JOIN (
      SELECT 'fence' AS id UNION ALL SELECT 'path' UNION ALL SELECT 'flower_bed' UNION ALL SELECT 'bush'
      UNION ALL SELECT 'bench' UNION ALL SELECT 'tree' UNION ALL SELECT 'small_house'
    ) AS decoration;

  -- Objects placed on the farm grid.
  CREATE TABLE IF NOT EXISTS farm_objects (
    player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    object_id INTEGER NOT NULL CHECK (object_id >= 1),
    decoration_id TEXT NOT NULL,
    x INTEGER NOT NULL CHECK (x >= 0),
    y INTEGER NOT NULL CHECK (y >= 0),
    rotation INTEGER NOT NULL CHECK (rotation IN (0, 90, 180, 270)),
    PRIMARY KEY (player_id, object_id)
  ) STRICT;
  `,
  // Version 4 (Phase 4 character). Only adds tables and rows; existing rows
  // are never modified. Cosmetic IDs and the default appearance are frozen
  // here like the v2 / v3 values. Every player gets the 6 starter cosmetics
  // and wears the default appearance.
  `
  -- Skin tone and the cosmetic worn in each slot.
  CREATE TABLE IF NOT EXISTS character_appearance (
    player_id TEXT PRIMARY KEY REFERENCES players (id) ON DELETE CASCADE,
    skin TEXT NOT NULL,
    hair TEXT NOT NULL,
    shirt TEXT NOT NULL,
    pants TEXT NOT NULL
  ) STRICT;
  INSERT OR IGNORE INTO character_appearance (player_id, skin, hair, shirt, pants)
    SELECT id, 'light', 'hair_short_brown', 'shirt_white_tee', 'pants_blue_jeans' FROM players;

  -- Owned cosmetics; kept forever (no resale, never stolen).
  CREATE TABLE IF NOT EXISTS cosmetic_inventory (
    player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
    cosmetic_id TEXT NOT NULL,
    PRIMARY KEY (player_id, cosmetic_id)
  ) STRICT;
  INSERT OR IGNORE INTO cosmetic_inventory (player_id, cosmetic_id)
    SELECT players.id, starter.id
    FROM players CROSS JOIN (
      SELECT 'hair_short_brown' AS id UNION ALL SELECT 'hair_long_black'
      UNION ALL SELECT 'shirt_white_tee' UNION ALL SELECT 'shirt_blue_tee'
      UNION ALL SELECT 'pants_blue_jeans' UNION ALL SELECT 'pants_brown'
    ) AS starter;
  `,
];

/** Exported for migration tests only. */
export const SCHEMA_MIGRATIONS = MIGRATIONS;

export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Opens (creating if needed) the database and brings the schema up to date.
 * Pass MEMORY_DATABASE for a temporary database.
 */
export function openDatabase(path: string): Database {
  if (path !== MEMORY_DATABASE) {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");
    if (path !== MEMORY_DATABASE) db.exec("PRAGMA journal_mode = WAL");
    migrate(db);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}

export function getSchemaVersion(db: Database): number {
  const row = db.prepare("SELECT version FROM schema_version").get();
  return row === undefined ? 0 : Number(row["version"]);
}

function migrate(db: Database): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL) STRICT");

  const current = getSchemaVersion(db);
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${current} is newer than this server supports (${SCHEMA_VERSION})`,
    );
  }

  for (let version = current + 1; version <= SCHEMA_VERSION; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version - 1] ?? "");
      db.exec("DELETE FROM schema_version");
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(version);
    });
  }
}

/**
 * Runs `work` inside one write transaction: commits if it returns, rolls back
 * if it throws. Transactions do not nest.
 */
export function transaction<T>(db: Database, work: () => T): T {
  if (db.isTransaction) {
    throw new Error("Nested transactions are not supported");
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
