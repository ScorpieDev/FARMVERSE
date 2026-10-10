# PHASE 0 — RÀ SOÁT TÀI LIỆU SAU BƯỚC 8

## Trạng thái

CHỈ ĐỀ XUẤT — chưa sửa tài liệu nào khác, chưa sửa code, chưa commit, chưa push.

Ngày rà soát: 2026-10-10. Nhánh `main` đi trước `origin/main` 6 commit:

| Bước | Commit |
|---|---|
| 3 | `3ea25bc chore: add TypeScript and Vitest tooling with shared protocol tests` |
| 4 | `b2748ca feat: add Fastify server with health endpoint` |
| 5 | `4436baa feat: add WebSocket endpoint with hello/ping protocol` |
| 6 | `6bfc223 feat: add Phaser 3 client with Vite dev proxy` |
| 7 | `04f1aa8 feat: add client server connection management` |
| 8 | `5924c4f docs: add README and root dev scripts` |

---

## 1. Phạm vi và nguồn đã đọc

Báo cáo:

- `docs/PHASE0_STEP6_PLAN_REPORT.md`, `docs/PHASE0_STEP6_REPORT.md`
- `docs/PHASE0_STEP7_REPORT.md`
- `docs/PHASE0_STEP8_PLAN_REPORT.md`, `docs/PHASE0_STEP8_REPORT.md`
- `docs/PHASE0_PLAN.md`
- `docs/CURRENT_STATUS.md`, `docs/DEVELOPMENT_ROADMAP.md`, `docs/CHANGELOG.md`, `docs/TECHNICAL_ARCHITECTURE.md` (phần trạng thái)

Cấu hình và hướng dẫn trong repo (đã commit):

- `.env.example`, `README.md`, root `package.json`, `client/vite.config.ts`, `server/src/config.ts`, `server/src/multiplayer/websocket.ts`

Sự thật dùng để đối chiếu (đã xác minh ở Bước 7–8):

- Trên Codespaces, cổng chuyển tiếp viết lại Origin của trang `https://<codespace>-5173.app.github.dev` thành `https://localhost:5173`; Vite không ghi đè Origin; server so sánh chính xác với `CLIENT_ORIGIN`. Lệnh đúng: `CLIENT_ORIGIN=https://localhost:5173 npm run dev:server`.
- Cổng: server 3000, client dev 5173, `vite preview` 4173 (preview cũng dùng proxy `/api`, `/ws`).
- Lệnh chạy từ Bước 8: `npm run dev:server`, `npm run dev:client` (tương đương `npm run dev -w server`, `npm run dev -w client`).
- Test hiện tại: 150 (shared 60, server 46, client 44).

---

## 2. Không cần sửa

| File | Kết luận |
|---|---|
| `.env.example` | Đúng: `CLIENT_ORIGIN` mặc định `http://localhost:5173`, chú thích Codespaces dùng `https://localhost:5173`; `VITE_SERVER_URL=` để trống |
| `README.md` | Đúng: lệnh local và Codespaces, cổng 3000/5173/4173, bảng biến môi trường, trạng thái kết nối |
| `client/vite.config.ts` | Chú thích "proxy forwards the browser's Origin header unchanged" đúng với Vite (Origin bị viết lại ở cổng Codespaces, trước Vite) |
| `server/src/config.ts`, `websocket.ts` | Khớp tài liệu: mặc định `http://localhost:5173`, so sánh chính xác, thiếu Origin → 403 |
| `PHASE0_STEP7_REPORT.md` phần CLIENT_ORIGIN | Đã cập nhật đúng sau Bước 7 |
| `PHASE0_STEP8_REPORT.md` phần CLIENT_ORIGIN, cổng, lệnh chạy | Đúng |

---

## 3. Đề xuất chỉnh sửa

### A. `CLIENT_ORIGIN` sai cho Codespaces (ưu tiên cao)

**A1. `docs/PHASE0_STEP6_REPORT.md` — mục "Proxy và Origin"**

