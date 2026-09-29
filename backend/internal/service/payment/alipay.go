// File Name: alipay.go
// Created Time: 2026-09-22 19:26:00
// Update Time: 2026-09-28 09:20:00


package payment

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/smartwalle/alipay/v3"

	"rental-platform/internal/config"
	"rental-platform/internal/model"
	"rental-platform/pkg/errs"
)

// alipayProductCodeJSAPI 小程序场景支付的销售产品码。
//
// 官方文档（alipay.trade.create）明确：「小程序场景支付 JSAPI_PAY」。
// 注意**不能**用 App 支付的 `QUICK_MSECURITY_PAY`，否则 my.tradePay 拉不起收银台。
const alipayProductCodeJSAPI = "JSAPI_PAY"

// 回调里表示「支付成功」的交易状态。
//
// TRADE_SUCCESS  —— 交易支付成功
// TRADE_FINISHED —— 交易结束（不可退款，通常出现在已过退款期的订单）
// 两者都应视为「钱已到账」。
const (
	alipayTradeSuccess  = "TRADE_SUCCESS"
	alipayTradeFinished = "TRADE_FINISHED"
)

// ── 配置校验辅助（供 router 判断「真实渠道 / Mock / 配置错误」三态）──────
//
// ⚠️ 与微信不同，支付宝**登录与支付共用同一套凭据**（app_id + 应用私钥），
// 没有「只有支付才需要」的字段组。所以判定就是这两项：
//   · 都有 → 可启用真实渠道（登录与支付一起生效）
//   · 都空 → 未配置，走 Mock
//   · 只填一个 → **配置错误**（此时登录也必然失败，早点报出来更好）
//
// 注意**不把 `alipay_public_key` 算作必填** —— 少了它下单仍可用，
// 只有回调验签会失败，属于「先联调下单」的合法中间状态。
var alipayRequiredFields = []struct {
	name  string
	value func(config.AlipayConfig) string
}{
	{"app_id", func(c config.AlipayConfig) string { return c.AppID }},
	{"private_key", func(c config.AlipayConfig) string { return c.PrivateKey }},
}

// AlipayMissing 返回启用支付宝所缺的配置项。
func AlipayMissing(cfg config.AlipayConfig) []string {
	var missing []string
	for _, f := range alipayRequiredFields {
		if strings.TrimSpace(f.value(cfg)) == "" {
			missing = append(missing, f.name)
		}
	}
	return missing
}

// AlipayConfigured 配置齐全，可以启用真实支付宝渠道。
func AlipayConfigured(cfg config.AlipayConfig) bool {
	return len(AlipayMissing(cfg)) == 0
}

// AlipayUntouched 两项全空 —— 即「没打算接支付宝」。
func AlipayUntouched(cfg config.AlipayConfig) bool {
	return len(AlipayMissing(cfg)) == len(alipayRequiredFields)
}

type AlipayProvider struct {
	cfg    config.AlipayConfig
	client *alipay.Client
}

// NewAlipayProvider 构造支付宝支付渠道。
//
// ⚠️ 与微信侧一样做**完整配置校验**并在缺失时报错 —— 由 router 决定是「报错」
// 还是「降级为 Mock」，provider 本身不做静默降级。
func NewAlipayProvider(cfg config.AlipayConfig) (*AlipayProvider, error) {
	var missing []string
	if strings.TrimSpace(cfg.AppID) == "" {
		missing = append(missing, "app_id")
	}
	if strings.TrimSpace(cfg.PrivateKey) == "" {
		missing = append(missing, "private_key")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("alipay config incomplete, missing: %v", missing)
	}

	// production = !Sandbox
	client, err := alipay.New(cfg.AppID, cfg.PrivateKey, !cfg.Sandbox)
	if err != nil {
		return nil, fmt.Errorf("init alipay client: %w", err)
	}

	// 支付宝公钥用于**回调验签**（DecodeNotification 内部会调 VerifySign）。
	// 未配置时不阻断构造，但回调一定失败 —— 所以只适合联调下单阶段。
	if strings.TrimSpace(cfg.AlipayPublicKey) != "" {
		if err := client.LoadAliPayPublicKey(cfg.AlipayPublicKey); err != nil {
			return nil, fmt.Errorf("load alipay public key: %w", err)
		}
	}

	return &AlipayProvider{cfg: cfg, client: client}, nil
}

