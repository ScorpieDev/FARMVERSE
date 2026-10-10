# PHASE 0 — BƯỚC 8: KẾ HOẠCH KIỂM TRA END-TO-END VÀ README

## Trạng thái

ĐÃ DUYỆT MỘT PHẦN — chưa sửa code, chưa commit, chưa push.

Quyết định của Game Director:

1. README viết bằng **tiếng Anh**.
2. **Chưa kiểm thử Android** ở Bước 8; ưu tiên kiểm tra trên **trình duyệt qua URL Codespaces**.

Còn chờ quyết định: xem mục 7.

---

## 1. Hiện trạng

- `main` đi trước `origin/main` 5 commit (Bước 3–7: `3ea25bc`, `b2748ca`, `4436baa`, `6bfc223`, `04f1aa8`). Chỉ có file `docs/` chưa track.
- `README.md`: chỉ có dòng `# FARMVERSE`.
- Root `package.json` scripts: `build`, `typecheck`, `test` (chạy `--workspaces --if-present`). Chưa có script chạy dev.
- Workspace scripts:
  - `server`: `dev` (`tsx watch --env-file-if-exists=../.env src/index.ts`), `start`, `typecheck`, `test`.
  - `client`: `dev` (Vite 5173, proxy `/api`, `/ws`), `build`, `preview`, `typecheck`, `test`.
  - `shared`: `typecheck`, `test`.
- Test hiện có: 150 (shared 60, server 46, client 44).
- Đã biết từ Bước 7: trên Codespaces, cổng chuyển tiếp viết lại Origin thành `https://localhost:5173`, nên server phải chạy với `CLIENT_ORIGIN=https://localhost:5173`.
- Chưa có thư mục `tests/` ở root (giữ cho integration test sau này, theo quyết định Phase 0).

---

## 2. Phạm vi

Có:

- Script dev ở root.
- README tiếng Anh: cài đặt, chạy, kiểm thử, cấu hình, Codespaces.
- Kiểm tra end-to-end tự động (Claude) và trên trình duyệt qua URL Codespaces (Game Director).

Không có:

- Kiểm thử Android (quyết định 2) — để sau.
- Thay đổi code client/server/shared, protocol, dependency.
- Thêm `concurrently` hay công cụ chạy song song.
- Cập nhật `CURRENT_STATUS.md`, `DEVELOPMENT_ROADMAP.md`, `CHANGELOG.md` (thuộc Bước 9).

---

## 3. File dự kiến sửa

| File | Thay đổi |
|---|---|
| `package.json` (root) | Thêm `"dev:server": "npm run dev -w server"`, `"dev:client": "npm run dev -w client"` |
| `README.md` | Viết lại bằng tiếng Anh (mục 4) |

Không sửa file nào khác. `package-lock.json` dự kiến không đổi (chỉ thêm script).

---

## 4. Nội dung README (tiếng Anh)

1. **Overview** — FARMVERSE là mobile-first multiplayer social farming game; Phase 0 = foundation; link tới `docs/`.
2. **Tech stack** — npm workspaces, TypeScript, Fastify + `ws`, Phaser 3 + Vite, Vitest. Server-authoritative.
3. **Repository layout** — `shared/` (contract HTTP/WebSocket), `server/`, `client/`, `docs/`.
4. **Requirements** — Node ≥ 22.12 (`.nvmrc`), npm ≥ 10.
5. **Install** — `npm ci`.
6. **Run locally** — hai terminal: `npm run dev:server`, `npm run dev:client`; mở `http://localhost:5173`.
7. **Run on GitHub Codespaces**:
   - `CLIENT_ORIGIN=https://localhost:5173 npm run dev:server`
   - `npm run dev:client`
   - Mở port 5173 trong tab Ports (URL `https://<codespace>-5173.app.github.dev`); chỉ cần port 5173 (proxy gọi server bên trong Codespace), có thể để Private.
   - Giải thích: cổng chuyển tiếp viết lại Origin; nếu WebSocket bị từ chối, log server ghi origin thực tế — đặt `CLIENT_ORIGIN` đúng giá trị đó.
