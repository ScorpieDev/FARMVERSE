# Phase 4 — Character: closeout report

Date: 2026-10-12 · Status: **ready to close, awaiting Game Director approval.** The Android device check is deferred, as in Phases 0–3.

## 1. Roadmap tasks

| Roadmap task (`DEVELOPMENT_ROADMAP.md`) | Delivered | Commits |
|---|---|---|
| Character system | Every player has one character: a skin tone and one item worn in each slot. It is stored on the server (schema v4) and returned in `FarmState.character` | `3648a98`, `cd9bed8` |
| Hair / Shirt / Pants | 4 items per slot (12 total). The client draws them with Phaser shapes in catalog colours (R-A, no assets) | `3648a98`, `a5640bd` |
| Basic customization | **Character** screen, opened from the header avatar: Hair / Shirt / Pants / Skin tabs, items tried on locally, Wear saves the look (`POST /api/character/equip`, owned items only) | `cd9bed8`, `a5640bd` |
| Cosmetic inventory | 6 free starter items, plus a coin shop with level unlocks (K-A) via `POST /api/shop/buy-cosmetic`. Items are kept forever: no resale, never stolen, and buying does not equip | `cd9bed8`, `a5640bd` |

Decisions P4-1…P4-4 were applied as approved (`PHASE4_CHARACTER_PLAN_REPORT.md`). Prices and levels are provisional.

## 2. Verification

| Check | Result | Evidence |
|---|---|---|
| Typecheck, unit and integration tests | Clean. Shared 209 (character + api), server 86 (character + storage) and 515 (Step 4.2), client 231 | `PHASE4_STEP4_2_REPORT.md`, `PHASE4_STEP4_3_REPORT.md`, `PHASE4_STEP4_4_E2E_REPORT.md` §3 |
| Schema v3 → v4 migration | Additive and idempotent, with rollback on failure (tests). The dev database upgraded with 45 existing players | `PHASE4_STEP4_2_REPORT.md`, `PHASE4_STEP4_4_E2E_REPORT.md` §1 |
| Local headless Chromium, isolated server and database | 13/13 | `PHASE4_STEP4_3_REPORT.md` |
| Codespaces URL against the real dev server and database (new guest farm, real play to level 2). Covers: create look, wear, reload, buy, wear bought items, reload, landscape | **24/24**, no defects, no code change | `PHASE4_STEP4_4_E2E_REPORT.md` |
| Android / iOS device | Not tested; deferred by the Game Director | — |

## 3. Carried forward (not blocking)

- The Codespaces WebSocket-origin changes (10 files) are still uncommitted, awaiting a Game Director decision before Phase 5 (Multiplayer).
- The character appears in the header and on the Character screen only. Walking on the farm and showing other players' characters belong to Phase 5.
- Cosmetic prices, unlock levels and the item set are provisional.
- A request logged before the schema v4 upgrade and retried after it replays the old response without `character`. The client reports an invalid response once; the next farm load is correct (same as v3).
- Earlier UX items are still open: the seed selection resets after a reload, there is no favicon, and large landscape screens leave empty space.

## 4. Decision requested

1. Close Phase 4. The Phase 2 and Phase 3 closeouts are also still awaiting approval.
2. Decide on the uncommitted WebSocket-origin changes before Phase 5.
3. Approve starting the Phase 5 (Multiplayer) design plan.
