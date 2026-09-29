-- =============================================================
-- 设备租赁平台 · 初始 Schema
-- PostgreSQL 16
-- =============================================================

-- 租期排他约束所需
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -------------------------------------------------------------
-- 商家
-- -------------------------------------------------------------
CREATE TABLE merchant (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT        NOT NULL,
    contact     TEXT        NOT NULL DEFAULT '',
    phone       TEXT        NOT NULL DEFAULT '',
    status      TEXT        NOT NULL DEFAULT 'active'
                CHECK (status IN ('pending','active','rejected','disabled')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 平台自营，ID 固定为 1
INSERT INTO merchant (id, name, contact, phone, status)
VALUES (1, '平台自营', '平台', '00000000000', 'active');
SELECT setval('merchant_id_seq', 1, true);

-- -------------------------------------------------------------
-- 管理后台账号
-- -------------------------------------------------------------
CREATE TABLE admin_user (
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    merchant_id   BIGINT      NOT NULL REFERENCES merchant(id),
    role          TEXT        NOT NULL DEFAULT 'admin',
    status        TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','disabled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_user_merchant ON admin_user(merchant_id);

-- 初始管理员 admin / admin123（bcrypt cost=10，生产环境请立即改密）
INSERT INTO admin_user (username, password_hash, merchant_id, role)
VALUES (
    'admin',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    1,
    'admin'
);

-- -------------------------------------------------------------
-- 小程序用户
-- -------------------------------------------------------------
CREATE TABLE app_user (
    id          BIGSERIAL PRIMARY KEY,
    platform    TEXT        NOT NULL CHECK (platform IN ('wechat','alipay')),
    open_id     TEXT        NOT NULL,
    union_id    TEXT        NOT NULL DEFAULT '',
    nickname    TEXT        NOT NULL DEFAULT '',
    avatar_path TEXT        NOT NULL DEFAULT '',
    phone       TEXT        NOT NULL DEFAULT '',
    status      TEXT        NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','disabled')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (platform, open_id)
);

-- -------------------------------------------------------------
-- 分类（两级）
-- -------------------------------------------------------------
CREATE TABLE category (
    id          BIGSERIAL PRIMARY KEY,
    merchant_id BIGINT      NOT NULL REFERENCES merchant(id),
    parent_id   BIGINT      NOT NULL DEFAULT 0,
    name        TEXT        NOT NULL,
    sort        INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_category_merchant ON category(merchant_id);
CREATE INDEX idx_category_parent   ON category(parent_id);

-- -------------------------------------------------------------
-- 设备（SKU 层）
-- -------------------------------------------------------------
CREATE TABLE equipment (
    id            BIGSERIAL PRIMARY KEY,
    merchant_id   BIGINT      NOT NULL REFERENCES merchant(id),
    category_id   BIGINT      NOT NULL REFERENCES category(id),
    name          TEXT        NOT NULL,
    spec          TEXT        NOT NULL DEFAULT '',
    description   TEXT        NOT NULL DEFAULT '',
    cover_path    TEXT        NOT NULL DEFAULT '',
    daily_cents   BIGINT      NOT NULL CHECK (daily_cents   >= 0),
    deposit_cents BIGINT      NOT NULL CHECK (deposit_cents >= 0),
    total         INT         NOT NULL CHECK (total         >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_equipment_merchant ON equipment(merchant_id);
CREATE INDEX idx_equipment_category ON equipment(category_id);

-- -------------------------------------------------------------
-- 设备单元（序列号层）
-- -------------------------------------------------------------
CREATE TABLE equipment_unit (
    id           BIGSERIAL PRIMARY KEY,
    merchant_id  BIGINT      NOT NULL REFERENCES merchant(id),
    equipment_id BIGINT      NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    sn           TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'idle'
                 CHECK (status IN ('idle','rented','maintenance','retired')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, sn)
);

CREATE INDEX idx_unit_equipment ON equipment_unit(equipment_id);
CREATE INDEX idx_unit_status    ON equipment_unit(equipment_id, status);

-- -------------------------------------------------------------
-- 订单
-- -------------------------------------------------------------
CREATE TABLE "order" (
    id            BIGSERIAL PRIMARY KEY,
    merchant_id   BIGINT      NOT NULL REFERENCES merchant(id),
    no            TEXT        NOT NULL UNIQUE,
    user_id       BIGINT      NOT NULL REFERENCES app_user(id),
    equipment_id  BIGINT      NOT NULL REFERENCES equipment(id),
    unit_id       BIGINT      NOT NULL REFERENCES equipment_unit(id),
    start_at      DATE        NOT NULL,
    end_at        DATE        NOT NULL,
    days          INT         NOT NULL CHECK (days > 0),
    rent_cents    BIGINT      NOT NULL CHECK (rent_cents    >= 0),
    deposit_cents BIGINT      NOT NULL CHECK (deposit_cents >= 0),
    status        TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','renting','returned','closed','cancelled')),
    dep_status    TEXT        NOT NULL DEFAULT 'unpaid'
                  CHECK (dep_status IN ('unpaid','paid','refunded')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_at > start_at)
);

CREATE INDEX idx_order_merchant  ON "order"(merchant_id);
CREATE INDEX idx_order_user      ON "order"(user_id);
CREATE INDEX idx_order_equipment ON "order"(equipment_id);
CREATE INDEX idx_order_status    ON "order"(merchant_id, status, created_at DESC);

-- -------------------------------------------------------------
-- 租期占用（排他约束核心）
-- -------------------------------------------------------------
CREATE TABLE equipment_unit_occupation (
    id          BIGSERIAL PRIMARY KEY,
    unit_id     BIGINT      NOT NULL REFERENCES equipment_unit(id) ON DELETE CASCADE,
    order_id    BIGINT      NOT NULL REFERENCES "order"(id)        ON DELETE CASCADE,
    period      DATERANGE   NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- 同一单元，租期不得重叠
    CONSTRAINT no_overlap EXCLUDE USING gist (
        unit_id WITH =,
        period  WITH &&
    )
);

CREATE INDEX idx_occupation_unit   ON equipment_unit_occupation(unit_id);
CREATE INDEX idx_occupation_period ON equipment_unit_occupation USING gist (period);

-- -------------------------------------------------------------
-- 支付流水
-- -------------------------------------------------------------
CREATE TABLE payment (
    id             BIGSERIAL PRIMARY KEY,
    merchant_id    BIGINT      NOT NULL REFERENCES merchant(id),
    order_id       BIGINT      NOT NULL REFERENCES "order"(id),
    channel        TEXT        NOT NULL CHECK (channel IN ('wechat','alipay')),
    transaction_id TEXT        NOT NULL DEFAULT '',
    amount_cents   BIGINT      NOT NULL CHECK (amount_cents >= 0),
    status         TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','success','failed','refunded')),
    raw_callback   JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 回调幂等键：同一渠道同一交易号只入账一次
CREATE UNIQUE INDEX uniq_payment_channel_txn
    ON payment(channel, transaction_id)
    WHERE transaction_id <> '';

CREATE INDEX idx_payment_order ON payment(order_id);

-- -------------------------------------------------------------
-- 发票
-- -------------------------------------------------------------
CREATE TABLE invoice (
    id           BIGSERIAL PRIMARY KEY,
    merchant_id  BIGINT      NOT NULL REFERENCES merchant(id),
    no           TEXT        NOT NULL UNIQUE,
    order_id     BIGINT      NOT NULL REFERENCES "order"(id),
    user_id      BIGINT      NOT NULL REFERENCES app_user(id),
    amount_cents BIGINT      NOT NULL CHECK (amount_cents >= 0),
    type         TEXT        NOT NULL CHECK (type IN ('personal','company')),
    title        TEXT        NOT NULL,
    tax_no       TEXT        NOT NULL DEFAULT '',
    email        TEXT        NOT NULL DEFAULT '',
    status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','issued','rejected')),
    invoice_no   TEXT        NOT NULL DEFAULT '',
    reason       TEXT        NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- 一单一票
    UNIQUE (order_id)
);

CREATE INDEX idx_invoice_merchant ON invoice(merchant_id, status, created_at DESC);

-- -------------------------------------------------------------
-- 物流
-- -------------------------------------------------------------
CREATE TABLE shipment (
    id          BIGSERIAL PRIMARY KEY,
    merchant_id BIGINT      NOT NULL REFERENCES merchant(id),
    order_id    BIGINT      NOT NULL REFERENCES "order"(id),
    express     TEXT        NOT NULL DEFAULT '',
    no          TEXT        NOT NULL DEFAULT '',
    status      TEXT        NOT NULL DEFAULT 'none'
                CHECK (status IN ('none','shipped','delivering','signed','returning','received')),
    receiver    TEXT        NOT NULL DEFAULT '',
    phone       TEXT        NOT NULL DEFAULT '',
    address     TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id)
);

CREATE INDEX idx_shipment_merchant ON shipment(merchant_id, status);

CREATE TABLE shipment_trace (
    id          BIGSERIAL PRIMARY KEY,
    shipment_id BIGINT      NOT NULL REFERENCES shipment(id) ON DELETE CASCADE,
    trace_at    TIMESTAMPTZ NOT NULL,
    text        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trace_shipment ON shipment_trace(shipment_id, trace_at DESC);

-- -------------------------------------------------------------
-- updated_at 自动维护
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'merchant','admin_user','app_user','category','equipment',
        'equipment_unit','"order"','payment','invoice','shipment'
    ];
    t TEXT;
    i INT := 0;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        i := i + 1;
        EXECUTE format(
            'CREATE TRIGGER trg_updated_at_%s
             BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
            i, t
        );
    END LOOP;
END $$;
