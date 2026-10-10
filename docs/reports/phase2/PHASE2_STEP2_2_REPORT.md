# Phase 2 — Step 2.2: pure server progression rules

Date: 2026-10-10 · Builds on Step 2.1 (`f639918`).

## Delivered

| File | Content |
|---|---|
| `server/src/farming/rules.ts` | `unlockError(xp, plotIndex, cropId)`: `LEVEL_TOO_LOW` when the plot or crop needs a higher level (plots outside the unlock table count as locked). `plant` checks it first, then the plot, then the seed. `RuleError` now includes `LEVEL_TOO_LOW`. |
| `server/src/farming/progression.ts` (new) | `levelChange(xpBefore, xpAfter)` → from / to / unlocks (for level-up messages). Quest state `{ index, progress }`: `startingQuestState`, `assertQuestState`, `recordQuestEvent` (only the active quest counts, capped at target), `activeQuest` (reach-level progress derived from XP), `claimQuest` (adds coins + XP, moves to the next quest, reports a level-up; `QUEST_NOT_COMPLETE` otherwise). Pure, input never modified. |
| `server/src/farming/routes.ts` | `LEVEL_TOO_LOW` → HTTP 409 plus a message (the error maps are exhaustive over `RuleError`). Not reachable yet: farms still have 6 plots and the 3 Phase 1 crops. |

No visible gameplay change. Phase 1 crops and plots are allowed at level 1, and the existing rules and route tests pass unchanged.

## Scope decision (verified in code)

Corn / Strawberry are **not** added to the shared crop and item lists in this step. That moves to Step 2.3,
because adding them now would break:
- `saveFarm` updates one inventory row per `ITEM_IDS` entry and throws "missing item" for existing players.
- `loadFarm` + `assertFarmData` require every `ITEM_IDS` entry.
- The client draws one seed button per `CROP_IDS` entry, but the layout has 3 slots (`layout.seedButtons[3]` is undefined).

"5 seeds granted when a crop unlocks" also needs those inventory rows, so it moves to Step 2.3.

## Tests

| Check | Result |
|---|---|
| `npm run typecheck -w server` | Clean |
| `npm test -w server` (working tree) | 364 passed (342 + 22 new in `progression.test.ts`) |
| Commit contents alone (temporary worktree at `f639918` + the 4 files of this step, without the uncommitted Copilot WebSocket changes) | Typecheck clean, 358 passed (336 + 22) |
| Shared / client | Not rerun: no shared or client file changed. |

New tests cover: unlock levels for plots 7–9 and Corn/Strawberry with exact boundaries; Phase 1 planting unchanged;
level changes across several levels; quest counting (matching crop and kind only, cap, any-crop goal,
reach-level from XP, finished chain, corrupted state); claim (incomplete, finished, reward and next quest,
level-up, an already-satisfied reach-level quest, the full chain paid exactly once, corrupted farm).

## Next: Step 2.3

Storage migration v2: Corn / Strawberry items and crop definitions (P2-4 values), 9 plot rows (7–9
locked by level), a quest-state table, 5 seeds granted on unlock, and migration tests on v1 data.
