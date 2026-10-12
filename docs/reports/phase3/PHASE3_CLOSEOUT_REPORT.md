# Phase 3 — Building: closeout report

Date: 2026-10-12 · Status: **ready to close, awaiting Game Director approval.** The Android device check is deferred, as in Phases 0–2.

Based on commit `837bab9` (Step 3.5 end-to-end report). This closeout changes documentation only. No code was changed and no tests were run again.

## 1. Roadmap tasks

| Roadmap task (`DEVELOPMENT_ROADMAP.md`) | Delivered | Commits |
|---|---|---|
| Farm grid | 8×8 grid with the 3×3 plot block fixed at (2, 2) (option G-A) | `fbc1c46` |
| Buildings | Small House (2×2) is a decoration only, with no function (option C-A). Functional buildings are not in Phase 3 | `fbc1c46`, `6bc909f` |
| Decorations | 7 decorations (1×1 and 2×2). Bought in a coin shop with fixed prices and unlock levels (P3-4 / P3-5; values provisional) via `POST /api/shop/buy` | `fbc1c46`, `6bc909f` |
| Placement | `checkPlacement` / `checkLayout` cover the grid bounds, the plots and overlaps. Rotation is 0 / 90 / 180 / 270. The server enforces these rules (`PLACEMENT_INVALID`) | `fbc1c46`, `86030dd` |
| Remove / move objects | `POST /api/farm/objects/place`, `/move`, `/rotate`, `/remove`, all with request IDs and transactions. A removed object goes back to stock with no refund | `86030dd` |
| Save farm layout | Schema v3 adds `building_state`, `decoration_stock` and `farm_objects` (additive migration). The layout is returned in `FarmState` | `86030dd` |
| Building UI | **Edit farm** mode: 8×8 editor with Buy / Rotate / Remove / Done. Tiles are at least 44 CSS px in portrait and landscape | `fa7d119`, `6bc909f` |

## 2. Verification

| Check | Result | Evidence |
|---|---|---|
| Typecheck, unit and integration tests | 1094 passing (shared 376, server 532, client 186) | `PHASE3_STEP3_4_REPORT.md`, `PHASE3_STEP3_5_E2E_REPORT.md` §3 |
| Local headless Chromium with an isolated server and database | Edit mode 30/30; shop 19/19 | `PHASE3_STEP3_3_REPORT.md`, `PHASE3_STEP3_4_REPORT.md` |
| Codespaces URL against the real dev server and database (new guest farm). Covers: earn coins, buy, place, rejected placement, move, rotate, remove, reload, landscape | **24/24**, no defects, no code change | `PHASE3_STEP3_5_E2E_REPORT.md` (`837bab9`) |
| Android / iOS device | Not tested; deferred by the Game Director | — |
| Logged-in real browser through the Codespaces URL | Not tested. The E2E used token access and a `/ws` relay | `PHASE3_STEP3_5_E2E_REPORT.md` §1, §4 |

## 3. Carried forward (not blocking)

- The Codespaces WebSocket-origin changes (10 files) are still uncommitted. The Game Director decided on 2026-10-12 not to commit them yet (`docs/reports/phase1/PHASE1_CODESPACES_WS_ORIGIN_FIX_REPORT.md`).
- Decorations appear only in Edit mode. The normal farm screen keeps the Phase 2 layout; revisit with the Phase 5 farm visits.
- A farming request logged before the schema v3 upgrade and retried after it replays the old response, which has no `decorations` / `objects` (`PHASE3_STEP3_2_REPORT.md` §2).
- Prices, unlock levels and the decoration set are provisional; tune them after playtesting.
- Phase 2 UX items are still open: the seed selection resets to Wheat after a reload, there is no favicon, and large landscape screens leave empty space.

## 4. Decision requested

1. Close Phase 3. The Phase 2 closeout is also still awaiting approval.
2. Decide what to do with the uncommitted WebSocket-origin changes.
3. Approve starting the Phase 4 (Character) design plan.

## 5. Review (2026-10-12)

The review checked the roadmap tasks, git history and test evidence again.

- **Commits:** all on `origin/main` — `fbc1c46`, `86030dd`, `fa7d119`, `6bc909f`, `837bab9`, `0e393dd`.
- **Evidence still valid:**
  - Codespaces E2E 24/24 (`PHASE3_STEP3_5_E2E_REPORT.md`);
  - local edit-mode 30/30 and shop 19/19;
  - the Phase 3 automated tests are part of the suite that passed on 2026-10-12 (1212 passing).
- **Roadmap note:** "Buildings" is delivered as a decoration (Small House, no function, decision C-A). Functional buildings are not part of Phase 3.
- **Carried-forward items:** the "10 uncommitted WebSocket files" item is resolved by `37c3994`. The other items in §3 are still open (not blocking).
- **Assessment: eligible to close.** Every roadmap task is delivered and verified in Codespaces. The Android check is deferred by the Game Director. No closeout approval is recorded yet.
