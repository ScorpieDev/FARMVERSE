# PHASE 0 — BƯỚC 7: KẾ HOẠCH KẾT NỐI CLIENT VỚI SERVER

## Trạng thái

CHỜ DUYỆT — chưa sửa code, chưa cài package, chưa stage, chưa commit, chưa push.

Stack giữ nguyên: npm workspaces, TypeScript ~5.9.3, Fastify, ws, Phaser 3, Vite, Vitest. **Không thêm thư viện nào** (dùng `fetch`, `WebSocket`, `setTimeout` có sẵn của trình duyệt). **Không đổi protocol v1** (`hello`/`ping` → `welcome`/`pong`/`error`). **Không sửa server.**

---

## 1. Tài liệu và code đã đọc

- `TECHNICAL_ARCHITECTURE.md`: client gửi request, nhận state, không phải authority (§4); WebSocket cho realtime, HTTPS cho API (§2); client chuyển lỗi thành thông báo dễ hiểu (§18); low bandwidth (§21).
- `GAME_DESIGN.md` §18: mobile-first — touch, UI lớn, ít nút, network hợp lý.
- `GAME_RULES.md`: Phase 0 không có state gameplay; kết nối chỉ là chẩn đoán, không mang dữ liệu economy.
- `CLAUDE_DEVELOPMENT_RULES.md`: bước nhỏ, test trước commit, không abstraction sớm, server authority.
- `PHASE0_PLAN.md` Bước 7; `PHASE0_STEP6_PLAN_REPORT.md` mục 11 (cách xử lý `VITE_SERVER_URL`); `PHASE0_STEP6_REPORT.md` (proxy giữ Origin, Codespaces cần `CLIENT_ORIGIN` khớp).

Code hiện tại:

- `shared/src/api.ts`: `HEALTH_PATH`, `HealthResponse` — **chưa có hàm validate** response health.
- `shared/src/protocol.ts`: `PROTOCOL_VERSION = 1`, `WS_PATH`, `decodeServerMessage`, kiểu `ClientMessage`/`ServerMessage`.
- `server` (Bước 4–5): `/api/health`; `/ws` kiểm tra Origin = `CLIENT_ORIGIN` (thiếu Origin → 403); `hello` sai version → error rồi close 4000; ping trước hello → `INVALID_MESSAGE`; shutdown → close 1001; message > 4096 byte → 1009. Server không gửi ping (không heartbeat phía server).
- `client`: `BootScene` hiển thị "Network: not connected yet"; `vite-env.d.ts` có `VITE_SERVER_URL?`; Vite proxy `/api`, `/ws`. Chưa có script `test`.
- `.env.example`: `VITE_SERVER_URL=http://localhost:3000` (sẽ bỏ qua proxy — cần đổi).

---

## 2. Thiết kế đề xuất

### 2.1 Phân lớp

```
BootScene (Phaser, hiển thị + chạm để thử lại)
   │ subscribe(status) / retry() / dispose()
   ▼
ServerConnection (logic kết nối, không phụ thuộc Phaser/DOM)
   │ fetch, WebSocket, timer, now, random  ← inject để test
   ▼
@farmverse/shared (HEALTH_PATH, WS_PATH, PROTOCOL_VERSION, decodeServerMessage, isHealthResponse)
```

- Logic thuần tách khỏi Phaser để unit test bằng Vitest trong môi trường `node`, không cần jsdom hay trình duyệt.
- Không tạo event bus, state manager hay abstraction chung; một class + vài hàm thuần.

### 2.2 URL server (`serverUrl.ts`)

Hàm thuần `resolveServerUrls(configured, page)` với `page = { protocol, host }` (từ `window.location`):

| `VITE_SERVER_URL` | `healthUrl` | `wsUrl` |
|---|---|---|
| Rỗng / không đặt | `/api/health` (cùng origin, qua Vite proxy khi dev) | `ws://<host>/ws`, hoặc `wss://` nếu trang `https:` |
| `https://api.example.com` (có/không `/` cuối) | `https://api.example.com/api/health` | `wss://api.example.com/ws` |
| `http://localhost:3000` | `http://localhost:3000/api/health` | `ws://localhost:3000/ws` |

Lỗi cấu hình (trả kết quả lỗi, không throw, scene hiển thị thông báo):

- Không phải URL http(s) hợp lệ.
- Có path/query (ví dụ `https://x.com/abc`) — chỉ chấp nhận origin.
- Trang `https:` nhưng `VITE_SERVER_URL` là `http:` (mixed content — trình duyệt sẽ chặn).

### 2.3 Luồng kết nối (`ServerConnection`)

Trạng thái (union type, mỗi trạng thái mang đủ dữ liệu để hiển thị):

