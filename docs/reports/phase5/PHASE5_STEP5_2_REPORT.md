# PHASE 5 — STEP 5.2: BẢO VỆ KẾT NỐI REALTIME

## Version

1.0 — 2026-10-12.

## Trạng thái

**XONG.** Đây là mục 2.6 của kế hoạch Phase 5, đồng thời xử lý S-3 và S-4 trong audit Phase 0. Không đổi kiến trúc: vẫn một server, mọi trạng thái nằm trong bộ nhớ.

## 1. Thay đổi

**Server (`server/src/multiplayer/websocket.ts`, `rateLimit.ts`)**

Giá trị mặc định là tạm thời, gom trong `DEFAULT_WEBSOCKET_LIMITS`; test có thể hạ thấp qua `buildApp(config, { webSocketLimits })`.

| Cơ chế | Mặc định | Khi vi phạm |
|---|---|---|
| Phải gửi `hello` trong thời hạn | 10 s | Đóng **1008** |
| Heartbeat: server ping định kỳ | 15 s | Lỡ 2 pong liên tiếp → `terminate` |
| Một kết nối cho mỗi người chơi | — | Kết nối cũ của cùng người chơi bị đóng **4002** ("Replaced by a newer connection") |
| Tổng số kết nối | 500 | Nâng cấp kết nối bị trả **HTTP 503** |
| Tần suất message (token bucket mỗi kết nối) | 20/s, burst 40 | Message bị bỏ, trả `RATE_LIMITED`; 50 lần → đóng **1008** |

Giới hạn riêng cho `move` và `emote` (125 ms và 1 s) sẽ áp dụng ở Step 5.3.

**Client**
- Trạng thái mới `replaced`: "Opened in another tab · Tap to play here".
- Khi bị đóng 4002, client **không** tự kết nối lại. Nếu tự kết nối lại, hai tab sẽ liên tục giành kết nối của nhau.
- Chạm nền (`retry()`) thì lấy lại kết nối.
- Mọi thao tác khi đang ở trạng thái `replaced` đều được giải thích bằng thông báo.

## 2. Test đã chạy

- `npm run typecheck`: sạch.
- server: 598 passing, gồm:
  - `rateLimit.test.ts` (4);
  - `protection.test.ts` (7): hết hạn `hello` → 1008; kết nối đã xác thực không bị đóng nhầm; client không trả pong bị cắt còn client sống giữ nguyên; cùng người chơi → 4002; hai người chơi khác nhau không thay nhau; quá giới hạn → 503; flood → `RATE_LIMITED` rồi 1008.
- client: 242 passing (trạng thái `replaced`; 4002 không retry, `retry()` kết nối lại). Client build: OK.
- **Chromium headless, server và DB tạm cô lập, cấu hình mặc định: 8/8.**
  - Kết nối sống qua 40 s, tức hơn 2 chu kỳ heartbeat: trình duyệt tự trả pong.
  - Tab B cùng người chơi → tab A bị thay và không tự kết nối lại sau 5 s.
  - Thao tác ở tab A hiện thông báo "open in another tab".
  - Chạm nền ở tab A → A lấy lại kết nối, B bị thay.
  - Không có lỗi JavaScript.
- **Qua URL Codespaces (dev server, DB dev): 9/9**, chạy lại bài của Step 5.1 để chắc không có hồi quy. Bài test tạo thêm 2 farm khách.

## 3. Chưa kiểm thử thực tế, hoặc giới hạn đã biết

- Heartbeat qua URL Codespaces chỉ đi tới relay của bài test (thư viện `ws` tự trả pong), không tới trình duyệt. Việc trình duyệt tự trả pong đã được kiểm chứng ở bài local.
- Chưa có giới hạn theo IP và giới hạn tạo session HTTP. Trong Codespaces mọi kết nối đến từ cùng một proxy, nên giới hạn theo IP sẽ chặn nhầm. Để lại cho Phase 8 (anti-abuse) hoặc trước khi deploy công khai.
- Chưa có load test thật với nhiều người chơi.
- Android/iOS, trình duyệt thật đã đăng nhập, mạng di động: hoãn theo quyết định của Game Director.

## 4. Bước tiếp theo

Step 5.3 — Server:
- phòng farm: presence, `join` / `leave` / `move` / `emote`, `player_updated`;
- API xem farm cho khách theo mã farm;
- danh sách online.
