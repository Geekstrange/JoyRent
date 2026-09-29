// File Name: auth.go
// Created Time: 2026-09-22 19:09:26
// Update Time: 2026-09-22 19:09:26


package middleware

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"rental-platform/pkg/jwtutil"
	"rental-platform/pkg/response"
)

const claimsKey = "auth_claims"

// Auth 校验 JWT，把 Claims 放进 context
func Auth(mgr *jwtutil.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			response.Unauthorized(c, "缺少或格式错误的 Authorization 头")
			return
		}
		raw := strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
		claims, err := mgr.Parse(raw)
		if err != nil {
			response.Unauthorized(c, "token 无效或已过期")
			return
		}
		c.Set(claimsKey, claims)
		c.Next()
	}
}

// RequireAdmin 仅允许 role=admin
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		cl := ClaimsOf(c)
		if cl == nil || cl.Role != jwtutil.RoleAdmin {
			response.Forbidden(c, "需要管理员权限")
			return
		}
		c.Next()
	}
}

// RequireUser 仅允许 role=user
func RequireUser() gin.HandlerFunc {
	return func(c *gin.Context) {
		cl := ClaimsOf(c)
		if cl == nil || cl.Role != jwtutil.RoleUser {
			response.Forbidden(c, "需要用户身份")
			return
		}
		c.Next()
	}
}

// ClaimsOf 从 context 取 claims
func ClaimsOf(c *gin.Context) *jwtutil.Claims {
	v, ok := c.Get(claimsKey)
	if !ok {
		return nil
	}
	cl, _ := v.(*jwtutil.Claims)
	return cl
}

// MerchantIDOf 取商家 ID，未认证返回 0
func MerchantIDOf(c *gin.Context) int64 {
	cl := ClaimsOf(c)
	if cl == nil || cl.MerchantID <= 0 {
		return 0
	}
	return cl.MerchantID
}

// SubjectID 把 Claims.Subject 转成 int64
func SubjectID(c *gin.Context) int64 {
	cl := ClaimsOf(c)
	if cl == nil || cl.Subject == "" {
		return 0
	}
	id, _ := strconv.ParseInt(cl.Subject, 10, 64)
	return id
}

// Platform 取用户端平台，管理端为空
func Platform(c *gin.Context) string {
	cl := ClaimsOf(c)
	if cl == nil {
		return ""
	}
	return cl.Platform
}