| Trạng thái | Ý nghĩa |
|---|---|
| `connecting` (`attempt`) | Đang gọi health / mở WS / chờ welcome |
| `connected` (`serverVersion`, `rttMs?`) | Đã nhận `welcome` |
| `reconnecting` (`attempt`, `retryInMs`) | Lần trước thất bại, đang chờ backoff |
| `offline` | Hết số lần thử tự động; chờ người chơi chạm để thử lại |
| `incompatible` | Server báo `UNSUPPORTED_PROTOCOL_VERSION` / close 4000 — không tự thử lại |
| `misconfigured` (`reason`) | `VITE_SERVER_URL` sai — không thử kết nối |
| `closed` | Đã `dispose()` |

Mỗi lần thử:

1. `GET healthUrl` (timeout 5 s, `AbortController`), validate bằng `isHealthResponse` → lấy `version`.
2. Mở `WebSocket(wsUrl)`; khi `open` gửi `{ type: "hello", protocolVersion: PROTOCOL_VERSION }`.
3. Chờ `welcome` (timeout 5 s) → `connected`; reset bộ đếm thử lại.
4. Khi `connected`: gửi `ping { sentAt: now }` mỗi **15 s**; nhận `pong` → `rttMs = now - sentAt`. Không nhận `pong` trong **10 s** → coi là mất kết nối (đóng WS, chuyển sang reconnect). Đây là heartbeat **phía client**, chỉ dùng message đã có trong protocol v1; không thêm gì phía server.

Xử lý message từ server:

- Decode bằng `decodeServerMessage`; message không hợp lệ hoặc `type` không mong đợi → `console.warn`, bỏ qua, không crash.
- `error UNSUPPORTED_PROTOCOL_VERSION` hoặc close code 4000 → `incompatible`, dừng hẳn.
- `error` khác → `console.warn`, giữ kết nối (server cũng giữ kết nối).

Client **không** tự quyết định dữ liệu nào: `serverTime`, `version` chỉ để hiển thị/chẩn đoán.

### 2.4 Reconnect có giới hạn

- Kích hoạt khi: health lỗi/timeout, WS lỗi/đóng bất thường, hết thời gian chờ welcome/pong, server shutdown (1001).
- Backoff lũy thừa có jitter: `min(1 s × 2^(attempt-1), 15 s)` ± 20 % → khoảng 1, 2, 4, 8, 15 s.
- **Tối đa 5 lần thử tự động liên tiếp** (tổng chờ ≈ 30 s), sau đó → `offline`. Không có vòng lặp vô tận.
- Từ `offline`, người chơi **chạm màn hình** để `retry()` → bắt đầu lại chu kỳ 5 lần.
- Kết nối thành công → reset bộ đếm.
- Không bao giờ có hai WebSocket cùng lúc: trước khi mở socket mới, socket cũ được gỡ listener và đóng.

### 2.5 Lifecycle

- `BootScene.create()` tạo `ServerConnection`, đăng ký nhận trạng thái, gọi `start()`.
- Scene `shutdown`/`destroy` (kể cả khi `game.destroy()`) → `connection.dispose()`:
  - Hủy mọi timer (backoff, ping, timeout), hủy fetch đang chạy (`AbortController`).
  - Gỡ listener WebSocket, đóng socket với code 1000.
  - Chuyển `closed`; mọi callback sau đó bị bỏ qua (không reconnect sau dispose).
- Vite HMR: `main.ts` không có `import.meta.hot.accept`, nên sửa code → reload trang → socket cũ đóng theo trang. Không cần thêm xử lý.

### 2.6 Hiển thị trong `BootScene`

Text ngắn, chữ lớn, căn giữa (giữ layout `Scale.RESIZE` của Bước 6). Hàm thuần `formatStatus(status)` trả `{ text, tone }`:

| Trạng thái | Text (tiếng Anh, giống các text hiện có) |
|---|---|
| connecting | `Connecting…` |
| connected | `Connected · v0.0.0 · 42 ms` |
| reconnecting | `Reconnecting in 4 s (2/5)` |
| offline | `Offline · Tap to retry` |
| incompatible | `Please reload the game (version mismatch)` |
| misconfigured | `Server URL is not configured correctly` |

`tone` (`ok` / `pending` / `error`) đổi màu text. Chạm toàn màn hình chỉ có tác dụng khi `offline` (vùng chạm lớn, hợp mobile).

### 2.7 `.env.example`

- `VITE_SERVER_URL=` (để trống) + chú thích: để trống khi dev (dùng Vite proxy, cùng origin); đặt origin server (https) khi deploy client và server khác origin.
- Thêm chú thích cho `CLIENT_ORIGIN`: trên Codespaces đặt `https://<codespace>-5173.app.github.dev`; phải khớp chính xác Origin của trang client.

