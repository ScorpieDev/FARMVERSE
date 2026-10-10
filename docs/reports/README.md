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
