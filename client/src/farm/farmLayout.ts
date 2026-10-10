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
  /** Track of the XP bar under the stats line (the fill grows from its left edge). */
  xpBar: Rect;
  plots: Rect[];
  /** Quest text: left-aligned, wrapped to `questText.width`. */
  questText: Rect;
  claimButton: Rect;
  seedButtons: Rect[];
  refillButton: Rect;
  produce: TextSpot;
  message: TextSpot;
  /** Wrap width for the produce line, the message and overlay text. */
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

/** 3×3 plots in both orientations (FARM_PLOT_COUNT; locked plots are shown too). */
const PLOT_COUNT = 9;
const PLOT_COLUMNS = 3;
/** One button per crop (CROP_IDS), in rows of up to three. */
const SEED_BUTTONS = 5;
const SEED_BUTTONS_PER_ROW = 3;
const XP_BAR_HEIGHT = 6;
const MAX_XP_BAR_WIDTH = 240;

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

/** Rows of `count` cells, at most `perRow` per row, each row centred in `area`. */
function cellRows(count: number, perRow: number, area: Rect, gap: number, maxWidth: number, height: number): Rect[] {
  const width = Math.min(maxWidth, (area.width - (perRow - 1) * gap) / perRow);
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const rowWidth = inRow * width + (inRow - 1) * gap;
    return {
      x: area.x + (area.width - rowWidth) / 2 + (index % perRow) * (width + gap),
      y: area.y + row * (height + gap),
      width,
      height,
    };
  });
}

/**
 * Controls below or beside the plots, stacked top to bottom in `column`:
 * quest line with Claim, seed buttons (two rows), produce and message text.
 */
function layoutControls(column: Rect, m: Metrics, produceLines: number) {
  const claimWidth = Math.min(96, column.width / 3);
  const questText = {
    x: column.x,
    y: column.y + (m.buttonHeight - 2 * m.lineHeight) / 2,
    width: column.width - claimWidth - m.gap,
    height: 2 * m.lineHeight,
  };
  const claimButton = { x: column.x + column.width - claimWidth, y: column.y, width: claimWidth, height: m.buttonHeight };

  const seedTop = column.y + m.buttonHeight + m.gap;
  const seedArea = { x: column.x, y: seedTop, width: column.width, height: 0 };
  const seedButtons = cellRows(SEED_BUTTONS, SEED_BUTTONS_PER_ROW, seedArea, m.gap, m.maxCellWidth, m.buttonHeight);
  const firstRow = seedButtons.slice(0, SEED_BUTTONS_PER_ROW);
  const rowLeft = firstRow[0]!.x;
  const rowRight = firstRow[firstRow.length - 1]!;
  const refillButton = { x: rowLeft, y: seedTop, width: rowRight.x + rowRight.width - rowLeft, height: m.buttonHeight };
  const seedRows = Math.ceil(SEED_BUTTONS / SEED_BUTTONS_PER_ROW);

  const centerX = column.x + column.width / 2;
  const produce = { x: centerX, y: seedTop + seedRows * m.buttonHeight + (seedRows - 1) * m.gap + m.gap };
  const message = { x: centerX, y: produce.y + produceLines * m.lineHeight };
  return { questText, claimButton, seedButtons, refillButton, produce, message };
}

/** Height `layoutControls` needs. */
function controlsHeight(m: Metrics, produceLines: number): number {
  const seedRows = Math.ceil(SEED_BUTTONS / SEED_BUTTONS_PER_ROW);
  const seeds = seedRows * m.buttonHeight + (seedRows - 1) * m.gap;
  return m.buttonHeight + m.gap + seeds + m.gap + (produceLines + 2) * m.lineHeight;
}

/** 3×3 plot grid as large as fits in `area` (square at most), centred. */
function layoutPlots(area: Rect, m: Metrics): Rect[] {
  const rows = PLOT_COUNT / PLOT_COLUMNS;
  const plotWidth = Math.min(m.maxCellWidth, (area.width - (PLOT_COLUMNS - 1) * m.gap) / PLOT_COLUMNS);
  const plotHeight = Math.min(plotWidth, (area.height - (rows - 1) * m.gap) / rows);
  const gridWidth = PLOT_COLUMNS * plotWidth + (PLOT_COLUMNS - 1) * m.gap;
  const gridHeight = rows * plotHeight + (rows - 1) * m.gap;
  const left = area.x + (area.width - gridWidth) / 2;
  const top = area.y + (area.height - gridHeight) / 2;
  return Array.from({ length: PLOT_COUNT }, (_, index) => ({
    x: left + (index % PLOT_COLUMNS) * (plotWidth + m.gap),
    y: top + Math.floor(index / PLOT_COLUMNS) * (plotHeight + m.gap),
    width: plotWidth,
    height: plotHeight,
  }));
}

/**
 * Lays out the farm for a canvas of `width`×`height` CSS pixels.
 *
 * Portrait: header, plots, then the controls in one column. Landscape: header
 * across the top, plots on the left and the controls in a column on the right,
 * so 9 plots stay large enough to tap on a 360-unit-tall phone screen.
 */
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

  // Header: title, connection status, coins and level, XP bar.
  const title = { x: centerX, y: m.margin };
  const status = { x: centerX, y: m.margin + Math.round(m.titleSize * 1.3) };
  const stats = { x: centerX, y: status.y + m.lineHeight };
  const xpBarWidth = Math.min(MAX_XP_BAR_WIDTH, contentWidth);
  const xpBar = { x: centerX - xpBarWidth / 2, y: stats.y + m.lineHeight, width: xpBarWidth, height: XP_BAR_HEIGHT };
  const headerBottom = xpBar.y + XP_BAR_HEIGHT + m.gap;
  const bodyBottom = design.height - m.margin;

  let plots: Rect[];
  let controls: ReturnType<typeof layoutControls>;
  let wrapWidth: number;
  if (orientation === "portrait") {
    const produceLines = 2;
    const controlsTop = bodyBottom - controlsHeight(m, produceLines);
    plots = layoutPlots({ x: m.margin, y: headerBottom, width: contentWidth, height: controlsTop - m.gap - headerBottom }, m);
    controls = layoutControls({ x: m.margin, y: controlsTop, width: contentWidth, height: 0 }, m, produceLines);
    wrapWidth = contentWidth;
  } else {
    const produceLines = 2;
    const panelWidth = Math.min(400, Math.max(280, design.width * 0.47));
    const panel = { x: design.width - m.margin - panelWidth, y: headerBottom, width: panelWidth, height: 0 };
    const gridArea = { x: m.margin, y: headerBottom, width: panel.x - 2 * m.gap - m.margin, height: bodyBottom - headerBottom };
    plots = layoutPlots(gridArea, m);
    controls = layoutControls(panel, m, produceLines);
    wrapWidth = panelWidth;
  }

  const overlayButtonWidth = Math.min(260, contentWidth);
  const overlayButton = {
    x: centerX - overlayButtonWidth / 2,
    y: design.height / 2,
    width: overlayButtonWidth,
    height: m.buttonHeight,
  };
  const overlayText = { x: centerX, y: design.height / 2 - m.buttonHeight - m.lineHeight };
  const plotWidth = plots[0]!.width;

  return {
    orientation,
    design,
    zoom,
    view,
    columns: PLOT_COLUMNS,
    fontSize: { title: m.titleSize, text: m.textSize, plot: Math.min(m.textSize, Math.floor(plotWidth / 8)) },
    title,
    status,
    stats,
    xpBar,
    plots,
    ...controls,
    wrapWidth,
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
