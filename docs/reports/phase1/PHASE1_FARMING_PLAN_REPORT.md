# PHASE 1 — FARMING: KẾ HOẠCH VÀ THIẾT KẾ (BƯỚC 1.0)

## Version

1.6 — Thiết kế cho triển khai an toàn (2026-10-10): nhận lại hạt theo thời gian chờ, so sánh `node:sqlite`/`better-sqlite3`, danh sách quyết định, kế hoạch Bước 1.1 (mục 0).

Lịch sử: 1.0 rà soát ban đầu → 1.1 Bước 1.0 chốt thiết kế → 1.2 xác nhận Q1–Q8 + kế hoạch chi tiết Bước 1.1 → 1.3 duyệt A-1…A-7 → 1.4 duyệt bộ quyết định cuối (A/B/C/D của Game Director) → 1.5 rà soát lại → 1.6 thiết kế cho triển khai an toàn (mục 0).

## Trạng thái

CHỜ CHATGPT RÀ SOÁT — Game Director giữ nhận lại hạt theo thời gian chờ và ưu tiên database ổn định, tương thích Node đang pin; chưa cho phép sửa code. Xem mục 0. Chưa sửa code, chưa thêm package, chưa đổi runtime, chưa stage, chưa commit, chưa push. Bước 1.1 **chưa bắt đầu**.

`main` đồng bộ `origin/main` tại `7817ac7`. Các file `docs/PHASE0_*.md` chưa track được giữ nguyên.

---

## 0. Bản 1.6 — Thiết kế cho triển khai an toàn (2026-10-10)

**Mục 0 là nguồn chính thức của kế hoạch.** Các mục 1–13 bên dưới là lịch sử thiết kế (bản 1.0–1.4); khi khác với mục 0 thì theo mục 0.

Trạng thái: CHỜ CHATGPT RÀ SOÁT. Game Director đồng ý hướng an toàn nhưng **chưa cho phép sửa code Bước 1.1**. Chưa sửa code, chưa thêm package, chưa đổi `.nvmrc`/`engines`, chưa stage, chưa commit, chưa push.

### 0.1 Trạng thái Git khi rà soát

- `main` đồng bộ `origin/main` tại `7817ac7 docs: update Phase 0 push status`.
- Không có file tracked thay đổi; không có file được stage.
- Chưa track: `docs/PHASE1_FARMING_PLAN_REPORT.md` và 13 file `docs/PHASE0_*.md` (giữ nguyên, không đưa vào commit).

### 0.2 Phase 0 — bằng chứng, chưa xác minh, chờ duyệt

Đã kiểm tra lại lúc rà soát: `npm run typecheck` exit 0; `npm test`: shared 60/60, server 46/46, client 44/44 (150). Không có thay đổi code nào kể từ `5924c4f`.

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Monorepo, TypeScript strict, Vitest | Đã hoàn thành, có test | Code + 150 test |
| Shared contract (protocol v1, health, error codes, validator) | Đã hoàn thành, có test | `shared/src/*` + 60 test |
| Server: `/api/health`, config, `/ws` (Origin, 4096 byte, 4000, 1001), shutdown | Đã hoàn thành, có test | `server/src/*` + 46 test |
| Client: Phaser scene, `ServerConnection` (RTT, reconnect 5 lần, offline/retry) | Đã hoàn thành, có test logic | `client/src/*` + 44 test |
| Kết nối thật qua trình duyệt Codespaces | Đã kiểm thử thủ công | Game Director báo: `Connected`, RTT 223 ms, Offline → bật lại server → `Connected`; log server |
| README, dev scripts | Đã hoàn thành | Lệnh README chạy thử bằng script (không qua cổng Codespaces) |
| Android | **Chưa xác minh** (hoãn theo quyết định) | — |
| Xoay dọc/ngang sau Bước 8 | **Chưa xác minh** | — |
| Thao tác dẫn tới kết nối lại từ Offline (chạm hay tự động) | **Chưa xác minh** | — |
| `vite preview`, HMR qua Codespaces | **Chưa xác minh** | — |
| Cơ chế Codespaces viết lại Origin | **Suy luận**, chưa đối chiếu tài liệu chính thức | Log server |
| Logging đầy đủ §19, request ID §12 | **Chưa có** (không thuộc phạm vi Phase 0) | — |
| Review tổng thể Phase 0 | **Chờ Game Director xác nhận** | Tài liệu ghi "pending" |

Rủi ro còn tồn tại từ Phase 0: dev bundle Phaser ~20 MB; `CLIENT_ORIGIN` trên Codespaces dựa trên quan sát; client không phân biệt WebSocket bị 403 với server tắt; `docs/PHASE0_PLAN.md` (chưa track) vẫn ghi "chưa push" cho Bước 1–8 (đã cũ).

**Phase 0 chưa được tuyên bố là đã duyệt** — chờ Game Director.

### 0.3 Nhận lại hạt theo thời gian chờ (Game Director giữ phương án này)

Thay thế quy tắc "nhận lại ngay" của bản 1.4 (Q5, A-1 phần thời điểm). Phần điều kiện "hết hạt và không còn cây" giữ nguyên.

**Đề xuất cụ thể (chờ duyệt):**

| Mục | Đề xuất |
|---|---|
| Điều kiện đủ (eligible) | Tổng số lượng của **cả 3 loại hạt = 0** **và** **không còn cây nào trên farm** (kể cả cây đã chín chưa thu hoạch) |
| Thời gian chờ | **60 giây** (`SEED_REFILL_COOLDOWN_MS = 60_000`) — giá trị thử nghiệm, cùng tinh thần với thời gian cây 30/120/300 giây; cân bằng lại sau |
| Mốc bắt đầu chờ | Thời điểm **server** xử lý giao dịch thu hoạch làm điều kiện trở thành đúng (thu hoạch cây cuối cùng khi không còn hạt). Server lưu `seed_refill_available_at = thời điểm đó + 60 000 ms` trong **cùng transaction** thu hoạch |
| Lượng nhận | Đúng 5 hạt mỗi loại (`SEED_REFILL_PER_CROP = 5`) |
| Sau khi nhận | Xóa `seed_refill_available_at` (NULL) trong cùng transaction nhận hạt |
| Nguồn thời gian | Chỉ đồng hồ server (`Date.now()` phía server). Client không gửi thời gian; `availableAt` trong response chỉ để hiển thị đếm ngược |

Vì sao mốc là lúc thu hoạch: điều kiện chỉ có thể trở thành đúng qua một lần thu hoạch (player mới có hạt; trồng làm có cây; nhận hạt làm có hạt). Lưu mốc ngay trong transaction đó giúp server không cần quét định kỳ và không phụ thuộc lúc client tải farm. Nếu dữ liệu có trạng thái eligible nhưng `seed_refill_available_at` NULL (không mong đợi), server coi như nhận được ngay và ghi log cảnh báo.

**Error code:**

| Code | HTTP (định hướng) | Khi nào |
|---|---|---|
| `REFILL_NOT_ALLOWED` | 409 | Chưa đủ điều kiện (còn hạt hoặc còn cây) |
| `REFILL_COOLDOWN` | 409 | Đủ điều kiện nhưng `serverTime < seed_refill_available_at` |

Hai mã riêng để client hiển thị đúng thông báo; client vẫn đọc `seedRefill.availableAt` để đếm ngược.

**Vì sao không thể lạm dụng để tạo hạt vô hạn:**

1. Chỉ nhận được khi **tổng hạt = 0 và không có cây** → không thể tích hạt: mỗi lần nhận đưa kho từ 0 lên đúng 15 hạt; điều kiện chỉ đúng lại sau khi cả 15 hạt đã được trồng và thu hoạch hết.
2. Mỗi chu kỳ tối thiểu tốn thời gian sinh trưởng (≥ 30 giây/cây, cây chậm nhất 300 giây) **cộng** 60 giây chờ → tốc độ nhận hạt bị chặn trên, không phụ thuộc số lần bấm.
3. **Replay:** cùng `requestId` sau khi thành công chỉ trả kết quả đã lưu, không cấp lần hai.
4. **Đồng thời** (nhiều tab, nhiều request khác `requestId`): transaction phía server xử lý tuần tự; request đầu cấp hạt và xóa mốc, request sau thấy kho đã có hạt → `REFILL_NOT_ALLOWED`.
5. **Đổi giờ máy client** không có tác dụng vì chỉ dùng thời gian server.
6. **Tạo nhiều guest player** (mỗi player mới có 15 hạt): không giới hạn trong Phase 1, nhưng tài nguyên không chuyển được giữa player (chưa có trading/marketplace) và nông sản chưa có giá trị (chưa có Coin) → không có lợi ích khai thác. Phải xử lý (rate limit tạo session, đăng nhập thật) trước Phase 6.
7. Nông sản tích lũy không giới hạn nhưng không đổi được thành hạt hay Coin trong Phase 1.

Ảnh hưởng lưu trữ (Bước 1.3): thêm cột `players.seed_refill_available_at INTEGER NULL` (ms server).

### 0.4 Database — so sánh `node:sqlite` và `better-sqlite3`

Ưu tiên của Game Director: ổn định, tương thích Node đang pin, dễ vận hành trên Codespaces. Node đang pin: `.nvmrc` = `22`, `engines.node` = `>=22.12.0`. **Không đổi trong bước này.**

