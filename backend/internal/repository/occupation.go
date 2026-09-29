// File Name: occupation.go
// Created Time: 2026-09-22 19:02:44
// Update Time: 2026-09-22 19:02:44


package repository

import (
	"context"
	"time"

	"github.com/jmoiron/sqlx"

	"rental-platform/pkg/errs"
)

type OccupationRepo struct{ db ExtContext }

func NewOccupationRepo(db ExtContext) *OccupationRepo { return &OccupationRepo{db: db} }

func (r *OccupationRepo) WithTx(tx *sqlx.Tx) *OccupationRepo { return &OccupationRepo{db: tx} }

// Create 插入占用记录。若命中排他约束返回 errs.ErrConflict
func (r *OccupationRepo) Create(ctx context.Context, unitID, orderID int64, startAt, endAt time.Time) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO equipment_unit_occupation (unit_id, order_id, period)
		 VALUES ($1, $2, daterange($3::date, $4::date + 1, '[)'))`,
		unitID, orderID, dateOnly(startAt), dateOnly(endAt))
	if err != nil {
		if errs.IsExclusionViolation(err) {
			return errs.ErrConflict
		}
		if errs.IsUniqueViolation(err) {
			return errs.ErrConflict
		}
		return err
	}
	return nil
}

func (r *OccupationRepo) DeleteByOrder(ctx context.Context, orderID int64) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM equipment_unit_occupation WHERE order_id = $1`, orderID)
	return err
}

// CountOccupied 统计某设备在给定期内已占用的单元数
func (r *OccupationRepo) CountOccupied(ctx context.Context, equipmentID int64, startAt, endAt time.Time) (int, error) {
	var n int
	err := sqlx.GetContext(ctx, r.db, &n,
		`SELECT COUNT(*) FROM equipment_unit_occupation o
		 JOIN equipment_unit u ON u.id = o.unit_id
		 WHERE u.equipment_id = $1
		   AND o.period && daterange($2::date, $3::date + 1, '[)')`,
		equipmentID, dateOnly(startAt), dateOnly(endAt))
	return n, err
}
