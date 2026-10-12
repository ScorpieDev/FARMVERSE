import { beforeEach, describe, expect, it } from "vitest";
import type { PlacedObject } from "@farmverse/shared/building";
import { DEFAULT_APPEARANCE, type CharacterAppearance } from "@farmverse/shared/character";
import { EMOTE_MIN_INTERVAL_MS, MAX_ROOM_PLAYERS, MOVE_MIN_INTERVAL_MS } from "@farmverse/shared/presence";
import type { ServerMessage } from "@farmverse/shared/protocol";
import { PresenceHub, type HubConnection } from "./hub.js";

/** Farm owners by farm code; ids are player IDs. */
const OWNERS: Record<string, string> = { AAAAAA: "owner-a", BBBBBB: "owner-b" };
let objects: Record<string, PlacedObject[]>;
let appearances: Record<string, CharacterAppearance>;
let time: number;
let hub: PresenceHub;

interface TestConnection extends HubConnection {
  inbox: ServerMessage[];
}

function connection(playerId: string, farmCode: string, name = "Farmer 0001"): TestConnection {
  const inbox: ServerMessage[] = [];
  return { playerId, profile: { farmCode, name }, send: (message) => inbox.push(message), inbox };
}

/** A connected player (owner of `farmCode`, or a visitor with that code). */
function online(playerId: string, farmCode: string): TestConnection {
  const created = connection(playerId, farmCode);
  hub.connect(created);
  return created;
}

const types = (c: TestConnection) => c.inbox.map((message) => message.type);

beforeEach(() => {
  objects = { "owner-a": [], "owner-b": [] };
  appearances = {};
  time = 1_000_000;
  hub = new PresenceHub({
    findFarmOwner: (farmCode) => OWNERS[farmCode] ?? null,
    loadObjects: (playerId) => objects[playerId] ?? [],
    loadAppearance: (playerId) => appearances[playerId] ?? { ...DEFAULT_APPEARANCE },
    now: () => time,
  });
});

describe("join (R-A, F-A)", () => {
  it("puts the newcomer on the entry tile, sends a snapshot and tells the others", () => {
    const owner = online("owner-a", "AAAAAA");
    const visitor = online("visitor", "VVVVVV");
    appearances["visitor"] = { ...DEFAULT_APPEARANCE, skin: "dark" };

    expect(hub.handle(owner, { type: "join", farmCode: "AAAAAA" })).toEqual({ ok: true });
    expect(owner.inbox).toEqual([
      { type: "room", farmCode: "AAAAAA", players: [{ id: "AAAAAA", name: "Farmer 0001", appearance: DEFAULT_APPEARANCE, x: 3, y: 7 }] },
    ]);

    expect(hub.handle(visitor, { type: "join", farmCode: "AAAAAA" })).toEqual({ ok: true });
    const snapshot = visitor.inbox[0];
    expect(snapshot?.type === "room" && snapshot.players.map((player) => player.id)).toEqual(["AAAAAA", "VVVVVV"]);
    expect(owner.inbox.at(-1)).toEqual({
      type: "player_joined",
      player: { id: "VVVVVV", name: "Farmer 0001", appearance: { ...DEFAULT_APPEARANCE, skin: "dark" }, x: 3, y: 7 },
    });
  });

  it("uses the farm's layout for the entry tile", () => {
    objects["owner-b"] = [{ objectId: 1, decorationId: "fence", x: 3, y: 7, rotation: 0 }];
    const visitor = online("visitor", "VVVVVV");
    hub.handle(visitor, { type: "join", farmCode: "BBBBBB" });
    const snapshot = visitor.inbox[0];
    expect(snapshot?.type === "room" && [snapshot.players[0]?.x, snapshot.players[0]?.y]).toEqual([4, 7]);
  });

  it("refuses unknown farm codes", () => {
    const visitor = online("visitor", "VVVVVV");
    expect(hub.handle(visitor, { type: "join", farmCode: "ZZZZZZ" })).toMatchObject({ ok: false, code: "ROOM_NOT_FOUND" });
    expect(visitor.inbox).toEqual([]);
  });

  it("leaves the previous room first", () => {
    const owner = online("owner-a", "AAAAAA");
    const visitor = online("visitor", "VVVVVV");
    hub.handle(owner, { type: "join", farmCode: "AAAAAA" });
    hub.handle(visitor, { type: "join", farmCode: "AAAAAA" });
    hub.handle(visitor, { type: "join", farmCode: "BBBBBB" });
    expect(owner.inbox.at(-1)).toEqual({ type: "player_left", id: "VVVVVV" });
    expect(hub.roomMembers("AAAAAA")).toEqual(["AAAAAA"]);
    expect(hub.roomMembers("BBBBBB")).toEqual(["VVVVVV"]);
  });

  it(`refuses a ${MAX_ROOM_PLAYERS + 1}th player`, () => {
    for (let index = 0; index < MAX_ROOM_PLAYERS; index++) {
      const code = `C${"ABCDEFGHJKLMNPQRSTUVWXYZ"[index]}2222`;
      expect(hub.handle(online(`p${index}`, code), { type: "join", farmCode: "AAAAAA" })).toEqual({ ok: true });
    }
    expect(hub.handle(online("late", "LLLLLL"), { type: "join", farmCode: "AAAAAA" })).toMatchObject({ ok: false, code: "ROOM_FULL" });
  });
});

