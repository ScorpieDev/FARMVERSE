# FARMVERSE CHANGELOG

## Phase 0 — Foundation (2026-10-10)

Commits on `main`. `5faeaff` and `1bbb65d` are already on `origin/main`; the other 6 commits are not pushed yet.

### Added

- Monorepo with npm workspaces (`shared`, `server`, `client`), strict TypeScript config, `.env.example`, `.nvmrc` — `5faeaff`
- Shared contract: WebSocket protocol v1 (`hello`/`ping` → `welcome`/`pong`/`error`), `GET /api/health` types, error codes — `1bbb65d`
- TypeScript ~5.9.3 and Vitest tooling; protocol validation tests — `3ea25bc`
- Fastify server with `GET /api/health`, config validation, CORS limited to `CLIENT_ORIGIN`, error payloads, graceful shutdown — `b2748ca`
- WebSocket endpoint `/ws` (`ws`): Origin check, `hello`/`ping` handling, 4096-byte message limit, close code 4000 on unsupported protocol version — `4436baa`
- Phaser 3 client with Vite, mobile-first page, `Scale.RESIZE`, dev proxy for `/api` and `/ws`, `allowedHosts` for Codespaces — `6bfc223`
- Client connection management: health check, handshake, 15 s ping with RTT, bounded reconnect (5 retries, then "Offline · Tap to retry"), `isHealthResponse` in shared — `04f1aa8`
- README (English) and root scripts `dev:server`, `dev:client` — `5924c4f`

### Tests

- 150 automated tests (shared 60, server 46, client 44), all passing.

### Verified

- Game Director, browser through the Codespaces URL: `Connected`; RTT 223 ms; Offline after stopping the server; `Connected` again after restarting it with `CLIENT_ORIGIN=https://localhost:5173 npm run dev:server`.

### Not verified / open

- Android (postponed by the Game Director), resize/orientation check after Step 8, `vite preview` and HMR through Codespaces.

---

## Version 1.0

### Project Initialization

- Created FARMVERSE project
- Defined game vision
- Defined core gameplay loop
- Defined game rules
- Defined technical architecture
- Defined Claude development rules
- Defined development roadmap
- Defined current project status
- Created GitHub repository
- Established AI development workflow

---

## Current Phase

Phase 0 — Foundation

Status:

COMPLETED (overall review of Phase 0 and its documentation still pending Game Director approval)

Next: Phase 1 — Farming (NOT STARTED, waits for Game Director approval).

---

# END OF CHANGELOG
