/**
 * Responsive farm scene layout.
 *
 * Everything is placed in design units inside a frame, and the scene's camera
 * zooms by one uniform factor (`zoom`, CSS px per design unit), so nothing is
 * ever stretched.
 *
 * - `zoom` fits the minimum frame (360×640 portrait, 640×360 landscape) into
 *   the canvas, capped at MAX_ZOOM. Small screens scale the farm down to fit;
 *   large screens and browser zoom-out stop at the cap, so the farm gets
 *   physically smaller when the page is zoomed out, like any web page.
 * - The frame then grows with the canvas (up to MAX_FRAME) and follows its
 *   aspect ratio, so plots use the extra height of tall phones and the extra
 *   width of wide windows instead of leaving empty bands. Beyond MAX_FRAME the
 *   frame is centred and the rest is background, keeping the controls together.
 */

export type Orientation = "portrait" | "landscape";

export interface Size {
  width: number;
  height: number;
}

/** Top-left based rectangle. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Anchor point for centred text: horizontal centre, top edge. */
export interface TextSpot {
  x: number;
  y: number;
}

export interface FarmLayout {
  orientation: Orientation;
  /** Size of the frame the farm is laid out in (design units, top-left at 0,0). */
  design: Size;
  /** CSS pixels per design unit. */
  zoom: number;
  /** The whole visible canvas expressed in design units (contains the design frame). */
  view: Rect;
  columns: number;
  fontSize: { title: number; text: number; plot: number };
  title: TextSpot;
  status: TextSpot;
  stats: TextSpot;
  plots: Rect[];
  seedButtons: Rect[];
  refillButton: Rect;
  produce: TextSpot;
  message: TextSpot;
  /** Wrap width for the message and overlay text. */
  wrapWidth: number;
  overlayText: TextSpot;
  overlayButton: Rect;
}

/** Smallest frame: always fully visible. */
export const DESIGN_SIZE: Readonly<Record<Orientation, Size>> = {
  portrait: { width: 360, height: 640 },
  landscape: { width: 640, height: 360 },
};

/** Largest frame; more space than this is background around the centred frame. */
export const MAX_FRAME: Readonly<Record<Orientation, Size>> = {
  portrait: { width: 480, height: 900 },
  landscape: { width: 960, height: 540 },
};

/** Largest CSS px per design unit (text 14–15 units → about 30 CSS px at most). */
export const MAX_ZOOM = 2;

const PLOT_COUNT = 6;
const SEED_BUTTONS = 3;

interface Metrics {
  margin: number;
  gap: number;
  titleSize: number;
  textSize: number;
  lineHeight: number;
  buttonHeight: number;
  /** Widest a plot or seed button may be. */
  maxCellWidth: number;
}

const METRICS: Readonly<Record<Orientation, Metrics>> = {
  portrait: { margin: 12, gap: 10, titleSize: 26, textSize: 15, lineHeight: 22, buttonHeight: 52, maxCellWidth: 170 },
  landscape: { margin: 10, gap: 8, titleSize: 22, textSize: 14, lineHeight: 20, buttonHeight: 50, maxCellWidth: 190 },
};

export function orientationOf(width: number, height: number): Orientation {
  return width > height ? "landscape" : "portrait";
}

