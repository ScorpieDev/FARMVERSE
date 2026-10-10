# PHASE 1 — FIX: LAYOUT DISTORTED BY BROWSER ZOOM AND WINDOW RESIZE

Date: 2026-10-10
Reported by: Game Director (Chrome, zoom 200% and back: the farm sometimes looked too large, sometimes shrank to a small block in the middle).

---

## 1. Investigation

| Suspect | Finding |
|---|---|
| CSS (`client/index.html`) | Correct: `html, body` 100% with `overflow: hidden`; `#game` is `position: fixed; inset: 0`. No change needed. |
| Phaser Scale Manager (`Scale.RESIZE`) | Works: on every `resize` event (Chrome zoom fires one) and every 500 ms it re-reads the parent size and resizes the canvas. Measured in headless Chromium: canvas = CSS viewport at every zoom level (1280×720 → 640×360 at 200% → 2560×1440 at 50%). |
| Canvas size / container | Canvas always matches the container, positioned at 0,0, no page scroll. |
| Scene layout (`FarmScene.layout`) | **Root cause.** The farm was laid out in CSS pixels with fixed caps (plots ≤ 170 px, buttons ≤ 180 px, text 13–20 px) and anchored to the top. Chrome zoom changes the size of a CSS pixel and the CSS viewport, so the same rules produced very different pictures: at 200% the 640×360 viewport filled the screen with large elements; at 50% or on a large monitor the caps kept everything small, at the top centre, with a mostly empty screen. Buttons and plots also changed proportions relative to each other. |

Evidence (headless Chromium, emulated 1280×720 window): before the fix the first plot's centre was at 452, 141×2 = 282 and 1074×0.5 = 537 physical pixels at zoom 100%, 200% and 50%. The farm's size and position on screen depended on the zoom level.

## 2. Fix

- New `client/src/farm/farmLayout.ts`: a pure function `computeFarmLayout(width, height)` that places every element in fixed design units — a 360×640 frame in portrait, 640×360 in landscape — and returns one uniform `zoom` (CSS px per design unit) = `min(width / designWidth, height / designHeight)`.
- `FarmScene.layout` applies that layout and sets the main camera's size, zoom and centre. The frame is scaled uniformly (never stretched) and centred; extra space on the long side is background. The invalid-token overlay covers the whole visible area.
- Text is rasterised at the camera zoom (`setResolution`, 1–4) so it stays sharp when scaled up.
- Debug hooks return canvas coordinates (design → screen), so automated taps go through the real input path.
- No change to planting, growth, harvest, coins, XP, seed refill, the HTTP API or the WebSocket protocol.

## 3. Results

### Browser zoom (headless Chromium; Chrome zoom emulated as CSS viewport = window / zoom and devicePixelRatio = zoom, window 1280×720)

| Zoom | CSS viewport | Canvas | Camera zoom | First plot centre (physical px) | Result |
|---|---|---|---|---|---|
| 100% | 1280×720 | 1280×720 | 2.0 | 304, 229.5 | PASS |
| 125% | 1024×576 | 1024×576 | 1.6 | 304, 229.5 | PASS |
| 150% | 853×480 | 853×480 | 1.333 | 304, 229.5 | PASS |
| 200% | 640×360 | 640×360 | 1.0 | 304, 229.5 | PASS — slightly soft (see §5) |
| 50% | 2560×1440 | 2560×1440 | 4.0 | 304, 229.5 | PASS |
| Sequence 100 → 125 → 150 → 200 → 100 → 50 → 200 → 100 | — | follows each step | — | identical at each level | PASS |

### Window sizes and orientation (headless Chromium, `setViewportSize`, all in one session)

390×844 → 844×390 → 390×844 → 360×640 → 320×568 → 768×1024 → 1024×768 → 1440×900 → 1920×1080 → 2560×720 → 500×300 → 390×844: canvas matches the window each time, portrait 2×3 / landscape 3×2 grid, all plots inside the canvas, no page scroll, no page errors.

### Gameplay regression (real touch taps through the zoomed camera, temporary database)

Plant wheat and carrot, growing message, harvest after 31 s (`+1 Wheat · +2 coins · +1 XP`), landscape, reload persistence, invalid token → overlay → `Start a new farm`, seed refill cooldown → `Get free seeds` → planting again: all PASS. Only console error: the expected `401` in the invalid-token scenario.

### Automated checks

| Check | Result |
|---|---|
| `npm run typecheck` | Clean |
| Tests | shared 226, server 336, client 94 (+19 layout tests) — 656 passed, 0 failed |
| `npm run build -w client` | Succeeds (existing Phaser chunk-size warning) |
| Debug hooks in production bundle | None |

New tests (`farmLayout.test.ts`): identical design layout at zoom 50–200%; same physical size at every zoom; every widget inside the canvas, uniform scale and centring for 10 screen sizes (phones, desktop, ultrawide, tiny); no overlaps; touch targets ≥ 44 CSS px on common phones; overlay covers the canvas; zero-size canvas.

## 4. Verified vs inferred

- **Verified:** everything in §3, in headless Chromium on the Codespace.
- **Emulated, not real:** Chrome page zoom (Ctrl + / −) in a real browser window. The emulation reproduces what zoom changes for the page (CSS viewport, devicePixelRatio, `resize` event), but the Game Director should confirm in Chrome through the Codespaces URL.
- **Not verified:** Android device; iOS Safari.

## 5. Known limitations

- Phaser 3 RESIZE renders one canvas pixel per CSS pixel. On high-DPI phones and at browser zoom above 100% the image is upscaled and slightly soft. Layout and proportions are correct; sharp high-DPI rendering would need a different scale setup (possible follow-up).
- Browser zoom no longer makes the game larger or smaller: the farm always fits the window. This is intended for a full-screen game.
- On small phones (320×568) seed buttons are 46 CSS px tall in portrait but about 39 CSS px in landscape, below the 44 px touch target.
