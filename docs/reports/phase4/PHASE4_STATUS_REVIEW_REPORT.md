# Status review: Phases 2–4 and the uncommitted WebSocket/Codespaces changes

Date: 2026-10-12. Requested by the Game Director before Phase 5.

Scope: no code was changed and no data was reset. The 10 uncommitted files were not committed, reset or stashed.

## 1. Phases 2 and 3: reports checked against commits

Every commit cited in the Phase 2–4 reports was found on `origin/main` (`git merge-base --is-ancestor`).

| Phase | Commits verified | Evidence in the reports | Status |
|---|---|---|---|
| 2 — Progression | `f639918`, `aaf92e6`, `9deea48`, `356d3c7`, `7a97540`, `5329631`, `c06d936` (docs) | Local headless Chromium 38/38; real-time play through the Codespaces URL (`PHASE2_STEP2_6_REPORT.md` §6) | **All steps done. Closeout NOT approved yet:** no approval is recorded in the repository (`PHASE2_CLOSEOUT_REPORT.md`, `PHASE3_BUILDING_PLAN_REPORT.md` P3-1 still open) |
| 3 — Building | `fbc1c46`, `86030dd`, `fa7d119`, `6bc909f`, `837bab9`, `0e393dd` | Edit-mode E2E 30/30, shop 19/19 (local); Codespaces E2E 24/24 (`PHASE3_STEP3_5_E2E_REPORT.md`) | **All steps done. Closeout NOT approved yet** (`PHASE3_CLOSEOUT_REPORT.md`) |

Roadmap note: Phase 3 "Buildings" was delivered as decoration only (Small House, no function; decision C-A).

`DEVELOPMENT_ROADMAP.md` was out of date: it still showed Phase 1 as "IN PROGRESS" and the current phase as Phase 1. It has been corrected (v1.3).

## 2. Phase 4 — Character: conditional approval

Recorded as **CONDITIONALLY APPROVED** by the Game Director (2026-10-12).

**Done:**
- Steps 4.1–4.4: `3648a98`, `cd9bed8`, `a5640bd`, `a6fc0e9`.
- Character with skin tone, hair, shirt and pants.
- 12 cosmetics: 6 free, 6 sold in a coin shop with level unlocks.
- Schema v4, with an additive migration.
- `POST /api/character/equip` and `POST /api/shop/buy-cosmetic`.
- Character screen and header avatar.

**Evidence:**
- Codespaces E2E 24/24 against the dev server and database. A new guest farm reached level 2 by real play, then bought, wore and reloaded.
- Local browser smoke test 13/13.
- Automated tests (section 4).

**Not verified (the conditions):**
1. Android / iOS device (deferred).
2. A real, GitHub-logged-in browser on the Codespaces URL. The E2E used `X-Github-Token` and a local `/ws` relay that sends Origin `https://localhost:5173`.
3. The production build served to a browser (`vite preview` or a deployment). Only `vite build` was run.
4. The committed code on its own (without the 10 uncommitted files) running through Codespaces. The dev server used for every E2E since Phase 1 runs the working tree, which includes them. The committed code alone passes the automated tests (section 4).
5. Values (prices, levels, item set) are provisional.

## 3. The uncommitted WebSocket/Codespaces changes

`git diff --stat`: 10 files changed, 151 insertions(+), 32 deletions(-). One more file is untracked: `docs/reports/phase1/PHASE1_CODESPACES_WS_ORIGIN_FIX_REPORT.md` (the earlier analysis).

