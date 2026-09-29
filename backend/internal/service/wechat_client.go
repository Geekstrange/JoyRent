// File Name: wechat_client.go
// Created Time: 2026-09-22 19:27:05
// Update Time: 2026-09-22 19:27:05


package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"rental-platform/internal/config"
)

// ErrWechatNotConfigured 表示未配置小程序 app_id / app_secret。
// 与「微信服务器返回错误」区分开：前者是本地配置缺失（应提示开发者），
// 后者是外部依赖故障（才是真正的 5xx）。
var ErrWechatNotConfigured = errors.New("wechat miniprogram not configured")

// WechatMiniClient 微信小程序登录换 openid / unionid
type WechatMiniClient struct {
	appID     string
	appSecret string
	httpCli   *http.Client
}

func NewWechatMiniClient(appID, appSecret string) *WechatMiniClient {
	return &WechatMiniClient{
		appID:     appID,
		appSecret: appSecret,
		httpCli:   &http.Client{Timeout: 5 * time.Second},
	}
}

type code2SessionResp struct {
	OpenID     string `json:"openid"`
	UnionID    string `json:"unionid"`
	SessionKey string `json:"session_key"`
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

func (c *WechatMiniClient) Code2Session(ctx context.Context, code string) (string, string, error) {
	if c.appID == "" || c.appSecret == "" {
		return "", "", ErrWechatNotConfigured
	}
	u := "https://api.weixin.qq.com/sns/jscode2session?" + url.Values{
		"appid":      {c.appID},
		"secret":     {c.appSecret},
		"js_code":    {code},
		"grant_type": {"authorization_code"},
	}.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", "", err
	}
	resp, err := c.httpCli.Do(req)
	if err != nil {
		return "", "", err
	}
	defer func() { _ = resp.Body.Close() }()

	var out code2SessionResp
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", "", err
	}
	if out.ErrCode != 0 {
		return "", "", fmt.Errorf("jscode2session errcode=%d msg=%s", out.ErrCode, out.ErrMsg)
	}
	return out.OpenID, out.UnionID, nil
}

var _ = config.Config{}
