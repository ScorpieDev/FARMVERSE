# PHASE 6 — STEP 6.1: THIẾT KẾ CHI TIẾT ECONOMY, MARKETPLACE VÀ TRADE

## Version

1.0 — 2026-10-12 · **Bản thiết kế chờ Game Director duyệt. Chưa có code gameplay Phase 6.**

## 0. Bối cảnh và phạm vi

Game Director duyệt **hướng thiết kế** P6-1…P6-6 (`PHASE6_ECONOMY_PLAN_REPORT.md`) ngày 2026-10-12, kèm điều kiện:

1. hoàn thiện thiết kế chi tiết và sơ đồ dữ liệu trước khi viết code;
2. server-authoritative, chống nhân đôi vật phẩm, giao dịch lặp, sửa số dư trái phép và giao dịch đồng thời;
3. tách rõ tiền kiếm trong game và tiền nạp, không để giao dịch sinh tiền trái phép;
4. giữ nguyên dữ liệu Phase 5, có kế hoạch migration và rollback;
5. kiểm thử tự động trong môi trường hiện có;
6. ghi rõ các quyết định còn chờ duyệt.

Tài liệu này mô tả **cách** thực hiện. Mọi con số vẫn là tạm thời. Các quyết định mới phát sinh nằm ở §11.

---

## 1. Nguyên tắc bất biến (invariant)

Mỗi bất biến dưới đây đều có test tự động (§10).

| # | Bất biến |
|---|---|
| I-1 | **Server quyết định mọi thứ.** Client chỉ gửi ý định (loại nông sản, số lượng, giá mỗi cái, ID listing / trade, request ID). Server tự tính tổng tiền, phí, số dư và quyền sở hữu. Client không bao giờ gửi số dư hay tổng tiền. |
| I-2 | **Không số dư âm.** `players.coins ≥ 0`, `inventory.quantity ≥ 0`, số lượng ký quỹ ≥ 0. Có CHECK trong DB, đồng thời kiểm tra trong code trước khi ghi. |
| I-3 | **Bảo toàn vật phẩm.** Với mỗi loại nông sản: tổng (túi đồ + ký quỹ listing + ký quỹ trade) của mọi người chơi chỉ thay đổi do **thu hoạch** (sinh) hoặc **bán cho NPC** (hủy). Marketplace và trade chỉ chuyển chỗ. |
| I-4 | **Bảo toàn coin.** Coin chỉ sinh ra từ nguồn trong danh sách cho phép (§3.1) và chỉ mất đi qua chỗ tiêu trong danh sách cho phép. Mỗi giao dịch giữa người chơi có tổng chênh lệch coin = −phí (phí là chỗ tiêu duy nhất của marketplace); trade có tổng = 0. |
| I-5 | **Không làm hai lần.** Cùng `(player, requestId)` thì chỉ thực hiện một lần; phát lại trả đúng kết quả đã lưu (cơ chế action log của Phase 1). Ngoài ra mỗi listing và trade có **trạng thái** chỉ đi một chiều (§5.3, §6.3), nên không thể mua quá phần còn lại hay chấp nhận một trade hai lần, kể cả với request ID khác. |
| I-6 | **Một transaction cho mỗi hành động.** Mọi thay đổi coin, vật phẩm, ký quỹ, trạng thái và sổ cái của một hành động nằm trong **một** transaction SQLite `BEGIN IMMEDIATE`; lỗi ở bất cứ đâu thì rollback toàn bộ. |
| I-7 | **Mọi thay đổi số dư do kinh tế đều được ghi sổ.** Mỗi thay đổi coin hoặc vật phẩm do hành động Phase 6 gây ra có đúng một dòng trong `economy_ledger`, ghi cùng transaction. Sổ chỉ thêm. |

---

## 2. Kiến trúc thực thi

### 2.1 Một điểm ghi duy nhất (choke point)

Mọi thay đổi số dư của Phase 6 đi qua **một module** `server/src/economy/balances.ts`. Hàm chính:

```
applyChanges(db, changes: BalanceChange[], context: LedgerContext): void
  BalanceChange = { playerId, coins?: delta, items?: { itemId: delta }, escrow?: ... }
  LedgerContext = { action, refType, refId, requestId, at }
```

