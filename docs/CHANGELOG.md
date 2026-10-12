# FARMVERSE CHANGELOG

## Phase 5 — Multiplayer (in progress)

Design approved by the Game Director on 2026-10-12 (P5-1 every farm is a room, P5-2 online list + farm code, P5-3 tap-to-move, P5-4 generated names; `docs/reports/phase5/PHASE5_MULTIPLAYER_PLAN_REPORT.md`).

### Added

- WebSocket protocol 2 and authentication (Step 5.1): `hello` carries the session token (unknown token → `UNAUTHORIZED`, close 4001); `welcome` returns the player's public farm code and name; room messages defined (`join`, `leave`, `move`, `emote` → `room`, `player_joined`, `player_left`, `player_moved`, `player_emote`, `player_updated`) but not handled yet; shared presence rules (farm codes, names, emotes, walkable tiles, entry tile); error codes `ROOM_NOT_FOUND`, `ROOM_FULL`, `NOT_IN_ROOM`, `TILE_BLOCKED`, `RATE_LIMITED`; database schema v5 (`player_profile`, additive, profiles generated for existing players); client sends the token, connects after the session exists and reconnects after "Start a new farm" — `eb51f2a`
- Realtime connection protection (Step 5.2): server heartbeat (ping every 15 s, terminate after 2 missed pongs), `hello` within 10 s (else close 1008), one connection per player (older one closed with 4002; client shows "Opened in another tab · Tap to play here" and does not reconnect by itself), connection cap (HTTP 503), per-connection message rate limit (`RATE_LIMITED`, close 1008 after sustained flooding); limits provisional — `5751d39`
- Farm rooms on the server (Step 5.3): in-memory `PresenceHub` — join by farm code (`ROOM_NOT_FOUND`, `ROOM_FULL`), entry tile, snapshot / `player_joined` / `player_left`, server-checked tap-to-move on walkable tiles of the current layout (`NOT_IN_ROOM`, `TILE_BLOCKED`, `RATE_LIMITED`), emotes, `player_updated` after an equip; `GET /api/farms/:farmCode` (visitor view: plots, objects, level, name, appearance — no coins, XP, inventory or quests) and `GET /api/players/online` — `a08c4c7`
- Client multiplayer (Step 5.4): **Visit** button (header, right) → Visit screen with the own farm code, the online list, Enter code (browser prompt, normalised), Refresh, Back; farm room with the visited farm's grid (view only, reloaded every 10 s), every character in the room ("You" / "#NNNN"), tap-to-move with walk animation after the server confirms, four emotes with plain-character bubbles, Leave; room errors explained; automatic re-join after a reconnect

### Fixed

- The message line returned to its farm-screen position after a screen rotation while in the Edit, Character, Visit or room screens (`layout()` now places it last) — Step 5.4

## Development environment

### Fixed

