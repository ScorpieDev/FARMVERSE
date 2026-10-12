# FARMVERSE — project status summary

Date: 2026-10-12 (revised after the Game Director's decisions; code fix `e0c3293`).

Sources:
- `CURRENT_STATUS.md`, `DEVELOPMENT_ROADMAP.md` and `git log`;
- `PHASE2_CLOSEOUT_REPORT.md`, `PHASE3_CLOSEOUT_REPORT.md`, `PHASE4_CLOSEOUT_REPORT.md`, `PHASE4_STATUS_REVIEW_REPORT.md`.

## 1. Phases

| Phase | Category | Evidence | Missing |
|---|---|---|---|
| 0 — Foundation | **Completed** (closed 2026-10-10) | `PHASE0_CLOSEOUT_AUDIT.md`; Game Director saw `Connected` through the Codespaces URL | Android; `vite preview` / HMR through Codespaces |
| 1 — Farming | **Completed** (closed 2026-10-10 by decision P2-1) | `PHASE1_STEP1_8_E2E_REPORT.md`; commits `7afe6d9` … `fc3ff87` | — |
| 2 — Progression | **Eligible to close, awaiting approval** (review: `PHASE2_CLOSEOUT_REPORT.md` §5) | Commits `f639918` … `5329631`, `c06d936` on `origin/main`; local browser 38/38; real play through Codespaces (`PHASE2_STEP2_6_REPORT.md` §6) | Closeout approval (none recorded); Android (deferred) |
| 3 — Building | **Eligible to close, awaiting approval** (review: `PHASE3_CLOSEOUT_REPORT.md` §5) | Commits `fbc1c46` … `0e393dd` on `origin/main`; Codespaces E2E 24/24; local 30/30 and 19/19 | Closeout approval; Android (deferred). "Buildings" are decorative only (C-A) |
| 4 — Character | **Conditionally approved** (2026-10-12) | Commits `3648a98`, `cd9bed8`, `a5640bd`, `a6fc0e9`; Codespaces E2E 24/24; local 13/13 | Still open: C1 Android / iOS device; C2 real GitHub-signed-in browser. Met: C3 production build through the Codespaces preview URL 12/12 (`e0c3293`); C4 (`37c3994`). See `PHASE4_ACCEPTANCE_CONDITIONS.md` |
| 5 — Multiplayer | **Not started** | — | Entry conditions in §4 |

Automated tests on `origin/main`, run 2026-10-12 before `37c3994` was committed:
- typecheck clean;
- `npm test`: shared 413, server 568, client 231 — 1212 passing;
- client build OK.

After `e0c3293` (client config only): `vite.config.test.ts` 6 and client 237 passing, typecheck clean, client build OK. Server and shared code were unchanged, so their tests were not rerun.

Historical notes, not edited:
- The Phase 3 and Phase 4 closeout reports still say "10 files uncommitted".
- This was superseded by `37c3994` on 2026-10-12.

## 2. Repository state

- `git status` before the fix: `main` in sync with `origin/main` (`0486852`), no unexpected source change. Code fix pushed as `e0c3293`; documentation pushed in the commit that follows it.
- Committed with this revision: this summary, the status / roadmap updates, and the reviews of Phases 2–4.
- Still untracked: `docs/reports/phase1/PHASE1_CODESPACES_WS_ORIGIN_FIX_REPORT.md`. It is kept outside Git until the Game Director decides.
- **`PHASE1_CODESPACES_WS_ORIGIN_FIX_REPORT.md` — assessment.**
  - What it is: a working log from 2026-10-10.
  - Why it is valuable:
    - it holds the only on-the-wire evidence that a real browser's Origin arrives as `https://localhost:5173` (final section);
    - it explains why token-based tests see `http://`;
    - it predicted the `vite preview` risk confirmed in §3.
  - Its problems:
    - earlier sections are superseded and contradict the final section (`http://` vs `https://`);
    - the test counts and the "proposed commit, awaiting decision" section are out of date;
    - it names the Codespace and process IDs (not secrets).
  - **Recommendation:** keep it in Git as a historical record, unedited, and add an index line saying "historical; the final section is authoritative; superseded by `37c3994` and `PHASE4_STATUS_REVIEW_REPORT.md`". The alternative is to keep it outside the repository. In that case the only Origin evidence lives in this Codespace and in the memory notes. Decision for the Game Director.

## 3. Open issues

1. **`vite preview` through Codespaces — FIXED by `e0c3293`** (history below).
   - What happens: the preview server answers 403 "Blocked request. This host … is not allowed" for the Codespaces hosts (ports 4174 and 5173). Localhost works (200).
   - Cause: since `37c3994`, `client/vite.config.ts` derives the allowed host only in development mode, while `vite preview` runs in production mode with an empty list. Before `37c3994`, every `*.app.github.dev` was allowed.
   - Effect: blocks Phase 4 condition 3 through Codespaces.
   - Fix (`e0c3293`):
     - preview accepts exactly `<codespace>-4173.<forwarding domain>`, with strict port 4173;
     - there is no wildcard, and `vite build` is unchanged;
     - own host → 200, other host → 403;
     - the production build passed 12/12 through Codespaces.
2. Android / iOS device tests deferred since Phase 0.
3. No check yet with a real GitHub-logged-in browser for Phases 3–4 (token plus `/ws` relay only).
4. A request logged before a schema upgrade (v3 or v4) and retried after it replays an old response; the client reports an invalid response once.
5. Provisional values: crop rewards, levels, decoration and cosmetic prices.
6. UX items: the seed selection resets after a reload, there is no favicon, and large landscape screens leave empty space.
7. Security work scheduled before multiplayer (`PHASE0_CLOSEOUT_AUDIT.md` §6):
   - real authentication (only guest tokens today);
   - connection and rate limits;
   - a server-side WebSocket heartbeat.

## 4. Conditions to start Phase 5 — Multiplayer

1. The Game Director approves the Phase 2 and Phase 3 closeouts. Both were reviewed and are eligible.
2. The Game Director decides how Phase 4 conditions C1 (Android / iOS) and C2 (signed-in real browser) are handled: checked by the Game Director now, or formally deferred.
3. The Game Director decides whether the Phase 1 origin report goes into Git.
4. A Phase 5 design plan (presence, movement, protocol v2, server-side heartbeat, connection and rate limits from §3.7) is drafted and approved before any Multiplayer code is written. This follows the workflow used for Phases 2–4.
