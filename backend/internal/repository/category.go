// File Name: category.go
// Created Time: 2026-09-22 19:01:14
// Update Time: 2026-09-22 19:01:14


package repository

import (
	"context"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/pkg/errs"
)

type CategoryRepo struct{ db ExtContext }

func NewCategoryRepo(db ExtContext) *CategoryRepo { return &CategoryRepo{db: db} }

func (r *CategoryRepo) WithTx(tx *sqlx.Tx) *CategoryRepo { return &CategoryRepo{db: tx} }

func (r *CategoryRepo) ListByMerchant(ctx context.Context, merchantID int64) ([]model.Category, error) {
	var list []model.Category
	err := sqlx.SelectContext(ctx, r.db, &list,
		`SELECT id, merchant_id, parent_id, name, sort, created_at, updated_at
		 FROM category WHERE merchant_id = $1 ORDER BY sort, id`, merchantID)
	return list, err
}

func (r *CategoryRepo) GetByID(ctx context.Context, merchantID, id int64) (*model.Category, error) {
	var c model.Category
	err := sqlx.GetContext(ctx, r.db, &c,
		`SELECT id, merchant_id, parent_id, name, sort, created_at, updated_at
		 FROM category WHERE id = $1 AND merchant_id = $2`, id, merchantID)
	if err != nil {
		return nil, normalize(err)
	}
	return &c, nil
}

func (r *CategoryRepo) Create(ctx context.Context, c *model.Category) error {
	return sqlx.GetContext(ctx, r.db, &c.ID,
		`INSERT INTO category (merchant_id, parent_id, name, sort)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		c.MerchantID, c.ParentID, c.Name, c.Sort)
}

func (r *CategoryRepo) Update(ctx context.Context, c *model.Category) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE category SET parent_id = $1, name = $2, sort = $3
		 WHERE id = $4 AND merchant_id = $5`,
		c.ParentID, c.Name, c.Sort, c.ID, c.MerchantID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errs.ErrNotFound
	}
	return nil
}

func (r *CategoryRepo) Delete(ctx context.Context, merchantID, id int64) error {
	res, err := r.db.ExecContext(ctx,
		`DELETE FROM category WHERE id = $1 AND merchant_id = $2`, id, merchantID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errs.ErrNotFound
	}
	return nil
}

// CountEquipments 统计分类下设备数，用于删除前校验
func (r *CategoryRepo) CountEquipments(ctx context.Context, merchantID, categoryID int64) (int, error) {
	var n int
	err := sqlx.GetContext(ctx, r.db, &n,
		`SELECT COUNT(*) FROM equipment
		 WHERE merchant_id = $1 AND category_id = $2`, merchantID, categoryID)
	return n, err
}

// CountChildren 统计子分类数
func (r *CategoryRepo) CountChildren(ctx context.Context, merchantID, parentID int64) (int, error) {
	var n int
	err := sqlx.GetContext(ctx, r.db, &n,
		`SELECT COUNT(*) FROM category
		 WHERE merchant_id = $1 AND parent_id = $2`, merchantID, parentID)
	return n, err
}
