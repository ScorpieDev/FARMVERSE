# PHASE 5 — STEP 5.4: CLIENT MULTIPLAYER

## Version

1.0 — 2026-10-12.

## Trạng thái

**XONG.** Làm theo P5-1 R-A, P5-2 F-A, P5-3 M-A và P5-4 N-A, dùng API và WebSocket của Step 5.1–5.3. Không đổi server hay shared.

## 1. Thay đổi

**Màn hình farm:** thêm nút **Visit** ở góc phải thanh trên cùng, đối xứng với hình nhân vật.

**Màn hình Visit**
- Hiện mã farm và tên của mình ("Your farm code: X8SAR4 · Farmer 3126").
- 4 nút: **My farm** (vào phòng farm của mình để khách thấy mình), **Enter code**, **Refresh**, **Back**.
- **Enter code** dùng hộp thoại `prompt` của trình duyệt. Mã gõ vào được chuẩn hóa (chữ thường, khoảng trắng); mã sai định dạng được giải thích ngay, không gửi request.
- Danh sách online: tối đa 20 người, dọc 1 cột, ngang 2 cột; chạm vào một người để ghé farm của họ.

**Phòng farm**
- Lưới 8×8 của farm đang ghé: màu ô đất theo trạng thái, các trang trí. Farm của người khác được tải lại bằng HTTP mỗi 10 s.
- Nhân vật của mọi người trong phòng được vẽ bằng hình khối Phase 4. Nhãn "You" hoặc "#NNNN" nằm trong ô 44 px; tên đầy đủ có ở tiêu đề và danh sách.
- **Chạm ô** → gửi `move`. Nhân vật chỉ đổi ô khi server trả `player_moved`; đường đi được tạo animation 120–600 ms. Ô bị trang trí che được giải thích ngay tại client.
- 4 nút emote (Wave / Heart / Laugh / Like). Bong bóng ký tự thường (Hi! / <3 / Haha! / +1) hiện 3 s, không cần font emoji.
- **Leave** quay về màn hình Visit.
- Lỗi phòng có câu giải thích riêng (`ROOM_NOT_FOUND`, `ROOM_FULL`, `TILE_BLOCKED`, `RATE_LIMITED`, `NOT_IN_ROOM`); nếu vào phòng thất bại thì quay lại màn hình Visit.
- Mất kết nối rồi có lại `welcome` → client tự `join` lại phòng đang ở.

**Mã nguồn**
- `client/src/multiplayer/roomView.ts`: logic thuần.
- `client/src/multiplayer/MultiplayerUi.ts`: widget và vẽ, tách khỏi `FarmScene`.
- `client/src/character/paintCharacter.ts`: hàm vẽ nhân vật dùng chung.
- `ServerConnection`: thêm `onMessage` và `sendRoomMessage`.
- `FarmApi`: thêm `visitFarm` và `onlinePlayers`.
- Layout: thêm `visitButton`, `visit`, `room`.

**Lỗi phát hiện và đã sửa**
- **Nhãn bị cắt ở hàng trên cùng.** Tên và bong bóng của nhân vật ở hàng 0 nằm trên ô, bị cắt mất. Đã đưa vào trong ô; bong bóng ở hàng 0 đặt đè lên nhân vật; tên dài rút gọn thành "#NNNN".
- **Dòng thông báo sai vị trí sau khi xoay màn hình** ở các màn hình Edit / Character / Visit / phòng: `layout()` ghi đè vị trí. Lỗi này có từ trước Phase 5; đã gọi `positionStatus` ở cuối `layout()`.
- **Nhân vật nhảy thẳng tới đích, không có animation, khi đi vào hàng 0.** Đã tách việc đặt vị trí ngay (chỉ khi tạo mới hoặc đổi layout) khỏi việc vẽ lại.

## 2. Test đã chạy

- `npm run typecheck`: sạch.
- client: 289 passing, gồm:
  - `roomView.test.ts` (14);
  - layout multiplayer (30 trường hợp × kích thước màn hình: nút Visit không đè header, màn hình Visit ≥ 4 dòng, ô phòng ≥ 44 CSS px, không chồng nhau);
  - `farmApi` (visitFarm, onlinePlayers);
  - `ServerConnection` (onMessage, sendRoomMessage).
- Client build: OK. Không đổi server hay shared nên không chạy lại test của chúng.
- **Chromium headless, 2 người chơi độc lập (2 browser context), server và DB tạm cô lập: 18/18, ổn định qua 3 lần chạy liên tiếp.** Các bước:
  - Visit → My farm;
  - B thấy A trong danh sách online → vào phòng của A;
  - A thấy B đến;
  - B đi tới (0,0): A thấy đúng vị trí do server báo và nhân vật vẽ đúng ô sau animation;
  - nhãn "You" / "#NNNN"; emote Heart hiện trên đầu B ở màn hình A;
  - Leave;
  - Enter code (chữ thường có khoảng trắng) vào lại được; mã không tồn tại → ở lại màn hình Visit với lời giải thích; mã sai định dạng → giải thích, không gửi request;
  - đóng trang B → A thấy B rời đi;
  - xoay ngang;
  - Leave → Back về farm;
  - không có lỗi JavaScript.
- Hai lần chạy giữa chừng đạt 17/18 do script kiểm tra trước khi client kịp cập nhật (đợi cố định 800 ms). Đã đổi sang chờ theo trạng thái; 3 lần chạy sau đều 18/18.

## 3. Chưa kiểm thử thực tế

- UI multiplayer qua URL Codespaces: sẽ kiểm tra ở Step 5.5 (E2E nhiều client). Ở Step 5.3, API và WebSocket đã được kiểm tra qua Codespaces 10/10.
- Hộp thoại `prompt` trên điện thoại thật; bàn phím ảo che màn hình.
- Android/iOS, trình duyệt thật đã đăng nhập, mạng di động: hoãn theo quyết định của Game Director.

## 4. Bước tiếp theo

Step 5.5 — E2E nhiều client (local và qua URL Codespaces) và báo cáo đóng Phase 5.
