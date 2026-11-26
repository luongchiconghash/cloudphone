# cloudphone
Chuẩn bị code: mở thư mục dự án trong VS Code, chạy npm ci.

Đăng nhập: chạy npx wrangler login.

Tạo D1: tạo database và lấy Database ID.

Cấu hình: điền tên Worker, tên database và ID trong wrangler.toml; bảo đảm script kiểm tra đúng tên.

Khởi tạo D1:
npm run db:init:remote -w apps/api


Tạo admin:
npm run db:create-staff -w apps/api -- cong-demo --remote


Triển khai:
npm run deploy


Kiểm thử: mở URL website, đặt đơn, kiểm tra trong admin và đối chiếu D1.
