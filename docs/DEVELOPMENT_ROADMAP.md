# FARMVERSE DEVELOPMENT ROADMAP

## Version
1.1

---

# PHASE 0 — FOUNDATION

Mục tiêu:

Tạo nền tảng project có thể chạy được.

Tasks:

- Setup client
- Setup server
- Setup shared
- Setup TypeScript
- Setup project structure
- Setup basic communication
- Setup development environment
- Create basic test system

Completion:

Client chạy được.

Server chạy được.

Client có thể kết nối server.

Status:

COMPLETED (2026-10-10)

Kết quả:

- Client chạy được: Phaser 3 + Vite.
- Server chạy được: Fastify + `ws`.
- Client kết nối được server: `/api/health` + WebSocket `/ws`, Game Director xác nhận trên trình duyệt qua URL Codespaces.
- 150 test tự động pass.
- Việc còn lại: review tổng thể Phase 0 và tài liệu (đang chờ Game Director duyệt), kiểm tra Android (hoãn theo quyết định của Game Director).

---

# PHASE 1 — FARMING

Mục tiêu:

Tạo gameplay loop đầu tiên.

Tasks:

- Player
- Farm
- Soil
- Crops
- Planting
- Growth
- Harvest
- Inventory
- Basic rewards

Core loop:

Plant
→ Grow
→ Harvest
→ Inventory

---

# PHASE 2 — PROGRESSION

Tasks:

- XP
- Level
- Basic unlocks
- Basic quests
- Progression UI

---

# PHASE 3 — BUILDING

Tasks:

- Farm grid
- Buildings
- Decorations
- Placement
- Remove / move objects
- Save farm layout

---

# PHASE 4 — CHARACTER

Tasks:

- Character system
- Hair
- Shirt
- Pants
- Basic customization
- Cosmetic inventory

---

# PHASE 5 — MULTIPLAYER

Tasks:

- Player presence
- Multiplayer movement
- Farm visiting
- Player interaction
- Realtime synchronization

---

# PHASE 6 — ECONOMY

Tasks:

- Coins
- Shop
- Marketplace
- Buying
- Selling
- Transactions
- Economy validation

---

# PHASE 7 — SOCIAL

Tasks:

- Friends
- Friend requests
- Chat
- Likes
- Invitations
- Social interactions

---

# PHASE 8 — THEFT & SECURITY

Tasks:

- Theft system
- Theft limits
- Cooldowns
- Protection
- Security
- Anti-abuse
- Transaction logging

---

# PHASE 9 — MINIGAMES

Tasks:

- Farm City
- Card minigames
- Casual minigames
- Multiplayer minigame sessions
- Virtual currency integration

Minigames must not support:

- Cash-out
- Real-money gambling
- Currency withdrawal

---

# PHASE 10 — POLISH & RELEASE

Tasks:

- UI polish
- Performance
- Mobile optimization
- Bug fixing
- Security review
- Economy balancing
- Tutorial
- Onboarding
- Deployment
- Release preparation

---

# MVP DEFINITION

MVP chỉ cần:

Player
→ Farm
→ Plant
→ Grow
→ Harvest
→ Inventory
→ Coin
→ XP

MVP phải:

- Chạy được
- Có thể chơi được
- Có server validation
- Không có duplication cơ bản
- Có thể mở rộng

---

# DEVELOPMENT PRINCIPLE

Không phát triển tất cả hệ thống cùng lúc.

Mỗi phase phải:

Design
→ Implement
→ Test
→ Review
→ Commit

Sau khi phase ổn định mới chuyển phase tiếp theo.

---

# CURRENT PHASE

Phase 0 — Foundation

Status:

COMPLETED (review tổng thể Phase 0 và tài liệu vẫn đang chờ Game Director duyệt)

Phase tiếp theo: Phase 1 — Farming (NOT STARTED, chờ Game Director duyệt).

---

# END OF ROADMAP
