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
