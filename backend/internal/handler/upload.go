// File Name: upload.go
// Created Time: 2026-09-22 19:19:12
// Update Time: 2026-09-22 19:19:12


package handler

import (
	"github.com/gin-gonic/gin"

	"rental-platform/internal/service"
	"rental-platform/pkg/response"
)

type UploadHandler struct {
	storage *service.Storage
}

func NewUploadHandler(storage *service.Storage) *UploadHandler {
	return &UploadHandler{storage: storage}
}

// Upload POST /api/v1/admin/upload
// 表单字段：file（必填）、scope（可选，默认 equipment）
func (h *UploadHandler) Upload(c *gin.Context) {
	scope := c.PostForm("scope")
	if scope == "" {
		scope = "equipment"
	}
	switch scope {
	case "equipment", "avatar":
	default:
		response.BadRequest(c, "scope 仅支持 equipment / avatar")
		return
	}

	fh, err := c.FormFile("file")
	if err != nil {
		response.BadRequest(c, "缺少 file 字段")
		return
	}

	path, err := h.storage.Save(scope, fh)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{
		"path": path,
		"url":  h.storage.BaseURL() + path,
	})
}
