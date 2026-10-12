# Phase 5 — Multiplayer: closeout report

Date: 2026-10-12 · Status: **all steps done; ready to close, awaiting Game Director approval.** Real-device and signed-in-browser checks are deferred by the Game Director (2026-10-12) and are listed as not tested.

## 1. Roadmap tasks

| Roadmap task (`DEVELOPMENT_ROADMAP.md`) | Delivered | Commits |
|---|---|---|
| Player presence | WebSocket protocol 2 authenticated by the session token. Public identity: farm code + generated name (schema v5). In-memory farm rooms with snapshots and join / leave. Online list | `eb51f2a`, `a08c4c7`, `d2c3151` |
| Multiplayer movement | Server-checked tap-to-move on walkable tiles of the farm's current layout, rate-limited; walk animation after the server confirms | `a08c4c7`, `d2c3151` |
| Farm visiting | Visit screen (online list, farm code entry, own farm). Visitor view `GET /api/farms/:farmCode` without private data (coins, XP, inventory, quests) | `a08c4c7`, `d2c3151` |
| Player interaction | Four realtime emotes. Appearance changes are pushed to the room. Chat and likes stay in Phase 7, as planned | `a08c4c7`, `d2c3151` |
| Realtime synchronization | Room events (`player_joined` / `left` / `moved` / `emote` / `updated`). Automatic re-join after a reconnect. Visited farm reloaded over HTTP every 10 s | `a08c4c7`, `d2c3151` |
| Security prerequisites (Phase 0 audit S-1, S-3, S-4) | Token authentication. Heartbeat. `hello` timeout. One connection per player. Connection cap. Message rate limit | `eb51f2a`, `5751d39` |

Decisions P5-1…P5-4 were applied as approved (`PHASE5_MULTIPLAYER_PLAN_REPORT.md`). Values (limits, intervals) are provisional.

## 2. Verification

| Check | Result | Evidence |
|---|---|---|
| Typecheck, unit and integration tests | 1388 passing (shared 479, server 620, client 289) | `PHASE5_STEP5_5_E2E_REPORT.md` §4 |
| Schema v4 → v5 migration | Additive and idempotent, with rollback on failure (tests). The dev database upgraded: 46 players, all with profiles | `PHASE5_STEP5_1_REPORT.md` |
| Authenticated WebSocket through the Codespaces URL | 9/9 | `PHASE5_STEP5_1_REPORT.md` |
| Heartbeat and one connection per player, local headless Chromium | 8/8 | `PHASE5_STEP5_2_REPORT.md` |
| Rooms and APIs through the Codespaces URL (2 Node clients) | 10/10 | `PHASE5_STEP5_3_REPORT.md` |
| Two-player UI, local headless Chromium (isolated server) | 18/18, stable over 3 runs | `PHASE5_STEP5_4_REPORT.md` |
| **Two-player UI through the Codespaces URL (dev server and database)** | **19/19** | `PHASE5_STEP5_5_E2E_REPORT.md` |
| Android / iOS, signed-in real browser, mobile network | **Not tested** (deferred by the Game Director) | — |

## 3. Carried forward (not blocking)

- **Not tested for real:** devices, signed-in browser, mobile network, load with many players.
- **No per-IP limits and no HTTP session-creation limit yet.** In Codespaces every client comes through one proxy, so per-IP limits would block legitimate players. Planned for Phase 8 (anti-abuse) or before a public deployment.
- **Presence lives in memory on one server.** A restart empties every room, and rooms do not scale across processes (accepted for now; see TECHNICAL_ARCHITECTURE scaling notes).
- **"Enter code" uses the browser's `prompt`.** It has not been checked on phones; an in-game input may be needed.
- **Standing on a newly placed decoration.** A decoration placed on a tile where someone stands does not move that player.
- **Earlier open items are unchanged:** the Phase 2 and Phase 3 closeout approvals, Phase 4 conditions C1 and C2, the untracked Phase 1 origin report, and the UX items.

## 4. Decision requested

1. Close Phase 5.
2. Next: the Phase 6 (Economy) design plan.
