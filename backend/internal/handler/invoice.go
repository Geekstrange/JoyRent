package handler

import (
	"github.com/gin-gonic/gin"

	"rental-platform/internal/model"
	"rental-platform/internal/service"
	"rental-platform/pkg/response"
)

type InvoiceHandler struct {
	svc *service.InvoiceService
}

func NewInvoiceHandler(svc *service.InvoiceService) *InvoiceHandler {
	return &InvoiceHandler{svc: svc}
}

// ListAdmin GET /api/v1/admin/invoices
func (h *InvoiceHandler) ListAdmin(c *gin.Context) {
	list, err := h.svc.List(c.Request.Context(), merchantOrDefault(c), queryString(c, "status"))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, list)
}

// GetAdmin GET /api/v1/admin/invoices/:id
func (h *InvoiceHandler) GetAdmin(c *gin.Context) {
	v, err := h.svc.Get(c.Request.Context(), merchantOrDefault(c), pathInt64(c, "id"))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, v)
}

type applyInvoiceReq struct {
	OrderID int64  `json:"order_id" binding:"required"`
	Type    string `json:"type"     binding:"required"`
	Title   string `json:"title"    binding:"required"`
	TaxNo   string `json:"tax_no"`
	Email   string `json:"email"    binding:"required"`
}

// Apply POST /api/v1/app/invoices
func (h *InvoiceHandler) Apply(c *gin.Context) {
	var req applyInvoiceReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	v, err := h.svc.Apply(c.Request.Context(), service.ApplyInvoiceInput{
		MerchantID: merchantOrDefault(c),
		OrderID:    req.OrderID,
		UserID:     userIDOf(c),
		Type:       req.Type,
		Title:      req.Title,
		TaxNo:      req.TaxNo,
		Email:      req.Email,
	})
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, v)
}

// ListMine GET /api/v1/app/invoices
func (h *InvoiceHandler) ListMine(c *gin.Context) {
	list, err := h.svc.List(c.Request.Context(), merchantOrDefault(c), queryString(c, "status"))
	if err != nil {
		fail(c, err)
		return
	}
	uid := userIDOf(c)
	out := make([]model.Invoice, 0, len(list))
	for _, v := range list {
		if v.UserID == uid {
			out = append(out, v)
		}
	}
	response.OK(c, out)
}

// GetMine GET /api/v1/app/invoices/:id
func (h *InvoiceHandler) GetMine(c *gin.Context) {
	v, err := h.svc.Get(c.Request.Context(), merchantOrDefault(c), pathInt64(c, "id"))
	if err != nil {
		fail(c, err)
		return
	}
	if v.UserID != userIDOf(c) {
		response.Forbidden(c, "无权访问")
		return
	}
	response.OK(c, v)
}

type issueReq struct {
	InvoiceNo string `json:"invoice_no" binding:"required"`
}

// Issue POST /api/v1/admin/invoices/:id/issue
func (h *InvoiceHandler) Issue(c *gin.Context) {
	var req issueReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "缺少发票号码")
		return
	}
	if err := h.svc.Issue(c.Request.Context(), merchantOrDefault(c), pathInt64(c, "id"), req.InvoiceNo); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"ok": true})
}

type rejectReq struct {
	Reason string `json:"reason" binding:"required"`
}

// Reject POST /api/v1/admin/invoices/:id/reject
func (h *InvoiceHandler) Reject(c *gin.Context) {
	var req rejectReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "缺少拒绝原因")
		return
	}
	if err := h.svc.Reject(c.Request.Context(), merchantOrDefault(c), pathInt64(c, "id"), req.Reason); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"ok": true})
}

// Stats GET /api/v1/admin/invoices/stats
func (h *InvoiceHandler) Stats(c *gin.Context) {
	sum, err := h.svc.SumIssued(c.Request.Context(), merchantOrDefault(c))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"issued_cents": sum})
}
