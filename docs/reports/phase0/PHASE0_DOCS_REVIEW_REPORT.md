# PHASE 0 — BÁO CÁO CHỈNH SỬA TÀI LIỆU (MỤC A–D SAU BƯỚC 8)

## Trạng thái

ĐÃ SỬA — chờ Game Director duyệt. Không sửa code, `README.md`, `package.json`; không commit, không push. Mục E (`CURRENT_STATUS.md`, `DEVELOPMENT_ROADMAP.md`, `CHANGELOG.md`, `TECHNICAL_ARCHITECTURE.md`) **không thực hiện**, để Bước 9.

Căn cứ: `docs/PHASE0_STEP9_REVIEW_REPORT.md`, mục 3 (A–D).

Nguyên tắc đã áp dụng:

- Giữ nguyên nội dung lịch sử của kế hoạch và báo cáo đã duyệt; chỉ **thêm** ghi chú đính chính/cập nhật (khối `>` hoặc dòng *Ghi chú sau Bước N*).
- Ba câu trong `PHASE0_STEP7_REPORT.md` được viết lại để bỏ khẳng định tuyệt đối về việc Codespaces viết lại Origin (mục 2.3).
- Với `CLIENT_ORIGIN`: chỉ ghi nhận kết quả quan sát được trên Codespaces của dự án — `https://localhost:5173` — kèm câu "chưa xác minh với mọi cấu hình Codespaces".
- Đã đọc nội dung hiện tại của từng file trước khi sửa; tìm theo nội dung, không theo số dòng trong báo cáo rà soát.

---

## 1. Tổng quan thay đổi

So với bản sao lưu ngay trước khi sửa:

| File | Dòng thêm | Dòng bỏ/thay | Mục |
|---|---|---|---|
| `docs/PHASE0_STEP6_REPORT.md` | 12 | 1 (dòng được nối thêm ghi chú) | A1, A2, B3, C2, C3 |
| `docs/PHASE0_STEP6_PLAN_REPORT.md` | 3 | 0 | A3 |
| `docs/PHASE0_STEP7_REPORT.md` | 9 | 3 (viết lại câu, xem 2.3) | B1, C1, làm mềm khẳng định |
| `docs/PHASE0_STEP8_REPORT.md` | 6 | 0 | B2, C4, C5 |
| `docs/PHASE0_PLAN.md` | 24 | 0 | D1, D2, D3, D4 |

Không file nào khác thay đổi (trừ file báo cáo này, mới tạo).

---

## 2. Chi tiết từng file

### 2.1 `docs/PHASE0_STEP6_REPORT.md`

| Mục | Vị trí | Thay đổi |
|---|---|---|
| B3 | Sau dòng trạng thái đầu file | Thêm khối "Cập nhật sau rà soát tài liệu": đã commit `6bfc223 feat: add Phaser 3 client with Vite dev proxy`, chưa push; hướng dẫn `CLIENT_ORIGIN` đã được đính chính |
| C3 | Implemented, dòng `BootScene.ts` | Thêm ghi chú: từ Bước 7, "Network: not connected yet" được thay bằng trạng thái kết nối thật |
| A1 | Ngay dưới bảng "Proxy và Origin" | Thêm ghi chú: request gửi Origin trực tiếp tới `localhost:5173`, không qua cổng Codespaces, nên Origin `*.app.github.dev` trong bảng là giả lập |
| A1 + A2 | Sau câu "Kết luận…" (giữ nguyên câu cũ) | Thêm khối "Đính chính (sau Bước 7)": kết luận in đậm không đúng với trình duyệt thật; Origin quan sát được là `https://localhost:5173`; kết nối được với `CLIENT_ORIGIN=https://localhost:5173`; chưa xác minh với mọi cấu hình; nếu bị từ chối thì dùng origin trong log; `.env.example` và README đã ghi giá trị này |
| A2 | Giới hạn xác minh, dòng "WebSocket qua URL Codespaces HTTPS thật" | Nối thêm: giả lập không đúng với Origin thật qua Codespaces, xem ghi chú ở "Proxy và Origin" |
| C2 | Cuối "Phạm vi thay đổi" của mục Kiểm tra lần cuối | Thêm ghi chú: số test 46/46 + 46/46 đúng tại Bước 6; từ Bước 7 là 150 (shared 60, server 46, client 44) |
| B3 | Cuối mục Git | Thêm "Cập nhật sau commit": `6bfc223`, đúng 9 file, không có `docs/`, chưa push; `git status` ở trên là trước commit |

### 2.2 `docs/PHASE0_STEP6_PLAN_REPORT.md`