---

## 3. File dự kiến tạo / sửa

| File | Loại | Mục đích |
|---|---|---|
| `shared/src/api.ts` | Sửa | Thêm `isHealthResponse(value)` (xem quyết định 1). Không đổi `HealthResponse` hay protocol |
| `shared/src/api.test.ts` | Mới | Test `isHealthResponse` |
| `client/package.json` | Sửa | Thêm script `"test": "vitest run"` (Vitest đã có ở root) |
| `client/src/network/serverUrl.ts` | Mới | `resolveServerUrls` (mục 2.2) |
| `client/src/network/serverUrl.test.ts` | Mới | Test bảng mục 2.2 và các lỗi cấu hình |
| `client/src/network/ServerConnection.ts` | Mới | Class kết nối, trạng thái, backoff, heartbeat, dispose (mục 2.3–2.5) |
| `client/src/network/ServerConnection.test.ts` | Mới | Test với WebSocket/fetch giả và fake timers |
| `client/src/network/connectionStatus.ts` | Mới | Kiểu `ConnectionStatus`, `formatStatus` (mục 2.6) |
| `client/src/network/connectionStatus.test.ts` | Mới | Test text/tone cho mọi trạng thái |
| `client/src/core/BootScene.ts` | Sửa | Tạo/dispose kết nối, hiển thị trạng thái, chạm để thử lại |
| `.env.example` | Sửa | Mục 2.7 |

Không sửa: `server/`, `shared/src/protocol.ts`, `shared/src/errors.ts`, `client/vite.config.ts`, `tsconfig*`, root `package.json`. **`package-lock.json` dự kiến không đổi** (không thêm dependency; chỉ thêm script).

---

## 4. Test dự kiến (Vitest, môi trường node)

`shared/src/api.test.ts`:

- Health hợp lệ; thiếu field; `status` khác `"ok"`; `version` không phải string; `serverTime` âm/không hữu hạn; không phải object.

`client/src/network/serverUrl.test.ts`:

- Rỗng/undefined trên trang `http:` → `/api/health`, `ws://host/ws`; trên trang `https:` → `wss://host/ws`.
- `https://api.example.com` và `https://api.example.com/` → cùng kết quả, `wss`.
- `http://localhost:3000` trên trang `http:` → `ws://…`.
- Lỗi: chuỗi không phải URL, `ftp:`, có path/query, `http:` trên trang `https:`.

`client/src/network/connectionStatus.test.ts`:

- Mỗi trạng thái → text và tone đúng; `connected` khi chưa có RTT.

`client/src/network/ServerConnection.test.ts` (WebSocket giả ghi lại message gửi đi, fetch giả, `vi.useFakeTimers()`, `random` cố định):

- Thành công: health → open → gửi đúng `hello` (đúng `PROTOCOL_VERSION`) → `welcome` → `connected` với version từ health.
- Ping mỗi 15 s; `pong` → cập nhật `rttMs`.
- Không có `pong` trong 10 s → đóng socket, `reconnecting`.
- Health lỗi / timeout 5 s → `reconnecting` với độ trễ backoff đúng.
- Không có `welcome` trong 5 s → `reconnecting`.
- Server đóng 1001 khi đang `connected` → `reconnecting`, kết nối lại thành công → reset bộ đếm.
- 5 lần thất bại liên tiếp → `offline`; **không** có thêm lần thử nào sau đó dù tua thời gian rất lâu.
- `retry()` từ `offline` → `connecting` lại.
- `error UNSUPPORTED_PROTOCOL_VERSION` / close 4000 → `incompatible`, không thử lại.
- Message JSON hỏng / không hợp lệ từ server → bỏ qua, vẫn `connected`.
- `misconfigured` khi URL sai → không gọi fetch, không mở WebSocket.
- `dispose()` ở mọi trạng thái (đang fetch, đang chờ backoff, đang connected) → hủy timer, đóng socket 1000, không còn callback, không reconnect.
- Không bao giờ tồn tại hai socket mở cùng lúc.

Test hiện có giữ nguyên: shared 46, server 46.

---

## 5. Lệnh kiểm thử

```
npm run typecheck                       # root
npm test                                # root: shared, server, client
npm test -w client
npm run build -w client
git diff --check
```

Kiểm tra tay (local, curl/ws không cần — dùng trình duyệt của Game Director):

```
npm run dev -w server                   # terminal 1
npm run dev -w client                   # terminal 2
```

---

## 6. Kiểm tra qua URL HTTPS Codespaces

Bắt buộc: `CLIENT_ORIGIN` của server **khớp chính xác** Origin trang client: `https://<codespace>-5173.app.github.dev` (không `/` cuối). Mặc định `http://localhost:5173` sẽ khiến WebSocket bị 403 → client hiển thị `Reconnecting…` rồi `Offline`.

