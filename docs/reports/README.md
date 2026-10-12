# FARMVERSE — Phase reports

Working reports produced during development: plans submitted for Game Director review, step reports with test evidence, and audits. They are the written record of Game Director decisions and of manual browser checks.

The core documents in `docs/` (`CURRENT_STATUS.md`, `DEVELOPMENT_ROADMAP.md`, `CHANGELOG.md`, `TECHNICAL_ARCHITECTURE.md`, `GAME_DESIGN.md`, `GAME_RULES.md`) are the source of truth for the current state. These reports are history: they are kept as written, with correction notes added where a later finding changed a conclusion. Paths inside older reports may still say `docs/PHASE0_*.md` / `docs/PHASE1_*.md`; the files now live in the folders below.

Most reports are written in Vietnamese.

## Phase 0 — Foundation (`phase0/`)

| File | Content |
|---|---|
| `PHASE0_PLAN.md` | Phase 0 step plan and the four approved foundation decisions |
| `PHASE0_STEP4_PLAN_REPORT.md`, `PHASE0_STEP4_REPORT.md` | Fastify server, `GET /api/health` |
| `PHASE0_STEP5_PLAN_REPORT.md`, `PHASE0_STEP5_REPORT.md` | WebSocket `/ws` (`ws`) |
| `PHASE0_STEP6_PLAN_REPORT.md`, `PHASE0_STEP6_REPORT.md` | Phaser 3 client, Vite dev proxy |
| `PHASE0_STEP7_PLAN_REPORT.md`, `PHASE0_STEP7_REPORT.md` | Client–server connection; real Codespaces connection evidence |
| `PHASE0_STEP8_PLAN_REPORT.md`, `PHASE0_STEP8_REPORT.md` | README, end-to-end checks, browser test results |
| `PHASE0_STEP9_REVIEW_REPORT.md` | Proposed documentation corrections (A–E) |
| `PHASE0_DOCS_REVIEW_REPORT.md` | Documentation corrections actually applied (A–D); pairs with the review report above |
| `PHASE0_CLOSEOUT_AUDIT.md` | Phase 0 closeout audit and its resolution |

Steps 1–3 predate the report convention; see their commit messages (`5faeaff`, `1bbb65d`, `3ea25bc`).

## Phase 1 — Farming (`phase1/`)

| File | Content |
|---|---|
| `PHASE1_FARMING_PLAN_REPORT.md` | Phase 1 design and decisions (section 0 is authoritative) |
| `PHASE1_STEP1_1_REPORT.md` | Step 1.1 — farming contract in `shared` |
| `PHASE1_STEP1_2_PLAN_REPORT.md`, `PHASE1_STEP1_2_REPORT.md` | Step 1.2 — pure server farming rules |
| `PHASE1_ZOOM_LAYOUT_FIX_REPORT.md` | Fix: layout distorted by browser zoom and window resize (root cause, tests, zoom/size results) |
| `PHASE1_STEP1_8_E2E_REPORT.md` | Step 1.8 — end-to-end verification of Steps 1.3–1.7 (storage, rewards, session, farm API, client farm scene) |

## Phase 2 — Progression (`phase2/`)

| File | Content |
|---|---|
| `PHASE2_PROGRESSION_PLAN_REPORT.md` | Phase 2 draft design (level curve, unlocks, quests, UI) and decisions awaiting the Game Director |
| `PHASE2_STEP2_1_REPORT.md` … `PHASE2_STEP2_4_REPORT.md` | Steps 2.1–2.4 — shared progression data, server rules, new crops / plots and schema v2, progression API |
| `PHASE2_STEP2_5_REPORT.md` | Step 2.5 — client progression UI (+ addendum: quest position and reward) |
| `PHASE2_STEP2_6_REPORT.md` | Step 2.6 — end-to-end browser verification (local and through the Codespaces URL) |
| `PHASE2_CLOSEOUT_REPORT.md` | Phase 2 closeout: roadmap tasks, evidence, carried-forward items (+ §5 review 2026-10-12) |

