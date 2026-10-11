# PHASE 3 — STEP 3.1: LƯỚI NÔNG TRẠI VÀ QUY TẮC ĐẶT VẬT PHẨM (SHARED)

## Version

1.0 — 2026-10-11.

## Trạng thái

XONG — Game Director duyệt 2026-10-11.

Thực hiện theo chỉ thị của Game Director ngày 2026-10-11 ("Tiếp tục Phase 3, Step 3.1"). Dùng các phương án đề xuất trong `PHASE3_BUILDING_PLAN_REPORT.md`: **G-A** (lưới 8×8, khối ô đất cố định) và **C-A** (7 vật phẩm trang trí, không chức năng). Các giá trị là tạm thời.

Chưa đưa vào Step 3.1 (để bước sau, khi P3-4 / P3-5 được chốt): giá coin, level mở khóa vật phẩm, cửa hàng, kho vật phẩm trang trí, mã lỗi `NOT_ENOUGH_COINS`.

---

## 1. Đã làm

Module mới `shared/src/building.ts` (export `@farmverse/shared/building`):

| Phần | Nội dung |
|---|---|
| Lưới | `FARM_GRID_WIDTH` = `FARM_GRID_HEIGHT` = 8; ô (0, 0) ở góc trên-trái, x sang phải, y xuống dưới |
| Khối ô đất | `PLOT_BLOCK_AREA` = {x 2, y 2, 3×3}; `plotTile(i)` → ô lưới của ô đất i (theo hàng). Cả 9 ô (kể cả ô còn khóa theo level) đều được giữ chỗ |
| Kiểu dữ liệu | `GridPosition`, `GridSize`, `GridArea`, `Rotation` (0 / 90 / 180 / 270), `DecorationId`, `DecorationCategory` (`fence`, `path`, `plant`, `furniture`, `building`), `DecorationDefinition`, `Placement`, `PlacedObject` (`objectId` số nguyên dương do server cấp) |
| Danh mục | fence, path, flower_bed, bush, bench (1×1); tree, small_house (2×2). ID tách riêng khỏi `ITEM_IDS` của farming — không đổi kho, seed refill hay `FarmState` Phase 2 |
| Kiểm tra dạng | `isDecorationId`, `isRotation`, `isGridPosition`, `isPlacement`, `isPlacedObject` |
| Hình học | `rotatedSize` (90° / 270° đổi rộng ↔ cao), `footprint`, `isAreaInsideGrid`, `areasOverlap` (chạm cạnh / góc không tính là chồng) |
| Quy tắc đặt | `checkPlacement(objects, placement, { ignoreObjectId })` → `ok` + vùng ô, hoặc lỗi `invalid` / `out_of_bounds` / `overlaps_plots` / `overlaps_object` (kèm `objectId` bị chồng) |
| Kiểm tra cả bố cục | `checkLayout(objects)` — dạng từng vật phẩm, `objectId` không trùng, mọi vật phẩm hợp lệ và không chồng nhau (dùng cho kiểm tra dữ liệu lưu ở Step 3.3) |

Quy tắc chồng lấn: **không cho phép chồng lấn nào**, trừ khi di chuyển / xoay một vật phẩm thì vị trí cũ của chính nó không chặn (`ignoreObjectId`).

Mã lỗi mới trong `shared/src/errors.ts`: `PLACEMENT_INVALID` (chỉ là định nghĩa; server chưa trả mã này cho tới Step 3.4).

## 2. Tệp thay đổi

| Tệp | Thay đổi |
|---|---|
| `shared/src/building.ts` | Mới |
| `shared/src/building.test.ts` | Mới — 64 test |
| `shared/src/errors.ts`, `errors.test.ts` | Thêm `PLACEMENT_INVALID` |
| `shared/package.json` | Export `./building` |
| `docs/CURRENT_STATUS.md`, `docs/CHANGELOG.md`, báo cáo này | Cập nhật |

Không đổi: server, client, database, giao thức HTTP / WebSocket Phase 2. 10 tệp WebSocket/Codespaces chưa commit vẫn giữ nguyên (không sửa, không reset).

## 3. Test

Test bao phủ: dữ liệu hợp lệ (lưới rỗng, mọi ô 1×1 trống với 4 hướng xoay, bố cục đầy đủ), dữ liệu sai (ID lạ, tọa độ âm / thập phân / chuỗi, xoay 45°, `objectId` sai, không phải danh sách, trùng `objectId`), vượt ranh giới (2×2 ở cạnh phải / dưới / góc), chồng lên khối ô đất (đúng 9 ô bị từ chối), chồng lấn vật phẩm, chạm cạnh hợp lệ, di chuyển / xoay tại chỗ.

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | Sạch (shared, server, client) |
| `npm test` | shared 343 (trước 279, +64), server 414, client 121 — **878 passing** |

## 4. Còn lại / bước tiếp theo

- Game Director chốt P3-4 (cửa hàng bằng coin — chỗ tiêu coin đầu tiên) và P3-5 (giá, level) trước khi thêm giá / level / kho vào `shared`.
- Vị trí khối ô đất (2, 2) là tạm thời; có thể đổi trước Step 3.3 (khi bố cục bắt đầu được lưu) nếu Step 3.5 cần.
- Step 3.2: luật server thuần (đặt, di chuyển, xoay, gỡ) dùng `checkPlacement` / `checkLayout`.
