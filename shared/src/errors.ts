/**
 * Error codes shared by client and server.
 *
 * Phase 0 only defines what the foundation needs (connection, health check,
 * message validation). Gameplay errors such as CROP_NOT_READY or
 * INSUFFICIENT_CURRENCY (TECHNICAL_ARCHITECTURE.md §18) are added in the
 * phase that implements those features.
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
