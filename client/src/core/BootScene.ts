/**
 * First scene: shows the game title and the live server connection status.
 *
 * The connection lives as long as the scene; it is disposed when the scene
 * shuts down or the game is destroyed. When the status is "offline" the
 * player taps anywhere to try again.
 */
import { Input, Scale, Scene, type GameObjects } from "phaser";
import { ServerConnection } from "../network/ServerConnection.js";
import {
  formatStatus,
  type ConnectionStatus,
  type StatusTone,
} from "../network/connectionStatus.js";
import { resolveServerUrls } from "../network/serverUrl.js";

const TITLE_COLOR = "#fef3c7";
const TONE_COLORS: Record<StatusTone, string> = {
  ok: "#bbf7d0",
  pending: "#fde68a",
  error: "#fecaca",
};

export class BootScene extends Scene {
  private title!: GameObjects.Text;
  private status!: GameObjects.Text;
  private connection: ServerConnection | undefined;

  constructor() {
    super("BootScene");
  }

  create(): void {
    this.title = this.add
      .text(0, 0, "FARMVERSE", {
        fontFamily: "system-ui, sans-serif",
        fontStyle: "bold",
        color: TITLE_COLOR,
      })
      .setOrigin(0.5);

    this.status = this.add
      .text(0, 0, "", {
        fontFamily: "system-ui, sans-serif",
        align: "center",
      })
      .setOrigin(0.5);

    this.layout(this.scale.width, this.scale.height);
    this.scale.on(Scale.Events.RESIZE, this.onResize, this);
    this.input.on(Input.Events.POINTER_DOWN, this.onTap, this);

    this.connection = new ServerConnection({
      urls: resolveServerUrls(import.meta.env.VITE_SERVER_URL, window.location),
      onStatus: (status) => this.showStatus(status),
    });
    this.connection.start();

    this.events.once("shutdown", this.cleanUp, this);
    this.events.once("destroy", this.cleanUp, this);
  }

  /** Runs on shutdown and on destroy; only the first call does anything. */
  private cleanUp(): void {
    if (!this.connection) return;
    this.connection.dispose();
    this.connection = undefined;
    this.scale.off(Scale.Events.RESIZE, this.onResize, this);
    this.input.off(Input.Events.POINTER_DOWN, this.onTap, this);
  }

  private onTap(): void {
    this.connection?.retry();
  }

  private showStatus(status: ConnectionStatus): void {
    const display = formatStatus(status);
    this.status.setText(display.text).setColor(TONE_COLORS[display.tone]);
  }

  private onResize(gameSize: { width: number; height: number }): void {
    this.layout(gameSize.width, gameSize.height);
  }

  /** Centers the texts and scales them to the shorter screen side. */
  private layout(width: number, height: number): void {
    const shortSide = Math.min(width, height);
    const titleSize = Math.round(Math.max(28, Math.min(72, shortSide * 0.12)));
    const statusSize = Math.round(Math.max(16, titleSize * 0.35));

    this.title.setFontSize(titleSize).setPosition(width / 2, height / 2 - titleSize * 0.6);
    this.status
      .setFontSize(statusSize)
      .setWordWrapWidth(width * 0.9)
      .setPosition(width / 2, height / 2 + statusSize * 1.2);
  }
}