| Tiêu chí | `node:sqlite` (built-in) | `better-sqlite3` 13.0.3 |
|---|---|---|
| Node đang pin (22, `>=22.12.0`) | Cần **≥ 22.13.0** mới không phải bật cờ → phải nâng `engines`; trên 22.12 cần `--experimental-sqlite` | `engines.node >=22` → **khớp** cấu hình đang pin, không cần đổi |
| Độ ổn định API | Node 22: **1.1 Active development** (in `ExperimentalWarning` — đã chạy thử trên 22.23.2). Node 24: **1.2 Release candidate** từ 24.15.0. **Chưa Stable** ở bản nào | Thư viện lâu năm, API ổn định qua nhiều phiên bản major; dùng rộng rãi |
| Hỗ trợ dài hạn | Gắn với Node: Node 22 hết hỗ trợ **2027-04-30**; Node 24 tới **2028-04-30** (theo lịch `nodejs/Release`) | Package độc lập, cập nhật gần nhất 2026-08; vẫn phụ thuộc Node ≥ 22 |
| Dependency | Không thêm | Thêm 1 package + `node-addon-api` |
| Package native | Không | **Có**: file `.node` biên dịch sẵn |
| Prebuild trong gói (đã kiểm tra bằng `npm pack --dry-run`, chưa cài) | — | Có sẵn `prebuilds/linux-x64.node`, `linuxmusl-x64`, `linux-arm64`, `darwin-*`, `win32-*`; dùng Node-API nên không phụ thuộc phiên bản ABI của Node 22/24 |
| Rủi ro cài đặt | Không | Gói vẫn có `binding.gyp`, chưa có script `install` trong metadata. **Chưa xác minh** npm 11 có tự chạy `node-gyp rebuild` (cần python/make/g++) hay chính sách install-scripts của npm có chặn; cần cài thử trong thư mục tạm trước khi duyệt |
| Vận hành trên Codespaces | Có sẵn | Dự kiến dùng prebuild `linux-x64`; cần xác minh bằng cài thử |
| Transaction | Đồng bộ (`DatabaseSync`), `BEGIN IMMEDIATE`/`COMMIT` thủ công | Đồng bộ, có helper `db.transaction(fn)` (tự rollback khi lỗi) |
| Chuyển sang PostgreSQL sau này | Như nhau — cô lập trong `server/src/storage/`, SQL đơn giản | Như nhau |

**Đề xuất (chờ duyệt): `better-sqlite3` trên Node 22 đang pin**, vì là phương án duy nhất vừa có API ổn định vừa không phải đổi Node. Điều kiện trước khi duyệt thêm dependency (ở Bước 1.3): cài thử trong thư mục tạm trên Codespace, xác nhận dùng prebuild `linux-x64` không cần biên dịch, không vướng chính sách install-scripts, và test chạy trên cả Node 22 (pin) lẫn Node 24 (Codespace).

Ghi chú Node: Node 22 hết hỗ trợ 2027-04-30; nâng lên Node 24 là **quyết định riêng**, nên lên kế hoạch trước mốc đó, độc lập với việc chọn database. Codespace hiện chạy Node 24.21 trong khi repo pin 22 — sai khác này đã có từ Phase 0; test Bước 1.1 sẽ chạy trên Node đang có trong Codespace, và nếu được duyệt sẽ chạy thêm bằng Node 22.23.2 (đã cài sẵn qua nvm) để khớp bản pin.

### 0.5 Quyết định

**Đã thống nhất:**

| # | Nội dung |
|---|---|
| Q2 | Guest player do server tạo (UUID); token ngẫu nhiên 32 byte; server chỉ lưu SHA-256; token mất/không hợp lệ → không tự tạo farm, hiện `Start a new farm` và chờ người chơi xác nhận; mất token có thể mất farm (giới hạn MVP) |
| Q3 | HTTP cho session, tải farm, trồng, thu hoạch, nhận lại hạt; WebSocket protocol v1 giữ nguyên |
| Q4 | Phase 1 chỉ có hạt giống và nông sản; chưa Coin, XP, Level, shop; khác biệt với `GAME_DESIGN.md` §19 sẽ xử lý có chủ đích sau |
| Q5 (phần đã chốt) | Ban đầu 5 hạt mỗi loại; nhận lại khi hết cả 3 loại hạt và không còn cây; nhận **theo thời gian chờ** |
| Q6 | 6 ô; wheat 30 s, carrot 120 s, tomato 300 s; 1 nông sản mỗi lần; thời gian do server; không héo |
| Q7 | Chưa có tưới nước, phân bón, chăm sóc |
| Q8 | Phaser hình khối, chữ tiếng Anh, nút hạt lớn dễ chạm, inventory và tiến độ cây; chưa tuyên bố hỗ trợ Android |
| A-2, A-3 | `requestId` UUID v4 (chữ thường), server kiểm tra; cùng `requestId` + hành động + body → kết quả đã lưu; khác → `REQUEST_ID_REUSED`, không ghi đè |
| A-4 | Item id `*_seed`, `*_produce` |
| A-5 | Mọi thay đổi farm/inventory trong transaction server; không nhân đôi khi retry/đồng thời |
| A-6 | JSON sai/request không hợp lệ → `INVALID_REQUEST` 400, có test (đổi hành vi Phase 0, sửa test cũ khi làm) |
| A-7 | Client chỉ dùng `crypto.randomUUID()`; không có thì khóa thao tác + lỗi tiếng Anh; không dùng `Math.random()` |
| B | Validator `shared` chỉ kiểm tra cấu trúc/kiểu; server kiểm tra ownership, gameplay, dữ liệu; không tin thời gian/số lượng/player ID/Ready từ client; request thất bại không lưu như giao dịch thành công |
| C | Không thêm bảng lỗi → HTTP ở Bước 1.1 (quyết định trước 1.4–1.5); không đổi Node ở Bước 1.1 |

**Còn chờ duyệt:**

| # | Nội dung | Đề xuất | Chặn bước |
|---|---|---|---|
| P-1 | Thời gian chờ nhận lại hạt | 60 giây | **1.1** (hằng số trong `shared`) |
| P-2 | Mốc tính thời gian chờ | Lúc server xử lý thu hoạch làm điều kiện thành đúng; lưu `seed_refill_available_at` | 1.2–1.3 (không ảnh hưởng contract 1.1) |
| P-3 | Error code nhận lại hạt | `REFILL_NOT_ALLOWED` + `REFILL_COOLDOWN` | **1.1** |
| P-4 | Database | `better-sqlite3` trên Node 22 đang pin, sau khi cài thử | 1.3 |
| P-5 | Kế hoạch nâng Node 24 (Node 22 hết hỗ trợ 2027-04-30) | Quyết định riêng, trước 2027-04 | Không chặn Phase 1 |
| E-1 | Request thất bại không ghi `action_log`; retry cùng `requestId` được đánh giá lại | Giữ (bản 1.4) | 1.5 |
| B-1 | Bảng `ErrorCode` → HTTP status | Quyết định trước 1.4–1.5 | 1.4 |
| E-2 | Văn bản tiếng Anh cho token không hợp lệ, lỗi request ID, cooldown | Chốt khi làm client | 1.6–1.7 |
| D-1 | Cập nhật tài liệu gốc (GAME_DESIGN §19, Roadmap "Basic rewards"/"Soil", GAME_RULES quy tắc nhận lại hạt) | Bước riêng, có chủ đích | Không chặn |
| D-2 | Review tổng thể Phase 0 | Game Director | — |

**Rủi ro chưa giải quyết:**

1. `better-sqlite3` chưa cài thử: có thể cần build tools hoặc bị chính sách install-scripts chặn.
2. Nếu chọn `node:sqlite`: API chưa Stable, phải nâng `engines` (≥ 22.13) hoặc Node 24.
3. Node 22 hết hỗ trợ 2027-04-30; Codespace chạy Node 24 khác bản pin 22.
4. Mất token = mất farm; không có khôi phục trong Phase 1.
5. Không giới hạn tạo guest player (chấp nhận cho dev; xử lý trước khi deploy công khai/Phase 6).
6. Không có backup DB; file DB mất khi xóa Codespace.
7. A-6 đổi hành vi HTTP của Phase 0 và sửa một test cũ.
8. Contract `shared` có thể cần chỉnh khi làm server/client.
9. Dev bundle Phaser ~20 MB khi thử trên điện thoại; Android chưa kiểm thử.

### 0.6 Kế hoạch Bước 1.1 — chỉ `shared/` (bản 1.6)

Không sửa `shared/src/protocol.ts`, `PROTOCOL_VERSION`, `WS_PATH`; không sửa server, client, root `package.json`, lockfile, `.nvmrc`; không thêm dependency; không thêm bảng lỗi → HTTP.

**Kiểu dữ liệu và hằng số — `shared/src/farming.ts` (mới):**

```ts
export const FARM_PLOT_COUNT = 6;
export const STARTER_SEEDS_PER_CROP = 5;
export const SEED_REFILL_PER_CROP = 5;
export const SEED_REFILL_COOLDOWN_MS = 60_000;   // P-1, chờ duyệt

export const CROP_IDS = ["wheat", "carrot", "tomato"] as const;
export type CropId = (typeof CROP_IDS)[number];
export const ITEM_IDS = [
  "wheat_seed", "carrot_seed", "tomato_seed",
  "wheat_produce", "carrot_produce", "tomato_produce",
] as const;
export type ItemId = (typeof ITEM_IDS)[number];
export type ItemKind = "seed" | "produce";

export interface ItemDefinition { id: ItemId; name: string; kind: ItemKind }
export interface CropDefinition {
  id: CropId; name: string;
  seedItemId: ItemId; produceItemId: ItemId;
  growthMs: number;      // 30_000 | 120_000 | 300_000
  harvestYield: number;  // 1
}
export const ITEMS: readonly ItemDefinition[];
export const CROPS: readonly CropDefinition[];
export function isCropId(value: unknown): value is CropId;
export function isItemId(value: unknown): value is ItemId;
export function isPlotIndex(value: unknown): value is number;   // số nguyên 0..5
export function getCrop(id: CropId): CropDefinition;
export function getItem(id: ItemId): ItemDefinition;
```

**API contract — `shared/src/api.ts` (thêm, không đổi phần health):**

