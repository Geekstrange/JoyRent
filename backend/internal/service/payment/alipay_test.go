// File Name: alipay_test.go
// Created Time: 2026-09-28 09:40:00
//
// 支付宝 provider 的单元测试。
//
// ⚠️ 重点两块：
//  1. **金额单位换算（分 ↔ 元）** —— 支付宝接口用「元」字符串，本平台内部用「分」，
//     换算出错就是直接的资金错误（差 100 倍）。
//  2. **下单参数拼装**（`buildTradeCreate`）—— total_amount 的单位、product_code、
//     buyer_id、以及**押金减免后金额是否正确**。这些错了本地无从发现、线上才炸。
//
// 为什么不 mock HTTP 走通整个 Create：`TradeCreate` 内嵌的 `AuxParam.NeedVerify()`
// **恒为 true**（支付宝对下单响应也验签），mock 响应没有有效 `sign` 时
// SDK 会把业务内容当错误返回（见 `alipay.go` 的 `decode`）。
// 与其伪造签名，不如把参数拼装抽成纯函数直接断言 —— 覆盖的易错点是一样的。
package payment

import (
	"context"
	"strings"
	"testing"

	"rental-platform/internal/config"
	"rental-platform/internal/model"
)

// ── 金额换算 ──────────────────────────────────────────────────────────

func TestCentsToYuan(t *testing.T) {
	cases := []struct {
		cents int64
		want  string
	}{
		{0, "0.00"},
		{1, "0.01"},
		{9, "0.09"},
		{99, "0.99"},
		{100, "1.00"},
		{213000, "2130.00"},
		{100000000, "1000000.00"},
		{-1, "0.00"}, // 负数兜底（金额不应为负）
	}
	for _, c := range cases {
		if got := CentsToYuan(c.cents); got != c.want {
			t.Errorf("CentsToYuan(%d) = %q，期望 %q", c.cents, got, c.want)
		}
	}
}

func TestYuanToCents(t *testing.T) {
	cases := []struct {
		in   string
		want int64
	}{
		{"", 0},
		{"0.01", 1},
		{"0.99", 99},
		{"1.00", 100},
		{"2130.00", 213000},
		{"2130", 213000},     // 无小数位
		{"2130.5", 213050},   // 一位小数补零
		{"2130.567", 213056}, // 截断到两位（支付宝最多两位）
		{"-1.00", -100},      // 退款等场景可能为负
		{"abc", 0},           // 非法 → 0（宁可让上层报「金额不符」）
		{"12a.00", 0},        // 部分非法 → 0，绝不解析出错误金额
	}
	for _, c := range cases {
		if got := YuanToCents(c.in); got != c.want {
			t.Errorf("YuanToCents(%q) = %d，期望 %d", c.in, got, c.want)
		}
	}
}

func TestMoneyRoundTrip(t *testing.T) {
	// ⚠️ 最有价值的一条：分 → 元 → 分 必须无损。
	// 这条能直接抓出「用 float64 做换算」引入的精度漂移。
	for _, cents := range []int64{0, 1, 9, 99, 100, 101, 999, 12345, 213000, 99999999} {
		yuan := CentsToYuan(cents)
		if got := YuanToCents(yuan); got != cents {
			t.Errorf("往返丢精度：%d → %q → %d", cents, yuan, got)
		}
	}
}

// ── 配置三态 ──────────────────────────────────────────────────────────

func TestAlipayConfigStates(t *testing.T) {
	empty := config.AlipayConfig{}
	if !AlipayUntouched(empty) {
		t.Error("全空应判为 Untouched")
	}

	full := config.AlipayConfig{AppID: "2021000000000000", PrivateKey: "-----BEGIN PRIVATE KEY-----x"}
	if !AlipayConfigured(full) {
		t.Errorf("齐全应判为 Configured，缺: %v", AlipayMissing(full))
	}

	// ⚠️ 只填 app_id（没私钥）：既不是 Configured 也不是 Untouched
	// → router 会报错，而不是静默走 Mock
	partial := config.AlipayConfig{AppID: "2021000000000000"}
	if AlipayConfigured(partial) || AlipayUntouched(partial) {
		t.Error("只填一项应落入 default 分支（报错），不能静默降级")
	}
	if m := AlipayMissing(partial); len(m) != 1 || m[0] != "private_key" {
		t.Errorf("应缺 private_key，实际 %v", m)
	}

	// alipay_public_key 不算必填（少了它只是回调验签失败，下单仍可用）
	if !AlipayConfigured(config.AlipayConfig{AppID: "a", PrivateKey: "b"}) {
		t.Error("未配 alipay_public_key 也应视为配置齐全")
	}
}

