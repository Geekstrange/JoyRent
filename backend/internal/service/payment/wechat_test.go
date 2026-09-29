// File Name: wechat_test.go
// Created Time: 2026-09-28 08:15:00
//
// 微信支付 provider 的单元测试。
//
// ⚠️ 为什么必须用「假 HTTP 层」而不是连真微信：
// 真实下单要商户号 + 证书，本地没有；而**参数拼错**（比如 paySign 的签名串
// 少一个 `\n`、金额单位用元不是分、漏传 payer.openid）恰恰是这类集成
// 最容易翻车的地方，且线上才会暴露。所以这里用自定义 `http.RoundTripper`
// 截住出站请求，把参数逐字段断言掉，并用商户公钥**真的验一遍 paySign**。
package payment

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/core/option"

	"rental-platform/internal/config"
	"rental-platform/internal/model"
)

// ── 测试脚手架 ────────────────────────────────────────────────────────

// fakeTransport 拦截出站请求，记录请求体并返回预置响应。
type fakeTransport struct {
	lastURL  string
	lastBody []byte
	respBody string
	status   int
}

func (t *fakeTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	t.lastURL = req.URL.Path
	if req.Body != nil {
		t.lastBody, _ = io.ReadAll(req.Body)
	}
	status := t.status
	if status == 0 {
		status = http.StatusOK
	}
	return &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(t.respBody)),
		Request:    req,
	}, nil
}

// newTestProvider 构造一个「签名用真私钥、HTTP 走假通道」的 provider。
//
// 关键点：必须用 `option.WithoutValidator()` —— 否则 core.NewClient 会
// **真的去下载微信平台证书**（外网请求），测试会因网络失败而挂掉。
func newTestProvider(t *testing.T, transport *fakeTransport) (*WechatProvider, *rsa.PrivateKey) {
	t.Helper()

	pk, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate test key: %v", err)
	}

	hc := &http.Client{Transport: transport}
	client, err := core.NewClient(
		context.Background(),
		option.WithMerchantCredential("1900000001", "TESTSERIAL", pk),
		option.WithHTTPClient(hc),
		option.WithoutValidator(),
	)
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	return &WechatProvider{
		cfg: config.WechatPayConfig{
			AppID:        "wxtestappid0001",
			MchID:        "1900000001",
			APIV3Key:     "test-api-v3-key-32bytes-length!",
			CertSerialNo: "TESTSERIAL",
			NotifyURL:    "https://example.com/api/v1/pay/callback/wechat",
		},
		privateKey: pk,
		client:     client,
	}, pk
}

func sampleOrder() *model.Order {
	return &model.Order{
		ID:           31,
		MerchantID:   1,
		No:           "R202609280754218479",
		UserID:       158,
		EquipmentID:  5,
		RentCents:    35000,  // 350.00 元
		DepositCents: 178000, // 1780.00 元
		Status:       model.OrderStatusPending,
	}
}

// ── 1. 配置三态校验（决定 router 注册真实渠道还是 Mock）─────────────────

