# Phase 1 — Fix: responsive layout and scaling (browser zoom, window size, high-DPI)

Date: 2026-10-10 · Reported by the Game Director: at browser zoom 100% and 33% the game looked
nearly identical; plots, text and spacing did not adapt to the display area.

## 1. Cause (measured before changing anything)

The farm is drawn on a Phaser canvas, so HTML/CSS does not lay out the farm. Three causes:

1. **Camera zoom cancelled browser zoom (by design of `91f1f7c`).** `farmLayout.ts` placed
   everything in a fixed 360×640 / 640×360 frame and zoomed the camera by
   `min(width/360…, height/640…)` with no upper bound. Browser zoom-out enlarges the CSS viewport,
   so the camera zoom rose by exactly the same factor. Measured with a 1280×720 window:

   | Zoom | CSS viewport | Camera zoom | Plot width (physical px) | Text (physical px) |
   |---|---|---|---|---|
   | 100% | 1280×720 | 2.00 | 320 | 28 |
   | 80% | 1600×900 | 2.50 | 320 | 28 |
   | 67% | 1910×1075 | 2.98 | 320 | 28 |
   | 33% | 3879×2182 | 6.06 | 320 | 28 |

2. **Fixed aspect-ratio frame.** The frame never followed the screen shape. On a 390×844 phone it
   left empty bands above and below the farm (see screenshot `before-phone390x844dpr3`). On large
   monitors everything was simply magnified (text 42 px on 1920×1080).
3. **Canvas at 1 pixel per CSS pixel** (`Scale.RESIZE`). On a dpr-3 phone the browser upscaled a
   390×844 canvas 3× (blurry). At 33% zoom it drew a 3879×2182 canvas for a 1280×720 window,
   about 9× the pixels needed.

CSS/HTML (`#game` fixed, `inset: 0`, `overflow: hidden`) was correct and caused no overflow.

## 2. Fix

| File | Change |
|---|---|
| `client/src/farm/farmLayout.ts` | `zoom` (CSS px per design unit) = `min(MAX_ZOOM = 2, fit of the minimum frame)`. The frame now grows with the canvas from the minimum (360×640 / 640×360) up to `MAX_FRAME` (480×900 / 960×540) and follows its aspect ratio; beyond that it is centred. Landscape cells may be up to 190 units wide (was 160) to use wide screens. `textResolution` takes the render scale. |
| `client/src/core/display.ts` (new) | `computeDisplaySize`: canvas drawing buffer = CSS size × devicePixelRatio, clamped to 0.25–3, and at most 4K×1.5 pixels. |
| `client/src/main.ts` | Phaser `Scale.NONE`. The buffer is sized in device pixels on `resize` / orientation change (a browser zoom change fires `resize` and changes devicePixelRatio). The current `DisplaySize` is stored in the game registry. |
| `client/index.html` | `#game canvas { width/height: 100% }`, so the canvas always covers the page in CSS pixels. |
| `client/src/farm/FarmScene.ts` | Layout is computed for the CSS size (buffer ÷ render scale); camera zoom = layout zoom × render scale; text resolution uses device pixels. |
| `client/src/farm/farmLayout.test.ts`, `client/src/core/display.test.ts` (new) | Tests for the new behaviour (zoom monotonicity and cap, aspect fill, MAX_FRAME, bounds at 33%/67%, no overlaps, touch targets, display sizing). |

Unchanged: planting, growth, harvest, rewards, seed refill, the HTTP API, the WebSocket client and
the server. Debug hooks still return CSS coordinates.

Behaviour change to note: commit `91f1f7c` (after an earlier report) made zoom have **no** effect on
purpose. Now zooming out makes the farm physically smaller, like a normal web page, once the
window already shows it at the cap of 2 CSS px per unit. Zooming in still never makes it larger
than the window, so nothing gets clipped.

## 3. Results (headless Chromium on the Codespace, local Vite `localhost:5173`)

Browser zoom **emulated**: CSS viewport = 1280×720 ÷ zoom, devicePixelRatio = zoom (the same
effect as Chrome's Ctrl −/+ on the page). This is **not** the zoom menu of a real Chrome window.

| Case | CSS viewport | Canvas buffer | Plot (physical px) | Text (physical px) | Overflow | Errors |
|---|---|---|---|---|---|---|
| Zoom 100% | 1280×720 | 1280×720 | 380 × 137 | 28 | no | 0 |
| Zoom 80% | 1600×900 | 1280×720 | 304 | 22.4 | no | 0 |
| Zoom 67% | 1910×1075 | 1280×720 | 255 | 18.8 | no | 0 |
| Zoom 33% | 3879×2182 | 1280×720 | 125 | 9.2 | no | 0 |
| Window 1920×1080 | 1920×1080 | 1920×1080 | 380 | 28 | no | 0 |
| Window 800×600 | 800×600 | 800×600 | 238 | 17.5 | no | 0 |
| Phone 390×844, dpr 3 | 390×844 | 1170×2532 | 530 (square, fills height) | 48.9 | no | 0 |
| Phone 844×390, dpr 3 | 844×390 | 2532×1170 | 617 | 45.6 | no | 0 |
| Phone 320×568, dpr 2 | 320×568 | 640×1136 | 290 | 26.6 | no | 0 |

Screenshots were reviewed by eye (100%, 67%, 33%, 1920×1080, phone portrait/landscape). Text is
sharp on dpr 3. The layout fills the screen with no clipping or overlap. At 33% the farm is a
smaller, centred block.

Input accuracy (real mouse/touch taps through the canvas): a tap 3 design units inside a plot's
edge hits the plot, and a tap in the gap between plots does not. PASS at 100%, 67%, 33%, phone
dpr 3 (touch), and after the resize chain 1280×720 → 390×844 → 844×390 → 320×568 → 1920×1080 →
2560×720 → 800×600.

Automated checks: `npm run typecheck` clean · `npm test`: shared 226, server 342, client 104 —
**672 passing** · `npm run build -w client` OK.

## 4. Not verified

- **Full plant → harvest flow after this change.** During the tests the running dev server still
  had the old `.env` allowlist (it has not been restarted since the WebSocket origin fix). The client was
  therefore offline, and actions stopped at "You are offline". Hits on plots are verified (above);
  the server round trip is not. No server code or API code was changed.
- Real Chrome zoom menu in a real window, Android/iOS devices, Safari/Firefox.
- Through the Codespaces URL (`*-5173.app.github.dev`).

## 5. Git

Nothing has been committed or pushed. The working tree also contains uncommitted changes from the VS Code Copilot
agent (`server/src/*`, `client/vite.config.ts`, `.env.example`, `README.md`) that are not part of
this fix. A commit for this fix should include only: `client/index.html`, `client/src/main.ts`,
`client/src/core/display.ts`, `client/src/core/display.test.ts`, `client/src/farm/farmLayout.ts`,
`client/src/farm/farmLayout.test.ts`, `client/src/farm/FarmScene.ts`, and this report.
