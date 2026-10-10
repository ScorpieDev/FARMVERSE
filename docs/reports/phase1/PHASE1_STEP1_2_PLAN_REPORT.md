# PHASE 1 — BƯỚC 1.2: KẾ HOẠCH LOGIC NÔNG TRẠI PHÍA SERVER

## Trạng thái

CHỜ DUYỆT — chỉ đọc và lập kế hoạch. Chưa sửa code, chưa cài package, chưa stage, chưa commit, chưa push.

Căn cứ: `docs/PHASE1_FARMING_PLAN_REPORT.md` (bản 1.6, mục 0 và bảng thứ tự triển khai: "1.2 — Quy tắc farming thuần phía server (thời gian truyền vào)"), `docs/PHASE1_STEP1_1_REPORT.md`, contract đã commit `7afe6d9 feat: add Phase 1 farming contract to shared`.

---

## 1. Hiện trạng

- `main` đi trước `origin/main` 1 commit (`7afe6d9`, chưa push). Chỉ có file `docs/` chưa track.
- `shared/` (đã commit):
  - `farming.ts`: `FARM_PLOT_COUNT = 6`, `STARTER_SEEDS_PER_CROP = 5`, `SEED_REFILL_PER_CROP = 5`, `SEED_REFILL_COOLDOWN_MS = 60_000`, `CROPS` (wheat 30 000 ms, carrot 120 000 ms, tomato 300 000 ms, yield 1), `ITEMS` (`*_seed`, `*_produce`), `isCropId`, `isItemId`, `isProduceItemId`, `isPlotIndex`, `getCrop`, `getItem`.
  - `api.ts`: `FarmState { serverTime, plots, inventory, seedRefill }`, `PlotState`, `PlantedCrop { cropId, plantedAt, readyAt }`, `InventoryEntry`, `SeedRefillState { eligible, availableAt }`, `HarvestedProduce`, `HarvestResponse`, request types, validator chỉ kiểm tra cấu trúc.
  - `errors.ts`: `PLOT_NOT_EMPTY`, `PLOT_EMPTY`, `CROP_NOT_READY`, `ITEM_NOT_OWNED`, `REFILL_NOT_ALLOWED` (và các mã khác).
- `server/`: chỉ có Phase 0 (`config.ts`, `app.ts`, `index.ts`, `multiplayer/`). Chưa có code farming, chưa dùng contract mới. `server/tsconfig.json` include `src`; import `@farmverse/shared/farming`, `@farmverse/shared/api`, `@farmverse/shared/errors` dùng được qua exports.

---

## 2. Phạm vi Bước 1.2

**Có:** một module **logic thuần** phía server, không I/O:

- Trồng cây, xác định cây chín theo thời gian, thu hoạch, cập nhật tồn kho, điều kiện và thực hiện nhận lại hạt.
- Tạo farm khởi đầu cho player mới.
- Chuyển trạng thái nội bộ thành `FarmState` của contract.
- **Thời gian (`now`) được truyền vào** từ nơi gọi; ở các bước sau nơi gọi luôn là đồng hồ server (`Date.now()` phía server). Module không đọc đồng hồ, không nhận thời gian từ client.

**Không có (để bước sau):**

| Nội dung | Bước |
|---|---|
| Database, schema, transaction, `DATABASE_PATH`, đổi Node | 1.3 |
| Player/session, token, `UNAUTHORIZED` | 1.4 |
| HTTP routes, `requestId`/`action_log`, idempotency, `REQUEST_ID_REUSED`, request đồng thời, A-6 (`INVALID_REQUEST` cho JSON hỏng), bảng lỗi → HTTP (B-1) | 1.4–1.5 |
| Logging §19 cho từng hành động | 1.5 |
| `client/` | 1.6–1.7 |

Không sửa `shared/` (contract giữ nguyên như `7afe6d9`), `client/`, `server/src/app.ts`, `server/src/multiplayer/*`. Không cài package.

---

## 3. File dự kiến

| File | Loại | Nội dung |
|---|---|---|
| `server/src/farming/rules.ts` | Mới | Kiểu trạng thái nội bộ + các hàm thuần (mục 4) |
| `server/src/farming/rules.test.ts` | Mới | Unit test (mục 6) |

Chỉ 2 file. Không đăng ký route, không sửa `app.ts`.

---

## 4. Thiết kế

### 4.1 Trạng thái nội bộ (chỉ ở server)