8. **Configuration** — bảng biến môi trường từ `.env.example` (`HOST`, `PORT`, `CLIENT_ORIGIN`, `LOG_LEVEL`, `VITE_SERVER_URL`); `.env` ở root là tùy chọn, không commit; biến shell được ưu tiên hơn `.env`.
9. **Scripts** — `typecheck`, `test`, `build`, `dev:server`, `dev:client`, `npm run preview -w client`.
10. **Connection status** — ý nghĩa các trạng thái trên màn hình: `Connecting…`, `Connected · vX · N ms`, `Reconnecting in N s (n/5)`, `Offline · Tap to retry`, `Please reload the game (version mismatch)`, `Server URL is not configured correctly`.
11. **Troubleshooting** — WebSocket 403 (`origin not allowed`) → kiểm tra `CLIENT_ORIGIN`; Vite `Blocked request` → `allowedHosts`; dev server tải chậm lần đầu (Phaser ~20 MB chưa minify), dùng `npm run build -w client && npm run preview -w client` khi cần nhanh.
12. **Project rules** — link `docs/CLAUDE_DEVELOPMENT_RULES.md`, `docs/TECHNICAL_ARCHITECTURE.md`.

Mọi lệnh trong README phải được Claude chạy thử đúng như viết trước khi báo cáo.

---

## 5. Kiểm tra

### 5.1 Tự động (Claude)

```
npm ci
npm run typecheck
npm test                     # kỳ vọng 150/150
npm run build
git diff --check
```

End-to-end bằng script (không qua cổng Codespaces):

- `npm run dev:server` + `npm run dev:client`.
- `curl localhost:5173/api/health` → 200 (qua proxy).
- WebSocket `ws://localhost:5173/ws` với Origin `http://localhost:5173` → `welcome`, `ping` → `pong`.
- Dừng server bằng SIGTERM → client WebSocket nhận 1001; port đóng.
- Server với `CLIENT_ORIGIN` sai → WebSocket 403, log ghi origin.

Giới hạn: kiểm tra tự động không đi qua cổng chuyển tiếp Codespaces (bài học Bước 7), nên không thay thế kiểm tra trình duyệt.

### 5.2 Trình duyệt qua URL Codespaces (Game Director)

Làm theo đúng mục "Run on GitHub Codespaces" của README mới (đồng thời kiểm tra README):

1. Thấy `Connected · v0.0.0`, sau ~15 s thêm RTT.
2. Dừng server (Ctrl+C) → `Reconnecting in …` → sau ≈ 30 s `Offline · Tap to retry`.
3. Bật lại server, chạm/click → `Connected`.
4. Bật lại server khi đang `Reconnecting` → tự `Connected`.
5. Đổi kích thước cửa sổ / DevTools chế độ thiết bị dọc ↔ ngang → nội dung căn giữa, không thanh cuộn.

Android: **không làm ở Bước 8** (quyết định 2).

---

## 6. Tiêu chí hoàn thành

- Mọi lệnh ở 5.1 exit 0; 150/150 test pass; không sửa test hay code.
- Các lệnh trong README đã được chạy thử đúng như viết.
- Game Director xác nhận các mục 5.2 trên trình duyệt qua URL Codespaces.
- Điều kiện Phase 0 trong roadmap: client chạy, server chạy, client kết nối được server — đạt trên trình duyệt Codespaces. Kiểm tra Android ghi là chưa làm.
- Chỉ thay đổi `package.json` (root) và `README.md`. Báo cáo ở `docs/PHASE0_STEP8_REPORT.md`; không commit khi chưa được phép; không commit file `docs/`.

---

## 7. Còn chờ quyết định

1. **Ghi chú `CLIENT_ORIGIN` sai trong `docs/PHASE0_STEP6_REPORT.md`** (đang ghi URL `*.app.github.dev`): sửa trong Bước 8, hay để Bước 9 khi rà soát toàn bộ tài liệu? Đề xuất: Bước 9.
2. **Tiêu chí "kiểm tra trên điện thoại thật"** trong `PHASE0_PLAN.md` (Bước 8): vì quyết định 2, đề xuất ghi Android là việc còn lại khi đóng Phase 0 (Bước 9), không chặn Bước 8.
