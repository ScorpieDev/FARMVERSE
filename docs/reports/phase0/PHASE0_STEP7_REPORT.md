# PHASE 0 — BƯỚC 7: BÁO CÁO KẾT NỐI CLIENT VỚI SERVER

## Trạng thái

PASS (typecheck, test 150/150, build, `git diff --check`, kết nối thật trên trình duyệt) — chưa stage, chưa commit, chưa push.

> **Cập nhật sau rà soát tài liệu (sau Bước 8):** đã commit `04f1aa8 feat: add client server connection management`, chưa push (xem mục Git).

Game Director đã xác nhận trên trình duyệt qua URL Codespaces HTTPS: trạng thái `Connected` khi server chạy với `CLIENT_ORIGIN=https://localhost:5173` (xem "Kết nối thật qua Codespaces").

Quyết định đã duyệt và áp dụng:

1. `isHealthResponse` trong `shared/src/api.ts`.
2. Health timeout 5 s, welcome timeout 5 s, ping 15 s, pong timeout 10 s, backoff 1→15 s ± 20 %, tối đa 5 lần thử tự động.
3. Không tự retry khi đổi tab / có mạng lại.
4. Kiểm tra Codespaces bằng biến môi trường `CLIENT_ORIGIN` trên dòng lệnh; không tạo `.env`.
5. Sửa `.env.example`.
6. Gọi health trước WebSocket.

Không sửa `server/`, không đổi protocol v1, không thêm package; `package-lock.json` không đổi.

---

## Implemented

- `shared/src/api.ts`: `isHealthResponse(value)` — `status === "ok"`, `version` là string, `serverTime` là số hữu hạn ≥ 0; bỏ qua field thừa.
- `client/src/network/serverUrl.ts`: `resolveServerUrls(VITE_SERVER_URL, location)`:
  - Rỗng → `/api/health` và `ws(s)://<host trang>/ws` (`wss` khi trang `https:`).
  - Có giá trị → origin đó + `/api/health`, `ws`/`wss` theo `http`/`https`.
  - Từ chối: không phải URL, không phải http(s), có path/query/hash, `http:` trên trang `https:`.
- `client/src/network/connectionStatus.ts`: kiểu `ConnectionStatus` (`connecting`, `connected`, `reconnecting`, `offline`, `incompatible`, `misconfigured`, `closed`) và `formatStatus` → `{ text, tone }`.
- `client/src/network/ServerConnection.ts`:
  - Mỗi lần thử: `GET` health (timeout 5 s, `AbortController`) → mở WebSocket → gửi `hello` (`PROTOCOL_VERSION`) → chờ `welcome` (5 s) → `connected`.
  - Heartbeat phía client: `ping` mỗi 15 s, cập nhật RTT khi có `pong`; không có `pong` trong 10 s → coi là mất kết nối.
  - Reconnect: lần thử đầu + tối đa **5 lần thử lại tự động** với độ trễ `min(1 s × 2^(n-1), 15 s)` ± 20 % (≈ 1, 2, 4, 8, 15 s; tổng ≈ 30 s), rồi `offline`. Kết nối thành công → reset bộ đếm. `retry()` chỉ có tác dụng khi `offline`.
  - `error UNSUPPORTED_PROTOCOL_VERSION` hoặc close 4000 → `incompatible`, không thử lại.
  - Message không hợp lệ / binary / `type` lạ / error khác → `console.warn`, bỏ qua, giữ kết nối.
  - `dispose()`: hủy mọi timer, hủy fetch đang chạy, gỡ listener và đóng socket với 1000; sau đó không còn callback hay reconnect.
  - Mỗi lần thử có id riêng; callback của lần thử cũ bị bỏ qua → không bao giờ có hai socket cùng mở.
  - `fetch`, `WebSocket`, `random` được inject để test.
