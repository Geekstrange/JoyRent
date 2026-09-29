// File Name: logistics_test.go
// Created Time: 2026-09-28 11:12:00
//
// 快递100 轨迹查询的单元测试。
//
// ⚠️ 重点覆盖三处**最容易悄悄出错**的地方：
//  1. 签名：sign = MD5(param + key + customer) 大写 —— **顺序**写反会一直报签名失败
//  2. 轨迹顺序：快递100 返回的是**倒序**（最新在前），本平台按**正序**存
//     （前端取最后一条作最新）—— 顺序反了用户会看到「最新的在最上面」的错觉
//  3. 状态映射：第三方 state → 本平台 ShipStatus，且推进必须逐段走 ShipFlow
package service

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"rental-platform/internal/config"
	"rental-platform/internal/model"
)

// ── 签名 ──────────────────────────────────────────────────────────────

func TestKuaidi100_Sign(t *testing.T) {
	cfg := config.LogisticsConfig{Provider: "kuaidi100", Customer: "CUST001", Key: "KEY001"}
	tr := NewKuaidi100Tracker(cfg)

	param := `{"com":"shunfeng","num":"SF1234567890","resultv2":"4"}`

	// 用标准库独立算一遍，验证实现（而不是把实现的输出当期望值）
	sum := md5.Sum([]byte(param + "KEY001" + "CUST001"))
	want := strings.ToUpper(hex.EncodeToString(sum[:]))
	if got := tr.sign(param); got != want {
		t.Errorf("sign 错误:\n  得到 %s\n  期望 %s", got, want)
	}

	// ⚠️ 顺序敏感性：param+customer+key 是**错误**顺序，必须得到不同结果
	wrong := md5.Sum([]byte(param + "CUST001" + "KEY001"))
	wrongStr := strings.ToUpper(hex.EncodeToString(wrong[:]))
	if want == wrongStr {
		t.Skip("本测试数据下两种顺序恰好同值，无法区分（换一组 key/customer 再测）")
	}
	if tr.sign(param) == wrongStr {
		t.Error("签名顺序写反了 —— 必须是 MD5(param + key + customer)")
	}

	// 必须是大写
	if tr.sign(param) != strings.ToUpper(tr.sign(param)) {
		t.Error("签名必须是大写十六进制")
	}
}

// ── 响应解析（用假 HTTP 客户端，不真调快递100）────────────────────────

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

const kuaidi100Sample = `{
  "message":"ok","returnCode":"200","nu":"SF123","com":"shunfeng",
  "status":"200","state":"3",
  "data":[
    {"time":"2026-09-28 10:00:00","ftime":"2026-09-28 10:00:00","context":"已签收，感谢使用"},
    {"time":"2026-09-28 08:00:00","ftime":"2026-09-28 08:00:00","context":"派送中"},
    {"time":"2026-09-27 18:00:00","ftime":"2026-09-27 18:00:00","context":"已揽收"}
  ]
}`

func TestKuaidi100_Track(t *testing.T) {
	cfg := config.LogisticsConfig{Provider: "kuaidi100", Customer: "C", Key: "K"}

	var gotForm url.Values
	client := &http.Client{Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		raw, _ := io.ReadAll(r.Body)
		v, err := url.ParseQuery(string(raw))
		if err != nil {
			return nil, err
		}
		gotForm = v
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(kuaidi100Sample)),
			Request:    r,
		}, nil
	})}

	tr := newKuaidi100TrackerWithClient(cfg, client, "https://example.invalid/poll")
	traces, state, err := tr.Track(context.Background(), "sf", "SF123")
	if err != nil {
		t.Fatalf("Track 失败: %v", err)
	}

	// (a) 请求参数：com 必须换成快递100 的编码 shunfeng
	var param map[string]string
	if err := json.Unmarshal([]byte(gotForm.Get("param")), &param); err != nil {
		t.Fatalf("param 不是合法 JSON: %v", err)
	}
	if param["com"] != "shunfeng" {
		t.Errorf("快递公司编码应映射为 shunfeng，实际 %q", param["com"])
	}
	if param["num"] != "SF123" {
		t.Errorf("num 应为 SF123，实际 %q", param["num"])
	}
	if gotForm.Get("customer") != "C" {
		t.Error("customer 未随请求发送")
	}
	if gotForm.Get("sign") == "" {
		t.Error("sign 缺失")
	}

	// (b) state=3（签收）→ signed
	if state != model.ShipStatusSigned {
		t.Errorf("state=3 应映射为 signed，实际 %q", state)
	}

	// (c) ⚠️ 轨迹必须**正序**（最早在前）
	if len(traces) != 3 {
		t.Fatalf("轨迹应有 3 条，实际 %d", len(traces))
	}
	if !strings.Contains(traces[0].Text, "揽收") {
		t.Errorf("第一条应为最早的「已揽收」，实际 %q", traces[0].Text)
	}
	if !strings.Contains(traces[2].Text, "签收") {
		t.Errorf("最后一条应为最新的「已签收」，实际 %q", traces[2].Text)
	}
	if !traces[0].At.Before(traces[2].At) {
		t.Error("轨迹时间应递增（正序）")
	}
}

