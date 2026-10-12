# PHASE 6 — ECONOMY: KẾ HOẠCH THIẾT KẾ

## Version

1.0 — 2026-10-12 (bản nháp, chờ Game Director duyệt P6-1…P6-6).

## Trạng thái

**Chưa viết code.** Game Director yêu cầu chỉ viết code Phase 6 sau khi kế hoạch này được duyệt. Mọi con số dưới đây là tạm thời.

- **Roadmap** (`DEVELOPMENT_ROADMAP.md`): Coins, Shop, Marketplace, Buying, Selling, Transactions, Economy validation.
- **Thiết kế:**
  - `GAME_DESIGN.md` §7–9: coin là tiền ảo; marketplace do server kiểm soát; trading trực tiếp gồm request, kiểm tra vật phẩm / quyền sở hữu / số lượng, xác nhận, transaction ở server.
  - `GAME_RULES.md` §5–9: client không tạo hay sửa coin, vật phẩm, giá. Marketplace kiểm tra seller, item, ownership, quantity, price, buyer, currency. Trade cần **hai bên xác nhận**.
  - `GAME_RULES.md` §18–20: không pay-to-win; chống nhân bản vật phẩm / coin, phát lại request, giao dịch đôi.
  - `TECHNICAL_ARCHITECTURE.md` §9 (luồng marketplace kèm transaction log), §12 (request ID), §18 (mã lỗi như `INVALID_TRANSACTION`, `TRADE_EXPIRED`, `PERMISSION_DENIED`), §19 (log giao dịch coin / vật phẩm / trade / marketplace).
- **Ngoài phạm vi:**
  - tiền thật và premium currency;
  - đấu giá;
  - chat (Phase 7), trộm (Phase 8);
  - giao dịch cosmetic.

---

## 1. Hiện trạng kinh tế (sau Phase 5)

| Nguồn coin (tạo ra) | Nơi tiêu coin |
|---|---|
| Thu hoạch: wheat 2, carrot 6, tomato 12, corn 9, strawberry 20 | Cửa hàng trang trí: 5–300 |
| Thưởng quest: 10–80 | Cửa hàng cosmetic: 40–100 |

Vật phẩm hiện có:
- **hạt giống**: miễn phí — được nạp lại 5 hạt/loại khi đã hết, chờ 60 s;
- **nông sản**: tích lũy sau mỗi lần thu hoạch nhưng **chưa có công dụng**;
- **trang trí chưa đặt**;
- **cosmetic**.

Vấn đề chính: nông sản chất đống vô dụng, và người chơi chưa có cách nào trao đổi với nhau.

---

## 2. Đề xuất

### 2.1 Vật phẩm được giao dịch (P6-1, đề xuất T-A: chỉ nông sản)

- Trong Phase 6, chỉ **5 loại nông sản** được bán cho NPC, rao trên marketplace hoặc trade.
- **Không giao dịch được:**
  - hạt giống (miễn phí, nếu trao đổi sẽ phá cơ chế nạp lại);
  - trang trí (để sau);
  - **cosmetic**: thuộc về nhân dạng và bộ sưu tập, không bị trộm (`GAME_RULES.md` §10–11), và tránh mở đường cho mua bán bằng tiền thật.
- Phương án khác T-B: thêm trang trí chưa đặt vào danh sách giao dịch.

### 2.2 Cửa hàng NPC (P6-2, đề xuất N-A)

- **Bán nông sản cho NPC** với giá cố định, khoảng một nửa thưởng coin khi thu hoạch, để không làm phình coin:

| Nông sản | Giá NPC mua (coin/cái) |
|---|---|
| Wheat | 1 |
| Carrot | 3 |
| Tomato | 6 |
| Corn | 4 |
| Strawberry | 10 |

- **Mua hạt giống bằng coin** (chỗ tiêu coin mới): wheat 1, carrot 2, tomato 4, corn 3, strawberry 6. Chỉ mua được hạt của cây đã mở khóa theo level. Cơ chế nạp hạt miễn phí của Phase 1 vẫn giữ làm lưới an toàn.
- Mua và bán đều theo số lượng (1–99), có request ID, nằm trong một transaction.

### 2.3 Marketplace giữa người chơi (P6-3, đề xuất M-A: giá cố định có ký quỹ)

