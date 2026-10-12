/**
 * Shared presence rules for multiplayer farm rooms (Phase 5, Step 5.1).
 *
 * Design: docs/reports/phase5/PHASE5_MULTIPLAYER_PLAN_REPORT.md, approved by
 * the Game Director 2026-10-12 (R-A every farm is a room, visitors only look;
 * F-A online list + farm code; M-A tap-to-move on the 8×8 farm grid; N-A
 * generated display names). Values are provisional.
 *
 * - Every player has a public farm code (6 characters, no look-alike
 *   characters) and a generated display name "Farmer NNNN". The farm code is
 *   the public ID of the player in rooms; the player ID and token stay private.
 * - Characters stand on grid tiles. A tile is walkable when it is inside the
 *   grid and not covered by a placed object; crop plot tiles are walkable.
 * - Positions live in server memory only. A player entering a room appears on
 *   the entry tile: the free tile of the bottom row nearest the middle.
 * - Emotes are a fixed set, shown for a few seconds and never stored.
 *
 * The server owns positions and room membership and checks every move.
 */
import {
  FARM_GRID_HEIGHT,
  FARM_GRID_WIDTH,
  areasOverlap,
  footprint,
  isGridPosition,
  type GridPosition,
  type PlacedObject,
} from "./building.js";

/** Characters a farm code is made of: A–Z and 2–9 without I, O, 0 and 1. */
export const FARM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const FARM_CODE_LENGTH = 6;

const FARM_CODE = new RegExp(`^[${FARM_CODE_ALPHABET}]{${FARM_CODE_LENGTH}}$`);
const DISPLAY_NAME = /^Farmer \d{4}$/;

export const EMOTES = ["wave", "heart", "laugh", "thumbs_up"] as const;
export type Emote = (typeof EMOTES)[number];

/** Shortest time between two accepted moves of one player (8 per second). */
export const MOVE_MIN_INTERVAL_MS = 125;
/** Shortest time between two accepted emotes of one player. */
export const EMOTE_MIN_INTERVAL_MS = 1000;
/** How long clients show an emote. */
export const EMOTE_DURATION_MS = 3000;
/** Most players in one farm room, owner included. */
export const MAX_ROOM_PLAYERS = 20;
/** Most entries in the "online" list. */
export const ONLINE_LIST_LIMIT = 20;

export function isFarmCode(value: unknown): value is string {
  return typeof value === "string" && FARM_CODE.test(value);
}

/** Normalises what a player typed (case, spaces) to a farm code, or returns undefined. */
export function parseFarmCode(input: string): string | undefined {
  const code = input.replace(/\s+/g, "").toUpperCase();
  return isFarmCode(code) ? code : undefined;
}

export function isDisplayName(value: unknown): value is string {
  return typeof value === "string" && DISPLAY_NAME.test(value);
}

export function isEmote(value: unknown): value is Emote {
  return typeof value === "string" && (EMOTES as readonly string[]).includes(value);
}

/** True when `tile` is inside the grid and not covered by any of `objects`. */
export function isWalkable(objects: readonly PlacedObject[], tile: unknown): tile is GridPosition {
  if (!isGridPosition(tile)) return false;
  const cell = { x: tile.x, y: tile.y, width: 1, height: 1 };
  return !objects.some((object) => areasOverlap(footprint(object), cell));
}

/** Column order from the middle outwards: 3, 4, 2, 5, 1, 6, 0, 7. */
const COLUMNS_FROM_MIDDLE: readonly number[] = Array.from({ length: FARM_GRID_WIDTH }, (_, index) => {
  const left = FARM_GRID_WIDTH / 2 - 1;
  return index % 2 === 0 ? left - index / 2 : left + 1 + (index - 1) / 2;
});

/**
 * Where a player entering the room appears: the walkable tile nearest the
 * middle of the bottom row, then of the rows above it. A tile always exists,
 * because crop plot tiles can never be covered by objects (building.ts).
 */
export function entryTile(objects: readonly PlacedObject[]): GridPosition {
  for (let y = FARM_GRID_HEIGHT - 1; y >= 0; y--) {
    for (const x of COLUMNS_FROM_MIDDLE) {
      if (isWalkable(objects, { x, y })) return { x, y };
    }
  }
  throw new RangeError("No walkable tile on the farm");
}
