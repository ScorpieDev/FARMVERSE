# FARMVERSE GAME RULES

## Version
1.0

## 1. GAME OWNERSHIP

Mỗi player sở hữu một farm riêng.

Farm phải được liên kết với player account.

Server xác nhận quyền sở hữu farm.

Client không được tự quyết định ownership.

---

## 2. PLAYER IDENTITY

Mỗi player có một Player ID duy nhất.

Player ID do server quản lý.

Client không được tự tạo hoặc sửa Player ID.

---

## 3. FARM

Player có quyền:

- Trồng cây
- Thu hoạch
- Xây dựng
- Trang trí
- Phát triển farm

Các hành động quan trọng phải được server xác nhận.

---

## 4. FARMING

Crop có trạng thái:

Seed
→ Growing
→ Ready
→ Harvested

Client không được tự đặt crop thành Ready.

Server xác định crop có đủ điều kiện thu hoạch hay chưa.

---

## 5. INVENTORY

Inventory thuộc về player.

Server là authority của inventory.

Client không được:

- Tự thêm item
- Tự xóa item
- Tự tăng quantity
- Tự tạo item
- Tự sửa item ID

---

## 6. CURRENCY

FARMVERSE sử dụng virtual currency.

Currency không phải tiền thật.

Server quản lý currency.

Client không được:

- Tạo coin
- Sửa coin
- Tạo transaction giả
- Tự thay đổi giá item

---

## 7. ECONOMY

Mọi hoạt động ảnh hưởng economy phải được server validation.

Bao gồm:

- Mua
- Bán
- Trade
- Reward
- Marketplace
- Farming rewards

---

## 8. MARKETPLACE

Marketplace transaction phải kiểm tra:

1. Seller
2. Item
3. Ownership
4. Quantity
5. Price
6. Buyer
7. Currency

Sau đó server mới thực hiện transaction.

---

## 9. TRADING

Trading phải có:

- Trade request
- Item validation
- Ownership validation
- Quantity validation
- Confirmation
- Server transaction

Hai bên phải xác nhận giao dịch.

---

## 10. THEFT

Theft chỉ được tác động lên tài nguyên được phép.

Không được trộm:

- Coins
- Premium currency
- Character
- Cosmetics
- Premium items
- Farm ownership
- Permanent unlocks

Theft phải có:

- Giới hạn
- Cooldown
- Protection
- Anti-abuse
- Logging

---

## 11. COSMETICS

Cosmetics phục vụ:

- Identity
- Social expression
- Collection

Cosmetic không bị mất do theft.

Cosmetic không được trở thành lợi thế gameplay không công bằng.

---

## 12. PROGRESSION

XP và Level do server quản lý.

Client không được tự tăng XP hoặc Level.

---

## 13. LEADERBOARD

Leaderboard sử dụng dữ liệu server.

Client không được tự gửi điểm số cuối cùng.

---

## 14. MULTIPLAYER

Server là authority đối với dữ liệu quan trọng.

Client gửi request.

Server kiểm tra.

Server quyết định kết quả.

---

## 15. FARM VISIT

Visitor không mặc định có quyền chỉnh sửa farm.

Mọi quyền chỉnh sửa phải được server xác nhận.

---

## 16. SOCIAL

Social system có thể bao gồm:

- Friends
- Chat
- Farm visits
- Likes
- Invitations

Các tính năng sẽ được phát triển từng giai đoạn.

---

## 17. MINIGAMES

Minigames sử dụng virtual currency nếu có economy.

Không có:

- Cash-out
- Đổi coin thành tiền thật
- Rút tiền
- Nạp tiền để đánh cược

Minigames phục vụ entertainment.

---

## 18. PAY-TO-WIN

FARMVERSE không lấy pay-to-win làm core design.

Cosmetic và social expression được ưu tiên.

---

## 19. ANTI-CHEAT

Các dữ liệu quan trọng phải server authoritative.

Đặc biệt:

- Currency
- Inventory
- XP
- Rewards
- Trading
- Marketplace
- Theft
- Leaderboards

---

## 20. DATA INTEGRITY

Hệ thống phải chống:

- Item duplication
- Currency duplication
- Double rewards
- Replay requests
- Double transactions

Transaction quan trọng nên có request ID duy nhất.

---

## 21. NEW FEATURES

Không tự ý thêm feature lớn ngoài roadmap.

Feature mới phải được đánh giá trước khi triển khai.

---

## 22. ARCHITECTURE CHANGES

Claude không được tự ý thay đổi architecture lớn.

Quy trình:

Problem
→ Proposal
→ Review
→ Approval
→ Implementation

---

## 23. FINAL AUTHORITY

Game Director có quyền quyết định cuối cùng.

Game Director:
User

Game Designer / Architect:
ChatGPT

Lead Developer:
Claude

Source of Truth:
GitHub

---

# END OF GAME RULES
