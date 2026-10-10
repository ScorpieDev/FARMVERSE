# PHASE 1 — BƯỚC 1.2: BÁO CÁO LOGIC NÔNG TRẠI PHÍA SERVER

## Trạng thái

PASS — chưa stage, chưa commit, chưa push. Chờ Game Director và ChatGPT review.

**Bản sửa 2 (2026-10-10):** bổ sung kiểm tra `FarmData` không hợp lệ theo yêu cầu Game Director — xem mục "Bản sửa 2". Số liệu test bên dưới đã cập nhật.

## Bản sửa 2 — kiểm tra `FarmData`

Thay đổi trong `server/src/farming/rules.ts`:

- Thêm hàm nội bộ `assertFarmData(farm)` (không export), ném `RangeError` khi:
  - `farm` không phải object; `plots` không phải mảng hoặc không có đúng `FARM_PLOT_COUNT` (6) phần tử;
  - một ô không phải `null` và không phải `{ cropId hợp lệ, plantedAt số nguyên an toàn ≥ 0 }` (vòng lặp theo chỉ số nên mảng thưa có lỗ cũng bị từ chối);
  - `inventory` không phải object, hoặc thiếu một `ITEM_IDS`, hoặc có số lượng không phải số nguyên an toàn ≥ 0;
  - `seedRefillAvailableAt` không phải `null` và không phải số nguyên an toàn ≥ 0.
- Gọi `assertFarmData` **một lần ở đầu** 5 hàm công khai nhận `FarmData`: `plant`, `harvest`, `refillSeeds`, `toFarmState`, `isSeedRefillEligible`.
- Không kiểm tra lặp trong nội bộ: tách `seedRefillEligible` (nội bộ, không kiểm tra lại) khỏi `isSeedRefillEligible` (công khai, có kiểm tra); `harvest`, `refillSeeds`, `toFarmState` dùng bản nội bộ. `harvest` so `now < getReadyAt(plot)` trực tiếp thay cho gọi `isCropReady` (tránh kiểm tra `now` hai lần; hành vi không đổi).
- `createStarterFarm`, quy tắc gameplay, kiểu `RuleResult`, mã lỗi gameplay: **không đổi**. Dữ liệu sai cấu trúc chỉ ném `RangeError`, không bao giờ trả lỗi gameplay.
- `getReadyAt`, `isCropReady` nhận `FarmPlot` (không phải `FarmData`) nên không gọi `assertFarmData` (ngoài phạm vi yêu cầu).
- Khóa thừa trong `inventory` (không thuộc `ITEM_IDS`) không bị từ chối — yêu cầu chỉ nêu "đủ tất cả `ITEM_IDS`"; các hàm chỉ đọc `ITEM_IDS` nên khóa thừa bị bỏ qua.

Test thêm trong `server/src/farming/rules.test.ts` (149 test):

- 29 trường hợp dữ liệu hỏng × 5 hàm công khai (145 test), mỗi trường hợp phải ném `RangeError`: farm null; `plots` không phải mảng; 4 ô; 7 ô; mảng thưa; ô `undefined`; ô không phải object; `cropId` lạ / sai hoa thường; thiếu `plantedAt`; `plantedAt` âm / lẻ / `NaN` / chuỗi / vượt số nguyên an toàn; `inventory` null; thiếu item hạt; item nông sản `undefined`; số lượng âm / lẻ / `NaN` / `Infinity` / chuỗi / vượt số nguyên an toàn; mốc refill âm / lẻ / `NaN` / chuỗi / `undefined`.
- Không cấp hạt khi hạt âm và dương cộng lại bằng 0 (trước đây `refillSeeds` cấp thêm hạt).
- Thiếu item không còn biến thành `NaN` (trước đây `plant` thành công với `NaN`).
- Dữ liệu hợp lệ (farm khởi đầu, farm trống, 6 ô đều có cây, đang chờ refill, số lượng = `MAX_SAFE_INTEGER`) không ném lỗi ở cả 5 hàm.
- Kết quả của các hàm luôn hợp lệ cho lần gọi tiếp theo.


Căn cứ: `docs/PHASE1_STEP1_2_PLAN_REPORT.md` (đã duyệt) và quyết định P2-1 … P2-6. Contract dùng: `7afe6d9 feat: add Phase 1 farming contract to shared` (không sửa).

---

## Quyết định đã áp dụng

