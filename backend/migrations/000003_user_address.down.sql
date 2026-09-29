-- 000003_user_address.down.sql
-- 回滚收货地址簿。触发器随表删除自动消失，touch_updated_at 函数由 000001 维护，不动。

DROP TRIGGER IF EXISTS trg_updated_at_user_address ON user_address;
DROP TABLE IF EXISTS user_address;
