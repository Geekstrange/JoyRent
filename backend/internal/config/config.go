// File Name: config.go
// Created Time: 2026-09-22 18:51:06
// Update Time: 2026-09-23 00:00:00

package config

import (
	"fmt"
	"os"
	"time"

	"github.com/pelletier/go-toml/v2"
)

type Config struct {
	Server    ServerConfig    `toml:"server"`
	DB        DBConfig        `toml:"db"`
	JWT       JWTConfig       `toml:"jwt"`
	Storage   StorageConfig   `toml:"storage"`
	Payment   PaymentConfig   `toml:"payment"`
	Logistics LogisticsConfig `toml:"logistics"`
}

type ServerConfig struct {
	Addr string `toml:"addr"`
	Mode string `toml:"mode"`
	// AllowDevLogin 开启测试态登录旁路（POST /app/auth/dev-login）。
	// 仅应在本地/联调环境开启；release 模式下即使置 true 也会被忽略。
	AllowDevLogin bool `toml:"allow_dev_login"`
}

type DBConfig struct {
	DSN             string `toml:"dsn"`
	MaxOpen         int    `toml:"max_open"`
	MaxIdle         int    `toml:"max_idle"`
	ConnMaxLifetime string `toml:"conn_max_lifetime"`
}

type JWTConfig struct {
	Secret string `toml:"secret"`
	Expire string `toml:"expire"`
}

type StorageConfig struct {
	Type        string `toml:"type"` // 目前仅 "local"
	Dir         string `toml:"dir"`
	BaseURL     string `toml:"base_url"`
	MaxUploadMB int    `toml:"max_upload_mb"`
}

type PaymentConfig struct {
	Wechat WechatPayConfig `toml:"wechat"`
	Alipay AlipayConfig    `toml:"alipay"`
}

// LogisticsConfig 物流轨迹查询（第三方）。
//
// ⚠️ 与支付/信用分一样采用**三态装配**：
//   · provider + customer + key 齐全 → 启用真实查询
//   · 全部留空                       → 不启用，轨迹由管理员手动录入
//   · 只填一部分                     → 启动直接报错（避免「以为接好了、实际没生效」）
//
// 不启用时本平台的运单登记 / 状态流转 / 轨迹查询**照常可用**，
// 只是轨迹不会自动从快递公司拉取。
type LogisticsConfig struct {
	// Provider 查询服务商。目前支持 "kuaidi100"（快递100）；留空表示不启用自动查询。
	Provider string `toml:"provider"`
	// Customer 快递100 的 customer（授权码）
	Customer string `toml:"customer"`
	// Key 快递100 的 key（用于生成请求签名）
	Key string `toml:"key"`
}

type WechatPayConfig struct {
	AppID          string `toml:"app_id"`
	AppSecret      string `toml:"app_secret"` // 小程序 AppSecret，用于 code2session
	MchID          string `toml:"mch_id"`
	APIV3Key       string `toml:"api_v3_key"`
	PrivateKeyPath string `toml:"private_key_path"`
	CertSerialNo   string `toml:"cert_serial_no"`
	NotifyURL      string `toml:"notify_url"`
}

type AlipayConfig struct {
	AppID           string `toml:"app_id"`
	PrivateKey      string `toml:"private_key"`       // 应用私钥（PKCS8，单行或 PEM）
	AlipayPublicKey string `toml:"alipay_public_key"` // 支付宝公钥，用于**回调验签**
	NotifyURL       string `toml:"notify_url"`
	// Sandbox 是否走沙箱网关（openapi.alipaydev.com）。
	// 沙箱可在没有正式商户资质时联调；**上线必须为 false**。
	Sandbox bool `toml:"sandbox"`
	// CreditServiceID 芝麻信用服务 ID（`service_id`）。
	// ⚠️ 芝麻免押产品为**邀约制**，需企业实名认证 + 签约后才能拿到；
	// 未配置时信用分走本地模拟实现（见 service.LocalCreditScorer）。
	CreditServiceID string `toml:"credit_service_id"`
}

func Load(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}
	var cfg Config
	if err := toml.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (c *Config) validate() error {
	if c.Server.Addr == "" {
		return fmt.Errorf("server.addr is required")
	}
	if c.Server.Mode == "" {
		c.Server.Mode = "debug"
	}
	if c.DB.DSN == "" {
		return fmt.Errorf("db.dsn is required")
	}
	if c.DB.MaxOpen <= 0 {
		c.DB.MaxOpen = 25
	}
	if c.DB.MaxIdle <= 0 {
		c.DB.MaxIdle = 5
	}
	if c.JWT.Secret == "" {
		return fmt.Errorf("jwt.secret is required")
	}
	if c.JWT.Expire == "" {
		c.JWT.Expire = "168h"
	}
	if c.Storage.Type == "" {
		c.Storage.Type = "local"
	}
	if c.Storage.Type != "local" {
		return fmt.Errorf("storage.type %q not supported (only 'local')", c.Storage.Type)
	}
	if c.Storage.Dir == "" {
		return fmt.Errorf("storage.dir is required")
	}
	if c.Storage.BaseURL == "" {
		c.Storage.BaseURL = "/static"
	}
	if c.Storage.MaxUploadMB <= 0 {
		c.Storage.MaxUploadMB = 10
	}
	return nil
}

// DevLoginEnabled 测试态登录旁路是否可用。
// 双保险：必须显式开启 allow_dev_login，且 server.mode 不能是 release。
func (c *Config) DevLoginEnabled() bool {
	return c.Server.AllowDevLogin && c.Server.Mode != "release"
}

// JWTExpire 返回 JWT 有效期
func (c *Config) JWTExpire() time.Duration {
	d, err := time.ParseDuration(c.JWT.Expire)
	if err != nil || d <= 0 {
		return 168 * time.Hour
	}
	return d
}

// ConnMaxLifetime 返回数据库连接最大存活时间
func (c *Config) ConnMaxLifetime() time.Duration {
	d, err := time.ParseDuration(c.DB.ConnMaxLifetime)
	if err != nil || d <= 0 {
		return time.Hour
	}
	return d
}
