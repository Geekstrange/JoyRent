package handler

import (
	"time"

	"github.com/gin-gonic/gin"

	"rental-platform/internal/repository"
	"rental-platform/internal/service"
	"rental-platform/pkg/response"
)

type OrderHandler struct {
	svc *service.OrderService
}

func NewOrderHandler(svc *service.OrderService) *OrderHandler {
	return &OrderHandler{svc: svc}
}

type createOrderReq struct {
	EquipmentID int64  `json:"equipment_id" binding:"required"`
	StartAt     string `json:"start_at"     binding:"required"`
	EndAt       string `json:"end_at"       binding:"required"`
	// 收货地址 id。没有收货地址无法发货，因此是必填。
	// 这里**不加** binding:"required"：int64 的 0 会被 required 判为「未提供」，
	// 于是统一返回笼统的「参数错误」，而服务层能给出一句明确得多的
	// 「请先选择收货地址」。校验交给 service，提示质量更好。
	AddressID int64 `json:"address_id"`
}

// Create POST /api/v1/app/orders
func (h *OrderHandler) Create(c *gin.Context) {
	var req createOrderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	start, err1 := time.Parse("2006-01-02", req.StartAt)
	end, err2 := time.Parse("2006-01-02", req.EndAt)
	if err1 != nil || err2 != nil {
		response.BadRequest(c, "日期格式应为 YYYY-MM-DD")
		return
	}
	o, err := h.svc.Create(c.Request.Context(), service.CreateOrderInput{
		MerchantID:  merchantOrDefault(c),
		UserID:      userIDOf(c),
		EquipmentID: req.EquipmentID,
		StartAt:     start,
		EndAt:       end,
		AddressID:   req.AddressID,
	})
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, o)
}

// ListMine GET /api/v1/app/orders
func (h *OrderHandler) ListMine(c *gin.Context) {
	list, err := h.svc.List(c.Request.Context(), merchantOrDefault(c), repository.OrderFilter{
		UserID: userIDOf(c),
		Status: queryString(c, "status"),
	})
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, list)
}

// GetMine GET /api/v1/app/orders/:id
func (h *OrderHandler) GetMine(c *gin.Context) {
	o, err := h.svc.Get(c.Request.Context(), merchantOrDefault(c), pathInt64(c, "id"))
	if err != nil {
		fail(c, err)
		return
	}
	if o.UserID != userIDOf(c) {
		response.Forbidden(c, "无权访问该订单")
		return
	}
	response.OK(c, o)
}

// ListAdmin GET /api/v1/admin/orders
func (h *OrderHandler) ListAdmin(c *gin.Context) {
	list, err := h.svc.List(c.Request.Context(), merchantOrDefault(c), repository.OrderFilter{
		Status:  queryString(c, "status"),
		Keyword: queryString(c, "keyword"),
	})
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, list)
}

// GetAdmin GET /api/v1/admin/orders/:id
func (h *OrderHandler) GetAdmin(c *gin.Context) {
	o, err := h.svc.Get(c.Request.Context(), merchantOrDefault(c), pathInt64(c, "id"))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, o)
}

type transitionReq struct {
	Next string `json:"next" binding:"required"`
}

// Transition POST /api/v1/admin/orders/:id/transition
func (h *OrderHandler) Transition(c *gin.Context) {
	var req transitionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "缺少 next")
		return
	}
	o, err := h.svc.Transition(c.Request.Context(), merchantOrDefault(c), pathInt64(c, "id"), req.Next)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, o)
}

// RefundDeposit POST /api/v1/admin/orders/:id/refund-deposit
func (h *OrderHandler) RefundDeposit(c *gin.Context) {
	if err := h.svc.RefundDeposit(c.Request.Context(), merchantOrDefault(c), pathInt64(c, "id")); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"ok": true})
}
