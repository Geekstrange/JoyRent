// File Name: equipment.go
// Created Time: 2026-09-22 18:52:14
// Update Time: 2026-09-22 18:52:14


package model

import "time"

type Equipment struct {
	ID           int64     `db:"id"            json:"id"`
	MerchantID   int64     `db:"merchant_id"   json:"merchant_id"`
	CategoryID   int64     `db:"category_id"   json:"category_id"`
	Name         string    `db:"name"          json:"name"`
	Spec         string    `db:"spec"          json:"spec"`
	Description  string    `db:"description"   json:"description"`
	CoverPath    string    `db:"cover_path"    json:"cover_path"`
	DailyCents   int64     `db:"daily_cents"   json:"daily_cents"`
	DepositCents int64     `db:"deposit_cents" json:"deposit_cents"`
	Total        int       `db:"total"         json:"total"`
	CreatedAt    time.Time `db:"created_at"    json:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"    json:"updated_at"`
}

type EquipmentUnit struct {
	ID          int64     `db:"id"           json:"id"`
	MerchantID  int64     `db:"merchant_id"  json:"merchant_id"`
	EquipmentID int64     `db:"equipment_id" json:"equipment_id"`
	SN          string    `db:"sn"           json:"sn"`
	Status      string    `db:"status"       json:"status"`
	CreatedAt   time.Time `db:"created_at"   json:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"   json:"updated_at"`
}

const (
	UnitStatusIdle        = "idle"
	UnitStatusRented      = "rented"
	UnitStatusMaintenance = "maintenance"
	UnitStatusRetired     = "retired"
)
