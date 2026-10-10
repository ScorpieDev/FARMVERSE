/**
 * Farm scene layout, independent of screen size and browser zoom.
 *
 * Everything is placed in fixed design units: a 360×640 portrait frame or a
 * 640×360 landscape frame. The scene's camera then zooms by one uniform factor
 * (`zoom`, CSS px per design unit) so the frame fits the canvas and is centred.
 * Proportions never change; extra space on the long side is plain background.
 *
 * Why: Chrome page zoom changes the CSS viewport (200% halves it), and Phaser's
 * RESIZE mode resizes the canvas to that viewport. Laying out in CSS pixels
 * with fixed caps made the farm look huge at 200% and a small cluster at the
 * top when zoomed out. In design units the farm fills the window the same way
 * at every zoom level.
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
  /** Size of the design frame (design units). */
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

export const DESIGN_SIZE: Readonly<Record<Orientation, Size>> = {
  portrait: { width: 360, height: 640 },
  landscape: { width: 640, height: 360 },
};

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
  landscape: { margin: 10, gap: 8, titleSize: 22, textSize: 14, lineHeight: 20, buttonHeight: 44, maxCellWidth: 160 },
};

export function orientationOf(width: number, height: number): Orientation {
  return width > height ? "landscape" : "portrait";
}

/** Lays out the farm for a canvas of `width`×`height` CSS pixels. */
export function computeFarmLayout(width: number, height: number): FarmLayout {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const orientation = orientationOf(safeWidth, safeHeight);
  const design = DESIGN_SIZE[orientation];
  const m = METRICS[orientation];

  const zoom = Math.min(safeWidth / design.width, safeHeight / design.height);
  const viewWidth = safeWidth / zoom;
  const viewHeight = safeHeight / zoom;
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
 * Text is rasterised at this resolution so it stays sharp when the camera
 * zooms in (the canvas itself has one pixel per CSS pixel in RESIZE mode).
 */
export function textResolution(layout: FarmLayout): number {
  return Math.min(4, Math.max(1, layout.zoom));
}
