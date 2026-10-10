# PHASE 1 — BƯỚC 1.1: BÁO CÁO STATIC DATA VÀ CONTRACT TRONG `shared`

## Trạng thái

PASS — chưa stage, chưa commit, chưa push. Chờ Game Director và ChatGPT review.

**Bản sửa 2 (2026-10-10):** hoàn thiện theo quyết định D-a, D-b, D-c, B-1 của Game Director — xem mục "Bản sửa 2". Các số liệu test và diff bên dưới đã cập nhật theo bản sửa này.

## Bản sửa 2 — quyết định D-a, D-b, D-c, B-1

| # | Quyết định | Thay đổi |
|---|---|---|
| D-a | `harvested` phải là nông sản `*_produce`, không phải hạt `*_seed` | `farming.ts`: thêm kiểu `ProduceItemId` và `isProduceItemId` (chỉ nhận item `kind: "produce"`). `api.ts`: thêm `HarvestedProduce { itemId: ProduceItemId; quantity }`; `HarvestResponse.harvested` dùng kiểu này; `isHarvestResponse` kiểm tra bằng `isProduceItemId` thay cho `isInventoryEntry` |
| D-b | Thời gian chờ nạp hạt dựa trên thời gian server; client không tự quyết định | Contract đã chỉ dùng thời gian server (`availableAt`, `serverTime`); request `refill-seeds` chỉ có `requestId`. Làm rõ chú thích `SeedRefillState` (client chỉ dùng để đếm ngược; server chấp nhận hoặc trả `REFILL_NOT_ALLOWED`). Sửa chú thích `REFILL_NOT_ALLOWED` trong `errors.ts`: body lỗi không nói lý do; trạng thái `seedRefill` của server lấy qua `GET /api/farm`. Không thêm logic thời gian nào ở client/shared |
| D-c | Giữ WebSocket protocol v1 | Không sửa `protocol.ts`, `protocol.test.ts` |
| B-1 | Giữ quy ước lỗi hiện tại | Không đổi `ErrorPayload`, không thêm bảng lỗi → HTTP, không thêm/bớt mã lỗi |

Test thêm trong bản sửa 2:

- `farming.test.ts` — `isProduceItemId`: chấp nhận 3 nông sản; từ chối 3 hạt giống, crop id `wheat`, sai hoa thường, `corn_produce`, rỗng, null; khớp `kind` cho mọi item.
- `api.test.ts` — `isHarvestResponse`: chấp nhận cả 3 nông sản; từ chối `harvested` null/thiếu, **3 loại hạt giống**, crop id, item lạ, số lượng 0/1.5/thiếu, farm state sai.
- `api.test.ts` — "seedRefill uses server time only": chấp nhận mốc chờ sau `serverTime` (chưa được nạp) và mốc đã qua; `isRefillSeedsRequest` bỏ qua trường thời gian client gửi kèm, chỉ đọc `requestId`.
- `api.test.ts` — bổ sung: `playerId` viết hoa bị từ chối; phần tử `plots` null bị từ chối; đổi tên test "a ready crop" thành "another crop type" (validator không biết cây đã chín).


Căn cứ: `docs/PHASE1_FARMING_PLAN_REPORT.md` bản 1.6, mục 0.6, và quyết định của Game Director (2026-10-10).

---

## Quyết định áp dụng

| # | Quyết định | Áp dụng trong Bước 1.1 |
|---|---|---|
| P-1 | Thời gian chờ nhận lại hạt 60 giây | `SEED_REFILL_COOLDOWN_MS = 60_000` |
| P-3 | Dùng chung `REFILL_NOT_ALLOWED`, không thêm `REFILL_COOLDOWN`; server trả thời gian chờ còn lại trong dữ liệu phản hồi | 8 mã lỗi mới (không có `REFILL_COOLDOWN`); `FarmState.seedRefill.availableAt` + `FarmState.serverTime` (xem "Cách hiểu P-3") |
| P-4 | Chưa triển khai database; giữ Node.js 24 LTS; đánh giá SQLite ở Bước 1.3 | Không có code database; không đổi `.nvmrc`, `engines` |
| Q2, A-2, A-3, B, C | Giữ nguyên | `isSessionResponse` (UUID v4 + token 43 ký tự); `isRequestId` UUID v4 chữ thường; validator chỉ kiểm tra cấu trúc/kiểu; không thêm bảng lỗi → HTTP |

