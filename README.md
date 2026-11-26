# CloudPhone

Website bán điện thoại trực tuyến, triển khai trên Cloudflare Workers và Cloudflare D1.

## 1. Chức năng

- Xem và tìm kiếm sản phẩm, chọn dung lượng.
- Đăng ký và đăng nhập tài khoản.
- Thêm sản phẩm vào giỏ hàng.
- Đặt hàng và tra cứu đơn hàng.
- Quản trị sản phẩm, tồn kho và đơn hàng.

## 2. Công nghệ và dịch vụ

| Thành phần | Công nghệ hoặc dịch vụ | Vai trò |
|---|---|---|
| Giao diện | React và Vite | Hiển thị website bán hàng |
| Backend | Hono trên Cloudflare Workers | Xử lý API và nghiệp vụ |
| Tệp tĩnh | Workers Static Assets | Phục vụ giao diện và ảnh sản phẩm |
| Cơ sở dữ liệu | Cloudflare D1 | Lưu sản phẩm, tài khoản, giỏ hàng và đơn hàng |
| Quản lý mã nguồn | GitHub | Lưu trữ và theo dõi thay đổi |
| Triển khai | Wrangler | Đưa ứng dụng lên Cloudflare |

Dự án không yêu cầu R2 hoặc một ứng dụng Pages riêng.

## 3. Cấu trúc dự án

- `CloudPhone-source/apps/web`: giao diện React và ảnh sản phẩm.
- `CloudPhone-source/apps/api`: API Hono chạy trên Workers.
- `CloudPhone-source/apps/api/migrations`: các tệp SQL khởi tạo và cập nhật D1.
- `CloudPhone-source/apps/api/wrangler.toml`: cấu hình Worker và kết nối D1.
- `CloudPhone-source/apps/api/scripts/cloudphone-db.mjs`: script triển khai và tạo tài khoản quản trị.

## 4. Chuẩn bị

- Node.js 22 trở lên và npm.
- VS Code hoặc trình soạn thảo tương đương.
- Tài khoản Cloudflare.

Tải mã nguồn bằng **Code → Download ZIP** và giải nén, hoặc clone:

```powershell
git clone https://github.com/luongchiconghash/cloudphone.git
```

Mở thư mục `CloudPhone-source` trong VS Code. Các lệnh npm bên dưới phải chạy tại thư mục này, nơi có `package.json`.

Cài thư viện:

```powershell
npm ci
```

Lệnh kiểm tra phiên bản dưới đây là tùy chọn:

```powershell
node -v
npx wrangler --version
```

## 5. Đăng nhập Cloudflare

```powershell
npx wrangler login
```

Đăng nhập trên trình duyệt và cấp quyền cho Wrangler.

Nếu đã đăng nhập trên máy thì có thể bỏ qua. Kiểm tra tài khoản hiện tại bằng:

```powershell
npx wrangler whoami
```

## 6. Tạo và cấu hình D1

1. Đăng nhập Cloudflare Dashboard.
2. Mở **D1 SQL Database**.
3. Tạo database tên `cloudphone`, hoặc sử dụng database của dự án đã có.
4. Sao chép **Database ID**.
5. Mở `apps/api/wrangler.toml`, cập nhật phần cấu hình:

```toml
[[d1_databases]]
binding = "DB"
database_name = "cloudphone"
database_id = "THAY_BANG_DATABASE_ID_THUC_TE"
```

Giữ các phần cấu hình khác của tệp. Không dùng nguyên Database ID có sẵn trong mã nguồn nếu ID đó không thuộc database đang triển khai.

Worker truy cập D1 qua binding `DB`.

> Nếu tạo bản thử nghiệm với tên khác như `cloudphone-t1`, cần cập nhật tên Worker và database trong `wrangler.toml`, đồng thời cập nhật các tên tương ứng trong `apps/api/scripts/cloudphone-db.mjs`. Chỉ thay Database ID là chưa đủ vì script có kiểm tra tên.

## 7. Khởi tạo bảng và dữ liệu

Chạy trong Terminal:

```powershell
npm run db:init:remote -w apps/api
```

Kiểm tra đúng database trước khi xác nhận.

Lệnh áp dụng các migration chưa chạy vào D1 trên Cloudflare. Không cần tự tạo bảng mẫu trong Console trước.

Kiểm tra dữ liệu bằng các câu SQL sau tại **D1 → database của dự án → Console**:

```sql
SELECT COUNT(*) AS so_san_pham
FROM products;
```

```sql
SELECT id, name, price, stock
FROM products
LIMIT 5;
```

Không chạy SQL trực tiếp trong PowerShell.

## 8. Tạo tài khoản quản trị

```powershell
npm run db:create-staff -w apps/api -- cong-demo --remote
```

Nhập mật khẩu riêng khi được hỏi rồi nhấn Enter. Mật khẩu không hiển thị khi nhập.

Giới hạn mật khẩu phụ thuộc phiên bản script. Bản gốc yêu cầu từ 12 đến 128 ký tự; nếu đã điều chỉnh thì thực hiện theo giới hạn trong mã nguồn.

Chỉ tạo một lần cho mỗi tên tài khoản. Không đưa mật khẩu lên GitHub.

## 9. Triển khai website

```powershell
npm run deploy
```

Lệnh build giao diện và triển khai cả giao diện, ảnh sản phẩm và API lên Workers.

