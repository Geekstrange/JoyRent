-- 000002_merchant_owner.up.sql
-- 商家入驻申请需要绑定申请人（app_user），否则无法回答「我是否已经提交过申请」，
-- 表现为：提交后再次点开「商家入驻」仍然是空白表单，而不是入驻进度。
--
-- 历史数据（含平台自营 ID=1）没有申请人，留 0 表示「非用户申请，平台侧创建」。
ALTER TABLE merchant
    ADD COLUMN IF NOT EXISTS owner_user_id BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN merchant.owner_user_id IS '提交入驻申请的 app_user.id；0 表示平台侧创建（如平台自营）';

-- 「按申请人查申请」是高频路径（我的页 + 入驻进度页），建索引；
-- 同时用于防止同一用户重复申请（部分唯一索引，仅约束真实用户 0 之外的记录）。
CREATE INDEX IF NOT EXISTS idx_merchant_owner_user_id
    ON merchant (owner_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_owner_user_pending
    ON merchant (owner_user_id)
    WHERE owner_user_id <> 0;
