# FARMVERSE TECHNICAL ARCHITECTURE

## Version
1.1

## 1. OVERVIEW

FARMVERSE là multiplayer social farming game.

Kiến trúc ưu tiên:

- Mobile-first
- Cloud-first
- Server-authoritative
- Modular
- Scalable
- AI-assisted development

---

# 2. TECHNOLOGY STACK

## Client

Phaser

TypeScript

HTML5

Web / PWA

## Server

Node.js

TypeScript

## Communication

HTTPS cho API.

WebSocket cho realtime multiplayer.

## Repository

GitHub

## Development

Cloud development environment.

Project owner không bắt buộc phải có PC.

---

# 3. HIGH LEVEL ARCHITECTURE

Player
↓
Android Browser
↓
FARMVERSE Client
↓
HTTPS / WebSocket
↓
FARMVERSE Server
↓
Database

Client:

Phaser + TypeScript

Server:

Node.js + TypeScript

---

# 4. CLIENT

Client chịu trách nhiệm:

- Rendering
- Animation
- Input
- UI
- Camera
- Local presentation
- Gửi request
- Nhận server state

Client không phải authority của economy.

---

# 5. SERVER

Server chịu trách nhiệm:

- Authentication
- Player state
- Farm state
- Inventory
- Currency
- Progression
- Marketplace
- Trading
- Theft
- Permissions
- Multiplayer state
- Validation

---

# 6. DATABASE

Database lưu persistent data.

Dự kiến:

- Player
- Farm
- Inventory
- Item
- Crop
- Building
- Currency
- Transaction
- Friend
- Trade
- MarketplaceListing

Database cụ thể sẽ được lựa chọn trước khi triển khai persistent backend.

---

# 7. GAME DATA

Game data chia thành hai loại.

## Static Data

Ví dụ:

- Crop definitions
- Item definitions
- Building definitions
- Cosmetic definitions

## Player Data

Ví dụ:

- Level
- XP
- Inventory
- Currency
- Farm layout
- Cosmetics

---

# 8. SERVER AUTHORITATIVE FLOW

Ví dụ Harvest:

Client
↓
Harvest request
↓
Server
↓
Validate player
↓
Validate farm
↓
Validate crop
↓
Validate growth state
↓
Calculate reward
↓
Update inventory
↓
Update XP
↓
Save state
↓
Client
↓
Display result

---

# 9. ECONOMY FLOW

Ví dụ Marketplace:

Player A
↓
Create listing
↓
Server validation
↓
Marketplace
↓
Player B
↓
Buy
↓
Server validation
↓
Transfer item
↓
Transfer currency
↓
Transaction log

---

# 10. MULTIPLAYER MODEL

Realtime data:

- Player movement
- Player presence
- Realtime interactions

Persistent data:

- Inventory
- Currency
- Farm
- Cosmetics
- Progression

Không phải mọi dữ liệu đều cần realtime.

---

# 11. SECURITY

Server phải validate các request quan trọng.

Đặc biệt:

- Rewards
- Purchases
- Trading
- Marketplace
- Inventory modification
- Currency modification
- Theft
- Leaderboard

---

# 12. DUPLICATION PROTECTION

Transaction quan trọng nên có unique request ID.

Flow:

Request
↓
Server
↓
Already processed?
↓
YES → trả kết quả cũ

NO
↓
Process transaction

Mục tiêu là chống:

- Double reward
- Item duplication
- Currency duplication
- Replay request
- Double transaction

---

# 13. PROJECT STRUCTURE

Repository dự kiến:

FARMVERSE/

client/
├── src/
├── assets/
└── public/

server/
└── src/

shared/
└── src/

docs/
├── GAME_DESIGN.md
├── GAME_RULES.md
├── TECHNICAL_ARCHITECTURE.md
├── DEVELOPMENT_ROADMAP.md
├── CURRENT_STATUS.md
└── CHANGELOG.md

tests/

README.md

package.json

---

# 14. CLIENT MODULES

Dự kiến:

client/src/

core/
player/
farm/
farming/
inventory/
building/
character/
social/
city/
minigames/
ui/
network/

Không tạo tất cả module ngay từ Phase 0.

Chỉ tạo module khi cần.

---

# 15. SERVER MODULES

Dự kiến:

server/src/

auth/
players/
farms/
farming/
inventory/
economy/
marketplace/
trading/
social/
theft/
leaderboards/
multiplayer/

Chỉ triển khai module khi Phase yêu cầu.

---

# 16. SHARED

Shared code có thể chứa:

- Types
- Schemas
- Constants
- Item definitions
- Crop definitions
- Protocol definitions

Mục tiêu là client và server sử dụng cùng contract.

---

# 17. API DESIGN

API phải có:

- Request
- Validation
- Response
- Error handling

Ví dụ:

POST /api/farm/plant

POST /api/farm/harvest

GET /api/player

GET /api/inventory

POST /api/marketplace/list

POST /api/marketplace/buy

Endpoint thực tế sẽ được thiết kế khi feature được triển khai.

---

# 18. ERROR HANDLING

Server phải trả lỗi rõ ràng.

Ví dụ:

CROP_NOT_READY

INSUFFICIENT_CURRENCY

ITEM_NOT_OWNED

INVALID_TRANSACTION

TRADE_EXPIRED

PERMISSION_DENIED

Client chuyển lỗi thành thông báo dễ hiểu.

---

# 19. LOGGING

Server phải log các hoạt động quan trọng.

Ví dụ:

- Player ID
- Action
- Timestamp
- Request ID
- Result

Đặc biệt log:

- Currency transactions
- Item transactions
- Trades
- Marketplace
- Theft
- Rewards

---

# 20. TESTING

Hệ thống quan trọng phải có test.

