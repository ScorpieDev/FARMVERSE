import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStarterFarm, harvest, plant } from "../farming/rules.js";
import { SCHEMA_MIGRATIONS, SCHEMA_VERSION, getSchemaVersion, openDatabase, transaction, type Database } from "./database.js";
import { insertPlayer, loadFarm, loadQuestState, saveFarm, saveQuestState } from "./farmStore.js";

const T = 1_700_000_000_000;
const V1_ITEMS = ["wheat_seed", "carrot_seed", "tomato_seed", "wheat_produce", "carrot_produce", "tomato_produce"];

interface V1Player {
  id: string;
  xp: number;
  coins: number;
  /** Planted crops by plot index (plots 0–5). */
  crops?: Record<number, { cropId: string; plantedAt: number }>;
  inventory?: Record<string, number>;
  /** Items whose row is left out (corrupted data). */
  missingItems?: string[];
}

const NEWBIE: V1Player = {
  id: "00000000-0000-4000-8000-000000000001",
  xp: 12,
  coins: 30,
  crops: { 2: { cropId: "wheat", plantedAt: T } },
  inventory: { wheat_seed: 4, carrot_seed: 5, tomato_seed: 5, wheat_produce: 6 },
};
const LEVEL3: V1Player = { id: "00000000-0000-4000-8000-000000000003", xp: 200, coins: 400, inventory: { carrot_produce: 9 } };
const LEVEL5: V1Player = { id: "00000000-0000-4000-8000-000000000005", xp: 600, coins: 900 };

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "farmverse-migration-"));
  path = join(dir, "farm.db");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Writes a schema v1 database exactly as the Phase 1 server left it. */
