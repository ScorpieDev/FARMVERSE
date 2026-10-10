# PHASE 0 — BƯỚC 6: BÁO CÁO CLIENT PHASER 3 + TYPESCRIPT + VITE

## Trạng thái

PASS (typecheck, build, test, proxy, hiển thị trên trình duyệt) — chưa stage, chưa commit, chưa push. Chờ Game Director duyệt commit.

> **Cập nhật sau rà soát tài liệu (sau Bước 8):** đã commit `6bfc223 feat: add Phaser 3 client with Vite dev proxy`, chưa push. Hướng dẫn `CLIENT_ORIGIN` cho Codespaces ở mục "Proxy và Origin" đã được đính chính (xem ghi chú tại đó).

Game Director đã mở URL Codespaces port 5173 trên trình duyệt và xác nhận scene FARMVERSE hiển thị. Xem "Xác minh giao diện trình duyệt" và "Kiểm tra lần cuối".

---

## Implemented

- `client/package.json`: `@farmverse/client`; dependencies `phaser ~3.90.0`, `@farmverse/shared`; devDependency `vite ^8.3.4`. Scripts `dev`, `build` (typecheck rồi `vite build`), `preview`, `typecheck` (hai tsconfig). Không có script `test`.
- `client/tsconfig.json`: cho `src/`, thêm DOM, `types: ["vite/client"]`, kế thừa đủ strict từ `tsconfig.base.json` (không nới gì).
- `client/tsconfig.node.json`: chỉ cho `vite.config.ts`, `types: ["node"]`.
- `client/vite.config.ts`: `envDir: ".."`; dev server `host: true`, port 5173 `strictPort`, `allowedHosts: [".app.github.dev"]`; proxy `/api` → `http://localhost:${PORT}`, `/ws` → `ws://localhost:${PORT}` (`ws: true`), `PORT` đọc từ `.env` root, mặc định 3000. Proxy không sửa Origin.
- `client/index.html`: viewport mobile (chặn zoom, `viewport-fit=cover`), `theme-color`, full màn hình, không scroll/overscroll, `touch-action: none`.
- `client/src/main.ts`: `new Game({ type: AUTO, parent: "game", scale: { mode: Scale.RESIZE } , scene: [BootScene] })`.
- `client/src/core/BootScene.ts`: chữ "FARMVERSE" và "Network: not connected yet", căn giữa và co giãn cỡ chữ theo cạnh ngắn của màn hình; cập nhật khi `Scale.Events.RESIZE` (đổi kích thước/xoay màn hình); gỡ listener khi scene shutdown.
  - *Ghi chú sau Bước 7:* dòng "Network: not connected yet" đã được thay bằng trạng thái kết nối thật (`Connecting…`, `Connected · …`, …); xem `PHASE0_STEP7_REPORT.md` và README.
- `client/src/vite-env.d.ts`: kiểu `VITE_SERVER_URL?: string` (dùng ở Bước 7).

Không sửa: `server/`, `shared/`, root `package.json`, `tsconfig.base.json`, `.env.example`. Không tạo `.env`.

---

## Kiểm tra tương thích (mục 6 của kế hoạch)

| Mục | Kết quả |
|---|---|
| Cài đặt | `phaser` 3.90.0, `vite` 8.3.4; thêm 1 dependency phụ `eventemitter3` (của Phaser) |
| Phaser ESM có named export `AUTO`, `Game`, `Scale`, `Scene` | Có. Không có default export → dùng named import |
| `tsc` với `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` | Không lỗi, không phải nới strict |
| `vite.config.ts` + TypeScript 5.9 + `tsconfig.node.json` | Không lỗi; Vite load được config |
| `vite build` (Rolldown) với Phaser 3 | Thành công: `dist/index.html` 0.69 kB, `dist/assets/index-*.js` 1,198 kB (gzip 319 kB). Có cảnh báo chunk > 500 kB (đã dự kiến) |
| Proxy WebSocket của Vite 8 giữ Origin | Có (xem bảng proxy) |

Không có lỗi tương thích; không đổi stack.

---

## Tested

| Lệnh | Exit | Kết quả |
|---|---|---|
| `npm install` | 0 | Link `@farmverse/client`; lockfile thêm `client`, `phaser`, `eventemitter3` (152 package, không mất package nào) |
| `npm run typecheck -w client` | 0 | Không lỗi (cả `tsconfig.json` và `tsconfig.node.json`) |
| `npm run build -w client` | 0 | Build thành công, cảnh báo chunk lớn |
| `npm run typecheck` (root) | 0 | shared + server + client |
| `npm test` (root) | 0 | shared 46/46, server 46/46 — không đổi, không sửa test |
| `npm run build` (root) | 0 | Chỉ client có script build |