| # | Quyết định | Áp dụng |
|---|---|---|
| P2-1 | Chỉ logic thuần + unit test | 2 file trong `server/src/farming/`; không DB, không route, không sửa `app.ts` |
| P2-2 | Đầu vào sai miền ném `RangeError` | `plotIndex` ngoài 0..5 / không nguyên, `cropId` lạ, `now` không phải số nguyên an toàn ≥ 0 → `RangeError` |
| P2-3 | Trồng: kiểm tra ô trước, hạt sau | `plant` trả `PLOT_NOT_EMPTY` trước khi xét `ITEM_NOT_OWNED` |
| P2-4 | Inventory theo `ITEM_IDS`, bỏ số lượng 0 | `toFarmState` |
| P2-5 | Đủ điều kiện nạp nhưng mốc `null` → nạp ngay; `availableAt = now` | `refillSeeds`, `toFarmState` |
| P2-6 | Gameplay lỗi `{ ok: false, error }`, thành công `{ ok: true, farm, ... }` | `RuleResult` |
| — | Thời gian chín, mốc nạp dựa trên `now` do nơi gọi truyền vào | `rules.ts` không gọi `Date.now()`, không import `node:*`, không I/O (đã kiểm tra bằng `grep`) |
| — | Mốc chờ 60 s chỉ bắt đầu khi thu hoạch **thành công** làm farm hết hạt và hết cây; không gia hạn khi thất bại | `harvest`, `refillSeeds` |

---

## Implemented — `server/src/farming/rules.ts` (mới, 303 dòng sau bản sửa 2)

Kiểu (chỉ ở server):

- `FarmPlot { cropId, plantedAt }` — không lưu "Ready".
- `Inventory` = `Readonly<Record<ItemId, number>>` (đủ 6 item).
- `FarmData { plots (6 × FarmPlot | null), inventory, seedRefillAvailableAt: number | null }`.
- `RuleError` = `PLOT_NOT_EMPTY | PLOT_EMPTY | CROP_NOT_READY | ITEM_NOT_OWNED | REFILL_NOT_ALLOWED` (lấy từ `ErrorCode` của `shared`, không thêm mã mới).
- `RuleResult<Extra>`.

Hàm (không sửa input, trả `FarmData` mới khi thành công):

| Hàm | Quy tắc |
|---|---|
| `createStarterFarm()` | 6 ô trống; 5 hạt mỗi loại; nông sản 0; mốc `null` |
| `getReadyAt(plot)` | `plantedAt + growthMs` |
| `isCropReady(plot, now)` | `now >= readyAt` |
| `isSeedRefillEligible(farm)` | Tổng 3 loại hạt = 0 **và** không ô nào có cây (cây đã chín vẫn tính) |
| `plant(farm, plotIndex, cropId, now)` | Ô có cây → `PLOT_NOT_EMPTY`; hết hạt loại đó → `ITEM_NOT_OWNED`; thành công: trừ 1 hạt, ô = `{ cropId, plantedAt: now }` |
| `harvest(farm, plotIndex, now)` | Ô trống → `PLOT_EMPTY`; chưa chín → `CROP_NOT_READY`; thành công: ô trống, +`harvestYield` (1) `<crop>_produce`, trả `harvested`; nếu sau đó đủ điều kiện nạp → `seedRefillAvailableAt = now + 60 000` |
| `refillSeeds(farm, now)` | Không đủ điều kiện, hoặc `now < seedRefillAvailableAt` → `REFILL_NOT_ALLOWED` (mốc không đổi); mốc `null` mà đủ điều kiện → cho nạp ngay; thành công: +5 hạt mỗi loại, nông sản giữ nguyên, mốc `null` |
| `toFarmState(farm, now)` | `serverTime = now`; 6 `PlotState` có `readyAt`; inventory theo `ITEM_IDS`, bỏ số lượng 0; `seedRefill` = `{ eligible: true, availableAt: mốc ?? now }` hoặc `{ eligible: false, availableAt: null }` |

Ghi chú: `harvested` được ép kiểu sang `HarvestedProduce` vì `CropDefinition.produceItemId` có kiểu `ItemId` chung; static data đảm bảo luôn là `*_produce` (test `shared` và test server xác nhận).

---

## Tested

