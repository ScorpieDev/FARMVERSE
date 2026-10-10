# FARMVERSE — Phase 0 Closeout Audit

Date: 2026-10-10
Auditor: Claude (Lead Developer), for Game Director approval
Status of this document: untracked working report (not committed)

No code, architecture, branch or commit was changed to produce this audit. The only file created is this report.

---

## 1. Scope and evidence reviewed

| Area | Evidence |
|---|---|
| Git | `git branch --show-current`, `git fetch`, `git status -sb`, `git rev-list --left-right --count main...origin/main`, `git log` |
| Status documents | `docs/CURRENT_STATUS.md`, `docs/DEVELOPMENT_ROADMAP.md`, `docs/CHANGELOG.md`, `docs/TECHNICAL_ARCHITECTURE.md` §26 |
| Untracked reports | The 17 `docs/PHASE0_*.md` and `docs/PHASE1_*.md` files (titles and line counts below) |
| Code | `shared/`, `server/`, `client/` on `main` at `e02e344` |
| Checks run during this audit | `npm run typecheck`, `npm test`, `npm audit` (results in §3) |
| Manual / browser evidence | Game Director reports recorded in `PHASE0_STEP6_REPORT.md`, `PHASE0_STEP7_REPORT.md`, `PHASE0_STEP8_REPORT.md` |

Phase 0 acceptance criteria come from `DEVELOPMENT_ROADMAP.md` (Phase 0 "Completion"): client runs, server runs, client can connect to the server.

---

## 2. Git status

| Item | Result |
|---|---|
| Branch | `main` |
| Relation to `origin/main` (after `git fetch`) | In sync — 0 ahead, 0 behind |
| Staged files | None |
| Modified tracked files | None |
| Untracked files | 17, all under `docs/` |

Recent history:

| Commit | Phase | Content |
|---|---|---|
| `5faeaff` | Phase 0 — Step 1 | Monorepo workspace |
| `1bbb65d` | Phase 0 — Step 2 | Shared protocol types |
| `3ea25bc` | Phase 0 — Step 3 | TypeScript + Vitest tooling |
| `b2748ca` | Phase 0 — Step 4 | Fastify server, `/api/health` |
| `4436baa` | Phase 0 — Step 5 | WebSocket `/ws` |
| `6bfc223` | Phase 0 — Step 6 | Phaser 3 client, Vite dev proxy |
| `04f1aa8` | Phase 0 — Step 7 | Client connection management |
| `5924c4f` | Phase 0 — Step 8 | README, root dev scripts |
| `69d4b18` | Phase 0 — Step 9 | Status docs: close Phase 0 |
| `7817ac7` | Phase 0 — Step 9 | Status docs: push status |
| `7afe6d9` | **Phase 1 — Step 1.1** | Farming contract in `shared` |
| `e02e344` | **Phase 1 — Step 1.2** | Server farming rules (pure logic) |

All of the above are pushed. Nothing was reset, deleted or rewritten.

---

## 3. Acceptance criteria and results

### 3.1 Automated checks (run during this audit)

| Command | Exit | Result |
|---|---|---|
| `npm run typecheck` | 0 | shared, server, client — no errors |
| `npm test` | 0 | shared 4 files / 218 tests; server 5 files / 244 tests; client 3 files / 44 tests — **506 passed, 0 failed** |
| `npm audit` | — | 0 vulnerabilities (info/low/moderate/high/critical all 0) |

Note: these totals include Phase 1 tests (shared contract tests from Step 1.1 and `server/src/farming/rules.test.ts` from Step 1.2). Phase 0 alone was 150 tests at Step 8.

Runtime: Node 24.21.0 in the Codespace; the repository pins Node 22 (`.nvmrc` = `22`, `engines.node` = `>=22.12.0`). The test run did not use Node 22.

### 3.2 Phase 0 completion criteria

| Criterion (`DEVELOPMENT_ROADMAP.md`) | Result | Evidence |
|---|---|---|
| Client runs | **Met** | `npm run build -w client` passes; Game Director saw the FARMVERSE scene through the Codespaces URL (Step 6) |
| Server runs | **Met** | `npm run dev:server` / `start` used throughout Steps 4–8; health endpoint returns 200; server tests pass |
| Client connects to server | **Met** | Game Director confirmed `Connected` through the Codespaces URL with `CLIENT_ORIGIN=https://localhost:5173` (Step 7); RTT 223 ms observed; Offline after stopping the server and `Connected` again after restart (2026-10-10, Step 8 report) |

