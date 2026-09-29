// File Name: order.go
// Created Time: 2026-09-22 18:52:25
// Update Time: 2026-09-22 18:52:25

package model

import "time"

type Order struct {
	ID           int64     `db:"id"            json:"id"`
	MerchantID   int64     `db:"merchant_id"   json:"merchant_id"`
	No           string    `db:"no"            json:"no"`
	UserID       int64     `db:"user_id"       json:"user_id"`
	EquipmentID  int64     `db:"equipment_id"  json:"equipment_id"`
	UnitID       int64     `db:"unit_id"       json:"unit_id"`
	StartAt      time.Time `db:"start_at"      json:"start_at"`
	EndAt        time.Time `db:"end_at"        json:"end_at"`
	Days         int       `db:"days"          json:"days"`
	RentCents    int64     `db:"rent_cents"    json:"rent_cents"`
	// DepositCents **实收**押金（已按信用分减免后的金额）
	DepositCents int64 `db:"deposit_cents" json:"deposit_cents"`
	// DepositOriginalCents 原押金（减免前的标价）。
	// 保留它是为了让前端能展示「原价 ¥X → 实付 ¥Y」，
	// 事后也能解释「这单为什么只收了这么多」。
	DepositOriginalCents int64 `db:"deposit_original_cents" json:"deposit_original_cents"`
	// DepositTier 押金档位：full_free（全免）/ half（半价）/ full（全额）
	DepositTier string `db:"deposit_tier" json:"deposit_tier"`
	// CreditScore 下单时的信用分**快照**。
	// ⚠️ 必须是快照而非实时查用户表 —— 用户后续信用分变化不应改变历史订单的押金依据。
	CreditScore int    `db:"credit_score" json:"credit_score"`
	Status      string `db:"status"        json:"status"`
	DepStatus   string `db:"dep_status"    json:"dep_status"`
	// 收货信息快照：下单时从用户地址簿拷入，之后不随地址簿变动。
	// 放订单上而不是只放 shipment，是因为 shipment 要到管理员发货时才创建，
	// 那之前用户看订单详情应当仍能看到自己选的收货地址。
	Receiver  string    `db:"receiver"  json:"receiver"`
	Phone     string    `db:"phone"     json:"phone"`
	Address   string    `db:"address"   json:"address"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}

const (
	OrderStatusPending   = "pending"
	OrderStatusPaid      = "paid"
	OrderStatusRenting   = "renting"
	OrderStatusReturned  = "returned"
	OrderStatusClosed    = "closed"
	OrderStatusCancelled = "cancelled"
)

const (
	DepStatusUnpaid   = "unpaid"
	DepStatusPaid     = "paid"
	DepStatusRefunded = "refunded"
)

// OrderFlow 订单状态合法流转表
var OrderFlow = map[string][]string{
	OrderStatusPending:  {OrderStatusPaid, OrderStatusCancelled},
	OrderStatusPaid:     {OrderStatusRenting, OrderStatusCancelled},
	OrderStatusRenting:  {OrderStatusReturned},
	OrderStatusReturned: {OrderStatusClosed},
}

// CanTransition 校验订单状态流转是否合法
func CanTransition(from, to string) bool {
	next, ok := OrderFlow[from]
	if !ok {
		return false
	}
	for _, s := range next {
		if s == to {
			return true
		}
	}
	return false
}

// OrderStatusText 中文文案（与原型一致）
var OrderStatusText = map[string]string{
	OrderStatusPending:   "待支付",
	OrderStatusPaid:      "已支付",
	OrderStatusRenting:   "租赁中",
	OrderStatusReturned:  "已归还",
	OrderStatusClosed:    "已完成",
	OrderStatusCancelled: "已取消",
}

var DepStatusText = map[string]string{
	DepStatusUnpaid:   "未支付",
	DepStatusPaid:     "已收取",
	DepStatusRefunded: "已退还",
}
