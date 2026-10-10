/**
 * Farming HTTP API (Phase 1):
 *
 *   POST /api/session              create a guest player (no auth)
 *   GET  /api/farm                 current farm state
 *   POST /api/farm/plant           { requestId, plotIndex, cropId }
 *   POST /api/farm/harvest         { requestId, plotIndex }
 *   POST /api/farm/refill-seeds    { requestId }
 *
 * The server is authoritative: the player comes from the Bearer token, time
 * from the server clock, and every rule from ./rules.ts. Each state-changing
 * action runs in one transaction: check the action log, load the farm, apply
 * the rule, save, record the result. Only successful actions are recorded, so
 * replaying the same request ID returns the stored result without applying
 * the action twice; reusing it for a different action or body is rejected.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  FARM_HARVEST_PATH,
  FARM_PATH,
  FARM_PLANT_PATH,
  FARM_REFILL_SEEDS_PATH,
  SESSION_PATH,
  isHarvestRequest,
  isPlantRequest,
  isRefillSeedsRequest,
} from "@farmverse/shared/api";
import type { ErrorCode, ErrorPayload } from "@farmverse/shared/errors";
import { authenticate, createSession } from "../players/session.js";
import { transaction, type Database } from "../storage/database.js";
import { findAction, insertAction, loadFarm, saveFarm } from "../storage/farmStore.js";
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
  REQUEST_ID_REUSED: 409,
};

const ERROR_MESSAGES: Record<RuleError, string> = {
  PLOT_NOT_EMPTY: "This plot already has a crop",
  PLOT_EMPTY: "This plot has no crop",
  CROP_NOT_READY: "This crop is not ready yet",
  ITEM_NOT_OWNED: "No seeds left for this crop",
  REFILL_NOT_ALLOWED: "Seeds cannot be refilled yet",
};

/** Small JSON bodies only: the largest valid request is well under 200 bytes. */
const BODY_LIMIT = 1024;

type ActionName = "plant" | "harvest" | "refill-seeds";

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
    apply: (farm: FarmData, time: number) => { ok: true; farm: FarmData; body: unknown } | { ok: false; error: RuleError },
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

      const result = apply(requireFarm(playerId), time);
      if (!result.ok) {
        return { ok: false, status: 409, body: { code: result.error, message: ERROR_MESSAGES[result.error] } };
      }

      saveFarm(db, playerId, result.farm);
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
    return reply.send(toFarmState(requireFarm(playerId), now()));
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
      (farm, time) => {
        const result = plant(farm, plotIndex, cropId, time);
        return result.ok
          ? { ok: true, farm: result.farm, body: toFarmState(result.farm, time) }
          : result;
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
      (farm, time) => {
        const result = harvest(farm, plotIndex, time);
        return result.ok
          ? {
              ok: true,
              farm: result.farm,
              body: { ...toFarmState(result.farm, time), harvested: result.harvested, reward: result.reward },
            }
          : result;
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
      (farm, time) => {
        if (isSeedRefillEligible(farm) && farm.seedRefillAvailableAt === null) {
          // Unexpected data (P2-5): the refill is allowed immediately.
          request.log.warn({ playerId }, "Seed refill eligible without a recorded cooldown");
        }
        const result = refillSeeds(farm, time);
        return result.ok
          ? { ok: true, farm: result.farm, body: toFarmState(result.farm, time) }
          : result;
      },
    );
    return reply.code(outcome.status).send(outcome.body);
  });
}