Hàm này:
1. Kiểm tra mọi delta là số nguyên an toàn và `itemId` là nông sản được phép (P6-1).
2. Ghi bằng **câu UPDATE có điều kiện**, không đọc rồi ghi đè:
   `UPDATE players SET coins = coins + :d WHERE id = :p AND coins + :d >= 0`;
   nếu `changes ≠ 1` thì throw và cả transaction rollback. Vật phẩm cũng làm tương tự.
3. Thêm một dòng `economy_ledger` cho mỗi thay đổi khác 0.

Code ngoài module này **không** được sửa `coins` hay số nông sản cho mục đích kinh tế (sẽ có test grep). Thu hoạch và quest giữ cơ chế Phase 1–2, vốn đã nằm trong transaction và action log; xem §11 D6-7.

### 2.2 Giao dịch đồng thời

- `node:sqlite` là **đồng bộ**, và mỗi hành động chạy trọn trong `transaction()` không có `await` ở giữa. Vì vậy trong một tiến trình Node, hai request **không thể xen kẽ** nhau trong transaction: chúng được xếp hàng.
- `BEGIN IMMEDIATE` giữ khóa ghi ngay từ đầu, kèm `busy_timeout = 5000` và WAL (đã có), nên cũng an toàn nếu sau này có tiến trình thứ hai ghi cùng file. Khi đó lỗi `SQLITE_BUSY` sẽ được trả `503` để client thử lại cùng request ID.
- **Kiểm tra lại trong transaction:** mọi điều kiện (listing còn `open`, còn đủ số lượng, người mua đủ coin, trade còn `pending` và chưa hết hạn) được đọc **bên trong** transaction trước khi ghi. Câu UPDATE trạng thái cũng có điều kiện, ví dụ `UPDATE trade_offers SET status='accepted' WHERE id=? AND status='pending'` phải đổi đúng 1 dòng.
- **Test:** gửi song song nhiều request cùng mua một listing (`Promise.all`), chấp nhận cùng một trade từ hai request ID, và kiểm tra số dư cuối + sổ cái (§10).

### 2.3 Chống phát lại

- Dùng lại `action_log` (khóa `(player_id, request_id)`): chỉ ghi khi hành động thành công; phát lại cùng action và body → trả response đã lưu; cùng request ID mà khác action hoặc body → `REQUEST_ID_REUSED`.
- Riêng hành động **chạm tới người chơi thứ hai** (mua listing, chấp nhận trade): request ID thuộc về người thực hiện. Mọi thay đổi của người kia nằm trong cùng transaction và có tham chiếu `refId` trong sổ cái.

---

## 3. Tiền kiếm trong game và tiền nạp

### 3.1 Tiền kiếm trong game (soft currency) — `coins`

Đây là đơn vị tiền **duy nhất** của Phase 6.

| Loại | Hành động | Ghi sổ |
|---|---|---|
| **Sinh** (cho phép) | Thu hoạch (Phase 1), thưởng quest (Phase 2), **bán nông sản cho NPC** (Phase 6) | Thu hoạch / quest: action log (§11 D6-7). Bán NPC: `npc_sell` |
| **Tiêu** (cho phép) | Cửa hàng trang trí, cửa hàng cosmetic, **mua hạt giống**, **phí marketplace** | `npc_buy_seeds`, `market_fee` (Phase 3–4 giữ cơ chế cũ, §11 D6-7) |
| **Chuyển** (tổng = 0) | Marketplace (người mua → người bán), trade | `market_pay` / `market_receive`, `trade_give` / `trade_receive` |

**Không có đường nào khác tạo ra coin.** Danh sách `action` được cố định trong code (enum shared) và trong CHECK của DB (§4.1).

### 3.2 Tiền nạp trả phí (premium) — **không triển khai ở Phase 6**

FARMVERSE hiện **không có** tiền nạp, thanh toán hay premium currency; `GAME_DESIGN.md` chỉ nêu khả năng có trong tương lai. Thiết kế Phase 6 **chừa sẵn ranh giới** để sau này thêm vào mà không lẫn lộn:

1. Tiền nạp (nếu có) sẽ là một **số dư riêng** (bảng hoặc cột riêng), **không bao giờ** gộp vào `coins`.
2. **Không chuyển được giữa người chơi:** không vào được marketplace, không vào được trade (validator chỉ chấp nhận `coins` và nông sản).
3. **Không đổi qua lại tự do với `coins`.** Nếu có, mỗi chiều phải là một quyết định thiết kế riêng có giới hạn.
4. Chỉ sinh ra từ **biên nhận thanh toán đã xác minh ở server** của nhà cung cấp, không bao giờ từ client.
5. Cột `currency` của sổ cái hiện chỉ cho phép `'coins'` (CHECK). Muốn thêm đơn vị khác phải có migration và quyết định của Game Director.