| Lệnh | Exit | Kết quả |
|---|---|---|
| `npm run typecheck` | 0 | shared + server + client không lỗi |
| `npm test` | 0 | shared **218/218**, server **244/244** (46 cũ + 49 bản đầu + 149 bản sửa 2), client **44/44** — tổng **506** |
| `npm test -w server` × 10 lần (sau bản sửa 2) | 0 | 10/10 lần pass |
| `npm run build -w client` | 0 | Build thành công (cảnh báo chunk lớn như trước) |
| `git diff --check` | 0 | Không lỗi; 2 file mới không có khoảng trắng cuối dòng |

Test bản đầu — `server/src/farming/rules.test.ts` (49 test; file hiện 554 dòng sau bản sửa 2), dùng thời gian cố định `T`, không đồng hồ thật:

- **Farm khởi đầu:** 6 ô trống, 5 hạt mỗi loại, mốc `null`; mỗi lần gọi trả object mới; `toFarmState` đúng contract.
- **Trồng:** thành công (trừ hạt, `plantedAt = now`, input không bị sửa — kiểm tra bằng `deepFreeze` + so sánh); ô có cây đang lớn / đã chín → `PLOT_NOT_EMPTY`; hết hạt một loại (còn loại khác) → `ITEM_NOT_OWNED`; ô có cây + hết hạt → `PLOT_NOT_EMPTY` (P2-3); trồng 5 hạt rồi lần thứ 6 → `ITEM_NOT_OWNED`; lấp đủ 6 ô.
- **Thời gian chín:** cả 3 cây — `readyAt = T + growthMs`; chưa chín tại `T` và `readyAt − 1`; chín tại `readyAt` và rất lâu sau; đồng hồ lùi trước `plantedAt` → chưa chín; `FarmState` có `plantedAt`/`readyAt` đúng.
- **Thu hoạch:** ô trống → `PLOT_EMPTY`; `readyAt − 1` → `CROP_NOT_READY`; đúng `readyAt` → ô trống, +1 nông sản, hạt không đổi; kết quả qua `isHarvestResponse`; thu hoạch lại cùng ô → `PLOT_EMPTY` (không nhân đôi); 1 năm sau vẫn 1 nông sản; carrot/tomato cho đúng `*_produce`; input không bị sửa.
- **Điều kiện nạp:** còn hạt → false; còn cây (kể cả đã chín) → false và `seedRefill` không eligible; 0 hạt + 0 cây → true bất kể nông sản.
- **Mốc chờ nạp:** thu hoạch cây cuối tại `H` → mốc `H + 60 000`, `seedRefill = { eligible: true, availableAt: H + 60 000 }`; còn cây khác hoặc còn hạt → mốc `null`; thu hoạch thất bại (`CROP_NOT_READY`, `PLOT_EMPTY`) không tạo/đổi mốc; nạp tại `H` và `H + 59 999` → `REFILL_NOT_ALLOWED`, mốc không đổi; nạp tại `H + 60 000` → 5 hạt mỗi loại, giữ nông sản, mốc `null`; không nạp hai lần; còn hạt hoặc còn cây → `REFILL_NOT_ALLOWED`; mốc `null` mà đủ điều kiện → nạp ngay, `availableAt = now` (P2-5).
- **Vòng lặp đầy đủ:** từ farm mới, trồng–thu hoạch hết 15 hạt (mốc luôn `null` trước lần thu hoạch cuối), mốc = lần thu hoạch cuối + 60 s, nạp bị từ chối ở `mốc − 1`, thành công đúng mốc, chỉ một lần.
- **Bất biến** (kiểm tra sau các kịch bản): đủ 6 ô, đủ 6 item, mọi số lượng nguyên ≥ 0, `toFarmState` luôn qua `isFarmState`.
- **`toFarmState`:** inventory theo thứ tự `ITEM_IDS`, bỏ số lượng 0 (P2-4); `serverTime = now`.
- **Đầu vào sai miền (P2-2):** `plotIndex` −1 / 6 / 1.5 / `NaN`; `cropId` lạ; `now` −1 / 1.5 / `NaN` / `Infinity` / `MAX_SAFE_INTEGER + 1` → `RangeError` ở mọi hàm liên quan.

---

## Files Changed

Mới (2):

- `server/src/farming/rules.ts`
- `server/src/farming/rules.test.ts`

Không đổi: `shared/`, `client/`, `server/src/app.ts`, `server/src/multiplayer/`, mọi `package.json`, `package-lock.json`, `.nvmrc`. Không cài package. `git diff --stat` (file tracked): không có thay đổi.

---

