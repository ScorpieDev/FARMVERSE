# PHASE 5 — STEP 5.1: PROTOCOL v2 VÀ XÁC THỰC WEBSOCKET

## Version

1.0 — 2026-10-12.

## Trạng thái

**XONG.** Làm theo P5-1…P5-4 đã duyệt (`PHASE5_MULTIPLAYER_PLAN_REPORT.md`) và mục S-1 của audit Phase 0 (xác thực WebSocket trước multiplayer). Phòng farm (join/move/emote) chưa hoạt động; server trả lỗi cho tới Step 5.3.

## 1. Thay đổi

**Shared**
- `shared/src/presence.ts` (mới):
  - **Mã farm**: 6 ký tự, không có ký tự dễ nhầm (I, O, 0, 1). `parseFarmCode` chuẩn hóa chữ người chơi gõ vào.
  - **Tên hiển thị**: `Farmer NNNN`.
  - **Emote**: 4 loại (wave, heart, laugh, thumbs_up).
  - **Ô đi được**: ô nằm trong lưới và không bị trang trí che; ô đất trồng vẫn đi được.
  - **`entryTile`**: ô trống ở hàng dưới cùng gần giữa nhất, luôn tồn tại vì ô đất trồng không bao giờ bị che.
  - Hằng số tạm thời: move ≥ 125 ms/lần, emote ≥ 1 s/lần, emote hiển thị 3 s, tối đa 20 người/phòng, danh sách online 20.
- `shared/src/protocol.ts` → **protocol 2**:
  - `hello` phải có `token`; `welcome` có `you { farmCode, name }`;
  - client gửi `join`, `leave`, `move`, `emote`;
  - server gửi `room` (snapshot), `player_joined`, `player_left`, `player_moved`, `player_emote`, `player_updated`;
  - người chơi trong phòng được định danh bằng **mã farm**, không bao giờ bằng player ID hay token.
- `shared/src/api.ts`: export `isSessionToken`.
- Mã lỗi mới: `ROOM_NOT_FOUND`, `ROOM_FULL`, `NOT_IN_ROOM`, `TILE_BLOCKED`, `RATE_LIMITED`.

**Server**
- **Schema v5**: bảng `player_profile` (`display_name`, `farm_code` UNIQUE, có CHECK).
  - Migration chỉ thêm bảng; người chơi cũ được sinh mã và tên ngay trong transaction migrate; chạy lại không nhân đôi.
  - Người chơi mới nhận profile khi tạo session.
  - Mã sinh bằng `crypto.randomInt`; nếu trùng thì thử lại.
- `server/src/players/profile.ts` (mới) và `farmStore`: `loadProfile`, `findPlayerIdByFarmCode`.
- **WebSocket**:
  - `hello` có token → tra người chơi.
  - Token sai: `UNAUTHORIZED`, đóng kết nối với mã **4001**.
  - Token đúng: kết nối gắn với người chơi đó; log ghi player ID, không bao giờ ghi token.
  - Origin vẫn được kiểm tra như cũ.
  - `join` / `leave` / `move` / `emote` trả `INVALID_MESSAGE` "Farm rooms are not available yet" (tạm thời, tới Step 5.3).

**Client**
- `ServerConnection` gửi token trong `hello`:
  - chưa có token thì không mở socket, coi là một lần thử thất bại rồi thử lại;
  - đóng 4001 cũng coi là một lần thử thất bại;
  - thêm `restart()`.
- `FarmScene`:
  - chỉ mở kết nối realtime sau khi có session;
  - kết nối lại sau "Start a new farm";
  - nếu server không truy cập được lúc khởi động, chạm nền để thử lại.

## 2. Test đã chạy

- `npm run typecheck`: sạch.
- shared: 469 passing, gồm `presence.test.ts` (mới) và test protocol v2.
- server: 587 passing:
  - `connection.test.ts` viết lại;
  - `websocket.test.ts` dùng token thật: welcome có mã và tên, 2 người chơi khác mã, token sai → 4001, hello v1 bị từ chối;
  - migration v4 → v5 (giữ nguyên dữ liệu, chạy lại an toàn, rollback);
  - `profile.test.ts` (mới).
- client: 240 passing (`ServerConnection`: gửi token, chưa có token, 4001, `restart`). Client build: OK.
- **Qua URL Codespaces (dev server và DB dev, Chromium headless, token + relay `/ws`): 9/9.**
  - `hello` mang đúng token và protocol 2;
  - `welcome` có mã farm và tên, không chứa token;
  - tải lại trang → cùng danh tính;
  - token không tồn tại → không có welcome, hiện "Start a new farm";
  - bấm nút → kết nối lại với token mới, nhận danh tính mới;
  - không có lỗi JavaScript; lỗi HTTP duy nhất là 401 cố ý.
  - Một lần chạy trước đạt 8/9 do lỗi escape regex trong script (`\\d`); giá trị thực đúng định dạng. Đã sửa script và chạy lại: 9/9.
- **DB dev:** dev server tự nạp code và nâng DB lên **schema v5**: 46 người chơi, 46 profile. Bài test tạo thêm 4 farm khách.

## 3. Chưa kiểm thử thực tế

Thiết bị Android/iOS, trình duyệt thật đã đăng nhập GitHub, mạng di động: hoãn theo quyết định của Game Director ngày 2026-10-12.

## 4. Bước tiếp theo

Step 5.2 — Server: heartbeat phía server, một kết nối cho mỗi người chơi, giới hạn tổng số kết nối và tần suất message.