Đây là quyết định chờ duyệt **D6-1** (§11): xác nhận Phase 6 chỉ có coin kiếm trong game.

---

## 4. Sơ đồ dữ liệu (schema v6, chỉ thêm)

DB hiện ở **v5**. Migration v6 **chỉ tạo bảng mới**, không sửa bảng hay dòng cũ.

```
players (v1) 1──* inventory (v1)            [có sẵn; coins và quantity có CHECK ≥ 0]
   │
   ├──* economy_ledger (v6)                 sổ cái, chỉ thêm
   ├──* market_listings (v6, seller_id)     ký quỹ = remaining
   ├──* trade_offers (v6, from_id / to_id)
   │       └──* trade_offer_lines (v6)      phần đưa / phần đòi
   └──* economy_daily (v6)                  bộ đếm giới hạn theo ngày (UTC)
```

### 4.1 `economy_ledger`

| Cột | Kiểu / ràng buộc | Ý nghĩa |
|---|---|---|
| `entry_id` | INTEGER PRIMARY KEY AUTOINCREMENT | thứ tự toàn cục |
| `player_id` | TEXT NOT NULL → players | ai bị thay đổi |
| `action` | TEXT NOT NULL CHECK IN (`npc_sell`, `npc_buy_seeds`, `market_list`, `market_cancel`, `market_expire`, `market_pay`, `market_receive`, `market_fee`, `trade_escrow`, `trade_give`, `trade_receive`, `trade_return`) | loại thay đổi |
| `currency` | TEXT CHECK (`currency` IS NULL OR `currency` = 'coins') | chỉ coin (§3.2) |
| `coins_delta` | INTEGER NOT NULL DEFAULT 0 | |
| `item_id` | TEXT NULL (nông sản) | |
| `item_delta` | INTEGER NOT NULL DEFAULT 0 | |
| `location` | TEXT NOT NULL CHECK IN (`wallet`, `inventory`, `listing_escrow`, `trade_escrow`, `burned`) | thay đổi xảy ra ở đâu |
| `ref_type` / `ref_id` | TEXT NULL (`listing` / `trade`), INTEGER NULL | |
| `request_id` | TEXT NOT NULL | request gây ra thay đổi |
| `created_at` | INTEGER NOT NULL | giờ server (ms) |

- CHECK: `coins_delta ≠ 0 OR item_delta ≠ 0`.
- Index: `(player_id, entry_id)`, `(ref_type, ref_id)`.
- **Chỉ thêm:** trigger `BEFORE UPDATE` / `BEFORE DELETE` trên `economy_ledger` gọi `RAISE(ABORT, 'ledger is append-only')`.

### 4.2 `market_listings`

| Cột | Kiểu / ràng buộc |
|---|---|
| `listing_id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `seller_id` | TEXT NOT NULL → players |
| `item_id` | TEXT NOT NULL (nông sản) |
| `quantity` | INTEGER NOT NULL CHECK 1–99 (lúc đăng) |
| `remaining` | INTEGER NOT NULL CHECK (0 ≤ remaining ≤ quantity) — **chính là ký quỹ** |
| `unit_price` | INTEGER NOT NULL CHECK (≥ 1) (khoảng [NPC, 10×NPC] kiểm tra trong code) |
| `status` | TEXT NOT NULL CHECK IN (`open`, `sold_out`, `cancelled`, `expired`) |
| `created_at`, `expires_at`, `closed_at` | INTEGER |

- CHECK: `(status = 'open') = (remaining > 0 AND closed_at IS NULL)` — hết hàng thì đóng; đã đóng thì không còn ký quỹ.
- Index: `(status, item_id, unit_price, listing_id)` để duyệt rẻ nhất trước; `(seller_id, status)` để đếm giới hạn 5 listing.

### 4.3 `trade_offers` và `trade_offer_lines`

`trade_offers`:

| Cột | Kiểu / ràng buộc |
|---|---|
| `trade_id` | INTEGER PRIMARY KEY AUTOINCREMENT |
| `from_id`, `to_id` | TEXT NOT NULL → players; CHECK (`from_id ≠ to_id`) |
| `status` | TEXT CHECK IN (`pending`, `accepted`, `declined`, `cancelled`, `expired`) |
| `created_at`, `expires_at`, `closed_at` | INTEGER |

`trade_offer_lines`: (`trade_id` → trade_offers, `side` CHECK IN (`give`, `ask`), `item_id` NULL hoặc nông sản, `coins` ≥ 0, `quantity` ≥ 0), PK (`trade_id`, `side`, `item_id`). Coin dùng một dòng có `item_id` NULL.

- **Ký quỹ của trade** là phần `give` khi `status = 'pending'`. Không cần bảng số dư riêng: tổng ký quỹ = tổng các dòng `give` của trade đang `pending`.
- Index: `(to_id, status)`, `(from_id, status)`.

### 4.4 `economy_daily`

`(player_id, day TEXT 'YYYY-MM-DD' UTC, trade_coins_received INTEGER ≥ 0, market_buys INTEGER ≥ 0)`, PK (`player_id`, `day`). Cập nhật trong cùng transaction với hành động.

### 4.5 Kiểm tra bảo toàn bằng truy vấn

Mỗi loại nông sản (I-3):

```
Σ inventory.quantity + Σ open listings.remaining + Σ pending trade 'give' lines
  = Σ thu hoạch đã thực hiện − Σ ledger npc_sell