// ── 下单参数拼装 ──────────────────────────────────────────────────────

func TestBuildTradeCreate(t *testing.T) {
	cfg := config.AlipayConfig{
		AppID:     "2021000000000000",
		NotifyURL: "https://example.com/api/v1/pay/callback/alipay",
	}
	o := &model.Order{
		ID: 31, No: "R202609280754218479",
		RentCents: 35000, DepositCents: 178000, // 合计 213000 分
	}

	req := buildTradeCreate(cfg, o, "2088000000000001")

	// ⚠️ 单位必须是**元**。写成 213000 会让用户多付 1000 倍。
	if req.TotalAmount != "2130.00" {
		t.Errorf("TotalAmount 必须是元（2130.00），实际 %q —— 用分会导致多收 1000 倍",
			req.TotalAmount)
	}
	// 小程序支付的 product_code；用错则 my.tradePay 拉不起收银台
	if req.ProductCode != "JSAPI_PAY" {
		t.Errorf("ProductCode 必须是 JSAPI_PAY，实际 %q", req.ProductCode)
	}
	if req.OutTradeNo != o.No {
		t.Errorf("OutTradeNo 应为 %s，实际 %q", o.No, req.OutTradeNo)
	}
	if req.Subject == "" {
		t.Error("Subject 不能为空（支付宝必填）")
	}
	if req.NotifyURL != cfg.NotifyURL {
		t.Errorf("NotifyURL 应为 %s，实际 %q", cfg.NotifyURL, req.NotifyURL)
	}
	// op_app_id：小程序支付必填，且需在开放平台绑定过该小程序
	if req.OpAppId != cfg.AppID {
		t.Errorf("OpAppId 应为 %s，实际 %q", cfg.AppID, req.OpAppId)
	}
	// 买家标识（登录换来的 2088 用户号）
	if req.BuyerId != "2088000000000001" {
		t.Errorf("BuyerId 错误，实际 %q", req.BuyerId)
	}
}

func TestBuildTradeCreate_ReflectsDepositReduction(t *testing.T) {
	// ⚠️ 关键：押金被信用分减免后，**下单金额必须用实收押金**。
	// 若这里仍按原押金算，就会出现「页面显示免押、支付宝却按原价扣钱」，
	// 属于直接的资金纠纷。
	cfg := config.AlipayConfig{AppID: "a"}

	// 全额：租金 350.00 + 押金 1780.00 = 2130.00
	full := &model.Order{No: "R_FULL", RentCents: 35000, DepositCents: 178000}
	if got := buildTradeCreate(cfg, full, "p").TotalAmount; got != "2130.00" {
		t.Errorf("全额押金订单应下单 2130.00，实际 %q", got)
	}

	// 半价：押金 890.00 → 合计 1240.00
	half := &model.Order{No: "R_HALF", RentCents: 35000, DepositCents: 89000}
	if got := buildTradeCreate(cfg, half, "p").TotalAmount; got != "1240.00" {
		t.Errorf("半价押金订单应下单 1240.00（用实收押金），实际 %q", got)
	}

	// 全免：押金 0 → 合计 350.00
	free := &model.Order{No: "R_FREE", RentCents: 35000, DepositCents: 0}
	if got := buildTradeCreate(cfg, free, "p").TotalAmount; got != "350.00" {
		t.Errorf("全免押金订单应只下单租金 350.00，实际 %q", got)
	}
}

// ── Create 的参数校验（不触发网络）────────────────────────────────────

func TestAlipayCreate_MissingBuyer(t *testing.T) {
	// 参数校验在调用 SDK **之前**完成，因此不需要可用的 client
	p := &AlipayProvider{cfg: config.AlipayConfig{AppID: "a"}}

	_, err := p.Create(context.Background(), CreateContext{
		Order: &model.Order{ID: 1, No: "R1"},
		Payer: "", // 缺买家标识
	})
	if err == nil {
		t.Fatal("缺少 buyer_id 时应报错")
	}
	if !strings.Contains(err.Error(), "buyer_id") {
		t.Errorf("错误信息应提到 buyer_id，实际: %v", err)
	}
}

func TestAlipayCreate_NilOrder(t *testing.T) {
	p := &AlipayProvider{cfg: config.AlipayConfig{AppID: "a"}}
	if _, err := p.Create(context.Background(), CreateContext{}); err == nil {
		t.Fatal("order 为 nil 时应报错而不是 panic")
	}
}
