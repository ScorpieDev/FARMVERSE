# Phase 2 — Step 2.1: shared progression data

Date: 2026-10-10 · Decisions: P2-1…P2-7 approved by the Game Director as recommended
(`PHASE2_PROGRESSION_PLAN_REPORT.md` §4).

## Delivered

New module `shared/src/progression.ts` (export `@farmverse/shared/progression`), definitions and pure
functions only:

| Area | Content |
|---|---|
| Level (P2-2, L-A) | `MAX_LEVEL = 10`; `xpToAdvanceFrom(L) = 50 × L`; `totalXpForLevel` (0, 50, 150, 300, 500 … 2250); `levelProgress(xp)` → level, XP into level, XP for next (null at 10); `levelFromXp`. Level is derived from XP, never stored. |
| Unlocks (P2-3, U-A) | `LEVEL_UNLOCKS`: L2 plot 7, L3 Corn, L4 plot 8, L5 Strawberry, L6 plot 9. `plotCountForLevel`, `plotUnlockLevel`, `cropUnlockLevel` (Phase 1 crops = 1), `unlocksBetween` (for level-up messages). `PROGRESSION_CROP_IDS = corn, strawberry`. |
| Quests (P2-5, Q-A) | `QUESTS`: the 8 approved tutorial quests with goals (harvest / plant / reach_level) and coin + XP rewards; `questTarget`, `questAt`. |
| Errors | `LEVEL_TOO_LOW`, `QUEST_NOT_COMPLETE` added to `shared/src/errors.ts`. |

## Scope decision

The plan listed crop definitions and API types under Step 2.1. They were **moved to Steps 2.2 / 2.4**
because, in this codebase:

- Adding Corn / Strawberry to `CROPS` / `ITEM_IDS` immediately changes gameplay. `server/src/farming/rules.ts`
  gives starter seeds and refills for every entry of `CROPS`, `farmStore.ts` creates inventory rows
  for every `ITEM_IDS` entry, and the client draws one seed button per `CROP_IDS` entry. Level-3/5 crops
  would become plantable at level 1 before the server checks levels.
- Adding `level` / `quest` to the `FarmState` validator would make the current client reject responses
  from the current server.

The Corn / Strawberry values stay as approved (P2-4: 3 min / 9 coins / 4 XP; 8 min / 20 coins / 9 XP)
and are added to the crop list together with the server's unlock check.

No server, client, storage or API behaviour changed in this step.

## Tests

| Check | Result |
|---|---|
| `npm run typecheck` (all workspaces, as `shared` is used by server and client) | Clean |
| `npm test -w shared` | 251 passed (226 before + 25 new in `progression.test.ts`; `errors.test.ts` updated for the 2 new codes) |
| Server / client tests | Not rerun: no server or client file changed. The only cross-package change is 2 new error codes, which are mapped through `Partial<Record<ErrorCode, …>>`, and typecheck passed. |

## Files

`shared/src/progression.ts` (new), `shared/src/progression.test.ts` (new), `shared/src/errors.ts`,
`shared/src/errors.test.ts`, `shared/package.json` (export), `docs/CURRENT_STATUS.md`, this report.

## Next: Step 2.2

Pure server rules: add Corn / Strawberry to the crop and item lists, refuse planting above the
player's level (`LEVEL_TOO_LOW`), make the usable plot count depend on level, count quest progress on
successful plant / harvest, and claim rewards. Includes tests. Storage (9 plots, quest progress) follows
in Step 2.3.