- **Đăng bán:** người bán rao N nông sản với **giá mỗi cái** do mình đặt.
  - Vật phẩm được **chuyển vào ký quỹ ngay khi đăng**, nên không thể bán một thứ hai lần.
  - Giá được giới hạn trong khoảng **[giá NPC, 10 × giá NPC]**, để chặn chuyển coin trá hình và giá vô lý.
- **Mua:** người mua chọn số lượng ≤ phần còn lại của listing.
  - Server kiểm tra listing còn hiệu lực, người mua không phải người bán, người mua đủ coin.
  - Trong **một transaction**: trừ coin người mua, cộng nông sản cho người mua, cộng coin cho người bán trừ **phí 5%** (làm tròn lên, tối thiểu 1). Phí là chỗ tiêu coin.
- **Hủy listing:** phần chưa bán trả về túi đồ người bán.
- **Hết hạn sau 24 giờ:** phần chưa bán tự trả về túi đồ (kiểm tra mỗi khi đọc listing và định kỳ).
- **Giới hạn:** tối đa 5 listing đang mở mỗi người; số lượng 1–99 mỗi listing.
- **Duyệt:** danh sách theo loại nông sản, rẻ nhất trước, phân trang.
- **Thông báo:** người bán thấy kết quả khi mở lại màn hình Market. Khi online, người bán nhận thông báo realtime "đã bán".
- Phương án khác M-B: đấu giá — phức tạp hơn, dễ bị thao túng.

### 2.4 Trade trực tiếp (P6-4, đề xuất D-A: đề nghị và chấp nhận)

- **Tạo đề nghị:** người A gửi đề nghị tới mã farm của B — "tôi đưa X, đổi lấy Y". X và Y là nông sản và/hoặc coin.
  - Phần A đưa ra được **ký quỹ ngay khi tạo**; đây là xác nhận của A.
- **Chấp nhận:** B bấm **Accept** (xác nhận của B).
  - Server kiểm tra lại B còn đủ phần Y rồi hoán đổi cả hai phía **trong một transaction**.
- B có thể **từ chối**, A có thể **hủy**. Đề nghị **hết hạn sau 10 phút**; khi đó phần ký quỹ trả lại cho A.
- **Giới hạn:**
  - mỗi người tối đa 3 đề nghị đang chờ;
  - coin trong một trade tối đa 500;
  - không trade với chính mình.
- B nhận thông báo realtime nếu đang online; nếu offline thì thấy đề nghị khi mở màn hình Trade.
- Đề nghị được tạo **trong phòng farm** (chạm vào một nhân vật → Trade) hoặc **bằng mã farm**.
- Phương án khác D-B: cửa sổ trade realtime, hai bên cùng chỉnh rồi cùng xác nhận — UX phức tạp hơn, cần cả hai cùng online.

### 2.5 Chống lạm dụng (P6-5, đề xuất A-A)

- **Phải đạt level 2** mới dùng marketplace và trade, nhằm hạn chế tạo tài khoản phụ để chuyển coin. Bán cho NPC thì không giới hạn level.
- **Giới hạn mỗi ngày (theo giờ server):**
  - tối đa **1000 coin nhận được** qua trade;
  - tối đa **20 lần mua** trên marketplace.
- Mọi hành động kinh tế đều có request ID: phát lại thì trả kết quả cũ, không thực hiện hai lần (giống Phase 1–4).

### 2.6 Sổ cái giao dịch (P6-6, đề xuất L-A: bắt buộc theo `TECHNICAL_ARCHITECTURE.md` §19)

- Bảng **`economy_ledger`** chỉ thêm, không sửa, không xóa. Mỗi thay đổi coin hoặc vật phẩm do hành động kinh tế gây ra là một dòng: người chơi, loại hành động, chênh lệch coin, vật phẩm, chênh lệch số lượng, mã tham chiếu (listing hoặc trade), request ID, thời điểm.
- Test bất biến: tổng chênh lệch của mỗi giao dịch giữa người chơi phải khớp. Coin chỉ biến mất đúng bằng phí; vật phẩm không sinh ra hay mất đi.
- Phần thưởng thu hoạch và quest **chưa** ghi vào sổ ở Phase 6 (đã có action log); cân nhắc ở Phase 8.

