-- 000003_user_address.up.sql
-- 用户收货地址簿。
--
-- 背景：订单/物流此前只把收货信息（receiver/phone/address）以**快照**形式存在
-- shipment 表里，账号维度没有可复用的地址。用户每次下单都要重填，
-- 「我的 → 收货地址」入口无从落地（原型里一直是「演示版未开放」）。
--
-- 设计要点：
--  1. 地址归属于 app_user（owner_user_id），与 merchant.owner_user_id 同一套约定。
--  2. `is_default` 用**部分唯一索引**保证「每个用户至多一个默认地址」，
--     而不是靠应用层自觉 —— 并发的两次「设为默认」在 DB 层就会被挡住，
--     应用层只需把它翻译成一个友好提示。
--  3. 省市区与详细地址分开存：区划要用于后续的运费/可达范围判断，
--     塞进一个 TEXT 里就再也拆不出来了。detail 只存门牌号等剩下的部分。
--  4. 下单时把地址**快照**进订单/物流，不在这里做外键联动 ——
--     地址簿改了不该改写历史订单的收货信息。

CREATE TABLE IF NOT EXISTS user_address (
    id            BIGSERIAL   PRIMARY KEY,
    owner_user_id BIGINT      NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    receiver      TEXT        NOT NULL DEFAULT '',
    phone         TEXT        NOT NULL DEFAULT '',
    province      TEXT        NOT NULL DEFAULT '',
    city          TEXT        NOT NULL DEFAULT '',
    district      TEXT        NOT NULL DEFAULT '',
    detail        TEXT        NOT NULL DEFAULT '',
    is_default    BOOLEAN     NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  user_address IS '用户收货地址簿';
COMMENT ON COLUMN user_address.owner_user_id IS '归属的 app_user.id';
COMMENT ON COLUMN user_address.province IS '省 / 直辖市';
COMMENT ON COLUMN user_address.city IS '市；直辖市与 province 相同';
COMMENT ON COLUMN user_address.district IS '区 / 县';
COMMENT ON COLUMN user_address.detail IS '详细地址（街道、门牌号等），不含省市区';
COMMENT ON COLUMN user_address.is_default IS '是否默认地址；每个用户至多一个，由部分唯一索引保证';

-- 「按用户列地址」是唯一高频路径
CREATE INDEX IF NOT EXISTS idx_user_address_owner
    ON user_address (owner_user_id, is_default DESC, id DESC);

-- 每个用户至多一条默认地址
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_address_default
    ON user_address (owner_user_id)
    WHERE is_default;

-- updated_at 自动维护（复用 000001 里已定义的 touch_updated_at 函数；
-- 000001 用循环批量建 trg_updated_at_N，新表这里单独建，沿用同样的函数）
DROP TRIGGER IF EXISTS trg_updated_at_user_address ON user_address;
CREATE TRIGGER trg_updated_at_user_address
    BEFORE UPDATE ON user_address
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
