import { describe, expect, it } from "vitest";
import { ErrorCode, isErrorCode } from "./errors.js";

describe("isErrorCode", () => {
  it("accepts every defined error code", () => {
    for (const code of Object.values(ErrorCode)) {
      expect(isErrorCode(code)).toBe(true);
    }
  });

  it.each([
    ["unknown string", "SOMETHING_ELSE"],
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
