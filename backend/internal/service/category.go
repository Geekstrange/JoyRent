// File Name: category.go
// Created Time: 2026-09-22 19:11:39
// Update Time: 2026-09-22 19:11:39


package service

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/internal/repository"
	"rental-platform/pkg/errs"
)

type CategoryService struct {
	db   *sqlx.DB
	repo *repository.CategoryRepo
	eq   *repository.EquipmentRepo
}

func NewCategoryService(db *sqlx.DB) *CategoryService {
	return &CategoryService{
		db:   db,
		repo: repository.NewCategoryRepo(db),
		eq:   repository.NewEquipmentRepo(db),
	}
}

func (s *CategoryService) List(ctx context.Context, merchantID int64) ([]model.Category, error) {
	return s.repo.ListByMerchant(ctx, merchantID)
}

type CategoryInput struct {
	Name     string
	ParentID int64
	Sort     int
}

func (s *CategoryService) Create(ctx context.Context, merchantID int64, in CategoryInput) (*model.Category, error) {
	if in.Name == "" {
		return nil, fmt.Errorf("%w: 分类名不能为空", errs.ErrInvalidArgument)
	}
	if in.ParentID > 0 {
		if _, err := s.repo.GetByID(ctx, merchantID, in.ParentID); err != nil {
			return nil, fmt.Errorf("%w: 上级分类不存在", errs.ErrInvalidArgument)
		}
	}
	c := &model.Category{
		MerchantID: merchantID,
		ParentID:   in.ParentID,
		Name:       in.Name,
		Sort:       in.Sort,
	}
	if err := s.repo.Create(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

func (s *CategoryService) Update(ctx context.Context, merchantID, id int64, in CategoryInput) error {
	c, err := s.repo.GetByID(ctx, merchantID, id)
	if err != nil {
		return err
	}
	if in.Name == "" {
		return fmt.Errorf("%w: 分类名不能为空", errs.ErrInvalidArgument)
	}
	if in.ParentID == id {
		return fmt.Errorf("%w: 不能以自身为上级", errs.ErrInvalidArgument)
	}
	c.Name = in.Name
	c.ParentID = in.ParentID
	c.Sort = in.Sort
	return s.repo.Update(ctx, c)
}

// Delete 分类下有设备或子分类时不允许删除
func (s *CategoryService) Delete(ctx context.Context, merchantID, id int64) error {
	if _, err := s.repo.GetByID(ctx, merchantID, id); err != nil {
		return err
	}
	nEq, err := s.repo.CountEquipments(ctx, merchantID, id)
	if err != nil {
		return err
	}
	if nEq > 0 {
		return fmt.Errorf("%w: 该分类下仍有 %d 个设备", errs.ErrConflict, nEq)
	}
	nChild, err := s.repo.CountChildren(ctx, merchantID, id)
	if err != nil {
		return err
	}
	if nChild > 0 {
		return fmt.Errorf("%w: 该分类下仍有 %d 个子分类", errs.ErrConflict, nChild)
	}
	return s.repo.Delete(ctx, merchantID, id)
}
