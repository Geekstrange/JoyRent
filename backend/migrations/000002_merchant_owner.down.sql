-- 000002_merchant_owner.down.sql
DROP INDEX IF EXISTS uq_merchant_owner_user_pending;
DROP INDEX IF EXISTS idx_merchant_owner_user_id;
ALTER TABLE merchant DROP COLUMN IF EXISTS owner_user_id;