## Vấn đề còn tồn tại

1. **Chưa chống đồng thời/replay:** logic thuần không biết transaction hay `requestId`. Bước 1.3–1.5 phải đọc–áp dụng–ghi trong một transaction và kiểm tra `action_log` (A-3, A-5).
2. **Chưa dùng ở đâu:** chưa có route/DB gọi `rules.ts`; trạng thái `FarmData` có thể cần chỉnh nhỏ khi làm schema ở Bước 1.3. Repository ở Bước 1.3 nên ghi đủ 6 hàng `plots` và 6 hàng `inventory` (kể cả số lượng 0) khi tạo player, và không tự điền `0` cho item thiếu — để `assertFarmData` phát hiện dữ liệu hỏng thay vì che đi.
7. **`getReadyAt` / `now + 60 000` có thể vượt số nguyên an toàn** chỉ khi thời gian gần `Number.MAX_SAFE_INTEGER` (khoảng năm 285 000); không xảy ra với `Date.now()` thực tế. Chưa xử lý (đề xuất tùy chọn ở vòng review trước).
3. **Ép kiểu `harvested`:** dựa vào static data; nếu sau này cho `CropDefinition.produceItemId` kiểu `ProduceItemId` trong `shared` thì bỏ được ép kiểu (cần sửa `shared`, ngoài phạm vi bước này).
4. **Log cảnh báo P2-5** (đủ điều kiện nạp nhưng mốc `null`) thuộc lớp gọi ở Bước 1.5; `rules.ts` không log.
5. **Đồng hồ server lùi** có thể làm lệch thời gian chín/mốc nạp; chấp nhận cho MVP.
6. Lệch Node (Codespace 24.21, `.nvmrc` 22) vẫn còn; xử lý ở Bước 1.3.

---

## Git

- Chưa stage, chưa commit, chưa push. `main` đi trước `origin/main` 1 commit (`7afe6d9`).
- `git status --short` (ngoài `docs/`): `?? server/src/farming/` (2 file mới).
- `git diff --stat`: trống (không có file tracked thay đổi).
- Báo cáo này thuộc `docs/`, không đưa vào commit.
- Commit đề xuất (2 file): `feat: add server farming rules`

---

## Xác minh lại theo yêu cầu review của ChatGPT (2026-10-10)

Yêu cầu "thêm `assertFarmData` và test dữ liệu sai" đã được thực hiện ở Bản sửa 2; lần này **không sửa code**, chỉ đối chiếu và chạy lại kiểm tra.

| Yêu cầu | Trạng thái |
|---|---|
| Chỉ sửa `rules.ts`, `rules.test.ts` | Đạt — ngoài `docs/` chỉ có 2 file này (chưa track); không có file tracked thay đổi |
| `assertFarmData`: cấu trúc farm, 6 ô, `cropId`/`plantedAt`, đủ 6 item, số lượng nguyên an toàn ≥ 0, mốc refill | Đạt — `rules.ts` dòng 99; ném `RangeError`, không tự sửa dữ liệu |
| Gọi một lần ở đầu `plant`, `harvest`, `refillSeeds`, `toFarmState` | Đạt — dòng 197, 227, 261, 283; không kiểm tra lặp trong cùng lần gọi |
| Test dữ liệu sai: thiếu/thừa ô, `cropId` sai, thiếu item, số lượng âm/lẻ, `plantedAt` sai, mốc nạp sai | Đạt — có trong 29 trường hợp × 5 hàm |
| Test dữ liệu hợp lệ vẫn chạy | Đạt — test "accepts valid farms" và "keeps every result of the rules valid" |
| Không đổi gameplay, thứ tự lỗi, quy tắc nạp hạt, kiểu kết quả | Đạt — 95 test bản đầu vẫn pass không sửa |

Khác biệt nhỏ so với yêu cầu lần này: `assertFarmData` cũng được gọi ở `isSeedRefillEligible` (hàm công khai thứ 5 nhận `FarmData`), theo yêu cầu Bản sửa 2 trước đó. Không ảnh hưởng hành vi hợp lệ.

Kết quả chạy lại:

| Lệnh | Exit | Kết quả |
|---|---|---|
| `npm run typecheck` | 0 | Không lỗi |
| `npm test` | 0 | shared 218, server 244, client 44 — tổng 506 |
| `npm run build -w client` | 0 | Build thành công |
| `git diff --check` | 0 | Không lỗi |