| # | File | Kind | Change |
|---|---|---|---|
| 1 | `server/src/config.ts` | Behaviour | `clientOrigin: string` becomes `clientOrigins: string[]`. In Codespaces (CODESPACES=true, NODE_ENV not production) it adds exactly `https://<CODESPACE_NAME>-5173.<forwarding domain>`, built from validated name and domain patterns. Startup fails if CODESPACES=true but those variables are missing or invalid |
| 2 | `server/src/app.ts` | Behaviour | CORS uses the `clientOrigins` list (exact matches) |
| 3 | `server/src/multiplayer/websocket.ts` | Behaviour | WebSocket Origin check: `!origin \|\| !clientOrigins.includes(origin)`. A missing Origin is still rejected |
| 4 | `client/vite.config.ts` | Behaviour (dev server) | `allowedHosts` narrows from every `*.app.github.dev` to this workspace's exact 5173 host (empty list outside Codespaces). The dev server fails to start if Codespaces variables are missing. `vite build` is unaffected (production mode) |
| 5 | `.env.example` | Docs | Explains the Codespaces Origin rewrite and the extra derived origin |
| 6 | `README.md` | Docs | Same, plus troubleshooting text |
| 7 | `server/src/config.test.ts` | Tests | +4 tests: Codespaces origin added; not added outside Codespaces; not added in production; incomplete variables rejected |
| 8 | `server/src/app.test.ts` | Tests | +1 test: CORS allows the forwarded origin |
| 9 | `server/src/multiplayer/websocket.test.ts` | Tests | +1 test: WebSocket accepts the forwarded origin |
| 10 | `server/src/farming/routes.test.ts` | Tests | Rename `clientOrigin` → `clientOrigins` only |

### Risk assessment

- **Security (CORS / Origin):**
  - The server allows one more exact origin: this workspace's private forwarded URL, which needs GitHub authentication. No wildcard is added, and other sites keep their own Origin and are rejected.
  - The Vite host allow-list gets stricter: other Codespaces' hostnames are no longer accepted, which reduces host-header and DNS-rebinding exposure.
  - Overall risk: **low**, a slight hardening of the dev server.
- **Need:**
  - Captured traffic (2026-10-10) shows a real browser's Origin arriving as `https://localhost:5173`. `.env` already has `CLIENT_ORIGIN=https://localhost:5173`.
  - So the derived origin is a **fallback** for the case where the tunnel does not rewrite the Origin, and that case has not been observed.
  - Without these changes, the committed code depends only on `CLIENT_ORIGIN`.
- **WebSocket:**
  - The check logic is unchanged apart from the list.
  - Rejected upgrades are still logged with the received origin.
- **Production:**
  - With NODE_ENV=production no Codespaces origin is added, so the behaviour equals today's single `CLIENT_ORIGIN`.
  - The new fail-fast rule only applies when CODESPACES=true in a non-production environment.
  - Risk: **low**. The one way to trip it is a development server started with CODESPACES=true but without the Codespaces variables; it then refuses to start, with a clear message.
- **Compatibility:**
  - `ServerConfig.clientOrigin` is renamed. Code written against the committed `clientOrigin` (none outside these files today) would need the rename.
  - Phase 5 work on the WebSocket will touch the same files, so deciding first avoids conflicts.

### Options for the Game Director

- **A. Commit as is**, as a separate commit (`fix(dev): allow this Codespace's forwarded origin and restrict Vite hosts`), including the untracked report.
  - The full test suite passes with these files (section 4).
  - Recommended if Codespaces stays the main development environment.
- **B. Commit only the Vite `allowedHosts` hardening and the docs**, and drop the derived server origin, since the real browser Origin is already covered by `CLIENT_ORIGIN`.
- **C. Discard all of it.** The committed code passes its own tests (section 4), but its Codespaces behaviour without these files has not been checked end to end (condition 4).

## 4. Checks run for this review (2026-10-12)

| Check | Code | Result |
|---|---|---|
| `npm run typecheck` (3 workspaces) | Working tree (with the 10 files) | Clean |
| `npm test` (all workspaces) | Working tree | shared 413, server 568, client 231 — **1212 passing** |
| `vite build` (client) | Working tree | OK (Phaser chunk-size warning only) |
| Typecheck and tests in a temporary `git worktree` of `origin/main` (`e732b14`), so the main working tree was untouched; removed afterwards | Committed code only | Typecheck clean; shared 413, server **562** (the 6 new WebSocket/config tests are absent), client 231 — all passing |

No database was reset or deleted:
- the tests use in-memory or temporary databases;
- the dev database `server/data/farmverse.db` (schema v4) was only read.
