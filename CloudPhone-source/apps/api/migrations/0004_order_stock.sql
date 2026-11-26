-- Changing order status and inventory must succeed or roll back together.
CREATE TRIGGER apply_order_stock_change
AFTER UPDATE OF status ON orders
WHEN (OLD.status = 'Đã hủy') <> (NEW.status = 'Đã hủy')
BEGIN
  SELECT CASE WHEN OLD.status = 'Đã hủy' AND EXISTS (
    SELECT 1
    FROM json_each(OLD.items_json) AS item
    LEFT JOIN products AS p ON p.id = json_extract(item.value, '$.id')
    GROUP BY json_extract(item.value, '$.id'), p.id, p.stock
    HAVING p.id IS NULL OR SUM(json_extract(item.value, '$.qty')) > p.stock
  ) THEN RAISE(ABORT, 'RESTORE_OUT_OF_STOCK') END;

  UPDATE products
  SET stock = stock + (
    SELECT SUM(json_extract(item.value, '$.qty'))
    FROM json_each(OLD.items_json) AS item
    WHERE json_extract(item.value, '$.id') = products.id
  ) * CASE WHEN NEW.status = 'Đã hủy' THEN 1 ELSE -1 END
  WHERE id IN (SELECT json_extract(value, '$.id') FROM json_each(OLD.items_json));
END;
