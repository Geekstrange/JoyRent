// File Name: shipment.go
// Created Time: 2026-09-22 19:03:40
// Update Time: 2026-09-22 19:03:40


package repository

import (
	"context"
	"time"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/pkg/errs"
)

type ShipmentRepo struct{ db ExtContext }

func NewShipmentRepo(db ExtContext) *ShipmentRepo { return &ShipmentRepo{db: db} }

func (r *ShipmentRepo) WithTx(tx *sqlx.Tx) *ShipmentRepo { return &ShipmentRepo{db: tx} }

const shipmentColumns = `id, merchant_id, order_id, express, no, status,
	receiver, phone, address, created_at, updated_at`

func (r *ShipmentRepo) GetByOrderID(ctx context.Context, orderID int64) (*model.Shipment, error) {
	var s model.Shipment
	err := sqlx.GetContext(ctx, r.db, &s,
		`SELECT `+shipmentColumns+` FROM shipment WHERE order_id = $1`, orderID)
	if err != nil {
		return nil, normalize(err)
	}
	return &s, nil
}

// Upsert 发货或修改运单
func (r *ShipmentRepo) Upsert(ctx context.Context, s *model.Shipment) error {
	return sqlx.GetContext(ctx, r.db, &s.ID,
		`INSERT INTO shipment
		 (merchant_id, order_id, express, no, status, receiver, phone, address)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		 ON CONFLICT (order_id) DO UPDATE
		 SET express = EXCLUDED.express,
		     no      = EXCLUDED.no,
		     status  = EXCLUDED.status,
		     updated_at = now()
		 RETURNING id`,
		s.MerchantID, s.OrderID, s.Express, s.No, s.Status,
		s.Receiver, s.Phone, s.Address)
}

func (r *ShipmentRepo) UpdateStatus(ctx context.Context, merchantID, id int64, status string) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE shipment SET status = $1 WHERE id = $2 AND merchant_id = $3`,
		status, id, merchantID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errs.ErrNotFound
	}
	return nil
}

// ---------- 轨迹 ----------

func (r *ShipmentRepo) AddTrace(ctx context.Context, shipmentID int64, at time.Time, text string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO shipment_trace (shipment_id, trace_at, text)
		 VALUES ($1, $2, $3)`, shipmentID, at, text)
	return err
}

func (r *ShipmentRepo) ListTraces(ctx context.Context, shipmentID int64) ([]model.ShipmentTrace, error) {
	var list []model.ShipmentTrace
	err := sqlx.SelectContext(ctx, r.db, &list,
		`SELECT id, shipment_id, trace_at, text, created_at
		 FROM shipment_trace WHERE shipment_id = $1
		 ORDER BY trace_at ASC, id ASC`, shipmentID)
	return list, err
}

// LatestTrace 取最新一条轨迹，列表页用
func (r *ShipmentRepo) LatestTrace(ctx context.Context, shipmentID int64) (*model.ShipmentTrace, error) {
	var t model.ShipmentTrace
	err := sqlx.GetContext(ctx, r.db, &t,
		`SELECT id, shipment_id, trace_at, text, created_at
		 FROM shipment_trace WHERE shipment_id = $1
		 ORDER BY trace_at DESC, id DESC LIMIT 1`, shipmentID)
	if err != nil {
		return nil, normalize(err)
	}
	return &t, nil
}
