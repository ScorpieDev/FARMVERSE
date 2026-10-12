/**
 * Token-bucket rate limiter for WebSocket messages (Phase 5, Step 5.2).
 * Pure: the caller passes the server time, so it can be unit tested.
 *
 * The bucket holds up to `burst` tokens and refills `perSecond` tokens per
 * second. Each message takes one token; a message that finds the bucket empty
 * is refused.
 */
export interface RateLimit {
  /** Sustained messages per second. */
  perSecond: number;
  /** Messages allowed at once after a quiet period. */
  burst: number;
}

export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly limit: RateLimit,
    now: number,
  ) {
    if (!(limit.perSecond > 0) || !(limit.burst >= 1)) throw new RangeError("Invalid rate limit");
    this.tokens = limit.burst;
    this.updatedAt = now;
  }

  /** Takes one token if available. `now` is the server time in ms. */
  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.updatedAt);
    this.tokens = Math.min(this.limit.burst, this.tokens + (elapsed / 1000) * this.limit.perSecond);
    this.updatedAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
