# PHASE 4 — STEP 4.3: CLIENT NHÂN VẬT

## Version

1.0 — 2026-10-12.

## Trạng thái

**XONG.** Làm theo P4-1 (R-A) và P4-4 (D-A) đã duyệt, dùng API của Step 4.2. Không đổi server, shared hay kiến trúc. Không đụng 10 file WebSocket/Codespaces chưa commit.

## 1. Thay đổi

- **Vẽ nhân vật — `client/src/character/characterDrawing.ts`**
  - Hàm thuần `characterShapes(appearance)` liệt kê các hình chữ nhật, tròn, tam giác trong khung 100×160. Màu lấy từ catalog shared.
  - Mỗi kiểu tóc có hình riêng: short, long, spiky, bun.
  - Áo: tee, plaid (sọc), overalls (yếm và dây đeo).
  - Quần: trousers, shorts (lộ chân).
  - `fitCharacter` co giãn hình vào khung, giữ tỉ lệ. Scene vẽ bằng Phaser Graphics và chỉ vẽ lại khi ngoại hình hoặc khung thay đổi.
- **Logic màn hình Character — `client/src/character/characterView.ts`** (hàm thuần)
  - Client chỉ giữ bản nháp (tab đang mở và bộ đồ đang thử).
  - Chạm vào món đã có hoặc mua được thì thử ngay trên máy; món còn khóa chỉ hiện level mở khóa.
  - **Buy** mua món đang thử ở tab hiện tại. **Wear** lưu cả bộ, nhưng chỉ khi đã sở hữu đủ; nếu chưa thì báo "Buy … first".
  - **Done** đóng màn hình và bỏ bản nháp chưa lưu.
  - Có dòng gợi ý (coin và việc cần làm tiếp) cùng thông báo lỗi `ALREADY_OWNED`, `ITEM_NOT_OWNED`, `LEVEL_TOO_LOW`, `INSUFFICIENT_CURRENCY`.
- **API — `client/src/network/farmApi.ts`:** thêm `equipCharacter` và `buyCosmetic`, dùng request ID và cơ chế retry sẵn có.
- **Layout — `client/src/farm/farmLayout.ts`**
  - `avatar`: ô 44 đơn vị ở góc trái thanh trên cùng, không che tiêu đề, dòng thông số hay thanh XP.
  - `character`: khung xem trước lớn (portrait ở trên, landscape bên trái). Bên dưới hoặc bên cạnh là 4 tab, 4 lựa chọn xếp 2×2 để tên hai chữ như "Green Shorts" vừa một dòng, các nút Buy / Wear / Done và dòng thông báo.
- **Scene — `client/src/farm/FarmScene.ts`**
  - Thêm mode `character`.
  - Hình nhân vật nhỏ trên farm chính là nút mở màn hình Character.
  - Sau mỗi lần Buy / Wear, giao diện vẽ lại theo `FarmState` server trả về. Nếu server từ chối thì tải lại farm, như các thao tác khác.
  - Thêm debug hook cho bản dev.

## 2. Test đã chạy

- `npm run typecheck` (shared, server, client): sạch.
- Client `vitest run` (cả gói client): 231 passing. Phần mới:
  - `characterView.test.ts` và `characterDrawing.test.ts`: mọi tổ hợp 4×4×4×4 đều nằm trong khung, và mỗi món có hình vẽ khác nhau;
  - test layout avatar và màn hình Character ở 10 kích thước màn hình (vùng chạm ≥ 44 CSS px, không chồng nhau, chữ vừa nút);
  - 3 test API.
- `npm run build` (client): OK. Cảnh báo chunk > 500 kB của Phaser đã có từ trước.
- **Smoke test trình duyệt: 13/13 PASS.** Chromium headless, server và database tạm cô lập trên port 3100/5174; không đụng dev server hay database dev. Các bước:
  - farm mới có nhân vật khởi đầu;
  - chạm avatar mở màn hình Character;
  - thử tóc Long Black và da Brown, Wear thì server lưu;
  - tải lại trang vẫn giữ ngoại hình;
  - thử Green Shorts chưa mua, Wear bị từ chối ngay trên máy;
  - Buy trừ 40 coin, sau đó Wear thành công;
  - Work Pants hiện "unlocks at level 5";
  - Done quay về farm;
  - ở màn hình ngang (844×390) vẫn hiển thị đúng;
  - không có lỗi trang.
- Không chạy lại toàn bộ test shared và server, vì hai phần này không đổi.

## 3. Bước tiếp theo

Step 4.4 — kiểm thử end-to-end qua URL Codespaces và báo cáo đóng Phase 4. Android vẫn hoãn.
