# CloudPhone

CloudPhone là website thương mại điện tử mẫu cho môn Điện toán đám mây. Khách có thể tìm kiếm điện thoại, chọn dung lượng, so sánh máy, đặt hàng và tra cứu đơn. Trang /admin quản lý sản phẩm, tồn kho, trạng thái đơn và thanh toán.

- apps/web chứa giao diện React, Vite và ảnh sản phẩm.
- apps/api chứa API Hono, cấu hình Worker và migrations D1.
- DEPLOY.md hướng dẫn chạy local, tạo tài khoản và triển khai dự án Cloudflare riêng.

```powershell
npm ci
npm run db:init
npm run db:create-staff -w apps/api -- cloudphone-admin --local
npm run dev
```

Mở http://localhost:5173 hoặc http://localhost:5173/admin. Lệnh tạo tài khoản sẽ hỏi mật khẩu riêng. COD được bật mặc định. Các tùy chọn VietQR, Basin và Workers AI được cấu hình theo hướng dẫn triển khai.

```powershell
npm run typecheck
npm run build
npm test
```
