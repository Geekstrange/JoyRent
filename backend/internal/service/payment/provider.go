// File Name: provider.go
// Created Time: 2026-09-22 19:23:55
// Update Time: 2026-09-28 08:00:00


package payment

import (
	"context"
	"encoding/json"

	"rental-platform/internal/model"
)

// CreateResult 下单返回给前端的支付参数
// 微信：微信小程序直接透传给 wx.requestPayment
// 支付宝：透传给 my.tradePay
type CreateResult struct {
	Params map[string]any `json:"params"`
}

// CreateContext 发起支付的入参。
//
// ⚠️ 为什么不能只传 `*model.Order`：
// 微信 JSAPI（小程序）支付在下单时**必须**带上付款人的 openid
// （`PrepayRequest.Payer.Openid`），否则微信直接报
// `PARAM_ERROR: 缺少必填参数 payer.openid`。
// 而 `order` 表里只有 `user_id`（我们自己的自增 ID），**没有 openid** ——
// openid 存在 `app_user.open_id`，需要 service 层查出后一并传进来。
//
// 支付宝侧对应的是 `buyer_id`，同样是「渠道侧的用户标识」，
// 所以这里用中性的 `Payer` 命名，两端共用。
type CreateContext struct {
	// Order 待支付的订单（含 No / 金额 / 商品信息）
	Order *model.Order
	// Payer 渠道侧的用户标识：微信 = openid，支付宝 = user_id。
	// 允许为空（Mock 渠道不需要），但真实渠道缺失时应报错。
	Payer string
}

// CallbackResult 渠道回调解析后的结果
type CallbackResult struct {
	Channel string

	// OrderID 本平台订单 ID（自增主键）。
	// ⚠️ 渠道回调里**不会**带这个值，provider 通常只能解析出 OrderNo，
	// 需要由 service 层反查后回填；Mock/测试场景可直接给出。
	OrderID int64

	// OrderNo 本平台订单号（`order.no`，形如 R20260928...）。
	// 渠道回调携带的就是这个（微信 `out_trade_no` / 支付宝 `out_trade_no`）。
	// service 层优先用它反查 OrderID。
	OrderNo string

	// TransactionID 渠道侧交易号（微信 `transaction_id` / 支付宝 `trade_no`）
	TransactionID string
	AmountCents   int64
	Success       bool
	Raw           json.RawMessage
}

// Provider 支付渠道抽象
type Provider interface {
	// Channel 返回渠道标识，与 model.PayChannelXxx 一致
	Channel() string

	// Create 创建支付订单，返回前端调起支付所需参数
	Create(ctx context.Context, cc CreateContext) (*CreateResult, error)

	// ParseCallback 解析并验签回调，成功时返回 CallbackResult
	ParseCallback(ctx context.Context, headers map[string]string, body []byte) (*CallbackResult, error)

	// Refund 发起退款（押金退还）
	//
	// transactionID 是**渠道侧交易号**（微信 transaction_id / 支付宝 trade_no）。
	// 微信 v3 退款接口要求传 `transaction_id` 或 `out_trade_no` 二选一，
	// 且金额需同时给出「退款额」与「原订单总额」——
	// 后者这里用 `order.RentCents + order.DepositCents` 推算（与下单时一致）。
	Refund(ctx context.Context, order *model.Order, transactionID string, amountCents int64, reason string) error
}

// Registry 渠道注册表
type Registry struct {
	providers map[string]Provider
}

func NewRegistry() *Registry {
	return &Registry{providers: map[string]Provider{}}
}

func (r *Registry) Register(p Provider) {
	r.providers[p.Channel()] = p
}

func (r *Registry) Get(channel string) (Provider, bool) {
	p, ok := r.providers[channel]
	return p, ok
}

// TotalCents 订单应付总额（租金 + 押金）。
// 下单与退款都要用，抽出来避免两处算法漂移。
func TotalCents(o *model.Order) int64 {
	return o.RentCents + o.DepositCents
}