describe("move (M-A)", () => {
  it("moves to a walkable tile and tells everyone, the mover included", () => {
    const owner = online("owner-a", "AAAAAA");
    const visitor = online("visitor", "VVVVVV");
    hub.handle(owner, { type: "join", farmCode: "AAAAAA" });
    hub.handle(visitor, { type: "join", farmCode: "AAAAAA" });

    expect(hub.handle(visitor, { type: "move", x: 3, y: 3 })).toEqual({ ok: true }); // a crop plot tile
    const moved = { type: "player_moved", id: "VVVVVV", x: 3, y: 3 };
    expect(owner.inbox.at(-1)).toEqual(moved);
    expect(visitor.inbox.at(-1)).toEqual(moved);
  });

  it("refuses tiles covered by objects, using the current layout", () => {
    const owner = online("owner-a", "AAAAAA");
    hub.handle(owner, { type: "join", farmCode: "AAAAAA" });
    objects["owner-a"] = [{ objectId: 1, decorationId: "tree", x: 0, y: 0, rotation: 0 }];
    expect(hub.handle(owner, { type: "move", x: 1, y: 1 })).toMatchObject({ ok: false, code: "TILE_BLOCKED" });
    time += MOVE_MIN_INTERVAL_MS;
    expect(hub.handle(owner, { type: "move", x: 2, y: 1 })).toEqual({ ok: true });
  });

  it("limits moves to one per interval", () => {
    const owner = online("owner-a", "AAAAAA");
    hub.handle(owner, { type: "join", farmCode: "AAAAAA" });
    expect(hub.handle(owner, { type: "move", x: 0, y: 0 })).toEqual({ ok: true });
    time += MOVE_MIN_INTERVAL_MS - 1;
    expect(hub.handle(owner, { type: "move", x: 1, y: 0 })).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    time += 1;
    expect(hub.handle(owner, { type: "move", x: 1, y: 0 })).toEqual({ ok: true });
  });

  it("needs a room for moves and emotes", () => {
    const visitor = online("visitor", "VVVVVV");
    expect(hub.handle(visitor, { type: "move", x: 0, y: 0 })).toMatchObject({ ok: false, code: "NOT_IN_ROOM" });
    expect(hub.handle(visitor, { type: "emote", emote: "wave" })).toMatchObject({ ok: false, code: "NOT_IN_ROOM" });
  });

  it("puts a player who rejoins back on the entry tile", () => {
    const owner = online("owner-a", "AAAAAA");
    hub.handle(owner, { type: "join", farmCode: "AAAAAA" });
    hub.handle(owner, { type: "move", x: 0, y: 0 });
    hub.handle(owner, { type: "leave" });
    hub.handle(owner, { type: "join", farmCode: "AAAAAA" });
    const snapshot = owner.inbox.at(-1);
    expect(snapshot?.type === "room" && [snapshot.players[0]?.x, snapshot.players[0]?.y]).toEqual([3, 7]);
  });
});

