# PHASE 5 — MULTIPLAYER: KẾ HOẠCH THIẾT KẾ

## Version

1.1 — 2026-10-12. Game Director duyệt P5-1…P5-4 theo đề xuất (R-A, F-A, M-A, N-A) ngày 2026-10-12.

## Trạng thái

Đã duyệt; triển khai theo §4. Giá trị tạm thời.

Game Director ngày 2026-10-12: ưu tiên phát triển. Không chặn tiến độ vì chưa kiểm thử trên Android/iOS hay trên trình duyệt thật. Claude tự kiểm thử bằng test tự động, API, database và Chromium headless, đồng thời ghi rõ những gì chưa kiểm thử thực tế.

- **Roadmap** (`DEVELOPMENT_ROADMAP.md`): Player presence, Multiplayer movement, Farm visiting, Player interaction, Realtime synchronization.
- **Thiết kế:**
  - `GAME_DESIGN.md` §10, §17: visitor được xem farm và nhân vật, không được sửa.
  - `GAME_RULES.md` §14–15: server là authority; mọi quyền sửa đều do server xác nhận.
  - `TECHNICAL_ARCHITECTURE.md` §10: chỉ movement, presence và interaction là realtime; dữ liệu bền vững vẫn đi qua HTTP + DB.
- **Ngoài phạm vi Phase 5:**
  - chat, like, bạn bè (Phase 7 — Social);
  - giao dịch (Phase 6);
  - trộm (Phase 8);
  - Farm City (khu xã hội chung, Phase 7).

---

## 1. Hiện trạng

- WebSocket `/ws` protocol v1 chỉ có `hello`/`ping` → `welcome`/`pong`/`error`.
  - Chưa xác thực: không biết ai đang kết nối.
  - Chưa có heartbeat phía server, chưa giới hạn kết nối hay tần suất (audit Phase 0: S-1, S-3, S-4, phải xử lý trước Phase 5).
- Người chơi khách chỉ có UUID và token, **chưa có tên hiển thị**.
- Nhân vật (Phase 4) đã có ngoại hình trên server. Farm có lưới 8×8 (Phase 3).

## 2. Đề xuất

### 2.1 Nơi người chơi gặp nhau (P5-1, đề xuất R-A: mỗi farm là một "phòng")

- Người chơi vào farm của mình hoặc farm người khác.
- Mọi người đang ở cùng một farm thấy nhân vật của nhau trên lưới 8×8.
- Khách chỉ được xem: ô đất, trang trí, nhân vật chủ farm, level. Không thấy coin, túi đồ, quest; không trồng, thu hoạch hay sửa.
- Phương án khác R-B: một quảng trường chung. Phương án này gần với Farm City của Phase 7 hơn.

### 2.2 Tìm farm để ghé (P5-2, đề xuất F-A)

Có hai cách:
- danh sách "Đang online" (tối đa 20 người, mới nhất trước);
- nhập **mã farm** 6 ký tự (mỗi farm một mã cố định, chia sẻ được).

Chưa có bạn bè hay lời mời (Phase 7).

### 2.3 Di chuyển (P5-3, đề xuất M-A: chạm-để-đi trên lưới 8×8)

- Chạm vào ô → client gửi `move { x, y }` → server kiểm tra (ô trong lưới, không bị trang trí chiếm, tần suất) → server gửi vị trí mới cho mọi người trong phòng → client vẽ chuyển động mượt.
- Ô đất trồng đi qua được; ô có trang trí thì không.
- Vị trí chỉ lưu trong bộ nhớ: khi vào phòng, nhân vật xuất hiện ở cổng (cạnh dưới lưới).
- Phương án khác M-B: di chuyển tự do bằng joystick, tọa độ liên tục. Cách này phức tạp hơn và tốn băng thông hơn trên mobile.

### 2.4 Danh tính (P5-4, đề xuất N-A)

