// File Name: tx.go
// Created Time: 2026-09-22 19:06:33
// Update Time: 2026-09-22 19:06:33

package service

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"time"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/internal/repository"
	"rental-platform/pkg/errs"
)

type OrderService struct {
	db          *sqlx.DB
	inventory   *Inventory
	orderRepo   *repository.OrderRepo
	equipRepo   *repository.EquipmentRepo
	unitRepo    *repository.UnitRepo
	occRepo     *repository.OccupationRepo
	shipRepo    *repository.ShipmentRepo
	payRepo     *repository.PaymentRepo
	addressRepo *repository.AddressRepo
	// userRepo 用于取用户信用分（押金减免依据）
	userRepo *repository.AppUserRepo
	// credit 信用分来源；为 nil 时押金一律按全额（保守兜底）
	credit CreditScorer
}

func NewOrderService(db *sqlx.DB, credit CreditScorer) *OrderService {
	return &OrderService{
		db:          db,
		inventory:   NewInventory(db),
		orderRepo:   repository.NewOrderRepo(db),
		equipRepo:   repository.NewEquipmentRepo(db),
		unitRepo:    repository.NewUnitRepo(db),
		occRepo:     repository.NewOccupationRepo(db),
		shipRepo:    repository.NewShipmentRepo(db),
		payRepo:     repository.NewPaymentRepo(db),
		addressRepo: repository.NewAddressRepo(db),
		userRepo:    repository.NewAppUserRepo(db),
		credit:      credit,
	}
}

type CreateOrderInput struct {
	MerchantID  int64
	UserID      int64
	EquipmentID int64
	StartAt     time.Time
	EndAt       time.Time
	// AddressID 收货地址。必填 —— 没有收货地址就没法发货。
	AddressID int64
}

// Create 创建订单。关键流程：
//  1. 校验设备存在、租期合法
//  2. 事务内：分配单元 → 创建订单 → 回填 unit_id
//  3. 分配失败返回 ErrNoAvailableUnit
func (s *OrderService) Create(ctx context.Context, in CreateOrderInput) (*model.Order, error) {
	if !in.EndAt.After(in.StartAt) {
		return nil, errs.ErrInvalidPeriod
	}

	eq, err := s.equipRepo.GetByID(ctx, in.MerchantID, in.EquipmentID)
	if err != nil {
		return nil, err
	}

	// 收货地址：必须是当前用户自己的地址（GetByID 的 WHERE 带 owner_user_id，
	// 拿了别人的 id 会直接 ErrNotFound），并在下单时把内容**快照**进订单。
	// 快照之后地址簿怎么改都不影响这张历史订单。
	if in.AddressID <= 0 {
		return nil, fmt.Errorf("%w: 请先选择收货地址", errs.ErrInvalidArgument)
	}
	addr, err := s.addressRepo.GetByID(ctx, in.UserID, in.AddressID)
	if err != nil {
		if errors.Is(err, errs.ErrNotFound) {
			return nil, fmt.Errorf("%w: 收货地址不存在，请重新选择", errs.ErrInvalidArgument)
		}
		return nil, err
	}

	days := int(in.EndAt.Sub(in.StartAt).Hours()/24) + 1
	rentCents := eq.DailyCents * int64(days)

	// ── 押金按信用分减免 ──────────────────────────────────────────────
	// 规则：≥700 全免 / 650-699 半价 / 其余（含未授权）全额。
	//
	// ⚠️ 三个设计要点：
	//  1. 信用分**取快照**存进订单 —— 用户之后分数变化，不应改变历史订单的押金依据。
	//  2. 取不到有效信用分（未授权/已过期）时走**全额** —— 保守方向不能反，
	//     绝不能因为「拿不到分数」就默认给优惠。
	//  3. 原押金也要存（`DepositOriginalCents`），前端才能展示「原价 → 实付」。
	user, err := s.userRepo.GetByID(ctx, in.UserID)
	if err != nil {
		// 订单有 user_id 外键，用户必定存在；查不到说明数据异常，直接失败更安全
		return nil, fmt.Errorf("load user for credit: %w", err)
	}
	var creditScore int
	var creditOK bool
	if s.credit != nil {
		creditScore, creditOK = s.credit.Score(ctx, user)
	}
	depositCents, depositTier := DepositFor(eq.DepositCents, creditScore, creditOK)

	var order *model.Order

	// PickUnit 与 Occupy 之间存在竞态：并发下单可能选中同一单元，
	// 此时 Occupie 会命中排他约束并让整个事务回滚。重试若干次即可。
	const maxAttempts = 5
	for attempt := 0; attempt < maxAttempts; attempt++ {
		order = nil
		err = WithTx(ctx, s.db, func(ctx context.Context) error {
			tx := TxFrom(ctx)

			// 顺序很关键：order.unit_id 与 equipment_unit_occupation.order_id
			// 都是 NOT NULL 外键，互相依赖，只能：
			//   1) 先挑好单元
			//   2) 建订单（unit_id 填真实值，满足 FK）
			//   3) 再写占用记录（order_id 此时已存在，满足 FK）
			unitID, err := s.inventory.PickUnit(ctx, in.EquipmentID, in.StartAt, in.EndAt)
			if err != nil {
				return err
			}

			o := &model.Order{
				MerchantID:   in.MerchantID,
				No:           genOrderNo(time.Now()),
				UserID:       in.UserID,
				EquipmentID:  in.EquipmentID,
				UnitID:       unitID,
				StartAt:      dateOnly(in.StartAt),
				EndAt:        dateOnly(in.EndAt),
				Days:         days,
				RentCents:    rentCents,
				// 实收押金（已按信用分减免）+ 原押金 + 档位 + 分数快照
				DepositCents:         depositCents,
				DepositOriginalCents: eq.DepositCents,
				DepositTier:          depositTier,
				CreditScore:          creditScore,
				Status:               model.OrderStatusPending,
				DepStatus:            model.DepStatusUnpaid,
				// 收货信息快照
				Receiver: addr.Receiver,
				Phone:    addr.Phone,
				Address:  addr.FullAddress(),
			}

			orderRepo := s.orderRepo.WithTx(tx)
			if err := orderRepo.Create(ctx, o); err != nil {
				return err
			}

			// 落占用记录；若该单元被并发抢走，排他约束会拒绝，整个事务回滚
			if err := s.inventory.Occupy(ctx, unitID, o.ID, in.StartAt, in.EndAt); err != nil {
				return err
			}

			order = o
			return nil
		})

		if errors.Is(err, errs.ErrNoAvailableUnit) {
			continue // 选中单元被抢走，重试
		}
		break
	}

	if err != nil {
		return nil, err
	}
	return order, nil
}