### 2.7 Dữ liệu và API (tóm tắt)

- **Schema v6** (DB hiện ở v5; chỉ thêm): `economy_ledger`, `market_listings`, `trade_offers`, bộ đếm giới hạn theo ngày.
- **HTTP:**
  - `POST /api/shop/sell`, `POST /api/shop/buy-seeds`;
  - `GET /api/market` (lọc theo nông sản, phân trang), `POST /api/market/list`, `POST /api/market/cancel`, `POST /api/market/buy`;
  - `GET /api/trades`, `POST /api/trades/offer`, `POST /api/trades/accept`, `POST /api/trades/decline`, `POST /api/trades/cancel`.
- **WebSocket:** thêm message server → client `market_sold` và `trade_offer` / `trade_update`. Đây là thay đổi protocol; client và server được cập nhật cùng lúc.
- **Mã lỗi mới (theo §18):** `INVALID_TRANSACTION`, `LISTING_NOT_FOUND`, `TRADE_NOT_FOUND`, `TRADE_EXPIRED`, `PERMISSION_DENIED`, `LIMIT_REACHED`, `PRICE_OUT_OF_RANGE`. Dùng lại: `INSUFFICIENT_CURRENCY`, `ITEM_NOT_OWNED`, `LEVEL_TOO_LOW`.

---

## 3. Quyết định cần Game Director duyệt

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| P6-1 | Vật phẩm giao dịch được | T-A: chỉ 5 loại nông sản; không giao dịch hạt giống, trang trí, cosmetic |
| P6-2 | Cửa hàng NPC | N-A: bán nông sản và mua hạt giống theo bảng §2.2 (tạm thời); giữ nạp hạt miễn phí |
| P6-3 | Marketplace | M-A: giá cố định, ký quỹ khi đăng, giá trong [NPC, 10×NPC], phí 5%, hết hạn 24 h, tối đa 5 listing |
| P6-4 | Trade trực tiếp | D-A: đề nghị + chấp nhận, ký quỹ phía người gửi, hết hạn 10 phút, coin ≤ 500/trade |
| P6-5 | Chống lạm dụng | A-A: level ≥ 2 cho market / trade; ≤ 1000 coin nhận qua trade và ≤ 20 lần mua mỗi ngày |
| P6-6 | Sổ cái | L-A: bảng `economy_ledger` chỉ thêm, test bất biến bảo toàn |

## 4. Các bước (sau khi duyệt)

| Bước | Nội dung |
|---|---|
| 6.1 | Shared: bảng giá NPC, kiểu dữ liệu listing / trade / ledger, validator, mã lỗi |
| 6.2 | Server: schema v6 (ledger, listings, trades, bộ đếm ngày), cửa hàng NPC (bán nông sản, mua hạt) có ghi sổ |
| 6.3 | Server: marketplace (đăng, hủy, mua, hết hạn, phí, giới hạn) |
| 6.4 | Server: trade trực tiếp (đề nghị, chấp nhận, từ chối, hủy, hết hạn) + thông báo WebSocket |
| 6.5 | Client: màn hình Market (bán NPC, mua hạt, marketplace) và Trade (từ phòng farm hoặc bằng mã farm) |
| 6.6 | E2E nhiều người chơi (local và qua URL Codespaces), kiểm tra bất biến sổ cái, báo cáo đóng phase |

## 5. Rủi ro và cách kiểm thử

- **Nhân bản / mất vật phẩm hoặc coin.**
  - Mọi thay đổi nằm trong một transaction SQLite; dùng request ID.
  - Test bất biến bảo toàn trên sổ cái; test đồng thời (nhiều người cùng mua một listing, chấp nhận trade hai lần).
- **Lạm phát coin:** giá NPC thấp hơn thưởng thu hoạch; phí marketplace và mua hạt là chỗ tiêu coin. Giá trị tạm thời, chỉnh sau playtest.
- **Chuyển coin qua tài khoản phụ:** dùng khoảng giá, yêu cầu level, giới hạn theo ngày. Chống lạm dụng đầy đủ để Phase 8.
- **Chưa kiểm thử thực tế:** thiết bị Android/iOS, trình duyệt thật đã đăng nhập, tải lớn. Vẫn theo quyết định hoãn của Game Director, sẽ ghi rõ ở từng bước.
