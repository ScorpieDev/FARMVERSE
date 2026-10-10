# PHASE 0 — BƯỚC 5: KẾ HOẠCH WEBSOCKET (`ws`) TẠI `/ws`

## Trạng thái

CHỜ DUYỆT — chưa sửa code, chưa cài package, chưa commit, chưa push.

Stack giữ nguyên: Fastify, ws, TypeScript, Vitest. Không dùng Express, Socket.IO, Colyseus, `@fastify/websocket`.

---

## 1. Hiện trạng

- `main` đi trước `origin/main` 2 commit (`3ea25bc` Bước 3, `b2748ca` Bước 4).
- `server/src/app.ts` có `buildApp(config)`: Fastify + CORS + `/api/health` + error handler. Chưa có WebSocket.
- `server/src/index.ts` gọi `app.close()` khi nhận SIGINT/SIGTERM.
- `shared/src/protocol.ts` đã có contract v1: `PROTOCOL_VERSION = 1`, `WS_PATH = "/ws"`, `decodeClientMessage`, các kiểu `ServerMessage`.
- `shared/src/errors.ts` đã có `INVALID_MESSAGE`, `UNSUPPORTED_PROTOCOL_VERSION`.
- npm hiện tại: `ws` 8.22.0, `@types/ws` 8.18.2.

---

## 2. Thiết kế

### 2.1 Tích hợp với Fastify

- `WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })`.
- Lắng nghe sự kiện `upgrade` trên `app.server` (HTTP server của Fastify). Fastify không tự xử lý `upgrade`, nên không xung đột với route HTTP.
- Trong handler `upgrade`, theo thứ tự:
  1. Parse `request.url`; `pathname !== WS_PATH` → trả `HTTP/1.1 404 Not Found`, hủy socket.
  2. Header `Origin` khác `config.clientOrigin` → trả `HTTP/1.1 403 Forbidden`, hủy socket (chống cross-site WebSocket hijacking).
  3. Hợp lệ → `wss.handleUpgrade(...)` → gắn handler kết nối.
- Đăng ký trong `buildApp` bằng một hàm `registerWebSocket(app, config)`; không tạo plugin hay abstraction riêng.

### 2.2 Xử lý message

Logic tách thành hàm thuần trong `connection.ts`, không phụ thuộc socket, để unit test:

```
handleClientMessage(state, raw, now) → { replies: ServerMessage[], state, close?: { code, reason } }
```

Trạng thái kết nối: `"awaiting-hello"` → `"ready"`.

| Đầu vào | Kết quả |
|---|---|
| `hello` với `protocolVersion === PROTOCOL_VERSION` | `welcome { protocolVersion, serverTime }`, chuyển sang `ready` |
| `hello` với version khác | `error UNSUPPORTED_PROTOCOL_VERSION`, đóng kết nối (close code 4000, xem quyết định 3) |
| `ping` khi `ready` | `pong { sentAt (copy), serverTime }` |
| `ping` trước `hello` | `error INVALID_MESSAGE` (xem quyết định 2) |
| `hello` lần hai khi đã `ready` | `error INVALID_MESSAGE`, giữ kết nối |
| JSON hỏng / sai contract / `type` lạ | `error INVALID_MESSAGE`, giữ kết nối |
| Frame binary | `error INVALID_MESSAGE`, giữ kết nối |
| Message lớn hơn `MAX_MESSAGE_BYTES` | `ws` tự đóng với close code 1009 (Message Too Big) |

`message` trong error chỉ là mô tả ngắn để debug; không đưa nội dung raw của client vào reply.

### 2.3 Giới hạn và tài nguyên

- `MAX_MESSAGE_BYTES = 4096` (hằng số trong `websocket.ts`, không thêm biến môi trường). Message Phase 0 chỉ vài chục byte.
- Không có heartbeat/timeout phía server ở Bước 5 (xem quyết định 4).

### 2.4 Logging

- `info`: mở kết nối (id tăng dần, IP), đóng kết nối (code).
- `warn`: từ chối upgrade (404 path, 403 origin), sai protocol version.
- `debug`: message không hợp lệ.
- Không log nội dung message.

### 2.5 Shutdown

- Hook `preClose` của Fastify: đóng mọi client với close code 1001 (Going Away), sau đó `wss.close()`.
- Lý do: socket đã upgrade vẫn giữ HTTP server mở, nếu không đóng chủ động thì `app.close()` có thể treo.
- `index.ts` không cần sửa: SIGINT/SIGTERM → `app.close()` đã kích hoạt `preClose`.

---

## 3. File cần tạo / sửa

