import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStarterFarm, harvest, plant, type FarmData } from "../farming/rules.js";
import {
  MEMORY_DATABASE,
  SCHEMA_VERSION,
  getSchemaVersion,
  openDatabase,
  transaction,
  type Database,
} from "./database.js";
import {
  findAction,
  findPlayerIdByTokenHash,
  insertAction,
  insertPlayer,
  loadFarm,
  saveFarm,
} from "./farmStore.js";

const T = 1_700_000_000_000;
const PLAYER = { id: "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7b9e0f12", tokenHash: "a".repeat(64), createdAt: T };
const OTHER = { id: "00000000-0000-4000-8000-000000000001", tokenHash: "b".repeat(64), createdAt: T };

function ok(result: { ok: true; farm: FarmData } | { ok: false; error: string }): FarmData {
  if (!result.ok) throw new Error(result.error);
  return result.farm;
}

let db: Database;

beforeEach(() => {
  db = openDatabase(MEMORY_DATABASE);
});

afterEach(() => {
  if (db.isOpen) db.close();
});

describe("openDatabase", () => {
  it("creates the schema at the current version", () => {
    expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row["name"]);
    expect(tables).toEqual(["action_log", "inventory", "players", "plots", "schema_version"]);
  });

  it("enables foreign keys", () => {
    expect(db.prepare("PRAGMA foreign_keys").get()?.["foreign_keys"]).toBe(1);
  });
});

describe("file database", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "farmverse-db-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates missing folders and keeps data after reopening", () => {
    const path = join(dir, "nested", "farm.db");
    const first = openDatabase(path);
    const farm = ok(plant(createStarterFarm(), 2, "carrot", T));
    transaction(first, () => insertPlayer(first, PLAYER, farm));
    first.close();

    const second = openDatabase(path);
    expect(getSchemaVersion(second)).toBe(SCHEMA_VERSION);
    expect(loadFarm(second, PLAYER.id)).toEqual(farm);
    second.close();
  });

  it("refuses a database created by a newer server", () => {
    const path = join(dir, "farm.db");
    const first = openDatabase(path);
    first.exec(`UPDATE schema_version SET version = ${SCHEMA_VERSION + 1}`);
    first.close();

    expect(() => openDatabase(path)).toThrow(/newer than this server supports/);
  });
});

describe("players and farms", () => {
  it("stores a new player with a complete starter farm", () => {
    transaction(db, () => insertPlayer(db, PLAYER, createStarterFarm()));

    expect(loadFarm(db, PLAYER.id)).toEqual(createStarterFarm());
    expect(db.prepare("SELECT COUNT(*) AS n FROM plots").get()?.["n"]).toBe(6);
    expect(db.prepare("SELECT COUNT(*) AS n FROM inventory").get()?.["n"]).toBe(6);
  });

  it("finds a player by token hash only", () => {
    transaction(db, () => insertPlayer(db, PLAYER, createStarterFarm()));

    expect(findPlayerIdByTokenHash(db, PLAYER.tokenHash)).toBe(PLAYER.id);
    expect(findPlayerIdByTokenHash(db, "c".repeat(64))).toBeNull();
  });

  it("rejects a duplicate token hash or player id", () => {
    transaction(db, () => insertPlayer(db, PLAYER, createStarterFarm()));

    expect(() =>
      transaction(db, () => insertPlayer(db, { ...OTHER, tokenHash: PLAYER.tokenHash }, createStarterFarm())),
    ).toThrow();
    expect(() =>
      transaction(db, () => insertPlayer(db, { ...OTHER, id: PLAYER.id }, createStarterFarm())),
    ).toThrow();
  });

  it("returns null for an unknown player", () => {
    expect(loadFarm(db, OTHER.id)).toBeNull();
  });

  it("saves and reloads farm changes, including the refill cooldown", () => {
    transaction(db, () => insertPlayer(db, PLAYER, createStarterFarm()));
    let farm = ok(plant(createStarterFarm(), 0, "wheat", T));
    farm = ok(harvest(farm, 0, T + 30_000));
    farm = { ...farm, seedRefillAvailableAt: T + 90_000 };

    transaction(db, () => saveFarm(db, PLAYER.id, farm));

    expect(loadFarm(db, PLAYER.id)).toEqual(farm);
  });

  it("keeps players separate", () => {
    transaction(db, () => {
      insertPlayer(db, PLAYER, createStarterFarm());
      insertPlayer(db, OTHER, createStarterFarm());
    });
    const farm = ok(plant(createStarterFarm(), 1, "tomato", T));

    transaction(db, () => saveFarm(db, PLAYER.id, farm));

    expect(loadFarm(db, PLAYER.id)).toEqual(farm);
    expect(loadFarm(db, OTHER.id)).toEqual(createStarterFarm());
  });

  it("refuses to save for an unknown player", () => {
    expect(() => transaction(db, () => saveFarm(db, OTHER.id, createStarterFarm()))).toThrow(
      /Unknown player/,
    );
  });

  it("refuses to save invalid farm data", () => {
    transaction(db, () => insertPlayer(db, PLAYER, createStarterFarm()));
    const bad = { ...createStarterFarm(), inventory: { ...createStarterFarm().inventory, wheat_seed: -1 } };

    expect(() => transaction(db, () => saveFarm(db, PLAYER.id, bad))).toThrow(RangeError);
    expect(loadFarm(db, PLAYER.id)).toEqual(createStarterFarm());
  });
});

