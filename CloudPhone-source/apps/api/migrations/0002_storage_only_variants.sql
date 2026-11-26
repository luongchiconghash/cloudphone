-- Merge cart lines that differ only by the old color suffix.
INSERT INTO cart_lines (cart_key, variant_id, qty)
SELECT line.cart_key, v.product_id || ':' || v.storage, min(99, sum(line.qty))
FROM cart_lines line JOIN product_variants v ON v.variant_id = line.variant_id
GROUP BY line.cart_key, v.product_id, v.storage
ON CONFLICT(cart_key, variant_id) DO UPDATE SET qty = min(99, cart_lines.qty + excluded.qty);

DELETE FROM cart_lines WHERE variant_id IN (SELECT variant_id FROM product_variants);

DROP VIEW product_variants;
CREATE VIEW product_variants AS
WITH models AS (
  SELECT id, price, original_price, CASE
    WHEN instr(upper(name || ' ' || ram_rom), '128GB') > 0 THEN '128GB'
    WHEN instr(upper(name || ' ' || ram_rom), '512GB') > 0 THEN '512GB'
    ELSE '256GB' END AS base_storage
  FROM products
), capacities(base_storage, storage, delta) AS (
  VALUES ('128GB','128GB',0), ('128GB','256GB',3000000), ('128GB','512GB',7500000),
         ('256GB','256GB',0), ('256GB','512GB',4500000), ('256GB','1TB',10000000),
         ('512GB','256GB',-4000000), ('512GB','512GB',0), ('512GB','1TB',6000000)
)
SELECT m.id || ':' || s.storage AS variant_id,
  m.id AS product_id, s.storage,
  max(0, m.price + s.delta) AS price,
  CASE WHEN m.original_price IS NOT NULL THEN max(0, m.original_price + s.delta) END AS original_price,
  CASE WHEN s.delta = 0 THEN 1 ELSE 0 END AS is_default
FROM models m JOIN capacities s ON s.base_storage = m.base_storage;
