// File Name: recovery.go
// Created Time: 2026-09-22 19:09:55
// Update Time: 2026-09-22 19:09:55


package middleware

import (
	"log"
	"runtime/debug"

	"github.com/gin-gonic/gin"

	"rental-platform/pkg/response"
)

// Recovery 捕获 panic，记录堆栈，返回 500
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[panic] %v\n%s", r, debug.Stack())
				response.Internal(c, "服务内部错误")
			}
		}()
		c.Next()
	}
}
