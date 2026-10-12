/**
 * Farm rooms and presence (Phase 5, Step 5.3; decisions R-A every farm is a
 * room, F-A online list + farm code, M-A tap-to-move).
 *
 * Kept in server memory only (single server process). A room is identified
 * by the farm owner's farm code and exists while someone is in it; visitors
 * can enter the room of an offline owner. Every member is shown by public
 * farm code, display name, appearance and tile.
 *
 * Rules, all decided here:
 * - join: unknown farm code → ROOM_NOT_FOUND; MAX_ROOM_PLAYERS → ROOM_FULL;
 *   joining leaves the current room first; the newcomer appears on the
 *   entry tile and receives a `room` snapshot, the others `player_joined`;
 * - move: only inside a room (NOT_IN_ROOM), at most one per
 *   MOVE_MIN_INTERVAL_MS (RATE_LIMITED), only to a walkable tile of the
 *   farm's current layout (TILE_BLOCKED); everyone in the room, mover
 *   included, receives `player_moved`;
 * - emote: inside a room, at most one per EMOTE_MIN_INTERVAL_MS;
 * - leave / disconnect: the others receive `player_left`;
 * - appearance changes (HTTP equip) are pushed as `player_updated`.
 *
 * The hub never touches sockets: each connection supplies `send`.
 */
import type { PlacedObject } from "@farmverse/shared/building";
import type { CharacterAppearance } from "@farmverse/shared/character";
import type { ErrorCode } from "@farmverse/shared/errors";
import {
  EMOTE_MIN_INTERVAL_MS,
  MAX_ROOM_PLAYERS,
  MOVE_MIN_INTERVAL_MS,
  entryTile,
  isWalkable,
  type Emote,
} from "@farmverse/shared/presence";
import type { OnlinePlayer } from "@farmverse/shared/api";
import type { PresencePlayer, ServerMessage } from "@farmverse/shared/protocol";
import type { PlayerProfile } from "../players/profile.js";

/** What the hub needs from storage and the clock. */
export interface HubDeps {
  /** Player ID of the owner of `farmCode`, or null. */
  findFarmOwner(farmCode: string): string | null;
  /** Current placed objects of a player's farm (walkability). */
  loadObjects(playerId: string): readonly PlacedObject[];
  loadAppearance(playerId: string): CharacterAppearance;
  now(): number;
}

/** One authenticated realtime connection. */
export interface HubConnection {
  playerId: string;
  profile: PlayerProfile;
  send(message: ServerMessage): void;
}

export type RoomRequest =
  | { type: "join"; farmCode: string }
  | { type: "leave" }
  | { type: "move"; x: number; y: number }
  | { type: "emote"; emote: Emote };

/** An error for the sender, or nothing (the effects were sent already). */
export type RoomOutcome = { ok: true } | { ok: false; code: ErrorCode; message: string };

interface Member {
  connection: HubConnection;
  player: PresencePlayer;
  lastMoveAt: number;
  lastEmoteAt: number;
}

interface Room {
  ownerId: string;
  /** By player ID. */
  members: Map<string, Member>;
}

const OK: RoomOutcome = { ok: true };

function refuse(code: ErrorCode, message: string): RoomOutcome {
  return { ok: false, code, message };
}

export class PresenceHub {
  /** Rooms by farm code; removed when empty. */
  private readonly rooms = new Map<string, Room>();
  /** Room farm code of each connection. */
  private readonly roomOf = new Map<HubConnection, string>();
  /** Live connection of each player, in connection order (Map keeps insertion order). */
  private readonly online = new Map<string, HubConnection>();

  constructor(private readonly deps: HubDeps) {}

  /** Registers an authenticated connection (it is not in a room yet). */
  connect(connection: HubConnection): void {
    this.online.delete(connection.playerId);
    this.online.set(connection.playerId, connection);
  }

  /** Removes a closed connection from its room and from the online list. */
  disconnect(connection: HubConnection): void {
    this.leaveRoom(connection);
    if (this.online.get(connection.playerId) === connection) this.online.delete(connection.playerId);
  }

  handle(connection: HubConnection, request: RoomRequest): RoomOutcome {
    switch (request.type) {
      case "join":
        return this.join(connection, request.farmCode);
      case "leave":
        this.leaveRoom(connection);
        return OK;
      case "move":
        return this.move(connection, request.x, request.y);
      case "emote":
        return this.emote(connection, request.emote);
    }
  }

  /** Pushes a new appearance to the room the player is in, if any. */
  appearanceChanged(playerId: string, appearance: CharacterAppearance): void {
    const connection = this.online.get(playerId);
    const member = connection === undefined ? undefined : this.memberOf(connection);
    if (connection === undefined || member === undefined) return;
    member.player = { ...member.player, appearance: { ...appearance } };
    this.broadcast(this.roomOf.get(connection)!, { type: "player_updated", id: member.player.id, appearance: { ...appearance } });
  }

