// File Name: logger.go
// Created Time: 2026-09-22 19:09:43
// Update Time: 2026-09-22 19:09:43


package middleware

import (
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

// Logger 打印访问日志，含耗时、状态码、路径
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		cost := time.Since(start)
		log.Printf("[http] %d %s %s %s %v",
			c.Writer.Status(),
			c.Request.Method,
			path,
			query,
			cost,
		)
	}
}
