import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStarterFarm, harvest, plant } from "../farming/rules.js";
import { SCHEMA_MIGRATIONS, SCHEMA_VERSION, getSchemaVersion, openDatabase, transaction, type Database } from "./database.js";
import { createEmptyBuilding, grantDecoration, placeDecoration } from "../building/rules.js";
import { buyCosmetic, createStarterCharacter, equipAppearance } from "../character/rules.js";
import {
  insertPlayer,
  loadBuilding,
  loadCharacter,
  loadFarm,
  loadQuestState,
  saveBuilding,
  saveCharacter,
  saveFarm,
  saveQuestState,
} from "./farmStore.js";

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
  it("is followed by v3 (Phase 3 building) and v4 (Phase 4 character), the latest version", () => {
    expect(SCHEMA_VERSION).toBe(4);
  });

  it("upgrades a v1 database and keeps every player's Phase 1 data", () => {
    createV1Database([NEWBIE, LEVEL3, LEVEL5]);
    const db = openDatabase(path);
    try {
      expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);

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
      expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
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
      expect(getSchemaVersion(again)).toBe(SCHEMA_VERSION);
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

/** Writes a schema v2 database as the Phase 2 server leaves it (v1 players, then the v2 upgrade). */
function createV2Database(players: V1Player[], setup: (db: DatabaseSync) => void = () => {}): void {
  createV1Database(players);
  const db = new DatabaseSync(path);
  db.exec(SCHEMA_MIGRATIONS[1]!);
  db.exec("UPDATE schema_version SET version = 2");
  setup(db);
  db.close();
}

describe("schema v2 → v3 migration (Phase 3 building)", () => {
  it("keeps every Phase 2 row unchanged and gives each player an empty building state", () => {
    createV2Database([NEWBIE, LEVEL3, LEVEL5], (db) => {
      db.exec(`UPDATE quest_state SET quest_index = 3, progress = 1 WHERE player_id = '${LEVEL3.id}'`);
    });
    const raw = new DatabaseSync(path);
    const before = snapshot(raw);
    raw.close();

    const db = openDatabase(path);
    try {
      expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
      const after = snapshot(db);
      for (const table of ["players", "plots", "inventory", "quest_state", "action_log"]) {
        expect(after[table]).toEqual(before[table]);
      }
      for (const player of [NEWBIE, LEVEL3, LEVEL5]) {
        expect(loadBuilding(db, player.id)).toEqual(createEmptyBuilding());
      }
      expect(loadQuestState(db, LEVEL3.id)).toEqual({ index: 3, progress: 1 });
      expect(count(db, "SELECT COUNT(*) AS n FROM decoration_stock")).toBe(3 * 7);
      expect(count(db, "SELECT COUNT(*) AS n FROM farm_objects")).toBe(0);
    } finally {
      db.close();
    }
  });

  it("upgrades an empty v2 database", () => {
    createV2Database([]);
    const db = openDatabase(path);
    try {
      expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
      expect(count(db, "SELECT COUNT(*) AS n FROM building_state")).toBe(0);
    } finally {
      db.close();
    }
  });

  it("never duplicates rows nor overwrites placed objects if v3 runs again", () => {
    createV2Database([NEWBIE]);
    const db = openDatabase(path);
    const placed = placeDecoration(grantDecoration(createEmptyBuilding(), "tree", 2), {
      decorationId: "tree",
      x: 0,
      y: 0,
      rotation: 90,
    });
    if (!placed.ok) throw new Error(placed.error);
    transaction(db, () => saveBuilding(db, NEWBIE.id, placed.building));
    db.exec("UPDATE schema_version SET version = 2");
    db.close();

    const again = openDatabase(path);
    try {
      expect(getSchemaVersion(again)).toBe(SCHEMA_VERSION);
      expect(loadBuilding(again, NEWBIE.id)).toEqual(placed.building);
      expect(count(again, "SELECT COUNT(*) AS n FROM decoration_stock")).toBe(7);
      expect(count(again, "SELECT COUNT(*) AS n FROM building_state")).toBe(1);
    } finally {
      again.close();
    }
  });

  it("rolls back completely when the upgrade fails, leaving v2 data untouched", () => {
    createV2Database([NEWBIE], (db) => db.exec("CREATE VIEW decoration_stock AS SELECT 1 AS x"));
    expect(() => openDatabase(path)).toThrow();

    const raw = new DatabaseSync(path);
    try {
      expect(raw.prepare("SELECT version FROM schema_version").get()?.["version"]).toBe(2);
      expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'building_state'").get()).toBeUndefined();
      expect(count(raw, "SELECT COUNT(*) AS n FROM quest_state")).toBe(1);
    } finally {
      raw.close();
    }
  });

  it("lets a Phase 2 player keep playing after the upgrade", () => {
    createV2Database([LEVEL3]);
    const db = openDatabase(path);
    try {
      const result = plant(loadFarm(db, LEVEL3.id)!, 6, "corn", T);
      if (!result.ok) throw new Error(result.error);
      transaction(db, () => saveFarm(db, LEVEL3.id, result.farm));
      expect(loadFarm(db, LEVEL3.id)?.inventory.corn_seed).toBe(4);
    } finally {
      db.close();
    }
  });
});

describe("building storage", () => {
  const ID = "00000000-0000-4000-8000-0000000000bb";

  function withPlayer(work: (db: Database) => void): void {
    const db = openDatabase(path);
    try {
      transaction(db, () => insertPlayer(db, { id: ID, tokenHash: "e".repeat(64), createdAt: T }, createStarterFarm()));
      work(db);
    } finally {
      db.close();
    }
  }

  it("creates new players with an empty building state and round-trips a layout", () => {
    withPlayer((db) => {
      expect(loadBuilding(db, ID)).toEqual(createEmptyBuilding());
      let building = grantDecoration(grantDecoration(createEmptyBuilding(), "fence", 3), "small_house", 1);
      for (const placement of [
        { decorationId: "small_house", x: 6, y: 6, rotation: 180 },
        { decorationId: "fence", x: 0, y: 0, rotation: 0 },
      ] as const) {
        const result = placeDecoration(building, placement);
        if (!result.ok) throw new Error(result.error);
        building = result.building;
      }
      transaction(db, () => saveBuilding(db, ID, building));
      expect(loadBuilding(db, ID)).toEqual(building);
      expect(loadBuilding(db, "no-such-player")).toBeNull();
    });
  });

  it("rejects corrupted building rows when loading", () => {
    withPlayer((db) => {
      db.exec(`INSERT INTO farm_objects VALUES ('${ID}', 1, 'tree', 0, 0, 0), ('${ID}', 2, 'fence', 1, 1, 0)`);
      db.exec(`UPDATE building_state SET next_object_id = 3`);
      expect(() => loadBuilding(db, ID)).toThrow(RangeError);
      db.exec("DELETE FROM farm_objects WHERE object_id = 2");
      expect(loadBuilding(db, ID)?.objects).toHaveLength(1);
      db.exec(`INSERT INTO farm_objects VALUES ('${ID}', 5, 'castle', 6, 6, 0)`);
      expect(() => loadBuilding(db, ID)).toThrow(RangeError);
      db.exec("DELETE FROM farm_objects WHERE object_id = 5");
      db.exec("DELETE FROM decoration_stock WHERE decoration_id = 'bench'");
      expect(() => loadBuilding(db, ID)).toThrow(RangeError);
      db.exec("DELETE FROM building_state");
      expect(() => loadBuilding(db, ID)).toThrow(RangeError);
    });
  });

  it("enforces stock and rotation constraints in the schema", () => {
    withPlayer((db) => {
      expect(() => db.exec("UPDATE decoration_stock SET quantity = -1")).toThrow();
      expect(() => db.exec(`INSERT INTO farm_objects VALUES ('${ID}', 1, 'tree', 0, 0, 45)`)).toThrow();
    });
  });
});

function createV3Database(players: V1Player[], setup: (db: DatabaseSync) => void = () => {}): void {
  createV2Database(players);
  const db = new DatabaseSync(path);
  db.exec(SCHEMA_MIGRATIONS[2]!);
  db.exec("UPDATE schema_version SET version = 3");
  setup(db);
  db.close();
}

describe("schema v3 → v4 migration (Phase 4 character)", () => {
  it("keeps every earlier row unchanged and gives each player the starter character", () => {
    createV3Database([NEWBIE, LEVEL3, LEVEL5], (db) => {
      db.exec(`INSERT INTO farm_objects VALUES ('${LEVEL3.id}', 1, 'fence', 0, 0, 90)`);
      db.exec(`UPDATE building_state SET next_object_id = 2 WHERE player_id = '${LEVEL3.id}'`);
    });
    const raw = new DatabaseSync(path);
    const before = snapshot(raw);
    const objectsBefore = raw.prepare("SELECT * FROM farm_objects").all();
    raw.close();

    const db = openDatabase(path);
    try {
      expect(getSchemaVersion(db)).toBe(4);
      const after = snapshot(db);
      for (const table of ["players", "plots", "inventory", "quest_state", "action_log"]) {
        expect(after[table]).toEqual(before[table]);
      }
      expect(db.prepare("SELECT * FROM farm_objects").all()).toEqual(objectsBefore);
      for (const player of [NEWBIE, LEVEL3, LEVEL5]) {
        expect(loadCharacter(db, player.id)).toEqual(createStarterCharacter());
      }
      expect(count(db, "SELECT COUNT(*) AS n FROM cosmetic_inventory")).toBe(3 * 6);
    } finally {
      db.close();
    }
  });

  it("never duplicates rows nor overwrites a changed character if v4 runs again", () => {
    createV3Database([LEVEL5]);
    const db = openDatabase(path);
    const bought = buyCosmetic(loadFarm(db, LEVEL5.id)!, createStarterCharacter(), "shirt_overalls");
    if (!bought.ok) throw new Error(bought.error);
    const worn = equipAppearance(bought.character, { skin: "dark", hair: "hair_long_black", shirt: "shirt_overalls", pants: "pants_brown" });
    if (!worn.ok) throw new Error(worn.error);
    transaction(db, () => saveCharacter(db, LEVEL5.id, worn.character));
    db.exec("UPDATE schema_version SET version = 3");
    db.close();

    const again = openDatabase(path);
    try {
      expect(getSchemaVersion(again)).toBe(4);
      expect(loadCharacter(again, LEVEL5.id)).toEqual(worn.character);
      expect(count(again, "SELECT COUNT(*) AS n FROM cosmetic_inventory")).toBe(7);
      expect(count(again, "SELECT COUNT(*) AS n FROM character_appearance")).toBe(1);
    } finally {
      again.close();
    }
  });

  it("rolls back completely when the upgrade fails, leaving v3 data untouched", () => {
    createV3Database([NEWBIE], (db) => db.exec("CREATE VIEW cosmetic_inventory AS SELECT 1 AS x"));
    expect(() => openDatabase(path)).toThrow();

    const raw = new DatabaseSync(path);
    try {
      expect(raw.prepare("SELECT version FROM schema_version").get()?.["version"]).toBe(3);
      expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'character_appearance'").get()).toBeUndefined();
    } finally {
      raw.close();
    }
  });
});

describe("character storage", () => {
  const ID = "00000000-0000-4000-8000-0000000000cc";

  function withPlayer(work: (db: Database) => void): void {
    const db = openDatabase(path);
    try {
      transaction(db, () => insertPlayer(db, { id: ID, tokenHash: "f".repeat(64), createdAt: T }, createStarterFarm()));
      work(db);
    } finally {
      db.close();
    }
  }

  it("creates new players with the starter character and round-trips a change", () => {
    withPlayer((db) => {
      expect(loadCharacter(db, ID)).toEqual(createStarterCharacter());
      const farm = { ...createStarterFarm(), coins: 100, xp: 50 };
      const bought = buyCosmetic(farm, createStarterCharacter(), "hair_spiky_blond");
      if (!bought.ok) throw new Error(bought.error);
      const worn = equipAppearance(bought.character, { skin: "tan", hair: "hair_spiky_blond", shirt: "shirt_blue_tee", pants: "pants_brown" });
      if (!worn.ok) throw new Error(worn.error);
      transaction(db, () => saveCharacter(db, ID, worn.character));
      expect(loadCharacter(db, ID)).toEqual(worn.character);
      expect(loadCharacter(db, "no-such-player")).toBeNull();
    });
  });

  it("rejects corrupted character rows when loading", () => {
    withPlayer((db) => {
      db.exec("UPDATE character_appearance SET hair = 'hair_bun_red'");
      expect(() => loadCharacter(db, ID)).toThrow(RangeError);
      db.exec("UPDATE character_appearance SET hair = 'hair_short_brown', skin = 'green'");
      expect(() => loadCharacter(db, ID)).toThrow(RangeError);
      db.exec("UPDATE character_appearance SET skin = 'light'");
      db.exec(`INSERT INTO cosmetic_inventory VALUES ('${ID}', 'cape')`);
      expect(() => loadCharacter(db, ID)).toThrow(RangeError);
      db.exec("DELETE FROM cosmetic_inventory WHERE cosmetic_id IN ('cape', 'pants_brown')");
      expect(() => loadCharacter(db, ID)).toThrow(RangeError);
      db.exec("DELETE FROM character_appearance");
      expect(() => loadCharacter(db, ID)).toThrow(RangeError);
    });
  });
});
