// File Name: shipment.go
// Created Time: 2026-09-22 19:13:43
// Update Time: 2026-09-22 19:13:43

package service

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/internal/repository"
	"rental-platform/pkg/errs"
)

type ShipmentService struct {
	db        *sqlx.DB
	shipRepo  *repository.ShipmentRepo
	orderRepo *repository.OrderRepo
	// tracker 第三方轨迹查询来源；**为 nil 表示未启用自动查询**，
	// 此时轨迹只能由管理员手动录入（Upsert / SetStatus 照常可用）。
	tracker ExpressTracker
}

// NewShipmentService 构造。
//
// `tracker` 传 nil 即表示「不启用第三方自动查询」 —— 由 router 按
// `[logistics]` 配置决定传什么（见 router 的三态装配）。
func NewShipmentService(db *sqlx.DB, tracker ExpressTracker) *ShipmentService {
	return &ShipmentService{
		db:        db,
		shipRepo:  repository.NewShipmentRepo(db),
		orderRepo: repository.NewOrderRepo(db),
		tracker:   tracker,
	}
}

type ShipmentDetail struct {
	Shipment model.Shipment        `json:"shipment"`
	Traces   []model.ShipmentTrace `json:"traces"`
}

func (s *ShipmentService) GetByOrder(ctx context.Context, orderID int64) (*ShipmentDetail, error) {
	sp, err := s.shipRepo.GetByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	traces, err := s.shipRepo.ListTraces(ctx, sp.ID)
	if err != nil {
		return nil, err
	}
	return &ShipmentDetail{Shipment: *sp, Traces: traces}, nil
}

type UpsertShipmentInput struct {
	MerchantID int64
	OrderID    int64
	Express    string
	No         string
	Receiver   string
	Phone      string
	Address    string
}

