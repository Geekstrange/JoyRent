package handler

import (
	"github.com/gin-gonic/gin"

	"rental-platform/internal/service"
	"rental-platform/pkg/response"
)

type UserHandler struct {
	svc *service.UserService
}

func NewUserHandler(svc *service.UserService) *UserHandler {
	return &UserHandler{svc: svc}
}

// ListAdmin GET /api/v1/admin/users
func (h *UserHandler) ListAdmin(c *gin.Context) {
	list, err := h.svc.List(c.Request.Context(), queryString(c, "keyword"))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, list)
}

// ToggleStatus POST /api/v1/admin/users/:id/toggle-status
func (h *UserHandler) ToggleStatus(c *gin.Context) {
	if err := h.svc.ToggleStatus(c.Request.Context(), pathInt64(c, "id")); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"ok": true})
}
