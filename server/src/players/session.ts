/**
 * Guest sessions: the server creates the player ID and a random token.
 *
 * The token is returned once and only its SHA-256 hash is stored, so a
 * database leak does not reveal usable tokens. Losing the token means losing
 * access to the farm (accepted MVP limitation; there is no login yet).
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SessionResponse } from "@farmverse/shared/api";
import { createStarterFarm } from "../farming/rules.js";
import { transaction, type Database } from "../storage/database.js";
import { findPlayerIdByTokenHash, insertPlayer } from "../storage/farmStore.js";

const TOKEN_BYTES = 32;
/** 32 bytes as base64url without padding. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const BEARER_PREFIX = "Bearer ";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a guest player with a starter farm. `now` is the server time (ms). */
export function createSession(db: Database, now: number): SessionResponse {
  const playerId = randomUUID();
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  transaction(db, () => {
    insertPlayer(db, { id: playerId, tokenHash: hashToken(token), createdAt: now }, createStarterFarm());
  });

  return { playerId, token };
}

/**
 * Returns the player ID for an `Authorization: Bearer <token>` header, or null
 * if the header is missing, malformed or the token is unknown.
 */
export function authenticate(db: Database, authorization: string | undefined): string | null {
  if (authorization === undefined || !authorization.startsWith(BEARER_PREFIX)) return null;

  const token = authorization.slice(BEARER_PREFIX.length);
  if (!TOKEN_PATTERN.test(token)) return null;

  return findPlayerIdByTokenHash(db, hashToken(token));
}
