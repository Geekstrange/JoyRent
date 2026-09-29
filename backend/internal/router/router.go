// File Name: router.go
// Created Time: 2026-09-22 19:20:19
// Update Time: 2026-09-22 19:20:19

package router

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"github.com/robfig/cron/v3"

	"rental-platform/internal/config"
	"rental-platform/internal/handler"
	"rental-platform/internal/job"
	"rental-platform/internal/middleware"
	"rental-platform/internal/service"
	"rental-platform/internal/service/payment"
	"rental-platform/pkg/jwtutil"
	"rental-platform/pkg/response"
)

func New(cfg *config.Config, db *sqlx.DB) (*gin.Engine, func(), error) {
	jwtMgr := jwtutil.NewManager(cfg.JWT.Secret, cfg.JWTExpire())

	storage, err := service.NewStorage(cfg.Storage)
	if err != nil {
		return nil, nil, fmt.Errorf("init storage: %w", err)
	}

	// ---------- 支付渠道 ----------
	//
	// ⚠️ 装配采用**三态**，不要退回「只看 app_id 非空就注册真实渠道」的写法：
	//   · 必填项全齐   → 注册真实 provider
	//   · 一个都没填   → 注册 Mock（本地开发常态），并打醒目日志
	//   · 只填了一部分 → **直接报错**，绝不静默降级
	// 静默降级的后果：线上填漏一个字段（比如只填了 app_id + mch_id 没填 api_v3_key），
	// 服务照常启动、下单返回 200，但参数是 Mock 伪造的 —— 用户点支付永远失败，
	// 而排查时看不出任何异常（这正是本项目此前的状态）。
	payRegistry := payment.NewRegistry()

	switch {
	case payment.WechatPayConfigured(cfg.Payment.Wechat):
		wp, err := payment.NewWechatProvider(cfg.Payment.Wechat)
		if err != nil {
			return nil, nil, fmt.Errorf("init wechat pay: %w", err)
		}
		payRegistry.Register(wp)
		log.Printf("[pay] 微信支付：已启用真实渠道（mch_id=%s）", cfg.Payment.Wechat.MchID)

	case payment.WechatPayUntouched(cfg.Payment.Wechat):
		payRegistry.Register(payment.NewMockProvider("wechat"))
		log.Printf("[pay] ⚠️ 微信支付：未配置，使用 Mock 渠道（仅供本地联调，不会真实扣款）")

	default:
		return nil, nil, fmt.Errorf(
			"微信支付配置不完整，缺少 %v；请补齐后重启，或将 [payment.wechat] 全部留空以使用 Mock 渠道",
			payment.WechatPayMissing(cfg.Payment.Wechat),
		)
	}

	switch {
	case payment.AlipayConfigured(cfg.Payment.Alipay):
		ap, err := payment.NewAlipayProvider(cfg.Payment.Alipay)
		if err != nil {
			return nil, nil, fmt.Errorf("init alipay: %w", err)
		}
		payRegistry.Register(ap)
		log.Printf("[pay] 支付宝：已启用真实渠道（app_id=%s sandbox=%v）",
			cfg.Payment.Alipay.AppID, cfg.Payment.Alipay.Sandbox)

	case payment.AlipayUntouched(cfg.Payment.Alipay):
		payRegistry.Register(payment.NewMockProvider("alipay"))
		log.Printf("[pay] ⚠️ 支付宝：未配置，使用 Mock 渠道（仅供本地联调，不会真实扣款）")

	default:
		return nil, nil, fmt.Errorf(
			"支付宝配置不完整，缺少 %v；请补齐后重启，或将 [payment.alipay] 全部留空以使用 Mock 渠道",
			payment.AlipayMissing(cfg.Payment.Alipay),
		)
	}

	// ---------- 信用分（押金减免依据）----------
	//
	// ⚠️ 真实芝麻信用（`zhima.credit.score.get`）需要**企业实名认证 + 签约芝麻免押产品**，
	// 且该产品目前是**邀约制、不支持自助接入** → 本地不可能拿到真实分数。
	// 所以未配置 `credit_service_id` 时使用**本地模拟实现**（按用户标识稳定生成 600~800），
	// 使「授权 → 算押金 → 下单 → 支付」全链路可以在本地完整跑通与验证。
	var creditScorer service.CreditScorer
	if cfg.Payment.Alipay.CreditServiceID != "" {
		creditScorer = service.NewZhimaCreditScorer(
			cfg.Payment.Alipay.AppID, cfg.Payment.Alipay.CreditServiceID,
		)
		log.Printf("[credit] 芝麻信用：已配置 service_id=%s（provider 仍为占位，调用会明确报错）",
			cfg.Payment.Alipay.CreditServiceID)
	} else {
		// 非 release 模式允许请求里指定 mock 分数，便于测试各押金档位边界；
		// release 下关闭 —— 否则等于把押金交给用户自己报分。
		creditScorer = service.NewLocalCreditScorer(600, 800, cfg.Server.Mode != "release")
		log.Printf("[credit] ⚠️ 信用分：使用**本地模拟**实现（区间 600~800，按用户稳定生成）；" +
			"真实芝麻信用需企业签约「芝麻免押」后配置 [payment.alipay].credit_service_id")
	}

	// ---------- 物流轨迹查询（三态）----------
	//
	// 与支付、信用分同一套规则：
	//   · provider + customer + key 齐全 → 启用真实查询
	//   · 全部留空                       → tracker 为 nil，轨迹由管理员手动录入
	//   · 只填一部分                     → 启动直接报错
	//
	// ⚠️ 未启用时**不影响**运单登记 / 状态流转 / 轨迹查询，
	//    只是无法自动从快递公司拉取（刷新接口会返回明确提示）。
	var tracker service.ExpressTracker
	switch {
	case cfg.Logistics.Provider == "" && cfg.Logistics.Customer == "" && cfg.Logistics.Key == "":
		log.Printf("[logistics] ⚠️ 物流轨迹：未配置，不启用自动查询（轨迹由管理员手动录入）")

	case cfg.Logistics.Provider != "" && cfg.Logistics.Customer != "" && cfg.Logistics.Key != "":
		switch strings.ToLower(cfg.Logistics.Provider) {
		case "kuaidi100":
			tracker = service.NewKuaidi100Tracker(cfg.Logistics)
			log.Printf("[logistics] 快递100：已启用自动轨迹查询（customer=%s）", cfg.Logistics.Customer)
		default:
			return nil, nil, fmt.Errorf("不支持的物流查询服务商: %s（目前仅支持 kuaidi100）",
				cfg.Logistics.Provider)
		}

	default:
		var missing []string
		if cfg.Logistics.Provider == "" {
			missing = append(missing, "provider")
		}
		if cfg.Logistics.Customer == "" {
			missing = append(missing, "customer")
		}
		if cfg.Logistics.Key == "" {
			missing = append(missing, "key")
		}
		return nil, nil, fmt.Errorf(
			"物流查询配置不完整，缺少 %v；请补齐后重启，或将 [logistics] 全部留空以停用自动查询",
			missing)
	}

	// ---------- 登录客户端 ----------
	wechatClient := service.NewWechatMiniClient(
		cfg.Payment.Wechat.AppID,
		cfg.Payment.Wechat.AppSecret,
	)
	alipayClient := service.NewAlipayMiniClient(cfg.Payment.Alipay)

	// ---------- service ----------
	authSvc := service.NewAuthService(db, jwtMgr, wechatClient, alipayClient)
	catSvc := service.NewCategoryService(db)
	eqSvc := service.NewEquipmentService(db)
	orderSvc := service.NewOrderService(db, creditScorer)
	invSvc := service.NewInvoiceService(db)
	shipSvc := service.NewShipmentService(db, tracker)
	paySvc := service.NewPaymentService(db, payRegistry, orderSvc)
	// ⚠️ 社区版（CE）**不含商家入驻**：NewMerchantService 已移除。
	// ⚠️ 但 `merchant` 表与迁移**保留** —— `"order".merchant_id` 有指向它的外键，
	//    且 handler/helpers.go 仍使用 `model.DefaultMerchantID`（平台自营商户）。
	userSvc := service.NewUserService(db)
	addressSvc := service.NewAddressService(db)
	creditSvc := service.NewCreditService(db, creditScorer)

	// ---------- handler ----------
	authH := handler.NewAuthHandler(authSvc)
	catH := handler.NewCategoryHandler(catSvc)
	eqH := handler.NewEquipmentHandler(eqSvc)
	orderH := handler.NewOrderHandler(orderSvc)
	invH := handler.NewInvoiceHandler(invSvc)
	shipH := handler.NewShipmentHandler(shipSvc)
	uploadH := handler.NewUploadHandler(storage)
	payH := handler.NewPayHandler(paySvc)
	// 社区版：NewMerchantHandler 已移除（见上方说明）
	addrH := handler.NewAddressHandler(addressSvc)
	userH := handler.NewUserHandler(userSvc)
	creditH := handler.NewCreditHandler(creditSvc)

	// ---------- gin ----------
	r := gin.New()
	r.Use(middleware.Recovery(), middleware.Logger())
	r.Use(cors.New(cors.Config{
		AllowOriginFunc:  func(string) bool { return true },
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))
	r.MaxMultipartMemory = int64(cfg.Storage.MaxUploadMB) << 20

	r.Static(cfg.Storage.BaseURL, cfg.Storage.Dir)
	r.GET("/health", func(c *gin.Context) { response.OK(c, gin.H{"status": "ok"}) })

	v1 := r.Group("/api/v1")
	v1.POST("/pay/callback/:channel", payH.Callback)

	// 管理端
	adminPub := v1.Group("/admin")
	adminPub.POST("/login", authH.AdminLogin)

	admin := v1.Group("/admin")
	admin.Use(middleware.Auth(jwtMgr), middleware.RequireAdmin())
	{
		admin.POST("/password", authH.AdminChangePassword)

		admin.GET("/categories", catH.List)
		admin.POST("/categories", catH.Create)
		admin.PUT("/categories/:id", catH.Update)
		admin.DELETE("/categories/:id", catH.Delete)

		admin.GET("/equipments", eqH.List)
		admin.POST("/equipments", eqH.Create)
		admin.GET("/equipments/:id", eqH.Get)
		admin.PUT("/equipments/:id", eqH.Update)
		admin.DELETE("/equipments/:id", eqH.Delete)
		admin.GET("/equipments/:id/units", eqH.ListUnits)
		admin.POST("/equipments/:id/units/generate", eqH.GenerateUnits)
		admin.PUT("/units/:unit_id/status", eqH.UpdateUnitStatus)
		admin.GET("/equipments/:id/availability", eqH.Availability)

		admin.GET("/orders", orderH.ListAdmin)
		admin.GET("/orders/:id", orderH.GetAdmin)
		admin.POST("/orders/:id/transition", orderH.Transition)
		admin.POST("/orders/:id/refund-deposit", orderH.RefundDeposit)

		admin.GET("/orders/:id/shipment", shipH.GetByOrder)
		admin.POST("/orders/:id/shipment", shipH.Upsert)
		admin.POST("/orders/:id/shipment/status", shipH.SetStatus)
		// 从第三方拉取最新轨迹（未启用自动查询时会返回明确错误）
		admin.POST("/orders/:id/shipment/refresh", shipH.Refresh)

		admin.GET("/invoices", invH.ListAdmin)
		admin.GET("/invoices/stats", invH.Stats)
		admin.GET("/invoices/:id", invH.GetAdmin)
		admin.POST("/invoices/:id/issue", invH.Issue)
		admin.POST("/invoices/:id/reject", invH.Reject)

		// 社区版：管理端商家入驻审核接口已移除
		// （原 `GET /merchants`、`POST /merchants/:id/review`）

		admin.GET("/users", userH.ListAdmin)
		admin.POST("/users/:id/toggle-status", userH.ToggleStatus)

		admin.POST("/upload", uploadH.Upload)
	}

	// 用户端
	appAuth := v1.Group("/app/auth")
	appAuth.POST("/wechat", authH.WechatLogin)
	appAuth.POST("/alipay", authH.AlipayLogin)

	// 测试态登录旁路：跳过微信/支付宝 code 换取，供本地联调与冒烟测试使用。
	// 仅在 allow_dev_login=true 且 server.mode != release 时注册，未开启时该路径不存在。
	if cfg.DevLoginEnabled() {
		appAuth.POST("/dev-login", authH.DevLogin)
	}

	// 用户端部分接口不需要登录，单独开组
	appPub := v1.Group("/app")
	{
		appPub.GET("/equipments", eqH.List)
		appPub.GET("/equipments/:id", eqH.Get)
		appPub.GET("/equipments/:id/availability", eqH.AvailabilityForPeriod)
		appPub.GET("/equipments/categories", catH.List)
	}

	app := v1.Group("/app")
	app.Use(middleware.Auth(jwtMgr), middleware.RequireUser())
	{
		app.GET("/me", authH.Me)

		app.GET("/orders", orderH.ListMine)
		app.POST("/orders", orderH.Create)
		app.GET("/orders/:id", orderH.GetMine)
		app.GET("/orders/:id/shipment", shipH.GetByOrder)
		app.POST("/orders/:id/pay", payH.Create)

		app.GET("/invoices", invH.ListMine)
		app.POST("/invoices", invH.Apply)
		app.GET("/invoices/:id", invH.GetMine)

		// 社区版：用户端商家入驻接口已移除
		// （原 `POST /merchants/apply`、`GET /merchants/mine`）

		// 收货地址簿。⚠️ `/addresses/default` 必须注册在 `/addresses/:id` 之前：
		// Gin 的路由树不允许同一层级同时存在静态段与参数段，顺序反了会直接 panic。
		app.GET("/addresses", addrH.List)
		app.POST("/addresses", addrH.Create)
		app.GET("/addresses/default", addrH.Default)
		app.GET("/addresses/:id", addrH.Get)
		app.PUT("/addresses/:id", addrH.Update)
		app.DELETE("/addresses/:id", addrH.Delete)
		app.POST("/addresses/:id/default", addrH.SetDefault)

		// 信用分（押金减免依据）。
		// `/credit/authorize` 是写操作（会落库分数），`/credit` 只读。
		app.GET("/credit", creditH.Status)
		app.POST("/credit/authorize", creditH.Authorize)
	}

	// ---------- 定时任务 ----------
	j := job.NewJobs(orderSvc)
	c := cron.New(cron.WithSeconds())
	_, _ = c.AddFunc("0 */5 * * * *", j.CancelExpiredPending)
	c.Start()

	cleanup := func() {
		ctx := c.Stop()
		select {
		case <-ctx.Done():
		case <-time.After(5 * time.Second):
		}
	}
	return r, cleanup, nil
}
