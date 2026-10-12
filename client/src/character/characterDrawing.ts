/**
 * Character drawing (Phase 4, decision R-A): a front-facing chibi made of
 * simple shapes, no image assets. Pure functions: `characterShapes` lists the
 * shapes in a CHARACTER_BOX design box, back to front; the scene scales them
 * into any rectangle with `fitCharacter` and draws them with Phaser Graphics.
 *
 * Every colour comes from the shared catalog (cosmetic `color`, skin tones),
 * so the server's appearance fully decides what is drawn.
 */
import {
  SKIN_TONE_COLORS,
  getCosmetic,
  type CharacterAppearance,
  type CosmeticDefinition,
} from "@farmverse/shared/character";

/** Size of the box shapes are drawn in (width × height, units). */
export const CHARACTER_BOX = { width: 100, height: 160 } as const;

export type Shape =
  | { kind: "rect"; x: number; y: number; width: number; height: number; color: number }
  | { kind: "circle"; x: number; y: number; radius: number; color: number }
  | { kind: "triangle"; points: [number, number, number, number, number, number]; color: number };

const EYE_COLOR = 0x1f2937;
const SHOE_COLOR = 0x3f2a1d;
/** Under-shirt drawn below overalls. */
const UNDERSHIRT_COLOR = 0xf2f2f2;

/** `#rrggbb` → 0xrrggbb. */
export function hexColor(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/** A colour made darker by `factor` (0–1), for stripes and straps. */
export function shade(color: number, factor: number): number {
  const channel = (shift: number) => Math.round(((color >> shift) & 0xff) * (1 - factor));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Shapes of the character, back to front, inside CHARACTER_BOX. */
export function characterShapes(appearance: CharacterAppearance): Shape[] {
  const skin = hexColor(SKIN_TONE_COLORS[appearance.skin]);
  const hair = getCosmetic(appearance.hair);
  const shirt = getCosmetic(appearance.shirt);
  const pants = getCosmetic(appearance.pants);
  return [...hairBack(hair), ...legs(pants, skin), ...body(shirt, skin), ...head(skin), ...hairFront(hair)];
}

/** Long hair falls behind the shoulders. */
function hairBack(hair: CosmeticDefinition): Shape[] {
  if (hair.style !== "long") return [];
  return [{ kind: "rect", x: 24, y: 28, width: 52, height: 52, color: hexColor(hair.color) }];
}

function legs(pants: CosmeticDefinition, skin: number): Shape[] {
  const color = hexColor(pants.color);
  const shorts = pants.style === "shorts";
  const shapes: Shape[] = [{ kind: "rect", x: 32, y: 100, width: 36, height: 10, color }];
  for (const x of [33, 52]) {
    if (shorts) {
      shapes.push({ kind: "rect", x, y: 108, width: 15, height: 18, color });
      shapes.push({ kind: "rect", x: x + 2, y: 126, width: 11, height: 24, color: skin });
    } else {
      shapes.push({ kind: "rect", x, y: 108, width: 15, height: 42, color });
    }
    shapes.push({ kind: "rect", x: x - 1, y: 148, width: 17, height: 8, color: SHOE_COLOR });
  }
  return shapes;
}

function body(shirt: CosmeticDefinition, skin: number): Shape[] {
  const color = hexColor(shirt.color);
  const overalls = shirt.style === "overalls";
  const sleeves = overalls ? UNDERSHIRT_COLOR : color;
  const shapes: Shape[] = [
    // Arms (skin), then short sleeves over the shoulders.
    { kind: "rect", x: 18, y: 64, width: 12, height: 36, color: skin },
    { kind: "rect", x: 70, y: 64, width: 12, height: 36, color: skin },
    { kind: "rect", x: 18, y: 62, width: 14, height: 16, color: sleeves },
    { kind: "rect", x: 68, y: 62, width: 14, height: 16, color: sleeves },
    { kind: "rect", x: 30, y: 60, width: 40, height: 44, color: overalls ? UNDERSHIRT_COLOR : color },
  ];
  if (shirt.style === "plaid") {
    const line = shade(color, 0.45);
    for (const x of [38, 49, 60]) shapes.push({ kind: "rect", x, y: 60, width: 3, height: 44, color: line });
    for (const y of [72, 86]) shapes.push({ kind: "rect", x: 30, y, width: 40, height: 3, color: line });
  }
  if (overalls) {
    shapes.push({ kind: "rect", x: 34, y: 76, width: 32, height: 28, color });
    for (const x of [34, 60]) shapes.push({ kind: "rect", x, y: 60, width: 6, height: 18, color: shade(color, 0.25) });
  }
  return shapes;
}

function head(skin: number): Shape[] {
  return [
    { kind: "rect", x: 44, y: 52, width: 12, height: 10, color: skin },
    { kind: "circle", x: 50, y: 34, radius: 22, color: skin },
    { kind: "circle", x: 42, y: 37, radius: 2.5, color: EYE_COLOR },
    { kind: "circle", x: 58, y: 37, radius: 2.5, color: EYE_COLOR },
  ];
}

function hairFront(hair: CosmeticDefinition): Shape[] {
  const color = hexColor(hair.color);
  // Every style has a cap of hair over the top of the head.
  const shapes: Shape[] = [{ kind: "rect", x: 28, y: 12, width: 44, height: 14, color }];
  switch (hair.style) {
    case "spiky":
      for (const x of [28, 39, 50, 61]) {
        shapes.push({ kind: "triangle", points: [x, 14, x + 11, 14, x + 5.5, 0], color });
      }
      break;
    case "bun":
      shapes.push({ kind: "circle", x: 50, y: 9, radius: 9, color });
      break;
    case "long":
      shapes.push({ kind: "rect", x: 26, y: 18, width: 8, height: 30, color });
      shapes.push({ kind: "rect", x: 66, y: 18, width: 8, height: 30, color });
      break;
    default:
      shapes.push({ kind: "rect", x: 28, y: 22, width: 8, height: 10, color });
  }
  return shapes;
}

/** Scale and offset that fit CHARACTER_BOX into `rect`, centred, aspect kept. */
export function fitCharacter(rect: { x: number; y: number; width: number; height: number }): {
  scale: number;
  x: number;
  y: number;
} {
  const scale = Math.max(0, Math.min(rect.width / CHARACTER_BOX.width, rect.height / CHARACTER_BOX.height));
  return {
    scale,
    x: rect.x + (rect.width - CHARACTER_BOX.width * scale) / 2,
    y: rect.y + (rect.height - CHARACTER_BOX.height * scale) / 2,
  };
}
