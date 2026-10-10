/**
 * Canvas size in device pixels.
 *
 * The canvas always covers the page in CSS pixels, but its drawing buffer has
 * `renderScale` pixels per CSS pixel (the browser's devicePixelRatio, which
 * includes page zoom). Rendering at 1 pixel per CSS pixel would make the farm
 * blurry on high-DPI phones and when zoomed in, and needlessly large when the
 * page is zoomed out (a 33% zoom triples the CSS viewport).
 */

export interface DisplaySize {
  /** Canvas size in CSS pixels (what the layout is computed for). */
  cssWidth: number;
  cssHeight: number;
  /** Canvas pixels per CSS pixel. */
  renderScale: number;
  /** Canvas drawing-buffer size in pixels. */
  pixelWidth: number;
  pixelHeight: number;
}

export const MIN_RENDER_SCALE = 0.25;
export const MAX_RENDER_SCALE = 3;
/** Upper bound on drawing-buffer pixels (4K at 1.5×), to protect weak GPUs. */
export const MAX_CANVAS_PIXELS = 3840 * 2160 * 1.5;

export function computeDisplaySize(cssWidth: number, cssHeight: number, devicePixelRatio: number): DisplaySize {
  const width = Math.max(1, Math.round(cssWidth));
  const height = Math.max(1, Math.round(cssHeight));
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;

  let renderScale = Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, dpr));
  const pixels = width * height * renderScale * renderScale;
  if (pixels > MAX_CANVAS_PIXELS) renderScale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);

  return {
    cssWidth: width,
    cssHeight: height,
    renderScale,
    pixelWidth: Math.max(1, Math.round(width * renderScale)),
    pixelHeight: Math.max(1, Math.round(height * renderScale)),
  };
}