- Nội dung cũ (bảng, dòng ~67–69):
  - "Mặc định | WS `/ws`, Origin `https://<codespace>-5173.app.github.dev` | **403**"
  - "`CLIENT_ORIGIN=https://<codespace>-5173.app.github.dev` (biến môi trường dòng lệnh) | WS `/ws`, Origin Codespaces | `welcome`"
- Nội dung cũ (kết luận, dòng ~74): "**Để dùng client qua URL Codespaces, server cần `CLIENT_ORIGIN=https://<codespace>-5173.app.github.dev`** (đặt trong `.env` cá nhân, không commit)."
- Đề xuất:
  - Giữ bảng (kết quả đúng với request đã gửi), thêm ghi chú ngay dưới bảng: "Các request này gửi header Origin trực tiếp tới `localhost:5173`, không đi qua cổng chuyển tiếp Codespaces, nên Origin là giả lập."
  - Thay câu kết luận bằng: "**Đính chính (sau Bước 7):** trên Codespaces, cổng chuyển tiếp viết lại Origin thành `https://localhost:5173`. Server cần `CLIENT_ORIGIN=https://localhost:5173` (xem `PHASE0_STEP7_REPORT.md`, mục 'Kết nối thật qua Codespaces', và README)."
- Lý do: hướng dẫn cũ đã được chứng minh sai trên trình duyệt thật (WebSocket 403, log ghi `origin: "https://localhost:5173"`); người đọc làm theo sẽ không kết nối được.

**A2. `docs/PHASE0_STEP6_REPORT.md` — mục "Known Issues" / "Giới hạn xác minh"**

- Nội dung cũ: nhắc "Ghi chú này sẽ vào `.env.example`/README ở Bước 7–8 theo kế hoạch" ngay sau kết luận sai.
- Đề xuất: "Đã đưa vào `.env.example` (Bước 7) và README (Bước 8) với giá trị đúng `https://localhost:5173`."
- Lý do: tránh hiểu rằng `.env.example`/README chứa URL Codespaces.

**A3. `docs/PHASE0_STEP6_PLAN_REPORT.md` — mục 8 và mục 11**

- Nội dung cũ (mục 8, dòng ~125–132): "trình duyệt gửi `Origin: https://<codespace>-5173.app.github.dev`. Vite proxy chuyển tiếp nguyên Origin này tới server…"; bước 2: "Chạy server với `CLIENT_ORIGIN=https://<codespace>-5173.app.github.dev`".
- Nội dung cũ (mục 11, dòng ~191): "Thêm chú thích cho `CLIENT_ORIGIN` trên Codespaces: `https://<codespace>-5173.app.github.dev`."
- Đề xuất: **không viết lại** (đây là kế hoạch đã duyệt, cần giữ lịch sử). Thêm một dòng ở đầu mục 8 và cạnh dòng mục 11: "**Ghi chú sau Bước 7:** giả định về Origin ở đây sai; Origin thực tế qua Codespaces là `https://localhost:5173`. Xem `PHASE0_STEP7_REPORT.md`."
- Lý do: giữ đúng hồ sơ quyết định nhưng không để người đọc làm theo hướng dẫn sai.

### B. Trạng thái commit / Git đã cũ

**B1. `docs/PHASE0_STEP7_REPORT.md`**

- Nội dung cũ:
  - Dòng 5: "… — chưa stage, chưa commit, chưa push."
  - Mục Git (dòng ~190): "Chưa stage, chưa commit, chưa push. `main` đi trước `origin/main` 4 commit."; kèm `git status --short` trước commit.
  - Dòng ~212: "Commit đề xuất (11 file, không có `docs/`): `feat: connect client to server with health check and WebSocket`"
- Đề xuất:
  - Dòng 5: "… — đã commit `04f1aa8`, chưa push."
  - Mục Git: "Đã commit `04f1aa8 feat: add client server connection management` (11 file, không có `docs/`). Chưa push." Giữ `git status` cũ dưới tiêu đề "Trước khi commit".
- Lý do: message commit thực tế khác message đề xuất (Game Director chọn message khác); trạng thái "chưa commit" không còn đúng.

**B2. `docs/PHASE0_STEP8_REPORT.md`**

