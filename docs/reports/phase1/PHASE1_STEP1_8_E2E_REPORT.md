# PHASE 1 — STEP 1.8: END-TO-END VERIFICATION REPORT

Date: 2026-10-10
Scope: Phase 1 Farming MVP, Steps 1.3–1.7 (storage, coin/XP rewards, guest session, farm HTTP API, client farm scene), as required by the Game Director execution directive of 2026-10-10.

---

## 1. Commits covered

| Commit | Content |
|---|---|
| `c5367d5` | SQLite storage (`node:sqlite`): schema v1, migrations, transactions, farm load/save, action log |
| `e2e8084` | Coin and XP rewards on harvest (provisional values) |
| `811aa94` | Guest session, Bearer auth, farm HTTP API with request-ID idempotency |
| `fc3ff87` | Client `FarmScene`: plots, seeds, harvest, refill, coins/XP, invalid-token overlay, retries |

All pushed to `origin/main`.

---

## 2. Automated checks (run 2026-10-10, after `fc3ff87` changes)

| Check | Result |
|---|---|
| `npm run typecheck` (all workspaces) | Clean |
| `npm test` — shared | 226 passed |
| `npm test` — server | 336 passed |
| `npm test` — client | 75 passed |
| `npm run build -w client` | Succeeds; Vite warns that the Phaser chunk is larger than 500 kB (known, not addressed in Phase 1) |
| `npm audit` | 0 vulnerabilities |
| Production bundle contains `__farmverse` debug hooks | No (hooks are behind `import.meta.env.DEV`) |

Total: 637 tests passing.

---

## 3. Runtime verification (headless Chromium, local dev server, temporary database)

Setup: `DATABASE_PATH=<scratch>/farm.db npm run dev:server`, Vite dev client on port 5173, mobile viewport 390×844 with touch.

| Scenario | Result |
|---|---|
| First visit creates a guest farm: 6 empty plots, 5 seeds of each crop, coins 0, XP 0 | PASS |
| Tap empty plot → `Planted Wheat.`, seeds 5 → 4 | PASS |
| Select Carrot seed button, plant on plot 1 | PASS |
| Tap growing plot → `Wheat is ready in 28 s.`; progress bar visible | PASS |
| After 31 s, harvest → `+1 Wheat · +2 coins · +1 XP`; coins 2, XP 1, `wheat_produce=1` | PASS |
| Rotate to landscape 844×390 → 3×2 grid, labels fit inside plots | PASS (label overflow found and fixed before `fc3ff87`) |
| Reload with same token → identical farm state | PASS |
| Invalid stored token → overlay `Your farm could not be found on this device.`; token kept; no new farm created | PASS |
| `Start a new farm` → fresh starter farm | PASS |
| Seed refill: seeds 0, no crops, cooldown 8 s (test DB prepared directly) → `Free seeds in 7 s` button; tap during cooldown → `Free seeds in 6 s.`, nothing sent | PASS |
| Tap empty plot with 0 seeds → `No Wheat seeds left.` | PASS |
| After cooldown → `Get free seeds` → `You received 5 seeds of each crop.`; refill state reset; planting works again | PASS |
| Browser errors | Only the expected `401` resource load in the invalid-token scenario |

Earlier API check against a real server (Step 1.5): plant, `CROP_NOT_READY`, harvest with reward, replay of the same request ID returns the stored result without a second reward, `401` without auth.

Server log check: every farm action logs `playerId`, `action`, `requestId`, `result`. No token, no `Authorization` header, no 43-character token string appears in the log.

---

## 4. Acceptance criteria (directive Step 3)

| Criterion | Status | Evidence |
|---|---|---|
| Player state, farm ownership | Done | `players` table; every farm query keyed by the authenticated player; ownership tests in `routes.test.ts` |
| Plots, crops, planting, growth, harvest | Done | `rules.ts` + tests; browser run above |
| Inventory | Done | `inventory` table; seeds and produce shown in the client |
| Basic coin and XP rewards | Done | `e2e8084`; browser run shows `+2 coins · +1 XP` |
| Server authoritative | Done | Server clock only; the client only displays `readyAt`/`serverTime` and sends intentions |
| Validate all player actions | Done | Shared validators → `400 INVALID_REQUEST`; rule errors → `409`; 1 KB body limit |
| Prevent duplicate harvests and rewards | Done | Request ID + `action_log` in the same `BEGIN IMMEDIATE` transaction; concurrency and replay tests |
| Deterministic game rules | Done | Pure functions with `now` passed in |
| Separate shared / server / client logic | Done | `shared/src/farming.ts`, `server/src/farming/`, `client/src/farm/` |
| Invalid messages and disconnects handled safely | Done | Invalid bodies rejected; client disables actions while not connected, retries network failures with the same request ID, reloads the farm after reconnect |
| No unrelated features | Done | No shop, levels, social or multiplayer gameplay added |

---

## 5. Not verified

- Farm scene through the Codespaces URL in a real browser (needs an authenticated browser session; Game Director check).
- Android device.
- Retry behaviour against a real server outage in the browser (covered by unit tests in `farmApi.test.ts` only).
- Farm actions while the WebSocket is offline, in the browser (actions are disabled in code; the Phase 0 Offline → reconnect flow was verified earlier).

---

## 6. Known limitations and follow-ups

- When the player has no seeds, empty plots still read `Tap to plant` (tapping explains `No Wheat seeds left.`). Small UX polish.
- Coin/XP values are provisional; no levels, shop or spending.
- Guest token only; losing browser storage loses the farm (by design for Phase 1; account authentication is later).
- Phaser bundle > 500 kB (build warning).
- Rate limits, WebSocket server heartbeat and account authentication remain scheduled before multiplayer or public deployment (Phase 0 closeout audit §6).

---

## 7. Recommendation

Phase 1 Farming MVP is functionally complete and verified locally. Recommend Game Director review: play the farm through the Codespaces URL (server started with `CLIENT_ORIGIN=https://localhost:5173`), then approve Phase 1 closeout.
