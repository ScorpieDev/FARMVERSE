/**
 * HTTP client for the farming API.
 *
 * - The guest token is kept in localStorage. A missing or rejected token never
 *   creates a new farm silently: the scene must ask the player first
 *   (startNewFarm), because a new farm replaces access to the old one.
 * - State-changing actions carry a request ID. Network failures and gateway
 *   errors are retried with the SAME request ID, which the server answers with
 *   the stored result if the first attempt already succeeded.
 * - Every response is validated with the shared validators; the client never
 *   computes gameplay results itself.
 */
import {
  FARM_HARVEST_PATH,
  FARM_PATH,
  FARM_PLANT_PATH,
  FARM_REFILL_SEEDS_PATH,
  QUEST_CLAIM_PATH,
  SESSION_PATH,
  isFarmState,
  isHarvestResponse,
  isQuestClaimResponse,
  isSessionResponse,
  type FarmState,
  type HarvestRequest,
  type HarvestResponse,
  type PlantRequest,
  type QuestClaimRequest,
  type QuestClaimResponse,
  type RefillSeedsRequest,
} from "@farmverse/shared/api";
import { isErrorCode, type ErrorCode } from "@farmverse/shared/errors";

export const TOKEN_STORAGE_KEY = "farmverse.token";

/** Delays between retries of an action after a network or gateway failure. */
export const ACTION_RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000];

/** Statuses that mean "the server could not be reached", worth retrying. */
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

/** The localStorage subset used here. */
export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The stored token was rejected (401): the farm is no longer reachable. */
export class SessionInvalidError extends Error {
  override name = "SessionInvalidError";
}

/** The server could not be reached (after retries for actions). */
export class NetworkError extends Error {
  override name = "NetworkError";
}

export type ActionResult<T> =
  | { ok: true; state: T }
  | { ok: false; code: ErrorCode; message: string };

export interface FarmApiOptions {
  /** "" for same origin, else the server origin (from resolveServerUrls). */
  apiOrigin: string;
  storage: TokenStorage;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** In-memory storage for browsers where localStorage is unavailable. */
export function createMemoryStorage(): TokenStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

export class FarmApi {
  private readonly apiOrigin: string;
  private readonly storage: TokenStorage;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: FarmApiOptions) {
    this.apiOrigin = options.apiOrigin;
    this.storage = options.storage;
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  hasToken(): boolean {
    return this.token() !== null;
  }

  /** Creates a guest session only if no token is stored yet (first visit). */
  async ensureSession(): Promise<void> {
    if (!this.hasToken()) await this.createSession();
  }

  /** Replaces the stored token with a brand-new farm. Call only after the player confirms. */
  async startNewFarm(): Promise<void> {
    this.storage.removeItem(TOKEN_STORAGE_KEY);
    await this.createSession();
  }

  async loadFarm(): Promise<FarmState> {
    const response = await this.request("GET", FARM_PATH);
    if (response.status === 401) throw new SessionInvalidError("Session token rejected");
    if (!response.ok) throw new NetworkError(`GET ${FARM_PATH} failed with ${response.status}`);
    const body: unknown = await response.json();
    if (!isFarmState(body)) throw new Error("Invalid farm state from server");
    return body;
  }

  plant(body: PlantRequest): Promise<ActionResult<FarmState>> {
    return this.action(FARM_PLANT_PATH, body, isFarmState);
  }

  harvest(body: HarvestRequest): Promise<ActionResult<HarvestResponse>> {
    return this.action(FARM_HARVEST_PATH, body, isHarvestResponse);
  }

  refillSeeds(body: RefillSeedsRequest): Promise<ActionResult<FarmState>> {
    return this.action(FARM_REFILL_SEEDS_PATH, body, isFarmState);
  }

  /** Claims the active quest; the server decides which quest and what reward. */
  claimQuest(body: QuestClaimRequest): Promise<ActionResult<QuestClaimResponse>> {
    return this.action(QUEST_CLAIM_PATH, body, isQuestClaimResponse);
  }

  private token(): string | null {
    return this.storage.getItem(TOKEN_STORAGE_KEY);
  }

  private async createSession(): Promise<void> {
    const response = await this.request("POST", SESSION_PATH);
    if (response.status !== 201) {
      throw new NetworkError(`POST ${SESSION_PATH} failed with ${response.status}`);
    }
    const body: unknown = await response.json();
    if (!isSessionResponse(body)) throw new Error("Invalid session response from server");
    this.storage.setItem(TOKEN_STORAGE_KEY, body.token);
  }

  /** Sends one HTTP request; fetch failures become NetworkError. */
  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    const token = this.token();
    if (token !== null) headers["authorization"] = `Bearer ${token}`;
    const init: RequestInit = { method, headers, cache: "no-store" };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    try {
      return await this.fetchFn(`${this.apiOrigin}${path}`, init);
    } catch (error) {
      throw new NetworkError(error instanceof Error ? error.message : "Network request failed");
    }
  }

  /**
   * Sends a state-changing action, retrying network/gateway failures with the
   * same body (and therefore the same request ID).
   */
  private async action<T>(
    path: string,
    body: { requestId: string },
    isState: (value: unknown) => value is T,
  ): Promise<ActionResult<T>> {
    for (let attempt = 0; ; attempt++) {
      let response: Response | null = null;
      try {
        response = await this.request("POST", path, body);
      } catch (error) {
        if (!(error instanceof NetworkError)) throw error;
      }

      if (response !== null && !RETRYABLE_STATUSES.has(response.status)) {
        return this.readAction(response, isState);
      }

      const delay = ACTION_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) throw new NetworkError(`POST ${path} failed after retries`);
      await this.sleep(delay);
    }
  }

  private async readAction<T>(
    response: Response,
    isState: (value: unknown) => value is T,
  ): Promise<ActionResult<T>> {
    if (response.status === 401) throw new SessionInvalidError("Session token rejected");

    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      if (!isState(body)) throw new Error("Invalid action response from server");
      return { ok: true, state: body };
    }

    const error = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    if (isErrorCode(error["code"]) && typeof error["message"] === "string") {
      return { ok: false, code: error["code"], message: error["message"] };
    }
    throw new Error(`Unexpected response ${response.status}`);
  }
}