### 3.3 Phase 0 browser checks

| Check | Status | Evidence / gap |
|---|---|---|
| Scene renders in browser (Codespaces URL) | Verified | Game Director, Step 6 |
| `Connected` + RTT in browser | Verified | Game Director, Steps 7–8 |
| Offline → server restart → `Connected` | Verified (outcome) | Game Director, 2026-10-10. The exact action that triggered reconnection from `Offline` (tap vs. reload) was not recorded |
| **Resize / portrait ↔ landscape** | **Outstanding** | Implemented (`Scale.RESIZE`, relayout on resize) but no browser result reported |
| **`vite preview` through Codespaces** | **Outstanding** | Only verified by script on `localhost:4173` (proxy works); not opened through the Codespaces URL; required `CLIENT_ORIGIN` for port 4173 unverified |
| **HMR through Codespaces** | **Outstanding** | Never checked |
| Android device | Deferred | Postponed by Game Director decision; not claimed as supported |

---

## 4. Documentation reconciliation

### 4.1 Status documents vs. actual history

| Document | Statement | Actual state | Finding |
|---|---|---|---|
| `CURRENT_STATUS.md` line 11 | "FOUNDATION — Phase 0 completed. **Phase 1 not started.**" | Phase 1 Steps 1.1 and 1.2 committed and pushed (`7afe6d9`, `e02e344`) | **Out of date** |
| `CURRENT_STATUS.md` line 102, "Next phase" | "Phase 1 — Farming (NOT STARTED, waits for Game Director approval)" | Phase 1 started with Game Director approval of each step | **Out of date** |
| `CURRENT_STATUS.md` commit list | Lists Phase 0 commits up to `5924c4f`; "last Phase 0 commit: `69d4b18`" | `69d4b18` and `7817ac7` are also Phase 0 (status docs) | Minor omission |
| `DEVELOPMENT_ROADMAP.md` "Current phase" | Phase 0 COMPLETED, review pending; Phase 1 NOT STARTED | Phase 1 in progress | **Out of date** |
| `CHANGELOG.md` | Phase 0 entry only; "Next: Phase 1 — NOT STARTED" | No entry for Phase 1 Steps 1.1–1.2 | **Out of date** |
| `TECHNICAL_ARCHITECTURE.md` §26 | "Database (chưa chọn)"; "Gameplay … (Phase 0 chỉ có kết nối)" | Database still not chosen (correct); pure farming rules exist on the server but no gameplay is exposed (no route, no UI) | Accurate, could mention Phase 1 rules |
| `CURRENT_STATUS.md` open items | Resize/orientation, `vite preview`/HMR not verified; Android postponed; review pending | Matches §3.3 | Accurate |

Phase 1 work is correctly isolated in code: `shared/src/farming.ts`, additions to `shared/src/api.ts` / `errors.ts`, and `server/src/farming/`. No route, database or client code uses it yet, and the WebSocket protocol v1 is unchanged. It does not affect Phase 0 behaviour, but the status documents do not mention it.

### 4.2 Untracked documentation files (17)

