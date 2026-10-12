/**
 * Paints a character (characterDrawing.ts shapes) into a Phaser Graphics
 * object, fitted into `rect`. Shared by the farm header, the Character screen
 * and farm rooms (Phase 5).
 */
import type { GameObjects } from "phaser";
import type { CharacterAppearance } from "@farmverse/shared/character";
import { characterShapes, fitCharacter } from "./characterDrawing.js";

export interface PaintRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function paintCharacter(graphics: GameObjects.Graphics, appearance: CharacterAppearance, rect: PaintRect): void {
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
