// File Name: jobs.go
// Created Time: 2026-09-22 19:27:31
// Update Time: 2026-09-22 19:27:31


package job

import (
	"context"
	"log"
	"time"

	"rental-platform/internal/service"
)

// Jobs 汇总所有后台定时任务
type Jobs struct {
	orderSvc *service.OrderService
}

func NewJobs(orderSvc *service.OrderService) *Jobs {
	return &Jobs{orderSvc: orderSvc}
}

// CancelExpiredPending 取消超时未支付订单，默认 30 分钟
func (j *Jobs) CancelExpiredPending() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	before := time.Now().Add(-30 * time.Minute)
	n, err := j.orderSvc.CancelExpiredPending(ctx, before)
	if err != nil {
		log.Printf("[job] cancel expired pending: %v", err)
		return
	}
	if n > 0 {
		log.Printf("[job] cancelled %d expired pending orders", n)
	}
}
