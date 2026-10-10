# PHASE 0 — BƯỚC 4: BÁO CÁO SERVER FASTIFY VÀ GET /api/health

## Trạng thái

PASS — đã commit `b2748ca`. Chưa push.

Quyết định áp dụng: TypeScript ~5.9.3; giữ `@fastify/cors` chỉ cho `CLIENT_ORIGIN`; `version` của health lấy từ `server/package.json`.

---

## Implemented

- Workspace `@farmverse/server`, chạy bằng `tsx` (chưa build production).
  - `dev`: `tsx watch --env-file-if-exists=../.env src/index.ts`
  - `start`: `tsx --env-file-if-exists=../.env src/index.ts`
  - `typecheck`: `tsc -p tsconfig.json` (noEmit), `test`: `vitest run`
- `config.ts`: `loadConfig(env)` đọc `HOST`, `PORT`, `CLIENT_ORIGIN`, `LOG_LEVEL`; mặc định khớp `.env.example`; giá trị rỗng coi như chưa đặt. Validate:
  - `PORT`: số nguyên 0–65535
  - `CLIENT_ORIGIN`: origin http(s) thuần (không path, không dấu `/` cuối)
  - `LOG_LEVEL`: fatal, error, warn, info, debug, trace, silent
  - Mọi lỗi được gom vào một `ConfigError`.
- `app.ts`: `buildApp(config)` (không listen):
  - Logger pino theo `LOG_LEVEL`
  - CORS chỉ cho `CLIENT_ORIGIN`
  - `GET /api/health` → `{ status: "ok", version, serverTime }` (dùng `HEALTH_PATH`, `HealthResponse` từ shared)
  - Route lạ → 404 `{ code: "NOT_FOUND" }`
  - Lỗi 4xx do Fastify (ví dụ body JSON hỏng) → `{ code: "INVALID_MESSAGE" }`
  - Lỗi bất ngờ → 500 `{ code: "INTERNAL_ERROR", message: "Internal server error" }`, chi tiết chỉ ghi vào log
- `index.ts`: config sai → in lỗi, exit 1; listen; SIGINT/SIGTERM → `app.close()` rồi exit 0.
- Không có WebSocket (để Bước 5).

---

## Tested

| Lệnh | Exit | Kết quả |
|---|---|---|
| `npm install` | 0 | Đã cài `fastify`, `@fastify/cors`, `tsx`; link `@farmverse/server` |
| `npm run typecheck -w server` | 0 | Không lỗi |
| `npm test -w server` | 0 | 2 file, 22/22 pass |
| `npm run typecheck` (root) | 0 | Không lỗi |
| `npm test` (root) | 0 | shared 46/46, server 22/22 |

Test tự động:

- `config.test.ts`: mặc định, giá trị rỗng, giá trị hợp lệ, PORT sai (`abc`, `-1`, `3.5`, `65536`, `30 00`), CLIENT_ORIGIN sai (thiếu scheme, có path, có `/` cuối, `ftp:`), LOG_LEVEL lạ, gom nhiều lỗi.
- `app.test.ts` (qua `app.inject()`): health đúng shape và version; 404 NOT_FOUND; 500 INTERNAL_ERROR không lộ chi tiết; 400 INVALID_MESSAGE với JSON hỏng; CORS cho origin đúng, preflight 204, không cấp quyền cho origin lạ.

Kiểm tra tay (server thật, `npm run start -w server`):

- `GET /api/health` → `200 {"status":"ok","version":"0.0.0","serverTime":…}`
- `GET /khong-ton-tai` → `404 {"code":"NOT_FOUND",…}`
- Gửi SIGTERM → log "Shutting down", port đóng.
- `PORT=abc` → in "Invalid server configuration: PORT must be an integer…", exit 1.

---

## Files Changed

Mới:

- `server/package.json`
- `server/tsconfig.json`
- `server/src/config.ts`
- `server/src/config.test.ts`
- `server/src/app.ts`
- `server/src/app.test.ts`
- `server/src/index.ts`

Sửa:

- `package-lock.json`

---

## Known Issues

- npm 11 chặn script postinstall của `esbuild` (phụ thuộc của `tsx`). Không ảnh hưởng: `tsx` vẫn chạy được nhờ package binary theo nền tảng. Có thể duyệt bằng `npm install-scripts approve esbuild` nếu muốn tắt cảnh báo.
- Khi chưa có file `.env`, Node in `../.env not found. Continuing without it.` lúc khởi động. Đây là thông báo, không phải lỗi.
- `docs/PHASE0_PLAN.md` và `docs/PHASE0_STEP4_PLAN_REPORT.md` chưa track, không nằm trong commit.

---

## Commit

`b2748ca` — `feat: add Fastify server with health endpoint`

Chưa push. `main` đi trước `origin/main` 2 commit.
