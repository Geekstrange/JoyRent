// File Name: user.go
// Created Time: 2026-09-22 18:52:50
// Update Time: 2026-09-22 18:52:50


package model

import "time"

const (
	PlatformWechat = "wechat"
	PlatformAlipay = "alipay"
)

type AppUser struct {
	ID         int64     `db:"id"          json:"id"`
	Platform   string    `db:"platform"    json:"platform"`
	OpenID     string    `db:"open_id"     json:"open_id"`
	UnionID    string    `db:"union_id"    json:"union_id"`
	Nickname   string    `db:"nickname"    json:"nickname"`
	AvatarPath string    `db:"avatar_path" json:"avatar_path"`
	Phone      string    `db:"phone"       json:"phone"`
	Status     string    `db:"status"      json:"status"`
	// CreditScore 信用分（芝麻分）。
	// ⚠️ 0 表示**未授权 / 未获取到** —— 押金计算据此走「全额」保守分支，
	// 绝不能把 0 当成「信用极差」或「信用极好」来特殊处理。
	CreditScore int `db:"credit_score" json:"credit_score"`
	// CreditAuthorizedAt 最近一次信用授权时间（用于判断是否过期，见 service.CreditValidDays）
	CreditAuthorizedAt *time.Time `db:"credit_authorized_at" json:"credit_authorized_at,omitempty"`
	CreatedAt          time.Time  `db:"created_at"           json:"created_at"`
	UpdatedAt          time.Time  `db:"updated_at"           json:"updated_at"`
}

type AdminUser struct {
	ID           int64     `db:"id"            json:"id"`
	Username     string    `db:"username"      json:"username"`
	PasswordHash string    `db:"password_hash" json:"-"`
	MerchantID   int64     `db:"merchant_id"   json:"merchant_id"`
	Role         string    `db:"role"          json:"role"`
	Status       string    `db:"status"        json:"status"`
	CreatedAt    time.Time `db:"created_at"    json:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"    json:"updated_at"`
}
