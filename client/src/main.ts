/**
 * Client entry point: boots Phaser into the #game element.
 *
 * The canvas covers the page (CSS in index.html) and its drawing buffer is
 * sized here in device pixels (see core/display.ts), so the farm is sharp on
 * high-DPI screens and at any browser zoom. Scenes read the current
 * DisplaySize from the registry and lay out in CSS pixels (farm/farmLayout.ts).
 */
import { AUTO, Game, Scale } from "phaser";
import { computeDisplaySize, type DisplaySize } from "./core/display.js";
import { DISPLAY_KEY, FarmScene } from "./farm/FarmScene.js";

const parent = document.getElementById("game")!;

function measure(): DisplaySize {
  return computeDisplaySize(parent.clientWidth || window.innerWidth, parent.clientHeight || window.innerHeight, window.devicePixelRatio);
}

const initial = measure();
const game = new Game({
  type: AUTO,
  parent,
  backgroundColor: "#14532d",
  scale: {
    // Sized by syncCanvasSize; NONE keeps Phaser from resetting it to CSS pixels.
    mode: Scale.NONE,
    width: initial.pixelWidth,
    height: initial.pixelHeight,
  },
  callbacks: {
    preBoot: (booting) => booting.registry.set(DISPLAY_KEY, initial),
  },
  scene: [FarmScene],
});

/** Resizes the drawing buffer after a window resize, rotation or browser zoom (which changes devicePixelRatio). */
function syncCanvasSize(): void {
  const display = measure();
  game.registry.set(DISPLAY_KEY, display);
  // resize() also refreshes the input bounds and emits Scale.Events.RESIZE.
  game.scale.resize(display.pixelWidth, display.pixelHeight);
}

window.addEventListener("resize", syncCanvasSize);
// Some mobile browsers report the new size only after the rotation event;
// re-read it on the next frame as well.
const syncAfterRotation = (): void => {
  syncCanvasSize();
  requestAnimationFrame(syncCanvasSize);
};
screen.orientation?.addEventListener("change", syncAfterRotation);
window.addEventListener("orientationchange", syncAfterRotation);
