# PHASE 3 — STEP 3.4: CỬA HÀNG VẬT PHẨM TRANG TRÍ (COIN)

## Version

1.0 — 2026-10-11.

## Trạng thái

XONG.

## Quyết định

| # | Quyết định | Ai chốt |
|---|---|---|
| P3-4 | **S-A: mua bằng coin**, giá cố định, mở theo level. Gỡ vật phẩm thì trả về kho, **không hoàn coin**, không bán lại. Đây là chỗ tiêu coin đầu tiên; quyết định P2-6 ("chưa có chỗ tiêu coin") chỉ áp dụng cho Phase 2. Không có tiền thật hay nạp tiền. | Game Director, 2026-10-11 |
| P3-5 | Giá và level theo bảng 2.2 của kế hoạch (tạm thời, chỉnh sau) | Game Director, 2026-10-11 (nằm trong phương án đã chọn) |
| P3-6 | Chế độ Edit, chạm để đặt, Move / Remove, không kéo-thả | Đã làm ở Step 3.3 |
| D-3.4a | Mua **1 vật phẩm mỗi request**. Không có số lượng hay giỏ hàng, vì mỗi lần mua là một request ID với một transaction | Claude (đơn giản, chi tiết kỹ thuật) |
| D-3.4b | Cửa hàng nằm **trong chế độ Edit** (nút Buy), không làm màn hình cửa hàng riêng | Claude (giao diện đơn giản, ít màn hình) |
| D-3.4c | Vật phẩm trang trí **chỉ hiện trong chế độ Edit**; màn hình farm thường giữ bố cục Phase 2. Xem lại ở Phase 5 (thăm nông trại) | Claude (không đổi bố cục Phase 2) |

| Vật phẩm | Kích thước | Giá | Level |
|---|---|---|---|
| Fence | 1×1 | 5 | 1 |
| Path | 1×1 | 5 | 1 |
| Flower Bed | 1×1 | 20 | 2 |
| Bush | 1×1 | 30 | 3 |
| Bench | 1×1 | 60 | 4 |
| Tree | 2×2 | 120 | 5 |
| Small House | 2×2 | 300 | 6 |

---

## 1. Đã làm

- **Shared** (`shared/src/building.ts`, `api.ts`, `errors.ts`):
  - Thêm `price` và `unlockLevel` vào danh mục vật phẩm.
  - `POST /api/shop/buy` với body `{ requestId, decorationId }`, phản hồi `BuyDecorationResponse` = `FarmState` + `bought { decorationId, price }`.
  - Validator; mã lỗi mới `INSUFFICIENT_CURRENCY` (tên lấy theo `TECHNICAL_ARCHITECTURE.md` §18).
- **Server:**
  - `server/src/building/shop.ts` (`buyDecoration`, hàm thuần): kiểm tra level trước (`LEVEL_TOO_LOW`), rồi coin (`INSUFFICIENT_CURRENCY`); trừ coin và cộng 1 vật phẩm vào kho.
  - Endpoint trong `farming/routes.ts` chạy chung `runAction`: request ID, một transaction lưu cả coin và kho, action log.
  - Client không gửi giá hay số lượng; nếu có gửi thì server bỏ qua.
  - Không cần đổi schema: coin nằm ở `players`, kho ở `decoration_stock` (v3).
- **Client:**
  - Nút vật phẩm hiện tên, số đang có, giá (`Fence ×0 · 5c`), hoặc `Level N` nếu còn khóa.
  - Chọn được vật phẩm đã mở kể cả khi chưa có cái nào. Nút **Buy** sáng màu khi đủ coin; đây chỉ là gợi ý, server mới là bên quyết định.
  - Dòng trạng thái hiện số coin (`Coins 75 · Tree: 120 coins · tap Buy`).
  - Đặt vật phẩm khi chưa có thì hiện "Tap Buy (N coins)" và không gửi request.
  - Thông báo lỗi: "Not enough coins for that. Harvest crops to earn more.", "Reach a higher level to buy that."
  - Thanh nút hành động: Rotate / Remove / Buy / Done.

---

## 2. Tệp thay đổi

