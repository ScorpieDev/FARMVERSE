import { describe, expect, it } from "vitest";
import { MAX_CANVAS_PIXELS, MAX_RENDER_SCALE, MIN_RENDER_SCALE, computeDisplaySize } from "./display.js";

describe("computeDisplaySize", () => {
  it("renders one canvas pixel per device pixel on a normal screen", () => {
    expect(computeDisplaySize(1280, 720, 1)).toEqual({ cssWidth: 1280, cssHeight: 720, renderScale: 1, pixelWidth: 1280, pixelHeight: 720 });
  });

  it("uses device pixels on high-DPI phones so the farm is not upscaled and blurry", () => {
    expect(computeDisplaySize(390, 844, 3)).toMatchObject({ renderScale: 3, pixelWidth: 1170, pixelHeight: 2532 });
  });

  it("keeps the canvas at the physical window size when the page is zoomed out", () => {
    // Chrome at 33%: CSS viewport = 1280×720 / 0.33, devicePixelRatio = 0.33.
    expect(computeDisplaySize(3879, 2182, 0.33)).toMatchObject({ pixelWidth: 1280, pixelHeight: 720 });
  });

  it("clamps the render scale", () => {
    expect(computeDisplaySize(400, 300, 8).renderScale).toBe(MAX_RENDER_SCALE);
    expect(computeDisplaySize(400, 300, 0.05).renderScale).toBe(MIN_RENDER_SCALE);
  });

  it("limits the drawing buffer on very large screens", () => {
    const display = computeDisplaySize(3840, 2160, 3);
    expect(display.pixelWidth * display.pixelHeight).toBeLessThanOrEqual(MAX_CANVAS_PIXELS * 1.001);
    expect(display.pixelWidth / display.pixelHeight).toBeCloseTo(3840 / 2160, 2);
  });

  it("falls back safely on invalid input", () => {
    expect(computeDisplaySize(0, 0, Number.NaN)).toEqual({ cssWidth: 1, cssHeight: 1, renderScale: 1, pixelWidth: 1, pixelHeight: 1 });
  });
});
