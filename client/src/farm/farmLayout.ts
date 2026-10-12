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
  /** Opens edit mode (the free slot beside the second row of seed buttons). */
  editButton: Rect;
  /** Edit mode: the farm grid fills the screen, controls beside or below it. */
  edit: EditLayout;
  /** Small character in the header (Phase 4); tapping it opens the Character screen. */
  avatar: Rect;
  /** Character screen (Phase 4): large preview, tabs, items and actions. */
  character: CharacterLayout;
  /** Opens the Visit screen (Phase 5): right of the header, mirroring the avatar. */
  visitButton: Rect;
  /** Visit screen (Phase 5): own farm code, online list, farm-code entry. */
  visit: VisitLayout;
  /** Farm room (Phase 5): the visited farm's grid with characters, emotes and Leave. */
  room: RoomLayout;
}

/** Visit screen layout (Phase 5, decision F-A). */
export interface VisitLayout {
  status: TextSpot;
  /** "Your farm code: …" line. */
  codeLine: TextSpot;
  /** My farm / Enter code / Refresh / Back. */
  actionButtons: Rect[];
  /** One button per listed online player (as many as fit, at most 20). */
  listButtons: Rect[];
  message: TextSpot;
  wrapWidth: number;
  fontSize: { action: number; list: number };
}

/** Farm room layout (Phase 5, decisions R-A, M-A): the 8×8 grid and a small panel. */
export interface RoomLayout {
  grid: Rect;
  tileSize: number;
  status: TextSpot;
  /** "Farmer 1234's farm (ABC234) · 1 other player here". */
  title: TextSpot;
  /** The four emotes then Leave, in one row. */
  emoteButtons: Rect[];
  leaveButton: Rect;
  message: TextSpot;
  wrapWidth: number;
  fontSize: { button: number; name: number };
}

/** Character screen layout (Phase 4, decision D-A). */
export interface CharacterLayout {
  /** Box the character preview is drawn in (centred, aspect kept). */
  preview: Rect;
  /** Connection status line. */
  status: TextSpot;
  /** Hair / Shirt / Pants / Skin. */
  tabButtons: Rect[];
  /** One button per option of the current tab (4 in every tab). */
  optionButtons: Rect[];
  buyButton: Rect;
  wearButton: Rect;
  doneButton: Rect;
  /** Selection and result text, wrapped to `wrapWidth`. */
  message: TextSpot;
  wrapWidth: number;
  fontSize: { option: number; action: number };
}

/** Edit mode layout (Phase 3): FARM_GRID_WIDTH × FARM_GRID_HEIGHT square tiles. */
export interface EditLayout {
  /** The whole grid; tile (x, y) is at grid.x + x × tileSize, grid.y + y × tileSize. */
  grid: Rect;
  tileSize: number;
  /** Connection status line. */
  status: TextSpot;
  /** One button per decoration, in catalog order. */
  decorationButtons: Rect[];
  rotateButton: Rect;
  removeButton: Rect;
  /** Buys one of the selected decoration (Step 3.4 shop). */
  buyButton: Rect;
  doneButton: Rect;
  /** Selection and result text, wrapped to `wrapWidth`. */
  message: TextSpot;
  wrapWidth: number;
  fontSize: { button: number; action: number; object: number };
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
/** Farm grid tiles per side (shared building.ts FARM_GRID_WIDTH / FARM_GRID_HEIGHT). */
const GRID_TILES = 8;
/** One button per decoration (shared building.ts DECORATIONS). */
const DECORATION_BUTTONS = 7;
/** Space around the grid in edit mode: small, so tiles stay ≥ 44 units on the minimum frame. */
const EDIT_MARGIN = 4;
const SEED_BUTTONS_PER_ROW = 3;
/** Character screen: tabs (hair, shirt, pants, skin) and options per tab (shared character.ts). */
const CHARACTER_TABS = 4;
const CHARACTER_OPTIONS = 4;
/** Options in a 2×2 block, so two-word names ("Green Shorts") fit on one line. */
const CHARACTER_OPTIONS_PER_ROW = 2;
/** Header avatar width; tall enough to fill the header beside the title. */
const AVATAR_WIDTH = 44;
/** Visit screen: My farm, Enter code, Refresh, Back. */
const VISIT_ACTIONS = 4;
/** Most entries in the online list (shared presence.ts ONLINE_LIST_LIMIT). */
const ONLINE_LIST_LIMIT = 20;
/** Room panel: four emotes and Leave. */
const ROOM_BUTTONS = 5;
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
  // Narrow enough to leave room for the two quest lines on small landscape screens.
  const claimWidth = Math.min(84, column.width / 3);
  const questText = {
    x: column.x,
    y: column.y + (m.buttonHeight - 2 * m.lineHeight) / 2,
    width: column.width - claimWidth - m.gap,
    height: 2 * m.lineHeight,
  };
  const claimButton = { x: column.x + column.width - claimWidth, y: column.y, width: claimWidth, height: m.buttonHeight };