```ts
interface FarmPlot {            // một ô có cây
  cropId: CropId;
  plantedAt: number;            // ms, đồng hồ server
}

interface FarmData {
  plots: ReadonlyArray<FarmPlot | null>;          // đúng FARM_PLOT_COUNT phần tử
  inventory: Readonly<Record<ItemId, number>>;    // đủ 6 item, số nguyên ≥ 0
  seedRefillAvailableAt: number | null;           // ms, đồng hồ server
}
```

- Không lưu "Ready": chín hay chưa tính từ `plantedAt + growthMs` so với `now`.
- `seedRefillAvailableAt` tương ứng cột `players.seed_refill_available_at` sẽ có ở Bước 1.3.
- Hình dạng này gần với schema đề xuất (`plots`, `inventory`, cột mốc nạp hạt) để Bước 1.3 chỉ cần đọc/ghi.

### 4.2 Hàm

Mọi hàm **không sửa input** (trả về `FarmData` mới) — để Bước 1.3–1.5 chỉ ghi DB khi kết quả thành công.

```ts
type RuleError = "PLOT_NOT_EMPTY" | "PLOT_EMPTY" | "CROP_NOT_READY" | "ITEM_NOT_OWNED" | "REFILL_NOT_ALLOWED";
type RuleResult<T> = ({ ok: true; farm: FarmData } & T) | { ok: false; error: RuleError };

createStarterFarm(): FarmData
getReadyAt(plot: FarmPlot): number                       // plantedAt + growthMs
isCropReady(plot: FarmPlot, now: number): boolean        // now >= readyAt
isSeedRefillEligible(farm: FarmData): boolean
plant(farm, plotIndex, cropId, now): RuleResult<{}>
harvest(farm, plotIndex, now): RuleResult<{ harvested: HarvestedProduce }>
refillSeeds(farm, now): RuleResult<{}>
toFarmState(farm, now): FarmState                        // contract của shared
```

`RuleError` dùng đúng các giá trị có sẵn trong `ErrorCode` của `shared/src/errors.ts` (không thêm mã mới).

---

## 5. Quy tắc gameplay

| Hàm | Kiểm tra (theo thứ tự) | Kết quả thành công | Lỗi |
|---|---|---|---|
| `createStarterFarm` | — | 6 ô trống; 5 hạt mỗi loại; 0 nông sản; `seedRefillAvailableAt = null` | — |
| `plant` | 1. Ô trống → nếu không: lỗi. 2. Còn ≥ 1 hạt của cây đó → nếu không: lỗi | Trừ 1 hạt `<crop>_seed`; ô = `{ cropId, plantedAt: now }`; `seedRefillAvailableAt` không đổi | `PLOT_NOT_EMPTY`; `ITEM_NOT_OWNED` |
| `harvest` | 1. Ô có cây → nếu không: lỗi. 2. `now >= plantedAt + growthMs` → nếu không: lỗi | Ô trống; cộng `harvestYield` (= 1) `<crop>_produce`; nếu **sau khi thu hoạch** farm đủ điều kiện nạp hạt → `seedRefillAvailableAt = now + 60 000` | `PLOT_EMPTY`; `CROP_NOT_READY` |
| `refillSeeds` | 1. Đủ điều kiện (cả 3 loại hạt = 0 **và** không ô nào có cây) → nếu không: lỗi. 2. `now >= seedRefillAvailableAt` → nếu không: lỗi | Cộng 5 hạt mỗi loại; `seedRefillAvailableAt = null`; nông sản không đổi | `REFILL_NOT_ALLOWED` (cả hai trường hợp, theo P-3) |
| `toFarmState` | — | `serverTime = now`; 6 `PlotState` theo thứ tự, `crop.readyAt = plantedAt + growthMs`; inventory chỉ item có số lượng > 0, theo thứ tự `ITEM_IDS`; `seedRefill`: đủ điều kiện → `{ eligible: true, availableAt: seedRefillAvailableAt ?? now }`, không → `{ eligible: false, availableAt: null }` | — |

Chi tiết và lý do:

