# PHASE 5 — STEP 5.5: E2E NHIỀU CLIENT QUA URL CODESPACES

## Version

1.0 — 2026-10-12.

## Trạng thái

**ĐẠT — 19/19.** Không phát hiện lỗi game, không sửa code. Kiểm thử dựa trên commit `d2c3151` (Step 5.4).

## 1. Môi trường

- **Đường đi:** `https://<codespace>-5173.app.github.dev` (cổng private) → Vite dev 5173 → Fastify dev 3000 → `server/data/farmverse.db` (schema v5).
- **Server:** dev server đang chạy đã tự nạp code Phase 5.
- **Dữ liệu:** DB dev không bị sửa hay reset; bài test tạo 2 farm khách mới qua game, cộng 1 session để đọc danh sách online.
- **Trình duyệt:** Chromium headless với **2 browser context độc lập** (2 người chơi A và B, localStorage riêng), màn hình 390×844; cuối bài A xoay sang 844×390.
- **Cách truy cập** giống Phase 3/4:
  - mọi request đi qua tunnel với `X-Github-Token`, và bấm **Continue** ở trang cảnh báo cổng;
  - mỗi socket `/ws` đi qua một relay cục bộ gửi Origin `https://localhost:5173`; mỗi trang một kết nối upstream riêng;
  - Chromium chạy với `--disable-features=LocalNetworkAccessChecks,…` (chỉ cho trình duyệt thử nghiệm).

## 2. Kết quả

| Kiểm tra | Kết quả |
|---|---|
| A và B tải game, WebSocket được `welcome` (protocol 2, có token); hai mã farm khác nhau | PASS |
| A: Visit → My farm → vào phòng farm của mình | PASS |
| B: danh sách online có A → chạm vào A → vào phòng của A (view khách đã tải) | PASS |
| A thấy B đến (`player_joined`) | PASS |
| B chạm ô (0,0): A thấy đúng vị trí do server báo; nhân vật của B được vẽ đúng ô sau animation | PASS |
| Nhãn "#NNNN" cho B, "You" cho A | PASS |
| Emote Heart của B hiện trên đầu B ở màn hình A | PASS |
| B đổi ngoại hình qua `POST /api/character/equip` → A thấy ngoại hình mới trong phòng (`player_updated`) | PASS |
| B bấm Leave → về màn hình Visit; A thấy B rời đi | PASS |
| Enter code: gõ mã của A bằng chữ thường có khoảng trắng → vào lại phòng | PASS |
| Mã không tồn tại → ở lại màn hình Visit, báo "No farm has that code." | PASS |
| Mã sai định dạng → giải thích ngay, không gửi request | PASS |
| Đóng trang của B → B biến khỏi phòng của A | PASS |
| A xoay ngang, rồi Leave → Back → về farm | PASS |
| Lỗi JavaScript trên cả hai trang | Không có |

## 3. Quan sát

Danh sách online của B còn có **một người chơi khác (`Farmer 6839`, `6B7F6W`) không do bài test tạo**. Người này vẫn online sau khi mọi Chromium của bài test đã tắt. Đó là một kết nối protocol 2 đã xác thực từ bên ngoài, có thể là một tab trình duyệt đang mở dev server. Tôi không xác minh được người dùng là ai, nên **không** tính làm bằng chứng cho việc kiểm thử bằng trình duyệt thật đã đăng nhập.

## 4. Kiểm tra lại toàn bộ

Không sửa code.

- `npm run typecheck`: sạch.
- `npm test`: shared 479, server 620, client 289 — **1388 passing**.
- Client build: OK.

## 5. Chưa kiểm thử thực tế

- Android/iOS, trình duyệt thật đã đăng nhập, mạng di động thật: hoãn theo quyết định của Game Director (2026-10-12).
- Heartbeat qua tunnel chỉ đi tới relay (kiểm chứng với trình duyệt ở local, Step 5.2).
- Tải lớn với nhiều phòng và nhiều người: chưa có load test.
