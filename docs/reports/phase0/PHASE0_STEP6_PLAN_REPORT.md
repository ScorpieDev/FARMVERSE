# PHASE 0 — BƯỚC 6: KẾ HOẠCH CLIENT PHASER 3 + TYPESCRIPT + VITE

## Version

1.1 — cập nhật theo quyết định của Game Director (mục 10).

## Trạng thái

ĐÃ DUYỆT (có điều chỉnh) — chưa sửa code, chưa cài package, chưa stage, chưa commit, chưa push.

Stack giữ nguyên: npm workspaces, TypeScript ~5.9.3, Phaser 3, Vite, Vitest. Không dùng Express, Socket.IO, Colyseus. Nếu phát hiện lỗi tương thích: **dừng và báo cáo, không tự đổi stack** (quyết định 6).

---

## 1. Tài liệu đã đọc

- `TECHNICAL_ARCHITECTURE.md`: client lo rendering, input, UI, camera, gửi request và nhận state; client không phải authority (§4). Module client chỉ tạo khi cần (§14). Ưu tiên low bandwidth, loading nhanh (§21).
- `GAME_DESIGN.md` §18 Mobile-first: touch, UI lớn, ít nút, responsive, loading nhanh. Tài liệu không quy định hướng màn hình hay độ phân giải.
- `GAME_RULES.md`: không có ràng buộc riêng cho client ở Phase 0.
- `CLAUDE_DEVELOPMENT_RULES.md`: bước nhỏ, test trước commit, mobile-first, không abstraction sớm.
- `PHASE0_PLAN.md` Bước 6 và quyết định 2 (Phase 0): Vite proxy `/api`, `/ws` cho dev; giữ `VITE_SERVER_URL` cho deploy.

---

## 2. Hiện trạng repo

- `main` đi trước `origin/main` 3 commit (`3ea25bc`, `b2748ca`, `4436baa`). Chỉ có file docs chưa track.
- Root `package.json`: workspaces `shared`, `server`, `client` (client chưa tồn tại); scripts `build`, `typecheck`, `test` chạy `--workspaces --if-present`.
- Root devDependencies: `typescript ~5.9.3`, `vitest ^5.0.3`, `@types/node ^22`.
- `tsconfig.base.json`: strict, `lib: ["ES2022"]` (không DOM), `module: ESNext`, `moduleResolution: Bundler`, `verbatimModuleSyntax: true`, `exactOptionalPropertyTypes: true`, `skipLibCheck: true`.
- `.env.example`: server `HOST`, `PORT=3000`, `CLIENT_ORIGIN=http://localhost:5173`; client `VITE_SERVER_URL=http://localhost:3000`.
- Chưa có file `.env` ở root → server đang dùng mặc định `CLIENT_ORIGIN=http://localhost:5173`.
- Môi trường hiện tại là GitHub Codespaces (`CODESPACES=true`, domain chuyển tiếp port `app.github.dev`).
- `shared` export `./api`, `./protocol`, `./errors` thẳng từ `.ts`.
- Server (Bước 5): WebSocket chỉ nhận Origin đúng bằng `CLIENT_ORIGIN`; thiếu Origin → 403.
- Test hiện có: shared 46, server 46 (tổng 92).

---

## 3. Phạm vi Bước 6

Có:

- Workspace `client` chạy được bằng Vite (dev, build).
- Phaser 3 khởi động một scene, `Scale.RESIZE`, hiển thị tốt ở cả màn hình dọc và ngang.
- `envDir` trỏ về thư mục gốc; Vite proxy `/api` và `/ws` tới server trong development.
- `allowedHosts` cho Codespaces.
- Typecheck client tích hợp vào `npm run typecheck` ở root.

Không có:

- Code network (fetch health, WebSocket, trạng thái kết nối, reconnect) → Bước 7.
- Test client → Bước 7 (quyết định 4).
- Sửa `.env.example` → Bước 7 (quyết định 5, xem mục 11).
- Bất kỳ thay đổi nào ở `server/` hay `shared/`, kể cả quy tắc kiểm tra Origin (quyết định 2).

---

## 4. File sẽ tạo / sửa