- `client/src/core/BootScene.ts`: tạo `ServerConnection` trong `create()`, hiển thị trạng thái (màu theo tone, tự xuống dòng theo chiều rộng màn hình), chạm bất kỳ đâu → `retry()`; `shutdown`/`destroy` → `dispose()` và gỡ listener (chỉ chạy một lần).
- `client/package.json`: thêm script `"test": "vitest run"`.
- `.env.example`: `VITE_SERVER_URL=` (để trống khi dev, dùng Vite proxy; chỉ đặt khi deploy khác origin); chú thích `CLIENT_ORIGIN` phải khớp chính xác header Origin mà server nhận; trên Codespaces dùng `https://localhost:5173` (cổng chuyển tiếp viết lại Origin).

Text hiển thị:

| Trạng thái | Text |
|---|---|
| connecting | `Connecting…` |
| connected | `Connected · v0.0.0 · 42 ms` (RTT có sau ping đầu tiên, ~15 s) |
| reconnecting | `Reconnecting in 4 s (2/5)` |
| offline | `Offline · Tap to retry` |
| incompatible | `Please reload the game (version mismatch)` |
| misconfigured | `Server URL is not configured correctly` |

---

## Tested

| Lệnh | Exit | Kết quả |
|---|---|---|
| `npm run typecheck` (root) | 0 | shared + server + client không lỗi |
| `npm test` (root) | 0 | shared **60/60** (46 cũ + 14 mới), server **46/46** (không đổi), client **44/44** (mới) — tổng 150 |
| `npm run build -w client` | 0 | `dist/assets/index-*.js` 1,205.05 kB (gzip 321.74 kB); cảnh báo chunk lớn như Bước 6 |
| `git diff --check` | 0 | Không lỗi whitespace; file mới chưa track cũng không có khoảng trắng cuối dòng |
| `npm test -w client` × 20 lần | 0 | 20/20 lần pass |
| `npm test` (root) × 5 lần | 0 | 5/5 lần pass |

Test mới:

- `shared/src/api.test.ts` (14): health hợp lệ, field thừa, 12 trường hợp sai.
- `client/src/network/serverUrl.test.ts` (12): rỗng/khoảng trắng, `wss` trên trang https, origin https có/không `/`, http trên trang http, 6 lỗi cấu hình.
- `client/src/network/connectionStatus.test.ts` (9): text và tone của mọi trạng thái.
- `client/src/network/ServerConnection.test.ts` (23, WebSocket/fetch giả, fake timers):
  - backoff 1/2/4/8/15 s và jitter ± 20 %;
  - handshake đúng thứ tự, gửi đúng `hello`; URL sai → không fetch, không mở socket;
  - không có welcome, health timeout, health không hợp lệ, HTTP lỗi → reconnect;
  - ping 15 s + RTT; thiếu pong → reconnect; message hỏng/lạ/binary và error thường → vẫn connected;
  - server đóng 1001 → reconnect → reset bộ đếm;
  - 5 lần thử lại rồi `offline`, **không còn lần thử nào sau 1 giờ giả lập, không còn timer**;
  - `retry()` từ offline; `retry()` bị bỏ qua khi không offline;
  - không bao giờ có hai socket cùng mở;
  - `UNSUPPORTED_PROTOCOL_VERSION` / close 4000 → `incompatible`, không thử lại;
  - `dispose()` khi đang fetch, đang chờ retry, đang connected → không còn timer, socket đóng 1000, không còn callback.

Trong quá trình làm: 3 test lỗi lần đầu, đều do test (afterEach gọi `dispose()` khi chưa tạo kết nối; test "hai socket" mở lại một socket giả đã đóng). Đã sửa test và làm `FakeSocket` báo lỗi nếu mở socket không ở trạng thái connecting. Không có lỗi trong code chính.

### Chạy thử với server thật (Claude)

`ServerConnection` thật chạy bằng `tsx` trong Node, dùng `ws` làm WebSocket (để đặt được header Origin như trình duyệt), đi qua Vite dev proxy `localhost:5173` tới server thật. Server chạy với `CLIENT_ORIGIN` đặt bằng biến môi trường; không tạo `.env`.

