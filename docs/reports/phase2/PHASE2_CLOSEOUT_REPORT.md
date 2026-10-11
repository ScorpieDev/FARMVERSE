# Phase 2 — Progression: closeout report

Date: 2026-10-11 · Status: **ready to close, awaiting Game Director approval.** Android device check deferred (as in Phases 0 and 1).

## 1. Roadmap tasks

| Roadmap task (`DEVELOPMENT_ROADMAP.md`) | Delivered | Commits |
|---|---|---|
| XP | Server grants XP on harvest and quest claim; total stored per player | `e2e8084` (Phase 1), `356d3c7` |
| Level | Derived from XP (50 × L per level, max 10), never stored | `f639918` |
| Basic unlocks | Plots 7–9 (levels 2 / 4 / 6), Corn (3), Strawberry (5); enforced by the server (`LEVEL_TOO_LOW`) | `f639918`, `aaf92e6`, `9deea48` |
| Basic quests | 8-quest tutorial chain, progress saved in the plant / harvest transactions, `POST /api/quests/claim` with request IDs | `aaf92e6`, `356d3c7` |
| Progression UI | Level / XP bar, locked plots and crops, quest row with position, progress and reward, Claim, level-up messages; portrait and landscape | `7a97540`, `5329631` |

Design decisions P2-1…P2-7 were applied as approved (`PHASE2_PROGRESSION_PLAN_REPORT.md`). No coin sink and no achievements, as decided.

## 2. Verification

| Check | Result | Evidence |
|---|---|---|
| Typecheck, unit and integration tests | 814 passing (shared 279, server 414, client 121) | `PHASE2_STEP2_6_REPORT.md` §1 |
| Local browser E2E (temporary database, 8 screen sizes) | 38 / 38 | `PHASE2_STEP2_6_REPORT.md` §2 |
| Codespaces URL, real dev server and database, real-time play to level 2 with reloads | All checks passed; no defects | `PHASE2_STEP2_6_REPORT.md` §6 |
| Android device | Not tested; deferred to the Game Director | `PHASE2_STEP2_6_REPORT.md` §4 |

## 3. Carried forward (not blocking)

- Codespaces WebSocket-origin changes (10 files) still uncommitted, awaiting a Game Director decision (`docs/reports/phase1/PHASE1_CODESPACES_WS_ORIGIN_FIX_REPORT.md`).
- After a reload the selected seed returns to Wheat even with 0 Wheat seeds (UX).
- No favicon (404 in the console).
- Large landscape screens leave empty space under the controls column.
- Reward and level values are provisional; tune after playtesting.

## 4. Decision requested

Close Phase 2 and start Phase 3 design review (`docs/reports/phase3/PHASE3_BUILDING_PLAN_REPORT.md`).
