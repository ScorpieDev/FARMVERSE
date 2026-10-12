/**
 * Farm room helpers for the client (Phase 5, Step 5.4). Pure functions.
 *
 * The client mirrors what the server says about a room: who is there, on
 * which tile, and which emote is showing. It never moves anyone itself: a tap
 * becomes a `move` request, and characters change tile only when the server
 * answers `player_moved`. Walkability is checked locally only to explain a
 * refusal early; the server checks again (TILE_BLOCKED).
 */
import type { OnlinePlayer } from "@farmverse/shared/api";
import type { GridPosition, PlacedObject } from "@farmverse/shared/building";
import type { ErrorCode } from "@farmverse/shared/errors";
import { EMOTES, EMOTE_DURATION_MS, isWalkable, type Emote } from "@farmverse/shared/presence";
import type { PresencePlayer, ServerMessage } from "@farmverse/shared/protocol";

export interface RoomView {
  farmCode: string;
  /** In the order the server listed them, newcomers last. */
  players: PresencePlayer[];
  /** Emote showing above each player, until a server-clock-free local time (ms). */
  emotes: Record<string, { emote: Emote; until: number }>;
}

export type RoomIntent = { kind: "move"; x: number; y: number } | { kind: "message"; text: string } | { kind: "none" };

export const EMOTE_ORDER: readonly Emote[] = EMOTES;

const EMOTE_BUTTON: Record<Emote, string> = { wave: "Wave", heart: "Heart", laugh: "Laugh", thumbs_up: "Like" };
/** Plain characters, so every phone font can draw them. */
const EMOTE_BUBBLE: Record<Emote, string> = { wave: "Hi!", heart: "<3", laugh: "Haha!", thumbs_up: "+1" };

export function emoteButtonLabel(emote: Emote): string {
  return EMOTE_BUTTON[emote];
}

export function emoteBubble(emote: Emote): string {
  return EMOTE_BUBBLE[emote];
}

/** Applies one server message to the room being shown; other messages leave it unchanged. */
export function applyRoomMessage(view: RoomView | null, message: ServerMessage, now: number): RoomView | null {
  if (message.type === "room") {
    return { farmCode: message.farmCode, players: message.players.map((player) => ({ ...player })), emotes: {} };
  }
  if (view === null) return null;
  switch (message.type) {
    case "player_joined": {
      const others = view.players.filter((player) => player.id !== message.player.id);
      return { ...view, players: [...others, { ...message.player }] };
    }
    case "player_left": {
      const emotes = { ...view.emotes };
      delete emotes[message.id];
      return { ...view, players: view.players.filter((player) => player.id !== message.id), emotes };
    }
    case "player_moved":
      return {
        ...view,
        players: view.players.map((player) => (player.id === message.id ? { ...player, x: message.x, y: message.y } : player)),
      };
    case "player_emote":
      if (!view.players.some((player) => player.id === message.id)) return view;
      return { ...view, emotes: { ...view.emotes, [message.id]: { emote: message.emote, until: now + EMOTE_DURATION_MS } } };
    case "player_updated":
      return {
        ...view,
        players: view.players.map((player) => (player.id === message.id ? { ...player, appearance: { ...message.appearance } } : player)),
      };
    default:
      return view;
  }
}

/** The emote showing above a player at local time `now`, if any. */
export function activeEmote(view: RoomView, id: string, now: number): Emote | undefined {
  const shown = view.emotes[id];
  return shown !== undefined && now < shown.until ? shown.emote : undefined;
}

/** Tapping a tile of the room's farm: ask the server to walk there. */
export function tapRoomTile(view: RoomView, myFarmCode: string, objects: readonly PlacedObject[], tile: GridPosition): RoomIntent {
  const me = view.players.find((player) => player.id === myFarmCode);
  if (me === undefined) return { kind: "message", text: "Joining the farm…" };
  if (me.x === tile.x && me.y === tile.y) return { kind: "none" };
  if (!isWalkable(objects, tile)) return { kind: "message", text: "Something is in the way." };
  return { kind: "move", x: tile.x, y: tile.y };
}

/** Animation time for a walk between two tiles (the server has already accepted it). */
export function walkDurationMs(from: GridPosition, to: GridPosition): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.round(Math.min(600, Math.max(120, distance * 120)));
}

/** Header line of the room screen. */
export function roomTitle(view: RoomView | null, myFarmCode: string, ownerName: string | undefined): string {
  if (view === null) return "Joining the farm…";
  const others = view.players.length - 1;
  const company = others <= 0 ? "nobody else here" : others === 1 ? "1 other player here" : `${others} other players here`;
  const whose = view.farmCode === myFarmCode ? "Your farm" : `${ownerName ?? "Farmer"}'s farm`;
  return `${whose} (${view.farmCode}) · ${company}`;
}

/**
 * Label under a character on the grid, which must fit a 44 CSS px tile:
 * "You" for the player, "#NNNN" for "Farmer NNNN" (full names are in the
 * title and the online list).
 */
export function gridLabel(player: { id: string; name: string }, myFarmCode: string | undefined): string {
  if (player.id === myFarmCode) return "You";
  return player.name.replace(/^Farmer /, "#");
}

/** Label of an entry in the online list. */
export function onlineLabel(player: OnlinePlayer): string {
  return `${player.name} · ${player.farmCode}`;
}

const ROOM_ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  ROOM_NOT_FOUND: "No farm has that code.",
  ROOM_FULL: "That farm is full right now. Try again later.",
  NOT_IN_ROOM: "You are not on a farm any more. Pick one again.",
  TILE_BLOCKED: "Something is in the way.",
  RATE_LIMITED: "Slow down a little.",
};

/** Text for a room error from the server, or undefined for errors that are not about rooms. */
export function roomErrorText(code: ErrorCode): string | undefined {
  return ROOM_ERROR_TEXT[code];
}
