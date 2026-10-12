# PHASE 4 — STEP 4.2: SERVER NHÂN VẬT

## Version

1.0 — 2026-10-12.

## Trạng thái

**XONG.** Làm theo P4-1…P4-4 đã duyệt. Không đổi kiến trúc: dùng lại mẫu của Phase 3 (rules thuần, migration chỉ thêm, request ID, transaction). Không đụng 10 file WebSocket/Codespaces chưa commit.

## 1. Thay đổi

- **Contract (`shared/src/api.ts`)**
  - `FarmState.character` = `{ appearance, owned }`. `appearance` gồm skin, hair, shirt, pants; `owned` liệt kê món đã sở hữu theo thứ tự catalog.
  - Kế hoạch §2.5 ghi các trường `skin / equipped / owned`. Bản cài đặt gộp skin và đồ đang mặc vào `appearance`; nội dung không đổi.
  - Validator: `isCharacterState` (món đang mặc phải đã sở hữu, đủ món khởi đầu, không trùng), `isEquipCharacterRequest`, `isBuyCosmeticRequest`, `isBuyCosmeticResponse`.
- **Rules (`server/src/character/rules.ts`)**
  - `createStarterCharacter` và `assertCharacterData`.
  - `equipAppearance`: thay toàn bộ ngoại hình. Mặc món chưa sở hữu trả `ITEM_NOT_OWNED`.
  - `buyCosmetic`: kiểm tra lần lượt `ALREADY_OWNED`, `LEVEL_TOO_LOW`, `INSUFFICIENT_CURRENCY`. Giá lấy từ catalog; mua xong không tự mặc.
- **Schema v4 (`server/src/storage/database.ts`)**
  - Thêm bảng `character_appearance` và `cosmetic_inventory`.
  - Migration chỉ thêm, chạy lại an toàn. Người chơi cũ nhận 6 món khởi đầu và ngoại hình mặc định.
- **Lưu trữ (`farmStore.ts`)**
  - Người chơi mới được tạo kèm nhân vật.
  - Có `loadCharacter` / `saveCharacter`. Dữ liệu hỏng thì báo `RangeError`; món đã sở hữu chỉ được thêm, không bao giờ xóa.
- **API (`server/src/farming/routes.ts`, cùng request ID và transaction như Phase 3)**
  - `POST /api/character/equip` `{ requestId, appearance }` → `FarmState`.
  - `POST /api/shop/buy-cosmetic` `{ requestId, cosmeticId }` → `FarmState` + `bought`.
  - Mọi response đều có `character`. `toFarmState` nhận thêm tham số `character`.
- **Test fixture:** thêm `character` vào fixture `FarmState` của 3 file test client và `server/src/farming/rules.test.ts`. Code client chưa thay đổi.

## 2. Test đã chạy

- `npm run typecheck` (shared, server, client): sạch.
- shared `src/api.test.ts`: 183 passing.
- server `src/character src/farming src/building src/storage`: 515 passing, gồm:
  - `character/rules.test.ts` và `character/routes.test.ts` (mới);
  - migration v3 → v4: giữ nguyên dữ liệu cũ, chạy lại không nhân đôi, rollback khi lỗi;
  - lưu trữ nhân vật.
- client `buildView`, `farmView`, `farmApi`: 75 passing.
- Không chạy lại toàn bộ test.

## 3. Lưu ý

- Nếu dev server đang chạy và tự nạp lại code, nó sẽ nâng `server/data/farmverse.db` lên schema v4. Migration chỉ thêm, giống lần lên v3.
- Request đã ghi log trước v4 nếu gửi lại sẽ nhận response cũ không có `character`. Client sẽ báo response không hợp lệ, và lần tải farm sau sẽ đúng. Đây là giới hạn đã biết, giống ở v3.

## 4. Bước tiếp theo

Step 4.3 — Client:
- hàm vẽ nhân vật bằng hình khối;
- màn hình Character (tab Hair / Shirt / Pants / Skin, Buy, Wear, Done);
- hình nhân vật nhỏ trên farm.