// Upsert 登记 / 修改运单。新建时自动生成首条轨迹并置为 shipped。
func (s *ShipmentService) Upsert(ctx context.Context, in UpsertShipmentInput) (*model.Shipment, error) {
	if in.Express == "" {
		return nil, fmt.Errorf("%w: 快递公司不能为空", errs.ErrInvalidArgument)
	}
	if _, ok := model.ExpressCompanies[in.Express]; !ok {
		return nil, fmt.Errorf("%w: 不支持的快递公司", errs.ErrInvalidArgument)
	}
	if in.No == "" {
		return nil, fmt.Errorf("%w: 运单号不能为空", errs.ErrInvalidArgument)
	}
	order, err := s.orderRepo.GetByID(ctx, in.MerchantID, in.OrderID)
	if err != nil {
		return nil, err
	}

	// 收货信息缺省时回落到订单上的快照 —— 那是用户下单时选的地址，
	// 管理员发货通常不需要重填，留空即可直接沿用，减少一处重复录入与抄错的机会。
	receiver, phone, address := in.Receiver, in.Phone, in.Address
	if receiver == "" && phone == "" && address == "" {
		receiver, phone, address = order.Receiver, order.Phone, order.Address
	}

	var result *model.Shipment
	err = WithTx(ctx, s.db, func(ctx context.Context) error {
		tx := TxFrom(ctx)
		repo := s.shipRepo.WithTx(tx)

		existing, err := repo.GetByOrderID(ctx, in.OrderID)
		isNew := err == errs.ErrNotFound
		if err != nil && !isNew {
			return err
		}

		sp := &model.Shipment{
			MerchantID: in.MerchantID,
			OrderID:    in.OrderID,
			Express:    in.Express,
			No:         in.No,
			Receiver:   receiver,
			Phone:      phone,
			Address:    address,
		}
		if isNew {
			sp.Status = model.ShipStatusShipped
		} else {
			sp.Status = existing.Status
		}
		if err := repo.Upsert(ctx, sp); err != nil {
			return err
		}
		if isNew {
			now := time.Now()
			if err := repo.AddTrace(ctx, sp.ID, now, "【平台】快件已发货，等待揽收"); err != nil {
				return err
			}
		}
		result = sp
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// SetStatus 物流状态流转。校验 ShipFlow，写轨迹。
func (s *ShipmentService) SetStatus(ctx context.Context, merchantID, orderID int64, next, text string) error {
	return WithTx(ctx, s.db, func(ctx context.Context) error {
		tx := TxFrom(ctx)
		repo := s.shipRepo.WithTx(tx)

		sp, err := repo.GetByOrderID(ctx, orderID)
		if err != nil {
			return err
		}
		if sp.MerchantID != merchantID {
			return errs.ErrForbidden
		}
		if !model.CanShipTransition(sp.Status, next) {
			return fmt.Errorf("%w: %s -> %s", errs.ErrInvalidState, sp.Status, next)
		}
		if err := repo.UpdateStatus(ctx, merchantID, sp.ID, next); err != nil {
			return err
		}
		if text == "" {
			text = "【平台】物流状态更新为" + model.ShipStatusText[next]
		}
		return repo.AddTrace(ctx, sp.ID, time.Now(), text)
	})
}

// RefreshTraces 从第三方拉取最新轨迹 → 落库 → 按最新状态推进。
//
// 设计要点（都是踩过或推演过的坑）：
//
//  1. **未启用自动查询时返回明确错误，绝不静默成功** ——
//     否则管理员点了「刷新」以为拉到了，其实什么都没发生。
//
//  2. **同城自提（self）没有运单**，直接返回当前数据，不算错误。
//
//  3. **轨迹去重**：按「时间 + 文本」判断已存在则跳过 ——
//     否则每次刷新都会把历史轨迹重复插一遍，越刷越多。
//
//  4. **状态推进必须逐段走 ShipFlow**。第三方可能直接报「签收」，
//     而本地还在「运输中」，一步跳过去会被 `CanShipTransition` 拦住；
//     所以要沿流程逐段推进，中途任一段不允许就停在那里。
//
//  5. 第三方返回的「疑难」等状态映射为空串 → **保持现状**，等人工介入，
//     不靠猜测强行流转。
func (s *ShipmentService) RefreshTraces(
	ctx context.Context, merchantID, orderID int64,
) (*ShipmentDetail, error) {
	if s.tracker == nil {
		return nil, fmt.Errorf(
			"%w: 未启用物流自动查询，请在 [logistics] 配置 provider / customer / key",
			errs.ErrInvalidArgument,
		)
	}

	sp, err := s.shipRepo.GetByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if sp.MerchantID != merchantID {
		return nil, errs.ErrForbidden
	}
	// 同城自提没有运单号，查询无意义
	if sp.Express == "self" {
		return s.GetByOrder(ctx, orderID)
	}

	points, state, err := s.tracker.Track(ctx, sp.Express, sp.No)
	if err != nil {
		return nil, err
	}

	current := sp.Status
	err = WithTx(ctx, s.db, func(ctx context.Context) error {
		tx := TxFrom(ctx)
		repo := s.shipRepo.WithTx(tx)

		// ── 轨迹去重后落库 ──
		exist, err := repo.ListTraces(ctx, sp.ID)
		if err != nil {
			return err
		}
		seen := make(map[string]bool, len(exist))
		for _, e := range exist {
			seen[traceKey(e.TraceAt, e.Text)] = true
		}
		for _, p := range points {
			k := traceKey(p.At, p.Text)
			if seen[k] {
				continue
			}
			if err := repo.AddTrace(ctx, sp.ID, p.At, p.Text); err != nil {
				return err
			}
			seen[k] = true
		}

		// ── 沿 ShipFlow 逐段推进到目标状态 ──
		if state == "" || state == current {
			return nil
		}
		for _, next := range shipPathTo(current, state) {
			if !model.CanShipTransition(current, next) {
				break
			}
			if err := repo.UpdateStatus(ctx, merchantID, sp.ID, next); err != nil {
				return err
			}
			current = next
			if current == state {
				break
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return s.GetByOrder(ctx, orderID)
}

// shipPathTo 返回从 from 到 target 需要依次经过的状态（不含 from）。
//
// 依据 `model.ShipFlow` 的主干顺序；找不到路径时返回 nil（调用方会逐段校验，
// 校验不过就停住，不会越权流转）。
func shipPathTo(from, target string) []string {
	// 主干顺序（与 ShipFlow 一致；received 是平台侧终态，第三方不会返回）
	order := []string{
		model.ShipStatusNone,
		model.ShipStatusShipped,
		model.ShipStatusDelivering,
		model.ShipStatusSigned,
		model.ShipStatusReturning,
		model.ShipStatusReceived,
	}
	fi, ti := -1, -1
	for i, s := range order {
		if s == from {
			fi = i
		}
		if s == target {
			ti = i
		}
	}
	if fi < 0 || ti < 0 || ti <= fi {
		return nil
	}
	return order[fi+1 : ti+1]
}

// traceKey 轨迹去重键：时间**截断到秒** + 文本。
//
// ⚠️ 必须截断到秒：第三方返回的时间戳可能带亚秒差异（同一条轨迹两次拉取
//    毫秒不同），不归一的话每次刷新都会重复插入「看起来一样」的轨迹。
func traceKey(t time.Time, text string) string {
	return t.Truncate(time.Second).Format(time.RFC3339) + "|" + text
}
