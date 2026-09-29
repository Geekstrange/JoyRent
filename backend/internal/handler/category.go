package handler

import (
	"github.com/gin-gonic/gin"

	"rental-platform/internal/service"
	"rental-platform/pkg/response"
)

type CategoryHandler struct {
	svc *service.CategoryService
}

func NewCategoryHandler(svc *service.CategoryService) *CategoryHandler {
	return &CategoryHandler{svc: svc}
}

func (h *CategoryHandler) List(c *gin.Context) {
	list, err := h.svc.List(c.Request.Context(), merchantOrDefault(c))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, list)
}

type categoryReq struct {
	Name     string `json:"name"`
	ParentID int64  `json:"parent_id"`
	Sort     int    `json:"sort"`
}

func (h *CategoryHandler) Create(c *gin.Context) {
	var req categoryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	cat, err := h.svc.Create(c.Request.Context(), merchantOrDefault(c), service.CategoryInput{
		Name: req.Name, ParentID: req.ParentID, Sort: req.Sort,
	})
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, cat)
}

func (h *CategoryHandler) Update(c *gin.Context) {
	var req categoryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "参数错误")
		return
	}
	id := pathInt64(c, "id")
	if err := h.svc.Update(c.Request.Context(), merchantOrDefault(c), id, service.CategoryInput{
		Name: req.Name, ParentID: req.ParentID, Sort: req.Sort,
	}); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"id": id})
}

func (h *CategoryHandler) Delete(c *gin.Context) {
	id := pathInt64(c, "id")
	if err := h.svc.Delete(c.Request.Context(), merchantOrDefault(c), id); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"id": id})
}