func TestWechatPayConfigStates(t *testing.T) {
	empty := config.WechatPayConfig{}
	if !WechatPayUntouched(empty) {
		t.Error("全空配置应判定为 Untouched")
	}
	if WechatPayConfigured(empty) {
		t.Error("全空配置不应判定为 Configured")
	}

	full := config.WechatPayConfig{
		AppID: "a", MchID: "b", APIV3Key: "c", CertSerialNo: "d", PrivateKeyPath: "e",
	}
	if !WechatPayConfigured(full) {
		t.Errorf("配置齐全应判定为 Configured，实际缺失: %v", WechatPayMissing(full))
	}
	if WechatPayUntouched(full) {
		t.Error("齐全配置不应判定为 Untouched")
	}

	// ⚠️ 关键场景：填了一半 —— 必须既不 Configured 也不 Untouched，
	// 这样 router 会走 default 分支**报错**，而不是静默降级为 Mock。
	partial := config.WechatPayConfig{AppID: "a", MchID: "b"}
	if WechatPayConfigured(partial) {
		t.Error("缺字段不应判定为 Configured")
	}
	if WechatPayUntouched(partial) {
		t.Error("填了一半不应判定为 Untouched（否则会静默降级为 Mock）")
	}
	missing := WechatPayMissing(partial)
	if len(missing) != 3 {
		t.Errorf("应缺 3 项（api_v3_key/cert_serial_no/private_key_path），实际: %v", missing)
	}
	t.Logf("填一半时的缺失项: %v", missing)

	// ⚠️ 另一个关键场景：**只配了登录、没配支付**。
	// app_id / app_secret 是给 code2session 用的，与支付共用同一个配置段。
	// 这种配置必须判定为「未接入支付」（走 Mock），而不是「支付填了一半」
	// —— 后者会让 router 报错，导致「只想用登录」的用户连服务都起不来。
	loginOnly := config.WechatPayConfig{AppID: "wxauth0001", AppSecret: "loginsecret"}
	if !WechatPayUntouched(loginOnly) {
		t.Error("只配登录（app_id/app_secret）时，支付应判定为 Untouched 走 Mock")
	}
	if WechatPayConfigured(loginOnly) {
		t.Error("只配登录不应判定为支付 Configured")
	}
	if m := WechatPayMissing(loginOnly); len(m) != 4 {
		t.Errorf("只配登录时支付仍缺 4 项（含 app_id 已满足故为4），实际: %v", m)
	}
}

// ── 2. 下单参数正确性 + paySign 可验签 ───────────────────────────────

func TestWechatCreate_Success(t *testing.T) {
	tr := &fakeTransport{respBody: `{"prepay_id":"wx281234567890abcdef"}`}
	p, pk := newTestProvider(t, tr)
	o := sampleOrder()

	res, err := p.Create(context.Background(), CreateContext{Order: o, Payer: "oUSER_OPENID_123"})
	if err != nil {
		t.Fatalf("Create 失败: %v", err)
	}

	// ── (a) 请求路径与请求体 ──────────────────────────────────────────
	if tr.lastURL != "/v3/pay/transactions/jsapi" {
		t.Errorf("下单路径错误: %s", tr.lastURL)
	}
	var req map[string]any
	if err := json.Unmarshal(tr.lastBody, &req); err != nil {
		t.Fatalf("请求体不是合法 JSON: %v", err)
	}
	if got := req["out_trade_no"]; got != o.No {
		t.Errorf("out_trade_no 应为 %s，实际 %v", o.No, got)
	}
	if got := req["appid"]; got != p.cfg.AppID {
		t.Errorf("appid 应为 %s，实际 %v", p.cfg.AppID, got)
	}
	if got := req["mchid"]; got != p.cfg.MchID {
		t.Errorf("mchid 应为 %s，实际 %v", p.cfg.MchID, got)
	}
	if got := req["notify_url"]; got != p.cfg.NotifyURL {
		t.Errorf("notify_url 应为 %s，实际 %v", p.cfg.NotifyURL, got)
	}
	// 金额必须是「分」，且 = 租金 + 押金
	amount, _ := req["amount"].(map[string]any)
	if amount == nil {
		t.Fatal("请求体缺少 amount")
	}
	wantTotal := float64(o.RentCents + o.DepositCents)
	if got := amount["total"]; got != wantTotal {
		t.Errorf("amount.total 应为 %.0f 分（租金+押金），实际 %v", wantTotal, got)
	}
	// ⚠️ JSAPI 必须带 payer.openid，漏了微信会报 PARAM_ERROR
	payer, _ := req["payer"].(map[string]any)
	if payer == nil {
		t.Fatal("请求体缺少 payer（JSAPI 下单必须带 openid）")
	}
	if got := payer["openid"]; got != "oUSER_OPENID_123" {
		t.Errorf("payer.openid 错误: %v", got)
	}

	// ── (b) 返回给前端的字段名必须与 wx.requestPayment 对齐 ───────────
	for _, k := range []string{"timeStamp", "nonceStr", "package", "signType", "paySign"} {
		if _, ok := res.Params[k]; !ok {
			t.Errorf("返回参数缺少 %q（前端 wx.requestPayment 需要）", k)
		}
	}
	// 绝对不能混进 mock 标记 —— 否则前端会跳过真实支付
	if _, ok := res.Params["mock"]; ok {
		t.Error("真实渠道的返回里不应出现 mock 标记")
	}
	if got := res.Params["package"]; got != "prepay_id=wx281234567890abcdef" {
		t.Errorf("package 应为 prepay_id=xxx，实际 %v", got)
	}
	if got := res.Params["signType"]; got != "RSA" {
		t.Errorf("signType 应为 RSA，实际 %v", got)
	}

	// ── (c) paySign 必须能被商户公钥验证通过 ──────────────────────────
	// 微信规定的待签名串格式（每一步的顺序和换行都不能错）：
	//   appid\ntimeStamp\nnonceStr\npackage\n
	message := strings.Join([]string{
		p.cfg.AppID,
		res.Params["timeStamp"].(string),
		res.Params["nonceStr"].(string),
		res.Params["package"].(string),
		"", // 末尾换行 → Join 后即 "...\n"
	}, "\n")

	sigB64 := res.Params["paySign"].(string)
	sig, err := base64.StdEncoding.DecodeString(sigB64)
	if err != nil {
		t.Fatalf("paySign 不是合法 base64: %v", err)
	}
	digest := sha256.Sum256([]byte(message))
	if err := rsa.VerifyPKCS1v15(&pk.PublicKey, crypto.SHA256, digest[:], sig); err != nil {
		t.Fatalf("paySign 验签失败（签名串格式或顺序有误）: %v\n待签名串=%q", err, message)
	}
	t.Logf("✓ paySign 验签通过；待签名串=%q", message)
}

