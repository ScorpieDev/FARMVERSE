/**
 * Farm scene: the player's 9 plots (locked ones show their unlock level), seed
 * buttons, inventory, coins, level and XP bar, the active quest with a Claim
 * button, and the live server connection status from Phase 0.
 *
 * Edit mode (Phase 3, "Edit farm"): the whole 8×8 farm grid with the crop
 * plots and placed decorations; select a decoration or object, Buy one
 * (coin shop, Step 3.4), tap a tile to place or move it, Rotate, Remove,
 * Done. Each change is sent to the server, which decides it (price, level,
 * coins, placement); the grid is redrawn from the server's answer.
 *
 * Character (Phase 4): the player's character is drawn small in the header;
 * tapping it opens the Character screen with a large preview, Hair / Shirt /
 * Pants / Skin tabs, Buy / Wear / Done. Items are tried on locally; Buy and
 * Wear go to the server and the preview follows the server's answer.
 *
 * The scene only shows server state and sends intentions (plant / harvest /
 * refill with a request ID). It never decides outcomes: after any rejected
 * action it reloads the farm from the server. Actions are locked while
 * offline, while another action is in flight, or when the browser cannot
 * create secure request IDs. Locks (plots, crops) and quest completion are
 * shown from the server state; the server enforces them again on every action.
 */
import { GameObjects, Input, Scale, Scene, type Time } from "phaser";
import type { BuyCosmeticResponse, BuyDecorationResponse, FarmState, ObjectActionResponse } from "@farmverse/shared/api";
import { isSkinTone, type CharacterAppearance } from "@farmverse/shared/character";
import { FARM_GRID_HEIGHT, FARM_GRID_WIDTH, footprint, plotTile, type DecorationId } from "@farmverse/shared/building";
import type { ErrorCode } from "@farmverse/shared/errors";
import { CROP_IDS, FARM_PLOT_COUNT, getCrop, getItem, type CropId } from "@farmverse/shared/farming";
import { cropUnlockLevel } from "@farmverse/shared/progression";
import {
  FarmApi,
  NetworkError,
  SessionInvalidError,
  createMemoryStorage,
  type ActionResult,
  type TokenStorage,
} from "../network/farmApi.js";
import { ServerConnection } from "../network/ServerConnection.js";
import { formatStatus, type ConnectionStatus, type StatusTone } from "../network/connectionStatus.js";
import { REQUEST_ID_UNSUPPORTED_MESSAGE, createRequestIdFactory } from "../network/requestId.js";
import { resolveServerUrls } from "../network/serverUrl.js";
import {
  clockFromState,
  emptyPlotHint,
  errorText,
  formatDuration,
  isCropLocked,
  isPlotLocked,
  levelLine,
  levelUpText,
  plotLevel,
  plotView,
  produceLine,
  questLine,
  refillLabel,
  rewardText,
  seedCount,
  serverNow,
  xpFraction,
  type ServerClock,
} from "./farmView.js";
import {
  DECORATION_ORDER,
  NO_SELECTION,
  buySuccessText,
  canAfford,
  editErrorText,
  editSuccessText,
  objectLabel,
  reconcileSelection,
  selectionText,
  stockLabel,
  isDecorationLocked,
  stockOf,
  tapBuy,
  tapDecoration,
  tapRemove,
  tapRotate,
  tapTile,
  type EditIntent,
  type EditSelection,
} from "./buildView.js";
import { characterShapes, fitCharacter } from "../character/characterDrawing.js";
import {
  CHARACTER_TABS,
  WEAR_SUCCESS_TEXT,
  buyCosmeticText,
  canBuy,
  canWear,
  characterErrorText,
  draftOption,
  draftText,
  isCosmeticLocked,
  optionLabel,
  startDraft,
  tabName,
  tabOptions,
  tapBuy as tapBuyCosmetic,
  tapOption,
  tapTab,
  tapWear,
  type CharacterDraft,
  type CharacterIntent,
  type CharacterTab,
} from "../character/characterView.js";
import type { DisplaySize } from "../core/display.js";
import { computeFarmLayout, designToScreen, textResolution, type FarmLayout, type Rect } from "./farmLayout.js";

/** Registry key of the current DisplaySize (set by main.ts). */
export const DISPLAY_KEY = "display";

const FONT = "system-ui, sans-serif";
/** Smallest font (design units) the quest lines shrink to on narrow screens. */
const MIN_QUEST_FONT = 11;
const COLORS = {
  text: "#fef3c7",
  muted: "#d9f99d",
  soil: 0x7c4a1e,
  growing: 0x4d7c0f,
  locked: 0x3f3f46,
  ready: 0xca8a04,
  bar: 0xbef264,
  border: 0xfef3c7,
  button: 0x166534,
  buttonSelected: 0xca8a04,
  buttonDisabled: 0x3f3f46,
  /** Unlocked decoration with none owned: selectable to buy. */
  buttonEmpty: 0x365314,
  overlay: 0x052e16,
  xpTrack: 0x052e16,
  grass: 0x3f6212,
  editBackground: 0x14532d,
  object: 0x92400e,
  building: 0x7f1d1d,
  objectSelected: 0xfde047,
  characterBackground: 0x14532d,
  preview: 0x3f6212,
};
const TONE_COLORS: Record<StatusTone, string> = { ok: "#bbf7d0", pending: "#fde68a", error: "#fecaca" };

interface Button {
  box: GameObjects.Rectangle;
  label: GameObjects.Text;
}

interface PlotWidget {
  box: GameObjects.Rectangle;
  bar: GameObjects.Rectangle;
  label: GameObjects.Text;
}

interface ObjectWidget {
  box: GameObjects.Rectangle;
  label: GameObjects.Text;
}

type Mode = "farm" | "edit" | "character";

function safeLocalStorage(): TokenStorage {
  try {
    const storage = window.localStorage;
    storage.getItem("farmverse.probe");
    return storage;
  } catch {
    return createMemoryStorage();
  }
}

