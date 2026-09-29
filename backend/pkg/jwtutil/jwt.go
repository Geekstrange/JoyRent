// File Name: jwt.go
// Created Time: 2026-09-22 18:51:47
// Update Time: 2026-09-23 00:00:00

package jwtutil

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	RoleAdmin = "admin"
	RoleUser  = "user"

	Issuer = "rental-platform"
)

type Claims struct {
	Subject    string `json:"sub"`            // admin_id 或 user_id
	Role       string `json:"role"`           // admin / user
	Platform   string `json:"plat,omitempty"` // 用户端才有：wechat / alipay
	MerchantID int64  `json:"mid,omitempty"`  // 管理端才有；用户端为 0
	jwt.RegisteredClaims
}

type Manager struct {
	secret []byte
	expire time.Duration
}

func NewManager(secret string, expire time.Duration) *Manager {
	return &Manager{secret: []byte(secret), expire: expire}
}

// Issue 签发 token。
// - 用户端：subject=用户ID，role=user，platform=wechat/alipay，merchantID=0
// - 管理端：subject=管理员ID，role=admin，platform=""，merchantID=所属商家ID
func (m *Manager) Issue(subject, role, platform string, merchantID int64) (string, error) {
	now := time.Now()
	claims := Claims{
		Subject:    subject,
		Role:       role,
		Platform:   platform,
		MerchantID: merchantID,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.expire)),
			Issuer:    Issuer,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

func (m *Manager) Parse(raw string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}
