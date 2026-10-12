# PHASE 5 — STEP 5.3: PHÒNG FARM, XEM FARM CHO KHÁCH, DANH SÁCH ONLINE

## Version

1.0 — 2026-10-12.

## Trạng thái

**XONG (phía server).** Làm theo P5-1 R-A (mỗi farm là một phòng, khách chỉ xem), P5-2 F-A (danh sách online + mã farm) và P5-3 M-A (chạm-để-đi, server kiểm tra). Client làm ở Step 5.4.

## 1. Thay đổi

**`server/src/multiplayer/hub.ts` — `PresenceHub`**
- Lưu trong bộ nhớ, một server. Phòng được định danh bằng mã farm của chủ farm và chỉ tồn tại khi có người bên trong. Khách vẫn vào được farm của chủ đang offline.
- **join:**
  - mã không tồn tại → `ROOM_NOT_FOUND`; đủ 20 người → `ROOM_FULL`;
  - vào phòng mới thì rời phòng cũ trước;
  - người mới đứng ở `entryTile` theo bố cục farm hiện tại, nhận snapshot `room`; những người khác nhận `player_joined`.
- **move:**
  - phải đang ở trong phòng (`NOT_IN_ROOM`);
  - mỗi 125 ms tối đa một lần (`RATE_LIMITED`);
  - ô đích phải đi được theo bố cục **hiện tại** đọc từ DB (`TILE_BLOCKED`);
  - mọi người trong phòng, kể cả người di chuyển, nhận `player_moved`.
- **emote:** phải đang ở trong phòng; mỗi giây tối đa một lần; mọi người nhận `player_emote`.
- **leave / mất kết nối:** những người còn lại nhận `player_left`; phòng trống thì bị xóa.
- **Kết nối mới của cùng người chơi** (Step 5.2) thay kết nối cũ trong phòng; kết nối cũ đóng sau không xóa nhầm kết nối mới.
- **Đổi ngoại hình qua HTTP equip** → phòng nhận `player_updated`. Server dùng ngoại hình **đang lưu**, không dùng body phản hồi, vì request phát lại sẽ trả body cũ.

**WebSocket:** `connection.ts` chuyển `join` / `leave` / `move` / `emote` sang hub; hub trả lỗi thì lỗi chỉ gửi cho người gửi.

**HTTP (`server/src/multiplayer/routes.ts`, cần Bearer token)**
- `GET /api/players/online`: tối đa 20 người đang có kết nối realtime, mới nhất trước, không gồm người gọi.
- `GET /api/farms/:farmCode`: farm như khách thấy — `serverTime`, `farmCode`, `name`, `level`, `plots`, `objects`, `appearance`.
  - **Không có** coin, XP, túi đồ, quest, trang trí chưa đặt, player ID.
  - Mã sai hoặc không tồn tại → 404 `ROOM_NOT_FOUND`; không có token → 401.

**Shared (`api.ts`):** thêm `VisitedFarm`, `OnlinePlayersResponse`, các validator, `visitFarmPath`. Phần kiểm tra danh sách ô đất được tách thành `isPlotList` (dùng chung với `isFarmState`).

## 2. Test đã chạy

- `npm run typecheck`: sạch.
- shared: 479 passing (validator view khách và danh sách online).
- server: 620 passing, gồm:
  - `hub.test.ts` (15): snapshot, ô vào theo bố cục, mã sai, rời phòng cũ, `ROOM_FULL`, đi lên ô đất trồng, `TILE_BLOCKED` theo bố cục hiện tại, giới hạn tần suất move/emote, `NOT_IN_ROOM`, vào lại thì đứng ở ô vào, mất kết nối, kết nối thay thế, `player_updated`, danh sách online;
  - `rooms.test.ts` (7, WebSocket và HTTP thật): luồng join → move → emote → leave giữa 2 người chơi; mất kết nối; equip qua HTTP → `player_updated`; lỗi chỉ gửi cho người gửi; danh sách online; view khách không có trường riêng tư; 404 / 401.
- client: 242 passing (không đổi code client).
- **Qua URL Codespaces (dev server và DB dev, 2 client WebSocket Node có token): 10/10.** Kiểm tra: join, snapshot 2 người, `player_joined`, move, emote, danh sách online, view khách không lộ trường riêng tư, 404, `player_left` khi ngắt. Bài test tạo thêm 2 farm khách.

## 3. Chưa kiểm thử, hoặc giới hạn đã biết

- Chưa có giao diện (Step 5.4). Các bài kiểm tra ở bước này chỉ ở mức API và protocol.
- Vị trí và phòng chỉ nằm trong bộ nhớ; restart server thì mọi người phải vào lại phòng (đúng thiết kế M-A).
- Khi chủ farm đặt trang trí lên ô có người đang đứng, người đó vẫn đứng nguyên chỗ cho tới lần di chuyển sau.
- Chưa có load test thật với nhiều phòng và nhiều người.
- Android/iOS, trình duyệt thật đã đăng nhập, mạng di động: hoãn theo quyết định của Game Director.

## 4. Bước tiếp theo

Step 5.4 — Client:
- danh sách online và ô nhập mã farm;
- cảnh farm cho khách (chỉ xem);
- nhân vật trên lưới, chạm-để-đi, emote;
- hiển thị mã farm của mình.