```

Test chạy truy vấn này trước và sau một chuỗi thao tác ngẫu nhiên. Phần "thu hoạch" lấy theo số đã ghi trong test, vì thu hoạch không nằm trong sổ cái.

---

## 5. Cửa hàng NPC và marketplace — luồng chi tiết

### 5.1 Bán nông sản cho NPC — `POST /api/shop/sell { requestId, itemId, quantity }`

Trong một transaction:
1. Kiểm tra action log.
2. `itemId` phải là nông sản; `quantity` từ 1 tới 99.
3. Túi đồ có ≥ `quantity`.
4. `applyChanges`: túi đồ −q; coin +q × giá NPC. Ghi sổ `npc_sell` 2 dòng (inventory, wallet).
5. Ghi action log và trả `FarmState` + `sold { itemId, quantity, coins }`.

Lỗi: `ITEM_NOT_OWNED` (409), `INVALID_REQUEST` (400).

### 5.2 Mua hạt giống — `POST /api/shop/buy-seeds { requestId, cropId, quantity }`

- Cây phải đã mở khóa theo level (`LEVEL_TOO_LOW`); `quantity` từ 1 tới 99.
- Coin phải đủ q × giá hạt (`INSUFFICIENT_CURRENCY`).
- `applyChanges`: coin −, hạt +. Ghi sổ `npc_buy_seeds` (coin vào `burned`).
- Không ảnh hưởng cơ chế nạp hạt miễn phí.

### 5.3 Marketplace — trạng thái listing

```
           list
  (none) ───────▶ open ──buy (remaining→0)──▶ sold_out
                   │ ──cancel by seller────▶ cancelled  (remaining → seller)
                   │ ──now ≥ expires_at────▶ expired    (remaining → seller)
                   └─buy (remaining>0)──▶ open