- Codespaces development origins (Game Director option A, 2026-10-12): the server keeps a list of exact allowed origins (`CLIENT_ORIGIN`, plus this Codespace's forwarded port-5173 origin in Codespaces development only; never in production) for CORS and the WebSocket Origin check; Vite's dev server accepts only this Codespace's exact forwarded host instead of every `*.app.github.dev`; startup fails if Codespaces variables are missing — `37c3994`

## Phase 4 — Character (conditionally approved 2026-10-12)

Design approved by the Game Director on 2026-10-12 (P4-1…P4-4: R-A shape drawing, C-A catalog, K-A coin shop, D-A Character screen; `docs/reports/phase4/PHASE4_CHARACTER_PLAN_REPORT.md`).

### Added

- Shared character data (Step 4.1, provisional): hair / shirt / pants slots with 4 cosmetics each (2 free starters, 2 bought with coins at level 2–5), 4 skin tones, default appearance, shape checks and `checkAppearance` (ownership); error code `ALREADY_OWNED` — `3648a98`
- Server character (Step 4.2): `character` (appearance, owned cosmetics) in `FarmState`; database schema v4 (`character_appearance`, `cosmetic_inventory`; additive, starter items for existing players); `POST /api/character/equip` (owned items only, `ITEM_NOT_OWNED`) and `POST /api/shop/buy-cosmetic` (`ALREADY_OWNED`, `LEVEL_TOO_LOW`, `INSUFFICIENT_CURRENCY`; server price; buying does not equip) with request IDs and transactions — `cd9bed8`
- Client character (Step 4.3): character drawn with Phaser shapes from the catalog colours; small character in the header opens the **Character** screen (large preview, Hair / Shirt / Pants / Skin tabs, 4 options in a 2×2 block with Owned / price / level, Buy / Wear / Done); items are tried on locally, Buy and Wear go to the server and the screen follows its answer; API client `equipCharacter`, `buyCosmetic` — `a5640bd`

### Verified (Phase 4)

- Local headless Chromium, isolated server and database: 13/13 (`docs/reports/phase4/PHASE4_STEP4_3_REPORT.md`).
- Through the Codespaces URL against the dev server and database (schema v4), 2026-10-12: new guest farm, starter character, try on and wear a look, reload; real play to level 2 (112 coins); buy Spiky Blond and Green Shorts, wear them, reload keeps coins, items and look; landscape — 24/24, no defects (`docs/reports/phase4/PHASE4_STEP4_4_E2E_REPORT.md`). Not verified: Android / iOS device.
- Closeout report: `docs/reports/phase4/PHASE4_CLOSEOUT_REPORT.md`. Conditionally approved by the Game Director (2026-10-12); open conditions and a review of Phases 2–3 and of the uncommitted WebSocket changes: `docs/reports/phase4/PHASE4_STATUS_REVIEW_REPORT.md`.

## Phase 3 — Building (all steps done, closeout awaiting approval)

### Added

- Shared building data (Step 3.1, provisional, draft options G-A / C-A): 8×8 farm grid with the 3×3 plot block fixed at (2, 2); 7 decorations (fence, path, flower bed, bush, bench 1×1; tree, small house 2×2); rotation 0/90/180/270; shape checks, `checkPlacement` (inside grid, off the plots, no overlap except the moved object itself) and `checkLayout`; error code `PLACEMENT_INVALID` — `fbc1c46`
- Server building (Step 3.2): pure rules for place / move / rotate / remove (server-assigned object IDs, decoration stock, ownership); database schema v3 (`building_state`, `decoration_stock`, `farm_objects`; additive, Phase 2 rows unchanged); `decorations` and `objects` in `FarmState`; `POST /api/farm/objects/place`, `/move`, `/rotate`, `/remove` with request IDs and transactions; error code `OBJECT_NOT_FOUND`. Decoration stock is 0 for every player until P3-4 is decided — `86030dd`
- Client Edit farm mode (Step 3.3): **Edit farm** button beside the seed buttons; 8×8 grid editor showing crop plots by state and placed decorations (name and facing), decoration buttons with unplaced counts, select / place / move / Rotate / Remove / Done; every change is a server request (request IDs, retries), the grid is redrawn from the server's answer, placement errors shown in words; tiles ≥ 44 CSS px on the minimum frames — `fa7d119`
- Decoration coin shop (Step 3.4; P3-4 coin shop and P3-5 prices / levels decided by the Game Director 2026-10-11): catalog prices and unlock levels (Fence 5, Path 5, Flower Bed 20 L2, Bush 30 L3, Bench 60 L4, Tree 120 L5, Small House 300 L6; provisional); `POST /api/shop/buy` buys one decoration per request ID (level, then coins, checked by the server; coins and stock saved in one transaction); error code `INSUFFICIENT_CURRENCY`; Edit mode shows prices, owned counts, locked levels and coins, with a Buy button. Removing an object returns it to stock without a refund; no resale. First coin sink (P2-6 applied to Phase 2 only) — `6bc909f`

### Verified (Phase 3)

- Through the Codespaces URL against the dev server and database (2026-10-11): new guest farm earns 20 coins, buys 3 decorations, places, rejected placement on the plots, moves, rotates, removes without refund; reload keeps coins, stock and layout; landscape — 24/24, no defects (`docs/reports/phase3/PHASE3_STEP3_5_E2E_REPORT.md`). Not verified: Android / iOS device
- Closeout report: `docs/reports/phase3/PHASE3_CLOSEOUT_REPORT.md` (based on `837bab9`, awaiting approval).

## Phase 2 — Progression (in progress)

Design approved by the Game Director on 2026-10-10 (P2-1…P2-7, `docs/reports/phase2/PHASE2_PROGRESSION_PLAN_REPORT.md`).

### Added

- Shared progression data: XP → level (50 × L per level, max 10), unlock table (plots 7–9 at levels 2 / 4 / 6, Corn level 3, Strawberry level 5), 8-quest tutorial chain; error codes `LEVEL_TOO_LOW`, `QUEST_NOT_COMPLETE` — `f639918`
- Server rules: unlock checks on planting, level-change detection, quest progress and claim — `aaf92e6`
- Corn and Strawberry, plots 7–9, seeds only for unlocked crops (+5 on unlock); storage schema v2 migration (`quest_state`) — `9deea48`
- API: `progression` and `quest` in `FarmState`, quest progress saved in the plant / harvest transactions, `POST /api/quests/claim` with request IDs — `356d3c7`
- Client: level / XP bar, locked plots and crops, quest row with Claim, level-up messages, 3×3 plots, landscape controls column — `7a97540`
- Client: quest row shows the position in the chain and the reward before claiming (`Quest 1/8: … (x/y)` / `Reward: …`); quest text shrinks to fit beside Claim — `5329631`

### Verified

- Local headless Chromium, temporary database: 38 / 38 checks (`docs/reports/phase2/PHASE2_STEP2_6_REPORT.md`).
- Through the Codespaces URL against the dev server and database (2026-10-11): real-time play from a new farm to level 2 — planting, harvest, 4 quest claims, level-up and plot 7 unlock, reloads, landscape; no defects (`docs/reports/phase2/PHASE2_STEP2_6_REPORT.md` §6).
- Closeout report: `docs/reports/phase2/PHASE2_CLOSEOUT_REPORT.md` (awaiting approval).
- Not verified: Android device.

## Phase 1 — Farming (in progress)

### Added

- Shared farming contract: 6 plots, crops wheat/carrot/tomato (30/120/300 s, yield 1), items `<crop>_seed` / `<crop>_produce`, seed refill constants (5 per crop, 60 s cooldown), session/farm API types, structure-only validators (`requestId` is a lowercase UUID v4), farming error codes — `7afe6d9`
- Server farming rules (pure functions, server clock passed in): starter farm, plant, readiness, harvest, seed refill with cooldown, `FarmState` conversion, `FarmData` validation — `e02e344`
- Server storage (Step 1.3): SQLite via the built-in `node:sqlite` (no new dependency) — schema with migrations (`players` incl. coins/XP columns, `plots`, `inventory`, `action_log`), transactions, farm load/save with corruption checks; `DATABASE_PATH` setting; Node.js floor raised to 24.15 — `c5367d5`
- Coin and XP harvest rewards (Game Director directive 2026-10-10, replaces earlier decision Q4): each harvest grants the crop's coins and XP — provisional values wheat 2 coins / 1 XP, carrot 6 / 3, tomato 12 / 6; `FarmState` exposes `coins` and `xp`, the harvest response includes `reward`; totals stored on the player. No levels, shop or spending yet — `e2e8084`
- Guest session and farm HTTP API (Steps 1.4–1.5): `POST /api/session` (UUID player, 32-byte token, SHA-256 hash stored), Bearer authentication, `GET /api/farm`, `POST /api/farm/plant`, `/harvest`, `/refill-seeds`; shared validators → `400 INVALID_REQUEST`; gameplay errors → `409`; each action in one transaction with request-ID idempotency (only successful actions recorded; `REQUEST_ID_REUSED` for a different action/body); 1 KB body limit; action log entries (player, action, request ID, result — never the token) — `811aa94`
- Client farm scene (Steps 1.6–1.7): `FarmScene` replaces the Phase 0 `BootScene` — 6 plots with growth progress, seed selection, harvest with reward text, free-seed refill button, coins/XP and produce lines, portrait 2×3 / landscape 3×2 layout; guest token in `localStorage`, invalid token → `Start a new farm` overlay (never a silent new farm); request IDs from `crypto.randomUUID` only; up to 3 retries with the same request ID on network errors and 502/503/504; actions disabled while not connected; farm reloaded after reconnect and after rejected actions — `fc3ff87`

### Fixed

- Client: empty plots say `No <crop> seeds` instead of `Tap to plant` when the selected seed is used up; landscape seed buttons stay ≥ 44 CSS px on small phones (568×320)
- Client: the farm looked huge at 200% browser zoom and shrank to a small cluster at the top when zoomed out or on large screens. Cause: the scene laid out in CSS pixels with fixed size caps while Chrome zoom changes the CSS viewport (Phaser RESIZE follows it correctly). The farm now lays out in fixed design units (360×640 portrait, 640×360 landscape) and the camera zooms uniformly to fit and centre it; text is rasterised at the camera zoom. Planting, growth, harvest, rewards and the server protocol are unchanged (`client/src/farm/farmLayout.ts`)
- Client: plot labels overflowed their plots in landscape; plots now widen when height is the limit and the label font fits the plot width — `fc3ff87`

### Verified (headless Chromium, local, temporary database)

- Plant, growth, harvest with reward, landscape layout, reload persistence, invalid token → `Start a new farm`, seed refill with cooldown; server log contains no token. See `docs/reports/phase1/PHASE1_STEP1_8_E2E_REPORT.md`.
- Not verified: farm scene through the Codespaces URL, Android device.

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

IN PROGRESS (Steps 1.1–1.5 done; next: Steps 1.6–1.7 client farm scene)

Phase 0 — Foundation: COMPLETED (closed 2026-10-10).

---

# END OF CHANGELOG
