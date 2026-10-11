# PHASE 3 — STEP 3.2: LOGIC XÂY DỰNG PHÍA SERVER (ĐẶT / DI CHUYỂN / XOAY / GỠ)

## Version

1.0 — 2026-10-11.

## Trạng thái

XONG.

Quyết định của Game Director ngày 2026-10-11 (hỏi trong lúc làm Step 3.2):

- **Duyệt schema v3 + API** trong Step 3.2. Nghĩa là gộp các bước 3.2–3.4 của kế hoạch ban đầu: luật thuần, storage và API.
- **Nguồn vật phẩm trang trí: chờ P3-4.** Kho trang trí mặc định là 0. Hàm `grantDecoration` có sẵn nhưng hiện chỉ test dùng tới. Vì vậy, trong game thật, người chơi chưa đặt được vật phẩm cho tới khi chốt cửa hàng hoặc phần thưởng.

Không có thanh toán, cửa hàng, giá hay level mở khóa vật phẩm.

---

## 1. Đã làm

### Luật thuần — `server/src/building/rules.ts`

- `BuildingData`: `stock` (vật phẩm trang trí sở hữu nhưng chưa đặt), `objects` (bố cục hợp lệ), `nextObjectId` (không bao giờ dùng lại ID).
- `placeDecoration`: kiểm tra sở hữu trước (`ITEM_NOT_OWNED`), sau đó kiểm tra vị trí (`PLACEMENT_INVALID`). Server cấp `objectId` và trừ 1 khỏi kho.
- `moveObject`, `rotateObject`: vị trí cũ của chính vật phẩm không chặn vị trí mới. Lỗi `OBJECT_NOT_FOUND` / `PLACEMENT_INVALID`.
- `removeObject`: trả vật phẩm về kho; nếu vật phẩm không còn thì trả `OBJECT_NOT_FOUND`.
- `assertBuildingData`: phát hiện dữ liệu hỏng (kho âm hoặc thiếu, bố cục chồng lấn hoặc vượt lưới, ID trùng, `nextObjectId` sai).
- Vị trí hợp lệ do `checkPlacement` / `checkLayout` của Step 3.1 quyết định.

### Database schema v3 — `server/src/storage/database.ts`

Migration chỉ thêm, không sửa dòng cũ, chạy lại an toàn (`IF NOT EXISTS` / `INSERT OR IGNORE`):

| Bảng | Nội dung |
|---|---|
| `building_state` | `next_object_id` (≥ 1); mỗi người chơi cũ nhận 1 |
| `decoration_stock` | 7 dòng / người chơi, `quantity` ≥ 0; người chơi cũ nhận 0 |
| `farm_objects` | `object_id`, `decoration_id`, `x`, `y`, `rotation` ∈ {0, 90, 180, 270} |

`farmStore.ts`: `loadBuilding` / `saveBuilding`. `insertPlayer` tạo sẵn các dòng v3 cho người chơi mới.

### API — `server/src/farming/routes.ts`, `shared/src/api.ts`

| Endpoint | Body |
|---|---|
| `POST /api/farm/objects/place` | `{ requestId, decorationId, x, y, rotation }` |
| `POST /api/farm/objects/move` | `{ requestId, objectId, x, y }` |
| `POST /api/farm/objects/rotate` | `{ requestId, objectId, rotation }` |
| `POST /api/farm/objects/remove` | `{ requestId, objectId }` |

- Thành công trả về `ObjectActionResponse` = `FarmState` + `object`.
- Lỗi: 400 `INVALID_REQUEST` khi dữ liệu sai dạng; 409 `ITEM_NOT_OWNED`, `PLACEMENT_INVALID`, `OBJECT_NOT_FOUND`, `REQUEST_ID_REUSED`.
- Validator chỉ kiểm tra dạng dữ liệu. Ranh giới lưới, ô đất và chồng lấn là luật game do server kiểm tra (409).
- Chạy chung `runAction` với các thao tác farming: request ID, một transaction, action log. Gửi lại cùng request ID sẽ trả lại kết quả cũ mà không áp dụng thao tác lần nữa.
- Quyền sở hữu: người chơi lấy từ token. Vật phẩm của người khác không hiện ra, nên server trả `OBJECT_NOT_FOUND`.
- `FarmState` thêm `decorations` (vật phẩm có số lượng > 0) và `objects`, có trong mọi phản hồi (GET, plant, harvest, refill, claim, object).
- `toFarmState(farm, quests, building, now)` nhận thêm tham số building.
- `runAction` chỉ lưu phần trạng thái mà thao tác thay đổi.

