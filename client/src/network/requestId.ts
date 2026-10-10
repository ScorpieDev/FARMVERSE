/**
 * Request IDs for state-changing farm actions (UUID v4 from crypto.randomUUID).
 *
 * crypto.randomUUID exists only in secure contexts (HTTPS or localhost). When
 * it is missing the game must block farm actions and explain why; it never
 * falls back to a weaker generator such as Math.random (decision A-7).
 */

export const REQUEST_ID_UNSUPPORTED_MESSAGE =
  "This browser cannot create secure request IDs. Open the game over HTTPS or localhost.";

/** The part of the Web Crypto API this module needs. */
export interface UuidSource {
  randomUUID?: () => string;
}

/** Returns a request ID generator, or null when the environment cannot provide one. */
export function createRequestIdFactory(source: UuidSource | undefined): (() => string) | null {
  if (source === undefined || typeof source.randomUUID !== "function") return null;
  const randomUUID = source.randomUUID.bind(source);
  return () => randomUUID();
}