Dev server (`npm run dev -w client`, curl):

- `GET /` → 200; `/src/main.ts`, `/src/core/BootScene.ts`, dependency `phaser` đã pre-bundle → 200.
- `Host: test-5173.app.github.dev` → 200; `Host: evil.example.com` → 403 (`allowedHosts` hoạt động).

`vite preview` (bản build): `GET /` → 200, asset JS → 200 (1,198,092 byte).

### Proxy và Origin (kế hoạch mục 8)

Server chạy qua `npm run dev -w server` hoặc `tsx`, client qua Vite dev 5173. Request gửi tới `localhost:5173`, đi qua proxy.

| Cấu hình server | Request | Kết quả |
|---|---|---|
| Mặc định (`CLIENT_ORIGIN=http://localhost:5173`) | `GET /api/health` | 200 `{"status":"ok",...}` |
| Mặc định | WS `/ws`, Origin `http://localhost:5173` | `welcome` |
| Mặc định | WS `/ws`, Origin `https://<codespace>-5173.app.github.dev` | **403**; log server ghi đúng origin này |
| Mặc định | WS `/ws`, không Origin | 403 |
| `CLIENT_ORIGIN=https://<codespace>-5173.app.github.dev` (biến môi trường dòng lệnh) | WS `/ws`, Origin Codespaces | `welcome` |
| như trên | WS `/ws`, Origin `http://localhost:5173` | 403 |
| như trên | `GET /api/health` qua proxy, Origin Codespaces | 200 |
| như trên, gọi thẳng :3000 | WS `/khong-phai-ws` | 404 |

> **Ghi chú đính chính (sau Bước 7):** các request trong bảng gửi header Origin trực tiếp tới `localhost:5173`, **không đi qua cổng chuyển tiếp Codespaces**, nên giá trị Origin `https://<codespace>-5173.app.github.dev` là giả lập. Kết quả trong bảng đúng với request đã gửi, nhưng không phản ánh Origin mà server thực sự nhận khi mở trang qua Codespaces.

Kết luận: proxy chuyển tiếp nguyên Origin của trình duyệt; quy tắc Origin của server giữ nguyên và áp dụng đúng. **Để dùng client qua URL Codespaces, server cần `CLIENT_ORIGIN=https://<codespace>-5173.app.github.dev`** (đặt trong `.env` cá nhân, không commit). Ghi chú này sẽ vào `.env.example`/README ở Bước 7–8 theo kế hoạch.

> **Đính chính (sau Bước 7):** kết luận in đậm ở trên **không đúng** với lần kiểm tra trên trình duyệt thật. Khi Game Director mở trang qua URL Codespaces, log server ghi Origin nhận được là `https://localhost:5173` (không phải URL `*.app.github.dev`), và WebSocket chỉ kết nối được khi server chạy với `CLIENT_ORIGIN=https://localhost:5173`. Đây là kết quả quan sát được trên Codespaces của dự án; chưa xác minh với mọi cấu hình Codespaces. Nếu WebSocket bị từ chối, đặt `CLIENT_ORIGIN` đúng bằng origin mà log server ghi lại. `.env.example` (Bước 7) và README (Bước 8) đã ghi giá trị `https://localhost:5173`. Chi tiết: `PHASE0_STEP7_REPORT.md`, mục "Kết nối thật qua Codespaces".

---

## Xác minh giao diện trình duyệt

Thực hiện bởi Game Director, với `npm run dev -w client` đang chạy:

- Mở URL Codespaces HTTPS port 5173 (`https://<codespace>-5173.app.github.dev/`) trên trình duyệt.
- **Kết quả: scene FARMVERSE hiển thị.** Xác nhận Phaser 3 chạy trong trình duyệt thật qua tunnel Codespaces HTTPS, và `allowedHosts: [".app.github.dev"]` hoạt động.

Chưa được báo cáo riêng (không coi là đã xác minh): thiết bị Android, xoay dọc/ngang, lỗi console, HMR.

## Giới hạn xác minh

