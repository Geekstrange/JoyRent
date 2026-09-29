// File Name: shipment.go
// Created Time: 2026-09-22 19:18:28
// Update Time: 2026-09-22 19:18:28


package handler

import (
	"github.com/gin-gonic/gin"

	"rental-platform/internal/service"
	"rental-platform/pkg/response"
)

type ShipmentHandler struct {
	svc *service.ShipmentService
}

func NewShipmentHandler(svc *service.ShipmentService) *ShipmentHandler {
	return &ShipmentHandler{svc: svc}
}

// GetByOrder GET /api/v1/admin/orders/:id/shipment 与 /api/v1/app/orders/:id/shipment
func (h *ShipmentHandler) GetByOrder(c *gin.Context) {
	d, err := h.svc.GetByOrder(c.Request.Context(), pathInt64(c, "id"))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, d)
}

type upsertShipmentReq struct {
	Express  string `json:"express" binding:"required"`
	No       string `json:"no"      binding:"required"`
	Receiver string `json:"receiver"`
	Phone    string `json:"phone"`
	Address  string `json:"address"`
}

// Upsert POST /api/v1/admin/orders/:id/shipment
func (h *ShipmentHandler) Upsert(c *gin.Context) {
	var req upsertShipmentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	sp, err := h.svc.Upsert(c.Request.Context(), service.UpsertShipmentInput{
		MerchantID: merchantOrDefault(c),
		OrderID:    pathInt64(c, "id"),
		Express:    req.Express,
		No:         req.No,
		Receiver:   req.Receiver,
		Phone:      req.Phone,
		Address:    req.Address,
	})
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, sp)
}

type setShipStatusReq struct {
	Status string `json:"status" binding:"required"`
	Text   string `json:"text"`
}

// SetStatus POST /api/v1/admin/orders/:id/shipment/status
func (h *ShipmentHandler) SetStatus(c *gin.Context) {
	var req setShipStatusReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "缺少 status")
		return
	}
	if err := h.svc.SetStatus(c.Request.Context(), merchantOrDefault(c), pathInt64(c, "id"), req.Status, req.Text); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"ok": true})
}

// Refresh POST /api/v1/admin/orders/:id/shipment/refresh
//
// 从第三方拉取最新轨迹并落库。未启用自动查询时 `RefreshTraces` 会返回
// **明确的错误**（而不是静默成功），管理员据此知道要去配 `[logistics]`。
func (h *ShipmentHandler) Refresh(c *gin.Context) {
	d, err := h.svc.RefreshTraces(
		c.Request.Context(), merchantOrDefault(c), pathInt64(c, "id"),
	)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, d)
}