| Tệp | Thay đổi |
|---|---|
| `shared/src/building.ts`, `building.test.ts` | Giá, level |
| `shared/src/api.ts`, `api.test.ts` | Đường dẫn, kiểu, validator mua |
| `shared/src/errors.ts`, `errors.test.ts` | `INSUFFICIENT_CURRENCY` |
| `server/src/building/shop.ts`, `shop.test.ts` | Mới — luật mua |
| `server/src/farming/routes.ts` | Endpoint `POST /api/shop/buy` |
| `server/src/building/routes.test.ts` | Test API mua |
| `client/src/farm/buildView.ts`, `buildView.test.ts` | Chọn, mua, nhãn, thông báo |
| `client/src/farm/farmLayout.ts`, `farmLayout.test.ts` | Nút Buy, cỡ chữ nút hành động |
| `client/src/farm/FarmScene.ts` | Nút Buy, màu nút, gửi request mua |
| `client/src/network/farmApi.ts`, `farmApi.test.ts` | `buyDecoration` |
| `docs/…` | Báo cáo này, `CURRENT_STATUS.md`, `CHANGELOG.md`, `docs/reports/README.md`, trạng thái kế hoạch Phase 3 |

Không đổi: database (vẫn v3), giao thức WebSocket, luật farming / quest / level. Không đụng tới các tệp WebSocket/Codespaces chưa commit.

---

## 3. Kiểm tra

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | Sạch |
| `npm test` | shared 376 (+7), server 532 (+24), client 186 (+6) — **1094 passing** |
| `npm run build -w client` | OK |
| Bản sao sạch chỉ chứa nội dung commit (không có thay đổi WebSocket) | Typecheck sạch; shared 376, server 526 (thiếu 6 test riêng của thay đổi WebSocket), client 186; build OK |

Test server bao phủ:

- Mua thành công rồi đặt được vật phẩm vừa mua.
- XP, level, ô đất, hạt giống, quest không đổi.
- Thiếu coin (không trừ coin); level thấp; dữ liệu sai dạng (400); client gửi giá hoặc số lượng thì bị bỏ qua.
- Gửi lại cùng request ID thì không trừ coin hai lần; dùng lại request ID cho body khác thì `REQUEST_ID_REUSED`; request ID mới thì trừ tiếp.
- Thiếu token (401); gỡ vật phẩm thì không hoàn coin.

### Trình duyệt (headless Chromium, local): 19/19

- Server riêng ở cổng 3100 với database tạm trong scratchpad, Vite ở cổng 5174. Không đụng dev server hay database của người chơi.
- Người chơi thử được cho 200 coin và level 5 trực tiếp trong database tạm.
- Kịch bản:
  - Chọn Fence khi chưa có → gợi ý mua. Buy → coin 200 → 195, rồi đặt. Fence vẫn được chọn để mua tiếp.
  - Small House hiện "unlocks at level 6".
  - Mua Tree → 75 coin, rồi đặt. Mua Tree lần hai → "Not enough coins", không bị trừ.
  - Gỡ Tree → về kho, không hoàn coin.
  - Màn hình ngang, ô ≥ 44 CSS px. Done → màn hình farm hiện "Coins 75".
  - Tải lại trang thì coin, kho và bố cục vẫn giữ.
  - Người chơi mới có 0 coin không mua được.
- Đã xem ảnh chụp dọc và ngang.

Chưa kiểm tra: thiết bị thật, qua URL Codespaces.

---

## 4. Vấn đề còn lại

- Giá và level là tạm thời. Hiện coin chỉ đến từ thu hoạch và nhiệm vụ: người chơi level 5 có khoảng 1 000 coin, đủ mua vài vật phẩm lớn.
- Ở các bước trước, Step 3.3 E2E có kiểm tra "player without decorations sees the empty hint". Hành vi này đã đổi có chủ đích: giờ chọn được vật phẩm để mua. Kịch bản 3.3 không chạy lại; kịch bản 3.4 thay thế nó.
- Phase 3 còn: kiểm tra end-to-end trên thiết bị hoặc qua URL Codespaces và đóng Phase 3 (closeout).
