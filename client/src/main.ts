/**
 * Client entry point: boots Phaser into the #game element.
 *
 * Scale.RESIZE makes the canvas follow the window size, so the game works in
 * both portrait and landscape; the design resolution is chosen in Phase 1.
 */
import { AUTO, Game, Scale } from "phaser";
import { BootScene } from "./core/BootScene.js";

new Game({
  type: AUTO,
  parent: "game",
  backgroundColor: "#14532d",
  scale: {
    mode: Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [BootScene],
});
