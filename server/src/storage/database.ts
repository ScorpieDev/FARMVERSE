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
];

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
