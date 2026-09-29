// File Name: credit.go
// Created Time: 2026-09-28 09:30:00
//
// 信用分接口：授权与查询。押金减免依据由此而来。
package handler

import (
	"github.com/gin-gonic/gin"

	"rental-platform/internal/service"
	"rental-platform/pkg/response"
)

type CreditHandler struct {
	svc *service.CreditService
}

func NewCreditHandler(svc *service.CreditService) *CreditHandler {
	return &CreditHandler{svc: svc}
}

type creditAuthorizeReq struct {
	// AuthCode 芝麻授权码。真实芝麻实现需要（前端从芝麻授权页拿到），
	// 本地模拟实现忽略它。
	AuthCode string `json:"auth_code"`
	// MockScore 指定信用分，**仅本地联调**用于测试各押金档位。
	// release 模式下 CreditScorer 会拒绝该参数（见 LocalCreditScorer.AllowMockScore）。
	MockScore int `json:"mock_score"`
}

// Status GET /api/v1/app/credit
//
// 查询当前信用与押金状态。**未授权也返回 200**，用 `authorized:false` 表达 ——
// 与 merchant/address 的「查询成功但没有数据用 200+null」同一套约定，
// 避免用 404/403 把正常状态伪装成故障。
func (h *CreditHandler) Status(c *gin.Context) {
	st, err := h.svc.Status(c.Request.Context(), userIDOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, st)
}

// Authorize POST /api/v1/app/credit/authorize
//
// 完成一次信用授权并返回最新状态。请求体可为空（本地模拟实现不需要参数）。
func (h *CreditHandler) Authorize(c *gin.Context) {
	var req creditAuthorizeReq
	// 允许空 body：本地模拟实现不需要任何参数，
	// 强行要求 body 会让「一键授权」多一步无意义的构造。
	_ = c.ShouldBindJSON(&req)

	st, err := h.svc.Authorize(c.Request.Context(), userIDOf(c), req.MockScore)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, st)
}
