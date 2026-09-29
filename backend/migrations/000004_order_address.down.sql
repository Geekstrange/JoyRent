-- 000004_order_address.down.sql
-- 回滚订单收货地址快照列。

ALTER TABLE "order"
    DROP COLUMN IF EXISTS receiver,
    DROP COLUMN IF EXISTS phone,
    DROP COLUMN IF EXISTS address;
