# PHASE 3 — STEP 3.5: KIỂM THỬ END-TO-END QUA URL CODESPACES

## Version

1.0 — 2026-10-11.

## Trạng thái

**ĐẠT — 24/24.** Không phát hiện lỗi game, không sửa code.

Dựa trên commit `6bc909f` (Step 3.4). Các tệp WebSocket/Codespaces chưa commit đang có trong working tree nên dev server đang chạy cũng dùng chúng; chúng không thuộc phạm vi bước này.

---

## 1. Môi trường

- Đường đi: `https://<codespace>-5173.app.github.dev` (cổng private) → Vite dev server 5173 → Fastify dev server 3000 → `server/data/farmverse.db` (schema v3).
- Không khởi động lại server đang chạy. Database dev **không bị sửa, reset hay xóa**; chỉ có thêm **1 farm khách mới** do chính bài test tạo qua game.
- Trình duyệt: Chromium headless (bản trong cache Playwright), điều khiển qua DevTools protocol. Màn hình 390×844 (devicePixelRatio 2), sau đó 844×390.
- Truy cập không cần người đăng nhập (cùng cách với Phase 2, `PHASE2_STEP2_6_REPORT.md` §6):
  - Trang và mọi request `/api` đi qua tunnel với header `X-Github-Token`. Trang cảnh báo "development port" của GitHub được bấm **Continue** như người dùng.
  - Riêng socket game `/ws` đi qua một relay cục bộ, gửi Origin `https://localhost:5173`. Đây là Origin mà trình duyệt thật đã đăng nhập gửi tới server; còn truy cập bằng token thì tunnel đổi Origin thành `http://localhost:5173` và server trả 403 (đã kiểm tra lại trong lần chạy này).
  - Chromium của bài test được chạy với `--disable-features=LocalNetworkAccessChecks,…` để trang https kết nối được tới relay trên 127.0.0.1. Cờ này chỉ áp dụng cho trình duyệt thử nghiệm.

## 2. Kết quả

| Kiểm tra | Kết quả |
|---|---|
| Game tải qua URL Codespaces; farm mới: 0 coin, level 1, chưa có vật phẩm | PASS |
| Trồng 5 Wheat (cần kết nối `/ws`); chờ 30 s, thu hoạch được 10 coin; Claim quest 1 → 20 coin | PASS |
| Mở Edit farm | PASS |
| **Mua**: Fence → 15 coin; Fence thứ hai → 10; Path → 5 (thông báo "Bought … for 5 coins.") | PASS |
| Flower Bed bị khóa: "Flower Bed unlocks at level 2." | PASS |
| **Đặt**: 2 Fence ở (0,0), (1,0) và Path ở (5,2); server cấp ID 1–3, kho về 0 | PASS |
| Đặt khi hết vật phẩm → gợi ý mua, không gửi request | PASS |
| Mua thêm Fence rồi đặt lên ô đất trồng → server từ chối (409 `PLACEMENT_INVALID`), hiện thông báo | PASS |
| **Di chuyển**: Path sang (7,7) → "Path moved." | PASS |
| Chạm vào một Fence khác khi đang chọn Fence → chuyển chọn sang Fence đó, không di chuyển | PASS |
| **Xoay**: Fence 0° → 90° → 180° (server) | PASS |
| **Gỡ**: Path về kho, không hoàn coin (coin vẫn 0) | PASS |
| **Tải lại trang**: coin, XP, kho (Fence 1, Path 1) và bố cục (2 Fence, một cái 180°) giống hệt trước khi tải | PASS |
| Edit sau khi tải lại, màn hình ngang: ô ≥ 44 CSS px; Done → màn hình farm hiện "Coins 0" | PASS |
| Lỗi JavaScript trên trang | Không có |
| Lỗi HTTP | Chỉ có 409 cố ý ở `/api/farm/objects/place` |

Ảnh chụp sau khi tải lại: trạng thái "Connected", Fence ↑ và Fence ↓, kho `Fence ×1 · 5c` / `Path ×1 · 5c`, các vật phẩm còn khóa hiện `Level N`.

Ba lần chạy đầu thất bại vì **relay của bài test**, không phải lỗi game:

- Chromium chặn trang https mở kết nối tới 127.0.0.1 (Local Network Access).
- Relay gửi các tin nhắn xếp hàng dưới dạng frame nhị phân, nên server không nhận ra `hello`.

Trong cả ba lần, game đều hiện đúng "You are offline…" và khóa thao tác. Sau khi sửa relay thì bài test đạt 24/24.

## 3. Kiểm tra lại

Không đổi code. `npm run typecheck` sạch; `npm test`: shared 376, server 532, client 186 — 1094 passing.

## 4. Chưa kiểm tra

- Thiết bị Android / iOS thật (đã hoãn theo Game Director).
- Trình duyệt người dùng đăng nhập thật qua URL Codespaces: bài test dùng token và relay `/ws` như mô tả ở §1.

## 5. Bước tiếp theo

Báo cáo đóng Phase 3 (closeout) để Game Director duyệt; Phase 2 closeout vẫn chờ duyệt.
