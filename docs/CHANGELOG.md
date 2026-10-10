# FARMVERSE CHANGELOG

## Phase 1 — Farming (in progress)

### Added

- Shared farming contract: 6 plots, crops wheat/carrot/tomato (30/120/300 s, yield 1), items `<crop>_seed` / `<crop>_produce`, seed refill constants (5 per crop, 60 s cooldown), session/farm API types, structure-only validators (`requestId` is a lowercase UUID v4), farming error codes — `7afe6d9`
- Server farming rules (pure functions, server clock passed in): starter farm, plant, readiness, harvest, seed refill with cooldown, `FarmState` conversion, `FarmData` validation — `e02e344`
- Server storage (Step 1.3): SQLite via the built-in `node:sqlite` (no new dependency) — schema with migrations (`players` incl. coins/XP columns, `plots`, `inventory`, `action_log`), transactions, farm load/save with corruption checks; `DATABASE_PATH` setting; Node.js floor raised to 24.15

## Phase 0 closeout (2026-10-10)

### Fixed

- Client: rotating between portrait and landscape left the canvas in the old orientation (Phaser 3.90 refreshes before reading the new parent size); the client now re-reads the parent size and refreshes on the next frame after an orientation change — `0b156aa`
- Server: HTTP client errors (malformed JSON, unsupported content type, …) return `INVALID_REQUEST` with a fixed message instead of `INVALID_MESSAGE` with framework internals — `d76057e`

### Changed

- Node.js 24 LTS: `.nvmrc` = `24`, `engines.node` = `>=24.0.0` — `e4d1e66`
- Phase reports moved to `docs/reports/phase0/` and `docs/reports/phase1/` (index: `docs/reports/README.md`).

### Verified (headless Chromium, local)

- Resize and portrait ↔ landscape, `vite preview`, Vite HMR, Offline → tap to retry → `Connected`.
- Not verified: `vite preview` / HMR through the Codespaces URL, Android device.

## Phase 0 — Foundation (2026-10-10)

Commits on `main`, pushed to `origin/main` (up to `69d4b18`).

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

Phase 1 — Farming

Status:

IN PROGRESS (Steps 1.1–1.3 done; next: Step 1.4 guest session)

Phase 0 — Foundation: COMPLETED (closed 2026-10-10).

---

# END OF CHANGELOG
