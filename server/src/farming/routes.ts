/**
 * Farming HTTP API (Phase 1, Phase 2 quests):
 *
 *   POST /api/session              create a guest player (no auth)
 *   GET  /api/farm                 current farm state (with level and active quest)
 *   POST /api/farm/plant           { requestId, plotIndex, cropId }
 *   POST /api/farm/harvest         { requestId, plotIndex }
 *   POST /api/farm/refill-seeds    { requestId }
 *   POST /api/quests/claim         { requestId }  claims the active quest
 *   POST /api/farm/objects/place   { requestId, decorationId, x, y, rotation }
 *   POST /api/farm/objects/move    { requestId, objectId, x, y }
 *   POST /api/farm/objects/rotate  { requestId, objectId, rotation }
 *   POST /api/farm/objects/remove  { requestId, objectId }
 *   POST /api/shop/buy             { requestId, decorationId }  one decoration, server price
 *
 * The server is authoritative: the player comes from the Bearer token, time
 * from the server clock, and every rule from ./rules.ts, ./progression.ts and
 * ../building/rules.ts (object IDs, ownership, bounds, overlap).
 * Each state-changing action runs in one transaction: check the action log,
 * load the farm, quest and building state, apply the rule, save what the
 * rule changed, record the
 * result. Quest progress from a plant or harvest is saved in that same
 * transaction. Only successful actions are recorded, so replaying the same
 * request ID returns the stored result without applying the action twice;
 * reusing it for a different action or body is rejected. Any error inside
 * the transaction rolls everything back.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  FARM_HARVEST_PATH,
  FARM_PATH,
  FARM_PLANT_PATH,
  FARM_REFILL_SEEDS_PATH,
  OBJECT_MOVE_PATH,
  OBJECT_PLACE_PATH,
  OBJECT_REMOVE_PATH,
  OBJECT_ROTATE_PATH,
  QUEST_CLAIM_PATH,
  SESSION_PATH,
  SHOP_BUY_PATH,
  isBuyDecorationRequest,
  isHarvestRequest,
  isMoveObjectRequest,
  isPlaceObjectRequest,
  isPlantRequest,
  isQuestClaimRequest,
  isRefillSeedsRequest,
  isRemoveObjectRequest,
  isRotateObjectRequest,
  type BuyDecorationResponse,
  type ObjectActionResponse,
  type QuestClaimResponse,
} from "@farmverse/shared/api";
import type { ErrorCode, ErrorPayload } from "@farmverse/shared/errors";
import { authenticate, createSession } from "../players/session.js";
import { transaction, type Database } from "../storage/database.js";
import {
  findAction,
  insertAction,
  loadBuilding,
  loadFarm,
  loadQuestState,
  saveBuilding,
  saveFarm,
  saveQuestState,
} from "../storage/farmStore.js";
import {
  moveObject,
  placeDecoration,
  removeObject,
  rotateObject,
  type BuildingData,
  type BuildingError,
  type BuildingResult,
} from "../building/rules.js";
import { buyDecoration, type ShopError } from "../building/shop.js";
import { claimQuest, type QuestError } from "./progression.js";
import { recordQuestEvent, type QuestState } from "./quests.js";
import {
  harvest,
  isSeedRefillEligible,
  plant,
  refillSeeds,
  toFarmState,
  type FarmData,
  type RuleError,
} from "./rules.js";

/** Error codes returned by this API and their HTTP status (decision B-1). */
const HTTP_STATUS: Partial<Record<ErrorCode, number>> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  PLOT_NOT_EMPTY: 409,
  PLOT_EMPTY: 409,
  CROP_NOT_READY: 409,
  ITEM_NOT_OWNED: 409,
  REFILL_NOT_ALLOWED: 409,
  LEVEL_TOO_LOW: 409,
  QUEST_NOT_COMPLETE: 409,
  PLACEMENT_INVALID: 409,
  OBJECT_NOT_FOUND: 409,
  INSUFFICIENT_CURRENCY: 409,
  REQUEST_ID_REUSED: 409,
};

type ActionError = RuleError | QuestError | BuildingError | ShopError;