// Transition 状态流转的唯一入口。所有 handler 改状态必须走这里。
func (s *OrderService) Transition(
	ctx context.Context, merchantID, orderID int64, next string,
) (*model.Order, error) {
	var result *model.Order

	err := WithTx(ctx, s.db, func(ctx context.Context) error {
		tx := TxFrom(ctx)
		orderRepo := s.orderRepo.WithTx(tx)

		o, err := orderRepo.GetByIDForUpdate(ctx, merchantID, orderID)
		if err != nil {
			return err
		}

		if !model.CanTransition(o.Status, next) {
			return fmt.Errorf("%w: %s -> %s", errs.ErrInvalidState, o.Status, next)
		}

		newDepStatus := o.DepStatus
		switch next {
		case model.OrderStatusPaid:
			if o.DepStatus == model.DepStatusUnpaid {
				newDepStatus = model.DepStatusPaid
			}
		case model.OrderStatusCancelled:
			// 取消订单：释放占用
			if err := s.inventory.Release(ctx, o.ID); err != nil {
				return err
			}
		}

		if err := orderRepo.UpdateStatus(ctx, merchantID, o.ID, next, newDepStatus); err != nil {
			return err
		}

		o.Status = next
		o.DepStatus = newDepStatus
		result = o
		return nil
	})

	if err != nil {
		return nil, err
	}
	return result, nil
}

// RefundDeposit 退还押金。仅 dep_status=paid 时可操作。
func (s *OrderService) RefundDeposit(ctx context.Context, merchantID, orderID int64) error {
	return WithTx(ctx, s.db, func(ctx context.Context) error {
		tx := TxFrom(ctx)
		orderRepo := s.orderRepo.WithTx(tx)

		o, err := orderRepo.GetByIDForUpdate(ctx, merchantID, orderID)
		if err != nil {
			return err
		}
		if o.DepStatus != model.DepStatusPaid {
			return fmt.Errorf("%w: deposit not in paid state", errs.ErrInvalidState)
		}
		if err := orderRepo.UpdateStatus(ctx, merchantID, o.ID, o.Status, model.DepStatusRefunded); err != nil {
			return err
		}
		return s.payRepo.WithTx(tx).MarkRefunded(ctx, o.ID)
	})
}

// Get 详情
func (s *OrderService) Get(ctx context.Context, merchantID, orderID int64) (*model.Order, error) {
	return s.orderRepo.GetByID(ctx, merchantID, orderID)
}

// List 列表
func (s *OrderService) List(ctx context.Context, merchantID int64, f repository.OrderFilter) ([]model.Order, error) {
	return s.orderRepo.List(ctx, merchantID, f)
}

// CancelExpiredPending 定时任务调用：取消超时未支付订单
func (s *OrderService) CancelExpiredPending(ctx context.Context, before time.Time) (int, error) {
	list, err := s.orderRepo.ListExpiredPending(ctx, before)
	if err != nil {
		return 0, err
	}
	n := 0
	for i := range list {
		if _, err := s.Transition(ctx, list[i].MerchantID, list[i].ID, model.OrderStatusCancelled); err != nil {
			if errors.Is(err, errs.ErrInvalidState) {
				continue // 已被别的路径改状态，跳过
			}
			return n, err
		}
		n++
	}
	return n, nil
}

// ---------- 内部工具 ----------

func genOrderNo(now time.Time) string {
	return fmt.Sprintf("R%s%04d", now.Format("20060102150405"), rand.Intn(10000))
}

func dateOnly(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}