func (p *AlipayProvider) Channel() string { return model.PayChannelAlipay }

// buildTradeCreate 把订单 + 买家标识转成支付宝下单参数。
//
// ⚠️ 抽成**纯函数**是为了能被单测断言住 —— 下面这几项错了本地完全无从发现、线上才炸：
//   · `TotalAmount` 必须是**元**（本项目内部用分，写成 213000 就是多收 1000 倍）
//   · `ProductCode` 必须是 JSAPI_PAY（写成 App 支付的码则 my.tradePay 拉不起收银台）
//   · `BuyerId` 必须是登录换来的 2088 用户号
//
// 另注：`TradeCreate` 内嵌的 `AuxParam.NeedVerify()` 恒为 true，
// 即支付宝对下单**响应也做验签**，因此无法用 HTTP mock 单测走通整条 Create ——
// 这也是把参数拼装独立出来测的原因。
func buildTradeCreate(cfg config.AlipayConfig, o *model.Order, payer string) alipay.TradeCreate {
	return alipay.TradeCreate{
		Trade: alipay.Trade{
			Subject:     "设备租赁订单 " + o.No,
			OutTradeNo:  o.No,
			TotalAmount: CentsToYuan(TotalCents(o)),
			ProductCode: alipayProductCodeJSAPI,
			NotifyURL:   cfg.NotifyURL,
		},
		// op_app_id：小程序支付中「商户实际经营主体的小程序 appid」。
		// 官方文档标注为必选，且商户需先在开放平台绑定该小程序，否则下单失败。
		OpAppId: cfg.AppID,
		BuyerId: payer,
	}
}

// Create 支付宝小程序下单（JSAPI 支付）。
//
// 流程：`alipay.trade.create` 拿到 `trade_no` → 前端 `my.tradePay({ tradeNO })` 拉起收银台。
// ⚠️ 前端必须传 **`trade_no`**（不是 `out_trade_no`），且参数名 `tradeNO` 全大写。
func (p *AlipayProvider) Create(ctx context.Context, cc CreateContext) (*CreateResult, error) {
	o := cc.Order
	if o == nil {
		return nil, fmt.Errorf("%w: 订单不能为空", errs.ErrInvalidArgument)
	}
	// 支付宝的 buyer_id 是 2088 开头的用户号，由登录时换来的 user_id 落库而来。
	// 新商户也可改用 buyer_open_id，但需要先在开放平台启用 openid 配置管理。
	if strings.TrimSpace(cc.Payer) == "" {
		return nil, fmt.Errorf(
			"%w: 缺少买家标识（buyer_id），无法发起支付宝支付（该用户可能未通过支付宝登录）",
			errs.ErrInvalidArgument,
		)
	}

	rsp, err := p.client.TradeCreate(ctx, buildTradeCreate(p.cfg, o, cc.Payer))
	if err != nil {
		return nil, fmt.Errorf("alipay trade.create: %w", err)
	}
	if rsp.IsFailure() {
		// 内嵌 Error 提供了 IsFailure()（Code != 10000/10003）
		return nil, fmt.Errorf("alipay trade.create 失败: code=%v sub_code=%s sub_msg=%s",
			rsp.Code, rsp.SubCode, rsp.SubMsg)
	}
	if rsp.TradeNo == "" {
		return nil, fmt.Errorf("alipay trade.create 未返回 trade_no")
	}

	// key 同时给 trade_no 与 tradeNO 两种写法，前端 `params.trade_no || params.tradeNO` 都能取到
	return &CreateResult{
		Params: map[string]any{
			"trade_no": rsp.TradeNo,
			"tradeNO":  rsp.TradeNo,
		},
	}, nil
}

