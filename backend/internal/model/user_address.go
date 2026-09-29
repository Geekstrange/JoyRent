// File Name: user_address.go
// Created Time: 2026-09-25 09:00:00
// Update Time: 2026-09-25 09:00:00

package model

import (
	"strings"
	"time"
)

// UserAddress 用户收货地址。
//
// 省市区与详细地址分开存（province/city/district/detail），
// 区划要用于运费与可达范围判断，合并成一个 TEXT 就再也拆不出来。
type UserAddress struct {
	ID          int64     `db:"id"            json:"id"`
	OwnerUserID int64     `db:"owner_user_id" json:"owner_user_id"`
	Receiver    string    `db:"receiver"      json:"receiver"`
	Phone       string    `db:"phone"         json:"phone"`
	Province    string    `db:"province"      json:"province"`
	City        string    `db:"city"          json:"city"`
	District    string    `db:"district"      json:"district"`
	Detail      string    `db:"detail"        json:"detail"`
	IsDefault   bool      `db:"is_default"    json:"is_default"`
	CreatedAt   time.Time `db:"created_at"    json:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"    json:"updated_at"`
}

// FullAddress 拼出完整地址，便于订单/物流做快照时直接用。
// 直辖市（province == city）去重，避免出现「北京市 北京市 朝阳区」。
func (a *UserAddress) FullAddress() string {
	parts := make([]string, 0, 4)
	parts = append(parts, a.Province)
	if a.City != "" && a.City != a.Province {
		parts = append(parts, a.City)
	}
	if a.District != "" {
		parts = append(parts, a.District)
	}
	if a.Detail != "" {
		parts = append(parts, a.Detail)
	}
	nonEmpty := parts[:0]
	for _, p := range parts {
		if p != "" {
			nonEmpty = append(nonEmpty, p)
		}
	}
	return strings.Join(nonEmpty, " ")
}
