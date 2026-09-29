// File Name: response.go
// Created Time: 2026-09-22 18:51:22
// Update Time: 2026-09-22 18:51:22


package response

import (
	"net/http"
	"reflect"

	"github.com/gin-gonic/gin"
)

// Body 统一响应结构
type Body struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

const (
	CodeOK           = 0
	CodeBadRequest   = 40000
	CodeUnauthorized = 40100
	CodeForbidden    = 40300
	CodeNotFound     = 40400
	CodeConflict     = 40900
	CodeInternal     = 50000
)

// normalizeNilSlice 把 nil slice/map 转成空 slice/map，避免 JSON 里出现 null。
//
// ⚠️ 为什么必须做（真实踩坑）：
// Go 的 nil slice 会被 encoding/json 序列化成 `null`，而不是 `[]`：
//
//	{"code":0,"message":"ok","data":null}
//
// 前端拿到 `data: null` 后若直接 `.map()` 会崩，做 `data || []` 兜底又会让
// 「空结果」和「字段缺失」在日志里长得一样（`typeof null === 'object'`），
// 排查时完全看不出区别。返回 `[]` 让契约稳定、前端和日志都能一眼分辨。
func normalizeNilSlice(data any) any {
	if data == nil {
		return data
	}
	v := reflect.ValueOf(data)
	switch v.Kind() {
	case reflect.Slice:
		if v.IsNil() {
			return []any{}
		}
	case reflect.Map:
		if v.IsNil() {
			return map[string]any{}
		}
	}
	return data
}

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Body{Code: CodeOK, Message: "ok", Data: normalizeNilSlice(data)})
}

func Fail(c *gin.Context, httpStatus, code int, msg string) {
	c.AbortWithStatusJSON(httpStatus, Body{Code: code, Message: msg})
}

func BadRequest(c *gin.Context, msg string) {
	Fail(c, http.StatusBadRequest, CodeBadRequest, msg)
}

func Unauthorized(c *gin.Context, msg string) {
	Fail(c, http.StatusUnauthorized, CodeUnauthorized, msg)
}

func Forbidden(c *gin.Context, msg string) {
	Fail(c, http.StatusForbidden, CodeForbidden, msg)
}

func NotFound(c *gin.Context, msg string) {
	Fail(c, http.StatusNotFound, CodeNotFound, msg)
}

func Conflict(c *gin.Context, msg string) {
	Fail(c, http.StatusConflict, CodeConflict, msg)
}

func Internal(c *gin.Context, msg string) {
	Fail(c, http.StatusInternalServerError, CodeInternal, msg)
}
