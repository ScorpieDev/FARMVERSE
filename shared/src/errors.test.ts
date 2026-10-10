import { describe, expect, it } from "vitest";
import { ErrorCode, isErrorCode } from "./errors.js";

describe("isErrorCode", () => {
  it("accepts every defined error code", () => {
    for (const code of Object.values(ErrorCode)) {
      expect(isErrorCode(code)).toBe(true);
    }
  });

  it("defines the Phase 0 and Phase 1 codes", () => {
    expect(Object.values(ErrorCode).sort()).toEqual(
      [
        "INVALID_MESSAGE",
        "UNSUPPORTED_PROTOCOL_VERSION",
        "NOT_FOUND",
        "INTERNAL_ERROR",
        "INVALID_REQUEST",
        "UNAUTHORIZED",
        "PLOT_NOT_EMPTY",
        "PLOT_EMPTY",
        "CROP_NOT_READY",
        "ITEM_NOT_OWNED",
        "REFILL_NOT_ALLOWED",
        "REQUEST_ID_REUSED",
      ].sort(),
    );
  });

  it.each([
    ["unknown string", "SOMETHING_ELSE"],
    ["single refill code (no REFILL_COOLDOWN)", "REFILL_COOLDOWN"],
    ["wrong case", "invalid_message"],
    ["empty string", ""],
    ["number", 1],
    ["null", null],
    ["undefined", undefined],
    ["object", { code: "INVALID_MESSAGE" }],
  ])("rejects %s", (_label, value) => {
    expect(isErrorCode(value)).toBe(false);
  });
});
