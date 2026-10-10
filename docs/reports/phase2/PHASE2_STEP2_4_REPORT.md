# Phase 2 — Step 2.4: progression API and quest claim

Date: 2026-10-10 · Builds on `9deea48` (Step 2.3). Stops before Step 2.5 for Game Director review.

## Delivered

### Contract (`shared/src/api.ts`)

- `FarmState.progression`: `{ level, xpIntoLevel, xpForNextLevel (null at level 10), unlockedPlotCount }`.
- `FarmState.quest`: active quest `{ id, title, progress, target, complete, reward }`, or `null` when the chain is finished.
- `POST /api/quests/claim` (`QUEST_CLAIM_PATH`): body `{ requestId }` only. The server picks the quest and reward. The response is
  `QuestClaimResponse` = the new `FarmState` + `claimed: { questId, reward }`.
- Validators: `isFarmState` now also checks that `progression` matches `xp` exactly (level, XP into level, next-level XP,
  plot count) and that `quest` is a known quest with consistent progress, target and complete flag. Also added: `isQuestView`,
  `isQuestClaimRequest`, `isQuestClaimResponse`.

### Server

| File | Change |
|---|---|
| `server/src/farming/quests.ts` (new) | Quest-state functions moved out of `progression.ts` without changes (`QuestState`, `recordQuestEvent`, `activeQuest`, …), so `rules.ts` can use them without a circular import. |
| `server/src/farming/progression.ts` | Keeps `levelChange` and `claimQuest`. |
| `server/src/farming/rules.ts` | `toFarmState(farm, quests, now)` derives `progression` from XP and `quest` from the stored quest state. |
| `server/src/farming/routes.ts` | Each action loads **and saves** farm + quest state in its one transaction (with the action log). Plant / harvest record quest events. New claim route uses the same `runAction` (request-ID replay, `REQUEST_ID_REUSED`, failures not recorded). `QUEST_NOT_COMPLETE` → 409. `GET /api/farm` returns level and quest. |
| `server/src/storage/farmStore.ts` | Import path only (`quests.ts`). |

The client sends nothing it could fake: coins, XP, level, growth time, quest and reward are all server-side. Extra
fields in a claim body (e.g. `reward: { coins: 99999 }`) are ignored (tested).

Not added (out of scope): no explicit level-up field in responses (the client can compare `progression.level`
before and after), and no UI. Both are Step 2.5 decisions.

## Tests

| Check | Result |
|---|---|
| `npm run typecheck` | Clean |
| `npm test` | shared **279**, server **414**, client **104**: **797 passed, 0 failed** |
| `npm run build -w client` | OK |

New tests:

- **`server/src/farming/questRoutes.test.ts` (24, HTTP):** new player at level 1 with the first quest. A harvest counts in
  the same response, a plant does not count for a harvest quest, other crops do not count, plant quests count, and a
  replayed harvest counts once. Claim pays the server reward once and moves on. Incomplete → 409 `QUEST_NOT_COMPLETE`
  with no change. Client-sent reward or quest is ignored. Replay with the same request ID → same body, no second payment.
  A new request ID after a claim → 409. **3 concurrent claims → exactly one 200.** **2 concurrent identical claims →
  paid once.** A failed claim is re-evaluated on retry. `REQUEST_ID_REUSED`. 400 for invalid bodies with no change.
  401 without a token. Reach-level quest at 149 vs 150 XP. **Level-up from a claim** → level 3, 7 plots, 5 Corn seeds,
  then Corn plants on plot 7. Finished chain → `quest: null` and 409.
- **Failure mid-transaction (2):** a database trigger makes the quest-state save fail *after* the farm save. Harvest and
  claim return 500 `INTERNAL_ERROR`, and the farm, inventory, coins, XP and quest are completely unchanged (rollback).
  After the fault is removed, a retry with the same request ID applies once, and a further replay does not pay again.
- **`rules.test.ts` (+4):** progression and quest in `toFarmState`, `null` at the end of the chain, corrupted quest state
  rejected, and the shared validator accepting every combination of XP × quest position.
- **`shared/src/api.test.ts` (+19):** consistency checks (level vs XP, next-level XP, plot count, unknown quest,
  progress > target, wrong complete flag, negative reward, zero target), claim request and response validators.
- Existing Phase 1 API tests: unchanged and passing (68 in routes / app / WebSocket).

Live checks on the Codespace (dev server reloaded by `tsx watch`, PID 67596):

- `GET /api/farm` returns 9 plots, `progression` level 1 and the first quest.
- Claiming an incomplete quest returns 409 `QUEST_NOT_COMPLETE`, and planting on plot 7 returns 409 `LEVEL_TOO_LOW`.
  This created one test guest player in the dev database.
- Headless Chromium on `localhost:5173`: the client accepts the new state, with no page errors.

## Risks / open points

- **Replays across the upgrade:** responses stored in the action log before this step have no `progression` / `quest`.
  Replaying such a request now returns a body the client validator rejects. This only affects a request in flight
  during the server upgrade (same class of issue as in Step 2.3).
- **Concurrency** is tested within one server process (serialised synchronous SQLite transactions). Several server
  processes on one database rely on `BEGIN IMMEDIATE` plus the action-log primary key; this is not tested with real
  separate processes.
- `server/src/farming/routes.test.ts` still contains the uncommitted Copilot `clientOrigins` hunk. The new API tests are in a
  separate file that builds its config with `loadConfig`, so they work with and without that change.
- The client has no level / quest / claim UI yet (Step 2.5).
