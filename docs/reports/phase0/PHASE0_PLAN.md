# FARMVERSE PHASE 0 PLAN

## Version
1.0

## Status

PLANNING — chờ Game Director duyệt các quyết định ở mục 4.

> **Cập nhật sau rà soát tài liệu (sau Bước 8):** trạng thái thực tế là ĐANG THỰC HIỆN. 4 quyết định ở mục 4 đã được Game Director duyệt: (1) TypeScript `~5.9.3`; (2) phương án (b) — Vite proxy `/api`, `/ws` khi dev, giữ `VITE_SERVER_URL` cho deploy; (3) Phase 0 chạy server bằng `tsx`, chưa build production; (4) test đặt cạnh code trong từng workspace, `tests/` ở root dành cho integration test sau này.
>
> Tiến độ (chưa push):
>
> | Bước | Commit |
> |---|---|
> | 1 | `5faeaff chore: initialize monorepo workspace` |
> | 2 | `1bbb65d feat: add shared protocol types` |
> | 3 | `3ea25bc chore: add TypeScript and Vitest tooling with shared protocol tests` |
> | 4 | `b2748ca feat: add Fastify server with health endpoint` |
> | 5 | `4436baa feat: add WebSocket endpoint with hello/ping protocol` |
> | 6 | `6bfc223 feat: add Phaser 3 client with Vite dev proxy` |
> | 7 | `04f1aa8 feat: add client server connection management` |
> | 8 | `5924c4f docs: add README and root dev scripts` |
> | 9 | Chưa thực hiện |
>
> Nội dung kế hoạch bên dưới được giữ nguyên làm lịch sử; chi tiết từng bước nằm trong `PHASE0_STEP*_PLAN_REPORT.md` và `PHASE0_STEP*_REPORT.md`.

Kiến trúc đã duyệt (không thay đổi): npm workspaces, TypeScript, Fastify, ws, Phaser 3, Vite, Vitest.

Không dùng: Express, Socket.IO, Colyseus.

---

# 1. HIỆN TRẠNG

## Đã hoàn thành

- Bước 1 — `chore: initialize monorepo workspace` (5faeaff)
  - npm workspaces: `shared`, `server`, `client`
  - `tsconfig.base.json` (strict)
  - `.env.example`, `.gitignore`, `.nvmrc` (Node 22)
- Bước 2 — `feat: add shared protocol types` (1bbb65d)
  - `shared/src/protocol.ts`: WebSocket contract v1 (`hello`/`ping` → `welcome`/`pong`/`error`), decode/validate
  - `shared/src/api.ts`: `HEALTH_PATH`, `HealthResponse`
  - `shared/src/errors.ts`: `ErrorCode`, `ErrorPayload`, `isErrorCode`

## Còn thiếu / vấn đề

1. Chưa cài `typescript`, nên `npm run typecheck -w shared` không chạy được.
2. Chưa có Vitest và chưa có test nào.
3. Chưa có `server/` và `client/`.
4. `package-lock.json` chưa được track.
5. `engines.node` là `>=22.0.0`, nhưng Vite 8 và Vitest 5 cần `>=22.12.0`.
6. `shared` export thẳng file `.ts` và `protocol.ts` import `./errors.js`. Node không tự chạy được kiểu import này, nên server cần `tsx`.
7. `isServerMessage` không kiểm tra `error.code` bằng `isErrorCode` (lỗi nhỏ).
8. `CURRENT_STATUS.md` và `DEVELOPMENT_ROADMAP.md` vẫn ghi Phase 0 là NOT STARTED.

---

# 2. NGUYÊN TẮC THỰC HIỆN

- Mỗi bước là một commit riêng.
- Trước mỗi commit chạy đủ `npm run typecheck && npm test` ở root.
- Test đặt cạnh code trong từng workspace (`*.test.ts`).
- Chỉ tạo module khi cần (TECHNICAL_ARCHITECTURE.md §14, §15).

---

# 3. CÁC BƯỚC

## Bước 3 — Tooling và test cho `shared`

File:

- `package.json` (root): devDependencies, `engines.node >=22.12.0`
- `package-lock.json`
- `shared/package.json`: thêm script `test`
- `shared/src/protocol.ts`: dùng `isErrorCode` khi kiểm tra `error.code`
- Mới: `shared/src/protocol.test.ts`, `shared/src/errors.test.ts`

Dependency (root, dev):

- `typescript@~5.9.3`
- `vitest@^5`
- `@types/node@^22`

Lệnh kiểm thử:

```
npm install
npm run typecheck -w shared
npm test -w shared
```

Hoàn thành khi:

- Typecheck không còn lỗi.
- Có test cho: JSON hỏng, thiếu field, sai kiểu, `type` lạ, message hợp lệ của từng loại, `error.code` không hợp lệ.
- Lockfile đã được commit.

---

## Bước 4 — Server: Fastify, config và `GET /api/health`

File mới:

- `server/package.json`, `server/tsconfig.json`
- `server/src/config.ts`: đọc và validate `HOST`, `PORT`, `CLIENT_ORIGIN`, `LOG_LEVEL`
- `server/src/app.ts`: `buildApp(config)` — CORS, route health, handler 404 và lỗi trả về `ErrorPayload`
- `server/src/index.ts`: khởi động server, tắt êm khi nhận SIGINT/SIGTERM
- `server/src/app.test.ts`

Dependency (`-w server`):

- `fastify@^5`
- `@fastify/cors@^11`
- dev: `tsx@^4`

Script:

- `dev`: `tsx watch --env-file-if-exists=../.env src/index.ts`
- `start`: `tsx src/index.ts`
- `typecheck`: `tsc --noEmit`
- `test`: `vitest run`

Lệnh kiểm thử:

```
npm test -w server            # dùng app.inject(), không mở port thật
npm run dev -w server
curl localhost:3000/api/health
```

Hoàn thành khi:

- Health trả đúng `HealthResponse`.
- Route lạ trả 404 với `{ code: "NOT_FOUND" }`.
- Config sai (ví dụ `PORT` không phải số) làm server dừng ngay với thông báo rõ ràng.
- Có log request (logger pino có sẵn trong Fastify).

---

## Bước 5 — Server: WebSocket qua `ws` tại `/ws`

File:

- Mới: `server/src/multiplayer/connection.ts` — xử lý từng message, test được riêng
- Mới: `server/src/multiplayer/websocket.ts` — `WebSocketServer({ noServer: true })` gắn vào sự kiện `upgrade` của `app.server`, chỉ nhận `WS_PATH`, kiểm tra Origin
- Mới: `server/src/multiplayer/websocket.test.ts`
- Sửa: `server/src/app.ts`

Dependency (`-w server`):

- `ws@^8`
- dev: `@types/ws@^8`

Hành vi:

- `hello` đúng version → `welcome`
- `hello` sai version → `error UNSUPPORTED_PROTOCOL_VERSION`
- `ping` → `pong`
- Message hỏng → `error INVALID_MESSAGE`
- Giới hạn kích thước message (`maxPayload` nhỏ, phù hợp mobile, chống lạm dụng)
- Đóng socket khi server shutdown

Lệnh kiểm thử:

```
npm test -w server            # listen port 0, kết nối bằng client ws thật
```

Hoàn thành khi:

- Test bao phủ đủ các hành vi trên.
- Path sai bị từ chối upgrade.
- Server tắt sạch, không treo test.

---

## Bước 6 — Client: Vite và Phaser 3

File mới:

- `client/package.json`
- `client/tsconfig.json`: thêm lib `DOM`, `types: ["vite/client"]`
- `client/vite.config.ts`: `server.host: true`, port 5173
- `client/index.html`: viewport cho mobile
- `client/src/main.ts`: Phaser `Scale.FIT`, tự canh giữa màn hình
- `client/src/core/BootScene.ts`
- `client/src/vite-env.d.ts`: khai báo kiểu `VITE_SERVER_URL`

Dependency (`-w client`):

- `phaser@~3.90.0` — bản mới nhất trên npm là Phaser 4, phải pin major 3
- dev: `vite@^8`

Script: `dev`, `build` (`tsc --noEmit && vite build`), `preview`, `typecheck`.

Lệnh kiểm thử:

```
npm run build -w client
npm run dev -w client         # mở trình duyệt, kiểm tra cả kích thước mobile
```

Hoàn thành khi:

- Scene hiển thị, không lỗi console.
- Build ra `client/dist`.
- Typecheck sạch.

---

## Bước 7 — Client: kết nối server

File:

- Mới: `client/src/network/serverUrl.ts` — sinh `ws://` từ `http://`, `wss://` từ `https://`
- Mới: `client/src/network/connection.ts` — fetch health, mở WS, gửi `hello`, ping định kỳ đo RTT, reconnect có backoff
- Mới: `client/src/network/serverUrl.test.ts`
- Mới: `client/src/network/connection.test.ts` — WebSocket giả, môi trường node, không cần jsdom
- Sửa: `client/src/core/BootScene.ts` — hiển thị trạng thái: Connecting / Connected · RTT xx ms / Disconnected