  const seedTop = column.y + m.buttonHeight + m.gap;
  const seedArea = { x: column.x, y: seedTop, width: column.width, height: 0 };
  // The cell after the last seed button holds the Edit button.
  const cells = cellRows(SEED_BUTTONS + 1, SEED_BUTTONS_PER_ROW, seedArea, m.gap, m.maxCellWidth, m.buttonHeight);
  const seedButtons = cells.slice(0, SEED_BUTTONS);
  const editButton = cells[SEED_BUTTONS]!;
  const firstRow = seedButtons.slice(0, SEED_BUTTONS_PER_ROW);
  const rowLeft = firstRow[0]!.x;
  const rowRight = firstRow[firstRow.length - 1]!;
  const refillButton = { x: rowLeft, y: seedTop, width: rowRight.x + rowRight.width - rowLeft, height: m.buttonHeight };
  const seedRows = Math.ceil(SEED_BUTTONS / SEED_BUTTONS_PER_ROW);

  const centerX = column.x + column.width / 2;
  const produce = { x: centerX, y: seedTop + seedRows * m.buttonHeight + (seedRows - 1) * m.gap + m.gap };
  const message = { x: centerX, y: produce.y + produceLines * m.lineHeight };
  return { questText, claimButton, seedButtons, refillButton, editButton, produce, message };
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

/** Buttons in rows of `perRow`, left-aligned in `area`, all the same width. */
function buttonRows(count: number, perRow: number, area: Rect, gap: number, height: number): Rect[] {
  const width = (area.width - (perRow - 1) * gap) / perRow;
  return Array.from({ length: count }, (_, index) => ({
    x: area.x + (index % perRow) * (width + gap),
    y: area.y + Math.floor(index / perRow) * (height + gap),
    width,
    height,
  }));
}

/**
 * Edit mode: the grid as large as fits (portrait: full width at the top;
 * landscape: full height on the left), then in the remaining column the
 * status line, decoration buttons, Rotate / Remove / Buy / Done and the message.
 */
function layoutEdit(design: Size, orientation: Orientation, m: Metrics): EditLayout {
  const gap = Math.min(m.gap, 8);
  const perRow = orientation === "portrait" ? 4 : 3;
  const decorationRows = Math.ceil(DECORATION_BUTTONS / perRow);
  const panelHeight =
    m.lineHeight + gap + decorationRows * m.buttonHeight + (decorationRows - 1) * gap + gap + m.buttonHeight + gap + 2 * m.lineHeight;

  let grid: Rect;
  let panel: Rect;
  if (orientation === "portrait") {
    const size = Math.min(design.width - 2 * EDIT_MARGIN, design.height - 2 * EDIT_MARGIN - gap - panelHeight);
    grid = { x: (design.width - size) / 2, y: EDIT_MARGIN, width: size, height: size };
    panel = { x: m.margin, y: grid.y + size + gap, width: design.width - 2 * m.margin, height: panelHeight };
  } else {
    const size = Math.min(design.height - 2 * EDIT_MARGIN, design.width * 0.6);
    grid = { x: EDIT_MARGIN, y: (design.height - size) / 2, width: size, height: size };
    const left = grid.x + size + gap;
    panel = { x: left, y: EDIT_MARGIN, width: design.width - left - m.margin, height: panelHeight };
  }

  const status = { x: panel.x + panel.width / 2, y: panel.y };
  const decorationArea = { x: panel.x, y: panel.y + m.lineHeight + gap, width: panel.width, height: 0 };
  const decorationButtons = buttonRows(DECORATION_BUTTONS, perRow, decorationArea, gap, m.buttonHeight);
  const actionsTop = decorationArea.y + decorationRows * (m.buttonHeight + gap);
  const [rotateButton, removeButton, buyButton, doneButton] = buttonRows(
    4,
    4,
    { x: panel.x, y: actionsTop, width: panel.width, height: 0 },
    gap,
    m.buttonHeight,
  ) as [Rect, Rect, Rect, Rect];
  const tileSize = grid.width / GRID_TILES;
  const buttonWidth = decorationButtons[0]!.width;
  return {
    grid,
    tileSize,
    status,
    decorationButtons,
    rotateButton,
    removeButton,
    buyButton,
    doneButton,
    message: { x: status.x, y: actionsTop + m.buttonHeight + gap },
    wrapWidth: panel.width,
    // "Small House" must fit on one line of a decoration button.
    fontSize: {
      button: Math.min(m.textSize, Math.floor(buttonWidth / 7)),
      // "Remove" (bold, about 4.5 font units wide) must fit on an action button with a margin.
      action: Math.min(m.textSize - 1, Math.floor((rotateButton.width - 8) / 4.5)),
      object: Math.min(12, Math.floor(tileSize / 4)),
    },
  };
}

/**
 * Character screen: the preview as large as fits (portrait: top; landscape:
 * left), then the status line, a row of tabs, the options in two rows of two,
 * Buy / Wear / Done and the message.
 */
function layoutCharacter(design: Size, orientation: Orientation, m: Metrics): CharacterLayout {
  const gap = Math.min(m.gap, 8);
  const optionRows = CHARACTER_OPTIONS / CHARACTER_OPTIONS_PER_ROW;
  const panelHeight = m.lineHeight + gap + (2 + optionRows) * (m.buttonHeight + gap) + 2 * m.lineHeight;

  let preview: Rect;
  let panel: Rect;
  if (orientation === "portrait") {
    preview = {
      x: m.margin,
      y: EDIT_MARGIN,
      width: design.width - 2 * m.margin,
      height: design.height - 2 * EDIT_MARGIN - gap - panelHeight,
    };
    panel = { x: m.margin, y: preview.y + preview.height + gap, width: design.width - 2 * m.margin, height: panelHeight };
  } else {
    const width = Math.min(design.height - 2 * EDIT_MARGIN, design.width * 0.4);
    preview = { x: EDIT_MARGIN, y: EDIT_MARGIN, width, height: design.height - 2 * EDIT_MARGIN };
    const left = preview.x + width + gap;
    panel = { x: left, y: EDIT_MARGIN, width: design.width - left - m.margin, height: panelHeight };
  }

  const status = { x: panel.x + panel.width / 2, y: panel.y };
  const row = (index: number, count: number, perRow = count) =>
    buttonRows(count, perRow, { x: panel.x, y: panel.y + m.lineHeight + gap + index * (m.buttonHeight + gap), width: panel.width, height: 0 }, gap, m.buttonHeight);
  const tabButtons = row(0, CHARACTER_TABS);
  const optionButtons = row(1, CHARACTER_OPTIONS, CHARACTER_OPTIONS_PER_ROW);
  const [buyButton, wearButton, doneButton] = row(1 + optionRows, 3) as [Rect, Rect, Rect];
  const optionWidth = optionButtons[0]!.width;
  return {
    preview,
    status,
    tabButtons,
    optionButtons,
    buyButton,
    wearButton,
    doneButton,
    message: { x: status.x, y: doneButton.y + m.buttonHeight + gap },
    wrapWidth: panel.width,
    fontSize: {
      // "Green Shorts" (about 8 font units wide in bold) must fit on one line of an option button.
      option: Math.min(m.textSize - 1, Math.floor((optionWidth - 8) / 8)),
      action: m.textSize - 1,
    },
  };
}

/** Visit screen: header lines, a row of actions, then the online list (two columns in landscape). */
function layoutVisit(design: Size, orientation: Orientation, m: Metrics): VisitLayout {
  const gap = Math.min(m.gap, 8);
  const column = { x: m.margin, width: design.width - 2 * m.margin };
  const centerX = column.x + column.width / 2;
  const status = { x: centerX, y: EDIT_MARGIN };
  const codeLine = { x: centerX, y: status.y + m.lineHeight };
  const actionsTop = codeLine.y + m.lineHeight + gap;
  const actionButtons = buttonRows(VISIT_ACTIONS, VISIT_ACTIONS, { x: column.x, y: actionsTop, width: column.width, height: 0 }, gap, m.buttonHeight);
  const listTop = actionsTop + m.buttonHeight + gap;
  const messageLines = 2;
  const listHeight = design.height - EDIT_MARGIN - messageLines * m.lineHeight - listTop;
  const columns = orientation === "landscape" ? 2 : 1;
  const rowHeight = Math.max(44, m.buttonHeight - 6);
  const rows = Math.max(1, Math.floor((listHeight + gap) / (rowHeight + gap)));
  const listButtons = buttonRows(
    Math.min(ONLINE_LIST_LIMIT, rows * columns),
    columns,
    { x: column.x, y: listTop, width: column.width, height: 0 },
    gap,
    rowHeight,
  );
  const actionWidth = actionButtons[0]!.width;
  return {
    status,
    codeLine,
    actionButtons,
    listButtons,
    message: { x: centerX, y: listTop + rows * (rowHeight + gap) },
    wrapWidth: column.width,
    fontSize: {
      // "Enter code" in bold is about 6 font units wide.
      action: Math.min(m.textSize - 1, Math.floor((actionWidth - 8) / 6)),
      list: m.textSize - 1,
    },
  };
}

/** Farm room: the grid as large as fits (portrait: top; landscape: left) and a small panel. */
function layoutRoom(design: Size, orientation: Orientation, m: Metrics): RoomLayout {
  const gap = Math.min(m.gap, 8);
  const panelHeight = 2 * m.lineHeight + gap + m.buttonHeight + gap + 2 * m.lineHeight;
  let grid: Rect;
  let panel: Rect;
  if (orientation === "portrait") {
    const size = Math.min(design.width - 2 * EDIT_MARGIN, design.height - 2 * EDIT_MARGIN - gap - panelHeight);
    grid = { x: (design.width - size) / 2, y: EDIT_MARGIN, width: size, height: size };
    panel = { x: m.margin, y: grid.y + size + gap, width: design.width - 2 * m.margin, height: panelHeight };
  } else {
    const size = Math.min(design.height - 2 * EDIT_MARGIN, design.width * 0.6);
    grid = { x: EDIT_MARGIN, y: (design.height - size) / 2, width: size, height: size };
    const left = grid.x + size + gap;
    panel = { x: left, y: EDIT_MARGIN, width: design.width - left - m.margin, height: panelHeight };
  }
  const centerX = panel.x + panel.width / 2;
  const status = { x: centerX, y: panel.y };
  const title = { x: centerX, y: panel.y + m.lineHeight };
  const buttons = buttonRows(ROOM_BUTTONS, ROOM_BUTTONS, { x: panel.x, y: title.y + m.lineHeight + gap, width: panel.width, height: 0 }, gap, m.buttonHeight);
  const leaveButton = buttons[ROOM_BUTTONS - 1]!;
  const tileSize = grid.width / GRID_TILES;
  return {
    grid,
    tileSize,
    status,
    title,
    emoteButtons: buttons.slice(0, ROOM_BUTTONS - 1),
    leaveButton,
    message: { x: centerX, y: leaveButton.y + m.buttonHeight + gap },
    wrapWidth: panel.width,
    fontSize: {
      // "Laugh" / "Leave" in bold are about 3.2 font units wide.
      button: Math.min(m.textSize - 1, Math.floor((leaveButton.width - 6) / 3.4)),
      name: Math.min(11, Math.max(8, Math.floor(tileSize / 5))),
    },
  };
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
    edit: layoutEdit(design, orientation, m),
    // Left of the header, beside the centred title / stats / XP bar.
    avatar: { x: m.margin, y: m.margin, width: AVATAR_WIDTH, height: headerBottom - m.gap - m.margin },
    character: layoutCharacter(design, orientation, m),
    // Right of the header, mirroring the avatar.
    visitButton: {
      x: design.width - m.margin - AVATAR_WIDTH,
      y: m.margin,
      width: AVATAR_WIDTH,
      height: headerBottom - m.gap - m.margin,
    },
    visit: layoutVisit(design, orientation, m),
    room: layoutRoom(design, orientation, m),
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