Kịch bản (Game Director thực hiện trên trình duyệt desktop và, nếu được, Android):

1. Server chạy với `CLIENT_ORIGIN` Codespaces (cách đặt: xem quyết định 4), client `npm run dev -w client`.
2. Mở `https://<codespace>-5173.app.github.dev/` → thấy `Connected · v0.0.0 · xx ms`, RTT cập nhật mỗi ~15 s.
3. Dừng server → `Reconnecting in …` → sau ~30 s `Offline · Tap to retry`.
4. Bật lại server, chạm màn hình → `Connected`.
5. Bật lại server khi đang `Reconnecting` → tự `Connected`.
6. (Kiểm tra lỗi cấu hình) chạy server với `CLIENT_ORIGIN` mặc định → client không kết nối được, log server ghi `origin not allowed` với đúng Origin Codespaces.

Claude kiểm tra trước phần có thể tự động: toàn bộ unit test, build, và giả lập kết nối qua proxy bằng Origin Codespaces như Bước 6 (không thay thế được kiểm tra trình duyệt thật).

---

## 7. Tiêu chí hoàn thành

- `npm run typecheck`, `npm test` (shared, server, client), `npm run build -w client` exit 0; test cũ không đổi.
- Mọi test ở mục 4 pass; test reconnect chứng minh dừng sau 5 lần.
- Client chỉ dùng hằng số, kiểu và validator từ `@farmverse/shared`; không định nghĩa lại message.
- Không thay đổi protocol, không sửa server, không thêm dependency.
- Game Director xác nhận trên trình duyệt qua URL Codespaces: `Connected` và hành vi reconnect/offline/retry (mục 6).
- Báo cáo ở `docs/PHASE0_STEP7_REPORT.md`; không commit khi chưa được phép; không commit file `docs/`.

---

## 8. Rủi ro

1. **Origin Codespaces:** quên đặt `CLIENT_ORIGIN` → 403, client chỉ thấy "Offline". WebSocket API của trình duyệt không cho biết mã HTTP 403, nên client không phân biệt được 403 với server tắt. Giảm thiểu: chú thích rõ ở `.env.example`; log server đã ghi Origin bị từ chối.
2. **Mobile chạy nền:** trình duyệt Android có thể treo timer/đóng socket khi chuyển app. Heartbeat client phát hiện khi quay lại; nếu đã `offline` cần chạm để thử lại (xem quyết định 3).
3. **Tunnel Codespaces** có thể đóng WebSocket nhàn rỗi; ping 15 s giữ kết nối hoạt động. Chưa biết chính xác thời gian timeout của tunnel.
4. **Dev server tải Phaser ~20 MB** (Known Issue Bước 6): lần tải đầu trên Android có thể chậm; không ảnh hưởng logic kết nối.
5. **Fake timers + Promise** trong test dễ sinh test không ổn định; sẽ dùng `vi.advanceTimersByTimeAsync` và chạy lại test nhiều lần trước khi báo cáo.

---

## 9. Quyết định cần Game Director duyệt

1. **Validator health ở `shared`:** thêm `isHealthResponse` vào `shared/src/api.ts` (cùng chỗ với contract `HealthResponse`, server/client dùng chung) — **không** đổi protocol hay kiểu dữ liệu. Phương án khác: đặt validator trong client (không chạm `shared`).
2. **Thông số kết nối:** health timeout 5 s, welcome timeout 5 s, ping 15 s, pong timeout 10 s, backoff 1→15 s ± 20 %, **tối đa 5 lần** rồi `offline` + chạm để thử lại.
3. **Tự thử lại khi quay lại app / có mạng:** đề xuất **chưa làm** ở Bước 7 (giữ đơn giản; người chơi chạm để thử lại). Có thể thêm sau: nghe `visibilitychange`/`online` để tự `retry()` khi đang `offline`.
4. **Đặt `CLIENT_ORIGIN` để kiểm tra Codespaces:** đề xuất Game Director tự tạo `.env` ở root (đã bị `.gitignore`) với `CLIENT_ORIGIN=https://<codespace>-5173.app.github.dev`; hoặc Claude chạy server với biến môi trường trên dòng lệnh (không tạo file). Claude không tự tạo `.env` nếu chưa được phép.
5. **Sửa `.env.example`** như mục 2.7 trong Bước 7 (đã dự kiến từ Bước 6).
6. **Health trước WebSocket:** mỗi lần thử gọi `/api/health` rồi mới mở WS (kiểm tra cả hai kênh, lấy version để hiển thị). Phương án khác: chỉ dùng WebSocket, gọi health một lần khi khởi động.
