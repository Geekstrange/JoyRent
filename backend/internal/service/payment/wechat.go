// File Name: wechat.go
// Created Time: 2026-09-22 19:24:46
// Update Time: 2026-09-28 08:05:00


package payment

import (
	"bytes"
	"context"
	"crypto/rsa"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth/verifiers"
	"github.com/wechatpay-apiv3/wechatpay-go/core/downloader"
	"github.com/wechatpay-apiv3/wechatpay-go/core/notify"
	"github.com/wechatpay-apiv3/wechatpay-go/core/option"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/jsapi"
	"github.com/wechatpay-apiv3/wechatpay-go/services/refunddomestic"
	"github.com/wechatpay-apiv3/wechatpay-go/utils"

	"rental-platform/internal/config"
	"rental-platform/internal/model"
	"rental-platform/pkg/errs"
)

// WechatProvider 微信支付（小程序 JSAPI，直连商户模式）
//
// ── 依赖 SDK ────────────────────────────────────────────────────────────
// github.com/wechatpay-apiv3/wechatpay-go —— 微信支付官方 v3 SDK。
//
// ── 三项能力由 SDK 的 Client 一并提供 ─────────────────────────────────
//   · 请求签名（商户私钥 + 证书序列号）
//   · 回调验签（微信平台证书）
//   · 敏感字段 AES-GCM 解密（回调报文里的 resource 是加密的）
//
// 用 `option.WithWechatPayAutoAuthCipher` 一次性装配，SDK 会**自动下载并
// 定时轮换平台证书**，因此不需要在本地预置平台证书文件 ——
// 这也是为什么 `config.toml` 里没有「平台证书路径」这一项。
type WechatProvider struct {
	cfg        config.WechatPayConfig
	privateKey *rsa.PrivateKey
	// client 用于下单/退款等出站请求
	client *core.Client
	// notifyHandler 用于回调验签 + 解密
	notifyHandler *notify.Handler
}

// 微信支付回调时携带的签名相关请求头（SDK 内部会按需读取，这里列出便于排查）
//
//	Wechatpay-Signature     签名值
//	Wechatpay-Timestamp     时间戳
//	Wechatpay-Nonce         随机串
//	Wechatpay-Serial        平台证书序列号
const (
	wechatCallbackPath = "/api/v1/pay/callback/wechat"
)

// ── 配置校验辅助（供 router 判断「该注册真实渠道还是 Mock」）──────────

// wechatPayOnlyFields 微信支付**专属**的必填项。
//
// ⚠️ 刻意**不含 `app_id`** —— 它与小程序登录共用（见 config.toml 的
// `[payment.wechat]` 段：`app_secret` 就是给 code2session 用的）。
// 用户完全可能「只配登录、暂不接支付」，此时 app_id 有值而支付字段全空。
// 若把 app_id 也算进「支付必填」，这种配置会被误判成「支付填了一半」
// → router 走报错分支 → **服务根本起不来**。
var wechatPayOnlyFields = []struct {
	name  string
	value func(config.WechatPayConfig) string
}{
	{"mch_id", func(c config.WechatPayConfig) string { return c.MchID }},
	{"api_v3_key", func(c config.WechatPayConfig) string { return c.APIV3Key }},
	{"cert_serial_no", func(c config.WechatPayConfig) string { return c.CertSerialNo }},
	{"private_key_path", func(c config.WechatPayConfig) string { return c.PrivateKeyPath }},
}

// WechatPayMissing 返回**启用真实支付**所缺的项（含 app_id —— 下单要用它）。
func WechatPayMissing(cfg config.WechatPayConfig) []string {
	var missing []string
	if strings.TrimSpace(cfg.AppID) == "" {
		missing = append(missing, "app_id")
	}
	for _, f := range wechatPayOnlyFields {
		if strings.TrimSpace(f.value(cfg)) == "" {
			missing = append(missing, f.name)
		}
	}
	return missing
}

// WechatPayConfigured 支付配置齐全，可以启用真实渠道。
func WechatPayConfigured(cfg config.WechatPayConfig) bool {
	return len(WechatPayMissing(cfg)) == 0
}

// WechatPayUntouched 支付专属字段**全空** —— 即「没打算接支付」。
//
// 与「填了一半」区分开很重要：前者应静默降级为 Mock（本地开发 / 只用登录的常态），
// 后者是**配置错误**，必须报错而不是悄悄用 Mock 顶替 ——
// 否则线上环境填漏一个字段就会「看起来能支付」，实际收不到钱。
func WechatPayUntouched(cfg config.WechatPayConfig) bool {
	for _, f := range wechatPayOnlyFields {
		if strings.TrimSpace(f.value(cfg)) != "" {
			return false
		}
	}
	return true
}