  /** Online players, most recently connected first, without `exceptPlayerId`. */
  onlinePlayers(exceptPlayerId: string, limit: number): OnlinePlayer[] {
    return [...this.online.values()]
      .reverse()
      .filter((connection) => connection.playerId !== exceptPlayerId)
      .slice(0, limit)
      .map((connection) => ({ farmCode: connection.profile.farmCode, name: connection.profile.name }));
  }

  /** Farm codes of the members of a room (tests and diagnostics). */
  roomMembers(farmCode: string): string[] {
    return [...(this.rooms.get(farmCode)?.members.values() ?? [])].map((member) => member.player.id);
  }

  private join(connection: HubConnection, farmCode: string): RoomOutcome {
    const ownerId = this.deps.findFarmOwner(farmCode);
    if (ownerId === null) return refuse("ROOM_NOT_FOUND", "There is no farm with that code");
    const room = this.rooms.get(farmCode);
    if (room !== undefined && !room.members.has(connection.playerId) && room.members.size >= MAX_ROOM_PLAYERS) {
      return refuse("ROOM_FULL", "This farm is full");
    }

    this.leaveRoom(connection);
    const target = this.rooms.get(farmCode) ?? { ownerId, members: new Map<string, Member>() };
    this.rooms.set(farmCode, target);
    // A stale member of the same player (older connection not closed yet) is replaced silently.
    const stale = target.members.get(connection.playerId);
    if (stale !== undefined) this.roomOf.delete(stale.connection);

    const tile = entryTile(this.deps.loadObjects(ownerId));
    const player: PresencePlayer = {
      id: connection.profile.farmCode,
      name: connection.profile.name,
      appearance: { ...this.deps.loadAppearance(connection.playerId) },
      x: tile.x,
      y: tile.y,
    };
    target.members.set(connection.playerId, { connection, player, lastMoveAt: -Infinity, lastEmoteAt: -Infinity });
    this.roomOf.set(connection, farmCode);

    connection.send({ type: "room", farmCode, players: [...target.members.values()].map((member) => ({ ...member.player })) });
    this.broadcast(farmCode, { type: "player_joined", player: { ...player } }, connection.playerId);
    return OK;
  }

  private move(connection: HubConnection, x: number, y: number): RoomOutcome {
    const member = this.memberOf(connection);
    if (member === undefined) return refuse("NOT_IN_ROOM", "Join a farm first");
    const now = this.deps.now();
    if (now - member.lastMoveAt < MOVE_MIN_INTERVAL_MS) return refuse("RATE_LIMITED", "Moving too fast");
    const farmCode = this.roomOf.get(connection)!;
    const room = this.rooms.get(farmCode)!;
    if (!isWalkable(this.deps.loadObjects(room.ownerId), { x, y })) return refuse("TILE_BLOCKED", "You cannot stand there");
    member.lastMoveAt = now;
    member.player = { ...member.player, x, y };
    this.broadcast(farmCode, { type: "player_moved", id: member.player.id, x, y });
    return OK;
  }

  private emote(connection: HubConnection, emote: Emote): RoomOutcome {
    const member = this.memberOf(connection);
    if (member === undefined) return refuse("NOT_IN_ROOM", "Join a farm first");
    const now = this.deps.now();
    if (now - member.lastEmoteAt < EMOTE_MIN_INTERVAL_MS) return refuse("RATE_LIMITED", "Too many emotes");
    member.lastEmoteAt = now;
    this.broadcast(this.roomOf.get(connection)!, { type: "player_emote", id: member.player.id, emote });
    return OK;
  }

  private memberOf(connection: HubConnection): Member | undefined {
    const farmCode = this.roomOf.get(connection);
    const member = farmCode === undefined ? undefined : this.rooms.get(farmCode)?.members.get(connection.playerId);
    return member?.connection === connection ? member : undefined;
  }

  private leaveRoom(connection: HubConnection): void {
    const farmCode = this.roomOf.get(connection);
    if (farmCode === undefined) return;
    this.roomOf.delete(connection);
    const room = this.rooms.get(farmCode);
    const member = room?.members.get(connection.playerId);
    if (room === undefined || member === undefined || member.connection !== connection) return;
    room.members.delete(connection.playerId);
    if (room.members.size === 0) this.rooms.delete(farmCode);
    else this.broadcast(farmCode, { type: "player_left", id: member.player.id });
  }

  /** Sends to every member of a room, optionally except one player. */
  private broadcast(farmCode: string, message: ServerMessage, exceptPlayerId?: string): void {
    for (const [playerId, member] of this.rooms.get(farmCode)?.members ?? []) {
      if (playerId !== exceptPlayerId) member.connection.send(message);
    }
  }
}
