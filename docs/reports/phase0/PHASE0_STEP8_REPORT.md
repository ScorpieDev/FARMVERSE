# PHASE 0 — BƯỚC 8: BÁO CÁO KIỂM TRA END-TO-END VÀ README

## Trạng thái

PASS (npm ci, typecheck, test 150/150, build, `git diff --check`, end-to-end bằng script) — chưa commit, chưa push.

> **Cập nhật sau rà soát tài liệu:** đã commit `5924c4f docs: add README and root dev scripts` (2 file: `README.md`, `package.json`), chưa push; `main` đi trước `origin/main` 6 commit (xem mục Git).

Chờ Game Director kiểm tra trên trình duyệt qua URL Codespaces (mục "Việc cần Game Director kiểm tra"). Android: chưa kiểm thử (quyết định của Game Director).

> **Cập nhật 2026-10-10:** Game Director đã kiểm thử thực tế Offline → khởi động lại server → `Connected`, RTT 223 ms (xem "Kết quả kiểm thử thực tế trên trình duyệt (2026-10-10)").

Quyết định áp dụng:

1. README viết bằng tiếng Anh.
2. Chưa kiểm thử Android; ưu tiên trình duyệt Codespaces.

Hai điểm còn chờ trong kế hoạch (mục 7) được xử lý theo đề xuất, không sửa file ngoài phạm vi:

- Ghi chú `CLIENT_ORIGIN` sai trong `docs/PHASE0_STEP6_REPORT.md`: chưa sửa, để Bước 9.
- Kiểm tra Android: ghi là việc còn lại khi đóng Phase 0.

---

## Implemented

- `package.json` (root): thêm `"dev:server": "npm run dev -w server"`, `"dev:client": "npm run dev -w client"`.
- `README.md` (tiếng Anh): Overview, Tech stack, Repository layout, Requirements, Install, Run locally, Run on GitHub Codespaces (`CLIENT_ORIGIN=https://localhost:5173` và lý do), Configuration (bảng biến môi trường, shell ưu tiên hơn `.env`), Scripts, Connection status, Troubleshooting, Project documents.

Không sửa code, test, `.env.example`, `package-lock.json` hay file nào khác.

---

## Tested

| Lệnh | Exit | Kết quả |
|---|---|---|
| `npm ci` | 0 | Cài lại sạch từ lockfile; `package-lock.json` không đổi |
| `npm run typecheck` | 0 | shared + server + client |
| `npm test` | 0 | shared 60/60, server 46/46, client 44/44 — **150/150** |
| `npm run build` | 0 | `client/dist/assets/index-*.js` 1,205.05 kB (gzip 321.74 kB) |
| `git diff --check` | 0 | Không lỗi whitespace |

### End-to-end bằng script (Claude, đúng lệnh trong README)

`npm run dev:server` + `npm run dev:client`, request tới `localhost:5173` (qua Vite proxy):

| Kiểm tra | Kết quả |
|---|---|
| `GET /` | 200 |
| `GET /api/health` qua proxy | 200 `{"status":"ok","version":"0.0.0",…}` |
| WS `/ws`, Origin `http://localhost:5173` | `welcome` → `pong` |
| WS `/ws`, Origin `https://localhost:5173` (CLIENT_ORIGIN mặc định) | 403; log `origin not allowed` ghi `https://localhost:5173` |
| Host `evil.example.com` | Vite chặn: `Blocked request. This host ("evil.example.com") is not allowed.` |
| SIGTERM server khi client đang kết nối | Client nhận close 1001; port 3000 đóng |

Lệnh Codespaces trong README: `CLIENT_ORIGIN=https://localhost:5173 npm run dev:server`:

| Kiểm tra | Kết quả |
|---|---|
| WS `/ws`, Origin `https://localhost:5173` | `welcome` → `pong` |
| WS `/ws`, Origin `http://localhost:5173` | 403 |

`npm run preview -w client` (port 4173): trang 200, `/api/health` 200 và WS `welcome` → `pong` — **preview cũng dùng proxy** (Vite lấy `server.proxy` cho preview).

Giới hạn: các kiểm tra trên không đi qua cổng chuyển tiếp Codespaces; giá trị Origin là giả lập (bài học Bước 7). Không thay thế kiểm tra trình duyệt.

### Lỗi phát hiện và đã sửa trong Bước 8

- Bản nháp README ghi "preview server has no `/api` or `/ws` proxy" — **sai** theo kết quả trên. Đã sửa: preview dùng cùng proxy nhưng chạy port 4173, nên phải mở port 4173 và đặt `CLIENT_ORIGIN` theo origin server ghi trong log. Phần này chưa thử qua Codespaces.

---

## Việc cần Game Director kiểm tra (trình duyệt qua URL Codespaces)

> **Tình trạng tại lần rà soát tài liệu:** `Connected` qua URL Codespaces đã được Game Director xác nhận ở Bước 7 (server chạy với `CLIENT_ORIGIN=https://localhost:5173`). Các bước 2–6 dưới đây **chưa có kết quả**. Server và client dev vẫn đang chạy nền từ phiên của Claude (port 3000 và 5173), nên chạy lại lệnh có thể báo port đang bận.

Server và client đang chạy sẵn bằng đúng lệnh README:

- Server: `CLIENT_ORIGIN=https://localhost:5173 npm run dev:server` (port 3000)
- Client: `npm run dev:client` (port 5173)