**Cách hiểu P-3 (cần xác nhận):** "thời gian chờ còn lại trong dữ liệu phản hồi" được thực hiện bằng `FarmState.seedRefill.availableAt` (mốc server) cùng `FarmState.serverTime` — có trong mọi response farm (`GET /api/farm`, plant, harvest, refill-seeds). Client tính `availableAt − serverTime`. Body lỗi `ErrorPayload { code, message }` **không đổi** vì dùng chung với WebSocket protocol v1. Nếu muốn chính response `409 REFILL_NOT_ALLOWED` chứa thời gian còn lại, cần mở rộng body lỗi ở bước API (1.4–1.5).

---

## Implemented

### `shared/src/farming.ts` (mới)

- Hằng số: `FARM_PLOT_COUNT = 6`, `STARTER_SEEDS_PER_CROP = 5`, `SEED_REFILL_PER_CROP = 5`, `SEED_REFILL_COOLDOWN_MS = 60_000`.
- `CROP_IDS` = `wheat`, `carrot`, `tomato`; `ITEM_IDS` = `wheat_seed`, `carrot_seed`, `tomato_seed`, `wheat_produce`, `carrot_produce`, `tomato_produce`.
- Kiểu `CropId`, `ItemId`, `ItemKind`, `ItemDefinition`, `CropDefinition`.
- `ITEMS` (6), `CROPS` (3): wheat 30 000 ms, carrot 120 000 ms, tomato 300 000 ms; `harvestYield` 1; tên hiển thị tiếng Anh.
- `isCropId`, `isItemId`, `isPlotIndex` (số nguyên 0..5), `getCrop`, `getItem`.
- Không có logic gameplay (trồng, chín, thu hoạch, điều kiện nhận lại hạt) — thuộc server.

### `shared/src/api.ts` (sửa)

