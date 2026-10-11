# PHASE 3 — BUILDING: KẾ HOẠCH VÀ ĐỀ XUẤT THIẾT KẾ (BƯỚC 3.0)

## Version

1.0 — Bản nháp đầu tiên (2026-10-11).

## Trạng thái

CHỜ GAME DIRECTOR DUYỆT P3-4, P3-5. Step 3.1 đã làm theo G-A / C-A (`PHASE3_STEP3_1_REPORT.md`). Phase 2 đang chờ duyệt đóng (`docs/reports/phase2/PHASE2_CLOSEOUT_REPORT.md`).

Roadmap Phase 3: Farm grid, Buildings, Decorations, Placement, Remove / move objects, Save farm layout.
Tài liệu hiện có (`GAME_DESIGN.md` §4, §7) chỉ liệt kê loại công trình (nhà, ruộng, hàng rào, đường đi, cây, đồ trang trí, furniture) và nói coin dùng để mua vật phẩm / trang trí. **Chưa có** kích thước lưới, danh mục vật phẩm, giá, cách nhận vật phẩm — đó là các quyết định ở mục 3.

---

## 1. Hiện trạng sau Phase 2 (làm cơ sở)

- 9 ô đất cố định dạng 3×3 (ô 7–9 mở theo level), bố cục theo đơn vị thiết kế 360×640 / 640×360 (`farmLayout.ts`), không có bản đồ cuộn.
- Coin chỉ tăng, chưa có chỗ tiêu (quyết định P2-6). Ước tính khi đạt level 5 (~500 XP): khoảng 1 000–1 200 coin.
- Server: SQLite schema v2, mọi hành động có request ID trong một transaction; client chỉ gửi ý định.

---

## 2. Đề xuất thiết kế

### 2.1 Lưới nông trại (đề xuất G-A)

- Lưới ô vuông **8×8** cho mỗi nông trại. Khối 3×3 ô đất trồng giữ **cố định** ở giữa lưới trong Phase 3 (không di chuyển ô đất — tránh đổi luật trồng trọt và dữ liệu Phase 1–2).
- Vật phẩm chiếm 1×1 hoặc 2×2 ô lưới; không chồng lên nhau, không đè lên khối ô đất, không ra ngoài lưới — **server kiểm tra**.
- Màn hình nông trại hiện toàn bộ lưới (không cuộn) ở chế độ thường; nút **Edit** mở chế độ sắp xếp.

Phương án khác: G-B lưới lớn hơn (ví dụ 16×16) có cuộn / phóng to — linh hoạt hơn nhưng cần camera kéo-thả trên điện thoại, phức tạp hơn đáng kể.

### 2.2 Danh mục vật phẩm (đề xuất C-A: chỉ trang trí)

| Vật phẩm | Kích thước | Giá (coin) | Level |
|---|---|---|---|
| Fence (hàng rào) | 1×1 | 5 | 1 |
| Path (đường đi) | 1×1 | 5 | 1 |
| Flower bed | 1×1 | 20 | 2 |
| Bush | 1×1 | 30 | 3 |
| Bench | 1×1 | 60 | 4 |
| Tree | 2×2 | 120 | 5 |
| Small house | 2×2 | 300 | 6 |

- Phase 3 chỉ có **trang trí, không có chức năng** (không tăng sản lượng, không chứa đồ). Công trình có chức năng để sau, khi có Economy.
- Giá và level là tạm thời; dùng lại bảng mở khóa theo level của Phase 2 (`shared/src/progression.ts`).

### 2.3 Cách nhận vật phẩm (đề xuất S-A: cửa hàng cố định)

- Mua bằng coin từ cửa hàng giá cố định → vật phẩm vào kho (`inventory`) → đặt lên lưới. Đây là **chỗ tiêu coin đầu tiên** (thay đổi so với P2-6 — cần Game Director xác nhận).
- Gỡ vật phẩm khỏi lưới → trả về kho (không mất). **Không bán lại** trong Phase 3 (bán thuộc Phase 6 Economy).
- Mua, đặt, di chuyển, gỡ: mỗi hành động là một request có request ID, chạy trong một transaction, server kiểm tra coin, level, vị trí.

Phương án khác: S-B nhận vật phẩm làm phần thưởng nhiệm vụ / lên level (không tiêu coin) — giữ P2-6 nhưng ít lựa chọn cho người chơi.

### 2.4 Thao tác trên điện thoại

- Chế độ Edit: chạm vật phẩm trong kho → chạm ô lưới trống để đặt; chạm vật phẩm đã đặt → **Move** (chạm ô mới) hoặc **Remove**. Không dùng kéo-thả trong Phase 3 (dễ chạm nhầm trên màn hình nhỏ).
- Mỗi ô lưới ≥ 44 CSS px khi ở chế độ Edit (kiểm tra bằng test layout như Phase 1–2). Hỗ trợ cả dọc và ngang.

### 2.5 Dữ liệu

- `shared`: định nghĩa vật phẩm trang trí (id, tên, kích thước, giá, level), kích thước lưới, vị trí khối ô đất, validator, mã lỗi mới (ví dụ `PLACEMENT_INVALID`, `NOT_ENOUGH_COINS`).
- Server: schema v3 — bảng `farm_objects` (player, object id, item id, x, y); migration chỉ thêm, không sửa dữ liệu cũ; `FarmState` thêm `objects`.
- Không đổi: luật trồng trọt, nhiệm vụ, level, giao thức WebSocket v1.

---

## 3. Quyết định cần Game Director chốt

| # | Câu hỏi | Đề xuất |
|---|---|---|
| P3-1 | Đóng Phase 2 (Android để sau)? | Duyệt đóng |
| P3-2 | Lưới nông trại | G-A: 8×8, khối ô đất cố định, không cuộn |
| P3-3 | Danh mục Phase 3 | C-A: 7 vật phẩm trang trí, không chức năng |
| P3-4 | Cách nhận vật phẩm | S-A: cửa hàng giá cố định bằng coin (chỗ tiêu coin đầu tiên), gỡ → về kho, không bán lại |
| P3-5 | Giá và level mở khóa | Như bảng 2.2 (tạm thời, chỉnh sau) |
| P3-6 | Thao tác | Chế độ Edit, chạm-để-đặt, Move / Remove; không kéo-thả |
| P3-7 | 10 tệp WebSocket/Codespaces đang chờ | Quyết định riêng trước Phase 5 (Multiplayer); không chặn Phase 3 |

---

## 4. Kế hoạch triển khai (sau khi duyệt)

| Bước | Nội dung |
|---|---|
| 3.1 | `shared`: định nghĩa lưới và vật phẩm, kiểu API, validator, mã lỗi + test |
| 3.2 | Server: luật thuần (mua, đặt, di chuyển, gỡ, kiểm tra chồng lấn) + test |
| 3.3 | Storage schema v3 (`farm_objects`), migration + test |
| 3.4 | API: `objects` trong `FarmState`, `POST /api/shop/buy`, `/api/farm/objects/place`, `/move`, `/remove` (request ID, transaction) + test |
| 3.5 | Client: hiển thị lưới và vật phẩm, cửa hàng, chế độ Edit + test layout |
| 3.6 | Kiểm tra end-to-end (local và URL Codespaces), tài liệu, báo cáo |
