// File Name: pay.go
// Created Time: 2026-09-22 19:19:47
// Update Time: 2026-09-22 19:19:47


package handler

import (
	"github.com/gin-gonic/gin"

	"rental-platform/internal/service"
	"rental-platform/pkg/response"
)

type PayHandler struct {
	svc *service.PaymentService
}

func NewPayHandler(svc *service.PaymentService) *PayHandler {
	return &PayHandler{svc: svc}
}

type createPayReq struct {
	Channel string `json:"channel" binding:"required"`
}

// Create POST /api/v1/app/orders/:id/pay
func (h *PayHandler) Create(c *gin.Context) {
	var req createPayReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "缺少 channel")
		return
	}
	res, err := h.svc.Create(
		c.Request.Context(),
		merchantOrDefault(c),
		pathInt64(c, "id"),
		userIDOf(c),
		req.Channel,
	)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, res)
}

// Callback POST /api/v1/pay/callback/:channel
// 不走 JWT，走渠道验签
func (h *PayHandler) Callback(c *gin.Context) {
	channel := c.Param("channel")
	headers := map[string]string{}
	for k, v := range c.Request.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}
	body, err := c.GetRawData()
	if err != nil {
		response.BadRequest(c, "读取请求体失败")
		return
	}
	if err := h.svc.HandleCallback(c.Request.Context(), channel, headers, body); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"code": "SUCCESS", "message": "成功"})
}