function createV1Database(players: V1Player[], setup: (db: DatabaseSync) => void = () => {}): void {
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE schema_version (version INTEGER NOT NULL) STRICT");
  db.exec(SCHEMA_MIGRATIONS[0]!);
  db.exec("INSERT INTO schema_version (version) VALUES (1)");
  players.forEach((player, n) => {
    db.prepare("INSERT INTO players (id, token_hash, created_at, coins, xp) VALUES (?, ?, ?, ?, ?)").run(
      player.id,
      String(n).repeat(64),
      T,
      player.coins,
      player.xp,
    );
    for (let index = 0; index < 6; index++) {
      const crop = player.crops?.[index];
      db.prepare("INSERT INTO plots (player_id, plot_index, crop_id, planted_at) VALUES (?, ?, ?, ?)").run(
        player.id,
        index,
        crop?.cropId ?? null,
        crop?.plantedAt ?? null,
      );
    }
    for (const itemId of V1_ITEMS) {
      if (player.missingItems?.includes(itemId)) continue;
      db.prepare("INSERT INTO inventory (player_id, item_id, quantity) VALUES (?, ?, ?)").run(
        player.id,
        itemId,
        player.inventory?.[itemId] ?? 0,
      );
    }
  });
  if (players.some((player) => player.id === NEWBIE.id)) db.prepare(
    "INSERT INTO action_log (player_id, request_id, action, request_json, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(NEWBIE.id, "11111111-1111-4111-8111-111111111111", "plant", '{"plotIndex":2}', '{"ok":true}', T);
  setup(db);
  db.close();
}

/** Every row of every table, for before/after comparisons. */
function snapshot(db: Database): Record<string, unknown[]> {
  const tables = ["players", "plots", "inventory", "quest_state", "action_log", "schema_version"];
  return Object.fromEntries(
    tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY ${table === "schema_version" ? "1" : "1, 2"}`).all()]),
  );
}

function count(db: Database, sql: string): number {
  return Number(db.prepare(sql).get()?.["n"]);
}

describe("schema v1 → v2 migration", () => {
  it("is the latest version", () => {
    expect(SCHEMA_VERSION).toBe(2);
  });

  it("upgrades a v1 database and keeps every player's Phase 1 data", () => {
    createV1Database([NEWBIE, LEVEL3, LEVEL5]);
    const db = openDatabase(path);
    try {
      expect(getSchemaVersion(db)).toBe(2);

      const farm = loadFarm(db, NEWBIE.id)!;
      expect(farm.plots).toHaveLength(9);
      expect(farm.plots[2]).toEqual({ cropId: "wheat", plantedAt: T });
      expect(farm.plots.filter((plot) => plot !== null)).toHaveLength(1);
      expect(farm.plots.slice(6)).toEqual([null, null, null]);
      expect(farm).toMatchObject({ coins: 30, xp: 12, seedRefillAvailableAt: null });
      expect(farm.inventory).toMatchObject({ wheat_seed: 4, carrot_seed: 5, tomato_seed: 5, wheat_produce: 6 });

      expect(loadFarm(db, LEVEL3.id)).toMatchObject({ coins: 400, xp: 200, inventory: { carrot_produce: 9 } });
      expect(db.prepare("SELECT * FROM action_log").all()).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("adds Corn and Strawberry rows, with the unlock seeds only for players already at that level", () => {
    createV1Database([NEWBIE, LEVEL3, LEVEL5]);
    const db = openDatabase(path);
    try {
      const seeds = (id: string) => {
        const { inventory } = loadFarm(db, id)!;
        return [inventory.corn_seed, inventory.strawberry_seed, inventory.corn_produce, inventory.strawberry_produce];
      };
      expect(seeds(NEWBIE.id)).toEqual([0, 0, 0, 0]);
      expect(seeds(LEVEL3.id)).toEqual([5, 0, 0, 0]);
      expect(seeds(LEVEL5.id)).toEqual([5, 5, 0, 0]);
    } finally {
      db.close();
    }
  });

  it("starts every existing player at the first quest", () => {
    createV1Database([NEWBIE, LEVEL3]);
    const db = openDatabase(path);
    try {
      expect(loadQuestState(db, NEWBIE.id)).toEqual({ index: 0, progress: 0 });
      expect(loadQuestState(db, LEVEL3.id)).toEqual({ index: 0, progress: 0 });
    } finally {
      db.close();
    }
  });

  it("upgrades an empty v1 database", () => {
    createV1Database([]);
    const db = openDatabase(path);
    try {
      expect(getSchemaVersion(db)).toBe(2);
      expect(count(db, "SELECT COUNT(*) AS n FROM quest_state")).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe("migration safety", () => {
  it("does nothing when an upgraded database is opened again", () => {
    createV1Database([NEWBIE, LEVEL3, LEVEL5]);
    const first = openDatabase(path);
    const before = snapshot(first);
    first.close();

    const second = openDatabase(path);
    try {
      expect(snapshot(second)).toEqual(before);
    } finally {
      second.close();
    }
  });

  it("never duplicates rows or unlock seeds, nor overwrites progress, if v2 runs again", () => {
    createV1Database([NEWBIE, LEVEL3]);
    const db = openDatabase(path);
    // Gameplay after the upgrade: LEVEL3 plants 3 of the 5 Corn seeds and advances a quest.
    let farm = loadFarm(db, LEVEL3.id)!;
    for (const plot of [0, 1, 6]) {
      const result = plant(farm, plot, "corn", T);
      if (!result.ok) throw new Error(result.error);
      farm = result.farm;
    }
    transaction(db, () => {
      saveFarm(db, LEVEL3.id, farm);
      saveQuestState(db, LEVEL3.id, { index: 2, progress: 1 });
    });
    // Simulate an interrupted bookkeeping step: version still says 1.
    db.exec("UPDATE schema_version SET version = 1");
    const before = snapshot(db);
    db.close();

    const again = openDatabase(path);
    try {
      expect(getSchemaVersion(again)).toBe(2);
      const after = snapshot(again);
      expect(after["plots"]).toEqual(before["plots"]);
      expect(after["inventory"]).toEqual(before["inventory"]);
      expect(after["quest_state"]).toEqual(before["quest_state"]);
      expect(loadFarm(again, LEVEL3.id)?.inventory.corn_seed).toBe(2);
      expect(count(again, "SELECT COUNT(*) AS n FROM plots")).toBe(2 * 9);
      expect(count(again, "SELECT COUNT(*) AS n FROM inventory")).toBe(2 * 10);
    } finally {
      again.close();
    }
  });

  it("rolls back completely when the upgrade fails, leaving v1 data untouched", () => {
    // An object already named quest_state that is not the expected table makes v2 fail midway.
    createV1Database([NEWBIE], (db) => db.exec("CREATE VIEW quest_state AS SELECT 1 AS x"));

    expect(() => openDatabase(path)).toThrow();

    const raw = new DatabaseSync(path);
    try {
      expect(raw.prepare("SELECT version FROM schema_version").get()?.["version"]).toBe(1);
      expect(count(raw, "SELECT COUNT(*) AS n FROM plots")).toBe(6);
      expect(count(raw, "SELECT COUNT(*) AS n FROM inventory")).toBe(6);
    } finally {
      raw.close();
    }
  });

  it("refuses a database newer than this server", () => {
    createV1Database([], (db) => db.exec(`UPDATE schema_version SET version = ${SCHEMA_VERSION + 1}`));
    expect(() => openDatabase(path)).toThrow(/newer than this server supports/);
  });
});

describe("corrupted v1 data is reported, not repaired", () => {
  it("still fails to load a farm with a missing Phase 1 inventory row", () => {
    createV1Database([{ ...NEWBIE, missingItems: ["carrot_seed"] }]);
    const db = openDatabase(path);
    try {
      expect(() => loadFarm(db, NEWBIE.id)).toThrow(RangeError);
    } finally {
      db.close();
    }
  });

  it("still fails to load a farm with an unknown crop", () => {
    createV1Database([{ ...NEWBIE, crops: { 0: { cropId: "rice", plantedAt: T } } }]);
    const db = openDatabase(path);
    try {
      expect(() => loadFarm(db, NEWBIE.id)).toThrow(RangeError);
    } finally {
      db.close();
    }
  });

  it("rejects a missing or invalid quest state", () => {
    createV1Database([NEWBIE]);
    const db = openDatabase(path);
    try {
      expect(() => db.prepare("UPDATE quest_state SET progress = -1").run()).toThrow();
      db.exec("UPDATE quest_state SET quest_index = 99");
      expect(() => loadQuestState(db, NEWBIE.id)).toThrow(RangeError);
      db.exec("DELETE FROM quest_state");
      expect(() => loadQuestState(db, NEWBIE.id)).toThrow(RangeError);
      expect(() => saveQuestState(db, NEWBIE.id, { index: 1, progress: 0 })).toThrow(RangeError);
      expect(loadQuestState(db, "no-such-player")).toBeNull();
    } finally {
      db.close();
    }
  });
});

describe("backward compatibility after the upgrade", () => {
  it("lets a Phase 1 player keep playing: harvest the old crop and save", () => {
    createV1Database([NEWBIE]);
    const db = openDatabase(path);
    try {
      const result = harvest(loadFarm(db, NEWBIE.id)!, 2, T + 30_000);
      if (!result.ok) throw new Error(result.error);
      transaction(db, () => saveFarm(db, NEWBIE.id, result.farm));
      expect(loadFarm(db, NEWBIE.id)).toMatchObject({ coins: 32, xp: 13, inventory: { wheat_produce: 7 } });
    } finally {
      db.close();
    }
  });

  it("creates new players with the v2 rows next to migrated ones", () => {
    createV1Database([NEWBIE]);
    const db = openDatabase(path);
    try {
      const id = "00000000-0000-4000-8000-0000000000aa";
      transaction(db, () => insertPlayer(db, { id, tokenHash: "f".repeat(64), createdAt: T }, createStarterFarm()));
      expect(loadFarm(db, id)).toEqual(createStarterFarm());
      expect(loadQuestState(db, id)).toEqual({ index: 0, progress: 0 });
      transaction(db, () => saveQuestState(db, id, { index: 1, progress: 0 }));
      expect(loadQuestState(db, id)).toEqual({ index: 1, progress: 0 });
    } finally {
      db.close();
    }
  });
});
