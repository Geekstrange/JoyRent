// File Name: unit_occupation.go
// Created Time: 2026-09-22 18:52:39
// Update Time: 2026-09-22 18:52:39


package model

import "time"

// UnitOccupation 设备单元租期占用记录
// 排他约束定义在 migration 里，应用层不做重叠检查
type UnitOccupation struct {
	ID        int64     `db:"id"         json:"id"`
	UnitID    int64     `db:"unit_id"    json:"unit_id"`
	OrderID   int64     `db:"order_id"   json:"order_id"`
	StartAt   time.Time `db:"start_at"   json:"start_at"`
	EndAt     time.Time `db:"end_at"     json:"end_at"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}