| Mục | Vị trí | Thay đổi |
|---|---|---|
| A3 | Đầu mục 8 "Kiểm tra Origin thực tế trên Codespaces HTTPS" | Thêm khối ghi chú: giả định Origin `*.app.github.dev` không khớp trình duyệt thật; Origin quan sát được `https://localhost:5173`; chưa xác minh với mọi cấu hình; kế hoạch giữ nguyên làm lịch sử |
| A3 | Mục 11, dòng "Thêm chú thích cho `CLIENT_ORIGIN`…" | Thêm ghi chú: giá trị thực tế trong `.env.example` là `https://localhost:5173` |

Nội dung kế hoạch gốc không bị xóa hay viết lại.

### 2.3 `docs/PHASE0_STEP7_REPORT.md`

| Mục | Vị trí | Thay đổi |
|---|---|---|
| B1 | Sau dòng trạng thái đầu file | Thêm khối: đã commit `04f1aa8 feat: add client server connection management`, chưa push |
| — (yêu cầu 6) | "Kết nối thật qua Codespaces", ý "Trình duyệt không thể gửi…" | Câu cũ: "…nên giá trị này do cổng chuyển tiếp Codespaces viết lại." → câu mới: "…nên giá trị này nhiều khả năng do cổng chuyển tiếp Codespaces viết lại (suy luận từ log server và mã nguồn Vite; chưa đối chiếu tài liệu chính thức của GitHub, chưa xác minh với mọi cấu hình Codespaces)." |
| — (yêu cầu 6) | "Lệnh chạy dev trên Codespaces:" | Thêm vào câu: `CLIENT_ORIGIN=https://localhost:5173` là giá trị quan sát được, chưa xác minh với mọi cấu hình |
| C1 | Sau khối lệnh chạy dev trên Codespaces | Thêm ghi chú: lệnh tương đương ở root `npm run dev:server` / `npm run dev:client` (README) |
| — (yêu cầu 6) | Known Issues mục 1 | Câu cũ: "cổng chuyển tiếp viết lại Origin thành `https://localhost:5173`," → câu mới: "trên Codespaces của dự án, Origin server nhận được là `https://localhost:5173` (quan sát được, chưa xác minh với mọi cấu hình)," |
| B1 | Cuối mục Git | Thêm "Cập nhật sau commit": `04f1aa8`, 11 file, không có `docs/`; message thực tế do Game Director chọn, khác message đề xuất; chưa push |

### 2.4 `docs/PHASE0_STEP8_REPORT.md`

| Mục | Vị trí | Thay đổi |
|---|---|---|
| B2 | Sau dòng trạng thái đầu file | Thêm khối: đã commit `5924c4f docs: add README and root dev scripts` (2 file), chưa push, đi trước `origin/main` 6 commit |
| C4 + C5 | Đầu mục "Việc cần Game Director kiểm tra" | Thêm khối: `Connected` đã xác nhận ở Bước 7; bước 2–6 chưa có kết quả; server và client dev đang chạy nền từ phiên của Claude (port 3000, 5173) |
| B2 | Cuối mục Git | Thêm "Cập nhật sau commit": `5924c4f`, đúng 2 file, không có `docs/`, chưa push, đi trước 6 commit |

### 2.5 `docs/PHASE0_PLAN.md`

| Mục | Vị trí | Thay đổi |
|---|---|---|
| D1 | Dưới "PLANNING — chờ Game Director duyệt…" (giữ nguyên) | Thêm khối "Cập nhật sau rà soát": trạng thái thực tế ĐANG THỰC HIỆN; 4 quyết định đã duyệt; bảng Bước 1–8 với commit hash (Bước 9 chưa thực hiện); kế hoạch bên dưới giữ làm lịch sử |
| D3 | Bước 7, sau danh sách file | Thêm ghi chú: tên file thực tế `ServerConnection.ts`, `connectionStatus.ts`, `serverUrl.ts` (+ test); thêm `shared/src/api.ts` (+ test), `client/package.json`, `.env.example` |
| D2 | Bước 8, sau "Hoàn thành khi…" | Thêm ghi chú: kiểm tra trên trình duyệt qua Codespaces; Android hoãn theo quyết định, ghi là việc còn lại khi đóng Phase 0 |
| D4 | Mục 4, quyết định 2, sau "Đề xuất: (b)…" | Thêm ghi chú: đã chọn (b); Origin quan sát được qua Codespaces là `https://localhost:5173`; chưa xác minh với mọi cấu hình |

Commit hash Bước 1–2 (`5faeaff`, `1bbb65d`) lấy từ lịch sử git, khớp với `git log`.

---

## 3. Kiểm tra đã chạy

