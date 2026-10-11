# Phase 2 — Step 2.6: end-to-end verification

Date: 2026-10-11 · Builds on `7a97540` (Step 2.5) plus the Step 2.5 addendum (quest position and reward preview). Status: **done** — local browser E2E (§2) and a real-time playthrough through the Codespaces URL against the dev server and database (§6, 2026-10-11). Android device not tested (Game Director, later).

## 1. Automated checks

| Check | Result |
|---|---|
| `npm run typecheck` | Clean (exit 0) |
| `npm test` | shared **279**, server **414**, client **121** (+1): **814 passed, 0 failed** |
| `npm run build -w client` | OK (existing chunk-size warning only); `__farmverse` debug hooks absent from the bundle |

New / changed client tests: quest lines with position and reward (first, last, completed, unknown id), quest box ≥ 205 × 36 design units beside Claim on 5 screen sizes.

Note: `npm test` ran with the uncommitted Codespaces WebSocket-origin changes (10 files) present in the working tree; they are not part of this step.

## 2. Browser run (headless Chromium, local)

Setup: separate server on port 3100 with a temporary database in the session scratchpad, Vite on port 5174 (`PORT=3100 npx vite --port 5174`). The dev servers on 3000 / 5173 and `data/farmverse.db` were not touched. Mobile context (touch, DPR 2), 390×844 unless noted. Where waiting would be slow, the temporary database was edited directly (crop age, XP, quest index); the client then reloaded from the server. Script kept outside the repository.

**38 / 38 checks passed:**

| Scenario | Result |
|---|---|
| New player: `Coins 0 · Level 1 · 0/50 XP`, `Quest 1/8: Harvest 3 Wheat (0/3)` / `Reward: +10 coins · +5 XP`, no Claim | PASS |
| Tap locked plot 7 → `Plot 7 unlocks at level 2.`; tap Corn → `Corn unlocks at level 3.`; no POST sent | PASS |
| Plant and harvest 3 Wheat → server quest progress 3/3; `Done 1/8: …` / `Claim: +10 coins · +5 XP`; Claim visible | PASS |
| Claim after the server's quest progress was set back to 2 → `Finish the quest first.` (409 `QUEST_NOT_COMPLETE`); client reloads: Claim hidden, `(2/3)`; coins / XP unchanged on the server | PASS |
| Claim when complete → `Quest complete! +10 coins · +5 XP`; server coins 6 → 16, XP 3 → 8 (once); header shows the server values; next quest `Quest 2/8: Plant 1 Carrot (0/1)` | PASS |
| XP 49 + one Wheat harvest → `+1 Wheat · +2 coins · +1 XP` / `Level 2! Plot 7 unlocked.`; planting on plot 7 accepted by the server | PASS |
| Longest quest text (`Quest 7/8: Harvest 20 crops (12/20)`) fits its box at 360×640, 320×568, 390×844, 640×360, 568×320, 844×390, 1280×720, 1920×1080; completed form fits at 320×568 and 568×320 | PASS (after the Claim width fix; first run failed on 3 landscape sizes by 2 units) |
| Quest index past the chain → `All quests done!`, no Claim; XP 5000 → `Level 10 · Max level`, 9 plots unlocked | PASS (first browser coverage of `quest: null`) |
| HTTP errors | Only the expected `409 POST /api/quests/claim`; console also shows a `404` for `/favicon.ico` (no favicon in the client; harmless) |

Screenshots (scratchpad, not committed) checked by eye at 568×320 with Claim and 320×568: all controls visible, no overlaps.

Client authority: the client never adds XP, coins or rewards; every number shown comes from the latest server `FarmState`, and every error triggers a reload from the server.

## 3. Not verified

- On an Android / iOS device, and real browser zoom (deferred, as before).
- Through the Codespaces URL with a signed-in human browser session: see §6 for how this session reached it.

## 4. For the Game Director to check on an Android phone (Codespaces URL, portrait and landscape)

