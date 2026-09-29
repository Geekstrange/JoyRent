// File Name: invoice.go
// Created Time: 2026-09-22 18:53:05
// Update Time: 2026-09-22 18:53:05


package model

import "time"

type Invoice struct {
	ID          int64     `db:"id"           json:"id"`
	MerchantID  int64     `db:"merchant_id"  json:"merchant_id"`
	No          string    `db:"no"           json:"no"`
	OrderID     int64     `db:"order_id"     json:"order_id"`
	UserID      int64     `db:"user_id"      json:"user_id"`
	AmountCents int64     `db:"amount_cents" json:"amount_cents"`
	Type        string    `db:"type"         json:"type"`
	Title       string    `db:"title"        json:"title"`
	TaxNo       string    `db:"tax_no"       json:"tax_no"`
	Email       string    `db:"email"        json:"email"`
	Status      string    `db:"status"       json:"status"`
	InvoiceNo   string    `db:"invoice_no"   json:"invoice_no"`
	Reason      string    `db:"reason"       json:"reason"`
	CreatedAt   time.Time `db:"created_at"   json:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"   json:"updated_at"`
}

const (
	InvoiceStatusPending  = "pending"
	InvoiceStatusIssued   = "issued"
	InvoiceStatusRejected = "rejected"
)

const (
	InvoiceTypePersonal = "personal"
	InvoiceTypeCompany  = "company"
)

var InvoiceStatusText = map[string]string{
	InvoiceStatusPending:  "待审核",
	InvoiceStatusIssued:   "已开票",
	InvoiceStatusRejected: "已拒绝",
}

var InvoiceTypeText = map[string]string{
	InvoiceTypePersonal: "个人",
	InvoiceTypeCompany:  "企业",
}

// InvoiceAllowedOrderStatus 可开票的订单状态
var InvoiceAllowedOrderStatus = []string{
	OrderStatusPaid,
	OrderStatusRenting,
	OrderStatusReturned,
	OrderStatusClosed,
}

func CanIssueInvoice(orderStatus string) bool {
	for _, s := range InvoiceAllowedOrderStatus {
		if s == orderStatus {
			return true
		}
	}
	return false
}