- Nội dung cũ:
  - Dòng 5: "… — chưa commit, chưa push."
  - Mục Git (dòng ~112): "Chưa commit, chưa push. `main` đi trước `origin/main` 5 commit."
  - Dòng ~132: "Commit đề xuất (2 file, không có `docs/`): `docs: add README and root dev scripts`"
- Đề xuất: "Đã commit `5924c4f docs: add README and root dev scripts` (2 file: `README.md`, `package.json`). Chưa push. `main` đi trước `origin/main` 6 commit."
- Lý do: phản ánh đúng trạng thái sau commit.

**B3. `docs/PHASE0_STEP6_REPORT.md` — mục Git**

- Nội dung cũ: "Commit đề xuất (9 file…): `feat: add Phaser 3 client with Vite dev proxy`", "chưa stage, chưa commit".
- Đề xuất: "Đã commit `6bfc223 feat: add Phaser 3 client with Vite dev proxy` (9 file). Chưa push."
- Lý do: như B1.

### C. Cách chạy và kết quả kiểm thử

**C1. `docs/PHASE0_STEP7_REPORT.md` — mục "Kết nối thật qua Codespaces" (dòng ~159, ~169–170)**

- Nội dung cũ: `CLIENT_ORIGIN=https://localhost:5173 npm run dev -w server`, `npm run dev -w client`.
- Đề xuất: giữ lệnh (vẫn đúng), thêm: "Từ Bước 8 có lệnh tương đương ở root: `npm run dev:server`, `npm run dev:client` (xem README)."
- Lý do: thống nhất với README; tránh hai cách viết khiến người đọc nghĩ là khác nhau.

**C2. `docs/PHASE0_STEP6_REPORT.md` — bảng Tested và Kiểm tra lần cuối (dòng ~49, ~101)**

- Nội dung cũ: "shared 46/46, server 46/46".
- Đề xuất: giữ nguyên (đúng tại thời điểm Bước 6), thêm ghi chú cuối mục: "Từ Bước 7: 150 test (shared 60, server 46, client 44)."
- Lý do: tránh hiểu nhầm số test hiện tại.

**C3. `docs/PHASE0_STEP6_REPORT.md` — Implemented (dòng ~19)**

- Nội dung cũ: `BootScene` hiển thị "Network: not connected yet".
- Đề xuất: thêm ghi chú: "Từ Bước 7, dòng này hiển thị trạng thái kết nối thật (`Connecting…`, `Connected · …`, …)."
- Lý do: hành vi đã thay đổi; README mô tả trạng thái mới.

**C4. `docs/PHASE0_STEP8_REPORT.md` — "Việc cần Game Director kiểm tra"**

- Nội dung cũ: toàn bộ 6 bước còn ở trạng thái chờ.
- Đề xuất: cập nhật theo kết quả thực tế khi Game Director kiểm tra; trong lúc chờ, ghi rõ: "`Connected` qua Codespaces đã xác nhận ở Bước 7; các bước 2–6 chưa có kết quả."
- Lý do: phân biệt đã xác nhận với chưa xác nhận.

**C5. `docs/PHASE0_STEP8_REPORT.md` — Known Issues mục 1**

- Nội dung cũ: "Server đã được chạy lại bằng lệnh Codespaces trong README."
- Đề xuất: giữ nguyên; thêm "Server và client dev đang chạy nền từ phiên của Claude (port 3000, 5173) tại thời điểm rà soát."
- Lý do: người đọc biết vì sao port đang bận nếu chạy lại lệnh.

### D. Mâu thuẫn với quyết định đã duyệt

**D1. `docs/PHASE0_PLAN.md` — đầu file**

- Nội dung cũ: "PLANNING — chờ Game Director duyệt các quyết định ở mục 4."
- Đề xuất: "ĐANG THỰC HIỆN — 4 quyết định đã duyệt: (1) TypeScript `~5.9.3`; (2) Vite proxy `/api`, `/ws` khi dev, giữ `VITE_SERVER_URL` cho deploy; (3) server chạy bằng `tsx`, chưa build production; (4) test cạnh code, `tests/` root dành cho integration test." Kèm bảng Bước 3–8 với commit hash (mục đầu báo cáo này).
- Lý do: trạng thái kế hoạch không phản ánh quyết định và tiến độ thực tế.