Lưu ý: các kịch bản dưới đây gửi header Origin trực tiếp tới `localhost:5173`, **không đi qua cổng chuyển tiếp Codespaces**, nên giá trị Origin là giả lập. Chúng xác minh logic kết nối/reconnect/offline, không xác minh giá trị `CLIENT_ORIGIN` đúng cho Codespaces (xem "Kết nối thật qua Codespaces").

Kịch bản A — `CLIENT_ORIGIN` khớp Origin giả lập:

```
0.0s  Connecting…
0.1s  Connected · v0.0.0
2.3s  Reconnecting in 1 s (1/5)        ← dừng server
3.2s  Connecting… → Reconnecting in 3 s (2/5)
5.6s  Connecting… → Reconnecting in 5 s (3/5)
10.3s Connecting… → Connected · v0.0.0  ← server đã bật lại
25.3s Connected · v0.0.0 · 1 ms         ← ping/pong đầu tiên
```

Kịch bản B — server dùng `CLIENT_ORIGIN` mặc định (`http://localhost:5173`), Origin giả lập khác giá trị đó:

```
0.0s  Connecting…
0.2s  Reconnecting in 2 s (1/5)
…     (2/5), (3/5), (4/5)
14.8s Reconnecting in 18 s (5/5)
32.0s Offline · Tap to retry
```

Log server ghi `WebSocket upgrade rejected: origin not allowed` kèm đúng origin đã gửi. Kết luận: khi `CLIENT_ORIGIN` không khớp, client dừng sau ≈ 32 s ở `Offline`, không lặp vô tận.

Ghi chú: một lần chạy A trước đó bị dừng script quá sớm (trước khi server bật lại kịp được thử), nên đã chạy lại với thời gian chờ dài hơn; kết quả ở trên là lần chạy lại.

---

## Files Changed

Sửa (4):

- `shared/src/api.ts`
- `client/package.json`
- `client/src/core/BootScene.ts`
- `.env.example`

Mới (7):

- `shared/src/api.test.ts`
- `client/src/network/serverUrl.ts`
- `client/src/network/serverUrl.test.ts`
- `client/src/network/connectionStatus.ts`
- `client/src/network/connectionStatus.test.ts`
- `client/src/network/ServerConnection.ts`
- `client/src/network/ServerConnection.test.ts`

Không đổi: `server/`, `shared/src/protocol.ts`, `shared/src/errors.ts`, `client/vite.config.ts`, các `tsconfig`, root `package.json`, `package-lock.json`.

---

## Kết nối thật qua Codespaces

Đường đi: trình duyệt → `https://<codespace>-5173.app.github.dev` (cổng chuyển tiếp Codespaces, HTTPS/WSS) → Vite dev proxy → server.

Quá trình kiểm tra (Game Director, trình duyệt thật):

1. Lần đầu, server chạy với `CLIENT_ORIGIN=https://$CODESPACE_NAME-5173.$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` (hướng dẫn cũ, **sai**). Kết quả: `/api/health` trả 200 nhưng WebSocket bị 403; log server ghi `origin: "https://localhost:5173"`.
2. Nguyên nhân (đã kiểm tra):
   - Vite 8.3.4 không ghi đè Origin (proxy `/ws` không có `changeOrigin`/`rewriteWsOrigin`; mã nguồn Vite chỉ ghi đè khi bật `rewriteWsOrigin`).
   - Không có `.env`; tiến trình server nhận `CLIENT_ORIGIN` từ shell (giá trị URL Codespaces).
   - Trình duyệt không thể gửi `https://localhost:5173` (Vite chỉ phục vụ `http`), nên giá trị này nhiều khả năng do cổng chuyển tiếp Codespaces viết lại (suy luận từ log server và mã nguồn Vite; chưa đối chiếu tài liệu chính thức của GitHub, chưa xác minh với mọi cấu hình Codespaces).
   - Server so sánh chuỗi chính xác `request.headers.origin !== config.clientOrigin` → 403.
   - `/api/health` không bị ảnh hưởng vì fetch cùng origin không qua kiểm tra Origin.
3. Server chạy lại với lệnh đúng (không sửa code, không tạo `.env`):

   ```
   CLIENT_ORIGIN=https://localhost:5173 npm run dev -w server
   ```

   Kết quả: **trạng thái `Connected` trên trình duyệt** (Game Director xác nhận).