const ERROR_MESSAGES: Record<ActionError, string> = {
  PLOT_NOT_EMPTY: "This plot already has a crop",
  PLOT_EMPTY: "This plot has no crop",
  CROP_NOT_READY: "This crop is not ready yet",
  ITEM_NOT_OWNED: "No seeds left for this crop",
  REFILL_NOT_ALLOWED: "Seeds cannot be refilled yet",
  LEVEL_TOO_LOW: "Your level is too low for this",
  QUEST_NOT_COMPLETE: "There is no completed quest to claim",
  PLACEMENT_INVALID: "This object cannot be placed there",
  OBJECT_NOT_FOUND: "There is no such object on your farm",
  INSUFFICIENT_CURRENCY: "Not enough coins",
};

/** Small JSON bodies only: the largest valid request is well under 200 bytes. */
const BODY_LIMIT = 1024;

type ActionName =
  | "plant"
  | "harvest"
  | "refill-seeds"
  | "quest-claim"
  | "object-place"
  | "object-move"
  | "object-rotate"
  | "object-remove"
  | "shop-buy";

/** On success, only the parts of the state that are returned are saved. */
type ActionResult =
  | { ok: true; farm?: FarmData; quests?: QuestState; building?: BuildingData; body: unknown }
  | { ok: false; error: ActionError };

/** Loaded state passed to an action. */
interface PlayerState {
  farm: FarmData;
  quests: QuestState;
  building: BuildingData;
}

interface ActionOutcome {
  ok: boolean;
  status: number;
  body: unknown;
}

export interface FarmRoutesOptions {
  db: Database;
  /** Server clock in ms; injectable for tests. */
  now: () => number;
}

function sendError(reply: FastifyReply, code: ErrorCode, message: string): FastifyReply {
  const body: ErrorPayload = { code, message };
  return reply.code(HTTP_STATUS[code] ?? 500).send(body);
}

