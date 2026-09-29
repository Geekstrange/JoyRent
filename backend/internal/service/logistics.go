// File Name: logistics.go
// Created Time: 2026-09-28 11:05:00
//
// 快递轨迹查询（第三方）。
//
// ── 为什么要有这一层抽象 ──────────────────────────────────────────────
// 本平台的运单登记 / 状态流转 / 轨迹展示**本来就是可用的**（`ShipmentService`），
// 只是轨迹需要管理员手动录入。要「自动拉轨迹」就得接第三方服务，
// 而这类服务不止一家（快递100、快递鸟、聚合数据…），且都需要各自不同的
// 账号与签名方式 —— 所以把「轨迹从哪来」抽成接口，与业务解耦。
//
// 不启用时（配置留空）**不注册任何 tracker**，业务侧照常手动录入；
// 启用后由 `ShipmentService.RefreshTraces` 拉取 → 落库 → 按最新状态推进。
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
	"time"

	"rental-platform/internal/config"
	"rental-platform/internal/model"
)

// TrackPoint 一条轨迹点。
//
// 刻意**不直接复用 model.ShipmentTrace**：那是带 shipment_id 的落库结构，
// 而这里是「第三方返回的原始轨迹」。两者分开，避免 service 层被 DB 字段绑住。
type TrackPoint struct {
	At   time.Time
	Text string
}

// ExpressTracker 快递轨迹查询来源。
type ExpressTracker interface {
	// Name 实现名，用于启动日志与排查
	Name() string

	// Track 查询运单轨迹。
	//
	// 返回：
	//   traces —— **按时间正序**（最早在前；展示时最后一条即最新）
	//   state  —— 第三方给出的最新状态（已映射为本平台的 model.ShipStatus*；
	//             无法确定时为空串，由调用方保持现状）
	Track(ctx context.Context, express string, no string) (traces []TrackPoint, state string, err error)
}

// ── 快递公司编码映射 ──────────────────────────────────────────────────
//
// 本平台 `model.ExpressCompanies` 用的编码（sf / jd / zto …）与快递100 的编码
// （shunfeng / jd / zhongtong …）**不是同一套**，下单存的是前者，查询要用后者。
//
// ⚠️ "self"（同城自提）**不在映射里** —— 它没有运单号，查询无意义，
//    调用方应提前跳过（见 ShipmentService.RefreshTraces）。
var kuaidi100CompanyMap = map[string]string{
	"sf":  "shunfeng",
	"jd":  "jd",
	"zto": "zhongtong",
	"yto": "yuantong",
	"yd":  "yunda",
	"ems": "ems",
}

// 快递100 的 state → 本平台 ShipStatus。
//
// 快递100 state：0 在途 / 1 揽收 / 2 疑难 / 3 签收 / 4 退签 / 5 派件 / 6 退回 / 7 转投
//
// ⚠️ 空串表示「不推进」—— 疑难（2）等异常状态保持原状更安全，
//    让人工介入，不要靠猜测强行流转。
var kuaidi100StateMap = map[string]string{
	"0": model.ShipStatusDelivering, // 在途
	"1": model.ShipStatusShipped,    // 揽收
	"2": "",                         // 疑难 → 不推进
	"3": model.ShipStatusSigned,     // 签收
	"4": model.ShipStatusReturning,  // 退签
	"5": model.ShipStatusDelivering, // 派件
	"6": model.ShipStatusReturning,  // 退回
	"7": model.ShipStatusDelivering, // 转投
}

// ── 快递100 实现 ──────────────────────────────────────────────────────

const kuaidi100Endpoint = "https://poll.kuaidi100.com/poll/query.do"

// kuaidi100Resp 快递100 查询响应（只取需要的字段）
type kuaidi100Resp struct {
	Message    string `json:"message"`
	ReturnCode string `json:"returnCode"`
	Nu         string `json:"nu"`
	Com        string `json:"com"`
	Status     string `json:"status"`
	State      string `json:"state"`
	Data       []struct {
		Time    string `json:"time"`
		FTime   string `json:"ftime"`
		Context string `json:"context"`
	} `json:"data"`
}

