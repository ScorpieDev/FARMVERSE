# PHASE 0 — BƯỚC 4: KẾ HOẠCH SERVER FASTIFY VÀ GET /api/health

## Trạng thái

CHỜ DUYỆT — chưa sửa code, chưa cài package, chưa commit, chưa push.

Stack giữ nguyên: npm workspaces, TypeScript, Fastify, ws, Phaser 3, Vite, Vitest. Không dùng Express, Socket.IO, Colyseus.

---

## 1. Hiện trạng

- Nhánh `main` đi trước `origin/main` 1 commit (`3ea25bc` — Bước 3). File chưa track: `docs/PHASE0_PLAN.md`.
- Chưa có thư mục `server/`. Root `package.json` đã khai báo workspace `server`, không cần sửa root.
- Phiên bản hiện tại trên npm: `fastify` 5.12.5 (dùng pino ^9/^10 bên trong), `@fastify/cors` 11.3.1, `tsx` 4.23.15.

---

## 2. File dự kiến

Tất cả là file mới, trừ lockfile.

| File | Nội dung |
|---|---|
| `server/package.json` | `@farmverse/server`, `type: module`, dependency `@farmverse/shared`. Scripts: `dev` (`tsx watch --env-file-if-exists=../.env src/index.ts`), `start` (`tsx src/index.ts`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`) |
| `server/tsconfig.json` | Kế thừa `tsconfig.base.json`, thêm `noEmit`, `types: ["node"]` |
| `server/src/config.ts` | `loadConfig(env)` đọc `HOST`, `PORT`, `CLIENT_ORIGIN`, `LOG_LEVEL`, mặc định khớp `.env.example`. Giá trị sai (PORT không phải số nguyên 0–65535, origin không phải URL, log level lạ) báo lỗi rõ ràng |
| `server/src/app.ts` | `buildApp(config)`: Fastify + logger pino, CORS chỉ cho `CLIENT_ORIGIN`, `GET /api/health` (dùng `HEALTH_PATH`, `HealthResponse` từ shared). Route lạ → 404 `{code:"NOT_FOUND"}`. Lỗi bất ngờ → 500 `{code:"INTERNAL_ERROR"}`, không lộ chi tiết lỗi ra client |
| `server/src/index.ts` | Load config, listen, `app.close()` khi nhận SIGINT/SIGTERM. Config sai → in lỗi, exit 1 |
| `server/src/app.test.ts` | Test bằng `app.inject()`, không mở port: health, 404, 500, header CORS |
| `server/src/config.test.ts` | Test mặc định, giá trị hợp lệ, từng loại giá trị sai |
| `package-lock.json` | Cập nhật sau khi cài |

So với `PHASE0_PLAN.md`: thêm `config.test.ts`, vì validate config là logic riêng và nên có test riêng.

---

## 3. Dependency (`-w server`)

- dependencies: `fastify@^5`, `@fastify/cors@^11`, `@farmverse/shared` (link workspace)
- devDependencies: `tsx@^4`
- `typescript`, `vitest`, `@types/node` đã có ở root, không cài lại.

---

## 4. Kiểm thử dự kiến

```
npm install
npm run typecheck -w server && npm test -w server
npm run typecheck && npm test          # root, kiểm tra shared vẫn pass
npm run dev -w server
curl -i localhost:3000/api/health
curl -i localhost:3000/khong-ton-tai
PORT=abc npm run start -w server       # phải exit 1 kèm thông báo lỗi
```

---

## 5. Điểm cần duyệt

1. **`version` trong health:** lấy từ `server/package.json` (hiện `0.0.0`) qua `import … with { type: "json" }`, không hardcode.
2. **CORS:** theo quyết định 2, dev đi qua Vite proxy nên trình duyệt không cần CORS. Vẫn giữ `@fastify/cors` theo kế hoạch để dùng khi deploy, chỉ cho phép đúng `CLIENT_ORIGIN`. Nếu muốn tối giản, có thể bỏ CORS đến khi làm deploy.
3. Bước 4 không có WebSocket; để sang Bước 5.

---

## 6. Commit

Chưa commit, chưa push.