## Phase 3 — Building (`phase3/`)

| File | Content |
|---|---|
| `PHASE3_BUILDING_PLAN_REPORT.md` | Phase 3 draft design (grid, decorations, shop, edit mode) and decisions awaiting the Game Director |
| `PHASE3_STEP3_1_REPORT.md` | Step 3.1: shared farm grid, decoration catalog, rotation and placement / layout checks |
| `PHASE3_STEP3_2_REPORT.md` | Step 3.2: server building rules, schema v3, object place / move / rotate / remove API |
| `PHASE3_STEP3_3_REPORT.md` | Step 3.3: client Edit farm mode (grid, decorations, place / move / rotate / remove) and browser check |
| `PHASE3_STEP3_4_REPORT.md` | Step 3.4: decoration coin shop (P3-4 / P3-5 decisions, buy API, Buy button) and browser check |
| `PHASE3_STEP3_5_E2E_REPORT.md` | Step 3.5: end-to-end check through the Codespaces URL (buy, place, move, rotate, remove, reload) — 24/24 |
| `PHASE3_CLOSEOUT_REPORT.md` | Phase 3 closeout: roadmap tasks, evidence, carried-forward items (+ §5 review 2026-10-12) |

## Phase 4 — Character (`phase4/`)

| File | Content |
|---|---|
| `PHASE4_CHARACTER_PLAN_REPORT.md` | Phase 4 design (shape-drawn character, 12 cosmetics, coin shop, Character screen); P4-1…P4-4 approved 2026-10-12 |
| `PHASE4_STEP4_1_REPORT.md` | Step 4.1: shared cosmetic catalog, skin tones, appearance checks, `ALREADY_OWNED` |
| `PHASE4_STEP4_2_REPORT.md` | Step 4.2: server character rules, schema v4, equip and cosmetic shop API |
| `PHASE4_STEP4_3_REPORT.md` | Step 4.3: client character drawing, Character screen, header avatar; browser smoke test 13/13 |
| `PHASE4_STEP4_4_E2E_REPORT.md` | Step 4.4: end-to-end check through the Codespaces URL (create, wear, buy, reload) — 24/24 |
| `PHASE4_CLOSEOUT_REPORT.md` | Phase 4 closeout: roadmap tasks, evidence, carried-forward items |
| `PHASE4_STATUS_REVIEW_REPORT.md` | Status review 2026-10-12: Phases 2–3 checked against commits, Phase 4 conditional approval, risk review of the uncommitted WebSocket/Codespaces changes |
| `PHASE4_ACCEPTANCE_CONDITIONS.md` | Phase 4 conditions C1–C4: how to check, actual results (production build through Codespaces 12/12; Android / signed-in browser open) |

## Project status

| File | Content |
|---|---|
| `PROJECT_STATUS_SUMMARY.md` | Status of every phase, open issues and the conditions to start Phase 5 |

## Phase 5 — Multiplayer (`phase5/`)

| File | Content |
|---|---|
| `PHASE5_MULTIPLAYER_PLAN_REPORT.md` | Phase 5 design (farm rooms, online list + farm code, tap-to-move, generated names, protocol 2, security); P5-1…P5-4 approved 2026-10-12 |
| `PHASE5_STEP5_1_REPORT.md` | Step 5.1: protocol 2, WebSocket authentication, schema v5 profiles; Codespaces check 9/9 |
| `PHASE5_STEP5_2_REPORT.md` | Step 5.2: heartbeat, hello timeout, one connection per player, connection and rate limits; browser 8/8 |
| `PHASE5_STEP5_3_REPORT.md` | Step 5.3: server farm rooms, visitor farm view API, online list; Codespaces API check 10/10 |
| `PHASE5_STEP5_4_REPORT.md` | Step 5.4: client Visit screen and farm room; two-player browser check 18/18 |
