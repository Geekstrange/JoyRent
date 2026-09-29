// File Name: merchant.go
// Created Time: 2026-09-22 18:53:34
// Update Time: 2026-09-22 18:53:34


package model

import "time"

type Merchant struct {
	ID          int64     `db:"id"            json:"id"`
	Name        string    `db:"name"          json:"name"`
	Contact     string    `db:"contact"       json:"contact"`
	Phone       string    `db:"phone"         json:"phone"`
	Status      string    `db:"status"        json:"status"`
	OwnerUserID int64     `db:"owner_user_id" json:"owner_user_id"`
	CreatedAt   time.Time `db:"created_at"    json:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"    json:"updated_at"`
}

const (
	MerchantStatusPending  = "pending"
	MerchantStatusActive   = "active"
	MerchantStatusRejected = "rejected"
	MerchantStatusDisabled = "disabled"
)

const DefaultMerchantID int64 = 1