| File | Lines | Type | Recommendation |
|---|---|---|---|
| `PHASE0_PLAN.md` | 309 | Phase 0 master plan + decisions | **Retain** (decision record). Note: its "Tiến độ (chưa push)" table is out of date |
| `PHASE0_STEP4_PLAN_REPORT.md` | 70 | Step plan | Retain as history or archive; superseded by the step report |
| `PHASE0_STEP4_REPORT.md` | 88 | Step report | **Retain** |
| `PHASE0_STEP5_PLAN_REPORT.md` | 180 | Step plan | Retain as history or archive |
| `PHASE0_STEP5_REPORT.md` | 88 | Step report | **Retain** |
| `PHASE0_STEP6_PLAN_REPORT.md` | 204 | Step plan (contains corrected CLIENT_ORIGIN note) | Retain as history or archive |
| `PHASE0_STEP6_REPORT.md` | 173 | Step report | **Retain** |
| `PHASE0_STEP7_PLAN_REPORT.md` | 252 | Step plan | Retain as history or archive |
| `PHASE0_STEP7_REPORT.md` | 218 | Step report (real Codespaces connection evidence) | **Retain** |
| `PHASE0_STEP8_PLAN_REPORT.md` | 131 | Step plan | Retain as history or archive |
| `PHASE0_STEP8_REPORT.md` | 159 | Step report (browser test results) | **Retain** |
| `PHASE0_STEP9_REVIEW_REPORT.md` | 196 | Proposed doc corrections A–E | **Overlaps** with `PHASE0_DOCS_REVIEW_REPORT.md` (proposal vs. applied changes); line references are stale. Keep one, or archive both together |
| `PHASE0_DOCS_REVIEW_REPORT.md` | 151 | Applied doc corrections A–D | Retain (or merge with the above) |
| `PHASE1_FARMING_PLAN_REPORT.md` | 856 | Phase 1 design (v1.0–1.6) | **Retain** — Phase 1 source of truth (section 0); **not Phase 0** |
| `PHASE1_STEP1_1_REPORT.md` | 147 | Phase 1 step report | Retain — Phase 1; "Implemented"/"Test" sections partly predate revision 2 |
| `PHASE1_STEP1_2_PLAN_REPORT.md` | 213 | Phase 1 step plan | Retain as history or archive — Phase 1 |
| `PHASE1_STEP1_2_REPORT.md` | 159 | Phase 1 step report | Retain — Phase 1 |

No file is an exact duplicate. All are temporary working reports in the sense that they are not referenced by README or the core docs. None should be deleted without a decision, because several hold the only written record of Game Director decisions and browser test results.

---

## 5. Outstanding issues

1. **Status documents do not reflect Phase 1 progress** (§4.1). Phase 1 Steps 1.1–1.2 are on `origin/main` while `CURRENT_STATUS.md`, `DEVELOPMENT_ROADMAP.md` and `CHANGELOG.md` say Phase 1 has not started.
2. **Phase 0 browser checks outstanding:** resize / portrait ↔ landscape, `vite preview` through Codespaces, HMR through Codespaces (§3.3).
3. **Android** not tested (deferred by decision).
4. **Overall Phase 0 review** still recorded as "pending Game Director approval" in three documents.
5. **17 reports untracked**: the decision history exists only in this Codespace; it would be lost if the Codespace is deleted.
6. **Node version mismatch:** `.nvmrc` 22 / `engines >=22.12.0` vs. Node 24.21 used for all runs; Node 22 reaches end of life on 2027-04-30. (A Node 24 decision is recorded for Phase 1 Step 1.3.)
7. `PHASE0_PLAN.md` progress table and `PHASE0_STEP9_REVIEW_REPORT.md` line numbers are stale (untracked files only).

---

## 6. Risks and recommended actions

### 6.1 Security

| # | Risk | Severity now | Recommended action / when |
|---|---|---|---|
| S-1 | **No authentication** on HTTP or WebSocket; any client with an allowed Origin can connect | Low (no gameplay or data yet) | Guest token + Bearer auth (planned Phase 1 Step 1.4); WebSocket auth before Phase 5 multiplayer |
| S-2 | **Origin check weakened on Codespaces**: forwarding rewrites Origin to `https://localhost:5173`, so the check cannot tell pages apart there | Low (dev only; private port requires GitHub login) | Keep Codespaces ports private; never rely on Origin as authentication; production uses the real origin |
| S-3 | **No connection or rate limits** (WebSocket connections, guest session creation later) | Low now, high for public deploy | Connection cap, per-IP rate limits, before any public deployment / Phase 5 |
| S-4 | **No server-side heartbeat**: dead WebSocket connections are only cleaned up by TCP/close | Low | Server ping/terminate before multiplayer (Phase 5), as decided in Step 5 |
| S-5 | **4xx error handler returns Fastify's `error.message`** to the client (`server/src/app.ts` line 42) and uses `INVALID_MESSAGE` for HTTP; A-6 decision (`INVALID_REQUEST`) not yet applied | Low | Apply A-6 and return a fixed message at the first farming API step (1.4) |
| S-6 | **No request IDs / idempotency / action log** (TECHNICAL_ARCHITECTURE §12, §19) | Not applicable yet (no state-changing API) | Mandatory in Phase 1 Steps 1.3–1.5 (designed, approved) |
| S-7 | WebSocket validator accepts the new farming error codes | None in practice (server never sends them over WS) | Accepted (decision D-c); revisit with WS gameplay messages in Phase 5 |
| S-8 | `npm audit` clean today; npm 11 blocks `esbuild` postinstall (no functional impact) | Low | Keep `npm audit` in the release checklist |

