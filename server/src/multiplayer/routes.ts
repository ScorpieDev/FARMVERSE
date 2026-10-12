/**
 * Multiplayer HTTP API (Phase 5, Step 5.3):
 *
 *   GET /api/players/online      players with a live realtime connection
 *   GET /api/farms/:farmCode     a farm as a visitor sees it (P5-1 R-A)
 *
 * Both need a session (Bearer token). The visitor view leaves out everything
 * private to the owner: coins, XP, inventory, quests and unplaced decorations.
 * Realtime presence (who stands where) goes over the WebSocket instead.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  ONLINE_PLAYERS_PATH,
  VISIT_FARM_PATH,
  type OnlinePlayersResponse,
  type VisitedFarm,
} from "@farmverse/shared/api";
import type { ErrorPayload } from "@farmverse/shared/errors";
import { ONLINE_LIST_LIMIT, isFarmCode } from "@farmverse/shared/presence";
import { toFarmState } from "../farming/rules.js";
import { authenticate } from "../players/session.js";
import type { Database } from "../storage/database.js";
import {
  findPlayerIdByFarmCode,
  loadBuilding,
  loadCharacter,
  loadFarm,
  loadProfile,
  loadQuestState,
} from "../storage/farmStore.js";
import type { PresenceHub } from "./hub.js";

export interface MultiplayerRoutesOptions {
  db: Database;
  now: () => number;
  hub: PresenceHub;
}

function sendError(reply: FastifyReply, status: number, body: ErrorPayload): FastifyReply {
  return reply.code(status).send(body);
}

export function registerMultiplayerRoutes(app: FastifyInstance, { db, now, hub }: MultiplayerRoutesOptions): void {
  app.get(ONLINE_PLAYERS_PATH, (request, reply) => {
    const playerId = authenticate(db, request.headers.authorization);
    if (playerId === null) return sendError(reply, 401, { code: "UNAUTHORIZED", message: "Missing or invalid session token" });
    const body: OnlinePlayersResponse = { players: hub.onlinePlayers(playerId, ONLINE_LIST_LIMIT) };
    return reply.send(body);
  });

  app.get<{ Params: { farmCode: string } }>(`${VISIT_FARM_PATH}/:farmCode`, (request, reply) => {
    const playerId = authenticate(db, request.headers.authorization);
    if (playerId === null) return sendError(reply, 401, { code: "UNAUTHORIZED", message: "Missing or invalid session token" });

    const { farmCode } = request.params;
    const ownerId = isFarmCode(farmCode) ? findPlayerIdByFarmCode(db, farmCode) : null;
    if (ownerId === null) return sendError(reply, 404, { code: "ROOM_NOT_FOUND", message: "There is no farm with that code" });

    const farm = loadFarm(db, ownerId);
    const quests = loadQuestState(db, ownerId);
    const building = loadBuilding(db, ownerId);
    const character = loadCharacter(db, ownerId);
    const profile = loadProfile(db, ownerId);
    if (farm === null || quests === null || building === null || character === null || profile === null) {
      throw new Error(`Incomplete data for farm owner ${ownerId}`);
    }
    const state = toFarmState(farm, quests, building, character, now());
    const body: VisitedFarm = {
      serverTime: state.serverTime,
      farmCode: profile.farmCode,
      name: profile.name,
      level: state.progression.level,
      plots: state.plots,
      objects: state.objects,
      appearance: state.character.appearance,
    };
    return reply.send(body);
  });
}
