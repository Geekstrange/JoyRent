// File Name: order.go
// Created Time: 2026-09-22 19:03:07
// Update Time: 2026-09-22 19:03:07

package repository

import (
	"context"
	"strconv"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/pkg/errs"
)

type OrderRepo struct{ db ExtContext }

func NewOrderRepo(db ExtContext) *OrderRepo { return &OrderRepo{db: db} }

func (r *OrderRepo) WithTx(tx *sqlx.Tx) *OrderRepo { return &OrderRepo{db: tx} }

type OrderFilter struct {
	Status  string
	UserID  int64
	Keyword string
}

const orderColumns = `id, merchant_id, no, user_id, equipment_id, unit_id,
	start_at, end_at, days, rent_cents, deposit_cents,
	deposit_original_cents, deposit_tier, credit_score,
	status, dep_status, receiver, phone, address, created_at, updated_at`

func (r *OrderRepo) List(ctx context.Context, merchantID int64, f OrderFilter) ([]model.Order, error) {
	q := `SELECT ` + orderColumns + ` FROM "order" WHERE merchant_id = $1`
	args := []any{merchantID}

	if f.Status != "" {
		args = append(args, f.Status)
		q += ` AND status = $` + strconv.Itoa(len(args))
	}
	if f.UserID > 0 {
		args = append(args, f.UserID)
		q += ` AND user_id = $` + strconv.Itoa(len(args))
	}
	if f.Keyword != "" {
		args = append(args, "%"+f.Keyword+"%")
		q += ` AND no ILIKE $` + strconv.Itoa(len(args))
	}
	q += ` ORDER BY id DESC LIMIT 500`

	var list []model.Order
	if err := sqlx.SelectContext(ctx, r.db, &list, q, args...); err != nil {
		return nil, err
	}
	return list, nil
}

func (r *OrderRepo) GetByID(ctx context.Context, merchantID, id int64) (*model.Order, error) {
	var o model.Order
	err := sqlx.GetContext(ctx, r.db, &o,
		`SELECT `+orderColumns+` FROM "order"
		 WHERE id = $1 AND merchant_id = $2`, id, merchantID)
	if err != nil {
		return nil, normalize(err)
	}
	return &o, nil
}

// GetByNo 按订单号查询。
//
// ⚠️ 这个方法专供**支付回调**使用：渠道回调只携带商户订单号（out_trade_no），
// 既不带本平台自增 ID，也不带 merchant_id，因此无法复用 GetByID。
// 订单号全局唯一（`no TEXT NOT NULL UNIQUE`，见 000001_init.up.sql），
// 所以这里无需按 merchant_id 过滤。
func (r *OrderRepo) GetByNo(ctx context.Context, no string) (*model.Order, error) {
	var o model.Order
	err := sqlx.GetContext(ctx, r.db, &o,
		`SELECT `+orderColumns+` FROM "order" WHERE no = $1`, no)
	if err != nil {
		return nil, normalize(err)
	}
	return &o, nil
}

// GetByIDUnscoped 按主键查询，**不按 merchant_id 过滤**。
//
// 仅供「没有商户上下文」的场景使用 —— 目前唯一调用方是支付回调：
// 渠道回调报文里既没有本平台订单 ID 也没有 merchant_id，
// 只能靠订单号反查（见 GetByNo）；当渠道能直接给出订单 ID 时用本方法。
// 其余业务一律用 GetByID（带 merchant_id 隔离）。
func (r *OrderRepo) GetByIDUnscoped(ctx context.Context, id int64) (*model.Order, error) {
	var o model.Order
	err := sqlx.GetContext(ctx, r.db, &o,
		`SELECT `+orderColumns+` FROM "order" WHERE id = $1`, id)
	if err != nil {
		return nil, normalize(err)
	}
	return &o, nil
}

// GetByIDForUpdate 行级锁，用于状态流转前读取
func (r *OrderRepo) GetByIDForUpdate(ctx context.Context, merchantID, id int64) (*model.Order, error) {
	var o model.Order
	err := sqlx.GetContext(ctx, r.db, &o,
		`SELECT `+orderColumns+` FROM "order"
		 WHERE id = $1 AND merchant_id = $2 FOR UPDATE`, id, merchantID)
	if err != nil {
		return nil, normalize(err)
	}
	return &o, nil
}

func (r *OrderRepo) Create(ctx context.Context, o *model.Order) error {
	return sqlx.GetContext(ctx, r.db, &o.ID,
		`INSERT INTO "order"
		 (merchant_id, no, user_id, equipment_id, unit_id,
		  start_at, end_at, days, rent_cents, deposit_cents,
		  deposit_original_cents, deposit_tier, credit_score,
		  status, dep_status, receiver, phone, address)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
		 RETURNING id`,
		o.MerchantID, o.No, o.UserID, o.EquipmentID, o.UnitID,
		o.StartAt, o.EndAt, o.Days, o.RentCents, o.DepositCents,
		o.DepositOriginalCents, o.DepositTier, o.CreditScore,
		o.Status, o.DepStatus, o.Receiver, o.Phone, o.Address)
}

// UpdateStatus 仅改 status，同时按需改 dep_status
// 状态合法流转由 service 层校验，repo 不做业务判断
func (r *OrderRepo) UpdateStatus(ctx context.Context, merchantID, id int64, status, depStatus string) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE "order" SET status = $1, dep_status = $2
		 WHERE id = $3 AND merchant_id = $4`,
		status, depStatus, id, merchantID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errs.ErrNotFound
	}
	return nil
}

// UpdateUnitID 分配单元后回填
func (r *OrderRepo) UpdateUnitID(ctx context.Context, orderID, unitID int64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE "order" SET unit_id = $1 WHERE id = $2`, unitID, orderID)
	return err
}

// ListExpiredPending 查询超时未支付的订单
func (r *OrderRepo) ListExpiredPending(ctx context.Context, before any) ([]model.Order, error) {
	var list []model.Order
	err := sqlx.SelectContext(ctx, r.db, &list,
		`SELECT `+orderColumns+` FROM "order"
		 WHERE status = 'pending' AND created_at < $1
		 LIMIT 200`, before)
	return list, err
}