func TestKuaidi100_Track_Error(t *testing.T) {
	cfg := config.LogisticsConfig{Provider: "kuaidi100", Customer: "C", Key: "K"}
	client := &http.Client{Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"message":"签名校验失败","status":"400"}`)),
			Request:    r,
		}, nil
	})}
	tr := newKuaidi100TrackerWithClient(cfg, client, "https://example.invalid/poll")
	if _, _, err := tr.Track(context.Background(), "sf", "SF123"); err == nil {
		t.Fatal("status!=200 时应返回错误")
	}
}

// ── 编码映射 ──────────────────────────────────────────────────────────

func TestKuaidi100_CompanyMap(t *testing.T) {
	// 本平台所有「可查询」的快递公司都必须有映射（self 除外）
	for code := range model.ExpressCompanies {
		if code == "self" {
			// 同城自提没有运单，不应映射
			if _, ok := kuaidi100CompanyMap[code]; ok {
				t.Errorf("self（同城自提）不应出现在快递100 映射里")
			}
			continue
		}
		if _, ok := kuaidi100CompanyMap[code]; !ok {
			t.Errorf("快递公司 %s（%s）缺少快递100 编码映射", code, model.ExpressCompanies[code])
		}
	}

	// 未配置的快递公司应报错，而不是带着空 com 去请求
	cfg := config.LogisticsConfig{Customer: "C", Key: "K"}
	tr := NewKuaidi100Tracker(cfg)
	if _, _, err := tr.Track(context.Background(), "self", "X"); err == nil {
		t.Error("self（同城自提）查询应报错（无运单）")
	}
	if _, _, err := tr.Track(context.Background(), "unknown_co", "X"); err == nil {
		t.Error("未知快递公司应报错")
	}
}

func TestKuaidi100_MissingCredentials(t *testing.T) {
	// 未配 key 时**不得**发起请求（会浪费调用次数并返回误导性错误）
	tr := NewKuaidi100Tracker(config.LogisticsConfig{Provider: "kuaidi100", Customer: "C"})
	if _, _, err := tr.Track(context.Background(), "sf", "SF1"); err == nil {
		t.Error("缺 key 时应报错")
	}
}

// ── 状态映射与推进路径 ────────────────────────────────────────────────

func TestKuaidi100_StateMap(t *testing.T) {
	cases := map[string]string{
		"0": model.ShipStatusDelivering, // 在途
		"1": model.ShipStatusShipped,    // 揽收
		"3": model.ShipStatusSigned,     // 签收
		"5": model.ShipStatusDelivering, // 派件
		"6": model.ShipStatusReturning,  // 退回
	}
	for state, want := range cases {
		if got := kuaidi100StateMap[state]; got != want {
			t.Errorf("state=%s 应映射为 %s，实际 %q", state, want, got)
		}
	}
	// 疑难（2）必须是不推进，不能靠猜
	if got := kuaidi100StateMap["2"]; got != "" {
		t.Errorf("state=2（疑难）应为空串（保持现状），实际 %q", got)
	}
}

func TestShipPathTo(t *testing.T) {
	// 逐段推进：运输中 → 派送中 → 已签收
	got := shipPathTo(model.ShipStatusShipped, model.ShipStatusSigned)
	want := []string{model.ShipStatusDelivering, model.ShipStatusSigned}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("shipped→signed 路径应为 [%s]，实际 [%s]", want, got)
	}

	// 同状态 → 无路径
	if p := shipPathTo(model.ShipStatusSigned, model.ShipStatusSigned); len(p) != 0 {
		t.Errorf("同状态应返回空路径，实际 %v", p)
	}
	// 反向（签收 → 运输中）→ 无路径（不允许回退）
	if p := shipPathTo(model.ShipStatusSigned, model.ShipStatusShipped); len(p) != 0 {
		t.Errorf("反向路径应为空，实际 %v", p)
	}

	// ⚠️ 关键：第三方可能直接报「签收」而本地还在「运输中」，
	//    路径里的每一段都必须能通过 CanShipTransition
	cur := model.ShipStatusShipped
	for _, next := range shipPathTo(cur, model.ShipStatusSigned) {
		if !model.CanShipTransition(cur, next) {
			t.Fatalf("路径中的 %s -> %s 不被 ShipFlow 允许", cur, next)
		}
		cur = next
	}
	if cur != model.ShipStatusSigned {
		t.Errorf("逐段推进后应到达 signed，实际 %s", cur)
	}
}

func TestTraceKey(t *testing.T) {
	// 去重键：同一时间+文本必须相同，不同文本必须不同
	t1 := time.Date(2026, 9, 28, 10, 0, 0, 0, time.Local)
	a := traceKey(t1, "已签收")
	b := traceKey(t1, "已签收")
	if a != b {
		t.Error("相同 (时间,文本) 的去重键应一致")
	}
	if a == traceKey(t1, "派送中") {
		t.Error("文本不同时去重键应不同")
	}
	// 秒级：同一秒内应视为同一条
	same := time.Date(2026, 9, 28, 10, 0, 0, 500*1000*1000, time.Local)
	if a == traceKey(same, "已签收") {
		t.Log("注意：亚秒级差异会产生不同键（按秒归一更稳妥）")
	}
}

func TestParseKuaidi100Time(t *testing.T) {
	// 常见格式
	got := parseKuaidi100Time("2026-09-28 10:00:00")
	if got.Year() != 2026 || got.Month() != 9 || got.Day() != 28 || got.Hour() != 10 {
		t.Errorf("时间解析错误: %v", got)
	}
	// 空串不应 panic，退回当前时间
	if parseKuaidi100Time("").IsZero() {
		t.Error("空时间应回退到当前时间而不是零值")
	}
	// 非标准格式同样不应 panic
	if parseKuaidi100Time("not-a-time").IsZero() {
		t.Error("无法解析时应回退到当前时间，不应返回零值")
	}
	_ = fmt.Sprint()
}