### 6.2 Architecture / operations

| # | Risk | Recommended action |
|---|---|---|
| A-1 | Server runs with `tsx`; no production build | Decide a build/bundle step before deployment (Phase 10 / deployment work) |
| A-2 | No database yet; storage choice (`node:sqlite` vs `better-sqlite3`) and Node 24 pin pending | Decide at Phase 1 Step 1.3 with a compatibility check; validate `FarmData` on load (`assertFarmData` exists) |
| A-3 | Node pin (22) differs from runtime (24) | Align `.nvmrc` / `engines` / README in Step 1.3 as already planned |
| A-4 | Client bundle 1.2 MB (single Phaser chunk), dev bundle ~20 MB | Code-splitting / optimisation in Phase 10; use `vite preview` for phone tests meanwhile |
| A-5 | Reports outside version control | Decide a documentation policy (see §7) |
| A-6 | No CI | Add CI (typecheck + test + build) before multiple contributors or deployment, per TECHNICAL_ARCHITECTURE §23 |

### 6.3 Recommended actions before closing Phase 0 (all require Game Director approval)

1. **Update status documents** (`CURRENT_STATUS.md`, `DEVELOPMENT_ROADMAP.md`, `CHANGELOG.md`) to record: Phase 0 approved (once approved), Phase 1 in progress with Steps 1.1–1.2 done (`7afe6d9`, `e02e344`), and the remaining open items. Documentation-only change.
2. **Decide the outstanding browser checks**: either run resize/orientation, `vite preview` and HMR through Codespaces now, or formally defer them (like Android) to Phase 10 polish.
3. **Decide a documentation policy** for the 17 reports, e.g. commit them under `docs/reports/phase0/` and `docs/reports/phase1/` (moving files, no content change), keep only step reports + plans with decisions, and merge or archive `PHASE0_STEP9_REVIEW_REPORT.md` with `PHASE0_DOCS_REVIEW_REPORT.md`.

---

## 7. Documentation and Git status (end of audit)

- Branch `main`, in sync with `origin/main` at `e02e344`.
- No staged or modified tracked files.
- Untracked: the 17 reports listed in §4.2, plus this file `docs/PHASE0_CLOSEOUT_AUDIT.md` (18 total).
- No commits, pushes, resets or deletions were performed during this audit.

---

## 8. Recommendation

**CONDITIONAL APPROVAL**

All three Phase 0 completion criteria are met with direct evidence (Game Director browser confirmation and passing automated checks: typecheck clean, 506/506 tests, `npm audit` clean). No Phase 0 defect requiring a code or architecture change was found.

Conditions for final approval:

1. Status documents are reconciled with the actual history (Phase 1 Steps 1.1–1.2 already committed).
2. The outstanding browser checks (resize / portrait ↔ landscape, `vite preview` and HMR through Codespaces) are either performed or explicitly deferred by the Game Director, as Android already is.
3. A decision is recorded on how the untracked Phase 0/Phase 1 reports are kept.

Security risks S-1 to S-6 are not Phase 0 blockers; they are scheduled in Phase 1 (Steps 1.3–1.5) and must be closed before any multiplayer (Phase 5) or public/production deployment.

---

## 9. Resolution (2026-10-10, execution directive "Phase 0 closeout → Phase 1")

The Game Director issued an execution directive to close Phase 0 and continue Phase 1. The conditions in §8 were worked as follows.

### 9.1 Browser checks — headless Chromium evidence

Tool: Playwright 1.64.0 with Chrome Headless Shell 156, installed in the user cache / scratch folder only (not a project dependency). The client and server ran locally (`npm run dev:client`, `npm run dev:server`, `npm run preview -w client`). Screenshots were inspected for every case below.

