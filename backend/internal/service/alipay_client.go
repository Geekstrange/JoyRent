// File Name: alipay_client.go
// Created Time: 2026-09-22 19:27:20
// Update Time: 2026-09-28 09:10:00


package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/smartwalle/alipay/v3"

	"rental-platform/internal/config"
	"rental-platform/pkg/errs"
)

// ErrAlipayNotConfigured 表示支付宝登录**能力或配置缺失**（未接 SDK / 缺 app_id / 缺私钥）。
//
// 与「支付宝服务器返回错误」区分开：前者应提示开发者并归为 400 参数错误，
// 后者才是外部依赖故障（真正的 5xx）。
// 与 ErrWechatNotConfigured 保持同一套语义 —— 两端行为必须一致，
// 否则前端无法用统一逻辑决定「是否回落到 dev-login 旁路」。
var ErrAlipayNotConfigured = errors.New("alipay miniprogram not configured")

// AlipayMiniClient 支付宝小程序登录：用 authCode 换 user_id。
//
// ── 登录链路 ──────────────────────────────────────────────────────────
// 前端 `my.getAuthCode({scopes:'auth_base'})` → 拿 authCode →
// 后端调 `alipay.system.oauth.token`（SDK 的 `SystemOauthToken`）→ 拿 `user_id`（2088 开头）。
//
// ⚠️ 这里的 `user_id` 同时是**支付时的 `buyer_id`**（见 payment.AlipayProvider），
// 所以登录拿到它必须落库到 `app_user.open_id`（支付宝侧我们存的就是 user_id）。
type AlipayMiniClient struct {
	appID string
	// client 为 nil 表示**未配置或初始化失败**，原因见 clientErr
	client    *alipay.Client
	clientErr error
}

// NewAlipayMiniClient 构造支付宝登录客户端。
//
// ⚠️ **构造本身不返回 error** —— 与微信侧 `NewWechatMiniClient` 保持同一套语义：
// 配置缺失时把错误挂在实例上，等真正调用时抛出。
// 这样 router 的装配代码不用为两端写两套分支，也让「未配置」不等于「启动失败」。
func NewAlipayMiniClient(cfg config.AlipayConfig) *AlipayMiniClient {
	c := &AlipayMiniClient{appID: cfg.AppID}

	var missing []string
	if strings.TrimSpace(cfg.AppID) == "" {
		missing = append(missing, "app_id")
	}
	if strings.TrimSpace(cfg.PrivateKey) == "" {
		missing = append(missing, "private_key")
	}
	if len(missing) > 0 {
		c.clientErr = fmt.Errorf("%w: 缺少 %v", ErrAlipayNotConfigured, missing)
		return c
	}

	// production = !Sandbox。沙箱网关用于没有正式商户资质时的联调，
	// 上线必须把 config 的 sandbox 置回 false。
	cli, err := alipay.New(cfg.AppID, cfg.PrivateKey, !cfg.Sandbox)
	if err != nil {
		c.clientErr = fmt.Errorf("init alipay client: %w", err)
		return c
	}

	// 载入支付宝公钥（**回调验签**必需）。
	// 为空时不阻断构造 —— 下单仍可走通，只有回调验签会失败，
	// 这样「只联调下单」的场景不必先配好公钥。
	if strings.TrimSpace(cfg.AlipayPublicKey) != "" {
		if err := cli.LoadAliPayPublicKey(cfg.AlipayPublicKey); err != nil {
			c.clientErr = fmt.Errorf("load alipay public key: %w", err)
			return c
		}
	}

	c.client = cli
	return c
}

// AuthCode2UserID 用 authCode 换 user_id。
func (c *AlipayMiniClient) AuthCode2UserID(ctx context.Context, code string) (string, error) {
	if c.clientErr != nil {
		return "", c.clientErr
	}
	if strings.TrimSpace(code) == "" {
		return "", fmt.Errorf("%w: authCode 不能为空", errs.ErrInvalidArgument)
	}

	rsp, err := c.client.SystemOauthToken(ctx, alipay.SystemOauthToken{
		GrantType: "authorization_code",
		Code:      code,
	})
	if err != nil {
		return "", fmt.Errorf("alipay system.oauth.token: %w", err)
	}
	// IsSuccess() = AccessToken != "" && UserId != ""
	if !rsp.IsSuccess() {
		// 把 code / sub_code 带出来 —— 支付宝的报错信息（如
		// `invalid-auth-code`、`isv.code-invalid`）是排查配置问题的主要线索
		return "", fmt.Errorf(
			"alipay oauth 失败: code=%v sub_code=%s sub_msg=%s",
			rsp.Code, rsp.SubCode, rsp.SubMsg,
		)
	}
	return rsp.UserId, nil
}