/** Lays out the farm for a canvas of `width`×`height` CSS pixels. */
export function computeFarmLayout(width: number, height: number): FarmLayout {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const orientation = orientationOf(safeWidth, safeHeight);
  const minFrame = DESIGN_SIZE[orientation];
  const maxFrame = MAX_FRAME[orientation];
  const m = METRICS[orientation];

  const zoom = Math.min(MAX_ZOOM, safeWidth / minFrame.width, safeHeight / minFrame.height);
  const viewWidth = safeWidth / zoom;
  const viewHeight = safeHeight / zoom;
  // The view is at least the minimum frame on both sides, because zoom fits it.
  const design = { width: Math.min(viewWidth, maxFrame.width), height: Math.min(viewHeight, maxFrame.height) };
  const view = {
    x: (design.width - viewWidth) / 2,
    y: (design.height - viewHeight) / 2,
    width: viewWidth,
    height: viewHeight,
  };

  const centerX = design.width / 2;
  const contentWidth = design.width - 2 * m.margin;

  // Header: title, connection status, coins/XP.
  const title = { x: centerX, y: m.margin };
  const status = { x: centerX, y: m.margin + Math.round(m.titleSize * 1.3) };
  const stats = { x: centerX, y: status.y + m.lineHeight };
  const headerBottom = stats.y + m.lineHeight;

  // Footer: seed buttons, produce line, message (up to two lines).
  const footerHeight = m.gap + m.buttonHeight + m.gap + 3 * m.lineHeight;
  const footerTop = design.height - m.margin - footerHeight;

  // Plot grid fills the space between header and footer.
  const columns = orientation === "landscape" ? 3 : 2;
  const rows = PLOT_COUNT / columns;
  const plotWidth = Math.min(m.maxCellWidth, (contentWidth - (columns - 1) * m.gap) / columns);
  const plotHeight = Math.min(plotWidth, (footerTop - headerBottom - (rows - 1) * m.gap) / rows);
  const gridWidth = columns * plotWidth + (columns - 1) * m.gap;
  const gridHeight = rows * plotHeight + (rows - 1) * m.gap;
  const gridLeft = centerX - gridWidth / 2;
  const gridTop = headerBottom + (footerTop - headerBottom - gridHeight) / 2;
  const plots = Array.from({ length: PLOT_COUNT }, (_, index) => ({
    x: gridLeft + (index % columns) * (plotWidth + m.gap),
    y: gridTop + Math.floor(index / columns) * (plotHeight + m.gap),
    width: plotWidth,
    height: plotHeight,
  }));

  const buttonTop = footerTop + m.gap;
  const buttonWidth = Math.min(m.maxCellWidth, (contentWidth - (SEED_BUTTONS - 1) * m.gap) / SEED_BUTTONS);
  const buttonsWidth = SEED_BUTTONS * buttonWidth + (SEED_BUTTONS - 1) * m.gap;
  const seedButtons = Array.from({ length: SEED_BUTTONS }, (_, index) => ({
    x: centerX - buttonsWidth / 2 + index * (buttonWidth + m.gap),
    y: buttonTop,
    width: buttonWidth,
    height: m.buttonHeight,
  }));
  const refillButton = { x: centerX - buttonsWidth / 2, y: buttonTop, width: buttonsWidth, height: m.buttonHeight };

  const produce = { x: centerX, y: buttonTop + m.buttonHeight + m.gap };
  const message = { x: centerX, y: produce.y + m.lineHeight };

  const overlayButtonWidth = Math.min(260, contentWidth);
  const overlayButton = {
    x: centerX - overlayButtonWidth / 2,
    y: design.height / 2,
    width: overlayButtonWidth,
    height: m.buttonHeight,
  };
  const overlayText = { x: centerX, y: design.height / 2 - m.buttonHeight - m.lineHeight };

  return {
    orientation,
    design,
    zoom,
    view,
    columns,
    fontSize: { title: m.titleSize, text: m.textSize, plot: Math.min(m.textSize, Math.floor(plotWidth / 8)) },
    title,
    status,
    stats,
    plots,
    seedButtons,
    refillButton,
    produce,
    message,
    wrapWidth: contentWidth,
    overlayText,
    overlayButton,
  };
}

/** Converts a design-unit point to canvas CSS pixels (for tests and debug hooks). */
export function designToScreen(layout: FarmLayout, x: number, y: number): { x: number; y: number } {
  return { x: (x - layout.view.x) * layout.zoom, y: (y - layout.view.y) * layout.zoom };
}

/**
 * Text is rasterised at the camera's device pixels per design unit so it stays
 * sharp when the camera zooms in. `renderScale` is canvas pixels per CSS pixel.
 */
export function textResolution(layout: FarmLayout, renderScale = 1): number {
  return Math.min(4, Math.max(1, layout.zoom * renderScale));
}
