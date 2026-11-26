# Triển khai CloudPhone

CloudPhone là ứng dụng React/Vite và Hono chạy trên một **Cloudflare Worker**. Workers Static Assets phục vụ giao diện và ảnh sản phẩm. Các đường dẫn /api/* chạy qua Worker và truy cập **Cloudflare D1**. GitHub có thể dùng để quản lý mã nguồn.

## Chạy trên máy

Yêu cầu Node.js 22 trở lên, khuyến nghị Node.js 24. Từ thư mục chứa package.json, chạy:

```powershell
npm ci
npm run db:init
npm run db:create-staff -w apps/api -- cloudphone-admin --local
npm run dev
```

Nhập mật khẩu riêng khi được hỏi. Mở http://localhost:5173 để xem cửa hàng hoặc http://localhost:5173/admin để đăng nhập quản trị. Wrangler tạo D1 cục bộ và nạp 24 sản phẩm mẫu. Lệnh khởi tạo chỉ áp dụng các migration chưa chạy.

## Tạo dự án Cloudflare riêng

1. Đăng nhập bằng Wrangler và tạo D1 mang tên cloudphone. D1 chứa sản phẩm, giỏ hàng, phiên đăng nhập, tài khoản và đơn hàng.

```powershell
npx wrangler login
npx wrangler d1 create cloudphone
```

2. Mở apps/api/wrangler.toml và thay UUID toàn số 0 ở database_id bằng UUID D1 cloudphone. Cấu hình dùng tên Worker cloudphone. Giữ thư mục apps/web/public/phones khi đưa mã lên GitHub.

3. Tạo bảng, tạo tài khoản quản trị và triển khai Worker. Wrangler in URL của Worker khi chạy xong.

```powershell
npm run db:init:remote -w apps/api
npm run db:create-staff -w apps/api -- cloudphone-admin --remote
npm run deploy
```

Lệnh sử dụng D1 từ xa đối chiếu UUID với database cloudphone trong tài khoản đang đăng nhập. Sau các lần chỉnh giao diện hoặc API, chạy npm run deploy. Khi có migration mới, chạy lại npm run db:init:remote -w apps/api trước khi triển khai.

## Tùy chọn

- **VietQR**. Thêm hai Worker secrets VIETQR_BANK_BIN và VIETQR_ACCOUNT_NUMBER bằng Dashboard hoặc Wrangler trong apps/api. COD luôn khả dụng. Nhân viên xác nhận đã thu tiền sau khi đối soát.
- **Workers AI và Vectorize**. BIX dùng bộ tư vấn theo danh mục mặc định. Để bật tìm kiếm ngữ nghĩa và mô hình ngôn ngữ, tạo chỉ mục cloudphone-index, 1024 chiều, cosine, sau đó bỏ chú thích hai binding AI và VECTORIZE trong wrangler.toml, triển khai lại và bấm **Đồng bộ BIX** trong /admin bằng tài khoản quản trị.
- **Basin Catalog**. Thêm Worker secrets BASIN_ENDPOINT và BASIN_GROUP_ID của luồng CloudPhone nếu cần thống kê. Sau khi cấu hình cả hai giá trị, Worker gửi sự kiện tổng quát và số liệu đơn đã tạo. Sự kiện đặt hàng dùng mã và tổng tiền thực tế từ D1. Payload không gồm địa chỉ IP khách hàng, nội dung tìm kiếm hoặc câu hỏi chatbot. Kiểm tra cấu trúc payload với luồng Basin trước khi trình bày.

## Mô tả dùng trong báo cáo

CloudPhone dùng React và Vite cho giao diện. Cloudflare Workers triển khai cả API Hono và tệp tĩnh của website qua Workers Static Assets, bao gồm ảnh điện thoại. D1 lưu danh mục sản phẩm, giỏ hàng, tài khoản, phiên đăng nhập và đơn hàng. GitHub quản lý mã nguồn. Báo cáo ghi URL Worker sau khi triển khai.

## Kịch bản demo

Tìm một điện thoại, chọn dung lượng, thêm vào giỏ và tạo đơn COD bằng tài khoản khách. Ghi lại mã đơn CP-…, đăng nhập /admin bằng tài khoản quản trị, xác nhận đơn rồi đối chiếu mã đơn và tồn kho trong D1. Nếu demo thu tiền, cập nhật trạng thái **Đã thanh toán** để số tiền xuất hiện ở **Doanh thu đã thu**.