1. **Server là nguồn quyết định cuối cùng.** Hàm chỉ nhận `cropId`, `plotIndex` (ý định của người chơi) và `now` (đồng hồ server). Không nhận thời gian, số lượng, trạng thái Ready hay `availableAt` từ client.
2. **Chín đúng mốc:** `now === readyAt` là chín (`>=`), `now === readyAt − 1` là chưa chín.
3. **Thứ tự kiểm tra trồng:** ô trước, hạt sau (ô có cây và không có hạt → `PLOT_NOT_EMPTY`). Cần xác nhận (P2-3).
4. **Mốc chờ nạp hạt chỉ đặt khi thu hoạch thành công** làm điều kiện trở thành đúng (quyết định đã ghi ở kế hoạch Phase 1 mục 0.3). Thu hoạch thất bại (`PLOT_EMPTY`, `CROP_NOT_READY`) trả lỗi và **không có farm mới** → không thể đặt/đổi mốc. `plant` không bao giờ đặt mốc. `refillSeeds` thất bại không gia hạn hay đặt lại mốc.
5. **Nạp hạt khi đủ điều kiện nhưng `seedRefillAvailableAt = null`** (dữ liệu không mong đợi, ví dụ dữ liệu cũ): coi như nhận được ngay (theo kế hoạch Phase 1 mục 0.3). Việc ghi log cảnh báo thuộc lớp gọi (Bước 1.5); Bước 1.2 chỉ trả kết quả. `toFarmState` khi đó trả `availableAt = now` để thỏa contract (`eligible` → `availableAt` khác null).
6. **Không thể tích hạt hay số âm:** nạp chỉ khi tổng hạt = 0; trồng chỉ khi số hạt ≥ 1; mọi số lượng là số nguyên ≥ 0.
7. **Đầu vào sai miền** (`plotIndex` ngoài 0..5, `cropId` lạ, `now` không phải số nguyên ≥ 0): đã được chặn bởi validator `shared` ở lớp HTTP (Bước 1.5). Trong `rules.ts` coi là lỗi lập trình → **ném `RangeError`**, không trả mã lỗi gameplay. Cần xác nhận (P2-2).

---

## 6. Test dự kiến — `server/src/farming/rules.test.ts`

Dùng thời gian cố định (ví dụ `T = 1_700_000_000_000`), không dùng đồng hồ thật, không fake timer.

**Farm khởi đầu**

- 6 ô `null`; mỗi `*_seed` = 5; mỗi `*_produce` = 0; `seedRefillAvailableAt = null`.
- `toFarmState`: 6 ô `crop: null`, inventory 3 mục hạt, `seedRefill = { eligible: false, availableAt: null }`, kết quả qua được `isFarmState` của `shared`.

**Trồng**

- Trồng wheat ô 0 → hạt wheat 4, ô 0 `{ wheat, plantedAt: T }`, các ô khác không đổi, input không bị sửa.
- Trồng vào ô có cây đang lớn / đã chín → `PLOT_NOT_EMPTY`, không đổi gì.
- Hết hạt loại đó (còn hạt loại khác) → `ITEM_NOT_OWNED`.
- Ô có cây và hết hạt → `PLOT_NOT_EMPTY` (thứ tự kiểm tra, P2-3).
- Trồng đủ 6 ô; trồng hết 5 hạt một loại rồi lần thứ 6 → `ITEM_NOT_OWNED`.

**Thời gian chín**

- Mỗi cây: `readyAt = T + growthMs` (30 000 / 120 000 / 300 000).
- `isCropReady` tại `readyAt − 1` → false; tại `readyAt` → true; sau đó → true (không héo).
- `now` trước `plantedAt` (đồng hồ lùi) → chưa chín.

**Thu hoạch**

- Ô trống → `PLOT_EMPTY`.
- Chưa chín (`readyAt − 1`) → `CROP_NOT_READY`, không đổi gì.
- Đúng `readyAt` → ô trống, `<crop>_produce` +1, hạt không đổi, `harvested = { itemId: "<crop>_produce", quantity: 1 }` (qua được `isHarvestResponse` khi ghép với `toFarmState`).
- Thu hoạch cùng ô lần hai (dùng farm sau lần một) → `PLOT_EMPTY` (không nhân đôi).
- Thu hoạch rất lâu sau khi chín → vẫn thành công, sản lượng 1.

**Nhận lại hạt — mốc chờ**

- Còn hạt hoặc còn cây → `isSeedRefillEligible` false; `refillSeeds` → `REFILL_NOT_ALLOWED`.
- Kịch bản đầy đủ: trồng hết 15 hạt (6 ô một lượt, thu hoạch, trồng tiếp…), thu hoạch cây cuối tại `H` → `seedRefillAvailableAt = H + 60 000`; `toFarmState` → `{ eligible: true, availableAt: H + 60 000 }`.
- Thu hoạch **không phải cây cuối** (còn cây khác hoặc còn hạt) → mốc vẫn `null`.
- Còn cây đã chín chưa thu hoạch + 0 hạt → không đủ điều kiện, mốc `null`.
- `refillSeeds` tại `H + 59 999` → `REFILL_NOT_ALLOWED`, mốc **không đổi** (không gia hạn).
- `refillSeeds` tại `H + 60 000` → 5 hạt mỗi loại, nông sản giữ nguyên, mốc `null`.
- Gọi `refillSeeds` lần hai trên farm vừa nạp → `REFILL_NOT_ALLOWED` (không nạp hai lần).
- Thu hoạch thất bại (`PLOT_EMPTY`, `CROP_NOT_READY`) khi farm đang chờ hoặc sắp đủ điều kiện → không tạo/đổi mốc.
- Đủ điều kiện nhưng mốc `null` (dữ liệu không mong đợi) → `refillSeeds` thành công ngay; `toFarmState` trả `availableAt = now`.