```ts
export const SESSION_PATH = "/api/session";
export const FARM_PATH = "/api/farm";
export const FARM_PLANT_PATH = "/api/farm/plant";
export const FARM_HARVEST_PATH = "/api/farm/harvest";
export const FARM_REFILL_SEEDS_PATH = "/api/farm/refill-seeds";

export interface SessionResponse { playerId: string; token: string }
export interface PlantedCrop { cropId: CropId; plantedAt: number; readyAt: number }
export interface PlotState { index: number; crop: PlantedCrop | null }
export interface InventoryEntry { itemId: ItemId; quantity: number }
export interface SeedRefillState {
  eligible: boolean;           // hết cả 3 loại hạt và không còn cây (server tính)
  availableAt: number | null;  // ms server; null khi !eligible
}
export interface FarmState {
  serverTime: number;
  plots: PlotState[];
  inventory: InventoryEntry[];
  seedRefill: SeedRefillState;
}
export interface HarvestResponse extends FarmState { harvested: InventoryEntry }
export interface PlantRequest { requestId: string; plotIndex: number; cropId: CropId }
export interface HarvestRequest { requestId: string; plotIndex: number }
export interface RefillSeedsRequest { requestId: string }

export function isRequestId(value: unknown): value is string;
export function isSessionResponse(value: unknown): value is SessionResponse;
export function isSeedRefillState(value: unknown): value is SeedRefillState;
export function isFarmState(value: unknown): value is FarmState;
export function isHarvestResponse(value: unknown): value is HarvestResponse;
export function isPlantRequest(value: unknown): value is PlantRequest;
export function isHarvestRequest(value: unknown): value is HarvestRequest;
export function isRefillSeedsRequest(value: unknown): value is RefillSeedsRequest;
```

**Error code — `shared/src/errors.ts` (thêm 9 mã, giữ 4 mã cũ):** `INVALID_REQUEST`, `UNAUTHORIZED`, `PLOT_NOT_EMPTY`, `PLOT_EMPTY`, `CROP_NOT_READY`, `ITEM_NOT_OWNED`, `REFILL_NOT_ALLOWED`, `REFILL_COOLDOWN` (P-3), `REQUEST_ID_REUSED`. Không thêm bảng ánh xạ HTTP.

**Quy tắc validator (chỉ cấu trúc và kiểu):**

| Validator | Hợp lệ khi |
|---|---|
| `isRequestId` | `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/` (UUID v4, chữ thường) |
| `isPlotIndex` | Số nguyên 0 ≤ n < 6 |
| `isCropId`, `isItemId` | Thuộc danh sách, phân biệt hoa thường |
| `isPlantRequest` / `isHarvestRequest` / `isRefillSeedsRequest` | Object (không null/mảng), đủ trường hợp lệ; trường thừa bỏ qua |
| `isSessionResponse` | `playerId` UUID v4 chữ thường; `token` base64url đúng 43 ký tự |
| `isSeedRefillState` | `eligible` boolean; nếu `eligible` thì `availableAt` số nguyên ≥ 0; nếu không thì `availableAt === null` |
| `isFarmState` | `serverTime` số nguyên ≥ 0; `plots` đúng 6 phần tử, `index === i`; `crop` null hoặc `{ cropId hợp lệ, plantedAt nguyên ≥ 0, readyAt nguyên ≥ plantedAt }`; `inventory` mỗi phần tử `{ itemId hợp lệ, quantity nguyên ≥ 1 }`, không trùng `itemId`; `isSeedRefillState(seedRefill)` |
| `isHarvestResponse` | `isFarmState` + `harvested { itemId hợp lệ, quantity nguyên ≥ 1 }` |

Validator **không** kiểm tra quy tắc gameplay (readyAt đúng thời gian, eligible đúng, availableAt đúng mốc) — đó là việc của server.

**Test:**

- `farming.test.ts`: hằng số (6, 5, 5, 60 000); `CROPS` 3 phần tử, `ITEMS` 6 phần tử, id duy nhất, khớp `CROP_IDS`/`ITEM_IDS`; mỗi cây `seedItemId = <id>_seed` (kind seed), `produceItemId = <id>_produce` (kind produce); `growthMs` 30 000/120 000/300 000; `harvestYield` 1; `isCropId`/`isItemId`/`isPlotIndex` chấp nhận và từ chối (sai hoa thường, crop id dùng làm item id, −1, 6, 1.5, `NaN`, `"1"`, `null`); `getCrop`/`getItem`.
- `api.test.ts` (giữ test health): `isRequestId` (v4 hợp lệ; chữ hoa, v1, biến thể sai, thiếu gạch, `{}`, rỗng, số, dài hơn); 3 validator request (hợp lệ, trường thừa, thiếu trường, `plotIndex` sai, `cropId` sai, `requestId` sai, null/mảng/chuỗi); `isSessionResponse` (token 42/44 ký tự, có `+`/`/`/`=`); `isSeedRefillState` (4 tổ hợp eligible/availableAt, số âm/không nguyên, thiếu trường); `isFarmState` (hợp lệ, 5/7 ô, sai `index`, `readyAt < plantedAt`, `quantity` 0/âm/1.5, `itemId` trùng/lạ, thiếu `seedRefill`, `serverTime` âm); `isHarvestResponse`.
- `errors.test.ts`: `isErrorCode` chấp nhận 9 mã mới và 4 mã cũ.
- `protocol.test.ts`: không sửa, vẫn pass.

**File dự kiến (7, chỉ `shared/`):** `shared/src/farming.ts` (mới), `shared/src/farming.test.ts` (mới), `shared/src/api.ts`, `shared/src/api.test.ts`, `shared/src/errors.ts`, `shared/src/errors.test.ts`, `shared/package.json` (export `./farming`).

**Tiêu chí nghiệm thu:**

- `npm run typecheck`, `npm test` (root) exit 0; 150 test cũ vẫn pass; test mới pass, chạy lại nhiều lần ổn định.
- `npm run build -w client` pass.
- Nếu được duyệt: chạy thêm `npm test -w shared` bằng Node 22.23.2 (bản khớp `.nvmrc`) để xác nhận tương thích.
- `git diff --check` sạch; chỉ 7 file trên thay đổi; `protocol.ts` không đổi.
- Báo cáo `docs/PHASE1_STEP1_1_REPORT.md`; commit chỉ khi Game Director cho phép; không đưa file `docs/PHASE*_*.md` chưa track vào commit.

**Điều kiện bắt đầu Bước 1.1:** Game Director (sau rà soát của ChatGPT) duyệt P-1, P-3 và cho phép sửa code.

---

## 1. Căn cứ

| Nguồn | Nội dung liên quan |
|---|---|
| `GAME_DESIGN.md` §3 | Farm riêng; trồng, chăm sóc, chờ phát triển, thu hoạch, nhận/bán/dùng/giao dịch sản phẩm |
| `GAME_DESIGN.md` §19 | MVP: Player → Farm → Plant → Grow → Harvest → Inventory → **Coin → XP** |
| `GAME_DESIGN.md` §18, §21 | Mobile-first (touch, UI lớn, ít nút); mỗi feature phải được thiết kế trước khi code |
| `GAME_RULES.md` §1, §2 | Farm gắn với player account; Player ID duy nhất do server quản lý; client không tạo/sửa Player ID |
| `GAME_RULES.md` §4 | Crop: Seed → Growing → Ready → Harvested; client không được tự đặt Ready; server quyết định đủ điều kiện thu hoạch |
| `GAME_RULES.md` §5 | Server là authority của inventory; client không tự thêm/xóa/tăng/tạo/sửa item |
| `GAME_RULES.md` §6, §12 | Currency, XP, Level do server quản lý |
| `GAME_RULES.md` §19, §20, §21 | Server authoritative; chống duplication, double rewards, replay; request ID duy nhất; không tự thêm feature lớn ngoài roadmap |
| `TECHNICAL_ARCHITECTURE.md` §6, §7 | Database chọn trước khi làm persistent backend; static data vs player data |
| `TECHNICAL_ARCHITECTURE.md` §8 | Luồng Harvest có bước "Calculate reward", "Update XP" |
| `TECHNICAL_ARCHITECTURE.md` §10, §12, §17, §18, §19 | Persistent vs realtime; request ID; API ví dụ `POST /api/farm/plant`, `POST /api/farm/harvest`; error code ví dụ `CROP_NOT_READY`; log Player ID/Action/Timestamp/Request ID/Result |
| `DEVELOPMENT_ROADMAP.md` | Phase 1: Player, Farm, Soil, Crops, Planting, Growth, Harvest, Inventory, Basic rewards; XP ở Phase 2; Coins/Shop/Selling ở Phase 6; farm grid/placement ở Phase 3 |
| `CLAUDE_DEVELOPMENT_RULES.md` | Bước nhỏ, test trước commit, server authority, chống duplication/replay, mobile-first, không đổi kiến trúc khi chưa duyệt |
| Code hiện tại | `shared/src/{api,errors,protocol}.ts`, `server/src/{config,app,index}.ts`, `server/src/multiplayer/*`, `client/src/{main,core/BootScene}.ts`, `client/src/network/*`; root `package.json` (`engines.node >=22.12.0`), `.nvmrc` (`22`) |

---

## 2. Đánh giá Phase 0 theo bằng chứng (giữ từ bản 1.0)

**Có code và test tự động** (150 test pass ở lần chạy gần nhất): protocol WebSocket v1 và validator; `GET /api/health`; config validation; WebSocket `/ws` (path, Origin, 4096 byte, close 4000/1001); client `resolveServerUrls`, `formatStatus`, `ServerConnection`.

**Đã kiểm thử thực tế:** scene hiển thị (Game Director, Bước 6); `Connected` qua Codespaces với `CLIENT_ORIGIN=https://localhost:5173` (Game Director, Bước 7); RTT 223 ms, Offline → bật lại server → `Connected` (Game Director, 2026-10-10; log server). Proxy/Origin/403/1001 kiểm tra bằng script (không qua cổng Codespaces).

**Chưa xác minh / chưa có:** Android; xoay màn hình sau Bước 8; thao tác cụ thể khi kết nối lại từ Offline; preview/HMR qua Codespaces; logging đầy đủ §19; request ID (§12); database; player/auth. Review tổng thể Phase 0 đang chờ duyệt.

---

## 3. Quyết định Q1–Q8 (Game Director xác nhận 2026-10-10)