func NewWechatProvider(cfg config.WechatPayConfig) (*WechatProvider, error) {
	// ── 配置校验 ──────────────────────────────────────────────────────
	// 缺任何一项都无法完成签名或验签，与其在运行时抛模糊错误，
	// 不如启动时就明确告知缺什么（与 AlipayProvider 的校验风格一致）。
	if missing := WechatPayMissing(cfg); len(missing) > 0 {
		return nil, fmt.Errorf("wechat pay config incomplete, missing: %v", missing)
	}

	// ── 加载商户私钥（apiclient_key.pem）────────────────────────────────
	pk, err := utils.LoadPrivateKeyWithPath(cfg.PrivateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("load wechat private key: %w", err)
	}

	ctx := context.Background()

	// ── 构造 Client 并自动装配「签名 / 验签 / 解密」────────────────────
	// 注意：这一步会**同步下载平台证书**（需要外网访问 api.mch.weixin.qq.com）。
	// 网络不通或商户配置错误会在此刻暴露，属于预期的「快速失败」。
	client, err := core.NewClient(
		ctx,
		option.WithWechatPayAutoAuthCipher(cfg.MchID, cfg.CertSerialNo, pk, cfg.APIV3Key),
	)
	if err != nil {
		return nil, fmt.Errorf("init wechat pay client: %w", err)
	}

	// ── 回调处理器 ────────────────────────────────────────────────────
	// ⚠️ 不能直接把 `downloader.MgrInstance().GetCertificateVisitor(...)` 的结果
	// 当作 verifier 传进来 —— CertificateVisitor 只提供**取证书**的能力
	// （Get/GetAll/GetNewestSerial/Export...），并不含 `Verify`/`GetSerial`。
	// 必须经 `verifiers.NewSHA256WithRSAVerifier(...)` 包一层，
	// 它才是 notify.Handler 需要的 `auth.Verifier`。
	visitor := downloader.MgrInstance().GetCertificateVisitor(cfg.MchID)
	handler, err := notify.NewRSANotifyHandler(
		cfg.APIV3Key,
		verifiers.NewSHA256WithRSAVerifier(visitor),
	)
	if err != nil {
		return nil, fmt.Errorf("init wechat notify handler: %w", err)
	}

	return &WechatProvider{cfg: cfg, privateKey: pk, client: client, notifyHandler: handler}, nil
}

func (p *WechatProvider) Channel() string { return model.PayChannelWechat }

// Create 微信小程序下单（JSAPI）
//
// 返回的 5 个字段就是 `wx.requestPayment` 的入参，前端可直接透传：
//
//	timeStamp / nonceStr / package / signType / paySign
//
// SDK 的 `PrepayWithRequestPayment` 已把「下单 + 生成签名」两步做完
// （内部用商户私钥对 `appId\ntimeStamp\nnonceStr\npackage\n` 做 SHA256withRSA），
// 所以这里不需要自己拼签名串。
func (p *WechatProvider) Create(ctx context.Context, cc CreateContext) (*CreateResult, error) {
	o := cc.Order
	if o == nil {
		return nil, fmt.Errorf("%w: 订单不能为空", errs.ErrInvalidArgument)
	}
	// JSAPI 下单必须带付款人 openid，否则微信报 PARAM_ERROR。
	// 这个值由 service 层从 app_user 表查出后传入（order 表只有 user_id）。
	if cc.Payer == "" {
		return nil, fmt.Errorf(
			"%w: 缺少付款人 openid，无法发起微信支付（该用户可能未通过微信登录）",
			errs.ErrInvalidArgument,
		)
	}

	svc := jsapi.JsapiApiService{Client: p.client}
	resp, _, err := svc.PrepayWithRequestPayment(ctx, jsapi.PrepayRequest{
		Appid:       core.String(p.cfg.AppID),
		Mchid:       core.String(p.cfg.MchID),
		Description: core.String("设备租赁订单 " + o.No),
		OutTradeNo:  core.String(o.No),
		NotifyUrl:   core.String(p.cfg.NotifyURL),
		Amount: &jsapi.Amount{
			Total:    core.Int64(TotalCents(o)),
			Currency: core.String("CNY"),
		},
		Payer: &jsapi.Payer{Openid: core.String(cc.Payer)},
	})
	if err != nil {
		return nil, fmt.Errorf("wechat prepay: %w", err)
	}

	// 字段名必须与前端 `Taro.requestPayment` 的入参一致
	// （见 taro-app/src/utils/platform.ts 的 pay()）。
	return &CreateResult{
		Params: map[string]any{
			"timeStamp": deref(resp.TimeStamp),
			"nonceStr":  deref(resp.NonceStr),
			"package":   deref(resp.Package),
			"signType":  deref(resp.SignType),
			"paySign":   deref(resp.PaySign),
		},
	}, nil
}

