CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_by_expiry ON sessions(expires_at);

-- This matches the legacy table so existing rows survive the migration.
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Đang xử lý',
  items_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE orders ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE orders ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN request_id TEXT;
ALTER TABLE orders ADD COLUMN cart_key TEXT;
ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'Chưa thanh toán';
ALTER TABLE orders ADD COLUMN coupon_code TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN vip_care INTEGER NOT NULL DEFAULT 0;
CREATE INDEX orders_by_owner ON orders(user_id, id DESC);
CREATE UNIQUE INDEX orders_by_request ON orders(user_id, request_id);

CREATE TABLE cart_migrations (cart_key TEXT PRIMARY KEY);
CREATE TABLE cart_lines (
  cart_key TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 99),
  PRIMARY KEY (cart_key, variant_id)
);

-- The original catalog stores inventory by model, so its variants share that inventory.
CREATE VIEW product_variants AS
WITH models AS (
  SELECT *, CASE
    WHEN instr(upper(name || ' ' || ram_rom), '128GB') > 0 THEN '128GB'
    WHEN instr(upper(name || ' ' || ram_rom), '512GB') > 0 THEN '512GB'
    ELSE '256GB' END AS base_storage
  FROM products
), capacities(base_storage, storage, delta) AS (
  VALUES ('128GB','128GB',0), ('128GB','256GB',3000000), ('128GB','512GB',7500000),
         ('256GB','256GB',0), ('256GB','512GB',4500000), ('256GB','1TB',10000000),
         ('512GB','256GB',-4000000), ('512GB','512GB',0), ('512GB','1TB',6000000)
), colors AS (
  SELECT id AS product_id,
    CASE WHEN name LIKE 'iPhone Duo %' THEN 'natural'
         WHEN name LIKE 'Xiaomi 17 Ultra %' THEN 'black' ELSE 'default' END AS color_id,
    CASE WHEN name LIKE 'iPhone Duo %' THEN 'Titan tự nhiên'
         WHEN name LIKE 'Xiaomi 17 Ultra %' THEN 'Đen' ELSE '' END AS color,
    image, 1 AS default_color
  FROM models
  UNION ALL SELECT id, 'black', 'Đen', '/phones/iphone-duo-black.png', 0 FROM models WHERE name LIKE 'iPhone Duo %'
  UNION ALL SELECT id, 'desert', 'Titan sa mạc', '/phones/iphone-duo-desert.png', 0 FROM models WHERE name LIKE 'iPhone Duo %'
  UNION ALL SELECT id, 'silver', 'Bạc', '/phones/xiaomi-17-ultra-silver.png', 0 FROM models WHERE name LIKE 'Xiaomi 17 Ultra %'
  UNION ALL SELECT id, 'white', 'Trắng', '/phones/xiaomi-17-ultra-white.png', 0 FROM models WHERE name LIKE 'Xiaomi 17 Ultra %'
)
SELECT m.id || ':' || s.storage || ':' || c.color_id AS variant_id,
  m.id AS product_id, s.storage, c.color, c.image,
  max(0, m.price + s.delta) AS price,
  CASE WHEN m.original_price IS NOT NULL THEN max(0, m.original_price + s.delta) END AS original_price,
  CASE WHEN m.base_storage = s.storage AND c.default_color = 1 THEN 1 ELSE 0 END AS is_default
FROM models m JOIN capacities s ON s.base_storage = m.base_storage
JOIN colors c ON c.product_id = m.id;

-- A failed guard rolls back the entire insert, including inventory and cart updates.
CREATE TRIGGER commit_checkout BEFORE INSERT ON orders
WHEN NEW.user_id IS NOT NULL
BEGIN
  SELECT CASE WHEN
    (SELECT count(*) FROM cart_lines WHERE cart_key = NEW.cart_key) <> json_array_length(NEW.items_json)
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.items_json) item
      LEFT JOIN cart_lines line ON line.cart_key = NEW.cart_key
        AND line.variant_id = json_extract(item.value, '$.variant_id')
      LEFT JOIN product_variants v ON v.variant_id = line.variant_id
      WHERE v.variant_id IS NULL OR line.qty <> json_extract(item.value, '$.qty')
        OR v.price <> json_extract(item.value, '$.price')
    )
    THEN RAISE(ABORT, 'CHECKOUT_CART_CHANGED') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM cart_lines line JOIN product_variants v ON v.variant_id = line.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE line.cart_key = NEW.cart_key GROUP BY p.id
    HAVING sum(line.qty) > p.stock
  ) THEN RAISE(ABORT, 'CHECKOUT_OUT_OF_STOCK') END;
  UPDATE products SET stock = stock - (
    SELECT sum(line.qty) FROM cart_lines line JOIN product_variants v ON v.variant_id = line.variant_id
    WHERE line.cart_key = NEW.cart_key AND v.product_id = products.id
  ) WHERE id IN (
    SELECT v.product_id FROM cart_lines line JOIN product_variants v ON v.variant_id = line.variant_id
    WHERE line.cart_key = NEW.cart_key
  );
  DELETE FROM cart_lines WHERE cart_key = NEW.cart_key;
END;