Ưu tiên:

- Economy
- Inventory
- Farming
- Marketplace
- Trading
- Theft
- Permissions

Testing tăng dần theo từng phase.

---

# 21. PERFORMANCE

FARMVERSE là mobile-first.

Ưu tiên:

- Low bandwidth
- Efficient assets
- Optimized rendering
- Minimal unnecessary network traffic
- Lazy loading khi phù hợp

---

# 22. SCALABILITY

Không tối ưu quá mức trước khi có prototype.

Architecture phải:

- Modular
- Có thể mở rộng multiplayer
- Có thể mở rộng database
- Có thể thêm features
- Có thể thay backend component nếu cần

MVP vẫn phải đơn giản.

---

# 23. DEPLOYMENT

Mục tiêu:

GitHub
↓
Cloud Development / Build
↓
Web Server
↓
Android Browser

CI/CD sẽ được triển khai sau khi foundation ổn định.

---

# 24. DEVELOPMENT PRINCIPLE

Không tạo abstraction quá sớm.

Không tạo hệ thống phức tạp nếu MVP chưa cần.

Ưu tiên:

Working
↓
Correct
↓
Tested
↓
Maintainable
↓
Optimized

---

# 25. ARCHITECTURE CHANGE POLICY

Mọi thay đổi architecture lớn phải được review.

Claude có thể đề xuất.

ChatGPT phân tích.

Game Director quyết định.

---

# 26. CURRENT STATUS

Architecture:

FOUNDATION — Phase 0 completed (2026-10-10); Phase 1 — Farming in progress

Stack đã chốt trong Phase 0:

- npm workspaces: `shared/`, `server/`, `client/`
- TypeScript ~5.9.3 (strict)
- Server: Node.js 24 LTS (`.nvmrc` = `24`), Fastify 5, `ws` 8; chạy bằng `tsx` (chưa build production)
- Client: Phaser 3.90, Vite 8
- Test: Vitest; test đặt cạnh code trong từng workspace; `tests/` ở root dành cho integration test sau này (chưa tạo)

Đã triển khai:

- Shared contract (§16): protocol WebSocket v1, kiểu `GET /api/health`, error codes (§18), validator
- Server (§5): `GET /api/health`; WebSocket `/ws` kiểm tra Origin = `CLIENT_ORIGIN`, giới hạn message 4096 byte; validate config; log cơ bản bằng logger của Fastify (request, kết nối/ngắt WebSocket, từ chối Origin) — chưa đáp ứng đủ §19 (Player ID, Action, Request ID, Result); tắt êm khi nhận SIGINT/SIGTERM
- Client (§4): Phaser scene hiển thị trạng thái kết nối; health check, handshake `hello`/`welcome`, ping 15 s đo RTT, reconnect có giới hạn
- Communication (§2): HTTP(S) cho API, WebSocket cho realtime (local dev dùng `http`/`ws`; qua URL Codespaces là `https`/`wss`; HTTPS khi deploy chưa triển khai); khi dev, Vite proxy `/api` và `/ws` (client chỉ dùng một origin); `VITE_SERVER_URL` dành cho deploy khác origin
- Testing (§20): 637 test tự động sau Phase 1 Bước 1.7 (507 khi đóng Phase 0)
- Phase 1 — Farming (Bước 1.1–1.8 xong; chờ duyệt đóng phase):
  - Database (§6): SQLite qua `node:sqlite` (built-in Node.js 24), schema có migration (`players`, `plots`, `inventory`, `action_log`), ràng buộc CHECK/foreign key, transaction `BEGIN IMMEDIATE`; dữ liệu đọc ra được kiểm tra (`assertFarmData`)
  - Guest session: server tạo player UUID và token 32 byte, chỉ lưu SHA-256; xác thực `Authorization: Bearer`
  - Farm API (§17): `POST /api/session`, `GET /api/farm`, `POST /api/farm/plant`, `/harvest`, `/refill-seeds`; quy tắc thuần trong `server/src/farming/rules.ts`; thời gian chỉ lấy từ server
  - Duplication protection (§12): request ID (UUID v4) + `action_log` trong cùng transaction — gửi lại trả kết quả cũ, không áp dụng lần hai; dùng lại cho hành động khác → `REQUEST_ID_REUSED`
  - Logging (§19): mỗi hành động farm ghi Player ID, Action, Request ID, Result (không ghi token)
  - Phần thưởng: coin và XP mỗi lần thu hoạch (giá trị tạm thời)
  - Client (§4): `FarmScene` (Phaser) — 6 ô đất (2×3 dọc, 3×2 ngang), nút hạt giống, nút nhận hạt miễn phí, coin/XP, sản phẩm đã thu; token lưu trong `localStorage`, token không hợp lệ → hiện "Start a new farm" (không tự tạo farm mới); request ID bằng `crypto.randomUUID` (không có fallback `Math.random`), thử lại tối đa 3 lần với cùng request ID khi lỗi mạng/502–504; thời gian lớn lên hiển thị theo đồng hồ server ước lượng, server quyết định mọi hành động

Chưa triển khai:

- Authentication thật (đăng nhập, khôi phục tài khoản); hiện chỉ có guest token
- Rate limit / giới hạn kết nối, heartbeat WebSocket phía server
- Multiplayer gameplay, economy (shop, marketplace), level
- Deployment, CI/CD (§23)
- Production build cho server

Ghi chú môi trường dev (Codespaces): Origin mà server nhận khi mở client qua URL Codespaces được quan sát là `https://localhost:5173`, nên server chạy với `CLIENT_ORIGIN=https://localhost:5173`. Chưa xác minh với mọi cấu hình Codespaces. Xem README.

---

# END OF TECHNICAL ARCHITECTURE