| # | Quyết định đã duyệt (bản cuối, 2026-10-10) | Chi tiết |
|---|---|---|
| Q1 / B-2 ⚠ **thay bằng P-4 (mục 0.4–0.5)** | `node:sqlite` cho MVP Phase 1, không thêm dependency database. Môi trường mục tiêu **Node.js 24.x**; cập nhật `.nvmrc`, `engines.node` ở bước phù hợp (Bước 1.3 — storage) **sau khi xác minh tương thích toàn bộ dự án**. Không dùng cờ experimental nếu Node mục tiêu không cần | Mục 4, 9.10 |
| Q2 | Guest player do server tạo; token ngẫu nhiên đủ mạnh; server chỉ lưu SHA-256. Token không còn hợp lệ → **không tự tạo farm mới âm thầm**; hiện thông báo tiếng Anh `Start a new farm` và yêu cầu người chơi xác nhận. **Giới hạn MVP:** mất token có thể mất quyền truy cập farm | Mục 6.1 |
| Q3 | HTTP cho session, tải farm, trồng, thu hoạch (và nhận lại hạt); giữ nguyên WebSocket protocol v1 | Mục 7 |
| Q4 | Phase 1 chỉ có hạt giống và nông sản trong inventory; chưa có Coin, XP, Level, shop. Khác biệt với `GAME_DESIGN.md` §19 được ghi lại để cập nhật tài liệu gốc có chủ đích sau; **không sửa tài liệu gốc trong bước này** | Mục 5.5, 10 |
| Q5 ⚠ **thời điểm nhận lại thay bằng mục 0.3** | 5 hạt mỗi loại ban đầu. Khi hết cả 3 loại hạt **và** không còn cây nào trên farm (cây đã chín chưa thu hoạch vẫn tính là đang tồn tại) → server cho nhận lại **đúng 5 hạt mỗi loại**. Nhận lại hạt phải có `requestId`, an toàn trước replay và request đồng thời | Mục 5.4, 9.5 |
| Q6 | 6 ô; wheat 30 s, carrot 120 s, tomato 300 s; mỗi lần thu hoạch 1 nông sản; thời gian do server quyết định; không có cây chết/héo | Mục 5.2, 5.3, 9.1 |
| Q7 | Chưa có tưới nước, phân bón hay cơ chế chăm sóc | Mục 5.3 |
| Q8 | Lưới 6 ô bằng hình khối Phaser, chữ tiếng Anh, nút chọn hạt dễ chạm, hiển thị inventory và tiến độ cây. Mobile-first nhưng **chưa tuyên bố hỗ trợ Android** trước khi kiểm thử | Mục 8 |

---

## 4. Q1 — Kiểm tra Node và `node:sqlite`

Đã kiểm tra (không cài gì, không đổi cấu hình):

| Môi trường | Kết quả |
|---|---|
| Codespace: Node **24.21.0** (đang dùng) | `require("node:sqlite")` chạy được, không cần cờ, **không in cảnh báo**; SQLite 3.53.4; tạo bảng/insert/select trong `:memory:` thành công |
| Codespace: Node **22.23.2** (đã cài sẵn qua nvm) | Chạy được, không cần cờ, nhưng in `ExperimentalWarning: SQLite is an experimental feature and might change at any time`; SQLite 3.51.3 |
| Tài liệu Node 24 | Stability **1.2 — Release candidate** từ v24.15.0; không cần cờ từ v22.13.0 / v23.4.0 |
| Tài liệu Node 22 | Stability **1.1 — Active development**; không cần cờ từ v22.13.0; trước đó cần `--experimental-sqlite` |
| Repo | `engines.node` = `>=22.12.0`; `.nvmrc` = `22` — **22.12 chưa dùng được `node:sqlite` không cờ** |

Kết luận:

- `node:sqlite` dùng được mà không thêm dependency, nhưng **chưa phải Stable** ở bất kỳ bản nào.
- Repo hiện khai báo Node 22 (`.nvmrc`), trong khi Codespace chạy Node 24 — đã lệch từ Phase 0.

**Q1 / B-2 — Đã duyệt: Node.js 24.x.** Không đổi `.nvmrc`/`engines` trong Bước 1.1; chỉ cập nhật ở Bước 1.3 (storage) sau khi xác minh toàn bộ dự án (typecheck, test, build, dev server) chạy trên Node 24 và chọn cách pin phiên bản. Không dùng cờ experimental. Bảng phương án ban đầu giữ để tham chiếu:

| Phương án | Thay đổi khi triển khai | Ghi chú |
|---|---|---|
| **A (đề xuất).** Node 24 LTS, `>=24.15.0` | `.nvmrc` → `24`, `engines.node` → `>=24.15.0`, README "Requirements" | `node:sqlite` ở mức Release candidate, không cảnh báo; khớp Node đang chạy trong Codespace |
| B. Giữ Node 22, `>=22.13.0` | `engines.node` → `>=22.13.0`, README | Mức Active development, mỗi lần chạy in ExperimentalWarning |
| C. Không dùng `node:sqlite` | Thêm package (ví dụ `better-sqlite3`) — trái với yêu cầu "chưa thêm dependency" | Chỉ cân nhắc nếu A/B bị từ chối |

Tầng lưu trữ được gom vào một module server (`server/src/storage/`) để giảm chi phí nếu phải đổi sang lựa chọn khác.

---

## 5. Quy tắc gameplay Phase 1 (MVP)

### 5.1 Farm và ô đất

- Mỗi player có đúng **1 farm** gồm **6 ô đất**, chỉ số `0..5`, tạo cùng lúc với player.
- Ô đất có 2 trạng thái lưu trữ: **trống** hoặc **có cây** (`cropId`, `plantedAt`). Không có trạng thái đất khác ("Soil" trong Roadmap = ô đất trống/có cây).
- Không mở rộng, di chuyển hay xây trên ô (Phase 3).

### 5.2 Cây trồng (static data, trong `shared`)

| `cropId` | Tên hiển thị | Hạt giống `itemId` | Nông sản `itemId` | Thời gian | Sản lượng |
|---|---|---|---|---|---|
| `wheat` | Wheat | `wheat_seed` | `wheat_produce` | 30 giây | 1 |
| `carrot` | Carrot | `carrot_seed` | `carrot_produce` | 2 phút | 1 |
| `tomato` | Tomato | `tomato_seed` | `tomato_produce` | 5 phút | 1 |

**Q6 — đã xác nhận:** wheat/carrot/tomato, sản lượng 1 mỗi lần thu hoạch. Item id theo quy tắc `*_seed` / `*_produce` (A-4). Thời gian là **giá trị thử nghiệm** theo Q6, sẽ cân bằng lại sau.

### 5.3 Vòng đời cây (ánh xạ với `GAME_RULES.md` §4)

| GAME_RULES §4 | Phase 1 |
|---|---|
| Seed | Người chơi dùng 1 hạt giống để trồng (hạt bị trừ khỏi kho) |
| Growing | Ô có cây, `now < plantedAt + growthTime` |
| Ready | Ô có cây, `now ≥ plantedAt + growthTime` — **tính bởi server, không lưu, client không đặt được** |
| Harvested | Server thêm nông sản vào kho và làm trống ô (không lưu trạng thái riêng) |

- Không có tưới nước, phân bón; cây không chết/héo; cây Ready giữ nguyên vô thời hạn cho tới khi thu hoạch (Q7).
- Cây tiếp tục lớn khi người chơi offline (tính theo thời gian server).

### 5.4 Kho và hạt giống (Q5)

- Player mới nhận **5 hạt mỗi loại** (`wheat_seed`, `carrot_seed`, `tomato_seed`).
- Thu hoạch **không** tự trả hạt giống.
- Nông sản chỉ tích lũy trong kho (chưa bán/dùng — Phase 6).
- Số lượng không bao giờ âm; item số lượng 0 không hiển thị.

**Cơ chế cấp lại hạt thử nghiệm — QUY TẮC MVP, sẽ bỏ khi có Shop (Phase 6):**

**Đã xác nhận (Q5):** hết hạt và không có cây đang trồng → nhận lại 5 hạt mỗi loại (phương án R1 của bản 1.1; phương án R2 "theo thời gian chờ" không được chọn). Quy tắc chi tiết ở mục 9.5; A-1: chỉ khi **cả 3 loại hạt = 0** và **không còn cây nào trên farm**; server quyết định.

Cơ chế: hành động `refill-seeds` do người chơi chủ động (nút "Get starter seeds" chỉ hiện khi đủ điều kiện), có request ID, server kiểm tra lại điều kiện.

### 5.5 Không có trong Phase 1 (Q4, Q7)

Coin, XP, Level, quest, shop, bán/dùng nông sản, tưới nước, phân bón, cây chết/héo, mở rộng farm, building, đăng nhập thật, multiplayer, thăm farm, trộm, realtime push farm state, asset đồ họa.

---

## 6. Dữ liệu, danh tính và bảo mật

### 6.1 Guest player và token (Q2)

- `POST /api/session` (không cần token) tạo player mới:
  - `playerId`: UUID v4 do server tạo (`crypto.randomUUID()`).
  - `token`: 32 byte ngẫu nhiên (`crypto.randomBytes`), mã hóa base64url, trả về **một lần duy nhất**.
  - Server chỉ lưu `SHA-256(token)` (token có entropy cao nên hash nhanh là đủ; không cần bcrypt).
  - Tạo 6 ô trống + kho khởi đầu trong **cùng một transaction**.
- Mọi API farm yêu cầu `Authorization: Bearer <token>`. Server tra `playerId` từ hash token; **không bao giờ nhận `playerId` từ body/query**.
- Client lưu token trong `localStorage` (key đề xuất `farmverse.token`).
- Token không xuất hiện trong log (Fastify mặc định không log header; sẽ có test đảm bảo).

**Rủi ro mất token (chấp nhận cho Phase 1, cần Game Director xác nhận):**

- Xóa dữ liệu trình duyệt, chế độ ẩn danh, đổi trình duyệt/thiết bị → **mất quyền truy cập farm vĩnh viễn**; không có cách khôi phục.
- Token bị lộ (ví dụ chép từ DevTools) → người khác điều khiển được farm.
- Phải có đăng nhập thật trước khi có Coin, Marketplace, Trading (Phase 6+).

