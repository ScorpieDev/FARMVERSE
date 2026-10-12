import { describe, expect, it } from "vitest";
import { isDisplayName, isFarmCode } from "@farmverse/shared/presence";
import { assertPlayerProfile, generateDisplayName, generateFarmCode, newProfile, type RandomInt } from "./profile.js";

/** Returns the given values in order, then zeros. */
function sequence(...values: number[]): RandomInt {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe("generated profiles (F-A, N-A)", () => {
  it("builds farm codes from the alphabet and zero-padded names", () => {
    expect(generateFarmCode(sequence(0, 1, 2, 29, 30, 31))).toBe("ABC789");
    expect(generateDisplayName(sequence(42))).toBe("Farmer 0042");
    expect(generateDisplayName(sequence(9999))).toBe("Farmer 9999");
  });

  it("produces valid random values", () => {
    for (let index = 0; index < 200; index++) {
      expect(isFarmCode(generateFarmCode())).toBe(true);
      expect(isDisplayName(generateDisplayName())).toBe(true);
    }
  });

  it("tries again when a farm code is taken, and gives up after many attempts", () => {
    const taken = new Set(["AAAAAA"]);
    const profile = newProfile((code) => taken.has(code), sequence(0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 7));
    expect(profile).toEqual({ farmCode: "BBBBBB", name: "Farmer 0007" });
    expect(() => newProfile(() => true)).toThrow(/unused farm code/);
  });

  it("rejects stored profiles that break the formats", () => {
    expect(() => assertPlayerProfile({ farmCode: "ABC234", name: "Farmer 0001" })).not.toThrow();
    expect(() => assertPlayerProfile({ farmCode: "abc234", name: "Farmer 0001" })).toThrow(RangeError);
    expect(() => assertPlayerProfile({ farmCode: "ABC234", name: "Admin" })).toThrow(RangeError);
  });
});
