-- 000004_order_address.up.sql
-- 订单收货地址快照。
--
-- 为什么是「快照列」而不是一个 address_id 外键：
--  1. **历史订单必须定格**。用户改了地址簿，三个月前的订单显示的还是当时的收货地址，
--     这是所有电商的通行做法 —— 外键会跟着地址簿一起变，历史就失真了。
--  2. 地址可以**被删除**。纯外键在地址删掉后就成了悬空引用，订单详情直接查不出收货信息。
--  3. 收货信息本来就要落给发货方看，快照让订单自洽、不依赖别的表还活着。
--
-- 为什么放 order 而不是复用 shipment：
--  shipment 是**管理员发货时**才创建的（Upsert 里 status 直接置 shipped），
--  下单到发货之间有一段空窗；这段时间用户看订单详情应当能看到自己选的收货地址。
--  shipment 的 receiver/phone/address 继续保留 —— 那是发货时的实际收件信息，
--  允许管理员按实际发货情况修正，与订单快照各司其职。

ALTER TABLE "order"
    ADD COLUMN IF NOT EXISTS receiver TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS phone    TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS address  TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN "order".receiver IS '收货人姓名快照（下单时写入，不随地址簿变动）';
COMMENT ON COLUMN "order".phone    IS '收货人手机号快照';
COMMENT ON COLUMN "order".address  IS '完整收货地址快照（省市区 + 详细地址）';
