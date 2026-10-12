import { describe, expect, it } from "vitest";
import { COSMETICS, DEFAULT_APPEARANCE, SKIN_TONES, SKIN_TONE_COLORS, type CharacterAppearance } from "@farmverse/shared/character";
import { CHARACTER_BOX, characterShapes, fitCharacter, hexColor, shade, type Shape } from "./characterDrawing.js";

function bounds(shape: Shape): { left: number; top: number; right: number; bottom: number } {
  if (shape.kind === "rect") return { left: shape.x, top: shape.y, right: shape.x + shape.width, bottom: shape.y + shape.height };
  if (shape.kind === "circle") {
    return { left: shape.x - shape.radius, top: shape.y - shape.radius, right: shape.x + shape.radius, bottom: shape.y + shape.radius };
  }
  const xs = [shape.points[0], shape.points[2], shape.points[4]];
  const ys = [shape.points[1], shape.points[3], shape.points[5]];
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** Every combination of one item per slot and a skin tone. */
function allAppearances(): CharacterAppearance[] {
  const of = (slot: string) => COSMETICS.filter((item) => item.slot === slot).map((item) => item.id);
  return SKIN_TONES.flatMap((skin) =>
    of("hair").flatMap((hair) => of("shirt").flatMap((shirt) => of("pants").map((pants) => ({ skin, hair, shirt, pants })))),
  );
}

describe("characterShapes (R-A)", () => {
  it("keeps every shape of every look inside the drawing box", () => {
    for (const appearance of allAppearances()) {
      for (const shape of characterShapes(appearance)) {
        const box = bounds(shape);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(CHARACTER_BOX.width);
        expect(box.bottom).toBeLessThanOrEqual(CHARACTER_BOX.height);
      }
    }
  });

  it("uses the catalog colours of the worn items and skin tone", () => {
    const colors = new Set(characterShapes({ ...DEFAULT_APPEARANCE, skin: "dark", shirt: "shirt_blue_tee" }).map((shape) => shape.color));
    expect(colors.has(hexColor(SKIN_TONE_COLORS.dark))).toBe(true);
    expect(colors.has(hexColor("#3f7fd1"))).toBe(true);
    expect(colors.has(hexColor("#6b4226"))).toBe(true);
    expect(colors.has(hexColor("#2f4f7f"))).toBe(true);
  });

  it("draws every item differently", () => {
    for (const slot of ["hair", "shirt", "pants"] as const) {
      const drawings = COSMETICS.filter((item) => item.slot === slot).map((item) =>
        JSON.stringify(characterShapes({ ...DEFAULT_APPEARANCE, [slot]: item.id })),
      );
      expect(new Set(drawings).size).toBe(drawings.length);
    }
  });

  it("shows skin on the legs with shorts only", () => {
    const skin = hexColor(SKIN_TONE_COLORS.light);
    const lowLegs = (pants: CharacterAppearance["pants"]) =>
      characterShapes({ ...DEFAULT_APPEARANCE, pants }).filter((shape) => shape.kind === "rect" && shape.y >= 120 && shape.color === skin);
    expect(lowLegs("pants_green_shorts")).toHaveLength(2);
    expect(lowLegs("pants_blue_jeans")).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("converts and darkens colours", () => {
    expect(hexColor("#3f7fd1")).toBe(0x3f7fd1);
    expect(shade(0xffffff, 0.5)).toBe(0x808080);
    expect(shade(0x123456, 0)).toBe(0x123456);
  });

  it("fits the box into a rectangle, centred, aspect kept", () => {
    expect(fitCharacter({ x: 0, y: 0, width: 100, height: 160 })).toEqual({ scale: 1, x: 0, y: 0 });
    expect(fitCharacter({ x: 10, y: 20, width: 400, height: 160 })).toEqual({ scale: 1, x: 160, y: 20 });
    expect(fitCharacter({ x: 0, y: 0, width: 50, height: 400 })).toEqual({ scale: 0.5, x: 0, y: 160 });
    expect(fitCharacter({ x: 0, y: 0, width: -5, height: 10 }).scale).toBe(0);
  });
});