describe("corrupted rows are reported, not repaired", () => {
  beforeEach(() => {
    transaction(db, () => insertPlayer(db, PLAYER, createStarterFarm()));
  });

  it("throws RangeError when a plot row is missing", () => {
    db.prepare("DELETE FROM plots WHERE player_id = ? AND plot_index = 3").run(PLAYER.id);

    expect(() => loadFarm(db, PLAYER.id)).toThrow(RangeError);
  });

  it("throws RangeError when an inventory row is missing", () => {
    db.prepare("DELETE FROM inventory WHERE player_id = ? AND item_id = 'carrot_seed'").run(PLAYER.id);

    expect(() => loadFarm(db, PLAYER.id)).toThrow(RangeError);
  });

  it("throws RangeError for an unknown crop id", () => {
    db.prepare("UPDATE plots SET crop_id = 'corn', planted_at = 1 WHERE player_id = ? AND plot_index = 0").run(
      PLAYER.id,
    );

    expect(() => loadFarm(db, PLAYER.id)).toThrow(RangeError);
  });

  it("throws RangeError for a plot index beyond the farm", () => {
    db.prepare("INSERT INTO plots (player_id, plot_index) VALUES (?, 6)").run(PLAYER.id);

    expect(() => loadFarm(db, PLAYER.id)).toThrow(RangeError);
  });

  it("rejects negative quantities at the database level", () => {
    expect(() =>
      db.prepare("UPDATE inventory SET quantity = -1 WHERE player_id = ?").run(PLAYER.id),
    ).toThrow(/CHECK constraint/);
  });

  it("rejects a crop without a planting time at the database level", () => {
    expect(() =>
      db.prepare("UPDATE plots SET crop_id = 'wheat' WHERE player_id = ? AND plot_index = 0").run(PLAYER.id),
    ).toThrow(/CHECK constraint/);
  });

  it("rejects rows for an unknown player (foreign key)", () => {
    expect(() =>
      db.prepare("INSERT INTO inventory (player_id, item_id, quantity) VALUES (?, 'wheat_seed', 1)").run(OTHER.id),
    ).toThrow(/FOREIGN KEY/);
  });
});

describe("transactions", () => {
  it("rolls back every change when the work throws", () => {
    expect(() =>
      transaction(db, () => {
        insertPlayer(db, PLAYER, createStarterFarm());
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(loadFarm(db, PLAYER.id)).toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS n FROM plots").get()?.["n"]).toBe(0);
    expect(db.isTransaction).toBe(false);
  });

  it("rolls back a partial farm save", () => {
    transaction(db, () => insertPlayer(db, PLAYER, createStarterFarm()));
    const farm = ok(plant(createStarterFarm(), 0, "wheat", T));

    expect(() =>
      transaction(db, () => {
        saveFarm(db, PLAYER.id, farm);
        throw new Error("fail after save");
      }),
    ).toThrow("fail after save");

    expect(loadFarm(db, PLAYER.id)).toEqual(createStarterFarm());
  });

  it("returns the work result", () => {
    expect(transaction(db, () => 42)).toBe(42);
  });

  it("does not nest", () => {
    expect(() => transaction(db, () => transaction(db, () => 1))).toThrow(/Nested/);
    expect(db.isTransaction).toBe(false);
  });
});

describe("action log", () => {
  beforeEach(() => {
    transaction(db, () => insertPlayer(db, PLAYER, createStarterFarm()));
  });

  const record = { action: "plant", requestJson: '{"plotIndex":0}', responseJson: '{"ok":true}' };

  it("stores and finds an action per player and request ID", () => {
    insertAction(db, PLAYER.id, "req-1", record, T);

    expect(findAction(db, PLAYER.id, "req-1")).toEqual(record);
    expect(findAction(db, PLAYER.id, "req-2")).toBeNull();
  });

  it("scopes request IDs per player", () => {
    transaction(db, () => insertPlayer(db, OTHER, createStarterFarm()));
    insertAction(db, PLAYER.id, "req-1", record, T);

    expect(findAction(db, OTHER.id, "req-1")).toBeNull();
    expect(() => insertAction(db, OTHER.id, "req-1", record, T)).not.toThrow();
  });

  it("refuses a second record with the same request ID", () => {
    insertAction(db, PLAYER.id, "req-1", record, T);

    expect(() => insertAction(db, PLAYER.id, "req-1", { ...record, action: "harvest" }, T)).toThrow(
      /UNIQUE|PRIMARY KEY/,
    );
    expect(findAction(db, PLAYER.id, "req-1")).toEqual(record);
  });
});
