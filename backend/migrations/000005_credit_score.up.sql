-- 信用分与押金减免快照
--
-- 背景：押金不再固定取 equipment.deposit_cents，而是按用户信用分减免
-- （≥700 全免 / 650-699 半价 / 其余全额，见 internal/service/credit.go）。
-- 因此需要：
--   · 用户表存信用分（授权一次、结果落库，与真实芝麻的模型一致）
--   · 订单表存**快照**（原押金、实收押金、档位、当时分数），
--     这样历史订单不会因用户信用分后续变化而改变押金依据

-- ── 用户信用分 ────────────────────────────────────────────────────────
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS credit_score INT NOT NULL DEFAULT 0;

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS credit_authorized_at TIMESTAMPTZ;

COMMENT ON COLUMN app_user.credit_score IS '信用分（芝麻分）；0 表示未授权/未获取到，押金按全额处理';
COMMENT ON COLUMN app_user.credit_authorized_at IS '最近一次信用授权时间，用于判断是否过期';

-- ── 订单押金减免快照 ──────────────────────────────────────────────────
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS deposit_original_cents BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "order" ADD COLUMN IF NOT EXISTS deposit_tier TEXT NOT NULL DEFAULT 'full';

ALTER TABLE "order" ADD COLUMN IF NOT EXISTS credit_score INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN "order".deposit_original_cents IS '原押金（减免前标价），用于展示"原价→实付"';
COMMENT ON COLUMN "order".deposit_tier IS '押金档位：full_free/half/full';
COMMENT ON COLUMN "order".credit_score IS '下单时的信用分快照（非实时值）';

-- 档位取值范围约束（ADD CONSTRAINT 不支持 IF NOT EXISTS，用 DO 块保证幂等）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_deposit_tier'
    ) THEN
        ALTER TABLE "order" ADD CONSTRAINT chk_order_deposit_tier
            CHECK (deposit_tier IN ('full_free', 'half', 'full'));
    END IF;
END $$;

-- ── 历史数据回填 ──────────────────────────────────────────────────────
-- 迁移前创建的订单统统是"全额押金"（当时还没有信用分概念），
-- 把原押金回填为实收押金，避免前端展示出"原价 0 元"的怪异效果。
UPDATE "order"
   SET deposit_original_cents = deposit_cents
 WHERE deposit_original_cents = 0
   AND deposit_cents > 0;
