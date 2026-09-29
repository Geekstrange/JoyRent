// File Name: equipment.go
// Created Time: 2026-09-22 19:11:54
// Update Time: 2026-09-23 00:00:00

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

type EquipmentService struct {
	db        *sqlx.DB
	equipRepo *repository.EquipmentRepo
	unitRepo  *repository.UnitRepo
	occRepo   *repository.OccupationRepo
	inventory *Inventory
}

func NewEquipmentService(db *sqlx.DB) *EquipmentService {
	return &EquipmentService{
		db:        db,
		equipRepo: repository.NewEquipmentRepo(db),
		unitRepo:  repository.NewUnitRepo(db),
		occRepo:   repository.NewOccupationRepo(db),
		inventory: NewInventory(db),
	}
}

func (s *EquipmentService) List(ctx context.Context, merchantID int64, f repository.EquipmentFilter) ([]model.Equipment, error) {
	return s.equipRepo.List(ctx, merchantID, f)
}

func (s *EquipmentService) Get(ctx context.Context, merchantID, id int64) (*model.Equipment, error) {
	return s.equipRepo.GetByID(ctx, merchantID, id)
}

type EquipmentInput struct {
	CategoryID   int64
	Name         string
	Spec         string
	Description  string
	CoverPath    string
	DailyCents   int64
	DepositCents int64
	Total        int
}

func (s *EquipmentService) Create(ctx context.Context, merchantID int64, in EquipmentInput) (*model.Equipment, error) {
	if in.Name == "" {
		return nil, fmt.Errorf("%w: 设备名不能为空", errs.ErrInvalidArgument)
	}
	if in.CategoryID <= 0 {
		return nil, fmt.Errorf("%w: 必须选择分类", errs.ErrInvalidArgument)
	}
	if in.DailyCents < 0 || in.DepositCents < 0 {
		return nil, fmt.Errorf("%w: 金额不能为负", errs.ErrInvalidArgument)
	}
	if in.Total < 0 {
		return nil, fmt.Errorf("%w: 总台数不能为负", errs.ErrInvalidArgument)
	}
	e := &model.Equipment{
		MerchantID:   merchantID,
		CategoryID:   in.CategoryID,
		Name:         in.Name,
		Spec:         in.Spec,
		Description:  in.Description,
		CoverPath:    in.CoverPath,
		DailyCents:   in.DailyCents,
		DepositCents: in.DepositCents,
		Total:        in.Total,
	}
	if err := s.equipRepo.Create(ctx, e); err != nil {
		return nil, err
	}
	return e, nil
}

func (s *EquipmentService) Update(ctx context.Context, merchantID, id int64, in EquipmentInput) error {
	e, err := s.equipRepo.GetByID(ctx, merchantID, id)
	if err != nil {
		return err
	}
	if in.Name == "" {
		return fmt.Errorf("%w: 设备名不能为空", errs.ErrInvalidArgument)
	}
	e.CategoryID = in.CategoryID
	e.Name = in.Name
	e.Spec = in.Spec
	e.Description = in.Description
	e.CoverPath = in.CoverPath
	e.DailyCents = in.DailyCents
	e.DepositCents = in.DepositCents
	e.Total = in.Total
	return s.equipRepo.Update(ctx, e)
}

// Delete 有进行中订单时不允许删除
func (s *EquipmentService) Delete(ctx context.Context, merchantID, id int64) error {
	if _, err := s.equipRepo.GetByID(ctx, merchantID, id); err != nil {
		return err
	}
	n, err := s.equipRepo.CountActiveOrders(ctx, merchantID, id)
	if err != nil {
		return err
	}
	if n > 0 {
		return fmt.Errorf("%w: 仍有 %d 个进行中的订单", errs.ErrConflict, n)
	}
	return s.equipRepo.Delete(ctx, merchantID, id)
}

// ---------- 设备单元 ----------

func (s *EquipmentService) ListUnits(ctx context.Context, merchantID, equipmentID int64) ([]model.EquipmentUnit, error) {
	return s.unitRepo.ListByEquipment(ctx, merchantID, equipmentID)
}

// GenerateUnits 为设备批量生成序列号单元。
// - 已有单元数 + 新增数 不得超过设备总台数（Total > 0 时校验）
func (s *EquipmentService) GenerateUnits(ctx context.Context, merchantID, equipmentID int64, count int) (int, error) {
	if count <= 0 || count > 1000 {
		return 0, fmt.Errorf("%w: 生成数量须在 1-1000", errs.ErrInvalidArgument)
	}
	eq, err := s.equipRepo.GetByID(ctx, merchantID, equipmentID)
	if err != nil {
		return 0, err
	}
	existing, err := s.unitRepo.ListByEquipment(ctx, merchantID, equipmentID)
	if err != nil {
		return 0, err
	}
	from := len(existing) + 1
	to := from + count - 1
	if eq.Total > 0 && to > eq.Total {
		return 0, fmt.Errorf(
			"%w: 生成的序列号总数(%d)超过设备总台数(%d)",
			errs.ErrInvalidArgument, to, eq.Total,
		)
	}
	return s.unitRepo.CreateBatch(ctx, merchantID, equipmentID, from, to)
}

func (s *EquipmentService) UpdateUnitStatus(ctx context.Context, merchantID, unitID int64, status string) error {
	switch status {
	case model.UnitStatusIdle, model.UnitStatusRented,
		model.UnitStatusMaintenance, model.UnitStatusRetired:
	default:
		return fmt.Errorf("%w: 无效的单元状态", errs.ErrInvalidArgument)
	}
	return s.unitRepo.UpdateStatus(ctx, merchantID, unitID, status)
}

// ---------- 可用量 ----------

// AvailableCount 单日可用台数
func (s *EquipmentService) AvailableCount(ctx context.Context, merchantID, equipmentID int64, startAt, endAt time.Time) (int, error) {
	return s.inventory.AvailableCount(ctx, merchantID, equipmentID, startAt, endAt)
}

// AvailabilityBar 未来 N 天可用台数，供详情页柱状图使用
type AvailabilityBar struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

func (s *EquipmentService) AvailabilityBars(ctx context.Context, merchantID, equipmentID int64, days int) ([]AvailabilityBar, error) {
	if days <= 0 || days > 60 {
		days = 14
	}
	if _, err := s.equipRepo.GetByID(ctx, merchantID, equipmentID); err != nil {
		return nil, err
	}
	// 基数取真实存在的空闲单元数，而非 equipment.total（见 Inventory.AvailableCount 注释）
	usable, err := s.unitRepo.CountUsable(ctx, equipmentID)
	if err != nil {
		return nil, err
	}
	today := time.Now().UTC().Truncate(24 * time.Hour)
	bars := make([]AvailabilityBar, 0, days)
	for i := 0; i < days; i++ {
		d := today.AddDate(0, 0, i)
		occupied, err := s.occRepo.CountOccupied(ctx, equipmentID, d, d)
		if err != nil {
			return nil, err
		}
		n := usable - occupied
		if n < 0 {
			n = 0
		}
		bars = append(bars, AvailabilityBar{
			Date:  d.Format("2006-01-02"),
			Count: n,
		})
	}
	return bars, nil
}
