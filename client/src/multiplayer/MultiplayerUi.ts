/**
 * Multiplayer screens of the farm scene (Phase 5, Step 5.4; decisions R-A
 * farm rooms, F-A online list + farm code, M-A tap-to-move).
 *
 * - Visit screen: the player's own farm code, the online list, "Enter code"
 *   (the browser's prompt), Refresh and Back.
 * - Farm room: the visited farm's 8×8 grid (plots and decorations, view only)
 *   with every character in the room, tap-to-move, four emotes and Leave.
 *
 * The server decides membership and positions. This class only sends room
 * requests and draws what the server reports (roomView.ts); a visited farm's
 * plots and decorations come from GET /api/farms/:farmCode and are reloaded
 * every FARM_REFRESH_MS. FarmScene owns the mode, the status line and the
 * message line, and calls create / layout / render.
 */
import { GameObjects, type Scene } from "phaser";
import type { OnlinePlayer, PlotState } from "@farmverse/shared/api";
import { FARM_GRID_HEIGHT, FARM_GRID_WIDTH, footprint, plotTile, type PlacedObject } from "@farmverse/shared/building";
import { parseFarmCode } from "@farmverse/shared/presence";
import type { ServerMessage } from "@farmverse/shared/protocol";
import { paintCharacter } from "../character/paintCharacter.js";
import { objectLabel } from "../farm/buildView.js";
import type { FarmLayout, Rect } from "../farm/farmLayout.js";
import { plotView } from "../farm/farmView.js";
import { NetworkError, SessionInvalidError, type FarmApi } from "../network/farmApi.js";
import type { ServerConnection } from "../network/ServerConnection.js";
import {
  EMOTE_ORDER,
  activeEmote,
  applyRoomMessage,
  emoteBubble,
  emoteButtonLabel,
  gridLabel,
  onlineLabel,
  roomErrorText,
  roomTitle,
  tapRoomTile,
  walkDurationMs,
  type RoomView,
} from "./roomView.js";

/** How often a visited farm's plots and decorations are reloaded. */
export const FARM_REFRESH_MS = 10_000;

export type MultiplayerMode = "visit" | "room";

export interface Button {
  box: GameObjects.Rectangle;
  label: GameObjects.Text;
}

export interface MultiplayerColors {
  background: number;
  grass: number;
  soil: number;
  growing: number;
  ready: number;
  locked: number;
  object: number;
  building: number;
  border: number;
  button: number;
  buttonSelected: number;
  buttonDisabled: number;
  text: string;
}

/** What FarmScene provides. */
export interface MultiplayerHost {
  scene: Scene;
  api: FarmApi;
  colors: MultiplayerColors;
  connection(): ServerConnection | undefined;
  isConnected(): boolean;
  /** The player's public identity from `welcome`, once connected. */
  you(): { farmCode: string; name: string } | null;
  /** The player's own farm (plots and decorations of their own room). */
  ownFarm(): { plots: PlotState[]; objects: PlacedObject[] } | null;
  serverNow(): number;
  setMode(mode: "farm" | MultiplayerMode): void;
  addText(text: string, style?: Partial<GameObjects.TextStyle>): GameObjects.Text;
  addButton(text: string, onTap: () => void): Button;
  placeRect(box: GameObjects.Rectangle, rect: Rect): void;
  placeButton(button: Button, rect: Rect, textSize: number): void;
  textResolution(): number;
}

interface VisitedFarmView {
  farmCode: string;
  ownerName: string;
  plots: PlotState[];
  objects: PlacedObject[];
}

interface PlayerWidget {
  container: GameObjects.Container;
  graphics: GameObjects.Graphics;
  name: GameObjects.Text;
  bubble: GameObjects.Text;
  /** Tile and appearance the widget was last drawn for. */
  x: number;
  y: number;
  drawnKey: string;
  /** Place on its tile without animation (new widget or new layout). */
  snap: boolean;
}

export class MultiplayerUi {
  private mode: "farm" | MultiplayerMode = "farm";
  private layoutInfo: FarmLayout | null = null;

  // Visit screen
  private visitBackground!: GameObjects.Rectangle;
  private codeText!: GameObjects.Text;
  private actionButtons: Button[] = [];
  private listButtons: Button[] = [];
  private online: OnlinePlayer[] = [];
  private visitMessage = "";
  private loadingOnline = false;