export function registerFarmRoutes(app: FastifyInstance, { db, now }: FarmRoutesOptions): void {
  /** Resolves the player from the Bearer token, or sends 401. */
  function requirePlayer(request: FastifyRequest, reply: FastifyReply): string | null {
    const playerId = authenticate(db, request.headers.authorization);
    if (playerId === null) {
      void sendError(reply, "UNAUTHORIZED", "Missing or invalid session token");
    }
    return playerId;
  }

  /** Loads the authenticated player's farm; a missing farm is a server fault. */
  function requireFarm(playerId: string): FarmData {
    const farm = loadFarm(db, playerId);
    if (farm === null) throw new Error(`No farm for authenticated player ${playerId}`);
    return farm;
  }

  /** Loads the authenticated player's quest state; a missing row is a server fault. */
  function requireQuests(playerId: string): QuestState {
    const quests = loadQuestState(db, playerId);
    if (quests === null) throw new Error(`No quest state for authenticated player ${playerId}`);
    return quests;
  }

  /** Loads the authenticated player's building state; a missing row is a server fault. */
  function requireBuilding(playerId: string): BuildingData {
    const building = loadBuilding(db, playerId);
    if (building === null) throw new Error(`No building state for authenticated player ${playerId}`);
    return building;
  }

  /**
   * Runs a state-changing action with request-ID idempotency in one transaction.
   * `apply` returns the rule result and, on success, the response body.
   */
  function runAction(
    request: FastifyRequest,
    playerId: string,
    action: ActionName,
    requestId: string,
    requestJson: string,
    apply: (state: PlayerState, time: number) => ActionResult,
  ): ActionOutcome {
    const time = now();
    const outcome = transaction(db, (): ActionOutcome => {
      const previous = findAction(db, playerId, requestId);
      if (previous !== null) {
        if (previous.action === action && previous.requestJson === requestJson) {
          return { ok: true, status: 200, body: JSON.parse(previous.responseJson) as unknown };
        }
        return {
          ok: false,
          status: 409,
          body: { code: "REQUEST_ID_REUSED", message: "This request ID was already used for another action" },
        };
      }

      const state = { farm: requireFarm(playerId), quests: requireQuests(playerId), building: requireBuilding(playerId) };
      const result = apply(state, time);
      if (!result.ok) {
        return { ok: false, status: 409, body: { code: result.error, message: ERROR_MESSAGES[result.error] } };
      }

      if (result.farm !== undefined) saveFarm(db, playerId, result.farm);
      if (result.quests !== undefined) saveQuestState(db, playerId, result.quests);
      if (result.building !== undefined) saveBuilding(db, playerId, result.building);
      insertAction(
        db,
        playerId,
        requestId,
        { action, requestJson, responseJson: JSON.stringify(result.body) },
        time,
      );
      return { ok: true, status: 200, body: result.body };
    });

    // Action log (TECHNICAL_ARCHITECTURE.md §19). Never includes the token.
    const code = outcome.ok ? "OK" : (outcome.body as ErrorPayload).code;
    request.log.info({ playerId, action, requestId, result: code }, "Farm action");
    return outcome;
  }

  app.post(SESSION_PATH, { bodyLimit: BODY_LIMIT }, (request, reply) => {
    const session = createSession(db, now());
    request.log.info({ playerId: session.playerId }, "Guest session created");
    return reply.code(201).send(session);
  });

  app.get(FARM_PATH, (request, reply) => {
    const playerId = requirePlayer(request, reply);
    if (playerId === null) return reply;
    return reply.send(toFarmState(requireFarm(playerId), requireQuests(playerId), requireBuilding(playerId), now()));
  });

  app.post(FARM_PLANT_PATH, { bodyLimit: BODY_LIMIT }, (request, reply) => {
    const playerId = requirePlayer(request, reply);
    if (playerId === null) return reply;
    if (!isPlantRequest(request.body)) return sendError(reply, "INVALID_REQUEST", "Invalid plant request");

    const { requestId, plotIndex, cropId } = request.body;
    const outcome = runAction(
      request,
      playerId,
      "plant",
      requestId,
      JSON.stringify({ requestId, plotIndex, cropId }),
      ({ farm, quests, building }, time) => {
        const result = plant(farm, plotIndex, cropId, time);
        if (!result.ok) return result;
        const nextQuests = recordQuestEvent(quests, { kind: "plant", cropId });
        return {
          ok: true,
          farm: result.farm,
          quests: nextQuests,
          body: toFarmState(result.farm, nextQuests, building, time),
        };
      },
    );
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post(FARM_HARVEST_PATH, { bodyLimit: BODY_LIMIT }, (request, reply) => {
    const playerId = requirePlayer(request, reply);
    if (playerId === null) return reply;
    if (!isHarvestRequest(request.body)) return sendError(reply, "INVALID_REQUEST", "Invalid harvest request");

    const { requestId, plotIndex } = request.body;
    const outcome = runAction(
      request,
      playerId,
      "harvest",
      requestId,
      JSON.stringify({ requestId, plotIndex }),
      ({ farm, quests, building }, time) => {
        const cropId = farm.plots[plotIndex]?.cropId;
        const result = harvest(farm, plotIndex, time);
        if (!result.ok) return result;
        // A successful harvest always had a crop on the plot.
        const nextQuests = recordQuestEvent(quests, { kind: "harvest", cropId: cropId! });
        return {
          ok: true,
          farm: result.farm,
          quests: nextQuests,
          body: {
            ...toFarmState(result.farm, nextQuests, building, time),
            harvested: result.harvested,
            reward: result.reward,
          },
        };
      },
    );
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post(FARM_REFILL_SEEDS_PATH, { bodyLimit: BODY_LIMIT }, (request, reply) => {
    const playerId = requirePlayer(request, reply);
    if (playerId === null) return reply;
    if (!isRefillSeedsRequest(request.body)) {
      return sendError(reply, "INVALID_REQUEST", "Invalid refill request");
    }

    const { requestId } = request.body;
    const outcome = runAction(
      request,
      playerId,
      "refill-seeds",
      requestId,
      JSON.stringify({ requestId }),
      ({ farm, quests, building }, time) => {
        if (isSeedRefillEligible(farm) && farm.seedRefillAvailableAt === null) {
          // Unexpected data (P2-5): the refill is allowed immediately.
          request.log.warn({ playerId }, "Seed refill eligible without a recorded cooldown");
        }
        const result = refillSeeds(farm, time);
        return result.ok
          ? { ok: true, farm: result.farm, body: toFarmState(result.farm, quests, building, time) }
          : result;
      },
    );
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post(QUEST_CLAIM_PATH, { bodyLimit: BODY_LIMIT }, (request, reply) => {
    const playerId = requirePlayer(request, reply);
    if (playerId === null) return reply;
    if (!isQuestClaimRequest(request.body)) return sendError(reply, "INVALID_REQUEST", "Invalid quest claim request");

    const { requestId } = request.body;
    const outcome = runAction(
      request,
      playerId,
      "quest-claim",
      requestId,
      JSON.stringify({ requestId }),
      ({ farm, quests, building }, time) => {
        const result = claimQuest(farm, quests);
        if (!result.ok) return result;
        const body: QuestClaimResponse = {
          ...toFarmState(result.farm, result.quests, building, time),
          claimed: { questId: result.quest.id, reward: { ...result.quest.reward } },
        };
        return { ok: true, farm: result.farm, quests: result.quests, body };
      },
    );
    return reply.code(outcome.status).send(outcome.body);
  });

  /** Runs an object action; the body is the new state plus the object acted on. */
  function runObjectAction(
    request: FastifyRequest,
    playerId: string,
    action: ActionName,
    requestId: string,
    requestJson: string,
    apply: (building: BuildingData) => BuildingResult<{ object: ObjectActionResponse["object"] }>,
  ): ActionOutcome {
    return runAction(request, playerId, action, requestId, requestJson, ({ farm, quests, building }, time) => {
      const result = apply(building);
      if (!result.ok) return result;
      const body: ObjectActionResponse = {
        ...toFarmState(farm, quests, result.building, time),
        object: { ...result.object },
      };
      return { ok: true, building: result.building, body };
    });
  }

  app.post(OBJECT_PLACE_PATH, { bodyLimit: BODY_LIMIT }, (request, reply) => {
    const playerId = requirePlayer(request, reply);
    if (playerId === null) return reply;
    if (!isPlaceObjectRequest(request.body)) return sendError(reply, "INVALID_REQUEST", "Invalid place request");

    const { requestId, decorationId, x, y, rotation } = request.body;
    const outcome = runObjectAction(
      request,
      playerId,
      "object-place",
      requestId,
      JSON.stringify({ requestId, decorationId, x, y, rotation }),
      (building) => placeDecoration(building, { decorationId, x, y, rotation }),
    );
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post(OBJECT_MOVE_PATH, { bodyLimit: BODY_LIMIT }, (request, reply) => {
    const playerId = requirePlayer(request, reply);
    if (playerId === null) return reply;
    if (!isMoveObjectRequest(request.body)) return sendError(reply, "INVALID_REQUEST", "Invalid move request");

    const { requestId, objectId, x, y } = request.body;
    const outcome = runObjectAction(
      request,
      playerId,
      "object-move",
      requestId,
      JSON.stringify({ requestId, objectId, x, y }),
      (building) => moveObject(building, objectId, { x, y }),
    );
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post(OBJECT_ROTATE_PATH, { bodyLimit: BODY_LIMIT }, (request, reply) => {
    const playerId = requirePlayer(request, reply);
    if (playerId === null) return reply;
    if (!isRotateObjectRequest(request.body)) return sendError(reply, "INVALID_REQUEST", "Invalid rotate request");

    const { requestId, objectId, rotation } = request.body;
    const outcome = runObjectAction(
      request,
      playerId,
      "object-rotate",
      requestId,
      JSON.stringify({ requestId, objectId, rotation }),
      (building) => rotateObject(building, objectId, rotation),
    );
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post(OBJECT_REMOVE_PATH, { bodyLimit: BODY_LIMIT }, (request, reply) => {
    const playerId = requirePlayer(request, reply);
    if (playerId === null) return reply;
    if (!isRemoveObjectRequest(request.body)) return sendError(reply, "INVALID_REQUEST", "Invalid remove request");

    const { requestId, objectId } = request.body;
    const outcome = runObjectAction(
      request,
      playerId,
      "object-remove",
      requestId,
      JSON.stringify({ requestId, objectId }),
      (building) => removeObject(building, objectId),
    );
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post(SHOP_BUY_PATH, { bodyLimit: BODY_LIMIT }, (request, reply) => {
    const playerId = requirePlayer(request, reply);
    if (playerId === null) return reply;
    if (!isBuyDecorationRequest(request.body)) return sendError(reply, "INVALID_REQUEST", "Invalid buy request");

    const { requestId, decorationId } = request.body;
    const outcome = runAction(
      request,
      playerId,
      "shop-buy",
      requestId,
      JSON.stringify({ requestId, decorationId }),
      ({ farm, quests, building }, time) => {
        const result = buyDecoration(farm, building, decorationId);
        if (!result.ok) return result;
        const body: BuyDecorationResponse = {
          ...toFarmState(result.farm, quests, result.building, time),
          bought: { decorationId, price: result.price },
        };
        return { ok: true, farm: result.farm, building: result.building, body };
      },
    );
    return reply.code(outcome.status).send(outcome.body);
  });
}