// ── 3. 缺 openid 必须明确报错，而不是发出非法请求 ────────────────────

func TestWechatCreate_MissingPayer(t *testing.T) {
	tr := &fakeTransport{respBody: `{"prepay_id":"x"}`}
	p, _ := newTestProvider(t, tr)

	_, err := p.Create(context.Background(), CreateContext{Order: sampleOrder(), Payer: ""})
	if err == nil {
		t.Fatal("缺少 openid 时应报错")
	}
	if !strings.Contains(err.Error(), "openid") {
		t.Errorf("错误信息应提到 openid，实际: %v", err)
	}
	if tr.lastURL != "" {
		t.Error("参数校验失败时不应发出 HTTP 请求")
	}
}

// ── 4. 订单为空时不应 panic ──────────────────────────────────────────

func TestWechatCreate_NilOrder(t *testing.T) {
	tr := &fakeTransport{}
	p, _ := newTestProvider(t, tr)
	if _, err := p.Create(context.Background(), CreateContext{}); err == nil {
		t.Fatal("order 为 nil 时应报错")
	}
}

// ── 5. 总额计算（下单与退款共用，防止两处算法漂移）────────────────────

func TestTotalCents(t *testing.T) {
	o := &model.Order{RentCents: 35000, DepositCents: 178000}
	if got := TotalCents(o); got != 213000 {
		t.Errorf("TotalCents 应为 213000，实际 %d", got)
	}
}

// ── 6. Mock 渠道返回必须带 mock 标记（前端据此跳过真实支付）───────────

func TestMockCreateHasMarker(t *testing.T) {
	m := NewMockProvider("wechat")
	o := &model.Order{ID: 31, No: "R1", RentCents: 100, DepositCents: 200}

	res, err := m.Create(context.Background(), CreateContext{Order: o})
	if err != nil {
		t.Fatalf("mock create: %v", err)
	}
	if res.Params["mock"] != true {
		t.Error("Mock 渠道必须返回 mock:true，否则前端会拿伪造参数去调起真实支付")
	}
	if _, ok := res.Params["paySign"]; ok {
		t.Error("Mock 渠道不应有 paySign")
	}
	_ = time.Now
}