type Kuaidi100Tracker struct {
	cfg      config.LogisticsConfig
	client   *http.Client
	endpoint string
}

func NewKuaidi100Tracker(cfg config.LogisticsConfig) *Kuaidi100Tracker {
	return &Kuaidi100Tracker{
		cfg:      cfg,
		client:   &http.Client{Timeout: 10 * time.Second},
		endpoint: kuaidi100Endpoint,
	}
}

// newKuaidi100TrackerWithClient 供单测注入假的 HTTP 客户端与网关地址，
// 这样不必真的调用快递100 就能断言「参数怎么拼的 / 响应怎么解析的」。
func newKuaidi100TrackerWithClient(
	cfg config.LogisticsConfig, client *http.Client, endpoint string,
) *Kuaidi100Tracker {
	return &Kuaidi100Tracker{cfg: cfg, client: client, endpoint: endpoint}
}

func (t *Kuaidi100Tracker) Name() string { return "kuaidi100" }

func (t *Kuaidi100Tracker) Track(
	ctx context.Context, express string, no string,
) ([]TrackPoint, string, error) {
	if strings.TrimSpace(t.cfg.Customer) == "" || strings.TrimSpace(t.cfg.Key) == "" {
		// 构造阶段已校验，这里兜底 —— 绝不带着空账号去请求（会浪费调用次数并返回误导性错误）
		return nil, "", fmt.Errorf("快递100 未配置 customer / key")
	}

	com, ok := kuaidi100CompanyMap[express]
	if !ok {
		return nil, "", fmt.Errorf("快递100 不支持该快递公司: %s（同城自提等无需查询）", express)
	}
	if strings.TrimSpace(no) == "" {
		return nil, "", fmt.Errorf("运单号为空，无法查询")
	}

	// resultv2=4 表示返回完整轨迹（含签收/退回等终态信息）
	param, err := json.Marshal(map[string]string{
		"com":      com,
		"num":      no,
		"resultv2": "4",
	})
	if err != nil {
		return nil, "", err
	}

	form := url.Values{
		"customer": {t.cfg.Customer},
		"sign":     {t.sign(string(param))},
		"param":    {string(param)},
	}

	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost, t.endpoint, strings.NewReader(form.Encode()),
	)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := t.client.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("请求快递100 失败: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}

	var out kuaidi100Resp
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, "", fmt.Errorf("解析快递100 响应失败: %w", err)
	}
	if !kuaidi100OK(&out) {
		return nil, "", fmt.Errorf("快递100 查询失败: returnCode=%s status=%s message=%s",
			out.ReturnCode, out.Status, out.Message)
	}

	// 快递100 的 data 是**倒序**（最新在最前），本平台的轨迹按**正序**存
	// （前端取最后一条作为最新），所以这里反转。
	traces := make([]TrackPoint, 0, len(out.Data))
	for i := len(out.Data) - 1; i >= 0; i-- {
		d := out.Data[i]
		traces = append(traces, TrackPoint{At: parseKuaidi100Time(d.Time), Text: d.Context})
	}

	state := kuaidi100StateMap[out.State]
	return traces, state, nil
}

// sign 快递100 的签名：MD5(param + key + customer)，**大写**十六进制。
//
// ⚠️ 顺序是 param→key→customer，不是常见的 key 在最后；写反会一直报「签名校验失败」。
func (t *Kuaidi100Tracker) sign(param string) string {
	sum := md5.Sum([]byte(param + t.cfg.Key + t.cfg.Customer))
	return strings.ToUpper(hex.EncodeToString(sum[:]))
}

func kuaidi100OK(r *kuaidi100Resp) bool {
	// 成功时 status 为 "200"；部分版本不返回 returnCode，故以 status 为主
	return r.Status == "200"
}

// parseKuaidi100Time 解析 "2006-01-02 15:04:05"；失败时用零值并在 Text 里保留原文，
// 避免一条轨迹解析失败就把整次刷新判为失败（轨迹丢了比时间不准更糟）。
func parseKuaidi100Time(s string) time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Now()
	}
	for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02 15:04", "2006-01-02"} {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			return t
		}
	}
	return time.Now()
}
