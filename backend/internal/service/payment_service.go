// File Name: payment_service.go
// Created Time: 2026-09-22 19:26:34
// Update Time: 2026-09-28 08:10:00


package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/internal/repository"
	"rental-platform/internal/service/payment"
	"rental-platform/pkg/errs"
)

type PaymentService struct {
	db        *sqlx.DB
	registry  *payment.Registry
	orderSvc  *OrderService
	orderRepo *repository.OrderRepo
	payRepo   *repository.PaymentRepo
	userRepo  *repository.AppUserRepo
}

func NewPaymentService(db *sqlx.DB, registry *payment.Registry, orderSvc *OrderService) *PaymentService {
	return &PaymentService{
		db:        db,
		registry:  registry,
		orderSvc:  orderSvc,
		orderRepo: repository.NewOrderRepo(db),
		payRepo:   repository.NewPaymentRepo(db),
		userRepo:  repository.NewAppUserRepo(db),
	}
}

// payerOf 取用户在渠道侧的标识（微信 openid / 支付宝 user_id）。
//
// 微信 JSAPI 下单**必须**带 openid，而 `order` 表只存本平台 user_id，
// 所以每次发起支付都要回查 `app_user.open_id`。
func (s *PaymentService) payerOf(ctx context.Context, userID int64) (string, error) {
	u, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		if errors.Is(err, errs.ErrNotFound) {
			return "", fmt.Errorf("%w: 用户不存在，无法发起支付", errs.ErrInvalidArgument)
		}
		return "", err
	}
	if u.OpenID == "" {
		return "", fmt.Errorf("%w: 该用户缺少渠道标识（openid），无法发起支付", errs.ErrInvalidArgument)
	}
	return u.OpenID, nil
}

// Create 为用户订单创建支付。返回渠道参数给前端调起支付。
func (s *PaymentService) Create(
	ctx context.Context, merchantID, orderID, userID int64, channel string,
) (*payment.CreateResult, error) {
	provider, ok := s.registry.Get(channel)
	if !ok {
		return nil, fmt.Errorf("%w: 不支持的支付渠道", errs.ErrInvalidArgument)
	}

	o, err := s.orderRepo.GetByID(ctx, merchantID, orderID)
	if err != nil {
		return nil, err
	}
	if o.UserID != userID {
		return nil, errs.ErrForbidden
	}
	if o.Status != model.OrderStatusPending {
		return nil, fmt.Errorf("%w: 订单当前不可支付", errs.ErrInvalidState)
	}

	payer, err := s.payerOf(ctx, o.UserID)
	if err != nil {
		return nil, err
	}

	// 创建 pending 支付流水
	p := &model.Payment{
		MerchantID:  merchantID,
		OrderID:     o.ID,
		Channel:     channel,
		AmountCents: payment.TotalCents(o),
		Status:      model.PayStatusPending,
	}
	if err := s.payRepo.Create(ctx, p); err != nil {
		return nil, err
	}

	res, err := provider.Create(ctx, payment.CreateContext{Order: o, Payer: payer})
	if err != nil {
		return nil, err
	}
	return res, nil
}

