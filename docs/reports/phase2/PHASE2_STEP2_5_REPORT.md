# Phase 2 — Step 2.5: client progression UI

Date: 2026-10-10 · Builds on `356d3c7` (Step 2.4). Client only: no server, shared or protocol changes.

## Delivered

| File | Change |
|---|---|
| `client/src/network/farmApi.ts` | `claimQuest({ requestId })` → `POST /api/quests/claim`, validated with `isQuestClaimResponse`; same retry rules as other actions (same request ID on network / 502–504 errors, no retry on 409). |
| `client/src/farm/farmView.ts` | Pure display helpers: `levelLine` (`Level 3 · 40/150 XP`, `Level 10 · Max level`), `xpFraction`, `isPlotLocked` / `plotLevel`, `isCropLocked`, `questLine` (`Quest: Harvest 3 Wheat (1/3)`, `Quest done: …`, `All quests done!`), `rewardText`, `levelUpText` (`Level 3! Corn unlocked.`), `produceLine` (unlocked crops only); texts for `LEVEL_TOO_LOW`, `QUEST_NOT_COMPLETE`. |
| `client/src/farm/farmLayout.ts` | 9 plots as 3×3 in both orientations; XP bar under the stats line; quest row with a Claim button; 5 seed buttons in rows of 3 + 2. Portrait: one column. Landscape: plots on the left, controls in a column on the right (keeps plots ≥ 44 CSS px on 568×320). |
| `client/src/farm/FarmScene.ts` | Header `Coins N · Level L · x/y XP` + XP bar. Locked plots grey with `Locked / Level N`; tapping explains the unlock level without a request. Corn / Strawberry buttons show `Level 3` / `Level 5` until unlocked and cannot be selected. Claim button only when the server says the quest is complete. After any action, a level-up adds `Level N! … unlocked.` to the message. Refill text says "each unlocked crop". Dev-only debug hooks: `claimButton`, `questText`, `stats`. |

Server authority is unchanged. The client only displays `progression` and `quest` from the server and sends `{ requestId }` to claim. The server checks locks, completion and reward again (Step 2.4 tests).

## Tests

| Check | Result |
|---|---|
| `npm run typecheck` | Clean |
| `npm test` | shared **279**, server **414**, client **120** (+16): **813 passed, 0 failed** |
| `npm run build -w client` | OK (existing chunk-size warning only) |

New / changed client tests: layout 3×3 + 5 buttons, controls below (portrait) / beside (landscape) the plots, no overlaps including Claim / quest / XP bar, Claim ≥ 44 CSS px on small phones, message fits the frame (5 sizes). View helpers: level line and bar at max level, plot and crop locks by level, produce line, quest lines, level-up texts with several unlocks, error texts. API: claim sends only the request ID, response validated, `QUEST_NOT_COMPLETE` not retried, 504 retried with the same request ID.

Headless Chromium against a **separate** server (port 3100, temporary database) and Vite (port 5174); the dev servers on 3000 / 5173 and their database were not touched:

- New player: `Coins 0 · Level 1 · 0/50 XP`, `Quest: Harvest 3 Wheat (0/3)`, no Claim button.
- Tap plot 7 → `Plot 7 unlocks at level 2.`; tap Corn → `Corn unlocks at level 3.` (no request sent).
- Plant and harvest 3 Wheat → `Quest done: Harvest 3 Wheat` + Claim → `Quest complete! +10 coins · +5 XP`; server state coins 16, XP 8; next quest `Plant 1 Carrot (0/1)`.
- XP set to 49 in the temporary database, one harvest → `+1 Wheat · +2 coins · +1 XP` / `Level 2! Plot 7 unlocked.`; planting on plot 7 then succeeds.
- Screenshots at 360×640, 320×568, 390×844, 640×360, 568×320, 844×390, 1280×720, 1920×1080: everything visible, no overlaps. No page errors (one 404 in the first run, not repeated; no failed responses in the second run).

## Open points

- Not checked through the Codespaces URL or on an Android device (as before).
- On 568×320 the quest text wraps to two lines because space for the Claim button is always reserved.
- Large landscape screens leave empty space under the controls column (top-aligned).
- The client accepts `quest: null` (`All quests done!`) but this was only covered by unit tests, not in the browser.