Mã lỗi mới: `OBJECT_NOT_FOUND` (`shared/src/errors.ts`).

---

## 2. Tương thích

- Luật farming, quest, coin, XP và level không đổi. Các thao tác farming chỉ có thêm 2 trường trong phản hồi.
- Database v2 lên v3: mọi dòng `players`, `plots`, `inventory`, `quest_state`, `action_log` giữ nguyên (có test so sánh trước và sau). Nếu lỗi giữa chừng thì rollback hoàn toàn về v2.
- Client Phase 2 không đọc 2 trường mới. Fixture test của client đã được cập nhật để khớp kiểu mới.
- **Giới hạn đã biết:** một request farming được ghi log *trước* khi nâng cấp server và gửi lại *sau* khi nâng cấp sẽ nhận phản hồi cũ, không có `decorations` / `objects`. Client sẽ báo phản hồi không hợp lệ. Lần tải farm tiếp theo trả về trạng thái đúng và không mất dữ liệu. Chỉ xảy ra với request đang gửi dở đúng lúc nâng cấp.
- Giao thức WebSocket v1 không đổi.

---

## 3. Tệp thay đổi

| Tệp | Thay đổi |
|---|---|
| `server/src/building/rules.ts`, `rules.test.ts` | Mới — luật thuần, 49 test |
| `server/src/building/routes.test.ts` | Mới — 36 test API |
| `server/src/farming/routes.ts` | 4 endpoint, `runAction` nạp / lưu building |
| `server/src/farming/rules.ts`, `rules.test.ts` | `toFarmState` có building |
| `server/src/storage/database.ts` | Migration v3 |
| `server/src/storage/farmStore.ts` | `loadBuilding`, `saveBuilding`, dòng v3 cho người chơi mới |
| `server/src/storage/migration.test.ts`, `storage.test.ts` | Test v2 → v3, lưu building |
| `shared/src/api.ts`, `api.test.ts` | Kiểu, đường dẫn, validator |
| `shared/src/errors.ts`, `errors.test.ts` | `OBJECT_NOT_FOUND` |
| `client/src/farm/farmView.test.ts`, `client/src/network/farmApi.test.ts` | Fixture `FarmState` thêm `decorations: []`, `objects: []` |
| `docs/CURRENT_STATUS.md`, `docs/CHANGELOG.md`, `docs/reports/README.md`, báo cáo này | Tài liệu |

Không đụng tới 10 tệp WebSocket/Codespaces chưa commit. Test API mới dựng Fastify trực tiếp với `registerFarmRoutes`, không phụ thuộc `app.ts` / `config.ts` đang có thay đổi chưa commit.

---

## 4. Test

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | Sạch (shared, server, client) |
| `npm test` | shared 369 (+26), server 508 (+94), client 121 — **998 passing** |
| `npm run build -w client` | OK |

Test API bao phủ:

- Đặt, di chuyển, xoay, gỡ thành công; không ảnh hưởng coin, XP, ô đất, kho farming, quest.
- Không sở hữu vật phẩm.
- Vượt cạnh phải / dưới, tọa độ âm hoặc ngoài lưới.
- Đè lên ô đất; chồng lên vật phẩm khác.
- Dữ liệu sai dạng (400); client tự gửi `objectId` thì bị bỏ qua.
- Thiếu token (401).
- Request lặp lại: cùng request ID thì trả lại kết quả cũ, không đặt hoặc gỡ hai lần; request ID dùng cho body hoặc thao tác khác thì `REQUEST_ID_REUSED`; cùng vị trí với request ID mới thì `PLACEMENT_INVALID`.
- Vật phẩm của người chơi khác (`OBJECT_NOT_FOUND`).

---

## 5. Còn lại / bước tiếp theo

- P3-4 / P3-5: nguồn vật phẩm trang trí (cửa hàng bằng coin hoặc phần thưởng), giá, level. Cho tới khi chốt, người chơi thật có kho trang trí bằng 0.
- Step 3.5 (theo kế hoạch): client hiển thị lưới, vật phẩm, chế độ Edit.
- Chưa kiểm tra bằng trình duyệt; mới chỉ có test tự động.
