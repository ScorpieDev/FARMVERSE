import { describe, expect, it } from "vitest";
import { DESIGN_SIZE, computeFarmLayout, designToScreen, textResolution, type FarmLayout, type Rect } from "./farmLayout.js";

/** A 1280×720 window at the Chrome zoom levels from the bug report (CSS viewport = window / zoom). */
const DESKTOP_ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function cssViewport(zoom: number, width = 1280, height = 720) {
  return { width: Math.round(width / zoom), height: Math.round(height / zoom) };
}

function screenRect(layout: FarmLayout, rect: Rect): Rect {
  const topLeft = designToScreen(layout, rect.x, rect.y);
  return { x: topLeft.x, y: topLeft.y, width: rect.width * layout.zoom, height: rect.height * layout.zoom };
}

function inside(inner: Rect, outer: Rect): boolean {
  const eps = 1e-6;
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.width <= outer.x + outer.width + eps &&
    inner.y + inner.height <= outer.y + outer.height + eps
  );
}

/** Everything that must stay visible, in design units. */
function widgets(layout: FarmLayout): Rect[] {
  return [...layout.plots, ...layout.seedButtons, layout.refillButton, layout.overlayButton];
}

describe("computeFarmLayout", () => {
  it("uses 2×3 plots in portrait and 3×2 in landscape", () => {
    expect(computeFarmLayout(390, 844)).toMatchObject({ orientation: "portrait", columns: 2 });
    expect(computeFarmLayout(844, 390)).toMatchObject({ orientation: "landscape", columns: 3 });
  });

  it("keeps the same design layout at every browser zoom level (only the camera zoom changes)", () => {
    const layouts = DESKTOP_ZOOMS.map((zoom) => computeFarmLayout(cssViewport(zoom).width, cssViewport(zoom).height));
    const reference = layouts[0]!;
    for (const layout of layouts) {
      expect(layout.plots).toEqual(reference.plots);
      expect(layout.seedButtons).toEqual(reference.seedButtons);
      expect(layout.fontSize).toEqual(reference.fontSize);
    }
  });

  it("covers the same share of the physical window at every browser zoom level", () => {
    for (const zoom of DESKTOP_ZOOMS) {
      const viewport = cssViewport(zoom);
      const layout = computeFarmLayout(viewport.width, viewport.height);
      // Physical pixels = CSS pixels × browser zoom.
      const physicalPlotWidth = layout.plots[0]!.width * layout.zoom * zoom;
      expect(physicalPlotWidth).toBeCloseTo(layout.plots[0]!.width * 2, 0); // 1280×720 fits 640×360 at 2×
    }
  });

  it.each([
    ["phone portrait", 390, 844],
    ["phone landscape", 844, 390],
    ["small phone", 320, 568],
    ["desktop", 1280, 720],
    ["desktop zoom 200%", 640, 360],
    ["desktop zoom 50%", 2560, 1440],
    ["full HD", 1920, 1080],
    ["ultrawide", 2560, 720],
    ["tall narrow window", 400, 1000],
    ["tiny window", 200, 150],
  ])("fits every widget inside the canvas without distortion (%s %ix%i)", (_name, width, height) => {
    const layout = computeFarmLayout(width, height);
    const canvas = { x: 0, y: 0, width, height };
    const design = { x: 0, y: 0, ...layout.design };

    for (const rect of widgets(layout)) {
      expect(inside(rect, design)).toBe(true);
      expect(inside(screenRect(layout, rect), canvas)).toBe(true);
    }
    // The frame is scaled uniformly and centred.
    expect(Math.min(width / layout.design.width, height / layout.design.height)).toBeCloseTo(layout.zoom, 9);
    const frame = screenRect(layout, design);
    expect(frame.x).toBeCloseTo(width - (frame.x + frame.width), 6);
    expect(frame.y).toBeCloseTo(height - (frame.y + frame.height), 6);
  });

  it("fills the canvas on the limiting side", () => {
    const portrait = computeFarmLayout(390, 844);
    expect(DESIGN_SIZE.portrait.width * portrait.zoom).toBeCloseTo(390, 6);
    const desktop = computeFarmLayout(1280, 720);
    expect(desktop.zoom).toBe(2);
    expect(desktop.view).toEqual({ x: 0, y: 0, width: 640, height: 360 });
  });

  it("lays out plots in a grid without overlaps", () => {
    for (const [width, height] of [
      [390, 844],
      [844, 390],
    ] as const) {
      const { plots, seedButtons } = computeFarmLayout(width, height);
      const all = [...plots, ...seedButtons];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i]!;
          const b = all[j]!;
          const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
          expect(overlap).toBe(false);
        }
      }
    }
  });

  it("keeps touch targets at least 44 CSS px on common phones", () => {
    for (const [width, height] of [
      [360, 640],
      [390, 844],
      [844, 390],
    ] as const) {
      const layout = computeFarmLayout(width, height);
      for (const rect of [...layout.seedButtons, layout.refillButton, ...layout.plots]) {
        expect(rect.height * layout.zoom).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it("covers the whole canvas with the view rectangle (used by the overlay)", () => {
    const layout = computeFarmLayout(2560, 720);
    expect(screenRect(layout, layout.view)).toEqual({ x: 0, y: 0, width: 2560, height: 720 });
  });

  it("does not break on a zero-sized canvas", () => {
    const layout = computeFarmLayout(0, 0);
    expect(Number.isFinite(layout.zoom)).toBe(true);
    expect(layout.zoom).toBeGreaterThan(0);
  });
});

describe("textResolution", () => {
  it("follows the camera zoom between 1 and 4", () => {
    expect(textResolution(computeFarmLayout(640, 360))).toBe(1);
    expect(textResolution(computeFarmLayout(1280, 720))).toBe(2);
    expect(textResolution(computeFarmLayout(320, 180))).toBe(1);
    expect(textResolution(computeFarmLayout(5120, 2880))).toBe(4);
  });
});