**D2. `docs/PHASE0_PLAN.md` — Bước 8, "Hoàn thành khi"**

- Nội dung cũ: "… và đã kiểm tra trên điện thoại thật."
- Đề xuất: "… đã kiểm tra trên trình duyệt qua URL Codespaces. Kiểm tra Android hoãn theo quyết định của Game Director (Bước 8), ghi là việc còn lại khi đóng Phase 0."
- Lý do: mâu thuẫn với quyết định "chưa kiểm thử Android".

**D3. `docs/PHASE0_PLAN.md` — Bước 7, file dự kiến**

- Nội dung cũ: `client/src/network/connection.ts`, `connection.test.ts`.
- Đề xuất: ghi chú tên thực tế: `ServerConnection.ts`, `connectionStatus.ts`, `serverUrl.ts` (+ test); thêm `shared/src/api.ts` (`isHealthResponse`) và `.env.example`.
- Lý do: tên file khác kế hoạch ban đầu (đã duyệt ở `PHASE0_STEP7_PLAN_REPORT.md`).

**D4. `docs/PHASE0_PLAN.md` — mục 4, quyết định 2**

- Nội dung cũ: "Trên Codespaces, port riêng tư sẽ chặn request khác origin." (không nhắc Origin bị viết lại).
- Đề xuất: thêm: "Hệ quả đã xác minh ở Bước 7: qua Codespaces, Origin tới server là `https://localhost:5173`; đặt `CLIENT_ORIGIN` tương ứng."
- Lý do: liên kết quyết định với hệ quả thực tế.

### E. Thuộc Bước 9 (chỉ liệt kê)

| File | Nội dung cũ | Cần cập nhật khi đóng Phase 0 |
|---|---|---|
| `docs/CURRENT_STATUS.md` | "PRE-DEVELOPMENT"; Phase 0 "NOT STARTED"; Client/Server/Shared trong "NOT STARTED" | Trạng thái Phase 0, phần đã làm, việc còn lại (Android) |
| `docs/DEVELOPMENT_ROADMAP.md` | "Phase 0 — Foundation / Status: NOT STARTED" | Trạng thái Phase 0 |
| `docs/CHANGELOG.md` | Chưa có mục cho Phase 0 | Mục Phase 0 (Bước 3–8) |
| `docs/TECHNICAL_ARCHITECTURE.md` §26 | "Chưa triển khai: Client, Server, …" | Stack đã chốt và phần đã triển khai |

---

## 4. Điểm chưa xác minh được

1. **Trình duyệt sau Bước 8:** Game Director chưa báo kết quả theo README mới (RTT, Reconnecting → Offline → chạm để thử lại, tự kết nối lại khi đang Reconnecting, xoay/đổi kích thước). Chỉ `Connected` qua Codespaces đã xác nhận (Bước 7).
2. **Android:** chưa kiểm thử (hoãn theo quyết định).
3. **`vite preview` qua Codespaces (port 4173):** chưa thử bằng trình duyệt; giá trị `CLIENT_ORIGIN` cần dùng (dự đoán `https://localhost:4173`) chưa xác minh — README chỉ hướng dẫn lấy từ log server.
4. **Cơ chế viết lại Origin của Codespaces:** suy ra từ log server và mã nguồn Vite (Vite không ghi đè Origin), chưa có tài liệu chính thức của GitHub được đối chiếu; chưa biết có áp dụng cho mọi trình duyệt/cấu hình port (Public/Private) hay không.
5. **HMR qua Codespaces:** chưa kiểm tra.
6. **Kích thước dev bundle Phaser (~20 MB) trên mạng di động:** chưa đo.

---

## 5. Đề xuất thực hiện

- Mục A–D: một lượt chỉ sửa tài liệu trong `docs/` (các file này chưa track, không đưa vào commit).
- Mục E: làm ở Bước 9 cùng việc đóng Phase 0.
- Cần Game Director duyệt trước khi sửa.