Hành vi client khi token không còn hợp lệ (401): **tuyệt đối không tự tạo farm mới âm thầm**; hiển thị thông báo tiếng Anh kèm nút `Start a new farm`; chỉ khi người chơi chạm/xác nhận mới gọi `POST /api/session`. Token cũ bị xóa khỏi `localStorage` chỉ sau khi người chơi xác nhận. (Thực hiện ở Bước 1.6.)

### 6.2 Lưu trữ SQLite (đề xuất schema)

Đơn vị thời gian: mili giây Unix (server).

```
schema_version (version INTEGER)
players     (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)
plots       (player_id TEXT NOT NULL, plot_index INTEGER NOT NULL CHECK (plot_index BETWEEN 0 AND 5),
             crop_id TEXT NULL, planted_at INTEGER NULL,
             PRIMARY KEY (player_id, plot_index),
             CHECK ((crop_id IS NULL) = (planted_at IS NULL)))
inventory   (player_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK (quantity >= 0),
             PRIMARY KEY (player_id, item_id))
action_log  (player_id TEXT NOT NULL, request_id TEXT NOT NULL, action TEXT NOT NULL,
             request_json TEXT NOT NULL, status_code INTEGER NOT NULL, response_json TEXT NOT NULL,
             created_at INTEGER NOT NULL, PRIMARY KEY (player_id, request_id))
```

- File DB: biến môi trường mới `DATABASE_PATH` (mặc định đề xuất `server/data/farmverse.db`, thêm vào `.gitignore`); test dùng `:memory:` hoặc file tạm.
- Mỗi hành động thay đổi state chạy trong **một transaction** (`BEGIN IMMEDIATE … COMMIT`). API `DatabaseSync` là đồng bộ nên hai request không xen kẽ giữa chừng trong cùng một tiến trình; transaction bảo đảm "tất cả hoặc không".
- Static data (cây, item) **không** lưu trong DB; DB chỉ lưu `cropId`/`itemId` và server kiểm tra với static data.

### 6.3 Chống replay / duplication (TECHNICAL_ARCHITECTURE §12, GAME_RULES §20)

- Mọi hành động thay đổi state (`plant`, `harvest`, `refill-seeds`) bắt buộc có `requestId` là **UUID** do client tạo cho **mỗi lần người chơi chạm**.
- Phạm vi duy nhất: `(playerId, requestId)`.
- Trong cùng transaction với hành động:
  1. Tìm `action_log` theo `(playerId, requestId)`.
  2. Có rồi và cùng `action` + cùng body → **trả lại nguyên response đã lưu** (luôn là kết quả thành công), không đổi state.
  3. Có rồi nhưng khác `action`/body → `409 REQUEST_ID_REUSED`, không ghi đè bản ghi gốc.
  4. Chưa có → kiểm tra quy tắc; **chỉ khi thành công** mới cập nhật state và ghi `action_log` trong cùng transaction.
- **`action_log` chỉ chứa giao dịch thành công** (theo yêu cầu bắt buộc mục B của Game Director): request thất bại do validation (400), xác thực (401), điều kiện gameplay không đạt (409) hoặc lỗi server (5xx) **không** được ghi như giao dịch có thể phát lại. Các lần thất bại chỉ ghi vào log server (Player ID nếu biết, action, request ID, error code, thời gian; không có token). Chi tiết mục 9.5.
- Client gửi lại khi lỗi mạng **với cùng `requestId`**; lần chạm mới luôn dùng `requestId` mới.
- `action_log` đồng thời là log hành động theo §19 (Player ID, Action, Request ID, Result, Timestamp); server ghi thêm một dòng log (không chứa token).
- Chưa xóa `action_log` cũ trong Phase 1 (dữ liệu nhỏ); ghi lại để xử lý sau.

### 6.4 Kiểm tra đầu vào

- `plotIndex`: số nguyên `0..5`.
- `cropId`: một trong `wheat`, `carrot`, `tomato`.
- `requestId`: chuỗi UUID.
- Body JSON, giới hạn kích thước nhỏ (ví dụ 1 KB); trường thừa bị bỏ qua.
- Client không bao giờ gửi thời gian, số lượng, `playerId` hay trạng thái cây.

---

## 7. API HTTP (Q3)

WebSocket `/ws` giữ nguyên protocol v1, **không bump `PROTOCOL_VERSION`**; chỉ dùng để báo trạng thái kết nối như Phase 0.

| Method & path | Auth | Body | Thành công |
|---|---|---|---|
| `POST /api/session` | Không | — | `201 { playerId, token }` |
| `GET /api/farm` | Bearer | — | `200 FarmState` |
| `POST /api/farm/plant` | Bearer | `{ requestId, plotIndex, cropId }` | `200 FarmState` |
| `POST /api/farm/harvest` | Bearer | `{ requestId, plotIndex }` | `200 FarmState` + `harvested: { itemId, quantity }` |
| `POST /api/farm/refill-seeds` | Bearer | `{ requestId }` | `200 FarmState` (Q5 đã xác nhận) |

```
FarmState {
  serverTime: number                       // ms, để client bù lệch đồng hồ
  plots: Array<{
    index: number                          // 0..5
    crop: null | { cropId, plantedAt, readyAt }   // readyAt do server tính
  }>
  inventory: Array<{ itemId, quantity }>   // chỉ item có quantity > 0
  canRefillSeeds: boolean                  // theo quy tắc Q5 (mục 9.5)
}
```

Trả về toàn bộ `FarmState` sau mỗi hành động (dữ liệu nhỏ: 6 ô + ≤ 6 item) để client luôn đồng bộ với server.

Error codes mới (thêm vào `shared/src/errors.ts` ở Bước 1.1), dùng chung `ErrorPayload` hiện có:

| Code | HTTP | Khi nào |
|---|---|---|
| `INVALID_REQUEST` | 400 | Body sai định dạng/thiếu trường/giá trị ngoài miền |
| `UNAUTHORIZED` | 401 | Thiếu token hoặc token không hợp lệ |
| `PLOT_NOT_EMPTY` | 409 | Trồng vào ô đã có cây |
| `PLOT_EMPTY` | 409 | Thu hoạch ô trống |
| `CROP_NOT_READY` | 409 | Thu hoạch khi chưa chín (đã có trong ví dụ §18) |
| `ITEM_NOT_OWNED` | 409 | Không còn hạt giống loại đó (đã có trong ví dụ §18) |
| `REFILL_NOT_ALLOWED` | 409 | Cấp lại hạt khi chưa đủ điều kiện |
| `REQUEST_ID_REUSED` | 409 | Dùng lại `requestId` cho hành động/body khác |

`plotIndex`/`cropId` ngoài miền dùng `INVALID_REQUEST` (không tách `PLOT_NOT_FOUND`/`CROP_NOT_FOUND` vì miền giá trị cố định).

---

## 8. Client (Q8) và mất kết nối

- Scene farm Phaser: lưới **6 ô** bằng hình khối (2×3 khi màn hình dọc, 3×2 khi ngang — theo `Scale.RESIZE`); ô trống / đang lớn (thanh tiến độ + thời gian còn lại) / chín (đổi màu, chữ "Ready").
- **Nút chọn hạt giống lớn** (một nút mỗi loại, kèm số lượng); hạt đang chọn được đánh dấu.
- **Kho** hiển thị rõ (hạt giống và nông sản, số lượng).
- Chạm ô trống → trồng hạt đang chọn; chạm ô chín → thu hoạch; chạm ô đang lớn → hiện thời gian còn lại.
- Thông báo lỗi ngắn, dễ hiểu theo error code (ví dụ `CROP_NOT_READY` → "Not ready yet").
- Dòng trạng thái kết nối của Phase 0 giữ nguyên.
- Mọi chữ hiển thị bằng tiếng Anh. Thiết kế mobile-first nhưng **không tuyên bố hỗ trợ Android** cho tới khi có kiểm thử trên thiết bị Android.
- Tiến độ hiển thị = `readyAt − (Date.now() + offset)` với `offset = serverTime − Date.now()` lúc nhận response; chỉ để hiển thị.

Mất kết nối:

- Khi `ServerConnection` không ở `Connected`: khóa thao tác trồng/thu hoạch, hiện trạng thái.
- Lỗi mạng khi gửi hành động: gửi lại tối đa 3 lần (1 s, 2 s, 4 s) **với cùng `requestId`**; sau đó báo lỗi và chờ kết nối lại.
- Khi trở lại `Connected`: `GET /api/farm` để đồng bộ.
- Không có hàng đợi hành động offline.

---

## 9. Bước 1.1 — Static data và contract trong `shared` (KẾ HOẠCH CHI TIẾT, CHƯA LÀM)

Phạm vi: chỉ `shared/`. Không server, client, DB, không đổi runtime (Node 24 làm ở Bước 1.3). Không đổi `shared/src/protocol.ts`, `PROTOCOL_VERSION`, `WS_PATH`. Không thêm dependency.

Quy ước chung cho mọi validator (giữ đúng cách viết hiện có trong `protocol.ts`/`api.ts`): hàm `isX(value: unknown): value is X`, không throw, trường thừa bị bỏ qua, số phải hữu hạn (`Number.isFinite`), số nguyên kiểm tra bằng `Number.isInteger`.

### 9.1 Static definitions — `shared/src/farming.ts` (mới)

```ts
export const FARM_PLOT_COUNT = 6;
export const STARTER_SEEDS_PER_CROP = 5;
/** MVP seed refill (Q5): amount of each seed granted; temporary until the Shop (Phase 6). */
export const SEED_REFILL_PER_CROP = 5;

export const CROP_IDS = ["wheat", "carrot", "tomato"] as const;
export type CropId = (typeof CROP_IDS)[number];

export const ITEM_IDS = [
  "wheat_seed", "carrot_seed", "tomato_seed",
  "wheat_produce", "carrot_produce", "tomato_produce",
] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type ItemKind = "seed" | "produce";

export interface ItemDefinition {
  id: ItemId;
  name: string;          // display name (English, như các text UI hiện có)
  kind: ItemKind;
}

export interface CropDefinition {
  id: CropId;
  name: string;
  seedItemId: ItemId;
  produceItemId: ItemId;
  growthMs: number;      // 30_000 | 120_000 | 300_000
  harvestYield: number;  // 1
}

export const ITEMS: readonly ItemDefinition[];   // 6 mục
export const CROPS: readonly CropDefinition[];   // 3 mục

export function isCropId(value: unknown): value is CropId;
export function isItemId(value: unknown): value is ItemId;
export function isPlotIndex(value: unknown): value is number;   // số nguyên 0..FARM_PLOT_COUNT-1
export function getCrop(id: CropId): CropDefinition;
export function getItem(id: ItemId): ItemDefinition;
```