| Kiểm tra | Kết quả |
|---|---|
| `git diff --check` | exit 0 (không có file tracked thay đổi, nên không có gì để báo) |
| File tracked thay đổi | 0 — không có thay đổi code, `README.md`, `package.json` |
| File được stage | 0 |
| File chưa track ngoài `docs/` | Không có |
| So sánh với bản sao lưu `docs/PHASE0_*.md` trước khi sửa | Chỉ 5 file trên thay đổi; dòng bị bỏ đều là 4 dòng được thay bằng phiên bản có ghi chú (mục 2.1, 2.3) |
| Khoảng trắng cuối dòng trong 5 file đã sửa | Không có |

Lưu ý: các file `docs/PHASE0_*.md` chưa được git theo dõi, nên `git diff`/`git diff --check` không thấy thay đổi trong chúng; phạm vi được kiểm tra bằng so sánh với bản sao lưu.

---

## 4. Mục chưa xử lý

1. **Mục E (để Bước 9):** `docs/CURRENT_STATUS.md` (PRE-DEVELOPMENT, Phase 0 NOT STARTED), `docs/DEVELOPMENT_ROADMAP.md` (Phase 0 NOT STARTED), `docs/CHANGELOG.md` (chưa có mục Phase 0), `docs/TECHNICAL_ARCHITECTURE.md` §26.
2. **Không sửa** `docs/PHASE0_STEP9_REVIEW_REPORT.md` (báo cáo rà soát gốc); một số số dòng trong đó đã lệch sau khi thêm ghi chú.
3. **Chưa xác minh** (giữ nguyên như báo cáo rà soát, mục 4):
   - Trình duyệt sau Bước 8: RTT, Reconnecting → Offline → chạm để thử lại, tự kết nối lại, xoay/đổi kích thước.
   - Android.
   - `vite preview` qua Codespaces (port 4173) và giá trị `CLIENT_ORIGIN` tương ứng.
   - Cơ chế viết lại Origin của Codespaces: chưa đối chiếu tài liệu chính thức; chưa biết có áp dụng với mọi cấu hình (port Public/Private, trình duyệt khác).
   - HMR qua Codespaces; kích thước dev bundle Phaser trên mạng di động.
4. Server và client dev vẫn đang chạy nền (port 3000 với `CLIENT_ORIGIN=https://localhost:5173`, port 5173).

---

## 5. Git

- Không commit, không push. `main` đi trước `origin/main` 6 commit.
- `git status --short`: chỉ các file `docs/` chưa track (13 file `docs/PHASE0_*.md`, gồm báo cáo này và `PHASE0_STEP9_REVIEW_REPORT.md`).

---

## 6. Tóm tắt xác nhận lại (2026-10-10, theo yêu cầu thực hiện A–D lần hai)

Các đề xuất A–D đã được thực hiện ở lần sửa trước (mục 1–2); lần này **không sửa lặp**, chỉ kiểm tra lại từng thay đổi còn nguyên trong file.

File đã sửa cho A–D (5):

| File | Mục | Kiểm tra lại |
|---|---|---|
| `docs/PHASE0_STEP6_REPORT.md` | A1, A2, B3, C2, C3 | Có đủ ghi chú đính chính `CLIENT_ORIGIN`, commit `6bfc223`, số test 150, ghi chú `BootScene` |
| `docs/PHASE0_STEP6_PLAN_REPORT.md` | A3 | Có 2 ghi chú (mục 8, mục 11); kế hoạch gốc giữ nguyên |
| `docs/PHASE0_STEP7_REPORT.md` | B1, C1 | Có commit `04f1aa8`, ghi chú lệnh `dev:server`/`dev:client`, các câu đã làm mềm khẳng định |
| `docs/PHASE0_STEP8_REPORT.md` | B2, C4, C5 | Có commit `5924c4f` và khối tình trạng kiểm tra trình duyệt |
| `docs/PHASE0_PLAN.md` | D1–D4 | Có trạng thái thực tế, 4 quyết định đã duyệt, bảng commit Bước 1–8, tên file Bước 7, hoãn Android, hệ quả Origin |

Ngoài A–D, `docs/PHASE0_STEP8_REPORT.md` có thêm mục "Kết quả kiểm thử thực tế trên trình duyệt (2026-10-10)" theo yêu cầu riêng của Game Director (Offline → khởi động lại server → `Connected`, RTT 223 ms).

Không thay đổi quyết định nào đã được Game Director duyệt; nội dung lịch sử giữ nguyên, chỉ thêm ghi chú. Mục E không thực hiện (để Bước 9).

Kiểm tra:

- `git diff --check`: exit 0.
- File tracked thay đổi: 0. File được stage: 0. File chưa track ngoài `docs/`: không có.
- Không sửa code, `README.md`, `package.json`.

Trạng thái Git: không commit, không push; `main` đi trước `origin/main` 6 commit; chỉ có các file `docs/PHASE0_*.md` chưa track (13 file).

**Dừng, chờ Game Director duyệt.**