- Giữ nguyên `HEALTH_PATH`, `HealthResponse`, `isHealthResponse` (hành vi không đổi; dùng chung hàm `isObject`).
- Path: `SESSION_PATH`, `FARM_PATH`, `FARM_PLANT_PATH`, `FARM_HARVEST_PATH`, `FARM_REFILL_SEEDS_PATH`.
- Kiểu: `SessionResponse`, `PlantedCrop`, `PlotState`, `InventoryEntry`, `SeedRefillState { eligible, availableAt }`, `FarmState`, `HarvestResponse`, `PlantRequest`, `HarvestRequest`, `RefillSeedsRequest`.
- Validator: `isRequestId`, `isSessionResponse`, `isSeedRefillState`, `isFarmState`, `isHarvestResponse`, `isPlantRequest`, `isHarvestRequest`, `isRefillSeedsRequest`.
- Quy tắc chính:
  - `isRequestId`: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`.
  - `isSessionResponse`: `playerId` UUID v4; `token` `/^[A-Za-z0-9_-]{43}$/`.
  - `isSeedRefillState`: `eligible` boolean; `eligible` → `availableAt` số nguyên ≥ 0; không `eligible` → `availableAt === null`.
  - `isFarmState`: `serverTime` nguyên ≥ 0; đúng 6 ô, `index === vị trí`; `crop` null hoặc `{ cropId, plantedAt, readyAt ≥ plantedAt }` (nguyên ≥ 0); inventory `{ itemId, quantity ≥ 1 nguyên }`, không trùng `itemId`; `seedRefill` hợp lệ.
  - Request: object không null/mảng, đủ trường hợp lệ, trường thừa bỏ qua.
- Validator **không** kiểm tra quy tắc gameplay (đúng mốc `readyAt`, đúng `eligible`/`availableAt`) — server chịu trách nhiệm.

### `shared/src/errors.ts` (sửa)

- Giữ 4 mã cũ; thêm 8 mã: `INVALID_REQUEST`, `UNAUTHORIZED`, `PLOT_NOT_EMPTY`, `PLOT_EMPTY`, `CROP_NOT_READY`, `ITEM_NOT_OWNED`, `REFILL_NOT_ALLOWED`, `REQUEST_ID_REUSED`.
- Không thêm bảng ánh xạ lỗi → HTTP (quyết định C).

### `shared/package.json` (sửa)

- Thêm export `"./farming": "./src/farming.ts"`.

---

## Tested

| Lệnh | Exit | Kết quả |
|---|---|---|
| `npm run typecheck -w shared` | 0 | Không lỗi |
| `npm run typecheck` (root) | 0 | shared + server + client không lỗi |
| `npm test` (root) | 0 | shared **218/218** (60 cũ + 158 mới), server **46/46**, client **44/44** — tổng **308** |
| `npm test -w shared` × 10 lần (sau bản sửa 2) | 0 | 10/10 lần pass |
| `npm run build -w client` | 0 | Build thành công (cảnh báo chunk lớn như trước) |
| `git diff --check` | 0 | Không lỗi whitespace; 2 file mới chưa track cũng không có khoảng trắng cuối dòng |

Test mới:

- `farming.test.ts`: hằng số (6, 5, 5, 60 000); `CROPS`/`ITEMS` đúng và không trùng; quy tắc tên `<crop>_seed`/`<crop>_produce` và `kind`; mỗi item dùng cho đúng một cây; `growthMs` 30 000/120 000/300 000; `harvestYield` 1; tên hiển thị không rỗng; `getCrop`/`getItem`; `isCropId`, `isItemId`, `isPlotIndex` chấp nhận và từ chối (sai hoa thường, crop id dùng làm item id, −1, 6, 1.5, `NaN`, `Infinity`, `"1"`, `null`).
- `api.test.ts` (test health cũ giữ nguyên): `isRequestId` (v4 hợp lệ; chữ hoa, v1, biến thể sai, không gạch, ngoặc, dài hơn, ký tự không hex, rỗng, số, null); 3 validator request (hợp lệ, trường thừa, thiếu trường, `plotIndex` sai, `cropId` sai/sai hoa thường/là item id, `requestId` sai, null/mảng/chuỗi); `isSessionResponse` (token ngắn/dài, `+`, `/`, `=`); `isSeedRefillState` (3 hợp lệ, 8 không hợp lệ); `isFarmState` (hợp lệ; kho rỗng; cây tomato; 21 trường hợp sai); `isHarvestResponse`.
- `errors.test.ts`: danh sách mã đúng 12 (4 cũ + 8 mới); `REFILL_COOLDOWN` bị từ chối.
- `protocol.test.ts`: không sửa, vẫn pass.

Không chạy test bằng Node 22.23.2 (mục này trong kế hoạch là "nếu được duyệt"; Game Director giữ Node 24 LTS). Môi trường chạy test: Node 24.21.0.

---

## Files Changed

Mới (2):

- `shared/src/farming.ts`
- `shared/src/farming.test.ts`

Sửa (5):

- `shared/src/api.ts`
- `shared/src/api.test.ts`
- `shared/src/errors.ts`
- `shared/src/errors.test.ts`
- `shared/package.json`

Không đổi (đã kiểm tra bằng `git diff`): `shared/src/protocol.ts`, `shared/src/protocol.test.ts`, `server/`, `client/`, root `package.json`, `package-lock.json`, `.nvmrc`. Không cài package.

---

## Known Issues / cần lưu ý

1. **P-3 / D-b:** đã chốt — thời gian chờ đọc từ `FarmState.seedRefill.availableAt` và `serverTime` (đều là thời gian server); body lỗi không đổi (B-1).
2. **WebSocket (D-c, giữ nguyên):** `isServerMessage` dùng `isErrorCode`, nên chấp nhận thêm 8 mã lỗi mới trong message `error`. Protocol v1 không đổi; server chưa gửi các mã này qua WebSocket. Chưa xử lý trong bước này theo D-c.
3. **A-6 chưa áp dụng:** server vẫn trả `INVALID_MESSAGE` cho JSON hỏng (Phase 0). Đổi sang `INVALID_REQUEST` ở bước server có API đầu tiên, kèm sửa test `app.test.ts`.
4. **Contract chưa được server/client dùng**; có thể cần chỉnh nhỏ ở Bước 1.2–1.7.
5. **Lệch Node:** test chạy trên Node 24.21 (Codespace) trong khi repo vẫn pin Node 22 (`.nvmrc`); cập nhật theo P-4 ở Bước 1.3.
6. Các file `docs/PHASE0_*.md`, `docs/PHASE1_FARMING_PLAN_REPORT.md` và báo cáo này chưa track, không đưa vào commit.

---

## Git

- Chưa stage, chưa commit, chưa push. `main` đồng bộ `origin/main` tại `7817ac7`.
- `git status --short` (ngoài `docs/`):

```
 M shared/package.json
 M shared/src/api.test.ts
 M shared/src/api.ts
 M shared/src/errors.test.ts
 M shared/src/errors.ts
?? shared/src/farming.test.ts
?? shared/src/farming.ts
```

- `git diff --stat` (file tracked, sau bản sửa 2): 5 file, +534 / −15.
- Commit đề xuất (7 file `shared/`, không có `docs/`): `feat: add Phase 1 farming contract to shared`