// ParseCallback 支付宝异步通知：验签 + 解析。
//
// ⚠️ 支付宝回调是 **application/x-www-form-urlencoded**（不是 JSON），
// 且 `DecodeNotification` **内部已包含验签**（先 VerifySign 再解析），
// 所以这里不需要（也不应该）再手动验一次。
func (p *AlipayProvider) ParseCallback(
	ctx context.Context, _ map[string]string, body []byte,
) (*CallbackResult, error) {
	values, err := url.ParseQuery(string(body))
	if err != nil {
		return nil, fmt.Errorf("parse alipay callback form: %w", err)
	}

	notif, err := p.client.DecodeNotification(ctx, values)
	if err != nil {
		// 验签失败 / 解析失败都走这里。**必须拒绝**，否则可被伪造回调白嫖。
		return nil, fmt.Errorf("alipay notify verify/decode: %w", err)
	}
	if notif.OutTradeNo == "" {
		return nil, fmt.Errorf("alipay notify: 缺少 out_trade_no")
	}

	success := notif.TradeStatus == alipayTradeSuccess ||
		notif.TradeStatus == alipayTradeFinished

	raw, _ := json.Marshal(notif)
	return &CallbackResult{
		Channel: model.PayChannelAlipay,
		// 渠道回调只带商户订单号，本平台自增 ID 由 service 层反查
		OrderNo:       notif.OutTradeNo,
		TransactionID: notif.TradeNo,
		AmountCents:   YuanToCents(notif.TotalAmount),
		Success:       success,
		Raw:           raw,
	}, nil
}

// Refund 押金原路退回。
//
// ⚠️ `out_request_no` **必须传且每次唯一** —— 同一笔交易多次退款时，
// 支付宝靠它区分「这是第几次退款请求」；重复传同一个值会被当成同一次请求。
func (p *AlipayProvider) Refund(
	ctx context.Context, o *model.Order, transactionID string, amountCents int64, reason string,
) error {
	outRequestNo := fmt.Sprintf("%s-RF%d", o.No, time.Now().Unix())

	req := alipay.TradeRefund{
		RefundAmount: CentsToYuan(amountCents),
		RefundReason: reason,
		OutRequestNo: outRequestNo,
	}
	// trade_no 与 out_trade_no 二选一：优先用渠道交易号（更精确）
	if strings.TrimSpace(transactionID) != "" {
		req.TradeNo = transactionID
	} else {
		req.OutTradeNo = o.No
	}

	rsp, err := p.client.TradeRefund(ctx, req)
	if err != nil {
		return fmt.Errorf("alipay trade.refund: %w", err)
	}
	if rsp.IsFailure() {
		return fmt.Errorf("alipay trade.refund 失败: code=%v sub_code=%s sub_msg=%s",
			rsp.Code, rsp.SubCode, rsp.SubMsg)
	}
	return nil
}

// ── 金额换算（分 ↔ 元）───────────────────────────────────────────────
//
// ⚠️ **绝不能用浮点做金额换算**：`float64(213000)/100` 在某些值上会得到
// 2130.0000000000002 这类结果，再格式化成 "2130.00" 看似正常，
// 但一旦参与比较/累加就会漂移。这里全程用整数运算。

// CentsToYuan 分 → 元字符串（两位小数），如 213000 → "2130.00"
func CentsToYuan(cents int64) string {
	if cents < 0 {
		cents = 0
	}
	return fmt.Sprintf("%d.%02d", cents/100, cents%100)
}

// YuanToCents 元字符串 → 分。容忍 "2130"、"2130.5"、"2130.50" 等写法；
// 非法输入返回 0（调用方应对 0 做「金额不符」判断）。
func YuanToCents(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")

	wholeStr, fracStr := s, ""
	if i := strings.Index(s, "."); i >= 0 {
		wholeStr, fracStr = s[:i], s[i+1:]
	}
	// 只取两位小数（支付宝最多两位）
	if len(fracStr) > 2 {
		fracStr = fracStr[:2]
	}
	for len(fracStr) < 2 {
		fracStr += "0"
	}
	// 非数字直接判为 0 —— 宁可让上层报「金额不符」，也不要解析出错误金额
	if !isAllDigits(wholeStr) || !isAllDigits(fracStr) {
		return 0
	}

	var whole, frac int64
	for _, ch := range wholeStr {
		whole = whole*10 + int64(ch-'0')
	}
	for _, ch := range fracStr {
		frac = frac*10 + int64(ch-'0')
	}
	v := whole*100 + frac
	if neg {
		v = -v
	}
	return v
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}