Giá trị (theo Q6 đã xác nhận):

| Crop | `seedItemId` | `produceItemId` | `growthMs` | `harvestYield` |
|---|---|---|---|---|
| `wheat` "Wheat" | `wheat_seed` "Wheat Seed" | `wheat_produce` "Wheat" | 30 000 | 1 |
| `carrot` "Carrot" | `carrot_seed` "Carrot Seed" | `carrot_produce` "Carrot" | 120 000 | 1 |
| `tomato` "Tomato" | `tomato_seed` "Tomato Seed" | `tomato_produce` "Tomato" | 300 000 | 1 |

- Item id theo quy tắc A-4: hạt giống `<cropId>_seed`, nông sản `<cropId>_produce` (không trùng chuỗi với `CropId`).
- Thời gian lưu bằng **mili giây** (`growthMs`) để thống nhất với `serverTime`/`plantedAt`.
- Không đặt logic quy tắc (trồng/thu hoạch/điều kiện cấp lại) trong `shared`; logic đó thuộc server (Bước 1.2). `shared` chỉ có dữ liệu và kiểm tra hình dạng.

### 9.2 API contract — `shared/src/api.ts` (sửa)

Giữ nguyên `HEALTH_PATH`, `HealthResponse`, `isHealthResponse`. Thêm:

```ts
export const SESSION_PATH = "/api/session";
export const FARM_PATH = "/api/farm";
export const FARM_PLANT_PATH = "/api/farm/plant";
export const FARM_HARVEST_PATH = "/api/farm/harvest";
export const FARM_REFILL_SEEDS_PATH = "/api/farm/refill-seeds";

/** POST /api/session → 201 */
export interface SessionResponse { playerId: string; token: string }

export interface PlantedCrop { cropId: CropId; plantedAt: number; readyAt: number }
export interface PlotState { index: number; crop: PlantedCrop | null }
export interface InventoryEntry { itemId: ItemId; quantity: number }

/** GET /api/farm → 200; cũng là body thành công của plant và refill-seeds */
export interface FarmState {
  serverTime: number;
  plots: PlotState[];
  inventory: InventoryEntry[];
  canRefillSeeds: boolean;
}

/** POST /api/farm/harvest → 200 */
export interface HarvestResponse extends FarmState {
  harvested: InventoryEntry;
}

export interface PlantRequest { requestId: string; plotIndex: number; cropId: CropId }
export interface HarvestRequest { requestId: string; plotIndex: number }
export interface RefillSeedsRequest { requestId: string }

export function isRequestId(value: unknown): value is string;
export function isSessionResponse(value: unknown): value is SessionResponse;
export function isFarmState(value: unknown): value is FarmState;
export function isHarvestResponse(value: unknown): value is HarvestResponse;
export function isPlantRequest(value: unknown): value is PlantRequest;
export function isHarvestRequest(value: unknown): value is HarvestRequest;
export function isRefillSeedsRequest(value: unknown): value is RefillSeedsRequest;
```

Bảng endpoint (hành vi server sẽ làm ở Bước 1.4–1.5; Bước 1.1 chỉ định nghĩa kiểu và hằng số):

| Endpoint | Auth | Request | Thành công | Lỗi có thể |
|---|---|---|---|---|
| `POST /api/session` | Không | không có body | `201 SessionResponse` | 500 |
| `GET /api/farm` | Bearer | — | `200 FarmState` | 401 |
| `POST /api/farm/plant` | Bearer | `PlantRequest` | `200 FarmState` | 400, 401, 409 `PLOT_NOT_EMPTY` / `ITEM_NOT_OWNED` / `REQUEST_ID_REUSED` |
| `POST /api/farm/harvest` | Bearer | `HarvestRequest` | `200 HarvestResponse` | 400, 401, 409 `PLOT_EMPTY` / `CROP_NOT_READY` / `REQUEST_ID_REUSED` |
| `POST /api/farm/refill-seeds` | Bearer | `RefillSeedsRequest` | `200 FarmState` | 400, 401, 409 `REFILL_NOT_ALLOWED` / `REQUEST_ID_REUSED` |

Mọi lỗi dùng `ErrorPayload { code, message }` hiện có.

### 9.3 Error codes — `shared/src/errors.ts` (sửa)

Thêm vào `ErrorCode` (giữ nguyên 4 code cũ):

| Code | HTTP | Ý nghĩa | Ghi `action_log`? (Bước 1.5) |
|---|---|---|---|
| `INVALID_REQUEST` | 400 | **JSON sai định dạng** (A-6), body thiếu trường/sai kiểu, `plotIndex`/`cropId`/`requestId` ngoài miền hoặc sai định dạng UUID v4 | Không |
| `UNAUTHORIZED` | 401 | Thiếu/sai token | Không |
| `PLOT_NOT_EMPTY` | 409 | Trồng vào ô có cây (kể cả cây đã chín) | Không |
| `PLOT_EMPTY` | 409 | Thu hoạch ô trống | Không |
| `CROP_NOT_READY` | 409 | Thu hoạch khi `serverTime < readyAt` | Không |
| `ITEM_NOT_OWNED` | 409 | Không còn hạt giống của loại cây được chọn | Không |
| `REFILL_NOT_ALLOWED` | 409 | Nhận lại hạt khi chưa đủ điều kiện | Không |
| `REQUEST_ID_REUSED` | 409 | `requestId` đã gắn với một giao dịch thành công khác hành động hoặc khác body | Không (bản ghi gốc giữ nguyên) |


Bảng ánh xạ mọi lỗi sang HTTP status (`ERROR_HTTP_STATUS` hoặc tương đương): **không thêm ở Bước 1.1** (ghi chú kiến trúc C, Game Director). Sẽ quyết định ở bước thiết kế API trước Bước 1.4–1.5 để tránh sửa contract nhiều lần. Cột HTTP trong bảng trên là định hướng contract, chưa được mã hóa thành hằng số.

### 9.4 Quy tắc validator

| Validator | Hợp lệ khi |
|---|---|
| `isRequestId` | Chuỗi UUID **phiên bản 4** (A-2): dạng 8-4-4-4-12 ký tự hex, ký tự phiên bản `4`, biến thể RFC 4122 (`[89ab]`), chữ thường như `crypto.randomUUID()` tạo ra. Server kiểm tra định dạng này cho mọi `requestId` |
| `isPlotIndex` | Số nguyên `0 ≤ n < 6` |
| `isCropId` / `isItemId` | Thuộc `CROP_IDS` / `ITEM_IDS` (so khớp chính xác, phân biệt hoa thường) |
| `isPlantRequest` | Object (không phải mảng/null); `isRequestId(requestId)`, `isPlotIndex(plotIndex)`, `isCropId(cropId)` |
| `isHarvestRequest` | Object; `requestId`, `plotIndex` hợp lệ |
| `isRefillSeedsRequest` | Object; `requestId` hợp lệ |
| `isSessionResponse` | `playerId` là UUID v4 chữ thường; `token` là chuỗi base64url đúng 43 ký tự `[A-Za-z0-9_-]` (32 byte, không padding) |
| `isFarmState` | `serverTime` số nguyên ≥ 0; `plots` là mảng **đúng 6** phần tử, phần tử thứ i có `index === i`; `crop` là `null` hoặc `{ cropId hợp lệ, plantedAt số nguyên ≥ 0, readyAt số nguyên ≥ plantedAt }`; `inventory` là mảng, mỗi phần tử `{ itemId hợp lệ, quantity số nguyên ≥ 1 }`, **không trùng `itemId`**; `canRefillSeeds` là boolean |
| `isHarvestResponse` | `isFarmState` và `harvested` là `{ itemId hợp lệ, quantity số nguyên ≥ 1 }` |

Validator trong `shared` chỉ kiểm tra **cấu trúc và kiểu dữ liệu**; không kiểm tra `readyAt === plantedAt + growthMs`, tính nhất quán `canRefillSeeds`, ownership hay điều kiện gameplay. **Server vẫn phải tự kiểm tra** ownership (player từ token), điều kiện gameplay (ô trống/có cây, đủ hạt, đã chín, điều kiện nhận lại hạt) và dữ liệu lưu trữ (Bước 1.2–1.5). Server **không tin** thời gian, số lượng, player ID hay trạng thái Ready do client gửi — các trường này không có trong request.

### 9.5 Quy tắc liên quan cần nhất quán (để Bước 1.2–1.5 tuân theo)

**Cấp lại hạt (Q5 đã xác nhận):**

- Điều kiện (A-1, đã duyệt): **cả 3 loại hạt giống đều = 0** **và** **không còn cây nào trên farm** (`crop !== null` ở bất kỳ ô nào, gồm cả cây đang lớn và cây đã chín chưa thu hoạch). **Server quyết định**; client chỉ hiển thị theo `canRefillSeeds`.
- Kết quả: kho được cộng 5 hạt mỗi loại (vì đang là 0 nên kết quả là đúng 5 mỗi loại). Nông sản không bị ảnh hưởng.
- `FarmState.canRefillSeeds` = kết quả điều kiện trên, do server tính trong mọi `FarmState`.
- Gọi `refill-seeds` khi `canRefillSeeds = false` → `409 REFILL_NOT_ALLOWED`.
- Gọi lại cùng `requestId` sau khi đã cấp thành công → trả lại response cũ (không cấp lần hai).
- Hai request nhận lại hạt **đồng thời** với `requestId` khác nhau → transaction tuần tự: request đầu cấp 5 hạt mỗi loại, request sau thấy kho đã có hạt → `409 REFILL_NOT_ALLOWED`. Có test ở Bước 1.5.