> **Ghi chú sau Bước 7:** tên file thực tế theo kế hoạch Bước 7 đã duyệt (`PHASE0_STEP7_PLAN_REPORT.md`): `client/src/network/ServerConnection.ts` (thay cho `connection.ts`), `client/src/network/connectionStatus.ts`, `client/src/network/serverUrl.ts`, mỗi file có `*.test.ts` đi kèm. Ngoài ra Bước 7 sửa `shared/src/api.ts` (thêm `isHealthResponse`, có `shared/src/api.test.ts`), `client/package.json` (script `test`) và `.env.example`.

Dependency: không cần thêm (dùng `fetch` và `WebSocket` có sẵn của trình duyệt).

Lệnh kiểm thử:

```
npm test -w client
npm run dev -w server   # terminal 1
npm run dev -w client   # terminal 2
```

Kiểm tra tay: trạng thái chuyển sang Connected; tắt server → Disconnected; bật lại → tự kết nối lại.

Hoàn thành khi:

- Test logic pass.
- Client chỉ dùng type và decoder từ `@farmverse/shared`.
- Message lạ từ server bị bỏ qua và ghi log, không làm crash client.

---

## Bước 8 — Quy trình dev và kiểm tra end-to-end

File:

- `package.json` (root): thêm script `dev:server`, `dev:client`
- `README.md`: hướng dẫn chạy, kể cả trên Codespaces

Dependency: không cần. Mỗi workspace chạy ở một terminal riêng; không thêm `concurrently` trừ khi Game Director muốn.

Lệnh kiểm thử:

```
npm ci
npm run typecheck
npm test
npm run build
```

Sau đó thử kết nối thật trên Codespaces từ trình duyệt Android.

Hoàn thành khi: đạt đủ ba điều kiện Phase 0 trong roadmap (client chạy, server chạy, client kết nối được server) và đã kiểm tra trên điện thoại thật.

> **Ghi chú sau Bước 8:** theo quyết định của Game Director ở Bước 8, kiểm tra được thực hiện trên trình duyệt qua URL Codespaces; **kiểm tra Android được hoãn** và ghi là việc còn lại khi đóng Phase 0.

---

## Bước 9 — Cập nhật tài liệu và đóng Phase 0

File:

- `docs/CURRENT_STATUS.md`
- `docs/DEVELOPMENT_ROADMAP.md`: Phase 0 → COMPLETED
- `docs/CHANGELOG.md`
- `docs/TECHNICAL_ARCHITECTURE.md`: có thể thêm mục ngắn về stack đã chốt
- `docs/PHASE0_PLAN.md`: đánh dấu hoàn thành

Lệnh kiểm thử: chạy lại toàn bộ kiểm thử ở root.

Hoàn thành khi:

- Tài liệu khớp với code.
- Có báo cáo theo mục 13 của CLAUDE_DEVELOPMENT_RULES.md.

---

# 4. QUYẾT ĐỊNH CẦN GAME DIRECTOR DUYỆT

1. **Phiên bản TypeScript.** Bản mới nhất trên npm là TS 7 (viết lại bằng Go). Đề xuất pin `~5.9.3` để ổn định với Vite, tsx và typings của Phaser 3. Chọn 6.x hoặc 7.x cũng được nếu là quyết định có chủ ý.

2. **Cách client gọi server trên Codespaces.** `.env.example` đang dùng `VITE_SERVER_URL` gọi thẳng port 3000. Trên Codespaces, port riêng tư sẽ chặn request khác origin.
   - (a) Đặt port 3000 ở chế độ Public, giữ nguyên thiết kế hiện tại.
   - (b) Dùng proxy của Vite cho `/api` và `/ws`, client chỉ cần một origin.

   Đề xuất: (b) cho môi trường dev, vẫn giữ `VITE_SERVER_URL` cho môi trường deploy.

   > **Ghi chú sau Bước 7:** đã chọn (b). Hệ quả quan sát được trên Codespaces của dự án: Origin mà server nhận khi mở trang qua URL Codespaces là `https://localhost:5173`, nên server chạy với `CLIENT_ORIGIN=https://localhost:5173` (chưa xác minh với mọi cấu hình Codespaces). Xem `PHASE0_STEP7_REPORT.md`.

3. **Cách chạy server.** Trong Phase 0, server chạy bằng `tsx` (cả `dev` lẫn `start`), không build ra JS. Bundle cho production để đến khi làm deployment.

4. **Thư mục `tests/` ở root** (TECHNICAL_ARCHITECTURE.md §13). Đề xuất để test cạnh code trong từng workspace, giữ `tests/` cho integration test sau này. Phase 0 chưa tạo thư mục này.

---

# END OF PHASE 0 PLAN