```

Trạng thái chỉ đi một chiều; mọi lần chuyển đều là `UPDATE … WHERE status='open'`.

| Hành động | Kiểm tra (trong transaction) | Thay đổi (`applyChanges` + sổ cái) |
|---|---|---|
| **list** `{ itemId, quantity, unitPrice }` | level ≥ 2; < 5 listing `open`; giá trong [NPC, 10×NPC] (`PRICE_OUT_OF_RANGE`); túi đồ đủ | túi đồ −q (`market_list`, inventory); tạo listing `remaining = q` (`market_list`, listing_escrow +q) |
| **cancel** `{ listingId }` | listing của chính người gọi và đang `open` (khác thì `LISTING_NOT_FOUND`) | `remaining` → túi đồ (`market_cancel`); status `cancelled` |
| **buy** `{ listingId, quantity }` | level ≥ 2; listing `open` và chưa hết hạn; người mua ≠ người bán (`PERMISSION_DENIED`); q ≤ `remaining`; < 20 lần mua/ngày (`LIMIT_REACHED`); coin ≥ q × giá | người mua: coin −tổng (`market_pay`), nông sản +q; người bán: coin +(tổng − phí) (`market_receive`); `burned` +phí (`market_fee`); `remaining` −q, bằng 0 thì `sold_out` |
| **hết hạn** | `open` và `now ≥ expires_at` | `remaining` → túi đồ người bán (`market_expire`); status `expired` |

- **Phí:** `fee = max(1, ceil(total × 5 / 100))`, tính bằng số nguyên, không dùng float. Ví dụ 10 wheat × 2 coin = 20 → phí 1; người bán nhận 19.
- **Hết hạn:** xử lý **lười**. Mọi đọc hoặc ghi listing trong transaction đều đóng trước những listing đã quá hạn mà nó chạm tới. Ngoài ra một **sweep** định kỳ (60 s, mỗi lần một transaction) trả ký quỹ của các listing quá hạn. Hai đường dùng chung một hàm.
- **Duyệt:** `GET /api/market?itemId=…&cursor=…` trả tối đa 20 listing `open`, chưa hết hạn, sắp theo giá rồi ID. Người bán hiện bằng **mã farm và tên**, không có player ID. Listing của chính mình lấy qua `GET /api/market/mine`.
- **Thông báo:** sau khi commit, nếu người bán đang online thì gửi WS `market_sold { listingId, itemId, quantity, coins }`. Message không mang trạng thái quyết định; client tự tải lại `FarmState`.

---

## 6. Trade trực tiếp — luồng chi tiết

### 6.1 Tạo đề nghị — `POST /api/trades/offer { requestId, toFarmCode, give[], ask[] }`

- Mỗi phần (`give`, `ask`) gồm danh sách nông sản và số lượng, cùng với coin.
- Mỗi phía tối đa 5 dòng; mỗi số lượng từ 1 tới 99.
- Coin mỗi phía từ 0 tới 500; hai phía không được cùng rỗng.

Kiểm tra trong transaction:
1. Người gửi đạt level ≥ 2. Người nhận phải tồn tại (không có thì `TRADE_NOT_FOUND`, xem D6-5), khác người gửi, và cũng đạt level ≥ 2 (`PERMISSION_DENIED`).
2. Người gửi có < 3 đề nghị `pending`.
3. Người gửi **đủ** phần `give`.

Thay đổi:
- Phần `give` chuyển vào ký quỹ (`trade_escrow`), ghi sổ.
- Tạo trade `pending`, `expires_at = now + 10 phút`.
- Sau khi commit, gửi WS `trade_offer` cho người nhận nếu đang online.

### 6.2 Chấp nhận — `POST /api/trades/accept { requestId, tradeId }` (người nhận)

Trong transaction:
1. Trade tồn tại, `to_id` = người gọi, `pending`, chưa hết hạn. Nếu đã hết hạn: xử lý hết hạn ngay rồi trả `TRADE_EXPIRED`.
2. Người nhận **đủ** phần `ask` (nếu không: `INSUFFICIENT_CURRENCY` / `ITEM_NOT_OWNED`; trade vẫn `pending`).
3. Giới hạn ngày: coin người nhận và người gửi nhận được qua trade hôm nay + phần mới ≤ 1000 (`LIMIT_REACHED`).
4. `UPDATE trade_offers SET status='accepted' … WHERE trade_id=? AND status='pending'` phải đổi đúng 1 dòng.
5. `applyChanges` cho cả hai phía:
   - ký quỹ `give` → người nhận (`trade_receive`);
   - phần `ask` của người nhận → người gửi (`trade_give` / `trade_receive`).
6. Cập nhật `economy_daily`.

Sau khi commit, gửi WS `trade_update { tradeId, status }` cho cả hai bên.

### 6.3 Trạng thái trade

```
pending ──accept (to)──▶ accepted
   │ ───decline (to)───▶ declined   (escrow → from)
   │ ───cancel (from)──▶ cancelled  (escrow → from)
   └───now ≥ expires_at▶ expired    (escrow → from)