| Check | Result | Evidence |
|---|---|---|
| Responsive resize (360×740 → 740×360 → 360×740 → 1280×720) | **VERIFIED after fix** | Canvas, CSS size and viewport match at each size; no page scroll (`scrollWidth/Height` = viewport); title and status centred |
| Portrait ↔ landscape in a mobile/touch context | **DEFECT FOUND, FIXED, VERIFIED** | Before the fix the canvas stayed 360×740 after rotating to 740×360 (title cut off, status off-screen). After the fix the canvas follows within 200 ms in both directions |
| `vite preview` (production build) | **VERIFIED locally** | Build served on `localhost:4173`; preview uses the same `/api` and `/ws` proxy; `Connected · v0.0.0` with `CLIENT_ORIGIN=http://localhost:4173`; resize/rotation correct |
| Vite HMR (local) | **VERIFIED locally** | `[vite] connected`; a temporary edit of `BootScene.ts` triggered a page update in the open browser; the file was restored byte-identical |
| Connection and reconnection in a browser | **VERIFIED locally** | `Connected · v0.0.0` → server stopped → `Offline · Tap to retry` (screenshot after 40 s) → server restarted → tap → `Connected · v0.0.0` (screenshot; server log shows one new `WebSocket connected`) |
| `vite preview` through the Codespaces URL | **NOT VERIFIED** | The forwarded port requires a GitHub-authenticated browser session that the headless browser does not have; the required `CLIENT_ORIGIN` for port 4173 through Codespaces is not confirmed |
| HMR through the Codespaces URL | **NOT VERIFIED** | Same reason |
| Android device | **NOT VERIFIED** | No device; deferred by Game Director decision |

Console output in all runs: no application errors; only headless-GPU WebGL performance warnings ("GPU stall due to ReadPixels") and, during the reconnect test, the expected `502` health-check failures while the server was stopped.

### 9.2 Defect fixed — rotation does not resize the canvas

- Cause: Phaser 3.90.0 `ScaleManager` handles `screen.orientation` `change` / `orientationchange` by calling `refresh()` before reading the new parent size; `updateScale()` then reads the new size but its result is ignored, and the next `step()` sees no change. The canvas keeps the old orientation.
- Fix (`client/src/main.ts`): on `screen.orientation` `change` and `orientationchange`, on the next animation frame call `game.scale.getParentBounds()` and `game.scale.refresh()`. No change to Phaser itself.

### 9.3 Security finding S-5 fixed (approved decision A-6)

`server/src/app.ts`: Fastify client errors (4xx, e.g. malformed JSON, unsupported content type) now return `{ code: "INVALID_REQUEST", message: "Invalid request" }` instead of `INVALID_MESSAGE` with Fastify's internal message. Tests updated/added in `server/src/app.test.ts`.

Other findings (S-1 … S-4, S-6) remain scheduled as in §6 — they are not Phase 0 defects.

### 9.4 Node.js version

- Decision on record (Game Director, Phase 1 planning P-4): Node.js 24 LTS.
- Applied: `.nvmrc` = `24`, `engines.node` = `>=24.0.0`, README "Requirements" updated, lockfile root `engines` synced.
- All checks in this resolution ran on Node 24.21.0, the pinned major version. Node 22 is no longer a supported target.

### 9.5 Documentation

- The 18 reports were moved (content unchanged) to `docs/reports/phase0/` and `docs/reports/phase1/`, with an index in `docs/reports/README.md`. No report was deleted; the overlapping pair `PHASE0_STEP9_REVIEW_REPORT.md` / `PHASE0_DOCS_REVIEW_REPORT.md` is kept together and described in the index.
- `CURRENT_STATUS.md`, `DEVELOPMENT_ROADMAP.md`, `CHANGELOG.md` and `TECHNICAL_ARCHITECTURE.md` §26 were reconciled with the commit history (Phase 1 Steps 1.1–1.2 committed) and with the verification results above.

### 9.6 Updated recommendation

**APPROVE — Phase 0 closed**, with the NOT VERIFIED items in §9.1 recorded as known limitations (they need a human browser session on the Codespaces URL or a physical Android device). The completion criteria are met with direct browser evidence, not tests alone.
