import { describe, expect, it } from "vitest";
import { TokenBucket } from "./rateLimit.js";

describe("TokenBucket", () => {
  it("allows a burst, then refills at the sustained rate", () => {
    const bucket = new TokenBucket({ perSecond: 2, burst: 3 }, 0);
    expect([bucket.take(0), bucket.take(0), bucket.take(0), bucket.take(0)]).toEqual([true, true, true, false]);
    expect(bucket.take(499)).toBe(false);
    expect(bucket.take(500)).toBe(true);
    expect(bucket.take(500)).toBe(false);
  });

  it("never stores more than the burst", () => {
    const bucket = new TokenBucket({ perSecond: 10, burst: 2 }, 0);
    const taken = [0, 1, 2].map(() => bucket.take(60_000));
    expect(taken).toEqual([true, true, false]);
  });

  it("ignores a clock that goes backwards", () => {
    const bucket = new TokenBucket({ perSecond: 1, burst: 1 }, 1000);
    expect(bucket.take(1000)).toBe(true);
    expect(bucket.take(0)).toBe(false);
  });

  it("rejects invalid limits", () => {
    expect(() => new TokenBucket({ perSecond: 0, burst: 1 }, 0)).toThrow(RangeError);
    expect(() => new TokenBucket({ perSecond: 1, burst: 0 }, 0)).toThrow(RangeError);
  });
});
