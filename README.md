# FARMVERSE

FARMVERSE is a mobile-first multiplayer social farming game for the web.

The project is in **Phase 0 — Foundation**: a TypeScript monorepo with a game
client, an authoritative game server and a shared contract between them. The
client boots, connects to the server over HTTP and WebSocket, and shows the
connection status. Gameplay starts in Phase 1.

Design and planning documents live in [`docs/`](docs/).

## Tech stack

- **npm workspaces** monorepo, **TypeScript** (strict)
- **Server:** Node.js, [Fastify](https://fastify.dev/) (HTTP API), [`ws`](https://github.com/websockets/ws) (WebSocket)
- **Client:** [Phaser 3](https://phaser.io/) + [Vite](https://vite.dev/)
- **Tests:** [Vitest](https://vitest.dev/)

The server is authoritative: the client only renders, sends requests and
displays what the server returns.

## Repository layout

```
shared/   HTTP and WebSocket contract (types, protocol, error codes, validators)
server/   Fastify server: GET /api/health and WebSocket /ws
client/   Phaser 3 game client built with Vite
docs/     Game design, rules, architecture, roadmap and development rules
```

## Requirements

- Node.js **24 LTS, 24.15 or newer** — `.nvmrc` pins `24`; `engines.node` requires `>=24.15.0` (the server uses the built-in `node:sqlite`)
- npm **10 or newer**

## Install

```sh
npm ci
```

## Run locally

Use two terminals:

```sh
npm run dev:server   # terminal 1 — server on http://localhost:3000
npm run dev:client   # terminal 2 — client on http://localhost:5173
```

Open <http://localhost:5173>. The screen shows `FARMVERSE` and the connection
status, which becomes `Connected · v0.0.0`.

In development the client talks only to its own origin: the Vite dev server
proxies `/api` and `/ws` to the server on `localhost:3000`.

## Run on GitHub Codespaces

```sh
CLIENT_ORIGIN=https://localhost:5173 npm run dev:server   # terminal 1
npm run dev:client                                        # terminal 2
```

Then open port **5173** from the **Ports** tab
(`https://<codespace-name>-5173.app.github.dev`). Only port 5173 needs to be
opened; the proxy reaches the server inside the codespace, so port 3000 can
stay private.

Why `https://localhost:5173`: the server only accepts WebSocket connections
whose `Origin` header equals `CLIENT_ORIGIN`. Codespaces port forwarding
rewrites the browser's `Origin` (`https://<codespace-name>-5173.app.github.dev`)
to `https://localhost:5173` before the request reaches the server. If the
WebSocket is still rejected, the server log shows the origin it received
(`WebSocket upgrade rejected: origin not allowed`); set `CLIENT_ORIGIN` to
exactly that value.

## Configuration

Variables are read from the shell environment, or from an optional `.env`
file in the repository root (copy [`.env.example`](.env.example)). Never commit
`.env`. Values set in the shell take precedence over `.env`.

| Variable | Used by | Default | Description |
|---|---|---|---|
| `HOST` | server | `0.0.0.0` | Address the server listens on |
| `PORT` | server, Vite proxy | `3000` | Server port |
| `CLIENT_ORIGIN` | server | `http://localhost:5173` | The only origin allowed by CORS and the WebSocket `Origin` check. Must match exactly, without a trailing slash |
| `LOG_LEVEL` | server | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |
| `DATABASE_PATH` | server | `data/farmverse.db` | SQLite file, relative to `server/` when started with the npm scripts (`:memory:` = temporary). The `server/data/` folder and `*.db` files are git-ignored |
| `VITE_SERVER_URL` | client | empty | Leave empty in development (same origin through the Vite proxy). Set to the server origin, e.g. `https://api.example.com`, only when the deployed client and server have different origins. `ws://`/`wss://` is derived from it |

The server exits with a clear message if a value is invalid.

## Scripts

Run from the repository root:

| Command | Description |
|---|---|
| `npm run dev:server` | Start the server with auto-reload |
| `npm run dev:client` | Start the Vite dev server for the client |
| `npm run typecheck` | Type-check all workspaces |
| `npm test` | Run all unit and integration tests |
| `npm run build` | Build the client into `client/dist` |
| `npm run preview -w client` | Serve the built client on port 4173 (run `npm run build` first) |

## Farming API (Phase 1)

The server owns all game state; the client only sends intentions. Every farm request needs `Authorization: Bearer <token>` from `POST /api/session`.

| Method & path | Body | Result |
|---|---|---|
| `POST /api/session` | — | `201 { playerId, token }` — new guest player with 6 empty plots and 5 seeds of each crop. The token is shown once; the server stores only its SHA-256 hash |
| `GET /api/farm` | — | `200 FarmState` (plots, inventory, coins, XP, seed refill state, server time) |
| `POST /api/farm/plant` | `{ requestId, plotIndex, cropId }` | `200 FarmState` |
| `POST /api/farm/harvest` | `{ requestId, plotIndex }` | `200 FarmState` + `harvested` + `reward` |
| `POST /api/farm/refill-seeds` | `{ requestId }` | `200 FarmState` |

- `requestId` is a lowercase UUID v4 chosen by the client per action. Repeating a successful request returns the stored result without applying it again; reusing the ID for a different action or body returns `409 REQUEST_ID_REUSED`.
- Errors: `400 INVALID_REQUEST`, `401 UNAUTHORIZED`, `409` gameplay errors (`PLOT_NOT_EMPTY`, `PLOT_EMPTY`, `CROP_NOT_READY`, `ITEM_NOT_OWNED`, `REFILL_NOT_ALLOWED`).
- Crops (growth time, reward per harvest): wheat 30 s / 2 coins / 1 XP, carrot 2 min / 6 / 3, tomato 5 min / 12 / 6 — provisional values.

## Connection status

| Text on screen | Meaning |
|---|---|
| `Connecting…` | Checking `/api/health`, opening the WebSocket and waiting for `welcome` |
| `Connected · v0.0.0 · 42 ms` | Connected; server version and round-trip time (shown after the first ping, about 15 s) |
| `Reconnecting in 4 s (2/5)` | Connection lost; automatic retry 2 of 5 |
| `Offline · Tap to retry` | All 5 automatic retries failed; tap or click anywhere to try again |
| `Please reload the game (version mismatch)` | Client and server use different protocol versions |
| `Server URL is not configured correctly` | `VITE_SERVER_URL` is not a valid origin |

## Troubleshooting

- **Status stays at `Reconnecting…` / `Offline` but `/api/health` works** —
  the WebSocket was rejected. Check the server log for
  `origin not allowed` and set `CLIENT_ORIGIN` to the logged origin.
- **Vite shows `Blocked request. This host (…) is not allowed`** — the host is not
  in `server.allowedHosts` in `client/vite.config.ts` (`*.app.github.dev` is
  allowed).
- **The first load in dev mode is slow** — the dev server serves Phaser
  unminified (about 20 MB). For a faster load, run
  `npm run build && npm run preview -w client`. The preview server uses the
  same `/api` and `/ws` proxy but runs on port **4173**, so the page origin
  changes: open port 4173 and set `CLIENT_ORIGIN` to the origin the server
  logs.

## Project documents

- [Technical architecture](docs/TECHNICAL_ARCHITECTURE.md)
- [Game design](docs/GAME_DESIGN.md) and [game rules](docs/GAME_RULES.md)
- [Development roadmap](docs/DEVELOPMENT_ROADMAP.md)
- [Development rules](docs/CLAUDE_DEVELOPMENT_RULES.md)
- [Current status](docs/CURRENT_STATUS.md) and [changelog](docs/CHANGELOG.md)
- [Phase reports](docs/reports/README.md) (plans, step reports, audits)