  // Farm room
  private roomBackground!: GameObjects.Rectangle;
  private tiles: GameObjects.Rectangle[] = [];
  private titleText!: GameObjects.Text;
  private emoteButtons: Button[] = [];
  private leaveButton!: Button;
  private objectWidgets: Array<{ box: GameObjects.Rectangle; label: GameObjects.Text }> = [];
  private objectsKey = "";
  private players = new Map<string, PlayerWidget>();
  private roomTarget: string | null = null;
  private roomView: RoomView | null = null;
  private visited: VisitedFarmView | null = null;
  private visitedLoadedAt = 0;
  private loadingFarm = false;
  private roomMessage = "";

  constructor(private readonly host: MultiplayerHost) {}

  /** Creates every widget (hidden). Call after the farm, edit and character widgets so these cover them. */
  create(): void {
    const { scene, colors } = this.host;
    this.visitBackground = scene.add.rectangle(0, 0, 10, 10, colors.background).setInteractive();
    this.codeText = this.host.addText("", { align: "center" }).setOrigin(0.5, 0);
    const actions: Array<[string, () => void]> = [
      ["My farm", () => this.onMyFarm()],
      ["Enter code", () => this.onEnterCode()],
      ["Refresh", () => void this.loadOnline()],
      ["Back", () => this.host.setMode("farm")],
    ];
    this.actionButtons = actions.map(([label, onTap]) => this.host.addButton(label, onTap));
    for (let index = 0; index < 20; index++) {
      this.listButtons.push(this.host.addButton("", () => this.onListTap(index)));
    }

    this.roomBackground = scene.add.rectangle(0, 0, 10, 10, colors.background).setInteractive();
    for (let y = 0; y < FARM_GRID_HEIGHT; y++) {
      for (let x = 0; x < FARM_GRID_WIDTH; x++) {
        const tile = scene.add.rectangle(0, 0, 10, 10, colors.grass).setStrokeStyle(1, colors.border, 0.25);
        tile.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.onTileTap(x, y));
        this.tiles.push(tile);
      }
    }
    this.titleText = this.host.addText("", { align: "center" }).setOrigin(0.5, 0);
    this.emoteButtons = EMOTE_ORDER.map((emote) =>
      this.host.addButton(emoteButtonLabel(emote), () => this.send({ type: "emote", emote })),
    );
    this.leaveButton = this.host.addButton("Leave", () => this.host.setMode("visit"));
  }

  /** Called by FarmScene when its mode changes. */
  setMode(mode: "farm" | MultiplayerMode): void {
    const previous = this.mode;
    this.mode = mode;
    if (previous === "room" && mode !== "room") this.exitRoom();
    if (mode === "visit") {
      this.visitMessage = "";
      void this.loadOnline();
    }
  }

  /** Text for FarmScene's message line in the multiplayer modes. */
  messageText(): string {
    if (this.mode === "visit") {
      return this.visitMessage === "" ? "Tap a player to visit their farm, or enter a farm code." : this.visitMessage;
    }
    return this.roomMessage === "" ? "Tap a tile to walk there." : this.roomMessage;
  }

  showMessage(text: string): void {
    if (this.mode === "visit") this.visitMessage = text;
    else this.roomMessage = text;
  }

  onServerMessage(message: ServerMessage): void {
    if (message.type === "welcome") {
      // A new connection starts outside any room: join again.
      if (this.mode === "room" && this.roomTarget !== null) this.send({ type: "join", farmCode: this.roomTarget });
      return;
    }
    if (message.type === "error") {
      const text = roomErrorText(message.error.code);
      if (text === undefined) return;
      const joinFailed = message.error.code === "ROOM_NOT_FOUND" || message.error.code === "ROOM_FULL";
      if (this.mode === "room" && joinFailed) {
        this.host.setMode("visit");
        this.visitMessage = text;
      } else {
        this.showMessage(text);
      }
      return;
    }
    if (message.type === "room" && message.farmCode !== this.roomTarget) return;
    this.roomView = applyRoomMessage(this.roomView, message, Date.now());
  }

  layout(layout: FarmLayout): void {
    this.layoutInfo = layout;
    const { visit, room } = layout;
    this.host.placeRect(this.visitBackground, layout.view);
    this.codeText.setFontSize(layout.fontSize.text).setPosition(visit.codeLine.x, visit.codeLine.y);
    this.actionButtons.forEach((button, index) => this.host.placeButton(button, visit.actionButtons[index]!, visit.fontSize.action));
    this.listButtons.forEach((button, index) => {
      const rect = visit.listButtons[index];
      if (rect !== undefined) this.host.placeButton(button, rect, visit.fontSize.list);
    });

    this.host.placeRect(this.roomBackground, layout.view);
    this.tiles.forEach((tile, index) => {
      const x = index % FARM_GRID_WIDTH;
      const y = Math.floor(index / FARM_GRID_WIDTH);
      this.host.placeRect(tile, { x: room.grid.x + x * room.tileSize, y: room.grid.y + y * room.tileSize, width: room.tileSize, height: room.tileSize });
    });
    this.titleText.setFontSize(layout.fontSize.text - 1).setWordWrapWidth(room.wrapWidth).setPosition(room.title.x, room.title.y);
    this.emoteButtons.forEach((button, index) => this.host.placeButton(button, room.emoteButtons[index]!, room.fontSize.button));
    this.host.placeButton(this.leaveButton, room.leaveButton, room.fontSize.button);
    // Positions and sizes depend on the layout: rebuild on the next render.
    this.objectsKey = "";
    for (const widget of this.players.values()) {
      widget.drawnKey = "";
      widget.snap = true;
    }
  }

  render(locked: boolean): void {
    const visiting = this.mode === "visit";
    const inRoom = this.mode === "room";
    for (const object of [this.visitBackground, this.codeText, ...this.buttonParts(this.actionButtons)]) {
      (object as GameObjects.Rectangle).setVisible(visiting);
    }
    for (const object of [this.roomBackground, this.titleText, ...this.tiles, ...this.buttonParts([...this.emoteButtons, this.leaveButton])]) {
      (object as GameObjects.Rectangle).setVisible(inRoom);
    }
    for (const widget of this.objectWidgets) {
      widget.box.setVisible(inRoom);
      widget.label.setVisible(inRoom);
    }
    for (const widget of this.players.values()) widget.container.setVisible(inRoom);
    this.renderVisit(visiting, locked);
    if (inRoom) this.renderRoom(locked);
  }

  /** Development-only hooks for automated browser checks. */
  debugHooks(center: (object: GameObjects.Rectangle) => { x: number; y: number }): Record<string, unknown> {
    return {
      online: () => this.online,
      roomView: () => this.roomView,
      visited: () => this.visited,
      roomTarget: () => this.roomTarget,
      visitAction: (index: number) => center(this.actionButtons[index]!.box),
      visitListButton: (index: number) => center(this.listButtons[index]!.box),
      roomTile: (x: number, y: number) => center(this.tiles[y * FARM_GRID_WIDTH + x]!),
      emoteButton: (index: number) => center(this.emoteButtons[index]!.box),
      leaveButton: () => center(this.leaveButton.box),
      /** Drawn position of a player's character (design units), after any walk animation. */
      playerDrawn: (id: string) => {
        const widget = this.players.get(id);
        return widget === undefined ? null : { x: widget.container.x, y: widget.container.y, bubble: widget.bubble.text, name: widget.name.text };
      },
    };
  }

  // ---------- visit screen ----------

  private renderVisit(visible: boolean, locked: boolean): void {
    const you = this.host.you();
    this.codeText.setText(you === null ? "Connecting…" : `Your farm code: ${you.farmCode} · ${you.name}`);
    const capacity = this.layoutInfo?.visit.listButtons.length ?? 0;
    this.listButtons.forEach((button, index) => {
      const player = index < capacity ? this.online[index] : undefined;
      const shown = visible && player !== undefined;
      button.box.setVisible(shown);
      button.label.setVisible(shown);
      if (player !== undefined) button.label.setText(onlineLabel(player));
    });
    this.actionButtons[0]!.box.setFillStyle(locked || you === null ? this.host.colors.buttonDisabled : this.host.colors.buttonSelected);
  }

  private async loadOnline(): Promise<void> {
    if (this.loadingOnline) return;
    this.loadingOnline = true;
    try {
      this.online = await this.host.api.onlinePlayers();
      if (this.mode === "visit" && this.visitMessage === "" && this.online.length === 0) {
        this.visitMessage = "Nobody else is online right now. Enter a farm code to visit a farm.";
      }
    } catch (error) {
      this.handleError(error);
    } finally {
      this.loadingOnline = false;
    }
  }

  private onListTap(index: number): void {
    const player = this.online[index];
    if (player !== undefined) void this.enterRoom(player.farmCode, player.name);
  }

  private onMyFarm(): void {
    const you = this.host.you();
    if (you === null) {
      this.showMessage("Connecting… try again in a moment.");
      return;
    }
    void this.enterRoom(you.farmCode, you.name);
  }

  private onEnterCode(): void {
    const typed = window.prompt("Farm code (6 letters and digits):");
    if (typed === null) return;
    const farmCode = parseFarmCode(typed);
    if (farmCode === undefined) {
      this.showMessage("That is not a farm code. Codes have 6 letters and digits, for example ABC234.");
      return;
    }
    void this.enterRoom(farmCode, undefined);
  }

  // ---------- farm room ----------

  private async enterRoom(farmCode: string, ownerName: string | undefined): Promise<void> {
    if (!this.host.isConnected()) {
      this.showMessage("You are offline. Visits need a connection.");
      return;
    }
    const you = this.host.you();
    const own = you !== null && farmCode === you.farmCode;
    if (own) {
      this.visited = null;
    } else {
      const loaded = await this.loadVisited(farmCode);
      if (loaded === undefined) return;
      ownerName = loaded.ownerName;
    }
    this.roomTarget = farmCode;
    this.roomView = null;
    this.roomMessage = own
      ? "Your farm room: visitors who come here will see you."
      : ownerName === undefined
        ? ""
        : `Welcome to ${ownerName}'s farm!`;
    this.host.setMode("room");
    this.send({ type: "join", farmCode });
  }

  /** Loads a visited farm; undefined (with a message) when it cannot be shown. */
  private async loadVisited(farmCode: string): Promise<VisitedFarmView | undefined> {
    this.loadingFarm = true;
    try {
      const farm = await this.host.api.visitFarm(farmCode);
      if (farm === undefined) {
        this.showMessage("No farm has that code.");
        return undefined;
      }
      this.visited = { farmCode: farm.farmCode, ownerName: farm.name, plots: farm.plots, objects: farm.objects };
      this.visitedLoadedAt = Date.now();
      return this.visited;
    } catch (error) {
      this.handleError(error);
      return undefined;
    } finally {
      this.loadingFarm = false;
    }
  }

  private exitRoom(): void {
    if (this.roomTarget !== null) this.send({ type: "leave" }, false);
    this.roomTarget = null;
    this.roomView = null;
    this.visited = null;
    this.roomMessage = "";
    for (const widget of this.players.values()) widget.container.destroy();
    this.players.clear();
  }

  /** Plots and objects of the room's farm: the player's own, or the visited one. */
  private roomFarm(): { plots: PlotState[]; objects: PlacedObject[] } | null {
    return this.visited ?? this.host.ownFarm();
  }

  private onTileTap(x: number, y: number): void {
    const you = this.host.you();
    const farm = this.roomFarm();
    if (this.mode !== "room" || this.roomView === null || you === null || farm === null) return;
    const intent = tapRoomTile(this.roomView, you.farmCode, farm.objects, { x, y });
    if (intent.kind === "move") this.send({ type: "move", x: intent.x, y: intent.y });
    else if (intent.kind === "message") this.showMessage(intent.text);
  }

  private send(message: Parameters<ServerConnection["sendRoomMessage"]>[0], explain = true): void {
    const sent = this.host.connection()?.sendRoomMessage(message) ?? false;
    if (!sent && explain) this.showMessage("You are offline. Waiting for the connection…");
  }

  private renderRoom(locked: boolean): void {
    const layout = this.layoutInfo?.room;
    const farm = this.roomFarm();
    const you = this.host.you();
    if (layout === undefined || farm === null) return;

    if (this.visited !== null && !this.loadingFarm && Date.now() - this.visitedLoadedAt > FARM_REFRESH_MS) {
      void this.loadVisited(this.visited.farmCode);
    }
    const ownerName = this.visited?.ownerName ?? you?.name;
    this.titleText.setText(roomTitle(this.roomView, you?.farmCode ?? "", ownerName));

    const { colors } = this.host;
    const now = this.host.serverNow();
    this.tiles.forEach((tile) => tile.setFillStyle(colors.grass));
    farm.plots.forEach((plot, index) => {
      const position = plotTile(index);
      const tile = position && this.tiles[position.y * FARM_GRID_WIDTH + position.x];
      if (tile === undefined) return;
      const view = plotView(plot, now);
      tile.setFillStyle(view.kind === "empty" ? colors.soil : view.kind === "growing" ? colors.growing : colors.ready);
    });
    this.syncObjects(farm.objects, layout);
    this.syncPlayers(layout);
    for (const button of [...this.emoteButtons, this.leaveButton]) {
      button.box.setFillStyle(locked && button !== this.leaveButton ? colors.buttonDisabled : colors.button);
    }
  }

  private syncObjects(objects: readonly PlacedObject[], layout: FarmLayout["room"]): void {
    const key = JSON.stringify([objects, layout.grid, layout.tileSize]);
    if (key === this.objectsKey) return;
    this.objectsKey = key;
    for (const widget of this.objectWidgets) {
      widget.box.destroy();
      widget.label.destroy();
    }
    this.objectWidgets = objects.map((object) => {
      const area = footprint(object);
      const rect = {
        x: layout.grid.x + area.x * layout.tileSize + 2,
        y: layout.grid.y + area.y * layout.tileSize + 2,
        width: area.width * layout.tileSize - 4,
        height: area.height * layout.tileSize - 4,
      };
      const color = object.decorationId === "small_house" ? this.host.colors.building : this.host.colors.object;
      const box = this.host.scene.add.rectangle(0, 0, 10, 10, color);
      this.host.placeRect(box, rect);
      const label = this.host
        .addText(objectLabel(object), { align: "center" })
        .setOrigin(0.5)
        .setWordWrapWidth(rect.width - 2)
        .setFontSize(layout.fontSize.name)
        .setResolution(this.host.textResolution())
        .setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { box, label };
    });
    // Characters stay above the decorations.
    for (const widget of this.players.values()) this.host.scene.children.bringToTop(widget.container);
  }

  private syncPlayers(layout: FarmLayout["room"]): void {
    const view = this.roomView;
    const present = new Set(view?.players.map((player) => player.id) ?? []);
    for (const [id, widget] of this.players) {
      if (!present.has(id)) {
        widget.container.destroy();
        this.players.delete(id);
      }
    }
    if (view === null) return;
    const myCode = this.host.you()?.farmCode;
    const tile = layout.tileSize;
    const position = (x: number, y: number) => ({ x: layout.grid.x + x * tile, y: layout.grid.y + y * tile });
    for (const player of view.players) {
      let widget = this.players.get(player.id);
      if (widget === undefined) {
        const graphics = this.host.scene.add.graphics();
        const name = this.host.addText("", { align: "center", fontStyle: "bold" }).setOrigin(0.5, 1);
        const bubble = this.host.addText("", { align: "center", fontStyle: "bold", backgroundColor: "#fef3c7", color: "#14532d" }).setOrigin(0.5, 1);
        const start = position(player.x, player.y);
        const container = this.host.scene.add.container(start.x, start.y, [graphics, name, bubble]);
        widget = { container, graphics, name, bubble, x: player.x, y: player.y, drawnKey: "", snap: true };
        this.players.set(player.id, widget);
      }
      const drawnKey = JSON.stringify([player.appearance, tile, player.y === 0]);
      if (widget.drawnKey !== drawnKey) {
        widget.drawnKey = drawnKey;
        // Name at the top of the tile, the character below it, all inside the tile, so
        // nothing is cut off at the grid edge. The emote bubble sits above the tile,
        // or over the character on the top row.
        paintCharacter(widget.graphics, player.appearance, { x: tile * 0.1, y: tile * 0.2, width: tile * 0.8, height: tile * 0.8 });
        const resolution = this.host.textResolution();
        widget.name.setFontSize(layout.fontSize.name).setResolution(resolution).setPosition(tile / 2, tile * 0.22);
        widget.bubble
          .setFontSize(layout.fontSize.name + 2)
          .setResolution(resolution)
          .setPosition(tile / 2, player.y === 0 ? tile * 0.7 : 0);
      }
      if (widget.snap) {
        widget.snap = false;
        const target = position(player.x, player.y);
        this.host.scene.tweens.killTweensOf(widget.container);
        widget.container.setPosition(target.x, target.y);
        widget.x = player.x;
        widget.y = player.y;
      }
      widget.name.setText(gridLabel(player, myCode));
      const emote = activeEmote(view, player.id, Date.now());
      widget.bubble.setText(emote === undefined ? "" : ` ${emoteBubble(emote)} `);
      if (widget.x !== player.x || widget.y !== player.y) {
        const target = position(player.x, player.y);
        this.host.scene.tweens.killTweensOf(widget.container);
        this.host.scene.tweens.add({
          targets: widget.container,
          x: target.x,
          y: target.y,
          duration: walkDurationMs({ x: widget.x, y: widget.y }, player),
        });
        widget.x = player.x;
        widget.y = player.y;
      }
    }
  }

  private buttonParts(buttons: Button[]): GameObjects.GameObject[] {
    return buttons.flatMap((button) => [button.box, button.label]);
  }

  private handleError(error: unknown): void {
    if (error instanceof SessionInvalidError) {
      this.host.setMode("farm");
      return;
    }
    this.showMessage(error instanceof NetworkError ? "Cannot reach the server right now." : "Something went wrong. Please try again.");
    if (!(error instanceof NetworkError)) console.error("[multiplayer]", error);
  }
}
