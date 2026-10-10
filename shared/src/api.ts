/**
 * HTTP API contract shared by client and server.
 *
 * Phase 0 only has the health check. Gameplay endpoints are added in the
 * phase that implements them.
 */

export const HEALTH_PATH = "/api/health";

/** Response body of GET /api/health. */
export interface HealthResponse {
  status: "ok";
  /** Server version string. */
  version: string;
  /** Server time in milliseconds since the Unix epoch. */
  serverTime: number;
}

/** Checks that a value is a well-formed health response. Extra fields are ignored. */
export function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const body = value as Record<string, unknown>;
  return (
    body["status"] === "ok" &&
    typeof body["version"] === "string" &&
    typeof body["serverTime"] === "number" &&
    Number.isFinite(body["serverTime"]) &&
    body["serverTime"] >= 0
  );
}
