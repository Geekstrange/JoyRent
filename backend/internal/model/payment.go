// File Name: payment.go
// Created Time: 2026-09-22 18:53:44
// Update Time: 2026-09-22 18:53:44


package model

import (
	"encoding/json"
	"time"
)

type Payment struct {
	ID            int64           `db:"id"             json:"id"`
	MerchantID    int64           `db:"merchant_id"    json:"merchant_id"`
	OrderID       int64           `db:"order_id"       json:"order_id"`
	Channel       string          `db:"channel"        json:"channel"`
	TransactionID string          `db:"transaction_id" json:"transaction_id"`
	AmountCents   int64           `db:"amount_cents"   json:"amount_cents"`
	Status        string          `db:"status"         json:"status"`
	RawCallback   json.RawMessage `db:"raw_callback"   json:"-"`
	CreatedAt     time.Time       `db:"created_at"     json:"created_at"`
	UpdatedAt     time.Time       `db:"updated_at"     json:"updated_at"`
}

const (
	PayChannelWechat = "wechat"
	PayChannelAlipay = "alipay"
)

const (
	PayStatusPending  = "pending"
	PayStatusSuccess  = "success"
	PayStatusFailed   = "failed"
	PayStatusRefunded = "refunded"
)