- **Môi trường của Claude không có trình duyệt** (không có Chromium/Firefox/Playwright). Phần hiển thị chỉ được xác minh qua kiểm tra của Game Director ở trên. Các mục chưa được báo cáo riêng: hành vi khi xoay dọc/ngang, lỗi console, chạy trên Android.
- **WebSocket qua URL Codespaces HTTPS thật** chưa kiểm tra bằng trình duyệt: port riêng tư cần đăng nhập GitHub. Đã giả lập đúng header Origin mà trình duyệt gửi qua proxy Vite. Đường đi thật (trình duyệt → tunnel Codespaces HTTPS/WSS → Vite → server) chưa được thử. *(Đính chính sau Bước 7: giả lập này không đúng với Origin thật qua Codespaces — xem ghi chú ở mục "Proxy và Origin".)*
- **HMR qua Codespaces** chưa kiểm tra (cần trình duyệt).
- Kết nối WebSocket từ trình duyệt thật sẽ kiểm tra ở Bước 7 khi client có code network; thử trên Android ở Bước 8.

---

## Kiểm tra lần cuối (trước khi xin duyệt commit)

| Lệnh | Exit | Kết quả |
|---|---|---|
| `npm run typecheck` | 0 | shared + server + client không lỗi |
| `npm test` | 0 | shared 46/46, server 46/46 |
| `npm run build -w client` | 0 | `dist/index.html` 0.69 kB, `dist/assets/index-C_2DAPQB.js` 1,198.09 kB (gzip 319.36 kB) |
| `git diff --check` | 0 | Không lỗi whitespace (file tracked) |
| Kiểm tra whitespace 8 file `client/` chưa track | — | Không có khoảng trắng cuối dòng; mọi file kết thúc bằng newline |

Phạm vi thay đổi:

- File tracked thay đổi: chỉ `package-lock.json`.
- File mới ngoài `docs/`: chỉ 8 file `client/` (danh sách ở "Files Changed").
- Không có thay đổi ở `server/`, `shared/`, root `package.json`, `tsconfig.base.json`, `.env.example`; không có `.env`.
- Không có file nào được stage (index trống).

*Ghi chú sau Bước 7:* số test ở trên đúng tại thời điểm Bước 6. Từ Bước 7, tổng số test là 150 (shared 60, server 46, client 44).

---

## Files Changed

Mới (8):

- `client/package.json`
- `client/tsconfig.json`
- `client/tsconfig.node.json`
- `client/vite.config.ts`
- `client/index.html`
- `client/src/main.ts`
- `client/src/core/BootScene.ts`
- `client/src/vite-env.d.ts`

Sửa (1):

- `package-lock.json` (thêm `client`, `phaser`, `eventemitter3`; npm bỏ cờ `"peer": true` ở 36 package vì `vite` giờ là dependency trực tiếp)

Bị `.gitignore` bỏ qua (không commit): `client/dist/`, `client/node_modules/` (cache pre-bundle của Vite).

---

## Known Issues

1. **Dev server tải Phaser rất nặng: khoảng 20 MB** (bản pre-bundle của Vite không minify, lấy từ `dist/phaser.js` theo trường `browser` của Phaser). Bản build chỉ 1.2 MB (gzip 319 kB). Trên Android qua tunnel Codespaces, lần tải đầu ở chế độ dev có thể chậm. Phương án (cần duyệt, chưa làm): dùng `vite build` + `vite preview` khi thử trên điện thoại, hoặc alias `phaser` sang `phaser/dist/phaser.min.js` chỉ trong dev.
2. Cảnh báo chunk > 500 kB khi build (Phaser một chunk) — đã dự kiến, tối ưu ở Phase 10.
3. Qua proxy Vite, upgrade WebSocket tới path khác `/ws` (ví dụ `/khong-phai-ws`) bị treo đến timeout thay vì 404, vì Vite không chuyển tiếp path đó. Gọi thẳng server vẫn trả 404. Không ảnh hưởng client.
4. npm 11 vẫn chặn postinstall của `esbuild` (như Bước 4–5); không ảnh hưởng build.

---

## Git

- Chưa stage, chưa commit, chưa push. `main` đi trước `origin/main` 3 commit.
- `git status --short`:

```
 M package-lock.json
?? client/
?? docs/PHASE0_PLAN.md
?? docs/PHASE0_STEP4_PLAN_REPORT.md
?? docs/PHASE0_STEP4_REPORT.md
?? docs/PHASE0_STEP5_PLAN_REPORT.md
?? docs/PHASE0_STEP5_REPORT.md
?? docs/PHASE0_STEP6_PLAN_REPORT.md
?? docs/PHASE0_STEP6_REPORT.md
```

- Commit đề xuất (9 file: 8 file `client/` + `package-lock.json`, không có file `docs/`): `feat: add Phaser 3 client with Vite dev proxy`

**Cập nhật sau commit:** đã commit `6bfc223 feat: add Phaser 3 client with Vite dev proxy` (đúng 9 file trên, không có `docs/`). Chưa push. Trạng thái `git status` ở trên là trước khi commit.