| # | File | Loại | Mục đích |
|---|---|---|---|
| 1 | `client/package.json` | Mới | `@farmverse/client`, `type: module`. Dependency `phaser`, `@farmverse/shared`; devDependency `vite`. Scripts: `dev` (`vite`), `build` (`npm run typecheck && vite build`), `preview` (`vite preview`), `typecheck`. **Không có script `test`** |
| 2 | `client/tsconfig.json` | Mới | Cho `src/`: kế thừa base, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: ["vite/client"]`, `noEmit`. Không có types Node trong code client |
| 3 | `client/tsconfig.node.json` | Mới | Chỉ cho `vite.config.ts`: `types: ["node"]`, `noEmit` |
| 4 | `client/vite.config.ts` | Mới | `envDir: ".."`; `server`: `host: true`, `port: 5173`, `strictPort: true`, `allowedHosts: [".app.github.dev"]`; `proxy` (chỉ dev server): `/api` → `http://localhost:${PORT}`, `/ws` → `ws://localhost:${PORT}` với `ws: true`. `PORT` đọc từ `.env` root qua `loadEnv`, mặc định 3000. Proxy **không** sửa header Origin |
| 5 | `client/index.html` | Mới | Entry Vite. Viewport mobile (`width=device-width, initial-scale=1, viewport-fit=cover`, chặn zoom thao tác), `theme-color`, CSS inline: full màn hình, không scroll/overscroll, `touch-action: none` |
| 6 | `client/src/main.ts` | Mới | `new Game({ type: AUTO, parent: "game", scale: { mode: Scale.RESIZE }, backgroundColor, scene: [BootScene] })` |
| 7 | `client/src/core/BootScene.ts` | Mới | Hiển thị "FARMVERSE" và dòng tạm "Network: not connected yet". Căn giữa lại khi `scale` phát sự kiện `resize` (đổi kích thước/xoay màn hình). Không load asset |
| 8 | `client/src/vite-env.d.ts` | Mới | Khai báo kiểu `ImportMetaEnv.VITE_SERVER_URL?: string` (dùng ở Bước 7) |
| 9 | `package-lock.json` | Sửa | Cập nhật sau khi cài |

Không sửa: `shared/`, `server/`, root `package.json`, `tsconfig.base.json`, `.gitignore` (đã có `dist/`, `.vite/`, `.env`), `.env.example`, tài liệu trong `docs/` (ngoài các file báo cáo).

Không tạo `client/assets/`, `client/public/` khi chưa có asset.

---

## 5. Dependency (`-w client`)

- dependencies: `phaser@~3.90.0` (pin major 3; bản mới nhất trên npm là Phaser 4), `@farmverse/shared` (link workspace, dùng từ Bước 7)
- devDependencies: `vite@^8.3.4`
- Đã có ở root, không cài lại: `typescript`, `vitest`, `@types/node`.
- Không thêm plugin Vite, framework UI, thư viện state hay polyfill nào.

---

## 6. Kiểm tra tương thích (làm TRƯỚC khi viết code client)

Đã xác minh qua metadata npm (chỉ đọc, chưa cài):

| Mục | Kết quả |
|---|---|
| Vite 8.3.4 `engines.node` | `^20.19.0 \|\| >=22.12.0` — khớp Node 24.21 hiện tại và `engines` root `>=22.12.0` |
| Vite 8 bundler | Dùng Rolldown (`rolldown ~1.2`) thay cho esbuild/Rollup |
| Phaser 3.90.0 entry | `module: ./dist/phaser.esm.js` (Vite dùng bản ESM), `main: ./src/phaser.js` |
| Phaser 3.90.0 types | `./types/phaser.d.ts` có sẵn (không cần `@types/phaser`) |
| Vite 8 peer `@types/node` | `^20.19.0 \|\| >=22.12.0` — root đang dùng `^22.20.5`, khớp |

Còn phải xác minh sau khi cài (theo thứ tự, dừng ngay nếu lỗi):

1. **Import Phaser với `verbatimModuleSyntax`**: types của Phaser dùng `export = Phaser`. Dự kiến dùng named import `import { AUTO, Game, Scale, Scene } from "phaser"`. Kiểm tra `tsc` không lỗi, và bản ESM có các named export đó lúc chạy.
2. **Types Phaser với `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`**: `skipLibCheck` bỏ qua lỗi trong `.d.ts`, nhưng code của ta khi truyền config vào Phaser có thể vướng `exactOptionalPropertyTypes`. Nếu lỗi chỉ sửa được bằng cách nới strict trong `tsconfig.base.json` → dừng và báo cáo.
3. **`vite build` với Phaser 3 trên Rolldown**: build không lỗi, trang build (`vite preview`) chạy không lỗi console. Ghi lại kích thước bundle.
4. **`vite.config.ts` với TypeScript 5.9 + `tsconfig.node.json`**: typecheck không lỗi; `vite` tự load được file config.
5. **Proxy WebSocket của Vite 8** (`ws: true`): upgrade `/ws` được chuyển tới server và giữ nguyên header Origin.