export class FarmScene extends Scene {
  private connection: ServerConnection | undefined;
  private api!: FarmApi;
  private newRequestId: (() => string) | null = null;

  private state: FarmState | null = null;
  private clock: ServerClock = { offsetMs: 0 };
  private selectedCrop: CropId = "wheat";
  private connected = false;
  private busy = false;
  private sessionInvalid = false;

  private title!: GameObjects.Text;
  private status!: GameObjects.Text;
  private stats!: GameObjects.Text;
  private xpTrack!: GameObjects.Rectangle;
  private xpFill!: GameObjects.Rectangle;
  private questText!: GameObjects.Text;
  private claimButton!: Button;
  private produce!: GameObjects.Text;
  private message!: GameObjects.Text;
  private plots: PlotWidget[] = [];
  private seedButtons = new Map<CropId, Button>();
  private refillButton!: Button;
  private overlay!: { shade: GameObjects.Rectangle; text: GameObjects.Text; button: Button };
  private ticker: Time.TimerEvent | undefined;
  private currentLayout: FarmLayout | null = null;

  // Edit mode (Phase 3)
  private mode: Mode = "farm";
  private selection: EditSelection = NO_SELECTION;
  private editButton!: Button;
  private editBackground!: GameObjects.Rectangle;
  private tiles: GameObjects.Rectangle[] = [];
  private objectWidgets = new Map<number, ObjectWidget>();
  private decorationButtons = new Map<DecorationId, Button>();
  private rotateButton!: Button;
  private removeButton!: Button;
  private buyButton!: Button;
  private doneButton!: Button;
  private editMessage = "";
  /** Farm-mode message kept while editing. */
  private farmMessage = "";
  /** Objects and grid geometry the object widgets were last built for. */
  private objectWidgetsKey = "";

  // Character (Phase 4)
  private avatarBox!: GameObjects.Rectangle;
  private avatarGraphics!: GameObjects.Graphics;
  private characterBackground!: GameObjects.Rectangle;
  private previewBox!: GameObjects.Rectangle;
  private previewGraphics!: GameObjects.Graphics;
  private tabButtons = new Map<CharacterTab, Button>();
  private optionButtons: Button[] = [];
  private characterBuyButton!: Button;
  private wearButton!: Button;
  private characterDoneButton!: Button;
  private draft: CharacterDraft | null = null;
  private characterMessage = "";
  /** What each character drawing was last drawn for. */
  private drawnKeys = new Map<GameObjects.Graphics, string>();

  constructor() {
    super("FarmScene");
  }

  create(): void {
    this.title = this.addText("FARMVERSE", { fontStyle: "bold" }).setOrigin(0.5, 0);
    this.status = this.addText("").setOrigin(0.5, 0);
    this.stats = this.addText("").setOrigin(0.5, 0);
    this.xpTrack = this.add.rectangle(0, 0, 10, 6, COLORS.xpTrack).setOrigin(0, 0).setStrokeStyle(1, COLORS.border, 0.4);
    this.xpFill = this.add.rectangle(0, 0, 0, 6, COLORS.bar).setOrigin(0, 0);
    this.questText = this.addText("").setOrigin(0, 0);
    this.claimButton = this.addButton("Claim", () => void this.onClaimTap());
    this.produce = this.addText("", { align: "center" }).setOrigin(0.5, 0);
    this.message = this.addText("Loading your farm…", { align: "center" }).setOrigin(0.5, 0);

    for (let index = 0; index < FARM_PLOT_COUNT; index++) {
      const box = this.add.rectangle(0, 0, 10, 10, COLORS.soil).setStrokeStyle(2, COLORS.border, 0.4);
      const bar = this.add.rectangle(0, 0, 0, 6, COLORS.bar).setOrigin(0, 0.5);
      const label = this.addText("", { align: "center" }).setOrigin(0.5);
      box.setInteractive({ useHandCursor: true }).on("pointerdown", () => void this.onPlotTap(index));
      this.plots.push({ box, bar, label });
    }

    for (const cropId of CROP_IDS) {
      this.seedButtons.set(cropId, this.addButton("", () => this.selectCrop(cropId)));
    }
    this.refillButton = this.addButton("", () => void this.onRefillTap());
    this.editButton = this.addButton("Edit farm", () => this.setMode("edit"));
    // The header avatar is the Character button; created before the edit and
    // character screens so their backgrounds cover it.
    this.avatarBox = this.add.rectangle(0, 0, 10, 10, COLORS.button).setStrokeStyle(2, COLORS.border, 0.5);
    this.avatarBox.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.setMode("character"));
    this.avatarGraphics = this.add.graphics();
    this.createEditWidgets();
    this.createCharacterWidgets();

    const shade = this.add.rectangle(0, 0, 10, 10, COLORS.overlay, 0.94).setInteractive();
    const text = this.addText("Your farm could not be found on this device.", { align: "center" }).setOrigin(0.5);
    const button = this.addButton("Start a new farm", () => void this.onStartNewFarm());
    this.overlay = { shade, text, button };
    for (const object of [shade, text, button.box, button.label]) object.setDepth(2);
    this.setOverlayVisible(false);

    this.layout(this.scale.width, this.scale.height);
    this.scale.on(Scale.Events.RESIZE, this.onResize, this);
    this.input.on(Input.Events.POINTER_DOWN, this.onBackgroundTap, this);
    this.ticker = this.time.addEvent({ delay: 250, loop: true, callback: () => this.render() });

    const urls = resolveServerUrls(import.meta.env.VITE_SERVER_URL, window.location);
    this.newRequestId = createRequestIdFactory(globalThis.crypto);
    this.api = new FarmApi({ apiOrigin: urls.ok ? urls.urls.apiOrigin : "", storage: safeLocalStorage() });
    this.connection = new ServerConnection({ urls, onStatus: (status) => this.onConnectionStatus(status) });
    this.connection.start();