**`requestId`:**

- Client tạo mới cho **mỗi lần chạm** bằng `crypto.randomUUID()`, dùng lại **chỉ khi gửi lại do lỗi mạng**.
- A-7: chỉ dùng `crypto.randomUUID()` khi môi trường hỗ trợ (secure context: HTTPS hoặc `localhost`). Nếu không có, client **khóa** trồng/thu hoạch/nhận lại hạt và hiển thị lỗi tiếng Anh, ví dụ: `This browser cannot create secure request IDs. Open the game over HTTPS or localhost.`; **không** dùng `Math.random()` hay cách tạo ID yếu hơn. Thực hiện ở Bước 1.7 (kèm test).
- Server kiểm tra định dạng UUID v4 (A-2); sai định dạng → `400 INVALID_REQUEST`.
- Phạm vi duy nhất `(playerId, requestId)`: hai player khác nhau dùng trùng `requestId` không ảnh hưởng nhau.
- **Ghi `action_log`:** chỉ khi hành động **thành công** (200) — plant, harvest, refill-seeds. `POST /api/session` không có `requestId`.
- **Không ghi `action_log`:** 400 `INVALID_REQUEST`, 401 `UNAUTHORIZED`, mọi 409 điều kiện gameplay (`PLOT_NOT_EMPTY`, `PLOT_EMPTY`, `CROP_NOT_READY`, `ITEM_NOT_OWNED`, `REFILL_NOT_ALLOWED`), `409 REQUEST_ID_REUSED`, 5xx. Transaction bị rollback; không có thay đổi state.
- Hệ quả: gửi lại một `requestId` từng thất bại sẽ được **đánh giá lại** theo trạng thái hiện tại (có thể thành công nếu điều kiện đã đổi, ví dụ cây đã chín). Điều này không gây nhân đôi vì lần thành công đầu tiên mới được ghi, và mọi lần sau với cùng `requestId` chỉ nhận lại kết quả đã lưu. Xem điểm cần xác nhận E-1 (mục 13).

**`REQUEST_ID_REUSED`:**

- Có bản ghi **thành công** `(playerId, requestId)` nhưng `action` khác (ví dụ trước là `plant`, giờ là `harvest`) → `409 REQUEST_ID_REUSED`.
- Cùng `action` nhưng body khác (ví dụ `plotIndex` khác) → `409 REQUEST_ID_REUSED`.
- So sánh body dựa trên **các trường đã validate** theo thứ tự cố định (`requestId`, `plotIndex`, `cropId`), bỏ qua trường thừa và thứ tự key.
- A-3 (đã duyệt): cùng `requestId` + cùng `action` + cùng payload → trả **nguyên response thành công đã lưu**, không thay đổi dữ liệu lần nữa. Response đó là **ảnh chụp tại thời điểm xử lý lần đầu** (`serverTime`, `plots`, `inventory` cũ) — client phải coi là kết quả của hành động, rồi `GET /api/farm` nếu cần trạng thái mới nhất.
- `REQUEST_ID_REUSED` không ghi đè bản ghi gốc.

**Transaction (A-5, đã duyệt — thực hiện ở Bước 1.3–1.5, không thuộc 1.1):**

- Mọi thao tác thay đổi dữ liệu (`POST /api/session`, `plant`, `harvest`, `refill-seeds`) chạy trong **một transaction phía server** gồm: kiểm tra `action_log` → kiểm tra quy tắc → cập nhật `plots`/`inventory` → ghi `action_log`.
- Thu hoạch đồng thời cùng một ô (cùng hoặc khác `requestId`) **không được nhân đôi nông sản**: chỉ một request thành công, request còn lại nhận `PLOT_EMPTY` hoặc kết quả đã lưu. Bắt buộc có test đồng thời ở Bước 1.5.

**JSON sai định dạng (A-6, đã duyệt — thực hiện ở bước server có API đầu tiên, dự kiến 1.4):**

- JSON hỏng hoặc dữ liệu request không hợp lệ → `400 INVALID_REQUEST`, có test.
- Hiện tại (Phase 0, Bước 4) handler lỗi của server trả `INVALID_MESSAGE` cho mọi lỗi 4xx của Fastify, và test `app.test.ts` "returns INVALID_MESSAGE for malformed request bodies" kiểm tra điều đó. Khi áp dụng A-6 phải **sửa handler và cập nhật test này** (thay đổi hành vi HTTP đã có). `INVALID_MESSAGE` vẫn dùng cho WebSocket (protocol v1 không đổi).

### 9.6 Test cases Bước 1.1

`shared/src/farming.test.ts` (mới):

- `FARM_PLOT_COUNT === 6`, `STARTER_SEEDS_PER_CROP === 5`, `SEED_REFILL_PER_CROP === 5`.
- `CROPS` có đúng 3 phần tử, `id` duy nhất, trùng khớp `CROP_IDS`; `ITEMS` có đúng 6 phần tử, `id` duy nhất, trùng khớp `ITEM_IDS`.
- Mỗi cây: `seedItemId` là item `kind: "seed"`, `produceItemId` là item `kind: "produce"`; không có hai cây dùng chung hạt hoặc nông sản.
- `growthMs`: wheat 30 000, carrot 120 000, tomato 300 000; `harvestYield === 1` cho cả 3.
- `isCropId`: chấp nhận 3 id; từ chối `"Wheat"`, `"wheat_seed"`, `"wheat_produce"`, `""`, `1`, `null`.
- `isItemId`: chấp nhận 6 id; từ chối `"wheat"` (crop id, không phải item id), `"WHEAT_SEED"`, `"corn_seed"`, số.
- Mọi item `kind: "seed"` có id kết thúc `_seed`, mọi item `kind: "produce"` có id kết thúc `_produce`; với mỗi cây, `seedItemId` = `<id>_seed` và `produceItemId` = `<id>_produce` (A-4).
- `isPlotIndex`: chấp nhận 0..5; từ chối −1, 6, 1.5, `NaN`, `Infinity`, `"1"`, `null`.
- `getCrop`/`getItem` trả đúng định nghĩa.

`shared/src/api.test.ts` (sửa, giữ test `isHealthResponse` cũ):

- `isRequestId`: chấp nhận UUID v4 chữ thường (ví dụ `"3f2b8c1e-9a4d-4f6b-8e2a-1c5d7b9e0f12"`); từ chối chữ hoa, UUID v1 (ký tự phiên bản `1`), biến thể sai (`c` ở vị trí biến thể), thiếu gạch, có ngoặc `{}`, chuỗi rỗng, số, chuỗi dài hơn.
- `isPlantRequest`: hợp lệ; trường thừa bị bỏ qua; thiếu từng trường; `plotIndex` −1/6/1.5/`"1"`; `cropId` lạ/sai hoa thường; `requestId` sai; `null`, mảng, chuỗi.
- `isHarvestRequest`, `isRefillSeedsRequest`: tương tự.
- `isSessionResponse`: hợp lệ; `playerId` không phải UUID; token 42/44 ký tự; token có `+`/`/`/`=`.
- `isFarmState`: hợp lệ (ô trống và ô có cây; kho rỗng); 5 hoặc 7 ô; `index` sai thứ tự; `cropId` lạ; `readyAt < plantedAt`; `plantedAt` âm/không nguyên; `quantity` 0 hoặc âm hoặc 1.5; `itemId` trùng; `itemId` lạ; thiếu `canRefillSeeds`; `canRefillSeeds` không phải boolean; `serverTime` âm.
- `isHarvestResponse`: hợp lệ; thiếu `harvested`; `harvested.quantity` 0.

`shared/src/errors.test.ts` (sửa):

- `isErrorCode` chấp nhận 8 code mới; vẫn chấp nhận 4 code cũ.

`shared/src/protocol.test.ts`: **không sửa**; vẫn phải pass (WS protocol v1 không đổi).

### 9.7 File dự kiến

| File | Loại |
|---|---|
| `shared/src/farming.ts` | Mới |
| `shared/src/farming.test.ts` | Mới |
| `shared/src/api.ts` | Sửa (thêm, không đổi phần cũ) |
| `shared/src/api.test.ts` | Sửa (thêm test) |
| `shared/src/errors.ts` | Sửa (thêm code) |
| `shared/src/errors.test.ts` | Sửa (thêm test) |
| `shared/package.json` | Sửa (thêm export `"./farming": "./src/farming.ts"`) |

Không đổi: `shared/src/protocol.ts`, `shared/src/protocol.test.ts`, `server/`, `client/`, root `package.json`, `package-lock.json` (dự kiến không đổi vì không thêm dependency), `.nvmrc`, `tsconfig*`.

### 9.8 Tiêu chí nghiệm thu Bước 1.1

- `npm run typecheck` và `npm test` ở root exit 0; **150 test cũ vẫn pass** (shared 60, server 46, client 44) và test mới pass.
- Mọi test ở 9.6 có mặt và pass; chạy lại nhiều lần ổn định.
- `npm run build -w client` vẫn pass (client import `@farmverse/shared` không bị ảnh hưởng).
- `git diff --check` exit 0; chỉ 7 file ở 9.7 thay đổi; không file `docs/PHASE0_*.md` hay `docs/PHASE1_*.md` nào được stage.
- `protocol.ts` và `PROTOCOL_VERSION` không đổi (kiểm tra bằng `git diff`).
- Báo cáo `docs/PHASE1_STEP1_1_REPORT.md`; chỉ commit khi Game Director cho phép.

### 9.9 Rủi ro còn lại của Bước 1.1

