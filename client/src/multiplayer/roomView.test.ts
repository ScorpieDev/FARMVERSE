import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "@farmverse/shared/character";
import { EMOTE_DURATION_MS } from "@farmverse/shared/presence";
import type { PresencePlayer } from "@farmverse/shared/protocol";
import {
  EMOTE_ORDER,
  activeEmote,
  applyRoomMessage,
  emoteBubble,
  emoteButtonLabel,
  gridLabel,
  onlineLabel,
  roomErrorText,
  roomTitle,
  tapRoomTile,
  walkDurationMs,
  type RoomView,
} from "./roomView.js";

const ME: PresencePlayer = { id: "MEMEME", name: "Farmer 0001", appearance: { ...DEFAULT_APPEARANCE }, x: 3, y: 7 };
const OTHER: PresencePlayer = { id: "OTHER2", name: "Farmer 0002", appearance: { ...DEFAULT_APPEARANCE }, x: 4, y: 7 };
const T = 1_000;

function view(): RoomView {
  return applyRoomMessage(null, { type: "room", farmCode: "OTHER2", players: [ME, OTHER] }, T)!;
}

describe("applyRoomMessage", () => {
  it("starts from a snapshot and ignores player messages before it", () => {
    expect(view()).toEqual({ farmCode: "OTHER2", players: [ME, OTHER], emotes: {} });
    expect(applyRoomMessage(null, { type: "player_moved", id: "MEMEME", x: 0, y: 0 }, T)).toBeNull();
  });

  it("adds, replaces and removes players", () => {
    const newcomer = { ...OTHER, id: "NEW234", name: "Farmer 0003" };
    let next = applyRoomMessage(view(), { type: "player_joined", player: newcomer }, T)!;
    expect(next.players.map((player) => player.id)).toEqual(["MEMEME", "OTHER2", "NEW234"]);
    next = applyRoomMessage(next, { type: "player_joined", player: { ...OTHER, x: 0 } }, T)!;
    expect(next.players.map((player) => [player.id, player.x])).toEqual([["MEMEME", 3], ["NEW234", 4], ["OTHER2", 0]]);
    next = applyRoomMessage(next, { type: "player_left", id: "NEW234" }, T)!;
    expect(next.players.map((player) => player.id)).toEqual(["MEMEME", "OTHER2"]);
  });

  it("moves players and updates appearances", () => {
    let next = applyRoomMessage(view(), { type: "player_moved", id: "OTHER2", x: 1, y: 2 }, T)!;
    expect(next.players[1]).toMatchObject({ x: 1, y: 2 });
    next = applyRoomMessage(next, { type: "player_updated", id: "OTHER2", appearance: { ...DEFAULT_APPEARANCE, skin: "dark" } }, T)!;
    expect(next.players[1]?.appearance.skin).toBe("dark");
  });

  it("shows emotes for EMOTE_DURATION_MS and drops them when the player leaves", () => {
    let next = applyRoomMessage(view(), { type: "player_emote", id: "OTHER2", emote: "heart" }, T)!;
    expect(activeEmote(next, "OTHER2", T + EMOTE_DURATION_MS - 1)).toBe("heart");
    expect(activeEmote(next, "OTHER2", T + EMOTE_DURATION_MS)).toBeUndefined();
    expect(applyRoomMessage(next, { type: "player_emote", id: "GHOST2", emote: "wave" }, T)).toBe(next);
    next = applyRoomMessage(next, { type: "player_left", id: "OTHER2" }, T)!;
    expect(next.emotes).toEqual({});
  });

  it("does not modify its input", () => {
    const before = view();
    const copy = structuredClone(before);
    applyRoomMessage(before, { type: "player_moved", id: "MEMEME", x: 0, y: 0 }, T);
    expect(before).toEqual(copy);
  });
});

describe("tapRoomTile", () => {
  const tree = [{ objectId: 1, decorationId: "tree" as const, x: 0, y: 0, rotation: 0 as const }];

  it("asks the server to walk to a free tile", () => {
    expect(tapRoomTile(view(), "MEMEME", tree, { x: 3, y: 3 })).toEqual({ kind: "move", x: 3, y: 3 });
  });

  it("explains blocked tiles and ignores the current tile", () => {
    expect(tapRoomTile(view(), "MEMEME", tree, { x: 1, y: 1 })).toEqual({ kind: "message", text: "Something is in the way." });
    expect(tapRoomTile(view(), "MEMEME", tree, { x: 3, y: 7 })).toEqual({ kind: "none" });
  });

  it("waits until the player is in the room", () => {
    expect(tapRoomTile(view(), "NOTME2", [], { x: 0, y: 0 }).kind).toBe("message");
  });
});

describe("texts and timing", () => {
  it("labels emotes with plain characters", () => {
    expect(EMOTE_ORDER.map(emoteButtonLabel)).toEqual(["Wave", "Heart", "Laugh", "Like"]);
    expect(EMOTE_ORDER.map(emoteBubble)).toEqual(["Hi!", "<3", "Haha!", "+1"]);
  });

  it("titles own and visited farms", () => {
    expect(roomTitle(null, "MEMEME", undefined)).toBe("Joining the farm…");
    expect(roomTitle(view(), "MEMEME", "Farmer 0002")).toBe("Farmer 0002's farm (OTHER2) · 1 other player here");
    const own = applyRoomMessage(null, { type: "room", farmCode: "MEMEME", players: [ME] }, T)!;
    expect(roomTitle(own, "MEMEME", "Farmer 0001")).toBe("Your farm (MEMEME) · nobody else here");
  });

  it("labels characters on the grid briefly", () => {
    expect(gridLabel(ME, "MEMEME")).toBe("You");
    expect(gridLabel(OTHER, "MEMEME")).toBe("#0002");
  });

  it("labels online players and room errors", () => {
    expect(onlineLabel({ farmCode: "ABC234", name: "Farmer 0042" })).toBe("Farmer 0042 · ABC234");
    expect(roomErrorText("ROOM_FULL")).toMatch(/full/);
    expect(roomErrorText("PLOT_EMPTY")).toBeUndefined();
  });

  it("animates walks between 120 and 600 ms", () => {
    expect(walkDurationMs({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(120);
    expect(walkDurationMs({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(360);
    expect(walkDurationMs({ x: 0, y: 0 }, { x: 7, y: 7 })).toBe(600);
  });
});
