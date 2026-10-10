import { describe, expect, it } from "vitest";
import { DESIGN_SIZE, MAX_FRAME, MAX_ZOOM, computeFarmLayout, designToScreen, textResolution, type FarmLayout, type Rect } from "./farmLayout.js";

/** A 1280×720 window at the Chrome zoom levels from the bug report (CSS viewport = window / zoom). */
const DESKTOP_ZOOMS = [0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2];

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

  it("makes the farm physically smaller when the page is zoomed out, never larger than the window when zoomed in", () => {
    // Physical pixels per design unit = CSS px per unit × browser zoom.
    const physical = DESKTOP_ZOOMS.map((zoom) => {
      const viewport = cssViewport(zoom);
      return computeFarmLayout(viewport.width, viewport.height).zoom * zoom;
    });
    // 1280×720 at 100% is exactly at the cap: zooming out shrinks in proportion…
    expect(physical[DESKTOP_ZOOMS.indexOf(1)]).toBeCloseTo(MAX_ZOOM, 6);
    expect(physical[DESKTOP_ZOOMS.indexOf(0.33)]).toBeCloseTo(MAX_ZOOM * 0.33, 2);
    for (let i = 1; i < physical.length; i++) expect(physical[i]!).toBeGreaterThanOrEqual(physical[i - 1]! - 0.01);
    // …while zooming in cannot grow past what fits the window.
    for (const zoom of [1.25, 1.5, 2]) expect(physical[DESKTOP_ZOOMS.indexOf(zoom)]).toBeCloseTo(MAX_ZOOM, 1);
  });

  it("caps CSS px per design unit on large screens and fills the frame up to MAX_FRAME", () => {
    const fullHd = computeFarmLayout(1920, 1080);
    expect(fullHd.zoom).toBe(MAX_ZOOM);
    expect(fullHd.design).toEqual(MAX_FRAME.landscape);
    const zoomedOut = computeFarmLayout(3879, 2182);
    expect(zoomedOut.zoom).toBe(MAX_ZOOM);
    expect(zoomedOut.design).toEqual(MAX_FRAME.landscape);
    expect(zoomedOut.fontSize).toEqual(fullHd.fontSize);
  });

  it("follows the screen's aspect ratio instead of leaving empty bands", () => {
    const tallPhone = computeFarmLayout(390, 844);
    expect(tallPhone.design.width).toBeCloseTo(DESIGN_SIZE.portrait.width, 6);
    expect(tallPhone.design.height * tallPhone.zoom).toBeCloseTo(844, 6);
    const fixedFrame = computeFarmLayout(360, 640);
    expect(tallPhone.plots[0]!.height).toBeGreaterThan(fixedFrame.plots[0]!.height);
    const wideWindow = computeFarmLayout(800, 600);
    expect(wideWindow.design.width * wideWindow.zoom).toBeCloseTo(800, 6);
    expect(wideWindow.design.height * wideWindow.zoom).toBeCloseTo(600, 6);
  });

  it.each([
    ["phone portrait", 390, 844],
    ["phone landscape", 844, 390],
    ["small phone", 320, 568],
    ["desktop", 1280, 720],
    ["desktop zoom 200%", 640, 360],
    ["desktop zoom 50%", 2560, 1440],
    ["desktop zoom 33%", 3879, 2182],
    ["desktop zoom 67%", 1910, 1075],
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
    // The frame is scaled uniformly, within its bounds, and centred.
    const min = DESIGN_SIZE[layout.orientation];
    const max = MAX_FRAME[layout.orientation];
    expect(layout.zoom).toBeCloseTo(Math.min(MAX_ZOOM, width / min.width, height / min.height), 9);
    expect(layout.design.width).toBeGreaterThanOrEqual(min.width - 1e-9);
    expect(layout.design.height).toBeGreaterThanOrEqual(min.height - 1e-9);
    expect(layout.design.width).toBeLessThanOrEqual(max.width);
    expect(layout.design.height).toBeLessThanOrEqual(max.height);
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
      [1920, 1080],
      [3879, 2182],
      [800, 600],
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

  it("keeps touch targets at least 44 CSS px on common phones, including small ones", () => {
    for (const [width, height] of [
      [320, 568],
      [568, 320],
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
  it("follows device pixels per design unit between 1 and 4", () => {
    expect(textResolution(computeFarmLayout(640, 360))).toBe(1);
    expect(textResolution(computeFarmLayout(1280, 720))).toBe(2);
    expect(textResolution(computeFarmLayout(320, 180))).toBe(1);
    expect(textResolution(computeFarmLayout(5120, 2880))).toBe(2);
    expect(textResolution(computeFarmLayout(390, 844), 3)).toBeCloseTo(3.25, 2);
    expect(textResolution(computeFarmLayout(1280, 720), 3)).toBe(4);
    expect(textResolution(computeFarmLayout(3879, 2182), 0.33)).toBe(1);
  });
});