// ParseCallback 微信 v3 回调：验签 + AES-GCM 解密 + 字段提取
//
// ⚠️ 两个关键点：
//  1. SDK 的 `notify.Handler.ParseNotifyRequest` 只接受 `*http.Request`，
//     而本项目的 Provider 接口传的是 `headers + body`（为了不把 net/http
//     的细节泄漏进 payment 抽象层），所以这里需要**重新组装**一个 http.Request。
//  2. 回调报文里的 `resource` 是 AES-GCM 加密的，解密后才是真正的交易内容。
//     这一层由 SDK 完成，解密结果写进我们传入的 `content`。
func (p *WechatProvider) ParseCallback(
	ctx context.Context, headers map[string]string, body []byte,
) (*CallbackResult, error) {
	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost, wechatCallbackPath, bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("build callback request: %w", err)
	}
	// 微信的签名头（Wechatpay-Signature / -Timestamp / -Nonce / -Serial）
	// 原样搬过来。http.Header.Set 会做 canonical 化，大小写不敏感。
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	// 解密后的内容落到这个 map（不绑定具体 model，字段按需取）
	content := make(map[string]any)
	if _, err := p.notifyHandler.ParseNotifyRequest(ctx, req, &content); err != nil {
		// 验签失败、证书不匹配、解密失败都会走到这里。
		// 这类错误必须**拒绝**（不能当成支付成功），否则会被伪造回调白嫖。
		return nil, fmt.Errorf("wechat notify verify/decrypt: %w", err)
	}

	outTradeNo := stringField(content, "out_trade_no")
	transactionID := stringField(content, "transaction_id")
	tradeState := stringField(content, "trade_state")

	// amount.total 是嵌套对象，取原订单总金额（分）
	var amountCents int64
	if am, ok := content["amount"].(map[string]any); ok {
		if t, ok := am["total"].(float64); ok {
			amountCents = int64(t)
		}
	}

	if outTradeNo == "" {
		return nil, fmt.Errorf("wechat notify: 缺少 out_trade_no")
	}

	raw, _ := json.Marshal(content)
	return &CallbackResult{
		Channel: model.PayChannelWechat,
		// 渠道回调只带商户订单号，本平台自增 ID 由 service 层反查后回填
		OrderNo:       outTradeNo,
		TransactionID: transactionID,
		AmountCents:   amountCents,
		Success:       tradeState == "SUCCESS",
		Raw:           raw,
	}, nil
}

// Refund 押金原路退回
//
// 微信退款接口要求：
//   - `out_trade_no` 与 `transaction_id` 二选一（这里优先用 transaction_id，
//     更精确；缺失时回退到我们的订单号）
//   - 金额需同时给出「本次退款额 refund」与「原订单总额 total」
func (p *WechatProvider) Refund(
	ctx context.Context, o *model.Order, transactionID string, amountCents int64, reason string,
) error {
	// 退款单号必须全局唯一：同一个 out_refund_no 重复请求只会退一笔，
	// 拼接时间戳可保证「同一订单多次退款尝试」不会互相顶掉。
	outRefundNo := fmt.Sprintf("%s-RF%d", o.No, time.Now().Unix())

	req := refunddomestic.CreateRequest{
		OutRefundNo: core.String(outRefundNo),
		Reason:      core.String(reason),
		Amount: &refunddomestic.AmountReq{
			Refund:   core.Int64(amountCents),
			Total:    core.Int64(TotalCents(o)),
			Currency: core.String("CNY"),
		},
	}
	if transactionID != "" {
		req.TransactionId = core.String(transactionID)
	} else {
		req.OutTradeNo = core.String(o.No)
	}

	svc := refunddomestic.RefundsApiService{Client: p.client}
	if _, _, err := svc.Create(ctx, req); err != nil {
		return fmt.Errorf("wechat refund: %w", err)
	}
	return nil
}

// ── 小工具 ────────────────────────────────────────────────────────────

// deref 安全解引用（SDK 的响应字段普遍是 *string）
func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// stringField 从解密后的回调 map 里取字符串字段
func stringField(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}
