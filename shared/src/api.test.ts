import { describe, expect, it } from "vitest";
import { isHealthResponse } from "./api.js";

describe("isHealthResponse", () => {
  it("accepts a valid health response", () => {
    expect(
      isHealthResponse({ status: "ok", version: "0.0.0", serverTime: 1_700_000_000_000 }),
    ).toBe(true);
  });

  it("ignores extra fields", () => {
    expect(
      isHealthResponse({ status: "ok", version: "1.2.3", serverTime: 0, extra: true }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["array", []],
    ["string", "ok"],
    ["missing status", { version: "0.0.0", serverTime: 0 }],
    ["status not ok", { status: "down", version: "0.0.0", serverTime: 0 }],
    ["missing version", { status: "ok", serverTime: 0 }],
    ["numeric version", { status: "ok", version: 1, serverTime: 0 }],
    ["missing serverTime", { status: "ok", version: "0.0.0" }],
    ["string serverTime", { status: "ok", version: "0.0.0", serverTime: "0" }],
    ["negative serverTime", { status: "ok", version: "0.0.0", serverTime: -1 }],
    ["infinite serverTime", { status: "ok", version: "0.0.0", serverTime: Infinity }],
    ["NaN serverTime", { status: "ok", version: "0.0.0", serverTime: NaN }],
  ])("rejects %s", (_label, value) => {
    expect(isHealthResponse(value)).toBe(false);
  });
});