Chưa được báo cáo riêng (không coi là đã xác minh trên trình duyệt): hiển thị RTT, hành vi Reconnecting → Offline → chạm để thử lại, thiết bị Android. Các hành vi này đã được xác minh bằng unit test và chạy thử ở mục trên.

Lệnh chạy dev trên Codespaces (`CLIENT_ORIGIN=https://localhost:5173` là giá trị quan sát được trên Codespaces của dự án; chưa xác minh với mọi cấu hình Codespaces):

```
CLIENT_ORIGIN=https://localhost:5173 npm run dev -w server   # terminal 1
npm run dev -w client                                         # terminal 2
# mở https://<codespace>-5173.app.github.dev/
```

*Ghi chú sau Bước 8:* có lệnh tương đương ở root: `CLIENT_ORIGIN=https://localhost:5173 npm run dev:server` và `npm run dev:client` (xem README, mục "Run on GitHub Codespaces").

---

## Known Issues

1. **Kiểm tra Origin qua Codespaces bị hạn chế:** trên Codespaces của dự án, Origin server nhận được là `https://localhost:5173` (quan sát được, chưa xác minh với mọi cấu hình), nên server không phân biệt được trang nào đang gọi qua Codespaces. Lớp bảo vệ thực tế khi dev là port riêng tư (cần đăng nhập GitHub). Khi deploy (không qua Codespaces), kiểm tra Origin vẫn có hiệu lực. Không bật `rewriteWsOrigin` của Vite.
2. Báo cáo Bước 6 (`docs/PHASE0_STEP6_REPORT.md`) vẫn ghi `CLIENT_ORIGIN` cho Codespaces là URL `*.app.github.dev` — không còn đúng; chưa sửa vì ngoài phạm vi yêu cầu lần này.
3. Client không phân biệt được "server từ chối Origin (403)" với "server tắt": API WebSocket của trình duyệt không cho biết mã HTTP. Cả hai đều hiện `Reconnecting…` → `Offline`. Log server ghi rõ origin bị từ chối.
4. Jitter áp dụng sau mức trần nên độ trễ lần 5 có thể tới 18 s (15 s + 20 %), đúng công thức đã duyệt ("1→15 s ± 20 %").
5. Lần đầu hiển thị `Connected · v0.0.0` chưa có RTT; RTT có sau ping đầu tiên (~15 s).
6. Bundle client tăng 7 kB (1,198 → 1,205 kB); cảnh báo chunk lớn như Bước 6. Dev server vẫn tải Phaser ~20 MB (Known Issue Bước 6).
7. Không tự retry khi quay lại tab / có mạng lại (quyết định 3): sau khi `offline` người chơi phải chạm.

---

## Git

- Chưa stage, chưa commit, chưa push. `main` đi trước `origin/main` 4 commit.
- `git status --short`:

```
 M .env.example
 M client/package.json
 M client/src/core/BootScene.ts
 M shared/src/api.ts
?? client/src/network/
?? docs/PHASE0_PLAN.md
?? docs/PHASE0_STEP4_PLAN_REPORT.md
?? docs/PHASE0_STEP4_REPORT.md
?? docs/PHASE0_STEP5_PLAN_REPORT.md
?? docs/PHASE0_STEP5_REPORT.md
?? docs/PHASE0_STEP6_PLAN_REPORT.md
?? docs/PHASE0_STEP6_REPORT.md
?? docs/PHASE0_STEP7_PLAN_REPORT.md
?? shared/src/api.test.ts
```

(`docs/PHASE0_STEP7_REPORT.md` — file này — cũng chưa track.)

- Commit đề xuất (11 file, không có `docs/`): `feat: connect client to server with health check and WebSocket`

**Cập nhật sau commit:** đã commit `04f1aa8 feat: add client server connection management` (11 file, không có `docs/`). Message thực tế do Game Director chọn, khác message đề xuất ở trên. Chưa push. Trạng thái `git status` ở trên là trước khi commit.
