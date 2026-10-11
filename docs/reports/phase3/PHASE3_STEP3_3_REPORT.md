# PHASE 3 — STEP 3.3: GIAO DIỆN LƯỚI NÔNG TRẠI VÀ CHẾ ĐỘ EDIT (CLIENT)

## Version

1.0 — 2026-10-11.

## Trạng thái

XONG.

Đánh số: Game Director gọi bước giao diện client là **Step 3.3**. Bước này ứng với "3.5 Client" trong kế hoạch ban đầu (`PHASE3_BUILDING_PLAN_REPORT.md` §4). Các bước 3.3–3.4 của kế hoạch đó (storage, API) đã gộp vào Step 3.2.

Phạm vi: lưới nông trại, hiển thị vật phẩm trang trí, chế độ Edit với các thao tác chọn, đặt, di chuyển, xoay, gỡ theo API của Step 3.2. Không có cửa hàng, thanh toán hay cách nhận vật phẩm (P3-4 chưa chốt). Vì vậy người chơi thật vẫn có kho trang trí bằng 0 và màn hình Edit hiện "You have no decorations yet."

---

## 1. Thiết kế đã chọn

Theo hướng P3-6 trong kế hoạch: chế độ Edit, chạm để đặt, có Move / Remove, không kéo-thả.

- **Màn hình farm Phase 2 giữ nguyên:** 3×3 ô đất lớn, hạt giống, nhiệm vụ, Claim. Chỉ thêm nút **Edit farm** vào ô trống thứ 6 của lưới nút hạt giống.
- **Edit farm** mở màn hình chiếm toàn bộ khung:
  - Lưới 8×8 (ở trên khi màn hình dọc, bên trái khi màn hình ngang).
  - Ô đất trồng tô màu theo trạng thái lấy từ server: đất trống, đang lớn, chín, khóa.
  - Vật phẩm đã đặt hiện tên và mũi tên hướng (↑ → ↓ ←); vật phẩm đang chọn có viền vàng.
  - 7 nút vật phẩm trang trí (tên và số lượng chưa đặt), các nút **Rotate**, **Remove**, **Done**, dòng trạng thái kết nối và dòng thông báo.
- Mỗi ô lưới ≥ 44 CSS px trên khung tối thiểu 360×640 / 640×360 và trên các màn hình lớn hơn (có test). Riêng màn hình 320×568, cả nông trại thu nhỏ nên ô còn khoảng 39 CSS px, giống cách các ô đất Phase 1–2 thu nhỏ.
- Khác với bản nháp kế hoạch (§2.1): vật phẩm trang trí **chỉ hiện trong màn hình Edit**, không hiện trên màn hình farm thường. Lý do: nếu hiện lưới 8×8 ở màn hình thường, ô đất sẽ nhỏ đi khoảng 2,5 lần và nhãn cây trồng không còn đọc được. Nếu muốn hiện vật phẩm ở màn hình thường thì cần một quyết định thiết kế riêng.

### Thao tác (logic thuần `client/src/farm/buildView.ts`)

| Thao tác | Kết quả |
|---|---|
| Chạm nút vật phẩm còn trong kho | Chọn vật phẩm (xoay 0°); chạm lại thì bỏ chọn; kho = 0 thì hiện "You have no X to place." |
| Chạm ô trống khi đang chọn vật phẩm | Gửi **place** (ô trên-trái, hướng xoay đang chọn) |
| Chạm vật phẩm đã đặt | Chọn vật phẩm đó; chạm lại thì bỏ chọn; chạm vật phẩm khác thì chuyển sang chọn vật phẩm đó |
| Chạm ô khi đang chọn vật phẩm đã đặt | Gửi **move** |
| Rotate | Vật phẩm đã đặt: gửi **rotate** +90°. Vật phẩm sắp đặt: chỉ đổi hướng ở client cho lần đặt sau (lựa chọn giao diện, không phải trạng thái game) |
| Remove | Gửi **remove** vật phẩm đang chọn; chưa chọn gì thì hiện gợi ý |
| Done | Quay lại màn hình farm |

- **Client không tự kiểm tra ranh giới, ô đất hay chồng lấn.** Mọi thao tác đặt / di chuyển đều gửi lên server, và server trả `PLACEMENT_INVALID` nếu sai.
- Lưới, kho và vật phẩm luôn vẽ lại từ `FarmState` mà server trả về.
- Lựa chọn tự bỏ khi server không còn vật phẩm đó: đã gỡ, hoặc vừa đặt cái cuối cùng.
- Khi bị từ chối, client hiện lỗi rồi tải lại farm như Phase 2:
  - `PLACEMENT_INVALID` → "It does not fit there: keep it inside the farm, off the crop plots and other objects."
  - `OBJECT_NOT_FOUND` → "That object is no longer on your farm. Farm refreshed."
  - `ITEM_NOT_OWNED` → "You have none of that decoration left."
  - Các mã khác dùng thông báo chung của Phase 2.
