# Phase 5 — Multiplayer: acceptance conditions

Date: 2026-10-12 · Phase 5 status: **all steps done, closeout awaiting Game Director approval** (`PHASE5_CLOSEOUT_REPORT.md`).

**Game Director, 2026-10-12:** development continues. Real-device and signed-in-browser checks are deferred until the Game Director starts that stage, and they stay **not tested** until then. This list separates what was tested from what was not.

## 1. Tested, and where

| Check | Environment | Result | Evidence |
|---|---|---|---|
| Automated tests (shared, server, client) | Codespaces, Node 24 | 1388 passing, typecheck clean, client build OK | `PHASE5_STEP5_5_E2E_REPORT.md` §4 |
| Authenticated WebSocket (token in `hello`, 4001, new farm → reconnect) | Codespaces URL, headless Chromium, token + `/ws` relay | 9/9 | `PHASE5_STEP5_1_REPORT.md` |
| Heartbeat survival over 40 s; two tabs of one player (4002, no ping-pong) | Local, headless Chromium, isolated server | 8/8 | `PHASE5_STEP5_2_REPORT.md` |
| Rooms, online list and visitor view over the real API | Codespaces URL, 2 Node `ws` clients | 10/10 | `PHASE5_STEP5_3_REPORT.md` |
| Two-player UI | Local, headless Chromium, 2 browser contexts | 18/18 (3 runs) | `PHASE5_STEP5_4_REPORT.md` |
| Two-player UI | Codespaces URL, dev server and database | 19/19 | `PHASE5_STEP5_5_E2E_REPORT.md` |

## 2. Conditions not yet met

| # | Condition | How to check | Actual result | Status |
|---|---|---|---|---|
| C1 | Android / iOS devices: tap-to-move, emotes, the Visit screen, the `prompt` for farm codes (virtual keyboard) | Two phones on the Codespaces 5173 URL; run the Step 5.5 checklist by hand | Not tested | **Open — deferred by the Game Director** |
| C2 | Real GitHub-signed-in browsers (cookie session, real Origin `https://localhost:5173`) | Two signed-in desktop browsers on the Codespaces URL; the status line must show `Connected`, then the Step 5.5 checklist | Not tested by Claude. One unidentified authenticated connection (`6B7F6W`) was seen on the dev server; it is **not** counted as evidence | **Open — deferred** |
| C3 | Mobile network (latency, loss, reconnect while in a room) | Device on cellular data, or throttled browser profiles | Only reconnect logic was unit-tested; re-join after reconnect was not exercised under real network loss | **Open — deferred** |
| C4 | Load: many players and rooms at once | Load test with N simulated clients (join, move at the rate limit, emote), measuring CPU, memory and latency | Not done. Limits (500 connections, 20 per room, rate limits) are only unit/integration tested | **Open — before a public deployment** |
| C5 | Per-IP and session-creation limits | Design and test; in Codespaces every client comes through one proxy IP | Not implemented | **Open — Phase 8 (anti-abuse) or before a public deployment** |

None of C1–C5 blocks Phase 6, following the Game Director's 2026-10-12 decision. They must not be reported as done until evidence exists.