Các bước:

1. Mở `https://<codespace-name>-5173.app.github.dev/` → `Connected · v0.0.0`, sau ~15 s thêm RTT.
2. Dừng server → `Reconnecting in …` → sau ≈ 30 s `Offline · Tap to retry`.
3. Chạy lại server bằng lệnh trên, click/chạm → `Connected`.
4. Chạy lại server khi đang `Reconnecting` → tự `Connected`.
5. Đổi kích thước cửa sổ / DevTools chế độ thiết bị dọc ↔ ngang → nội dung căn giữa, không thanh cuộn.
6. Đọc README mục "Run on GitHub Codespaces" và xác nhận làm theo được.

Android: không làm ở Bước 8.

### Kết quả kiểm thử thực tế trên trình duyệt (2026-10-10)

Thực hiện bởi Game Director, trình duyệt qua URL Codespaces port 5173. Client dev chạy liên tục (port 5173, không bị dừng).

| Thao tác | Kết quả quan sát (Game Director) |
|---|---|
| Dừng server: `kill -TERM 64798` (tiến trình `tsx watch` của `npm run dev:server`, chạy theo xác nhận của Game Director) | Cổng 3000 đóng, cả chuỗi tiến trình server thoát; cổng 5173 vẫn chạy; `/api/health` qua proxy trả 502. Trên trình duyệt: FARMVERSE chuyển sang **`Offline · Tap to retry`** |
| Khởi động lại server: `CLIENT_ORIGIN=https://localhost:5173 npm run dev:server` | Client kết nối lại thành **`Connected`**; **RTT quan sát được 223 ms** |

Bằng chứng phía server (Claude kiểm tra): sau khi khởi động lại, `/api/health` trực tiếp và qua proxy đều trả 200; log server ghi một lần `WebSocket connected` khoảng 7 s sau khi server bắt đầu lắng nghe.

Đối chiếu với các bước ở trên:

- Bước 1 (`Connected` + RTT): **đạt** — RTT 223 ms.
- Bước 2 (dừng server → `Offline · Tap to retry`): **đạt** ở trạng thái cuối. Trạng thái trung gian `Reconnecting in …` không được báo riêng.
- Bước 3/4 (chạy lại server → `Connected`): **đạt** — client trở lại `Connected`. Game Director mô tả là "tự kết nối lại"; theo thiết kế (Bước 7), từ `Offline` client chỉ thử lại khi người chơi chạm/click (hoặc tải lại trang). Chưa ghi nhận thao tác cụ thể đã dẫn tới kết nối lại (chạm/click, tải lại trang, hay kết nối lại khi còn ở `Reconnecting`), nên chưa tách được kết quả riêng cho bước 3 và bước 4.
- Bước 5 (đổi kích thước / xoay dọc ↔ ngang): **chưa có kết quả**.
- Bước 6 (làm theo README mục "Run on GitHub Codespaces"): lệnh khởi động lại server đúng như README và kết nối thành công; chưa có xác nhận riêng cho toàn bộ mục README.

---

## Files Changed

Sửa (2):

- `package.json`
- `README.md`

---

## Known Issues

1. **Claude đã dừng server port 3000 mà Game Director đang chạy** (pid 57115) trước khi chạy `npm ci`, cùng với client dev nền của Claude. Không được hỏi trước — lẽ ra phải hỏi. Server đã được chạy lại bằng lệnh Codespaces trong README.
2. Điều kiện "kiểm tra trên điện thoại thật" của `PHASE0_PLAN.md` chưa đạt (Android hoãn theo quyết định).
3. `docs/PHASE0_STEP6_REPORT.md` còn ghi `CLIENT_ORIGIN` Codespaces là URL `*.app.github.dev` — sửa ở Bước 9.
4. `NODE_ENV` có trong `.env.example` nhưng server chưa dùng; README không liệt kê.
5. Preview qua Codespaces (port 4173) chưa kiểm tra bằng trình duyệt.
6. npm vẫn cảnh báo script postinstall của `esbuild` bị chặn (như các bước trước); không ảnh hưởng.

---

## Git

- Chưa commit, chưa push. `main` đi trước `origin/main` 5 commit.
- `git status --short`:

```
 M README.md
 M package.json
?? docs/PHASE0_PLAN.md
?? docs/PHASE0_STEP4_PLAN_REPORT.md
?? docs/PHASE0_STEP4_REPORT.md
?? docs/PHASE0_STEP5_PLAN_REPORT.md
?? docs/PHASE0_STEP5_REPORT.md
?? docs/PHASE0_STEP6_PLAN_REPORT.md
?? docs/PHASE0_STEP6_REPORT.md
?? docs/PHASE0_STEP7_PLAN_REPORT.md
?? docs/PHASE0_STEP7_REPORT.md
?? docs/PHASE0_STEP8_PLAN_REPORT.md
```

(`docs/PHASE0_STEP8_REPORT.md` — file này — cũng chưa track.)

- Commit đề xuất (2 file, không có `docs/`): `docs: add README and root dev scripts`

**Cập nhật sau commit:** đã commit `5924c4f docs: add README and root dev scripts` (đúng 2 file `README.md`, `package.json`; không có `docs/`). Chưa push. `main` đi trước `origin/main` 6 commit. Trạng thái `git status` ở trên là trước khi commit.
