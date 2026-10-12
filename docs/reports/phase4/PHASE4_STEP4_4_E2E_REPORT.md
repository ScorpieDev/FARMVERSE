# PHASE 4 — STEP 4.4: KIỂM THỬ END-TO-END QUA URL CODESPACES

## Version

1.0 — 2026-10-12.

## Trạng thái

**ĐẠT — 24/24.** Không phát hiện lỗi game, không sửa code. Kiểm thử dựa trên commit `a5640bd` (Step 4.3).

## 1. Môi trường

- **Đường đi:** `https://<codespace>-5173.app.github.dev` (cổng private) → Vite dev 5173 → Fastify dev 3000 → `server/data/farmverse.db`.
- **Server:** dev server (`tsx watch`) đang chạy đã tự nạp code Step 4.2–4.3. Database dev đã ở **schema v4** (45 người chơi cũ, mỗi người có 6 món khởi đầu, tổng 270 dòng `cosmetic_inventory`).
- **Database dev:** không sửa, không reset. Bài test chỉ tạo **1 farm khách mới** qua game. Coin và level có được nhờ chơi thật (397 giây), không ghi trực tiếp vào DB.
- **Trình duyệt:** Chromium headless, điều khiển qua DevTools protocol. Màn hình 390×844 (DPR 2), sau đó 844×390.
- **Cách truy cập** giống Phase 3 (`PHASE3_STEP3_5_E2E_REPORT.md` §1):
  - mọi request đi qua tunnel kèm header `X-Github-Token`, và bấm **Continue** ở trang cảnh báo cổng của GitHub;
  - socket `/ws` đi qua relay cục bộ, gửi Origin `https://localhost:5173` (Origin mà trình duyệt thật gửi);
  - Chromium chạy với `--disable-features=LocalNetworkAccessChecks,…`. Cờ này chỉ áp dụng cho trình duyệt thử nghiệm.

## 2. Kết quả

| Kiểm tra | Kết quả |
|---|---|
| Game tải qua URL Codespaces. Farm mới: 0 coin, level 1 | PASS |
| **Tạo nhân vật**: nhân vật khởi đầu có 6 món, ngoại hình mặc định. Hình nhỏ hiện ở đầu màn hình farm | PASS |
| Chạm hình nhân vật → mở màn hình Character | PASS |
| Thử Long Black / Blue Tee / Brown Pants / da Tan ngay trên máy; server chưa thay đổi | PASS |
| Spiky Blond khóa ở level 1 ("unlocks at level 2") | PASS |
| **Wear** → server lưu ngoại hình ("New look saved."); Done → về farm | PASS |
| **Tải lại trang**: ngoại hình được giữ | PASS |
| Chơi thật: Wheat, Carrot, Tomato và 4 quest → level 2, 112 coin | PASS |
| Thử Spiky Blond: hiện giá 40 coin. Wear khi chưa mua → "Buy Spiky Blond first." | PASS |
| **Mua** Spiky Blond: −40 coin, món đã sở hữu, ngoại hình đang mặc không đổi | PASS |
| **Mua** Green Shorts: −40 coin (còn 32) | PASS |
| Mua lại món đã có → "You already own Green Shorts." | PASS |
| **Mặc** đồ vừa mua → server lưu | PASS |
| Plaid Shirt vẫn khóa ("unlocks at level 3") | PASS |
| **Tải lại trang**: 32 coin, 8 món, ngoại hình mới đều được giữ | PASS |
| Màn hình Character ở chế độ ngang (844×390) | PASS |
| Lỗi JavaScript trên trang | Không có |
| Lỗi HTTP từ `/api` | Không có |

Ảnh chụp: hình nhân vật ở đầu màn hình farm (tóc Spiky Blond, Blue Tee, Green Shorts) và màn hình Character ở chế độ ngang. Không phát hiện lỗi hiển thị.

## 3. Kiểm tra lại

Không sửa code.

- `npm run typecheck` (cả 3 workspace): sạch.
- shared `character` + `api`: 209 test đạt.
- server `character` + `storage`: 86 test đạt.
- client (toàn bộ): 231 test đạt.
- Client build: OK.

## 4. Chưa kiểm tra

- Thiết bị Android / iOS thật (đã hoãn theo Game Director).
- Trình duyệt thật đã đăng nhập: bài test dùng token và relay `/ws` như §1.
