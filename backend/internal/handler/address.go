// File Name: address.go
// Created Time: 2026-09-25 09:00:00
// Update Time: 2026-09-25 09:00:00

package handler

import (
	"errors"

	"github.com/gin-gonic/gin"

	"rental-platform/internal/service"
	"rental-platform/pkg/errs"
	"rental-platform/pkg/response"
)

type AddressHandler struct {
	svc *service.AddressService
}

func NewAddressHandler(svc *service.AddressService) *AddressHandler {
	return &AddressHandler{svc: svc}
}

type addressReq struct {
	Receiver   string `json:"receiver"`
	Phone      string `json:"phone"`
	Province   string `json:"province"`
	City       string `json:"city"`
	District   string `json:"district"`
	Detail     string `json:"detail"`
	SetDefault bool   `json:"set_default"`
}

// List GET /api/v1/app/addresses
func (h *AddressHandler) List(c *gin.Context) {
	list, err := h.svc.List(c.Request.Context(), userIDOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, list)
}

// Get GET /api/v1/app/addresses/:id
func (h *AddressHandler) Get(c *gin.Context) {
	a, err := h.svc.Get(c.Request.Context(), userIDOf(c), pathInt64(c, "id"))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, a)
}

// Default GET /api/v1/app/addresses/default
//
// 「还没设置默认地址」返回 **200 + data=null**，不返回 404 ——
// 这是「查询成功但没有数据」的正常业务状态；
// 用 404 表达会让小程序开发者工具打一屏红色错误 + 调用栈，把正常状态伪装成接口故障。
// （这套约定是全项目通用的，见 README 的接口约定。）
func (h *AddressHandler) Default(c *gin.Context) {
	a, err := h.svc.GetDefault(c.Request.Context(), userIDOf(c))
	if err != nil {
		if errors.Is(err, errs.ErrNotFound) {
			response.OK(c, nil)
			return
		}
		fail(c, err)
		return
	}
	response.OK(c, a)
}

// Create POST /api/v1/app/addresses
func (h *AddressHandler) Create(c *gin.Context) {
	var req addressReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	a, err := h.svc.Create(c.Request.Context(), service.AddressInput{
		UserID:     userIDOf(c),
		Receiver:   req.Receiver,
		Phone:      req.Phone,
		Province:   req.Province,
		City:       req.City,
		District:   req.District,
		Detail:     req.Detail,
		SetDefault: req.SetDefault,
	})
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, a)
}

// Update PUT /api/v1/app/addresses/:id
func (h *AddressHandler) Update(c *gin.Context) {
	var req addressReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	a, err := h.svc.Update(c.Request.Context(), pathInt64(c, "id"), service.AddressInput{
		UserID:     userIDOf(c),
		Receiver:   req.Receiver,
		Phone:      req.Phone,
		Province:   req.Province,
		City:       req.City,
		District:   req.District,
		Detail:     req.Detail,
		SetDefault: req.SetDefault,
	})
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, a)
}

// SetDefault POST /api/v1/app/addresses/:id/default
func (h *AddressHandler) SetDefault(c *gin.Context) {
	if err := h.svc.SetDefault(c.Request.Context(), userIDOf(c), pathInt64(c, "id")); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"ok": true})
}

// Delete DELETE /api/v1/app/addresses/:id
func (h *AddressHandler) Delete(c *gin.Context) {
	if err := h.svc.Delete(c.Request.Context(), userIDOf(c), pathInt64(c, "id")); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"ok": true})
}
