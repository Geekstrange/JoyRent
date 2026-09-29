// File Name: mock.go
// Created Time: 2026-09-22 19:24:22
// Update Time: 2026-09-22 19:24:22


package payment

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"rental-platform/internal/model"
)

// MockProvider 本地开发用假支付渠道
// Create 返回一个假的 prepay_id；ParseCallback 直接返回成功。
// 生产环境请勿注册。
type MockProvider struct {
	Channel_ string
}

func NewMockProvider(channel string) *MockProvider {
	return &MockProvider{Channel_: channel}
}

func (p *MockProvider) Channel() string { return p.Channel_ }

func (p *MockProvider) Create(_ context.Context, cc CreateContext) (*CreateResult, error) {
	order := cc.Order
	if order == nil {
		return nil, fmt.Errorf("mock: order is nil")
	}
	return &CreateResult{
		Params: map[string]any{
			// ⚠️ `mock:true` 是**关键标记**：前端 `pay()` 必须识别它并跳过
			// 真实的 `wx.requestPayment` —— 因为下面这些字段是伪造的，
			// 真实支付所需的 timeStamp/nonceStr/package/paySign 一个都没有，
			// 拿去调起真机支付必然失败。
			"mock":      true,
			"prepay_id": fmt.Sprintf("mock_%d_%d", order.ID, time.Now().Unix()),
			"order_id":  order.ID,
			"order_no":  order.No,
			"total_fee": TotalCents(order),
			"channel":   p.Channel_,
		},
	}, nil
}

func (p *MockProvider) ParseCallback(_ context.Context, _ map[string]string, body []byte) (*CallbackResult, error) {
	var in struct {
		OrderID       int64  `json:"order_id"`
		TransactionID string `json:"transaction_id"`
		AmountCents   int64  `json:"amount_cents"`
	}
	if err := json.Unmarshal(body, &in); err != nil {
		return nil, fmt.Errorf("mock parse: %w", err)
	}
	return &CallbackResult{
		Channel:       p.Channel_,
		OrderID:       in.OrderID,
		TransactionID: in.TransactionID,
		AmountCents:   in.AmountCents,
		Success:       true,
		Raw:           body,
	}, nil
}

func (p *MockProvider) Refund(
	_ context.Context, _ *model.Order, _ string, _ int64, _ string,
) error {
	return nil
}
