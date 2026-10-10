# PHASE 0 — BƯỚC 5: BÁO CÁO WEBSOCKET (`ws`) TẠI `/ws`

## Trạng thái

PASS — chưa commit, chưa push (chờ Game Director cho phép).

Quyết định đã duyệt và áp dụng:

1. Không có Origin → 403.
2. Message trước `hello` → `INVALID_MESSAGE`, giữ kết nối.
3. Sai protocol version → gửi error, đóng với mã 4000.
4. Chưa có heartbeat/timeout phía server.
5. Giới hạn message 4096 byte.

---

## Implemented

- `connection.ts`: hàm thuần `handleClientMessage(state, raw, now)`. Trạng thái `awaiting-hello` → `ready`. Xử lý `hello`, `ping`, hello lần hai, sai version (close 4000), message không hợp lệ. Error không chứa nội dung raw của client.
- `websocket.ts`: `registerWebSocket(app, config)`:
  - `WebSocketServer({ noServer: true, maxPayload: 4096 })` gắn vào sự kiện `upgrade` của HTTP server Fastify.
  - Path khác `/ws` → 404; Origin khác `CLIENT_ORIGIN` hoặc thiếu → 403.
  - Frame binary → `INVALID_MESSAGE`; quá 4096 byte → `ws` đóng với 1009.
  - Hook `preClose`: đóng mọi client với 1001 trước khi Fastify đóng server.
  - Log kết nối/ngắt/từ chối; không log nội dung message.
- `app.ts`: gọi `registerWebSocket(app, config)`.
- Không sửa `shared/`, `index.ts` hay tài liệu khác.

---

## Tested

| Lệnh | Exit | Kết quả |
|---|---|---|
| `npm install` | 0 | Cài `ws`, `@types/ws` |
| `npm run typecheck -w server` | 0 | Không lỗi (lần đầu lỗi kiểu `RawData` trong `toText`, đã sửa) |
| `npm test -w server` | 0 | 4 file, 46/46 pass (22 cũ + 24 mới); chạy lại thêm 3 lần đều pass |
| `npm run typecheck` (root) | 0 | Không lỗi |
| `npm test` (root) | 0 | shared 46/46, server 46/46 |

Test mới:

- `connection.test.ts` (unit, 10 test): welcome, sai version + close 4000, pong giữ `sentAt`, ping trước hello, hello lần hai, JSON hỏng / `type` lạ / thiếu field / message chiều server (ở cả hai trạng thái), không echo input.
- `websocket.test.ts` (integration, server thật port 0, 14 test):
  - Thành công: hello→welcome, ping→pong, `/api/health` vẫn chạy.
  - Lỗi: sai version → error rồi close 4000; ping trước hello giữ kết nối; JSON hỏng rồi vẫn ping được; binary; 4097 byte → close 1009; đúng 4096 byte vẫn được chấp nhận.
  - Upgrade: path sai 404, Origin lạ 403, không Origin 403, `/ws?v=1` được chấp nhận.
  - Shutdown: 2 client nhận close 1001, `app.close()` không treo.

Kiểm tra tay (`npm run start -w server`, client `ws`):

- `/x` → 404, Origin lạ → 403, không Origin → 403.
- hello → `welcome`, ping → `pong` với `sentAt: 5`.
- SIGTERM → client nhận 1001, log "Shutting down", port đóng.

---

## Files Changed

Mới:

- `server/src/multiplayer/connection.ts`
- `server/src/multiplayer/connection.test.ts`
- `server/src/multiplayer/websocket.ts`
- `server/src/multiplayer/websocket.test.ts`

Sửa:

- `server/src/app.ts`
- `server/package.json`
- `package-lock.json`

---

## Known Issues

- Trên Codespaces, `CLIENT_ORIGIN` phải đặt là URL Codespaces của port 5173, nếu không WebSocket sẽ bị 403 (do quyết định 1). Sẽ ghi vào README ở Bước 8.
- npm 11 vẫn chặn script postinstall của `esbuild` (đã ghi ở Bước 4); không ảnh hưởng.
- Server chưa phát hiện kết nối chết (quyết định 4), để sang Phase 5.

---

## Git

- Chưa commit, chưa push. `main` đi trước `origin/main` 2 commit.
- Thay đổi Bước 5 chưa stage: 3 file sửa + thư mục `server/src/multiplayer/`.
- Docs chưa track: `PHASE0_PLAN.md`, `PHASE0_STEP4_PLAN_REPORT.md`, `PHASE0_STEP4_REPORT.md`, `PHASE0_STEP5_PLAN_REPORT.md`, `PHASE0_STEP5_REPORT.md`.
- Message commit đề xuất: `feat: add WebSocket endpoint with hello/ping protocol`