1. Contract có thể cần chỉnh khi làm server/client (1.2–1.7); chấp nhận sửa bằng commit nhỏ kèm test.
2. `crypto.randomUUID()` chỉ có trong **secure context** (HTTPS hoặc `localhost`). Mở client qua `http://<IP LAN>:5173` sẽ không có hàm này → theo A-7 client báo lỗi rõ ràng và không cho thao tác (Bước 1.7); Codespaces (HTTPS) và `localhost` không bị.
3. Thêm error code mới làm `isServerMessage` (WS) chấp nhận thêm code — vô hại, nhưng là thay đổi hành vi nhỏ của validator WS (protocol không đổi).
4. `exactOptionalPropertyTypes`: dùng `crop: PlantedCrop | null` rõ ràng, không dùng trường tùy chọn.
5. A-6 thay đổi hành vi HTTP đã có từ Phase 0 (`INVALID_MESSAGE` → `INVALID_REQUEST` cho JSON hỏng) và phải sửa một test cũ — cần ghi rõ trong báo cáo của bước thực hiện.
6. Vì `action_log` chỉ lưu giao dịch thành công, retry một `requestId` từng thất bại sẽ được đánh giá lại (mục 9.5) — cần test rõ ở Bước 1.5 để tránh hiểu nhầm là lỗi replay.

### 9.10 Quyết định A-1…A-7 (đã duyệt 2026-10-10) và điểm còn mở

| # | Quyết định | Áp dụng |
|---|---|---|
| A-1 | Chỉ nhận lại hạt khi cả 3 loại hạt = 0 và không còn cây nào đang trồng; server quyết định | 9.5; logic ở Bước 1.2 |
| A-2 | `requestId` là UUID v4; server kiểm tra định dạng | `isRequestId` (9.4), test 9.6 |
| A-3 | Cùng `requestId` + hành động + payload → kết quả đã lưu; khác hành động/payload → `REQUEST_ID_REUSED`, không ghi đè | 9.5; Bước 1.5 |
| A-4 | Item id `*_seed`, `*_produce` cho cả 3 cây | 5.2, 9.1, test 9.6 |
| A-5 | Thao tác thay đổi dữ liệu dùng transaction phía server; thu hoạch đồng thời không nhân đôi | 9.5; Bước 1.3–1.5 |
| A-6 | JSON sai định dạng / request không hợp lệ → `INVALID_REQUEST`, HTTP 400, có test | 9.3, 9.5; bước server có API đầu tiên |
| A-7 | Client dùng `crypto.randomUUID()`; không hỗ trợ thì báo lỗi rõ ràng, không dùng ID yếu hơn | 9.5; Bước 1.7 |

**Lưu ý đối chiếu:** A-5 và A-7 được duyệt với nội dung khác hai điểm mơ hồ cùng số thứ tự trong bản 1.2 (bản 1.2: A-5 = nơi đặt bảng code → HTTP status; A-7 = phiên bản Node tối thiểu). Hai điểm đó được giữ dưới tên mới và nay đã có hướng xử lý:

| # | Điểm còn mở | Đề xuất (chưa áp dụng) |
|---|---|---|
| B-1 | Bảng ánh xạ `ErrorCode` → HTTP status | **Đã có hướng (C):** không thêm ở Bước 1.1; quyết định ở bước thiết kế API trước Bước 1.4–1.5 |
| B-2 | Phiên bản Node | **Đã duyệt (Q1/B-2, C):** Node.js 24.x; không đổi ở Bước 1.1; xác minh tương thích và chọn cách pin (bản tối thiểu cụ thể, ví dụ `>=24.15.0`) ở Bước 1.3 |

Ngoài ra, A-2 chỉ ghi "UUID v4"; kế hoạch giữ định dạng **chữ thường** như bản 1.2 đề xuất (đúng đầu ra của `crypto.randomUUID()`). Nếu muốn chấp nhận cả chữ hoa, cần ghi rõ và chuẩn hóa trước khi so sánh.

---

## 10. Mâu thuẫn với tài liệu gốc — nội dung cần cập nhật (CHƯA SỬA)

Theo yêu cầu, tài liệu gốc **không** được sửa trong Bước 1.0. Đề xuất cập nhật sau khi thiết kế được duyệt:

| Tài liệu | Nội dung hiện tại | Mâu thuẫn | Đề xuất cập nhật |
|---|---|---|---|
| `GAME_DESIGN.md` §19 | MVP: … → Inventory → **Coin → XP** | Q4: Phase 1 không có Coin/XP; Roadmap đặt XP ở Phase 2, Coin ở Phase 6 | Ghi rõ: MVP đầy đủ (có Coin, XP) đạt sau Phase 2 và phần Coin của Phase 6; Phase 1 chứng minh Player → Farm → Plant → Grow → Harvest → Inventory. Hoặc Game Director quyết định đưa Coin/XP sớm hơn |
| `DEVELOPMENT_ROADMAP.md` Phase 1 | "Basic rewards" | Chưa định nghĩa | "Basic rewards = nông sản vào kho khi thu hoạch (không Coin/XP)" |
| `DEVELOPMENT_ROADMAP.md` Phase 1 | "Soil" | Chưa định nghĩa | "Soil = 6 ô đất cố định, trống hoặc có cây" |
| `GAME_DESIGN.md` §3 | "Chăm sóc cây" | Q7: Phase 1 không có | Ghi chú: chăm sóc cây để sau Phase 1 |
| `GAME_RULES.md` §4 | Seed → Growing → Ready → Harvested | Không mâu thuẫn; cần ghi cách ánh xạ (mục 5.3) | Thêm ánh xạ, quy tắc "Ready tính từ thời gian server", cây không héo trong Phase 1 |
| `GAME_RULES.md` (mới) | — | Quy tắc cấp lại hạt (Q5) là luật tạm | Thêm mục "MVP seed refill (tạm thời, bỏ khi có Shop)" |
| `TECHNICAL_ARCHITECTURE.md` §6 | "Database cụ thể sẽ được lựa chọn…" | Q1 chọn SQLite | Ghi: SQLite qua `node:sqlite` (Node mục tiêu theo Q1-a), lý do, giới hạn |
| `TECHNICAL_ARCHITECTURE.md` §8 | Harvest có "Update XP" | Phase 1 không có XP | Ghi chú: bước XP áp dụng từ Phase 2 |
| `TECHNICAL_ARCHITECTURE.md` §17 | Ví dụ `GET /api/player`, `GET /api/inventory` | Phase 1 dùng `GET /api/farm` (gồm kho) + `POST /api/session` | Cập nhật danh sách endpoint thực tế khi triển khai |
| `.nvmrc`, `package.json` `engines`, README | Node 22 / `>=22.12.0` | Không dùng được `node:sqlite` không cờ ở 22.12; Codespace chạy 24 | Cập nhật theo Q1-a ở Bước 1.3 |
| `.env.example`, README | Chưa có `DATABASE_PATH` | Cần cho Bước 1.3 | Thêm khi triển khai |

---

## 11. Rủi ro kỹ thuật

1. **`node:sqlite` chưa Stable** (RC ở Node 24.15+, Active development ở Node 22): API có thể thay đổi; cô lập trong `server/src/storage/`.
2. **Lệch runtime**: `.nvmrc` 22 vs Codespace 24 — đã chọn Node 24 (Q1); cập nhật `.nvmrc`/`engines`/README ở Bước 1.3.
3. **Token guest**: mất token = mất farm; lộ token = mất quyền kiểm soát; chưa có rate limit cho `POST /api/session` (có thể bị tạo player hàng loạt) — chấp nhận ở dev, cần xử lý trước khi deploy công khai.
4. **Replay/đồng thời**: dựa vào `action_log` + transaction; cần test đồng thời qua HTTP thật, không chỉ `inject`.
5. **Lệch đồng hồ**: chỉ ảnh hưởng hiển thị; server quyết định.
6. **Mất dữ liệu DB trên Codespaces** khi xóa Codespace; chưa có backup/migration ngoài `schema_version` đơn giản.
7. **CORS + `Authorization` khi deploy khác origin**: cần cho phép header này; dev qua proxy không ảnh hưởng.
8. **Phạm vi trôi** sang Coin/XP/shop — đã khóa bằng Q4.
9. **Dev bundle Phaser ~20 MB** ảnh hưởng thử trên điện thoại.

---

## 12. Thứ tự triển khai Phase 1

| Bước | Nội dung | Tiêu chí nghiệm thu chính |
|---|---|---|
| 1.0 | Chốt thiết kế (tài liệu này) | Game Director + ChatGPT duyệt; quyết định còn mở được chốt |
| 1.1 | Static data + contract `shared` | Mục 9 |
| 1.2 | Quy tắc farming thuần phía server (thời gian truyền vào) | Test trồng/thu hoạch/Ready đúng mốc/thiếu hạt/ô sai/refill; không số âm |
| 1.3 | Lưu trữ SQLite, `DATABASE_PATH`, schema, transaction; Node 24 (Q1, bản tối thiểu theo B-2) | Test DB tạm: schema, rollback, dữ liệu còn sau khi mở lại |
| 1.4 | `POST /api/session`, xác thực Bearer | Test: tạo player + 6 ô + 5 hạt mỗi loại; token sai → 401; chỉ lưu hash; token không vào log |
| 1.5 | API farm + request ID | Test: luồng đầy đủ; replay; `REQUEST_ID_REUSED`; đồng thời; không truy cập farm khác; dữ liệu sau khởi động lại |
| 1.6 | Client: session, tải farm, vẽ 6 ô + nút hạt + kho | Test logic thuần; trình duyệt thấy farm |
| 1.7 | Client: trồng/thu hoạch/refill, lỗi, mất kết nối | Test retry giữ `requestId`, map lỗi, khóa khi Offline |
| 1.8 | E2E thủ công + cập nhật tài liệu gốc (mục 10) | Kịch bản thủ công đạt trên trình duyệt Codespaces |

Kịch bản thủ công (Bước 1.8): lần đầu có 6 ô trống + 5 hạt mỗi loại → trồng (kho −1) → thu hoạch sớm bị từ chối → chín → thu hoạch (ô trống, kho +nông sản) → tải lại trang giữ nguyên → khởi động lại server giữ nguyên → dùng hết hạt và thu hoạch hết → cấp lại hạt (R1) → tắt server khi đang thao tác, bật lại → không mất/nhân đôi vật phẩm.

---

## 13. Quyết định còn cần xác nhận

Xem mục 0.5 (bản 1.6). **Bước 1.1 chưa bắt đầu.**
