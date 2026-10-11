# Phase 2 — Step 2.6: end-to-end verification

Date: 2026-10-11 · Builds on `7a97540` (Step 2.5) plus the Step 2.5 addendum (quest position and reward preview). Status: **local browser E2E done; Codespaces URL and real-device check pending the Game Director.** Phase 2 is not closed.

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

- Through the Codespaces URL (`https://<codespace>-5173.app.github.dev`) — needs a GitHub-authenticated browser; not possible from this session.
- On an Android / iOS device, and real browser zoom (deferred, as before).

## 4. For the Game Director to check (Codespaces URL, phone portrait and landscape)

1. Header shows `Coins · Level · XP` and the XP bar fills as you harvest.
2. Plots 7–9 show `Locked / Level N`; Corn / Strawberry show `Level 3` / `Level 5`.
3. Quest row shows `Quest n/8: … (x/y)` and `Reward: …`; after finishing, `Done n/8` and a Claim button; Claim gives the reward once and moves to the next quest.
4. Text fits on your phone in both orientations.

## 5. Open points

- No favicon (404 in the console).
- Large landscape screens leave empty space under the controls column (from Step 2.5).
- Phase 2 closeout depends on item 4 above.