---

## 7. Thứ tự triển khai

1. Tạo `client/package.json`, chạy `npm install` → kiểm tra link `@farmverse/client`, lockfile.
2. Kiểm tra tương thích mục 6.1–6.2 bằng `main.ts` + `BootScene.ts` tối thiểu → `npm run typecheck -w client`.
3. Tạo `index.html`, hoàn thiện `main.ts`, `BootScene.ts` (Scale.RESIZE, căn giữa khi resize).
4. Tạo `vite.config.ts`, `tsconfig.node.json` → typecheck (mục 6.4) → `npm run build -w client` (mục 6.3).
5. `npm run dev -w client`, kiểm tra trang (desktop, kích thước mobile, xoay màn hình).
6. Kiểm tra proxy và Origin (mục 8).
7. Chạy toàn bộ kiểm thử root; xác nhận shared 46 + server 46 không đổi.
8. Viết `docs/PHASE0_STEP6_REPORT.md`; dừng chờ duyệt commit.

---

## 8. Kiểm tra Origin thực tế trên Codespaces HTTPS (quyết định 2)

> **Ghi chú sau Bước 7:** giả định trong mục này (trình duyệt gửi Origin `https://<codespace>-5173.app.github.dev` tới server) không khớp với kết quả trên trình duyệt thật. Trên Codespaces của dự án, log server ghi Origin nhận được là `https://localhost:5173`, và WebSocket kết nối được khi server chạy với `CLIENT_ORIGIN=https://localhost:5173`. Chưa xác minh với mọi cấu hình Codespaces. Nội dung kế hoạch bên dưới được giữ nguyên làm lịch sử. Xem `PHASE0_STEP7_REPORT.md`, mục "Kết nối thật qua Codespaces".

Bối cảnh: khi mở client qua `https://<codespace>-5173.app.github.dev`, trình duyệt gửi `Origin: https://<codespace>-5173.app.github.dev`. Vite proxy chuyển tiếp nguyên Origin này tới server. Server (Bước 5) chỉ nhận Origin đúng bằng `CLIENT_ORIGIN`, hiện mặc định là `http://localhost:5173` → dự kiến WebSocket qua URL Codespaces sẽ bị **403**.

Kiểm tra (không sửa code server):

1. Với cấu hình mặc định, gửi upgrade `/ws` qua proxy `localhost:5173` kèm `Origin: https://<codespace>-5173.app.github.dev` → xác nhận 403 và log server `WebSocket upgrade rejected: origin not allowed` ghi đúng origin đó.
2. Chạy server với biến môi trường `CLIENT_ORIGIN=https://<codespace>-5173.app.github.dev` (đặt trên dòng lệnh, **không tạo/sửa file `.env` hay `.env.example`**) → cùng request đó nhận `welcome`.
3. Xác nhận `/api/health` qua proxy hoạt động trong cả hai trường hợp (cùng origin nên không phụ thuộc CORS).
4. Ghi vào báo cáo: giá trị `CLIENT_ORIGIN` cần đặt cho Codespaces và kết quả thực tế.

Giới hạn: Claude không mở được trình duyệt thật qua URL Codespaces (port riêng tư cần đăng nhập GitHub). Phép thử ở trên giả lập đúng header Origin mà trình duyệt gửi. **Game Director cần mở URL Codespaces port 5173 trên trình duyệt (desktop và Android) để xác nhận lần cuối** — ở Bước 6 chỉ cần thấy scene hiển thị; kết nối thật từ trình duyệt kiểm tra ở Bước 7–8.

---

## 9. Lệnh kiểm thử và tiêu chí hoàn thành

Lệnh:

```
npm install
npm run typecheck -w client
npm run build -w client
npm run typecheck                       # root: shared + server + client
npm test                                # root: shared 46 + server 46, không đổi
npm run dev -w server                   # terminal 1
npm run dev -w client                   # terminal 2
curl -s localhost:5173/api/health       # qua proxy
# WebSocket qua proxy bằng client ws (node -e, không thêm dependency), mục 8
```

Tiêu chí hoàn thành:

- Mọi kiểm tra tương thích ở mục 6 đạt, không phải đổi stack hay nới strict của `tsconfig.base.json`.
- `npm run typecheck -w client`, `npm run build -w client` exit 0; có `client/dist/index.html`.
- `npm run typecheck`, `npm test` ở root exit 0; **toàn bộ 92 test shared + server vẫn pass, không sửa test nào**.
- Dev server và `vite preview` hiển thị scene không lỗi console; khi đổi kích thước dọc ↔ ngang nội dung vẫn căn giữa, không thanh cuộn.
- Proxy `/api/health` và `/ws` (hello → welcome) hoạt động qua port 5173.
- Kết quả kiểm tra Origin Codespaces (mục 8) được ghi vào báo cáo.
- Code client không import từ `server/`, không dùng types Node.
- Chỉ thay đổi các file ở mục 4; báo cáo ở `docs/PHASE0_STEP6_REPORT.md`; không commit khi chưa được phép; không commit file trong `docs/`.

---

## 10. Quyết định của Game Director (đã duyệt)

1. Giữ Phaser 3 + TypeScript + Vite; dùng `Scale.RESIZE`, hỗ trợ cả dọc và ngang.
2. Giữ `allowedHosts` cho Codespaces; phải kiểm tra Origin thực tế khi truy cập qua URL Codespaces HTTPS. Không tự thay đổi quy tắc bảo mật Origin ở server.
3. `envDir` ở thư mục gốc; Vite proxy `/api`, `/ws` trong development.
4. Chưa thêm test client ở Bước 6; giữ nguyên toàn bộ test shared và server.
5. Chưa sửa `.env.example` ở Bước 6; ghi rõ cách xử lý `VITE_SERVER_URL` ở Bước 7 (mục 11).
6. Kiểm tra tương thích Vite 8 / Phaser 3 / TypeScript trước khi triển khai; lỗi tương thích → dừng, báo cáo, không tự đổi stack.

---

## 11. Cách xử lý `VITE_SERVER_URL` ở Bước 7 (chỉ ghi kế hoạch, chưa làm)

Quy tắc dự kiến cho client:

| `VITE_SERVER_URL` | HTTP | WebSocket | Dùng khi |
|---|---|---|---|
| Rỗng / không đặt | Cùng origin: `/api/...` (đi qua Vite proxy) | `ws(s)://<host trang>/ws` — `wss` nếu trang là `https` | Dev local và Codespaces |
| `https://api.example.com` | `https://api.example.com/api/...` | `wss://api.example.com/ws` | Deploy, client và server khác origin |
| `http://…` | `http://…/api/...` | `ws://…/ws` | Chỉ dùng khi test local |

Việc cần làm ở Bước 7 (sẽ xin duyệt riêng):

- Đổi `.env.example`: `VITE_SERVER_URL=` (để trống), kèm chú thích "để trống khi dev (dùng Vite proxy); đặt URL server khi deploy".
- Thêm chú thích cho `CLIENT_ORIGIN` trên Codespaces: `https://<codespace>-5173.app.github.dev`.
  - *Ghi chú sau Bước 7:* giá trị thực tế đã ghi vào `.env.example` là `https://localhost:5173` (Origin quan sát được qua Codespaces), không phải URL `*.app.github.dev`.
- `client/src/network/serverUrl.ts` + test Vitest cho bảng trên (rỗng, http, https, có/không dấu `/` cuối, giá trị sai).
- Khi deploy với `VITE_SERVER_URL` khác origin: server cần `CLIENT_ORIGIN` = origin của client deploy (CORS và Origin WebSocket đã hỗ trợ sẵn từ Bước 4–5).

---

## 12. Rủi ro / lưu ý

- **Kích thước bundle:** Phaser 3 khoảng 1 MB (minified) trong một chunk; Vite sẽ cảnh báo chunk lớn. Chấp nhận ở Phase 0, tối ưu ở Phase 10.
- **HMR qua Codespaces:** WebSocket HMR của Vite có thể không chạy qua URL Codespaces HTTPS. Không ảnh hưởng chức năng game (chỉ mất tự reload). Nếu gặp: ghi vào báo cáo và đề xuất cấu hình `server.hmr`, không tự thêm.
- **Port riêng tư Codespaces:** chỉ cần chuyển tiếp port 5173 (proxy gọi server qua `localhost:3000` bên trong Codespace), không cần đặt port 3000 ở chế độ Public.
