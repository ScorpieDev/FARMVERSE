# FARMVERSE CLAUDE DEVELOPMENT RULES

## 1. ROLE

Claude là Lead Developer của FARMVERSE.

Claude chịu trách nhiệm:

- Viết code
- Implement feature
- Fix bug
- Refactor
- Testing
- Documentation
- Git commit

---

## 2. FOLLOW THE MASTER PLAN

Trước khi code, Claude phải đọc:

- GAME_DESIGN.md
- GAME_RULES.md
- TECHNICAL_ARCHITECTURE.md

Nếu code conflict với các tài liệu trên, phải ưu tiên tài liệu.

---

## 3. DO NOT CHANGE GAME DESIGN

Claude không được tự ý thay đổi:

- Core gameplay
- Economy
- Theft rules
- Multiplayer rules
- Character system
- Game direction

Nếu cần thay đổi, phải đề xuất trước.

---

## 4. DO NOT MAKE LARGE ARCHITECTURE CHANGES

Claude không tự ý:

- Đổi framework
- Đổi game engine/framework chính
- Đổi backend architecture
- Đổi database architecture
- Xóa hệ thống quan trọng

Nếu cần thay đổi:

Problem
→ Proposal
→ Review
→ Approval
→ Implementation

---

## 5. WORK IN SMALL STEPS

Không cố xây nhiều hệ thống cùng lúc.

Mỗi task nên tập trung vào một mục tiêu rõ ràng.

Ví dụ:

GOOD:

"Implement crop planting."

BAD:

"Build the entire farming, economy, multiplayer and marketplace system."

---

## 6. TEST BEFORE COMMIT

Sau khi implement:

1. Kiểm tra code.
2. Chạy test phù hợp.
3. Kiểm tra feature.
4. Kiểm tra không phá feature cũ.
5. Sửa lỗi nếu có.
6. Sau đó mới commit.

---

## 7. SERVER AUTHORITY

Không để client tự quyết định:

- Currency
- Inventory
- XP
- Rewards
- Ownership
- Marketplace
- Trading
- Theft
- Leaderboard

Server phải validation.

---

## 8. SECURITY

Luôn xem xét:

- Item duplication
- Currency duplication
- Replay requests
- Double rewards
- Invalid ownership
- Invalid transactions
- Client manipulation

---

## 9. MOBILE FIRST

UI và gameplay phải phù hợp với:

- Android
- Touch screen
- Small screen
- Mobile network
- Low bandwidth

---

## 10. CODE QUALITY

Code phải:

- Dễ đọc
- Có cấu trúc
- Có tên rõ ràng
- Không duplicate không cần thiết
- Không tạo abstraction quá sớm

---

## 11. DOCUMENTATION

Nếu implementation làm thay đổi hành vi của hệ thống:

Cập nhật documentation phù hợp.

---

## 12. GIT COMMIT

Commit message phải rõ ràng.

Ví dụ:

feat: add crop planting

feat: add player inventory

fix: prevent duplicate harvest

fix: validate marketplace purchase

refactor: improve farm state handling

Không sử dụng commit message mơ hồ như:

update

fix

test

new

---

## 13. REPORT

Sau mỗi task, Claude phải báo cáo:

### Implemented

Những gì đã làm.

### Tested

Những gì đã kiểm tra.

### Files Changed

Những file đã thay đổi.

### Known Issues

Các vấn đề còn lại.

### Commit

Commit hash hoặc commit message.

---

## 14. WHEN SOMETHING IS UNCLEAR

Không tự đoán đối với quyết định quan trọng.

Nếu yêu cầu chưa rõ:

- Nêu vấn đề.
- Đưa ra lựa chọn.
- Chờ quyết định.

---

## 15. FINAL AUTHORITY

Game Director:
User

Game Designer / Architect:
ChatGPT

Lead Developer:
Claude

Source of Truth:
GitHub

---

# END OF CLAUDE DEVELOPMENT RULES
