// File Name: inventory.go
// Created Time: 2026-09-22 19:06:31
// Update Time: 2026-09-22 19:21:56

package service

import (
	"context"
	"time"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/repository"
	"rental-platform/pkg/errs"
)

type Inventory struct {
	db        *sqlx.DB
	unitRepo  *repository.UnitRepo
	occRepo   *repository.OccupationRepo
	equipRepo *repository.EquipmentRepo
}

func NewInventory(db *sqlx.DB) *Inventory {
	return &Inventory{
		db:        db,
		unitRepo:  repository.NewUnitRepo(db),
		occRepo:   repository.NewOccupationRepo(db),
		equipRepo: repository.NewEquipmentRepo(db),
	}
}

// PickUnit 挑一个在当前租期内没有占用的空闲单元（不写占用记录）。
//
// 之所以拆出这一步：`order.unit_id` 是 NOT NULL 外键，而
// `equipment_unit_occupation.order_id` 也是 NOT NULL 外键，两者互相依赖，
// 无法先写占用再建订单。因此顺序固定为：
//
//	PickUnit → 建订单(带 unit_id) → Occupy(写占用记录)
//
// 并发安全由后续的 Occupy 通过排他约束（23P01）保证：若选中的单元被抢走，
// 调用方应在事务内重试或返回 ErrNoAvailableUnit。
func (s *Inventory) PickUnit(
	ctx context.Context, equipmentID int64, startAt, endAt time.Time,
) (int64, error) {
	if !endAt.After(startAt) {
		return 0, errs.ErrInvalidPeriod
	}

	tx := TxFrom(ctx)
	unitRepo := s.unitRepo
	if tx != nil {
		unitRepo = unitRepo.WithTx(tx)
	}

	candidates, err := unitRepo.ListCandidateUnits(ctx, equipmentID, startAt, endAt)
	if err != nil {
		return 0, err
	}
	if len(candidates) == 0 {
		return 0, errs.ErrNoAvailableUnit
	}
	return candidates[0], nil
}

// Occupy 为订单写入一条单元占用记录；命中排他约束返回 ErrConflict（ErrNoAvailableUnit）。
func (s *Inventory) Occupy(
	ctx context.Context, unitID, orderID int64, startAt, endAt time.Time,
) error {
	if !endAt.After(startAt) {
		return errs.ErrInvalidPeriod
	}

	tx := TxFrom(ctx)
	occRepo := s.occRepo
	if tx != nil {
		occRepo = occRepo.WithTx(tx)
	}

	err := occRepo.Create(ctx, unitID, orderID, startAt, endAt)
	if err == errs.ErrConflict {
		return errs.ErrNoAvailableUnit
	}
	return err
}

// Allocate 为已存在的订单分配一个空闲单元并落占用记录。
// 仅在订单已创建（orderID 有效）时可用；新建订单请用 PickUnit + Occupy。
//
// 流程：
//  1. 查候选单元（status=idle 且租期无重叠）
//  2. 逐个尝试插入占用记录
//  3. 命中排他约束（23P01）→ 换下一个
//  4. 全部失败 → ErrNoAvailableUnit
func (s *Inventory) Allocate(
	ctx context.Context, equipmentID, orderID int64,
	startAt, endAt time.Time,
) (int64, error) {
	if !endAt.After(startAt) {
		return 0, errs.ErrInvalidPeriod
	}

	tx := TxFrom(ctx)
	unitRepo := s.unitRepo
	occRepo := s.occRepo
	if tx != nil {
		unitRepo = unitRepo.WithTx(tx)
		occRepo = occRepo.WithTx(tx)
	}

	candidates, err := unitRepo.ListCandidateUnits(ctx, equipmentID, startAt, endAt)
	if err != nil {
		return 0, err
	}
	if len(candidates) == 0 {
		return 0, errs.ErrNoAvailableUnit
	}

	for _, uid := range candidates {
		err := occRepo.Create(ctx, uid, orderID, startAt, endAt)
		if err == nil {
			return uid, nil
		}
		if err == errs.ErrConflict {
			// 该单元刚被抢走（并发），换下一个
			continue
		}
		return 0, err
	}
	return 0, errs.ErrNoAvailableUnit
}

// Release 释放订单占用的单元（取消订单 / 归还完成时）
func (s *Inventory) Release(ctx context.Context, orderID int64) error {
	tx := TxFrom(ctx)
	repo := s.occRepo
	if tx != nil {
		repo = repo.WithTx(tx)
	}
	return repo.DeleteByOrder(ctx, orderID)
}

// AvailableCount 查询某设备在给定期内的可用台数。
//
// 基数取"真实存在的空闲单元数"（equipment_unit where status='idle'），
// 而不是 equipment.total。理由：total 只是商家声明的总台数，单元需要
// 通过「批量生成」落库后才真正可租。若按 total 计算，会出现
// “页面显示有 5 台可租，实际下单却提示已租完”的错位。
func (s *Inventory) AvailableCount(
	ctx context.Context, merchantID, equipmentID int64, startAt, endAt time.Time,
) (int, error) {
	// 校验设备存在且归属该商家
	if _, err := s.equipRepo.GetByID(ctx, merchantID, equipmentID); err != nil {
		return 0, err
	}
	total, err := s.unitRepo.CountUsable(ctx, equipmentID)
	if err != nil {
		return 0, err
	}
	occupied, err := s.occRepo.CountOccupied(ctx, equipmentID, startAt, endAt)
	if err != nil {
		return 0, err
	}
	n := total - occupied
	if n < 0 {
		n = 0
	}
	return n, nil
}