```

- Hết hạn xử lý lười và bằng sweep, giống listing.
- `GET /api/trades` trả các đề nghị gửi đi và nhận được (pending, kèm 20 cái đã đóng gần nhất); người chơi hiện bằng mã farm và tên.

---

## 7. Contract API và protocol

- **HTTP:** các endpoint ở §5–6 kèm `GET /api/market`, `GET /api/market/mine`, `GET /api/trades`.
  - Mọi POST có `requestId` (UUID v4) và giới hạn body 1 KB như hiện nay.
  - Validator shared chỉ kiểm tra **cấu trúc**; luật chơi do server kiểm tra.
- **Mã lỗi mới** (shared `errors.ts`), mỗi mã một HTTP status:

| Mã | HTTP |
|---|---|
| `INVALID_TRANSACTION` | 409 |
| `LISTING_NOT_FOUND` | 404 |
| `TRADE_NOT_FOUND` | 404 |
| `TRADE_EXPIRED` | 409 |
| `PERMISSION_DENIED` | 403 |
| `LIMIT_REACHED` | 409 |
| `PRICE_OUT_OF_RANGE` | 409 |

  Dùng lại `INSUFFICIENT_CURRENCY`, `ITEM_NOT_OWNED`, `LEVEL_TOO_LOW`, `REQUEST_ID_REUSED`.
- **WebSocket protocol 3:** thêm các message server → client `market_sold`, `trade_offer`, `trade_update`.
  - Đây chỉ là thông báo; dữ liệu chuẩn luôn lấy qua HTTP.
  - Client và server được nâng lên protocol 3 trong cùng một commit (giống protocol 2).
  - Client protocol 2 cũ nhận `UNSUPPORTED_PROTOCOL_VERSION` và được yêu cầu tải lại trang.

## 8. Giao diện client (tóm tắt, làm ở bước client)

- **Nút Market** trên farm, mở màn hình có các tab:
  - **Sell** (bán cho NPC, chọn số lượng);
  - **Seeds** (mua hạt);
  - **Market** (duyệt theo loại, mua theo số lượng);
  - **My listings** (đăng bán, hủy).
- **Trade:**
  - trong phòng farm, chạm vào nhân vật khác → **Trade**; hoặc nhập mã farm;
  - màn hình Trade có danh sách đề nghị đến và đi, cùng Accept / Decline / Cancel.
- Mọi tổng tiền và phí hiển thị ở client **chỉ để tham khảo**; con số cuối cùng do server trả về.

## 9. Migration v5 → v6 và rollback

### 9.1 Migration

- Thêm migration thứ 6 vào `server/src/storage/database.ts`, theo đúng cơ chế v2–v5:
  - chạy trong một transaction (lỗi thì rollback, DB giữ nguyên v5);
  - mọi câu lệnh đều idempotent (`CREATE TABLE IF NOT EXISTS`, trigger `IF NOT EXISTS`);
  - **không sửa** bảng hay dòng nào của v1–v5.
- Dữ liệu Phase 5 (`player_profile`, farm, nhân vật, trang trí) giữ nguyên. Test so sánh snapshot trước/sau như các lần migrate trước.
- **Sao lưu trước khi migrate (mới, D6-2):** khi mở DB file thấy `schema_version < SCHEMA_VERSION`, server dùng `VACUUM INTO` chép DB ra `server/data/backups/farmverse-v5-<time>.db` **trước** khi chạy migration. Thư mục `server/data/` đã được git-ignore. DB `:memory:` bỏ qua bước này.

### 9.2 Rollback

| Tình huống | Cách rollback | Mất dữ liệu? |
|---|---|---|
| Migration lỗi giữa chừng | Tự động: transaction rollback, DB vẫn v5, server dừng với lỗi rõ ràng | Không |
| Quay lại code Phase 5 **trước khi** có giao dịch Phase 6 | Khôi phục file sao lưu v5, hoặc chạy script down (bên dưới) | Không |
| Quay lại code Phase 5 **sau khi** đã có giao dịch | Script down `server/scripts/rollback-v6.ts`, chạy **có chủ đích** và trong một transaction: (1) trả mọi ký quỹ (listing `open`, trade `pending`) về túi đồ / ví chủ sở hữu; (2) chuyển `economy_ledger` ra file JSON lưu trữ; (3) drop các bảng v6; (4) đặt `schema_version = 5` | Không mất vật phẩm hay coin. Lịch sử listing / trade được lưu ra file JSON |

- Server Phase 5 mở DB v6 sẽ **từ chối chạy** ("schema newer than supported", đã có sẵn). Nhờ vậy không thể vô tình chạy code cũ trên dữ liệu mới.
- Script down có test: v5 → v6 → tạo listing / trade → down → v5. Test kiểm tra túi đồ và coin bằng tổng ban đầu cộng các giao dịch đã hoàn tất, và các bảng v1–v5 không đổi.

## 10. Kế hoạch kiểm thử (tự động, môi trường hiện có)

| Loại | Nội dung |
|---|---|
| Unit (shared) | Bảng giá, khoảng giá, validator cấu trúc, phí số nguyên (biên: tổng = 1, 19, 20, 21, 1980) |
| Unit (server, thuần) | Từng luật ở §5–6 với mọi nhánh lỗi; máy trạng thái listing / trade (không chuyển ngược) |
| `balances.ts` | Delta âm vượt số dư → throw và rollback; mỗi delta có đúng một dòng sổ; trigger chặn UPDATE / DELETE sổ |
| Integration (HTTP thật, DB tạm) | Mọi endpoint: thành công, mọi mã lỗi, 401, phát lại cùng request ID (không làm hai lần), request ID dùng lại với body khác |
| **Đồng thời** | 10 request song song mua cùng một listing có `remaining = 5` → tổng bán đúng 5, không ai trả tiền mà không nhận hàng; 2 request ID khác nhau cùng chấp nhận một trade → đúng 1 thành công; hủy và mua cùng lúc; hết hạn và chấp nhận cùng lúc |
| **Bất biến (ngẫu nhiên có seed)** | 500 thao tác ngẫu nhiên (list / buy / cancel / offer / accept / decline / expire / NPC) giữa 5 người chơi → kiểm I-2, I-3, I-4 sau mỗi bước bằng truy vấn §4.5 và tổng sổ cái |
| Sửa số dư trái phép | Client gửi `price`, `total`, `coins` trong body → bị bỏ qua hoặc `INVALID_REQUEST`; test grep: không module nào ngoài `balances.ts` cập nhật `coins` cho hành động Phase 6 |
| Migration | v5 → v6 giữ snapshot mọi bảng cũ; chạy lại không nhân đôi; lỗi giữa chừng → rollback; sao lưu được tạo; script down |
| E2E | Chromium headless hai người chơi, local và qua URL Codespaces (như Phase 5) |

**Chưa kiểm thử thực tế** (hoãn theo quyết định của Game Director): thiết bị Android/iOS, trình duyệt thật đã đăng nhập, tải lớn.

## 11. Quyết định chờ Game Director duyệt

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| D6-1 | Tiền tệ của Phase 6 | Chỉ coin kiếm trong game; không có tiền nạp. Ranh giới cho tiền nạp tương lai như §3.2 (số dư riêng, không chuyển, không gộp) |
| D6-2 | Sao lưu tự động trước migrate | Có: `VACUUM INTO server/data/backups/` mỗi khi DB file cần nâng schema |
| D6-3 | Hiển thị người bán / người mua | Mã farm + tên; người bán không thấy ai mua (chỉ thấy "đã bán") |
| D6-4 | Hết hạn | Lười + sweep mỗi 60 s; listing 24 h, trade 10 phút |
| D6-5 | Lỗi khi mã farm nhận trade không tồn tại | `TRADE_NOT_FOUND` (404), không dùng `ROOM_NOT_FOUND` của phòng |
| D6-6 | Số liệu tạm thời | Giá NPC và giá hạt §2.2 của kế hoạch; phí 5% (tối thiểu 1); giới hạn 5 listing, 3 trade chờ, 500 coin / trade, 1000 coin trade nhận / ngày, 20 lần mua / ngày; level ≥ 2 |
| D6-7 | Thu hoạch / quest / cửa hàng Phase 3–4 có ghi sổ cái không | Chưa ở Phase 6: các luồng này đã có transaction và action log. Đề xuất đưa vào sổ cái ở Phase 8 (anti-abuse) để có kiểm toán đầy đủ |
| D6-8 | WebSocket protocol 3 | Chỉ thông báo (`market_sold`, `trade_offer`, `trade_update`); dữ liệu chuẩn qua HTTP |

## 12. Các bước triển khai (sau khi duyệt bản thiết kế này)

| Bước | Nội dung |
|---|---|
| 6.2 | Shared: giá, validator, mã lỗi, kiểu dữ liệu; server: schema v6, sao lưu, `balances.ts` + sổ cái + trigger; script down; cửa hàng NPC (bán nông sản, mua hạt) |
| 6.3 | Marketplace (đăng, hủy, mua, hết hạn, sweep, giới hạn) + test đồng thời và bất biến |
| 6.4 | Trade (đề nghị, chấp nhận, từ chối, hủy, hết hạn) + protocol 3 |
| 6.5 | Client Market và Trade |
| 6.6 | E2E (local, Codespaces), kiểm tra bất biến trên DB dev, báo cáo đóng phase |
