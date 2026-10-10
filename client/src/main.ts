/**
 * Client entry point: boots Phaser into the #game element.
 *
 * Scale.RESIZE makes the canvas follow the window size, so the game works in
 * both portrait and landscape; the design resolution is chosen in Phase 1.
 */
import { AUTO, Game, Scale } from "phaser";
import { FarmScene } from "./farm/FarmScene.js";

const game = new Game({
  type: AUTO,
  parent: "game",
  backgroundColor: "#14532d",
  scale: {
    mode: Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [FarmScene],
});

// Phaser 3.90 handles an orientation change by refreshing before it reads the
// new parent size, so the canvas can stay in the old orientation (seen in
// mobile Chrome when rotating portrait <-> landscape). Re-read the parent size
// and refresh once more on the next frame.
function resyncScaleAfterRotation(): void {
  requestAnimationFrame(() => {
    game.scale.getParentBounds();
    game.scale.refresh();
  });
}

screen.orientation?.addEventListener("change", resyncScaleAfterRotation);
window.addEventListener("orientationchange", resyncScaleAfterRotation);
