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
