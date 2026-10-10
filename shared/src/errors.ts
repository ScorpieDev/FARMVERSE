/**
 * Error codes shared by client and server.
 *
 * Phase 0 defines what the foundation needs (connection, health check,
 * message validation); Phase 1 adds the farming API errors. Errors of later
 * features (e.g. INSUFFICIENT_CURRENCY, TECHNICAL_ARCHITECTURE.md §18) are
 * added in the phase that implements them.
 */
export const ErrorCode = {
  /** Message is not valid JSON or does not match the protocol contract. */
  INVALID_MESSAGE: "INVALID_MESSAGE",
  /** Client and server speak different protocol versions. */
  UNSUPPORTED_PROTOCOL_VERSION: "UNSUPPORTED_PROTOCOL_VERSION",
  /** Requested HTTP route does not exist. */
  NOT_FOUND: "NOT_FOUND",
  /** Unexpected server-side failure. */
  INTERNAL_ERROR: "INTERNAL_ERROR",

  // ---------- Phase 1: farming HTTP API ----------

  /** Malformed JSON, or a request body with missing/invalid fields. */
  INVALID_REQUEST: "INVALID_REQUEST",
  /** Missing or invalid session token. */
  UNAUTHORIZED: "UNAUTHORIZED",
  /** Planting into a plot that already has a crop. */
  PLOT_NOT_EMPTY: "PLOT_NOT_EMPTY",
  /** Harvesting an empty plot. */
  PLOT_EMPTY: "PLOT_EMPTY",
  /** Harvesting before the crop is ready (server time). */
  CROP_NOT_READY: "CROP_NOT_READY",
  /** The player does not have the required item (e.g. no seeds left). */
  ITEM_NOT_OWNED: "ITEM_NOT_OWNED",
  /**
   * Seed refill not allowed: the player still has seeds or crops, or the
   * cooldown has not passed on the server clock. The error body does not say
   * which; the server's `seedRefill` state is returned by GET /api/farm.
   */
  REFILL_NOT_ALLOWED: "REFILL_NOT_ALLOWED",
  /** The request ID was already used for a different action or body. */
  REQUEST_ID_REUSED: "REQUEST_ID_REUSED",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Error shape returned by the server over HTTP and WebSocket. */
export interface ErrorPayload {
  code: ErrorCode;
  /** Human-readable detail for logs/debugging. The client shows its own text. */
  message: string;
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === "string" &&
    (Object.values(ErrorCode) as readonly string[]).includes(value)
  );
}