1. Header shows `Coins · Level · XP` and the XP bar fills as you harvest.
2. Plots 7–9 show `Locked / Level N`; Corn / Strawberry show `Level 3` / `Level 5`.
3. Quest row shows `Quest n/8: … (x/y)` and `Reward: …`; after finishing, `Done n/8` and a Claim button; Claim gives the reward once and moves to the next quest.
4. Text fits on your phone in both orientations.

## 5. Open points

- No favicon (404 in the console).
- Large landscape screens leave empty space under the controls column (from Step 2.5).
- After a reload the selected seed returns to Wheat even when Wheat has 0 seeds, so empty plots say `No Wheat seeds` while other seeds are available (UX only; behaviour from Phase 1).
- Android device check (§4) is the only remaining Phase 2 verification item.

## 6. Codespaces URL playthrough (2026-10-11)

Target: `https://<codespace>-5173.app.github.dev` (private port) → Vite dev server 5173 → Fastify dev server 3000 → `data/farmverse.db`. The running servers were not restarted, and the database was **not edited, reset or deleted**. One new guest farm was created (persistent headless Chromium profile in the scratchpad, 390×844 touch, then 844×390). Growth ran in real time (Wheat 30 s, Carrot 2 min, Tomato 5 min).

Access method (headless, no human sign-in):
- Private port reached with the `X-Github-Token` header; the GitHub "development port" warning page answered with **Continue**, as a user would.
- With token access the tunnel rewrites the WebSocket Origin to `http://localhost:5173` and the server rejects it (403); a signed-in browser arrives as `https://localhost:5173` (captured on the wire on 2026-10-10, see `docs/reports/phase1/PHASE1_CODESPACES_WS_ORIGIN_FIX_REPORT.md`). The test therefore forwarded only the game socket `/ws` through the same tunnel with Origin `https://localhost:5173`. Pages, scripts and every `/api` request went through the tunnel from the browser unchanged. The Origin path itself is covered by the pending WebSocket/Codespaces changes, not by this test.

| Check | Result |
|---|---|
| New farm: `Coins 0 · Level 1 · 0/50 XP`, `Quest 1/8: Harvest 3 Wheat (0/3)` / `Reward: +10 coins · +5 XP`; status `Connected` | PASS |
| Locked plot 7 / Corn explained, no request | PASS |
| Plant 5 Wheat + 1 Tomato; growing plot shows `Wheat is ready in 13 s.` | PASS |
| Harvest 5 Wheat → coins 10, XP 5, quest complete, Claim shown | PASS |
| Claim → `Quest complete! +10 coins · +5 XP`; coins 20, XP 10; header `Coins 20 · Level 1 · 10/50 XP` | PASS |
| Reload → identical farm (coins, XP, level, quest, plots) | PASS |
| Plant 5 Carrots → quest 2 complete → claim (coins 30, XP 15) | PASS |
| Harvest 5 Carrots (coins 60, XP 30) → claim quest 3 (coins 80, XP 40) | PASS |
| Harvest Tomato → `+1 Tomato · +12 coins · +6 XP`, quest 4 complete | PASS (see note) |
| After 150 s idle, still `Connected · 138 ms`; Claim → `Quest complete! +20 coins · +10 XP` / `Level 2! Plot 7 unlocked.`; `Coins 112 · Level 2 · 6/100 XP`; `Quest 5/8: Reach level 3 (2/3)` | PASS (screenshot) |
| Reload → level 2, 7 plots; plot 8 `Plot 8 unlocks at level 4.`; plant Tomato on plot 7 → `Planted Tomato.`, accepted by the server | PASS |
| Reload → plot 7 crop, level and quest unchanged | PASS |
| Landscape 844×390: quest text fits (210×34 in 274×40), no overlaps | PASS |
| Page errors / HTTP errors | None (`/favicon.ico` 404 aside) |

Note: the first script run stopped at the Tomato harvest because it read the state 1.5 s after the tap, before the tunnel round trip had finished. A re-run on the same farm showed the harvest working, and later taps waited for the response. No game defect was found; no code was changed.
