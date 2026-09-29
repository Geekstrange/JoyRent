package handler

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"rental-platform/internal/middleware"
	"rental-platform/internal/model"
	"rental-platform/pkg/errs"
	"rental-platform/pkg/response"
)

// detailOf 去掉哨兵错误的前缀，只保留给用户看的中文说明。
// 约定：service 层用 fmt.Errorf("%w: 说明", errs.ErrXxx) 包装，
// err.Error() 形如 "invalid argument: 分类名不能为空"，
// 这里裁掉 "invalid argument: " 前缀，避免把它直接暴露到前端提示里。
func detailOf(err error) string {
	msg := err.Error()
	if i := strings.Index(msg, ": "); i >= 0 {
		if head := msg[:i]; head == errs.ErrInvalidArgument.Error() ||
			head == errs.ErrInvalidPeriod.Error() ||
			head == errs.ErrConflict.Error() ||
			head == errs.ErrInvalidState.Error() ||
			head == errs.ErrAlreadyExists.Error() {
			return msg[i+2:]
		}
	}
	return msg
}

// fail 把 service 返回的错误映射成 HTTP 响应
func fail(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errs.ErrNotFound):
		response.NotFound(c, "资源不存在")
	case errors.Is(err, errs.ErrForbidden):
		response.Forbidden(c, "无权限")
	case errors.Is(err, errs.ErrUnauthorized):
		response.Unauthorized(c, "未认证")
	case errors.Is(err, errs.ErrConflict):
		response.Conflict(c, detailOf(err))
	case errors.Is(err, errs.ErrInvalidState):
		response.Conflict(c, "状态不允许此操作："+detailOf(err))
	case errors.Is(err, errs.ErrNoAvailableUnit):
		response.Conflict(c, "该租期已租完")
	case errors.Is(err, errs.ErrDuplicateInvoice):
		response.Conflict(c, "该订单已申请过发票")
	case errors.Is(err, errs.ErrInvalidArgument):
		response.BadRequest(c, detailOf(err))
	case errors.Is(err, errs.ErrInvalidPeriod):
		response.BadRequest(c, "租期无效")
	default:
		response.Internal(c, err.Error())
	}
}

// pathInt64 取路径参数并转 int64
func pathInt64(c *gin.Context, name string) int64 {
	v, _ := strconv.ParseInt(c.Param(name), 10, 64)
	return v
}

// queryInt64 取 query 参数，缺省返回 def
func queryInt64(c *gin.Context, name string, def int64) int64 {
	s := c.Query(name)
	if s == "" {
		return def
	}
	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return def
	}
	return v
}

// merchantIDOf 从 JWT 取 merchantID，未认证返回 0
func merchantIDOf(c *gin.Context) int64 {
	return middleware.MerchantIDOf(c)
}

// merchantOrDefault 未认证或 merchantID=0 时回退到平台自营
// 用于用户端免登录接口，也用于用户端已登录接口
func merchantOrDefault(c *gin.Context) int64 {
	if id := middleware.MerchantIDOf(c); id > 0 {
		return id
	}
	return model.DefaultMerchantID
}

// userIDOf 从 JWT 取用户 ID
func userIDOf(c *gin.Context) int64 {
	return middleware.SubjectID(c)
}