    this.events.once("shutdown", this.cleanUp, this);
    this.events.once("destroy", this.cleanUp, this);

    if (this.newRequestId === null) this.showMessage(REQUEST_ID_UNSUPPORTED_MESSAGE);
    void this.startSession();
    this.exposeDebugHooks();
  }

  // ---------- server state ----------

  private async startSession(): Promise<void> {
    try {
      await this.api.ensureSession();
      await this.reload();
    } catch (error) {
      this.handleError(error);
    }
  }

  private async reload(): Promise<void> {
    try {
      this.applyState(await this.api.loadFarm());
      if (this.message.text === "Loading your farm…") this.showMessage("Tap an empty plot to plant.");
    } catch (error) {
      this.handleError(error);
    }
  }

  private applyState(state: FarmState): void {
    this.state = state;
    if (this.mode === "character" && this.draft === null) this.draft = startDraft(state);
    this.clock = clockFromState(state, Date.now());
    this.selection = reconcileSelection(state, this.selection);
    this.render();
  }

  private handleError(error: unknown): void {
    if (error instanceof SessionInvalidError) {
      this.sessionInvalid = true;
      this.setOverlayVisible(true);
      return;
    }
    if (error instanceof NetworkError) {
      this.showMessage("Cannot reach the server. Your farm will refresh when the connection is back.");
      return;
    }
    console.error("[farm]", error);
    this.showMessage("Something went wrong. Please try again.");
  }

  private onConnectionStatus(status: ConnectionStatus): void {
    const display = formatStatus(status);
    this.status.setText(display.text).setColor(TONE_COLORS[display.tone]);
    const wasConnected = this.connected;
    this.connected = status.kind === "connected";
    // Back online: resynchronise with the server.
    if (this.connected && !wasConnected && this.state !== null && !this.sessionInvalid) {
      void this.reload();
    }
    this.render();
  }

  // ---------- actions ----------

  /** Returns a request ID when an action may be sent now, or explains why not. */
  private actionRequestId(): string | null {
    if (this.sessionInvalid || this.state === null || this.busy) return null;
    if (this.newRequestId === null) {
      this.showMessage(REQUEST_ID_UNSUPPORTED_MESSAGE);
      return null;
    }
    if (!this.connected) {
      this.showMessage("You are offline. Actions are paused until the connection is back.");
      return null;
    }
    return this.newRequestId();
  }

  private async send<T extends FarmState>(
    request: Promise<ActionResult<T>>,
    describe: (state: T) => string,
    describeError: (code: ErrorCode) => string = errorText,
  ): Promise<void> {
    this.busy = true;
    this.render();
    try {
      const before = this.state?.progression;
      const result = await request;
      if (result.ok) {
        this.applyState(result.state);
        const levelUp = before === undefined ? null : levelUpText(before, result.state.progression);
        this.showMessage(levelUp === null ? describe(result.state) : `${describe(result.state)}\n${levelUp}`);
      } else {
        this.showMessage(describeError(result.code));
        await this.reload();
      }
    } catch (error) {
      this.handleError(error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async onPlotTap(index: number): Promise<void> {
    const plot = this.state?.plots[index];
    if (this.state === null || plot === undefined || this.sessionInvalid) return;
    if (isPlotLocked(this.state, index)) {
      this.showMessage(`Plot ${index + 1} unlocks at level ${plotLevel(index)}.`);
      return;
    }

    const view = plotView(plot, serverNow(this.clock, Date.now()));
    if (view.kind === "growing") {
      this.showMessage(`${getCrop(view.cropId).name} is ready in ${formatDuration(view.remainingMs)}.`);
      return;
    }
    if (view.kind === "empty" && seedCount(this.state, this.selectedCrop) === 0) {
      this.showMessage(`No ${getCrop(this.selectedCrop).name} seeds left.`);
      return;
    }

    const requestId = this.actionRequestId();
    if (requestId === null) return;

    if (view.kind === "empty") {
      const cropId = this.selectedCrop;
      await this.send(this.api.plant({ requestId, plotIndex: index, cropId }), () => `Planted ${getCrop(cropId).name}.`);
    } else {
      await this.send(this.api.harvest({ requestId, plotIndex: index }), (state) =>
        `+${state.harvested.quantity} ${getItem(state.harvested.itemId).name} · +${state.reward.coins} coins · +${state.reward.xp} XP`,
      );
    }
  }

  private async onRefillTap(): Promise<void> {
    if (this.state === null) return;
    const label = refillLabel(this.state.seedRefill, serverNow(this.clock, Date.now()));
    if (label !== "Get free seeds") {
      if (label !== null) this.showMessage(`${label}.`);
      return;
    }
    const requestId = this.actionRequestId();
    if (requestId === null) return;
    await this.send(this.api.refillSeeds({ requestId }), () => "You received 5 seeds of each unlocked crop.");
  }

  private async onClaimTap(): Promise<void> {
    if (this.state?.quest?.complete !== true) return;
    const requestId = this.actionRequestId();
    if (requestId === null) return;
    await this.send(this.api.claimQuest({ requestId }), (state) => `Quest complete! ${rewardText(state.claimed.reward)}`);
  }

  private selectCrop(cropId: CropId): void {
    if (this.state !== null && isCropLocked(this.state, cropId)) {
      this.showMessage(`${getCrop(cropId).name} unlocks at level ${cropUnlockLevel(cropId)}.`);
      return;
    }
    this.selectedCrop = cropId;
    this.render();
  }

  private async onStartNewFarm(): Promise<void> {
    try {
      await this.api.startNewFarm();
      this.sessionInvalid = false;
      this.setOverlayVisible(false);
      this.showMessage("New farm created. Tap an empty plot to plant.");
      await this.reload();
    } catch (error) {
      this.handleError(error);
    }
  }

  /** Taps on empty space retry the connection when it is offline (Phase 0 behaviour). */
  private onBackgroundTap(_pointer: Input.Pointer, over: GameObjects.GameObject[]): void {
    if (over.length === 0) this.connection?.retry();
  }

  // ---------- rendering ----------

  /** Shows a message in the current mode's message area. */
  private showMessage(text: string): void {
    if (this.mode === "edit") {
      this.editMessage = text;
      this.render();
    } else if (this.mode === "character") {
      this.characterMessage = text;
      this.render();
    } else {
      this.message.setText(text);
    }
  }

  private render(): void {
    const state = this.state;
    const now = serverNow(this.clock, Date.now());
    const locked = !this.connected || this.busy || this.newRequestId === null;
    this.renderEdit(state, now, locked);
    this.renderCharacter(state, locked);
    if (this.mode !== "farm") return;

    this.avatarBox.setFillStyle(state === null ? COLORS.buttonDisabled : COLORS.button);
    if (state === null) {
      this.avatarGraphics.clear();
      this.drawnKeys.delete(this.avatarGraphics);
    } else if (this.currentLayout !== null) {
      const { avatar } = this.currentLayout;
      this.drawCharacter(this.avatarGraphics, state.character.appearance, { x: avatar.x + 2, y: avatar.y + 2, width: avatar.width - 4, height: avatar.height - 4 });
    }

    this.stats.setText(state === null ? "" : `Coins ${state.coins} · ${levelLine(state.progression)}`);
    this.xpTrack.setVisible(state !== null);
    this.xpFill.setVisible(state !== null);
    if (state !== null) this.xpFill.width = this.xpTrack.width * xpFraction(state.progression);
    this.produce.setText(state === null ? "" : produceLine(state));

    const quest = state === null ? "" : questLine(state.quest);
    if (quest !== this.questText.text) {
      this.questText.setText(quest);
      this.fitQuestText();
    }
    const claimable = state?.quest?.complete === true;
    this.claimButton.box.setVisible(claimable).setFillStyle(locked ? COLORS.buttonDisabled : COLORS.buttonSelected);
    this.claimButton.label.setVisible(claimable);

    this.plots.forEach(({ box, bar, label }, index) => {
      const plot = state?.plots[index];
      if (state === null || plot === undefined) {
        label.setText("");
        bar.setVisible(false);
        return;
      }
      if (isPlotLocked(state, index)) {
        box.setFillStyle(COLORS.locked).setAlpha(1);
        label.setText(`Locked\nLevel ${plotLevel(index)}`);
        bar.setVisible(false);
        return;
      }
      const view = plotView(plot, now);
      bar.setVisible(view.kind === "growing");
      if (view.kind === "empty") {
        box.setFillStyle(COLORS.soil);
        label.setText(`Empty\n${emptyPlotHint(state, this.selectedCrop)}`);
      } else if (view.kind === "growing") {
        box.setFillStyle(COLORS.growing);
        label.setText(`${getCrop(view.cropId).name}\n${formatDuration(view.remainingMs)}`);
        bar.width = (box.width - 16) * view.progress;
      } else {
        box.setFillStyle(COLORS.ready);
        label.setText(`${getCrop(view.cropId).name}\nReady!`);
      }
      box.setAlpha(locked ? 0.75 : 1);
    });

    const refill = state === null ? null : refillLabel(state.seedRefill, now);
    for (const [cropId, button] of this.seedButtons) {
      const count = state === null ? 0 : seedCount(state, cropId);
      const cropLocked = state !== null && isCropLocked(state, cropId);
      const name = getCrop(cropId).name;
      button.label.setText(cropLocked ? `${name}\nLevel ${cropUnlockLevel(cropId)}` : `${name}\n${count} seeds`);
      const color =
        cropId === this.selectedCrop && !cropLocked
          ? COLORS.buttonSelected
          : count === 0 || cropLocked
            ? COLORS.buttonDisabled
            : COLORS.button;
      button.box.setFillStyle(color);
      button.box.setVisible(refill === null);
      button.label.setVisible(refill === null);
    }
    this.refillButton.box.setVisible(refill !== null);
    this.refillButton.label.setVisible(refill !== null).setText(refill ?? "");
    this.refillButton.box.setFillStyle(refill === "Get free seeds" && !locked ? COLORS.buttonSelected : COLORS.buttonDisabled);
    this.editButton.box.setFillStyle(state === null ? COLORS.buttonDisabled : COLORS.button);
  }

  private setOverlayVisible(visible: boolean): void {
    this.overlay.shade.setVisible(visible);
    this.overlay.text.setVisible(visible);
    this.overlay.button.box.setVisible(visible);
    this.overlay.button.label.setVisible(visible);
  }

  private onResize(gameSize: { width: number; height: number }): void {
    this.layout(gameSize.width, gameSize.height);
  }

  /**
   * Lays the farm out for the canvas's CSS size (see farmLayout.ts) and zooms
   * the camera by CSS px per design unit × canvas pixels per CSS pixel.
   * `width` and `height` are the canvas drawing-buffer size in pixels.
   */
  private layout(width: number, height: number): void {
    const display = this.registry.get(DISPLAY_KEY) as DisplaySize | undefined;
    const renderScale = display?.renderScale ?? 1;
    const layout = computeFarmLayout(width / renderScale, height / renderScale);
    this.currentLayout = layout;
    const { fontSize, design } = layout;

    const camera = this.cameras.main;
    camera.setSize(width, height);
    camera.setZoom(layout.zoom * renderScale);
    camera.centerOn(design.width / 2, design.height / 2);

    const resolution = textResolution(layout, renderScale);
    for (const text of this.children.list) {
      if (text instanceof GameObjects.Text) text.setResolution(resolution);
    }

    this.title.setFontSize(fontSize.title).setPosition(layout.title.x, layout.title.y);
    this.status.setFontSize(fontSize.text).setPosition(layout.status.x, layout.status.y);
    this.stats.setFontSize(fontSize.text).setPosition(layout.stats.x, layout.stats.y);
    this.xpTrack.setSize(layout.xpBar.width, layout.xpBar.height).setPosition(layout.xpBar.x, layout.xpBar.y);
    this.xpFill.setSize(this.xpFill.width, layout.xpBar.height).setPosition(layout.xpBar.x, layout.xpBar.y);
    this.questText.setPosition(layout.questText.x, layout.questText.y);
    this.fitQuestText();
    this.placeButton(this.claimButton, layout.claimButton, fontSize.text);

    this.plots.forEach(({ box, bar, label }, index) => {
      const rect = layout.plots[index]!;
      this.placeRect(box, rect);
      label.setFontSize(fontSize.plot).setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2 - fontSize.plot * 0.2);
      bar.setPosition(rect.x + 8, rect.y + rect.height - 10);
    });

    CROP_IDS.forEach((cropId, index) => {
      const button = this.seedButtons.get(cropId);
      if (button !== undefined) this.placeButton(button, layout.seedButtons[index]!, fontSize.text);
    });
    this.placeButton(this.refillButton, layout.refillButton, fontSize.text);
    this.placeButton(this.editButton, layout.editButton, fontSize.text);
    this.placeRect(this.avatarBox, layout.avatar);
    this.layoutEdit(layout);
    this.layoutCharacter(layout);

    this.produce.setFontSize(fontSize.text).setWordWrapWidth(layout.wrapWidth).setPosition(layout.produce.x, layout.produce.y);
    this.message.setFontSize(fontSize.text).setWordWrapWidth(layout.wrapWidth).setPosition(layout.message.x, layout.message.y);

    this.placeRect(this.overlay.shade, layout.view);
    this.overlay.text
      .setFontSize(fontSize.text + 2)
      .setWordWrapWidth(layout.wrapWidth)
      .setPosition(layout.overlayText.x, layout.overlayText.y);
    this.placeButton(this.overlay.button, layout.overlayButton, fontSize.text);

    this.render();
  }

  // ---------- edit mode (Phase 3) ----------

  private createEditWidgets(): void {
    // Covers the farm-mode widgets (created after them, so drawn and hit-tested
    // on top); the status line, message and overlay have a higher depth.
    this.status.setDepth(1);
    this.message.setDepth(1);
    this.editBackground = this.add.rectangle(0, 0, 10, 10, COLORS.editBackground).setInteractive();
    for (let y = 0; y < FARM_GRID_HEIGHT; y++) {
      for (let x = 0; x < FARM_GRID_WIDTH; x++) {
        const tile = this.add.rectangle(0, 0, 10, 10, COLORS.grass).setStrokeStyle(1, COLORS.border, 0.25);
        tile.setInteractive({ useHandCursor: true }).on("pointerdown", () => void this.onTileTap(x, y));
        this.tiles.push(tile);
      }
    }
    for (const decorationId of DECORATION_ORDER) {
      this.decorationButtons.set(decorationId, this.addButton("", () => this.runIntent(this.editTapDecoration(decorationId))));
    }
    this.rotateButton = this.addButton("Rotate", () => this.state && void this.runIntent(tapRotate(this.state, this.selection)));
    this.removeButton = this.addButton("Remove", () => void this.runIntent(tapRemove(this.selection)));
    this.buyButton = this.addButton("Buy", () => void this.runIntent(tapBuy(this.selection)));
    this.doneButton = this.addButton("Done", () => this.setMode("farm"));
  }

  private editTapDecoration(decorationId: DecorationId): EditIntent {
    if (this.state === null) return { kind: "message", text: "Loading your farm…" };
    return tapDecoration(this.state, this.selection, decorationId);
  }

  private setMode(mode: Mode): void {
    if (mode !== "farm" && (this.state === null || this.sessionInvalid)) return;
    if (mode === this.mode) return;
    if (this.mode === "farm") this.farmMessage = this.message.text;
    if (mode === "farm") this.message.setText(this.farmMessage);
    this.mode = mode;
    this.selection = NO_SELECTION;
    this.editMessage = "";
    this.characterMessage = "";
    // A look tried on but not worn is dropped when the screen closes.
    this.draft = mode === "character" && this.state !== null ? startDraft(this.state) : null;
    if (this.currentLayout !== null) this.positionStatus(this.currentLayout);
    this.render();
  }

  private onTileTap(x: number, y: number): void {
    if (this.state === null || this.mode !== "edit") return;
    void this.runIntent(tapTile(this.state, this.selection, { x, y }));
  }

  /** Applies a local selection change or sends a change to the server. */
  private async runIntent(intent: EditIntent): Promise<void> {
    if (intent.kind === "select") {
      this.selection = intent.selection;
      this.editMessage = "";
      this.render();
      return;
    }
    if (intent.kind === "message") {
      this.showMessage(intent.text);
      return;
    }
    const requestId = this.actionRequestId();
    if (requestId === null) return;
    const describe = (kind: "place" | "move" | "rotate" | "remove") => (state: ObjectActionResponse) =>
      editSuccessText(kind, state.object);
    const describeError = (code: ErrorCode) => editErrorText(code) ?? errorText(code);
    switch (intent.kind) {
      case "place": {
        const { decorationId, x, y, rotation } = intent;
        await this.send(this.api.placeObject({ requestId, decorationId, x, y, rotation }), describe("place"), describeError);
        break;
      }
      case "move":
        await this.send(
          this.api.moveObject({ requestId, objectId: intent.objectId, x: intent.x, y: intent.y }),
          describe("move"),
          describeError,
        );
        break;
      case "rotate":
        await this.send(
          this.api.rotateObject({ requestId, objectId: intent.objectId, rotation: intent.rotation }),
          describe("rotate"),
          describeError,
        );
        break;
      case "remove":
        await this.send(this.api.removeObject({ requestId, objectId: intent.objectId }), describe("remove"), describeError);
        break;
      case "buy":
        await this.send(
          this.api.buyDecoration({ requestId, decorationId: intent.decorationId }),
          (state: BuyDecorationResponse) => buySuccessText(state.bought),
          describeError,
        );
        break;
    }
  }

  /** Shows the widgets of the current mode and draws the grid from the server state. */
  private renderEdit(state: FarmState | null, now: number, locked: boolean): void {
    const editing = this.mode === "edit";
    for (const object of this.editWidgetSet()) (object as GameObjects.Rectangle).setVisible(editing);
    if (!editing) return;
    if (state === null) return;

    // Crop plots, coloured by state (only the server changes them).
    this.tiles.forEach((tile) => tile.setFillStyle(COLORS.grass));
    state.plots.forEach((plot, index) => {
      const position = plotTile(index);
      const tile = position && this.tiles[position.y * FARM_GRID_WIDTH + position.x];
      if (tile === undefined) return;
      const view = plotView(plot, now);
      const color = isPlotLocked(state, index)
        ? COLORS.locked
        : view.kind === "empty"
          ? COLORS.soil
          : view.kind === "growing"
            ? COLORS.growing
            : COLORS.ready;
      tile.setFillStyle(color);
    });

    this.syncObjects(state);
    const selected = this.selection.kind === "object" ? this.selection.objectId : null;
    for (const [objectId, widget] of this.objectWidgets) {
      widget.box.setStrokeStyle(objectId === selected ? 4 : 2, objectId === selected ? COLORS.objectSelected : COLORS.border, 0.9);
    }

    for (const [decorationId, button] of this.decorationButtons) {
      button.label.setText(stockLabel(state, decorationId));
      const chosen = this.selection.kind === "decoration" && this.selection.decorationId === decorationId;
      const color = chosen
        ? COLORS.buttonSelected
        : isDecorationLocked(state, decorationId)
          ? COLORS.buttonDisabled
          : stockOf(state, decorationId) === 0
            ? COLORS.buttonEmpty
            : COLORS.button;
      button.box.setFillStyle(color);
    }
    const canChange = !locked && this.selection.kind === "object";
    this.rotateButton.box.setFillStyle(this.selection.kind === "none" || (locked && this.selection.kind === "object") ? COLORS.buttonDisabled : COLORS.button);
    this.removeButton.box.setFillStyle(canChange ? COLORS.button : COLORS.buttonDisabled);
    this.buyButton.box.setFillStyle(!locked && canAfford(state, this.selection) ? COLORS.buttonSelected : COLORS.buttonDisabled);
    this.message.setVisible(true).setText(this.editMessage === "" ? selectionText(state, this.selection) : `${this.editMessage}\n${selectionText(state, this.selection)}`);
  }

  private editWidgetSet(): Set<GameObjects.GameObject> {
    const set = new Set<GameObjects.GameObject>([this.editBackground, ...this.tiles]);
    for (const widget of this.objectWidgets.values()) set.add(widget.box).add(widget.label);
    const actions = [this.rotateButton, this.removeButton, this.buyButton, this.doneButton];
    for (const button of [...this.decorationButtons.values(), ...actions]) {
      set.add(button.box).add(button.label);
    }
    return set;
  }

  /** Recreates the object widgets when the server's object list changed. */
  private syncObjects(state: FarmState): void {
    const layout = this.currentLayout?.edit;
    if (layout === undefined) return;
    const key = JSON.stringify([state.objects, layout.grid, layout.tileSize, layout.fontSize.object]);
    if (key === this.objectWidgetsKey) return;
    this.objectWidgetsKey = key;
    for (const widget of this.objectWidgets.values()) {
      widget.box.destroy();
      widget.label.destroy();
    }
    this.objectWidgets.clear();
    const resolution = this.currentLayout === null ? 1 : textResolution(this.currentLayout, this.renderScale());
    for (const object of state.objects) {
      const area = footprint(object);
      const rect = {
        x: layout.grid.x + area.x * layout.tileSize + 2,
        y: layout.grid.y + area.y * layout.tileSize + 2,
        width: area.width * layout.tileSize - 4,
        height: area.height * layout.tileSize - 4,
      };
      const color = object.decorationId === "small_house" ? COLORS.building : COLORS.object;
      const box = this.add.rectangle(0, 0, 10, 10, color);
      this.placeRect(box, rect);
      const label = this.addText(objectLabel(object), { align: "center" })
        .setOrigin(0.5)
        .setWordWrapWidth(rect.width - 2)
        .setFontSize(layout.fontSize.object)
        .setResolution(resolution)
        .setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2);
      this.objectWidgets.set(object.objectId, { box, label });
    }
  }

  private renderScale(): number {
    return (this.registry.get(DISPLAY_KEY) as DisplaySize | undefined)?.renderScale ?? 1;
  }

  private layoutEdit(layout: FarmLayout): void {
    const { edit } = layout;
    this.placeRect(this.editBackground, layout.view);
    this.tiles.forEach((tile, index) => {
      const x = index % FARM_GRID_WIDTH;
      const y = Math.floor(index / FARM_GRID_WIDTH);
      this.placeRect(tile, {
        x: edit.grid.x + x * edit.tileSize,
        y: edit.grid.y + y * edit.tileSize,
        width: edit.tileSize,
        height: edit.tileSize,
      });
    });
    DECORATION_ORDER.forEach((decorationId, index) => {
      const button = this.decorationButtons.get(decorationId);
      if (button !== undefined) this.placeButton(button, edit.decorationButtons[index]!, edit.fontSize.button);
    });
    this.placeButton(this.rotateButton, edit.rotateButton, edit.fontSize.action);
    this.placeButton(this.removeButton, edit.removeButton, edit.fontSize.action);
    this.placeButton(this.buyButton, edit.buyButton, edit.fontSize.action);
    this.placeButton(this.doneButton, edit.doneButton, edit.fontSize.action);
    this.positionStatus(layout);
  }

  /** The status line and the message move into the edit or character panel in those modes. */
  private positionStatus(layout: FarmLayout): void {
    if (this.mode === "character") {
      const { character } = layout;
      this.status.setPosition(character.status.x, character.status.y);
      this.message.setWordWrapWidth(character.wrapWidth).setPosition(character.message.x, character.message.y);
    } else if (this.mode === "edit") {
      this.status.setPosition(layout.edit.status.x, layout.edit.status.y);
      this.message.setWordWrapWidth(layout.edit.wrapWidth).setPosition(layout.edit.message.x, layout.edit.message.y);
    } else {
      this.status.setPosition(layout.status.x, layout.status.y);
      this.message.setWordWrapWidth(layout.wrapWidth).setPosition(layout.message.x, layout.message.y);
    }
  }

  // ---------- character (Phase 4) ----------

  private createCharacterWidgets(): void {
    // Covers the farm and edit widgets; the status line, message and overlay are drawn above.
    this.characterBackground = this.add.rectangle(0, 0, 10, 10, COLORS.characterBackground).setInteractive();
    this.previewBox = this.add.rectangle(0, 0, 10, 10, COLORS.preview).setStrokeStyle(2, COLORS.border, 0.4);
    this.previewGraphics = this.add.graphics();
    for (const tab of CHARACTER_TABS) {
      this.tabButtons.set(tab, this.addButton(tabName(tab), () => void this.runCharacterIntent(this.draft && tapTab(this.draft, tab))));
    }
    for (let index = 0; index < 4; index++) {
      this.optionButtons.push(this.addButton("", () => this.onOptionTap(index)));
    }
    this.characterBuyButton = this.addButton("Buy", () =>
      void this.runCharacterIntent(this.state && this.draft && tapBuyCosmetic(this.state, this.draft)),
    );
    this.wearButton = this.addButton("Wear", () => void this.runCharacterIntent(this.state && this.draft && tapWear(this.state, this.draft)));
    this.characterDoneButton = this.addButton("Done", () => this.setMode("farm"));
  }

  private onOptionTap(index: number): void {
    if (this.state === null || this.draft === null) return;
    const option = tabOptions(this.draft.tab)[index];
    if (option !== undefined) void this.runCharacterIntent(tapOption(this.state, this.draft, option));
  }

  /** Applies a local draft change or sends a purchase / equip to the server. */
  private async runCharacterIntent(intent: CharacterIntent | null): Promise<void> {
    if (intent === null || this.mode !== "character") return;
    if (intent.kind === "select") {
      this.draft = intent.draft;
      this.characterMessage = "";
      this.render();
      return;
    }
    if (intent.kind === "message") {
      this.showMessage(intent.text);
      return;
    }
    const requestId = this.actionRequestId();
    if (requestId === null) return;
    const describeError = (code: ErrorCode) => characterErrorText(code) ?? errorText(code);
    if (intent.kind === "buy") {
      await this.send(
        this.api.buyCosmetic({ requestId, cosmeticId: intent.cosmeticId }),
        (state: BuyCosmeticResponse) => buyCosmeticText(state.bought),
        describeError,
      );
    } else {
      await this.send(this.api.equipCharacter({ requestId, appearance: intent.appearance }), () => WEAR_SUCCESS_TEXT, describeError);
    }
  }

  private characterWidgets(): GameObjects.GameObject[] {
    const buttons = [...this.tabButtons.values(), ...this.optionButtons, this.characterBuyButton, this.wearButton, this.characterDoneButton];
    return [this.characterBackground, this.previewBox, this.previewGraphics, ...buttons.flatMap((button) => [button.box, button.label])];
  }

  /** Shows the Character screen in character mode and draws the draft look. */
  private renderCharacter(state: FarmState | null, locked: boolean): void {
    const open = this.mode === "character";
    for (const object of this.characterWidgets()) (object as GameObjects.Rectangle).setVisible(open);
    const draft = this.draft;
    if (!open || state === null || draft === null || this.currentLayout === null) return;

    this.drawCharacter(this.previewGraphics, draft.appearance, this.currentLayout.character.preview);
    for (const [tab, button] of this.tabButtons) {
      button.box.setFillStyle(tab === draft.tab ? COLORS.buttonSelected : COLORS.button);
    }
    const options = tabOptions(draft.tab);
    const chosen = draftOption(draft);
    this.optionButtons.forEach((button, index) => {
      const option = options[index];
      const shown = option !== undefined;
      button.box.setVisible(shown);
      button.label.setVisible(shown);
      if (!shown) return;
      button.label.setText(optionLabel(state, option));
      const color =
        option === chosen
          ? COLORS.buttonSelected
          : !isSkinTone(option) && isCosmeticLocked(state, option)
            ? COLORS.buttonDisabled
            : COLORS.button;
      button.box.setFillStyle(color);
    });
    this.characterBuyButton.box.setFillStyle(!locked && canBuy(state, draft) ? COLORS.buttonSelected : COLORS.buttonDisabled);
    this.wearButton.box.setFillStyle(!locked && canWear(state, draft) ? COLORS.buttonSelected : COLORS.buttonDisabled);
    const hint = draftText(state, draft);
    this.message.setVisible(true).setText(this.characterMessage === "" ? hint : `${this.characterMessage}\n${hint}`);
  }

  private layoutCharacter(layout: FarmLayout): void {
    const { character } = layout;
    this.placeRect(this.characterBackground, layout.view);
    this.placeRect(this.previewBox, character.preview);
    CHARACTER_TABS.forEach((tab, index) => {
      const button = this.tabButtons.get(tab);
      if (button !== undefined) this.placeButton(button, character.tabButtons[index]!, character.fontSize.action);
    });
    this.optionButtons.forEach((button, index) => this.placeButton(button, character.optionButtons[index]!, character.fontSize.option));
    this.placeButton(this.characterBuyButton, character.buyButton, character.fontSize.action);
    this.placeButton(this.wearButton, character.wearButton, character.fontSize.action);
    this.placeButton(this.characterDoneButton, character.doneButton, character.fontSize.action);
    // Drawings depend on the layout: redraw on the next render.
    this.drawnKeys.clear();
    this.positionStatus(layout);
  }

  /** Draws a character (characterDrawing.ts) into `rect`; skipped when nothing changed. */
  private drawCharacter(graphics: GameObjects.Graphics, appearance: CharacterAppearance, rect: Rect): void {
    const key = JSON.stringify([appearance, rect]);
    if (this.drawnKeys.get(graphics) === key) return;
    this.drawnKeys.set(graphics, key);
    const { scale, x, y } = fitCharacter(rect);
    graphics.clear();
    for (const shape of characterShapes(appearance)) {
      graphics.fillStyle(shape.color, 1);
      if (shape.kind === "rect") {
        graphics.fillRect(x + shape.x * scale, y + shape.y * scale, shape.width * scale, shape.height * scale);
      } else if (shape.kind === "circle") {
        graphics.fillCircle(x + shape.x * scale, y + shape.y * scale, shape.radius * scale);
      } else {
        const [x1, y1, x2, y2, x3, y3] = shape.points;
        graphics.fillTriangle(x + x1 * scale, y + y1 * scale, x + x2 * scale, y + y2 * scale, x + x3 * scale, y + y3 * scale);
      }
    }
  }

  // ---------- helpers ----------

  /**
   * Keeps the two quest lines inside their box (beside Claim) by shrinking the
   * font, never below MIN_QUEST_FONT, instead of wrapping into a third line.
   */
  private fitQuestText(): void {
    const box = this.currentLayout?.questText;
    if (box === undefined) return;
    let size = this.currentLayout!.fontSize.text;
    this.questText.setFontSize(size);
    while (size > MIN_QUEST_FONT && (this.questText.width > box.width || this.questText.height > box.height)) {
      size -= 1;
      this.questText.setFontSize(size);
    }
  }

  private addText(text: string, style: Partial<GameObjects.TextStyle> = {}): GameObjects.Text {
    return this.add.text(0, 0, text, { fontFamily: FONT, color: COLORS.text, ...style });
  }

  private addButton(text: string, onTap: () => void): Button {
    const box = this.add.rectangle(0, 0, 10, 10, COLORS.button).setStrokeStyle(2, COLORS.border, 0.5);
    box.setInteractive({ useHandCursor: true }).on("pointerdown", onTap);
    const label = this.addText(text, { align: "center", fontStyle: "bold" }).setOrigin(0.5);
    return { box, label };
  }

  /** Sizes and positions a centre-origin rectangle (and its hit area) to a top-left rect. */
  private placeRect(box: GameObjects.Rectangle, rect: Rect): void {
    box.setSize(rect.width, rect.height).setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2);
    box.input?.hitArea.setTo(0, 0, rect.width, rect.height);
  }

  private placeButton(button: Button, rect: Rect, textSize: number): void {
    this.placeRect(button.box, rect);
    button.label.setFontSize(textSize).setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2);
  }

  /** Development-only hooks for automated browser checks (stripped from production builds). */
  private exposeDebugHooks(): void {
    if (!import.meta.env.DEV) return;
    // Canvas CSS-pixel coordinates of an object's centre, ready for pointer events.
    const center = (object: GameObjects.Rectangle) =>
      this.currentLayout === null ? { x: object.x, y: object.y } : designToScreen(this.currentLayout, object.x, object.y);
    (window as unknown as { __farmverse: unknown }).__farmverse = {
      state: () => this.state,
      message: () => this.message.text,
      plot: (index: number) => center(this.plots[index]!.box),
      seedButton: (cropId: CropId) => center(this.seedButtons.get(cropId)!.box),
      refillButton: () => center(this.refillButton.box),
      claimButton: () => (this.claimButton.box.visible ? center(this.claimButton.box) : null),
      questText: () => this.questText.text,
      // Quest text size and font in design units, to check it stays inside layout.questText.
      questBounds: () => ({
        width: this.questText.width,
        height: this.questText.height,
        fontSize: Number.parseFloat(String(this.questText.style.fontSize)),
      }),
      stats: () => this.stats.text,
      overlayVisible: () => this.overlay.shade.visible,
      newFarmButton: () => center(this.overlay.button.box),
      layout: () => this.currentLayout,
      // Edit mode (Phase 3)
      mode: () => this.mode,
      busy: () => this.busy,
      selection: () => this.selection,
      editMessage: () => this.editMessage,
      editButton: () => center(this.editButton.box),
      tile: (x: number, y: number) => center(this.tiles[y * FARM_GRID_WIDTH + x]!),
      decorationButton: (id: DecorationId) => center(this.decorationButtons.get(id)!.box),
      rotateButton: () => center(this.rotateButton.box),
      removeButton: () => center(this.removeButton.box),
      buyButton: () => center(this.buyButton.box),
      doneButton: () => center(this.doneButton.box),
      // Character (Phase 4)
      draft: () => this.draft,
      characterMessage: () => this.characterMessage,
      avatar: () => center(this.avatarBox),
      tabButton: (tab: CharacterTab) => center(this.tabButtons.get(tab)!.box),
      optionButton: (index: number) => center(this.optionButtons[index]!.box),
      characterBuyButton: () => center(this.characterBuyButton.box),
      wearButton: () => center(this.wearButton.box),
      characterDoneButton: () => center(this.characterDoneButton.box),
    };
  }

  /** Runs on shutdown and on destroy; only the first call does anything. */
  private cleanUp(): void {
    if (!this.connection) return;
    this.connection.dispose();
    this.connection = undefined;
    this.ticker?.remove();
    this.scale.off(Scale.Events.RESIZE, this.onResize, this);
    this.input.off(Input.Events.POINTER_DOWN, this.onBackgroundTap, this);
  }
}