Sau khi thành công, terminal trả về URL dạng:

```text
https://cloudphone.<workers-subdomain>.workers.dev
```

Sử dụng URL thực tế mà Wrangler cung cấp.

- Trang bán hàng: URL triển khai.
- Trang quản trị: thêm `/admin` vào cuối URL.
- Tài khoản quản trị: tài khoản đã tạo ở bước trước.

Sau khi triển khai, website hoạt động trên Cloudflare và không yêu cầu máy phát triển luôn bật.

## 10. Kiểm thử và kiểm tra đơn hàng

### Trên website

1. Đăng ký hoặc đăng nhập tài khoản khách.
2. Chọn sản phẩm và dung lượng.
3. Thêm vào giỏ hàng.
4. Nhập thông tin nhận hàng thử nghiệm.
5. Chọn thanh toán COD và đặt hàng.
6. Ghi lại mã đơn được tạo.

### Trên trang quản trị

1. Mở `/admin`.
2. Đăng nhập tài khoản quản trị.
3. Tìm đơn theo mã vừa ghi.
4. Kiểm tra sản phẩm, số lượng và tổng tiền.
5. Thực hiện cập nhật trạng thái theo kịch bản demo.

### Trong D1

Vào **Cloudflare → D1 → database của dự án → Console**.

Xem năm đơn mới nhất:

```sql
SELECT
    order_code,
    customer_name,
    total_amount,
    status,
    payment_status,
    created_at
FROM orders
ORDER BY id DESC
LIMIT 5;
```

Tìm một đơn cụ thể, thay mã ví dụ bằng mã thực tế:

```sql
SELECT *
FROM orders
WHERE order_code = 'CP-MA-DON-THUC-TE';
```

Xem sản phẩm trong đơn:

```sql
SELECT
    o.order_code,
    json_extract(j.value, '$.name') AS san_pham,
    json_extract(j.value, '$.qty') AS so_luong,
    json_extract(j.value, '$.price') AS don_gia
FROM orders o, json_each(o.items_json) j
WHERE o.order_code = 'CP-MA-DON-THUC-TE';
```

Chi tiết sản phẩm của đơn được lưu trong cột `items_json` của bảng `orders`.

Kiểm tra tồn kho:

```sql
SELECT id, name, stock
FROM products
ORDER BY id;
```

Mã đơn trên website, trang quản trị và D1 phải trùng nhau. Đơn COD chưa đồng nghĩa đã thanh toán.

## 11. Xem ứng dụng trên Cloudflare

Trong **Workers & Pages → Worker của dự án**:

- **Deployments**: xem các phiên bản triển khai.
- **Bindings**: kiểm tra kết nối `DB` với D1.
- **Overview hoặc Metrics**: xem số liệu hoạt động.
- **Observability hoặc Logs**: xem nhật ký khi đã bật.
- Mở URL `workers.dev` để truy cập website.

Trong **D1 → database của dự án**:

- **Explore Data**: xem bảng và dữ liệu.
- **Console**: chạy truy vấn SQL.

## 12. Cập nhật phiên bản mới

Sau khi chỉnh sửa giao diện hoặc API:

```powershell
npm run deploy
```

Nếu có migration mới, chạy trước:

```powershell
npm run db:init:remote -w apps/api
```

Không cần tạo lại database và admin mỗi lần triển khai.

Quy trình này triển khai trực tiếp từ máy bằng Wrangler. `git push` chỉ cập nhật GitHub, chưa tự cập nhật website nếu chưa thiết lập triển khai tự động.

## 13. Một số lỗi thường gặp

### Không tìm thấy Wrangler

Cài thư viện tại thư mục `CloudPhone-source`:

```powershell
npm ci
```

### Tên tài khoản đã tồn tại

Thông báo `UNIQUE constraint failed` cho biết tên đăng nhập đã có trong database.

Dùng tài khoản đó nếu nhớ mật khẩu, hoặc tạo tên khác:

```powershell
npm run db:create-staff -w apps/api -- cong-demo2 --remote
```

### Lỗi đọc JSON khi tạo admin

Trong `apps/api/scripts/cloudphone-db.mjs`, nếu dòng thực thi tạo tài khoản đang là:

```javascript
wrangler(['d1', 'execute', 'cloudphone', target, '--file', sqlFile, '--json', '--yes'], true)
```

Thay bằng:

```javascript
wrangler(['d1', 'execute', 'cloudphone', target, '--file', sqlFile, '--yes'])
```

Giữ tên database đúng với bản triển khai. Không thay đổi dòng `d1 list` dùng để kiểm tra database.

### Không tìm thấy D1

Kiểm tra tài khoản Cloudflare, database đang chọn và Database ID trong `wrangler.toml`:

```powershell
npx wrangler d1 list
```

Không xóa hoặc tạo lại database chỉ vì mở nhầm một liên kết cũ.

## 14. Kịch bản demo

1. Giới thiệu Workers và D1.
2. Mở website bằng URL đã triển khai.
3. Chọn sản phẩm, thêm giỏ và đặt đơn COD.
4. Mở trang quản trị để kiểm tra đơn.
5. Mở D1, truy vấn và đối chiếu mã đơn.
6. Cho xem binding `DB` trong Worker.

Kết quả cần chứng minh: website truy cập được qua Internet, xử lý đặt hàng và lưu dữ liệu thành công vào D1.
