// File Name: auth.go
// Created Time: 2026-09-22 19:19:15
// Update Time: 2026-09-22 19:19:15

package handler

import (
	"github.com/gin-gonic/gin"

	"rental-platform/internal/service"
	"rental-platform/pkg/response"
)

type AuthHandler struct {
	svc *service.AuthService
}

func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

type codeReq struct {
	Code string `json:"code" binding:"required"`
}

// devLoginReq 测试态登录旁路请求
type devLoginReq struct {
	Platform string `json:"platform"`
	Code     string `json:"code"`
}

type adminLoginReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type adminChangePasswordReq struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

// WechatLogin POST /api/v1/app/auth/wechat
func (h *AuthHandler) WechatLogin(c *gin.Context) {
	var req codeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "缺少 code")
		return
	}
	token, u, err := h.svc.LoginWechat(c.Request.Context(), req.Code)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"token": token, "user": u})
}

// AlipayLogin POST /api/v1/app/auth/alipay
func (h *AuthHandler) AlipayLogin(c *gin.Context) {
	var req codeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "缺少 code")
		return
	}
	token, u, err := h.svc.LoginAlipay(c.Request.Context(), req.Code)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"token": token, "user": u})
}

// AdminLogin POST /api/v1/admin/login
func (h *AuthHandler) AdminLogin(c *gin.Context) {
	var req adminLoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "用户名和密码必填")
		return
	}
	token, u, err := h.svc.LoginAdmin(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{
		"token": token,
		"admin": gin.H{
			"id":          u.ID,
			"username":    u.Username,
			"merchant_id": u.MerchantID,
			"role":        u.Role,
		},
	})
}

// Me GET /api/v1/app/me
func (h *AuthHandler) Me(c *gin.Context) {
	u, err := h.svc.Me(c.Request.Context(), userIDOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, u)
}

// DevLogin POST /api/v1/app/auth/dev-login
// 测试态登录旁路，仅在 allow_dev_login 且非 release 模式下注册。
func (h *AuthHandler) DevLogin(c *gin.Context) {
	var req devLoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "code 必填")
		return
	}
	if req.Platform == "" {
		req.Platform = "wechat"
	}
	token, u, err := h.svc.LoginDev(c.Request.Context(), req.Platform, req.Code)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"token": token, "user": u})
}

// AdminChangePassword POST /api/v1/admin/password
func (h *AuthHandler) AdminChangePassword(c *gin.Context) {
	var req adminChangePasswordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "原密码和新密码必填")
		return
	}
	err := h.svc.ChangeAdminPassword(
		c.Request.Context(), userIDOf(c), req.OldPassword, req.NewPassword,
	)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"changed": true})
}