- Mỗi người chơi có tên tự sinh dạng `Farmer 4821`, cố định và chưa đổi được. Đổi tên cần kiểm duyệt nên để Phase 7 hoặc phần tài khoản.
- Phương án khác N-B: người chơi tự đặt tên (3–16 ký tự, chữ/số, lọc từ cấm).

### 2.5 Tương tác (theo roadmap, không cần chốt)

- Một bộ **emote** cố định: 👋 Wave, ❤️ Heart, 😄 Laugh, 👍 Like. Emote hiện trên đầu nhân vật vài giây; chỉ realtime, không lưu.
- Chat và like bền vững để Phase 7.

### 2.6 Bảo mật và đồng bộ (bắt buộc theo audit Phase 0, không cần chốt)

- **Protocol v2.** `hello { protocolVersion: 2, token }` gắn kết nối với người chơi. Sai token → `UNAUTHORIZED`, đóng kết nối.
- **Kết nối:**
  - mỗi người chơi 1 kết nối realtime; kết nối mới thay kết nối cũ;
  - giới hạn tổng số kết nối;
  - giới hạn tần suất message (ví dụ move ≤ 8/giây, emote ≤ 1/giây);
  - giới hạn kích thước message (đã có 4 KB).
- **Heartbeat:** server ping mỗi 15 giây; không trả lời sau 2 lần thì đóng kết nối.
- **Đồng bộ phòng:**
  - khi vào phòng: server gửi snapshot (người trong phòng: id, tên, ngoại hình, vị trí);
  - sau đó gửi các sự kiện join / leave / move / emote / appearance;
  - farm (ô đất, trang trí) của khách được tải lại bằng HTTP định kỳ, không đẩy realtime.
- **Phạm vi hạ tầng:** một server, phòng lưu trong bộ nhớ (không Redis, không cluster).

### 2.7 Dữ liệu

- Schema v5 (chỉ thêm): `players.display_name`, `players.farm_code` (duy nhất). Người chơi cũ được sinh tên và mã khi migrate.
- Thêm `GET /api/farms/:farmCode`: trả **view cho khách**, không có coin, túi đồ hay quest.

## 3. Quyết định cần Game Director chốt

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| P5-1 | Gặp nhau ở đâu | R-A: mỗi farm là một phòng; khách chỉ xem |
| P5-2 | Tìm farm | F-A: danh sách online + mã farm 6 ký tự |
| P5-3 | Di chuyển | M-A: chạm-để-đi trên lưới 8×8, server kiểm tra ô và tần suất |
| P5-4 | Tên hiển thị | N-A: tên tự sinh `Farmer NNNN`, chưa đổi được |

## 4. Các bước (sau khi duyệt)

| Bước | Nội dung |
|---|---|
| 5.1 | Shared: protocol v2 (hello có token, join/leave phòng, snapshot, move, emote), validator, mã lỗi; quy tắc ô đi được, định dạng tên và mã farm. Xác thực WebSocket chạy thông: server kiểm tra token trong `hello`, client gửi token (client và server phải đổi cùng lúc vì `hello` đổi dạng) |
| 5.2 | Server bảo mật realtime: heartbeat, một kết nối mỗi người chơi, giới hạn kết nối và tần suất |
| 5.3 | Server: schema v5 (tên, mã farm), API xem farm cho khách, danh sách online, quản lý phòng (presence, move, emote) |
| 5.4 | Client: danh sách online / nhập mã, cảnh farm cho khách, nhân vật trên lưới, chạm-để-đi, emote |
| 5.5 | E2E nhiều client (2–3 trình duyệt headless cùng lúc, local và qua URL Codespaces) và báo cáo đóng phase |

## 5. Chưa kiểm thử thực tế (sẽ ghi lại ở từng bước)

- Thiết bị Android/iOS và trình duyệt thật đã đăng nhập: hoãn theo Game Director (2026-10-12).
- Mạng di động thật (độ trễ, mất kết nối): chỉ mô phỏng bằng Chromium headless.
- Tải lớn (nhiều người cùng lúc): chỉ test giới hạn bằng test tự động, không có load test thật.