describe("emote", () => {
  it("tells everyone and limits emotes to one per second", () => {
    const owner = online("owner-a", "AAAAAA");
    const visitor = online("visitor", "VVVVVV");
    hub.handle(owner, { type: "join", farmCode: "AAAAAA" });
    hub.handle(visitor, { type: "join", farmCode: "AAAAAA" });
    expect(hub.handle(visitor, { type: "emote", emote: "heart" })).toEqual({ ok: true });
    expect(owner.inbox.at(-1)).toEqual({ type: "player_emote", id: "VVVVVV", emote: "heart" });
    expect(hub.handle(visitor, { type: "emote", emote: "wave" })).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    time += EMOTE_MIN_INTERVAL_MS;
    expect(hub.handle(visitor, { type: "emote", emote: "wave" })).toEqual({ ok: true });
  });
});

describe("leave, disconnect and replaced connections", () => {
  it("tells the others when a player leaves or disconnects, and drops empty rooms", () => {
    const owner = online("owner-a", "AAAAAA");
    const visitor = online("visitor", "VVVVVV");
    hub.handle(owner, { type: "join", farmCode: "AAAAAA" });
    hub.handle(visitor, { type: "join", farmCode: "AAAAAA" });
    hub.disconnect(visitor);
    expect(owner.inbox.at(-1)).toEqual({ type: "player_left", id: "VVVVVV" });
    hub.handle(owner, { type: "leave" });
    expect(hub.roomMembers("AAAAAA")).toEqual([]);
  });

  it("lets a newer connection of the same player take over without the old one removing it", () => {
    const owner = online("owner-a", "AAAAAA");
    const older = online("visitor", "VVVVVV");
    hub.handle(owner, { type: "join", farmCode: "AAAAAA" });
    hub.handle(older, { type: "join", farmCode: "AAAAAA" });
    const newer = online("visitor", "VVVVVV");
    hub.handle(newer, { type: "join", farmCode: "AAAAAA" });
    hub.disconnect(older);
    expect(hub.roomMembers("AAAAAA")).toEqual(["AAAAAA", "VVVVVV"]);
    expect(hub.handle(newer, { type: "move", x: 0, y: 0 })).toEqual({ ok: true });
    expect(hub.onlinePlayers("owner-a", 20)).toEqual([{ farmCode: "VVVVVV", name: "Farmer 0001" }]);
  });
});

describe("appearance and online list", () => {
  it("pushes appearance changes to the room the player is in", () => {
    const owner = online("owner-a", "AAAAAA");
    const visitor = online("visitor", "VVVVVV");
    hub.handle(owner, { type: "join", farmCode: "AAAAAA" });
    hub.handle(visitor, { type: "join", farmCode: "AAAAAA" });
    const look = { ...DEFAULT_APPEARANCE, hair: "hair_long_black" as const };
    hub.appearanceChanged("visitor", look);
    expect(owner.inbox.at(-1)).toEqual({ type: "player_updated", id: "VVVVVV", appearance: look });
    // Later snapshots carry the new look.
    const late = online("late", "LLLLLL");
    hub.handle(late, { type: "join", farmCode: "AAAAAA" });
    const snapshot = late.inbox[0];
    expect(snapshot?.type === "room" && snapshot.players.find((player) => player.id === "VVVVVV")?.appearance).toEqual(look);
    hub.appearanceChanged("nobody", look); // not online: ignored
  });

  it("lists online players newest first, without the caller, up to the limit", () => {
    online("p1", "AAAAAA");
    online("p2", "BBBBBB");
    online("p3", "CCCCCC");
    expect(hub.onlinePlayers("p2", 20).map((player) => player.farmCode)).toEqual(["CCCCCC", "AAAAAA"]);
    expect(hub.onlinePlayers("nobody", 2).map((player) => player.farmCode)).toEqual(["CCCCCC", "BBBBBB"]);
  });
});
