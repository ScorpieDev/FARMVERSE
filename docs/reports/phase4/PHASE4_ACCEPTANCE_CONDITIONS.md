# Phase 4 — Character: acceptance conditions

Date: 2026-10-12 · Phase 4 status: **conditionally approved** by the Game Director (2026-10-12).

This list separates what was tested in Codespaces from what was not tested on devices or in a real production environment.

**Game Director, 2026-10-12:** development continues. C1 and C2 are **deferred**: they stay "not tested" until the Game Director starts device testing. They do not block Phase 5.

## 1. What was tested, and where

| Check | Environment | Result | Evidence |
|---|---|---|---|
| Unit and integration tests (shared, server, client) | Codespaces, Node 24 | Passing: 1212 on `37c3994`; client 237 on `e0c3293` | `PHASE4_STATUS_REVIEW_REPORT.md` §5, this file §3 |
| Dev build through the Codespaces URL (port 5173): dev server + dev database, new guest farm, real play to level 2, create look / wear / buy / wear / reload / landscape | Codespaces, headless Chromium with token + `/ws` relay | **24/24** | `PHASE4_STEP4_4_E2E_REPORT.md` |
| Local dev build, isolated server and database | Codespaces (localhost) | 13/13 | `PHASE4_STEP4_3_REPORT.md` |
| **Production build** (`vite build` + `vite preview`) through the Codespaces URL (port 4173). Server runs with `NODE_ENV=production` and `CLIENT_ORIGIN=https://localhost:4173`, temporary database | Codespaces, headless Chromium with token + `/ws` relay | **12/12** (2026-10-12) | §2 below |

## 2. Conditions

| # | Condition | How to check | Actual result | Status |
|---|---|---|---|---|
| C1 | Android / iOS device | Open the Codespaces 5173 URL on a phone signed in to GitHub. Then: open the Character screen, try on items, Wear, Buy (needs level 2), reload; repeat in landscape | Not tested. Deferred by the Game Director since Phase 0 | **Open** (needs the Game Director or a device) |
| C2 | Real GitHub-signed-in browser on the Codespaces URL | Same checklist in a desktop browser signed in to GitHub (cookie session, not a token). The status line must show `Connected` | Not tested by Claude: every automated run used `X-Github-Token` and a `/ws` relay that sets the Origin. Phase 0 and Phase 1 had human-browser `Connected` checks; Phase 4 did not | **Open** (needs the Game Director) |
| C3 | Production build in a browser | `npm run build`, then `npm run preview -w client` with `CLIENT_ORIGIN` set to the preview origin, then open the 4173 URL | **Through Codespaces: 12/12.** Checks: production build loads; debug hooks absent; WebSocket welcomed; starter character; Wear Long Black + Brown saved; reload keeps the look; Buy Green Shorts −40 coins; Wear; reload keeps coins, 7 items and the look; no JavaScript errors; no `/api` HTTP errors. This first required the `vite preview` host fix `e0c3293` (before it, 403 `Blocked request`) | **Met for the production build.** A real deployment does not exist yet (roadmap: Deployment not started) |
| C4 | Committed code equals the tested code | — | Resolved by `37c3994` | **Met** |
| — | Values (prices, unlock levels, item set) | Playtesting | Provisional by design | Not a blocker |

### Notes on C3

**Test harness artifact, not a game bug.** Two earlier runs gave 10/12. In both, a tap was lost when it came directly after a CDP screenshot: the canvas received the tap at half the coordinates (for example (144, 313) instead of (288, 625)), because headless Chromium briefly changes the device scale while capturing. Evidence:
- the same taps worked 3/3 on the local preview, where no screenshot was taken between taps;
- the final run passed 12/12 once a layout-metrics call was placed between the screenshot and the next tap;
- the page scale and viewport were measured at 1 and 390×844 before and after the taps.

**Origin of the preview server.**
- The token-based run sends `Origin: https://localhost:4173` through the relay.
- A signed-in browser is expected to arrive as `https://localhost:4173`, by analogy with port 5173. This has not been measured for port 4173 (part of C2).

## 3. Code change made for this list

**`e0c3293` fix(client): allow only this Codespace's host in vite preview.**

- **Cause:** `vite preview` runs in production mode. The Codespaces host was derived only in development mode, so `preview.allowedHosts` (which defaults to `server.allowedHosts`) was empty and every forwarded host got 403.
- **Fix:**
  - In Codespaces, preview allows exactly `<codespace>-4173.<forwarding domain>`, with port 4173 set as strict.
  - There is no wildcard and no `allowedHosts: true`.
  - `vite build` and runs outside Codespaces are unchanged.
  - Server CORS and WebSocket origins are unchanged.
- **Verified:**
  - Own host → 200; another Codespace's host → 403; through the tunnel → 200.
  - The dev server on 5173 still gives own host 200 and other host 403.
  - New tests `client/vite.config.test.ts`: 6 passing.
  - Typecheck clean; client tests 237 passing; client build OK.
  - Server and shared code were not changed, so their tests were not rerun.
