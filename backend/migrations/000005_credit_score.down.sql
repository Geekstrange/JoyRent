-- 回滚：信用分与押金减免快照（与 000005_credit_score.up.sql 对应）

ALTER TABLE "order" DROP COLUMN IF EXISTS credit_score;
ALTER TABLE "order" DROP COLUMN IF EXISTS deposit_tier;
ALTER TABLE "order" DROP COLUMN IF EXISTS deposit_original_cents;

ALTER TABLE app_user DROP COLUMN IF EXISTS credit_authorized_at;
ALTER TABLE app_user DROP COLUMN IF EXISTS credit_score;

ALTER TABLE "order" DROP CONSTRAINT IF EXISTS chk_order_deposit_tier;
