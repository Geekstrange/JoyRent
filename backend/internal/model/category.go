// File Name: category.go
// Created Time: 2026-09-22 18:52:01
// Update Time: 2026-09-22 18:52:01


package model

import "time"

type Category struct {
	ID         int64     `db:"id"          json:"id"`
	MerchantID int64     `db:"merchant_id" json:"merchant_id"`
	ParentID   int64     `db:"parent_id"   json:"parent_id"`
	Name       string    `db:"name"        json:"name"`
	Sort       int       `db:"sort"        json:"sort"`
	CreatedAt  time.Time `db:"created_at"  json:"created_at"`
	UpdatedAt  time.Time `db:"updated_at"  json:"updated_at"`
}