| File | Loại | Nội dung |
|---|---|---|
| `server/src/multiplayer/connection.ts` | Mới | `handleClientMessage`, kiểu trạng thái kết nối |
| `server/src/multiplayer/connection.test.ts` | Mới | Unit test bảng ở mục 2.2, không mở socket |
| `server/src/multiplayer/websocket.ts` | Mới | `registerWebSocket(app, config)`: `WebSocketServer`, xử lý `upgrade` (path, Origin), binary, `preClose`, logging |
| `server/src/multiplayer/websocket.test.ts` | Mới | Integration test: server thật ở port 0, client `ws` thật |
| `server/src/app.ts` | Sửa | Gọi `registerWebSocket(app, config)` |
| `server/package.json` | Sửa | Thêm dependency `ws`, devDependency `@types/ws` |
| `package-lock.json` | Sửa | Cập nhật sau khi cài |

Không sửa `shared/` (contract v1 đã đủ), trừ khi quyết định 2 chọn thêm error code mới.

---

## 4. Dependency (`-w server`)

- dependencies: `ws@^8.22.0`
- devDependencies: `@types/ws@^8.18.2`

---

## 5. Kiểm thử tự động

### `connection.test.ts` (unit)

- hello đúng version → welcome, state `ready`
- hello sai version → error `UNSUPPORTED_PROTOCOL_VERSION` + yêu cầu đóng
- ping sau hello → pong, `sentAt` được giữ nguyên
- ping trước hello → `INVALID_MESSAGE`
- hello lần hai → `INVALID_MESSAGE`
- JSON hỏng, `type` lạ, thiếu field → `INVALID_MESSAGE`, không đóng

### `websocket.test.ts` (integration, `listen({ port: 0, host: "127.0.0.1" })`)

Thành công:

- Kết nối `/ws` với Origin đúng → hello → nhận welcome
- ping → pong với đúng `sentAt`

Lỗi:

- Sai protocol version → nhận error, sau đó socket đóng với code 4000
- JSON hỏng → error `INVALID_MESSAGE`, kết nối vẫn mở (ping sau đó vẫn được pong)
- Frame binary → error `INVALID_MESSAGE`
- Message 5000 byte → socket đóng với code 1009

Sai đường dẫn / Origin:

- Kết nối `/khong-phai-ws` → `unexpected-response` 404
- Origin lạ → 403
- Không có header Origin → theo quyết định 1

Shutdown:

- Client đang mở, gọi `app.close()` → client nhận close code 1001, `app.close()` resolve (không treo, test có timeout)

HTTP không bị ảnh hưởng:

- `/api/health` vẫn trả 200 khi WebSocket đang chạy (kiểm tra qua server thật)

---

## 6. Lệnh kiểm thử

```
npm install
npm run typecheck -w server
npm test -w server
npm run typecheck          # root
npm test                   # root
```

Kiểm tra tay:

```
npm run dev -w server
# client ws dùng một lần qua node -e (không thêm dependency):
#   hello → welcome, ping → pong, path sai → 404, Origin sai → 403
# Ctrl+C → server tắt êm, không treo
```

---

## 7. Tiêu chí hoàn thành

- Mọi test ở mục 5 pass; test cũ (shared 46, server 22) vẫn pass.
- Typecheck root và server không lỗi.
- Server chỉ dùng kiểu và decoder từ `@farmverse/shared`; không định nghĩa lại message.
- `app.close()` không treo khi còn client kết nối.
- Message lớn hơn giới hạn không làm crash hay tốn bộ nhớ server.
- Không có thay đổi ngoài các file ở mục 3.
- Báo cáo lưu ở `docs/PHASE0_STEP5_REPORT.md`; chỉ commit khi được phép.

---

## 8. Quyết định cần Game Director duyệt

1. **Kết nối không có header Origin** (client không phải trình duyệt, ví dụ script, bot). Đề xuất: **từ chối (403)**. Trình duyệt luôn gửi Origin, nên client hợp lệ không bị ảnh hưởng. Lưu ý: trên Codespaces, `CLIENT_ORIGIN` phải là URL Codespaces của port 5173 (Vite proxy chuyển tiếp nguyên Origin của trình duyệt).
2. **Message trước `hello`:** đề xuất trả `INVALID_MESSAGE` và giữ kết nối, không thêm error code mới vào shared. Phương án khác: thêm `HANDSHAKE_REQUIRED` (sửa `shared/src/errors.ts`).
3. **Sai protocol version:** đề xuất gửi error rồi đóng với close code 4000. Các message không hợp lệ khác chỉ trả error, giữ kết nối.
4. **Heartbeat / timeout:** đề xuất **chưa làm** ở Bước 5 (client sẽ ping định kỳ ở Bước 7). Phát hiện kết nối chết phía server để sang Phase 5 (Multiplayer).
5. **Giới hạn message:** đề xuất `4096` byte, hằng số trong code, không cấu hình qua env.
