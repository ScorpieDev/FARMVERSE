/**
 * First scene: shows the game title and a placeholder network status.
 *
 * Phase 0 step 6 only proves that Phaser boots and adapts to any screen
 * size or orientation. The real connection status arrives in step 7.
 */
import { Scale, Scene, type GameObjects } from "phaser";

const TITLE_COLOR = "#fef3c7";
const STATUS_COLOR = "#bbf7d0";

export class BootScene extends Scene {
  private title!: GameObjects.Text;
  private status!: GameObjects.Text;

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
      .text(0, 0, "Network: not connected yet", {
        fontFamily: "system-ui, sans-serif",
        color: STATUS_COLOR,
      })
      .setOrigin(0.5);

    this.layout(this.scale.width, this.scale.height);
    this.scale.on(Scale.Events.RESIZE, this.onResize, this);
    this.events.once("shutdown", () => {
      this.scale.off(Scale.Events.RESIZE, this.onResize, this);
    });
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
    this.status.setFontSize(statusSize).setPosition(width / 2, height / 2 + statusSize * 1.2);
  }
}
