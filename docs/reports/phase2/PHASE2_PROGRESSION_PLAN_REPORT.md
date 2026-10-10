# PHASE 2 — PROGRESSION: KẾ HOẠCH VÀ ĐỀ XUẤT THIẾT KẾ (BƯỚC 2.0)

## Version

1.0 — Bản nháp đầu tiên (2026-10-10).

## Trạng thái

CHỜ GAME DIRECTOR DUYỆT (và ChatGPT rà soát). **Chưa viết code Phase 2.** Phase 1 đang chờ Game Director duyệt đóng (`docs/reports/phase1/PHASE1_STEP1_8_E2E_REPORT.md`).

Roadmap Phase 2: XP, Level, Basic unlocks, Basic quests, Progression UI.
Tài liệu hiện có (`GAME_DESIGN.md` §6, `GAME_RULES.md` §12) chỉ nêu: người chơi có Level, XP, Unlocks, Achievements; XP và Level do server quản lý; client không tự tăng. **Chưa có** công thức level, danh sách mở khóa hay nội dung nhiệm vụ — đó là quyết định thiết kế cần Game Director chốt (mục 4).

---

## 1. Hiện trạng sau Phase 1 (làm cơ sở tính toán)

| Cây | Thời gian | Coin | XP | XP/phút mỗi ô |
|---|---|---|---|---|
| Wheat | 30 s | 2 | 1 | 2,0 |
| Carrot | 2 min | 6 | 3 | 1,5 |
| Tomato | 5 min | 12 | 6 | 1,2 |

- 6 ô đất; 5 hạt mỗi loại lúc bắt đầu; hết hạt và hết cây → chờ 60 s → nhận lại 5 hạt mỗi loại.
- Một vòng hạt (15 hạt) cho 50 XP và 100 coin, mất khoảng 8–10 phút chơi chủ động (cà chua 5 phút là giới hạn).
- Coin chưa dùng vào việc gì.

---

## 2. Đề xuất thiết kế

### 2.1 Level (đề xuất L-A)

- Level **tính từ XP** bằng một hàm thuần trong `shared` — không lưu cột level riêng, nên không thể lệch giữa XP và level, không cần migration cho dữ liệu cũ.
- XP cần để lên từ level L lên L+1 = **50 × L**.

| Level | XP tích lũy | Thời gian ước tính (theo nhịp ~50 XP / 10 phút) |
|---|---|---|
| 2 | 50 | ~10 phút |
| 3 | 150 | ~30 phút |
| 4 | 300 | ~1 giờ |
| 5 | 500 | ~1 giờ 40 |
| 10 (tối đa Phase 2) | 2 250 | ~7–8 giờ |

Phương án khác: L-B đường cong tăng nhanh hơn (100 × L²) — chậm hơn nhiều sau level 5.

### 2.2 Mở khóa (đề xuất U-A: chỉ **thêm** nội dung, không lấy lại gì của Phase 1)

| Level | Mở khóa |
|---|---|
| 2 | Ô đất thứ 7 |
| 3 | Cây mới: **Corn** (đề xuất 3 phút, 9 coin, 4 XP) |
| 4 | Ô đất thứ 8 |
| 5 | Cây mới: **Strawberry** (đề xuất 8 phút, 20 coin, 9 XP) |
| 6 | Ô đất thứ 9 |

- Server kiểm tra level khi trồng / dùng ô; client chỉ hiển thị (ô khóa ghi "Level 4").
- Hạt của cây mới: nhận 5 hạt khi mở khóa; nhận lại hạt miễn phí áp dụng cho mọi cây đã mở khóa.
- Người chơi Phase 1 hiện có giữ nguyên toàn bộ ô, hạt, coin, XP; level được tính lại từ XP đang có.

Phương án khác: U-B khóa Carrot/Tomato đến level 2/3 (thay đổi luật Phase 1, người chơi hiện tại bị ảnh hưởng — không khuyến nghị).

### 2.3 Nhiệm vụ cơ bản (đề xuất Q-A: chuỗi nhiệm vụ hướng dẫn)

