# Phase 2 — Step 2.3: Corn / Strawberry, plots 7–9 and storage migration v2

Date: 2026-10-10 · Builds on `f639918` (2.1) and `aaf92e6` (2.2).

## Delivered

| Area | Change |
|---|---|
| Shared data (`shared/src/farming.ts`) | `CROP_IDS` + Corn (3 min, 9 coins, 4 XP) and Strawberry (8 min, 20 coins, 9 XP) per P2-4; 4 new items; `FARM_PLOT_COUNT` 6 → 9 (= `MAX_PLOT_COUNT`). |
| Server rules (`rules.ts`, `progression.ts`) | New players get seeds of level-1 crops only. Seed refill gives seeds of crops unlocked at the player's level. `gainXp` adds XP and grants **5 seeds of each crop unlocked by the level-up**; it is used by harvest and quest claim. XP never decreases, so each crop is granted once. Plots 7–9 and Corn / Strawberry return `LEVEL_TOO_LOW` until unlocked (now reachable over HTTP: 409). |
| Storage (`database.ts`, schema **v2**) | For every existing player: plot rows 6–8 (empty), inventory rows `corn_seed`, `strawberry_seed`, `corn_produce`, `strawberry_produce`, and table `quest_state` with a row at quest 0. Players whose XP already reached level 3 / 5 get the 5 Corn / Strawberry unlock seeds. Values are frozen in the SQL; every statement is idempotent (`IF NOT EXISTS`, `INSERT OR IGNORE`) and never modifies existing rows. It runs in one transaction with the version bump, as before. |
| Storage (`farmStore.ts`) | `insertPlayer` writes the quest row. `loadQuestState` / `saveQuestState` fail loudly on missing or invalid rows (same policy as farms). |
| Client (`FarmScene.ts`) | Compatibility guard only: seed buttons and the harvest line use the level-1 crops (`UI_CROP_IDS`). Without it, 5 crops would overflow the 3-button layout and crash. The client still draws 6 plots. Level, locked plots and new crops come in Step 2.5. |

Not in this step (Step 2.4): quest events are not recorded yet, there is no claim endpoint, and `FarmState` has no level / quest fields.

## Tests

| Check | Result |
|---|---|
| `npm run typecheck` | Clean |
| `npm test` | shared 260 · server 386 · client 104 — **750 passed** |
| `npm run build -w client` | OK |
| New `server/src/storage/migration.test.ts` (13 tests) | Real v1 database file (schema from migration 1, Phase 1 rows) → v2. Data preserved (plots, crops, inventory, coins, XP, action log). New rows and unlock seeds only for qualifying players. Empty v1 database. Reopening changes nothing (full table snapshot). **Forced re-run of v2** after gameplay: no duplicate rows, no second grant of unlock seeds, progress not overwritten. **Failed upgrade rolls back completely** (still v1, 6 plots / 6 items). Newer-schema refusal. Corrupted v1 data (missing item row, unknown crop) still fails to load and is not repaired. Invalid or missing quest state rejected. A Phase 1 player can harvest and save after the upgrade. New players next to migrated ones. |
| Rules / route tests | Starter seeds, refill by level, unlock seeds on harvest and claim (exact boundary, once only, multi-level), unlocked planting, `LEVEL_TOO_LOW` 409 over HTTP without side effects. Updated fixtures from 6 to 9 plots; "unknown crop" examples changed from `corn` to `rice`. |

Live checks on the Codespace:

- The running dev server (auto-reloaded by `tsx watch`) migrated the real dev database `server/data/farmverse.db`:
  version 2, 35 players, each with 9 plots, 10 inventory rows and 1 quest row (no player had reached level 3, so no
  unlock seeds were granted). `/api/health` returns OK, and only one server process is running.
- Headless Chromium on `localhost:5173`: the farm loads with a 9-plot state, 3 seed buttons, starter seeds only for
  Wheat / Carrot / Tomato, and no page errors.

## Problem found and resolved

The dev Vite process (running since 19:01) had cached `shared/package.json` from before Step 2.1, so it
returned 500 for `FarmScene.ts` (`"./progression" is not exported`). This was a cache issue in the running dev process,
not a code bug (typecheck, Vitest and `vite build` resolve the export). Fixed by restarting Vite inside its own process
(`touch client/vite.config.ts`, content unchanged; same PID, no second instance).

## Remaining issues / notes

- The dev database is now schema v2. Older server code (before this commit) refuses to open it ("newer than this
  server supports"). Going back would need a fresh database.
- An action-log replay of a request made **before** the upgrade returns the stored 6-plot `FarmState`, which the new
  client validator rejects (9 plots). This only affects retrying a request that was in flight across the upgrade.
- A local browser on `http://localhost:5173` stays in "Reconnecting" with the current `.env`
  (`CLIENT_ORIGIN=https://localhost:5173`, set for the Codespaces URL). This is unrelated to this step.
