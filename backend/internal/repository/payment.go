// File Name: payment.go
// Created Time: 2026-09-22 19:03:55
// Update Time: 2026-09-22 19:03:55


package repository

import (
	"context"
	"encoding/json"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
)

type PaymentRepo struct{ db ExtContext }

func NewPaymentRepo(db ExtContext) *PaymentRepo { return &PaymentRepo{db: db} }

func (r *PaymentRepo) WithTx(tx *sqlx.Tx) *PaymentRepo { return &PaymentRepo{db: tx} }

// ⚠️ raw_callback 必须是 COALESCE —— 它是可空列（JSONB），
// 而 `Create` 只写 6 个字段、**不写 raw_callback**，所以新建的 pending 流水
// 该列是 NULL。而 `model.Payment.RawCallback` 是 `json.RawMessage`，
// 直接 SELECT 会报：
//   sql: Scan error on column index 7, name "raw_callback":
//   unsupported Scan, storing driver.Value type <nil> into type *jsontext.Value
// 支付回调链路必然读这张表（GetByOrderID），所以这里统一兜成合法 JSON。
const paymentColumns = `id, merchant_id, order_id, channel, transaction_id,
	amount_cents, status, COALESCE(raw_callback, '{}'::jsonb) AS raw_callback,
	created_at, updated_at`

func (r *PaymentRepo) Create(ctx context.Context, p *model.Payment) error {
	return sqlx.GetContext(ctx, r.db, &p.ID,
		`INSERT INTO payment
		 (merchant_id, order_id, channel, transaction_id, amount_cents, status)
		 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		p.MerchantID, p.OrderID, p.Channel, p.TransactionID,
		p.AmountCents, p.Status)
}

func (r *PaymentRepo) GetByChannelTxn(ctx context.Context, channel, txn string) (*model.Payment, error) {
	var p model.Payment
	err := sqlx.GetContext(ctx, r.db, &p,
		`SELECT `+paymentColumns+` FROM payment
		 WHERE channel = $1 AND transaction_id = $2`, channel, txn)
	if err != nil {
		return nil, normalize(err)
	}
	return &p, nil
}

func (r *PaymentRepo) GetByOrderID(ctx context.Context, orderID int64) (*model.Payment, error) {
	var p model.Payment
	err := sqlx.GetContext(ctx, r.db, &p,
		`SELECT `+paymentColumns+` FROM payment
		 WHERE order_id = $1 ORDER BY id DESC LIMIT 1`, orderID)
	if err != nil {
		return nil, normalize(err)
	}
	return &p, nil
}

func (r *PaymentRepo) MarkSuccess(ctx context.Context, id int64, txn string, raw json.RawMessage) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE payment SET status = 'success', transaction_id = $1, raw_callback = $2
		 WHERE id = $3 AND status = 'pending'`, txn, raw, id)
	return err
}

func (r *PaymentRepo) MarkFailed(ctx context.Context, id int64, raw json.RawMessage) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE payment SET status = 'failed', raw_callback = $1
		 WHERE id = $2 AND status = 'pending'`, raw, id)
	return err
}

func (r *PaymentRepo) MarkRefunded(ctx context.Context, orderID int64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE payment SET status = 'refunded'
		 WHERE order_id = $1 AND status = 'success'`, orderID)
	return err
}
