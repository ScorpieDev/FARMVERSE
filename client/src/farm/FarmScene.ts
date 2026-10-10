/**
 * Farm scene (Phase 1): the player's 6 plots, seed buttons, inventory, coins
 * and XP, plus the live server connection status from Phase 0.
 *
 * The scene only shows server state and sends intentions (plant / harvest /
 * refill with a request ID). It never decides outcomes: after any rejected
 * action it reloads the farm from the server. Actions are locked while
 * offline, while another action is in flight, or when the browser cannot
 * create secure request IDs.
 */
import { GameObjects, Input, Scale, Scene, type Time } from "phaser";
import type { FarmState } from "@farmverse/shared/api";
import { CROP_IDS, getCrop, getItem, type CropId, type ItemId } from "@farmverse/shared/farming";
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
  inventoryLine,
  plotView,
  refillLabel,
  seedCount,
  serverNow,
  type ServerClock,
} from "./farmView.js";
import { computeFarmLayout, designToScreen, textResolution, type FarmLayout, type Rect } from "./farmLayout.js";

const FONT = "system-ui, sans-serif";
const COLORS = {
  text: "#fef3c7",
  muted: "#d9f99d",
  soil: 0x7c4a1e,
  growing: 0x4d7c0f,
  ready: 0xca8a04,
  bar: 0xbef264,
  border: 0xfef3c7,
  button: 0x166534,
  buttonSelected: 0xca8a04,
  buttonDisabled: 0x3f3f46,
  overlay: 0x052e16,
};
const TONE_COLORS: Record<StatusTone, string> = { ok: "#bbf7d0", pending: "#fde68a", error: "#fecaca" };
const PRODUCE_IDS: readonly ItemId[] = CROP_IDS.map((id) => getCrop(id).produceItemId);

interface Button {
  box: GameObjects.Rectangle;
  label: GameObjects.Text;
}

interface PlotWidget {
  box: GameObjects.Rectangle;
  bar: GameObjects.Rectangle;
  label: GameObjects.Text;
}

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
  private produce!: GameObjects.Text;
  private message!: GameObjects.Text;
  private plots: PlotWidget[] = [];
  private seedButtons = new Map<CropId, Button>();
  private refillButton!: Button;
  private overlay!: { shade: GameObjects.Rectangle; text: GameObjects.Text; button: Button };
  private ticker: Time.TimerEvent | undefined;
  private currentLayout: FarmLayout | null = null;

  constructor() {
    super("FarmScene");
  }

  create(): void {
    this.title = this.addText("FARMVERSE", { fontStyle: "bold" }).setOrigin(0.5, 0);
    this.status = this.addText("").setOrigin(0.5, 0);
    this.stats = this.addText("").setOrigin(0.5, 0);
    this.produce = this.addText("").setOrigin(0.5, 0);
    this.message = this.addText("Loading your farm…", { align: "center" }).setOrigin(0.5, 0);

    for (let index = 0; index < 6; index++) {
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

    const shade = this.add.rectangle(0, 0, 10, 10, COLORS.overlay, 0.94).setInteractive();
    const text = this.addText("Your farm could not be found on this device.", { align: "center" }).setOrigin(0.5);
    const button = this.addButton("Start a new farm", () => void this.onStartNewFarm());
    this.overlay = { shade, text, button };
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
    this.clock = clockFromState(state, Date.now());
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
  ): Promise<void> {
    this.busy = true;
    this.render();
    try {
      const result = await request;
      if (result.ok) {
        this.applyState(result.state);
        this.showMessage(describe(result.state));
      } else {
        this.showMessage(errorText(result.code));
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
    await this.send(this.api.refillSeeds({ requestId }), () => "You received 5 seeds of each crop.");
  }

  private selectCrop(cropId: CropId): void {
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

  private showMessage(text: string): void {
    this.message.setText(text);
  }

  private render(): void {
    const state = this.state;
    const now = serverNow(this.clock, Date.now());
    const locked = !this.connected || this.busy || this.newRequestId === null;

    this.stats.setText(state === null ? "" : `Coins ${state.coins} · XP ${state.xp}`);
    this.produce.setText(state === null ? "" : `Harvest: ${inventoryLine(state, PRODUCE_IDS)}`);

    this.plots.forEach(({ box, bar, label }, index) => {
      const plot = state?.plots[index];
      if (state === null || plot === undefined) {
        label.setText("");
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
      button.label.setText(`${getCrop(cropId).name}\n${count} seeds`);
      const color = cropId === this.selectedCrop ? COLORS.buttonSelected : count === 0 ? COLORS.buttonDisabled : COLORS.button;
      button.box.setFillStyle(color);
      button.box.setVisible(refill === null);
      button.label.setVisible(refill === null);
    }
    this.refillButton.box.setVisible(refill !== null);
    this.refillButton.label.setVisible(refill !== null).setText(refill ?? "");
    this.refillButton.box.setFillStyle(refill === "Get free seeds" && !locked ? COLORS.buttonSelected : COLORS.buttonDisabled);
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
   * Places everything in design units (see farmLayout.ts) and zooms the camera
   * so the design frame fits the canvas. Browser zoom and window size only
   * change the camera zoom, never the proportions.
   */
  private layout(width: number, height: number): void {
    const layout = computeFarmLayout(width, height);
    this.currentLayout = layout;
    const { fontSize, design } = layout;

    const camera = this.cameras.main;
    camera.setSize(width, height);
    camera.setZoom(layout.zoom);
    camera.centerOn(design.width / 2, design.height / 2);

    const resolution = textResolution(layout);
    for (const text of this.children.list) {
      if (text instanceof GameObjects.Text) text.setResolution(resolution);
    }

    this.title.setFontSize(fontSize.title).setPosition(layout.title.x, layout.title.y);
    this.status.setFontSize(fontSize.text).setPosition(layout.status.x, layout.status.y);
    this.stats.setFontSize(fontSize.text).setPosition(layout.stats.x, layout.stats.y);

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

    this.produce.setFontSize(fontSize.text).setPosition(layout.produce.x, layout.produce.y);
    this.message.setFontSize(fontSize.text).setWordWrapWidth(layout.wrapWidth).setPosition(layout.message.x, layout.message.y);

    this.placeRect(this.overlay.shade, layout.view);
    this.overlay.text
      .setFontSize(fontSize.text + 2)
      .setWordWrapWidth(layout.wrapWidth)
      .setPosition(layout.overlayText.x, layout.overlayText.y);
    this.placeButton(this.overlay.button, layout.overlayButton, fontSize.text);

    this.render();
  }

  // ---------- helpers ----------

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
      overlayVisible: () => this.overlay.shade.visible,
      newFarmButton: () => center(this.overlay.button.box),
      layout: () => this.currentLayout,
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