**Bất biến (kiểm tra sau mỗi kịch bản)**

- Mọi số lượng là số nguyên ≥ 0; đủ 6 ô; input không bị sửa.
- `toFarmState(...)` luôn qua `isFarmState`; kết quả thu hoạch luôn qua `isHarvestResponse`.
- Tổng hạt sau nạp đúng 15; không có cách tăng hạt ngoài nạp.

**Đầu vào sai miền (P2-2)**

- `plotIndex` −1 / 6 / 1.5 → `RangeError`; `now` âm hoặc không nguyên → `RangeError`.

---

## 7. Lệnh kiểm thử và tiêu chí nghiệm thu

```
npm run typecheck
npm test                      # shared 218, server 46 + test mới, client 44
npm test -w server            # chạy lại nhiều lần
npm run build -w client
git diff --check
```

- Mọi lệnh exit 0; test cũ không đổi và vẫn pass; test mới pass ổn định.
- Chỉ 2 file mới trong `server/src/farming/`; không sửa `shared/`, `client/`, `server/src/app.ts`, `server/src/multiplayer/*`, `package.json`, lockfile, `.nvmrc`.
- `rules.ts` không import `node:*`, không đọc `Date.now()`, không I/O.
- Báo cáo `docs/PHASE1_STEP1_2_REPORT.md`; chỉ commit khi được phép.

---

## 8. Rủi ro

1. **Thiết kế trạng thái nội bộ có thể phải chỉnh ở Bước 1.3** khi chọn schema/thư viện SQLite — giảm bằng cách giữ hình dạng gần schema đề xuất.
2. **Logic thuần chưa chống đồng thời/replay:** hai request đọc cùng farm có thể cùng thành công nếu lớp trên không dùng transaction. Bước 1.3–1.5 bắt buộc đọc–áp dụng–ghi trong một transaction và kiểm tra `requestId` (A-3, A-5).
3. **Đồng hồ server lùi** (đổi giờ hệ thống) có thể làm cây "chưa chín" lâu hơn hoặc mốc nạp lệch; chấp nhận cho MVP.
4. **Contract `shared` có thể cần chỉnh nhỏ** khi nối với HTTP (1.5); Bước 1.2 không sửa `shared`.

---

## 9. Quyết định cần Game Director duyệt

| # | Nội dung | Đề xuất | Lý do |
|---|---|---|---|
| P2-1 | Phạm vi Bước 1.2 | Chỉ logic thuần + test trong `server/src/farming/rules.ts`; không DB, không route | Khớp thứ tự đã duyệt (1.2 trước 1.3–1.5); test nhanh, chính xác theo thời gian |
| P2-2 | Đầu vào sai miền trong `rules.ts` | Ném `RangeError` (lỗi lập trình); lỗi cho người chơi là `INVALID_REQUEST` ở lớp HTTP (1.5) | Validator `shared` đã chặn trước; tránh trộn lỗi gameplay với lỗi định dạng |
| P2-3 | Thứ tự kiểm tra khi trồng | Ô trước, hạt sau (`PLOT_NOT_EMPTY` ưu tiên hơn `ITEM_NOT_OWNED`) | Thông báo về ô người chơi vừa chạm rõ ràng hơn |
| P2-4 | Thứ tự inventory trong `FarmState` | Theo `ITEM_IDS` (hạt trước, nông sản sau), bỏ mục số lượng 0 | Ổn định, dễ test, khớp contract |
| P2-5 | Đủ điều kiện nạp nhưng mốc `null` | Cho nạp ngay; `toFarmState` trả `availableAt = now`; log cảnh báo ở Bước 1.5 | Đã ghi trong kế hoạch Phase 1 mục 0.3 |
| P2-6 | Kiểu trả về khi thành công | `{ ok: true, farm, ... }` / `{ ok: false, error }` — không ném lỗi cho trường hợp gameplay | Lớp gọi dễ map sang HTTP 409 và rollback |

Bước 1.2 **chưa bắt đầu**. Chờ Game Director và ChatGPT duyệt.
