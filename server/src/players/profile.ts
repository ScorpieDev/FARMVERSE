/**
 * Public player profile (Phase 5, decisions F-A farm code and N-A generated
 * display name): every player gets a unique 6-character farm code, the public
 * ID used in multiplayer rooms, and a fixed display name "Farmer NNNN".
 * Names do not need to be unique; farm codes do. Generated with
 * crypto-strength randomness so codes cannot be guessed from creation order.
 */
import { randomInt } from "node:crypto";
import { FARM_CODE_ALPHABET, FARM_CODE_LENGTH, isDisplayName, isFarmCode } from "@farmverse/shared/presence";

export interface PlayerProfile {
  farmCode: string;
  name: string;
}

/** Random integer in [0, max); injectable for tests. */
export type RandomInt = (max: number) => number;

/** Attempts before giving up on finding an unused farm code (32^6 ≈ 1.07 billion codes). */
const MAX_CODE_ATTEMPTS = 20;

export function generateFarmCode(random: RandomInt = randomInt): string {
  let code = "";
  for (let index = 0; index < FARM_CODE_LENGTH; index++) {
    code += FARM_CODE_ALPHABET[random(FARM_CODE_ALPHABET.length)];
  }
  return code;
}

export function generateDisplayName(random: RandomInt = randomInt): string {
  return `Farmer ${String(random(10_000)).padStart(4, "0")}`;
}

/**
 * A new profile whose farm code is not in use. `isTaken` checks storage;
 * throws if no free code is found (practically impossible).
 */
export function newProfile(isTaken: (farmCode: string) => boolean, random: RandomInt = randomInt): PlayerProfile {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const farmCode = generateFarmCode(random);
    if (!isTaken(farmCode)) return { farmCode, name: generateDisplayName(random) };
  }
  throw new Error("Could not find an unused farm code");
}

/** Throws RangeError for a stored profile that does not match the formats (corrupted data). */
export function assertPlayerProfile(profile: PlayerProfile): void {
  if (!isFarmCode(profile.farmCode)) throw new RangeError("Invalid farm code");
  if (!isDisplayName(profile.name)) throw new RangeError("Invalid display name");
}