- Một nhiệm vụ đang hoạt động tại một thời điểm, theo thứ tự cố định; hoàn thành → bấm **Claim** → nhận coin + XP → nhiệm vụ tiếp theo.
- Tiến độ do server đếm **trong cùng transaction** với hành động trồng / thu hoạch thành công; nhận thưởng dùng request ID như các hành động khác (không nhận hai lần).
- Danh sách đề xuất (8 nhiệm vụ):

| # | Nhiệm vụ | Thưởng |
|---|---|---|
| 1 | Thu hoạch 3 Wheat | 10 coin, 5 XP |
| 2 | Trồng 1 Carrot | 10 coin, 5 XP |
| 3 | Thu hoạch 2 Carrot | 20 coin, 10 XP |
| 4 | Thu hoạch 1 Tomato | 20 coin, 10 XP |
| 5 | Đạt level 3 | 30 coin, 15 XP |
| 6 | Thu hoạch 2 Corn | 30 coin, 15 XP |
| 7 | Thu hoạch 20 cây bất kỳ | 50 coin, 25 XP |
| 8 | Đạt level 5 | 80 coin, 40 XP |

- Không có nhiệm vụ hằng ngày trong Phase 2 (cần reset theo giờ server, múi giờ — để sau).

### 2.4 Coin

Đề xuất: **vẫn chưa có chỗ tiêu coin** trong Phase 2 (shop / marketplace thuộc Phase 6 Economy). Coin tích lũy để dùng sau.

### 2.5 Giao diện tiến trình

- Header: `Level 3 · 40/150 XP` + thanh XP; coin giữ nguyên.
- Thông báo khi lên level: `Level 3! Corn unlocked.`
- Dòng nhiệm vụ phía dưới: `Quest: Harvest 3 Wheat (1/3)`; khi xong hiện nút `Claim`.
- Ô khóa hiển thị `Level N`; nút hạt cây khóa ẩn hoặc ghi `Level N`.
- Dùng bố cục theo đơn vị thiết kế đã có (`farmLayout.ts`): thêm một hàng header và một hàng nhiệm vụ, vẫn vừa khung 360×640 / 640×360.

---

## 3. Kế hoạch triển khai (sau khi duyệt)

| Bước | Nội dung |
|---|---|
| 2.1 | `shared`: hàm level từ XP, bảng mở khóa, định nghĩa cây mới, định nghĩa nhiệm vụ, kiểu API, validator, mã lỗi (`LEVEL_TOO_LOW`, `QUEST_NOT_COMPLETE`) + test |
| 2.2 | Server rules thuần: kiểm tra mở khóa khi trồng, số ô theo level, đếm tiến độ nhiệm vụ, nhận thưởng + test |
| 2.3 | Storage migration v2: bảng `quest_progress`; ô 7–9 cho người chơi đã có; test migration từ v1 với dữ liệu thật |
| 2.4 | API: `FarmState` thêm `level`, `xpToNextLevel`, `quest`; `POST /api/quests/claim` (request ID, transaction) + test |
| 2.5 | Client: thanh level/XP, ô khóa, nhiệm vụ, nút Claim + test layout |
| 2.6 | Kiểm tra end-to-end trên trình duyệt, tài liệu, báo cáo |

Không đổi: thời gian và phần thưởng 3 cây hiện có, cơ chế thu hoạch, chống trùng request, giao thức WebSocket v1.

---

## 4. Quyết định cần Game Director chốt

| # | Câu hỏi | Đề xuất |
|---|---|---|
| P2-1 | Đóng Phase 1 (dựa trên báo cáo Bước 1.8 và kiểm thử trên trình duyệt của Game Director)? | Duyệt đóng |
| P2-2 | Công thức level | L-A: 50 × L, level tối đa 10 |
| P2-3 | Mở khóa | U-A: ô 7–9 và 2 cây mới (Corn, Strawberry), không khóa nội dung Phase 1 |
| P2-4 | Thông số Corn / Strawberry | Như bảng 2.2 (tạm thời, chỉnh sau) |
| P2-5 | Nhiệm vụ | Q-A: chuỗi 8 nhiệm vụ hướng dẫn, nhận thưởng bằng nút Claim |
| P2-6 | Coin trong Phase 2 | Chưa có chỗ tiêu |
| P2-7 | Achievements (có trong `GAME_DESIGN.md` §6) | Không làm trong Phase 2 |