// HandleCallback 处理渠道回调。必须幂等。
//
// ⚠️ 回调报文里**没有**本平台的自增订单 ID —— 渠道只回带商户订单号
// （微信 `out_trade_no` / 支付宝 `out_trade_no`），所以要先按订单号反查。
func (s *PaymentService) HandleCallback(
	ctx context.Context, channel string, headers map[string]string, body []byte,
) error {
	provider, ok := s.registry.Get(channel)
	if !ok {
		return fmt.Errorf("%w: 未知支付渠道", errs.ErrInvalidArgument)
	}

	result, err := provider.ParseCallback(ctx, headers, body)
	if err != nil {
		return fmt.Errorf("parse callback: %w", err)
	}
	if !result.Success {
		return fmt.Errorf("%w: 支付未成功", errs.ErrInvalidArgument)
	}

	// ── 反查订单 ──────────────────────────────────────────────────────
	// Mock/测试渠道可直接给出 OrderID；真实渠道只能给出 OrderNo。
	var o *model.Order
	if result.OrderID > 0 {
		o, err = s.orderRepo.GetByIDUnscoped(ctx, result.OrderID)
	} else {
		if result.OrderNo == "" {
			return fmt.Errorf("%w: 回调缺少订单号", errs.ErrInvalidArgument)
		}
		o, err = s.orderRepo.GetByNo(ctx, result.OrderNo)
	}
	if err != nil {
		return fmt.Errorf("resolve order (id=%d no=%s): %w", result.OrderID, result.OrderNo, err)
	}
	result.OrderID = o.ID

	// ── 金额校验（防篡改）──────────────────────────────────────────────
	// 回调由渠道签名保护，但仍要核对金额与订单应付额一致：
	// 金额不符说明渠道侧订单被改过（或被重放），绝不能入账。
	expected := payment.TotalCents(o)
	if result.AmountCents > 0 && result.AmountCents != expected {
		return fmt.Errorf(
			"%w: 回调金额与订单不符（期望 %d 分，实际 %d 分）",
			errs.ErrInvalidArgument, expected, result.AmountCents,
		)
	}

	// ── 幂等：同渠道同交易号只入账一次 ────────────────────────────────
	if _, err := s.payRepo.GetByChannelTxn(ctx, channel, result.TransactionID); err == nil {
		return nil
	} else if !errors.Is(err, errs.ErrNotFound) {
		return err
	}

	if err := WithTx(ctx, s.db, func(ctx context.Context) error {
		tx := TxFrom(ctx)
		payRepo := s.payRepo.WithTx(tx)

		p, err := payRepo.GetByOrderID(ctx, result.OrderID)
		if err != nil {
			return err
		}
		if p.Status == model.PayStatusSuccess {
			return nil
		}

		// result.Raw 已是 json.RawMessage（合法 JSON 字节），直接落库
		return payRepo.MarkSuccess(ctx, p.ID, result.TransactionID, result.Raw)
	}); err != nil {
		return err
	}

	// ── 支付成功后推进订单状态 pending → paid ──────────────────────────
	//
	// ⚠️ 这一步**不能省**：此前回调只把 payment 标成 success，
	// 订单状态一直停在 pending —— 表现为「用户付了钱、订单还是待支付」，
	// 这是本地把支付链路接起来后才暴露出来的缺口。
	//
	// 放在事务外：`Transition` 内部自己会开事务（见 OrderService.Transition），
	// 强嵌套既无收益又加大死锁面。
	if o.Status == model.OrderStatusPending {
		if _, err := s.orderSvc.Transition(
			ctx, o.MerchantID, o.ID, model.OrderStatusPaid,
		); err != nil {
			// ⚠️ **不回滚**已入账的流水：钱已经到账，
			// 回滚会造成「钱收了但流水没记」，比状态滞后更糟。
			// 打日志并上抛，交由人工或补偿任务处理。
			log.Printf("[pay] ⚠️ 订单 %s 支付流水已入账，但状态流转失败: %v", o.No, err)
			return fmt.Errorf("transition order to paid: %w", err)
		}
		log.Printf("[pay] 订单 %s 支付成功，状态已推进为 paid", o.No)
	}
	return nil
}

// ConfirmPaid 供 webhook 处理完后调用
func (s *PaymentService) ConfirmPaid(ctx context.Context, merchantID, orderID int64) error {
	_, err := s.orderSvc.Transition(ctx, merchantID, orderID, model.OrderStatusPaid)
	return err
}

// Refund 发起押金退款（成功后标记流水 refunded）
func (s *PaymentService) Refund(ctx context.Context, merchantID, orderID int64, reason string) error {
	o, err := s.orderRepo.GetByID(ctx, merchantID, orderID)
	if err != nil {
		return err
	}
	if o.DepStatus != model.DepStatusPaid {
		return fmt.Errorf("%w: 押金未收取", errs.ErrInvalidState)
	}

	p, err := s.payRepo.GetByOrderID(ctx, orderID)
	if err != nil {
		return err
	}
	provider, ok := s.registry.Get(p.Channel)
	if !ok {
		return fmt.Errorf("%w: 支付渠道已失效", errs.ErrInvalidArgument)
	}

	// ⚠️ 必须传渠道交易号：微信 v3 退款用 `transaction_id` 定位原交易，
	// 它由支付成功回调时写入 payment.transaction_id。
	if err := provider.Refund(ctx, o, p.TransactionID, o.DepositCents, reason); err != nil {
		return err
	}

	return WithTx(ctx, s.db, func(ctx context.Context) error {
		tx := TxFrom(ctx)
		if err := s.payRepo.WithTx(tx).MarkRefunded(ctx, orderID); err != nil {
			return err
		}
		// 复用 orderSvc.RefundDeposit 会再开事务，这里简化直接改
		return s.orderRepo.WithTx(tx).UpdateStatus(ctx, merchantID, orderID, o.Status, model.DepStatusRefunded)
	})
}

var _ = time.Now