- Dùng lại cơ chế của Phase 2: request ID, gửi lại với cùng request ID khi lỗi mạng, khóa thao tác khi mất kết nối hoặc đang xử lý.

---

## 2. Tệp thay đổi

| Tệp | Thay đổi |
|---|---|
| `client/src/farm/buildView.ts`, `buildView.test.ts` | Mới — logic chế độ Edit, 21 test |
| `client/src/farm/farmLayout.ts`, `farmLayout.test.ts` | Nút Edit farm; bố cục Edit (lưới, nút, chữ); 32 test mới |
| `client/src/farm/FarmScene.ts` | Chế độ Edit: ô lưới, vật phẩm, nút, thao tác gửi server, debug hook (chỉ khi dev) |
| `client/src/network/farmApi.ts`, `farmApi.test.ts` | `placeObject`, `moveObject`, `rotateObject`, `removeObject`; 6 test |
| `docs/CURRENT_STATUS.md`, `docs/CHANGELOG.md`, `docs/reports/README.md`, báo cáo này | Tài liệu |

Không đổi: server, shared, database, giao thức. Không đụng tới 10 tệp WebSocket/Codespaces chưa commit (trong đó có `client/vite.config.ts`).

---

## 3. Kiểm tra

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | Sạch (shared, server, client) |
| `npm test` | shared 369, server 508, client 180 (+59) — **1057 passing** |
| `npm run build -w client` | OK (chỉ có cảnh báo kích thước chunk như trước) |

### Trình duyệt (headless Chromium, local): 30/30

- **Môi trường riêng, không đụng dev server và database của người chơi:**
  - Server ở cổng 3100, database tạm trong scratchpad; Vite ở cổng 5174.
  - Chromium điều khiển qua DevTools protocol, 390×844 rồi 844×390, devicePixelRatio 2.
  - Vật phẩm trang trí được cấp trực tiếp vào database tạm (chưa có cửa hàng).
- **Đã kiểm tra:**
  - Màn hình farm Phase 2 không đổi; mở Edit farm.
  - Đặt fence, server cấp ID 1, kho giảm từ 3 xuống 2.
  - Bị từ chối: đặt lên ô đất; tree ở (7,7) vượt ranh giới; di chuyển ra ngoài lưới. Vật phẩm giữ nguyên chỗ cũ và vẫn được chọn.
  - Tree đặt sát fence (chỉ chạm cạnh) thì hợp lệ.
  - Chọn vật phẩm khi chạm; chạm vật phẩm khác thì chuyển chọn.
  - Di chuyển; xoay qua server; xoay trước khi đặt (chỉ ở client); gỡ thì vật phẩm về kho; nhấn Remove khi chưa chọn thì hiện gợi ý.
  - Ô lưới ở màn hình ngang khoảng 47,7 CSS px.
  - Done; trồng cây vẫn hoạt động sau khi Edit.
  - Tải lại trang thì bố cục vẫn giữ.
  - Người chơi không có vật phẩm: hiện "You have no decorations yet.", không chọn được vật phẩm.
- Đã xem ảnh chụp: màn hình farm dọc, Edit dọc (chưa chọn và đang chọn), Edit ngang.

Chưa kiểm tra: thiết bị Android / iOS; qua URL Codespaces; mất kết nối khi đang ở chế độ Edit (dùng chung cơ chế khóa khi offline của Phase 2, chưa chạy riêng trên trình duyệt).

---

## 4. Ghi chú về database dev

`server/data/farmverse.db` (database dev của Game Director) đã ở **schema v3**. Tiến trình dev server ở cổng 3000 đã tự tải lại code Step 3.2 và chạy migration v3. Tôi không khởi động lại hay sửa nó.

Migration v3 chỉ thêm bảng, không sửa dữ liệu Phase 2 (`PHASE3_STEP3_2_REPORT.md` §2). Tôi chỉ đọc số version, ở chế độ chỉ đọc.

---

## 5. Còn lại

- **P3-4 / P3-5:** cách người chơi nhận vật phẩm trang trí, giá, level. Cho tới khi chốt, chế độ Edit chạy được nhưng người chơi thật chưa có gì để đặt.
- **Có hiện vật phẩm trên màn hình farm thường hay không** (xem §1) — cần Game Director quyết định.
- Kiểm tra trên thiết bị thật và qua URL Codespaces.
