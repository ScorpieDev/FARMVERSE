# PHASE 4 — STEP 4.1: DỮ LIỆU NHÂN VẬT DÙNG CHUNG

## Version

1.0 — 2026-10-12.

## Trạng thái

**XONG.** Theo các quyết định P4-1…P4-4 đã duyệt (`PHASE4_CHARACTER_PLAN_REPORT.md`). Chỉ thay đổi `shared`; server và client chưa dùng.

## 1. Thay đổi

- `shared/src/character.ts` (export mới `@farmverse/shared/character`):
  - 3 slot hair / shirt / pants, 12 cosmetic (bảng §2.2 của kế hoạch; giá và level tạm thời). Mỗi món có `style` và `color` để client vẽ bằng hình khối.
  - 4 màu da (`SKIN_TONES`, `SKIN_TONE_COLORS`).
  - `STARTER_COSMETIC_IDS`: 6 món miễn phí. `DEFAULT_APPEARANCE`: light, Short Brown, White Tee, Blue Jeans.
  - Hàm kiểm tra: `isCosmeticId`, `isSkinTone`, `isCosmeticForSlot`, `isCharacterAppearance` (từ chối khi thiếu slot, thừa trường hoặc sai slot), `getCosmetic`.
  - `checkAppearance(owned, appearance)` trả `invalid` hoặc `not_owned` (kèm `cosmeticId`).
- `shared/src/errors.ts`: thêm mã lỗi `ALREADY_OWNED` (mua cosmetic đã có).
- Kiểm tra mua (level, rồi coin, rồi đã sở hữu) sẽ nằm ở server Step 4.2, giống `server/src/building/shop.ts`.

## 2. Test đã chạy

- `shared`: `vitest run src/character.test.ts src/errors.test.ts` — 36 passing (file mới `character.test.ts` 33 test).
- `npm run typecheck` (cả 3 workspace): sạch.
- Không chạy lại toàn bộ test.

## 3. Bước tiếp theo

Step 4.2 — Server:
- rules thuần;
- schema v4 (`character_appearance`, `cosmetic_inventory`);
- thêm `character` vào `FarmState`;
- `POST /api/character/equip` và `POST /api/shop/buy-cosmetic`.
