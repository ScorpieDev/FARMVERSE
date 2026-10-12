# PHASE 4 — CHARACTER: KẾ HOẠCH THIẾT KẾ

## Version

1.1 — 2026-10-12. Game Director duyệt P4-1…P4-4 theo đề xuất (R-A, C-A, K-A, D-A) ngày 2026-10-12.

## Trạng thái

Đã duyệt; triển khai theo §4. Giá trị tạm thời.

Roadmap (`DEVELOPMENT_ROADMAP.md`): Character system, Hair, Shirt, Pants, Basic customization, Cosmetic inventory.
Thiết kế (`GAME_DESIGN.md` §5, §16; `GAME_RULES.md` §10–11): cosmetic phục vụ identity / social / collection, không bị trộm, không tạo lợi thế gameplay, không pay-to-win.

---

## 1. Hiện trạng sau Phase 3

- Chưa có asset hình ảnh: client vẽ mọi thứ bằng hình khối và chữ của Phaser.
- Coin đã có chỗ tiêu (cửa hàng trang trí, `POST /api/shop/buy`, kiểm tra level rồi coin). Database đang ở schema v3.
- Màn hình farm giữ layout Phase 2; Edit farm là màn hình toàn phần riêng.

## 2. Đề xuất

### 2.1 Cách vẽ nhân vật (R-A)

Nhân vật chibi nhìn chính diện, vẽ bằng hình khối Phaser (đầu, tóc, áo, quần, tay chân). Mỗi món là một kiểu dáng kèm một màu, nên không cần file ảnh.
Phương án khác R-B: dùng sprite sheet, nhưng cần có art trước.

### 2.2 Danh mục (C-A: 3 slot, 12 món)

| Slot | Món (giá coin / level mở khóa) |
|---|---|
| Hair | Short Brown (miễn phí), Long Black (miễn phí), Spiky Blond 40 / L2, Bun Red 80 / L4 |
| Shirt | White Tee (miễn phí), Blue Tee (miễn phí), Plaid Shirt 50 / L3, Overalls Top 100 / L5 |
| Pants | Blue Jeans (miễn phí), Brown Pants (miễn phí), Green Shorts 40 / L2, Work Pants 90 / L5 |

Ngoài ra có màu da để chọn tự do (4 tông, miễn phí, không phải món đồ).

### 2.3 Cách nhận (K-A)

- Món miễn phí có sẵn trong túi đồ ngay từ đầu.
- Món còn lại mua bằng coin, mỗi request một món, dùng lại mẫu shop của Phase 3. Lỗi trả về `LEVEL_TOO_LOW` / `INSUFFICIENT_CURRENCY`; mua món đã có thì lỗi `ALREADY_OWNED`.
- Món đã mua giữ vĩnh viễn, không bán lại, không thể bị trộm.

### 2.4 Hiển thị (D-A)

- Màn hình farm: thêm nút **Character** và một hình nhân vật nhỏ trên thanh trên cùng.
- Màn hình **Character** toàn phần: hình xem trước lớn; các tab Hair / Shirt / Pants / Skin; danh sách món (đã có / giá / `Level N`); các nút Buy, Wear, Done.
- Phase này nhân vật chưa đi lại trên farm, việc đó để Phase 5.

### 2.5 Dữ liệu và API

- Schema v4 (chỉ thêm, không sửa bảng cũ):
  - `character_appearance`: player, skin, hair, shirt, pants.
  - `cosmetic_inventory`: player, item. Nhân vật mặc định được tạo khi chạy migration và khi tạo farm mới.
- `FarmState` có thêm `character` (`skin`, `equipped`, `owned`).
- `POST /api/character/equip` (đổi skin và đồ đang mặc, kiểm tra phải sở hữu món đó) và `POST /api/shop/buy-cosmetic`. Cả hai dùng request ID và transaction.

## 3. Quyết định cần Game Director chốt

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| P4-1 | Cách vẽ | R-A: hình khối Phaser, không cần asset |
| P4-2 | Danh mục | C-A: 3 slot × 4 món + 4 màu da (bảng 2.2, tạm thời) |
| P4-3 | Cách nhận | K-A: 2 món miễn phí mỗi slot, còn lại mua bằng coin + level |
| P4-4 | Hiển thị | D-A: màn hình Character riêng, hình nhỏ trên farm, chưa đi lại |

## 4. Các bước (sau khi duyệt)

| Bước | Nội dung |
|---|---|
| 4.1 | Shared: danh mục cosmetic, slot, màu da, validator, mã lỗi `ALREADY_OWNED` |
| 4.2 | Server: rules thuần, schema v4, `character` trong `FarmState`, API equip / buy-cosmetic |
| 4.3 | Client: hàm vẽ nhân vật, màn hình Character, hình nhỏ trên farm |
| 4.4 | E2E và báo cáo đóng phase |
