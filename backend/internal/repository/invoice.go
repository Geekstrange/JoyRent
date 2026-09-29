// File Name: invoice.go
// Created Time: 2026-09-22 19:03:27
// Update Time: 2026-09-22 19:03:27


package repository

import (
	"context"
	"strconv"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/pkg/errs"
)

type InvoiceRepo struct{ db ExtContext }

func NewInvoiceRepo(db ExtContext) *InvoiceRepo { return &InvoiceRepo{db: db} }

func (r *InvoiceRepo) WithTx(tx *sqlx.Tx) *InvoiceRepo { return &InvoiceRepo{db: tx} }

const invoiceColumns = `id, merchant_id, no, order_id, user_id, amount_cents,
	type, title, tax_no, email, status, invoice_no, reason,
	created_at, updated_at`

func (r *InvoiceRepo) List(ctx context.Context, merchantID int64, status string) ([]model.Invoice, error) {
	q := `SELECT ` + invoiceColumns + ` FROM invoice WHERE merchant_id = $1`
	args := []any{merchantID}
	if status != "" {
		args = append(args, status)
		q += ` AND status = $` + strconv.Itoa(len(args))
	}
	q += ` ORDER BY id DESC LIMIT 500`

	var list []model.Invoice
	if err := sqlx.SelectContext(ctx, r.db, &list, q, args...); err != nil {
		return nil, err
	}
	return list, nil
}

func (r *InvoiceRepo) GetByID(ctx context.Context, merchantID, id int64) (*model.Invoice, error) {
	var v model.Invoice
	err := sqlx.GetContext(ctx, r.db, &v,
		`SELECT `+invoiceColumns+` FROM invoice
		 WHERE id = $1 AND merchant_id = $2`, id, merchantID)
	if err != nil {
		return nil, normalize(err)
	}
	return &v, nil
}

func (r *InvoiceRepo) GetByOrderID(ctx context.Context, orderID int64) (*model.Invoice, error) {
	var v model.Invoice
	err := sqlx.GetContext(ctx, r.db, &v,
		`SELECT `+invoiceColumns+` FROM invoice WHERE order_id = $1`, orderID)
	if err != nil {
		return nil, normalize(err)
	}
	return &v, nil
}

func (r *InvoiceRepo) Create(ctx context.Context, v *model.Invoice) error {
	err := sqlx.GetContext(ctx, r.db, &v.ID,
		`INSERT INTO invoice
		 (merchant_id, no, order_id, user_id, amount_cents,
		  type, title, tax_no, email, status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		 RETURNING id`,
		v.MerchantID, v.No, v.OrderID, v.UserID, v.AmountCents,
		v.Type, v.Title, v.TaxNo, v.Email, v.Status)
	if err != nil && errs.IsUniqueViolation(err) {
		return errs.ErrDuplicateInvoice
	}
	return err
}

func (r *InvoiceRepo) Issue(ctx context.Context, merchantID, id int64, invoiceNo string) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE invoice SET status = 'issued', invoice_no = $1, reason = ''
		 WHERE id = $2 AND merchant_id = $3 AND status = 'pending'`,
		invoiceNo, id, merchantID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errs.ErrInvalidState
	}
	return nil
}

func (r *InvoiceRepo) Reject(ctx context.Context, merchantID, id int64, reason string) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE invoice SET status = 'rejected', reason = $1, invoice_no = ''
		 WHERE id = $2 AND merchant_id = $3 AND status = 'pending'`,
		reason, id, merchantID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errs.ErrInvalidState
	}
	return nil
}

func (r *InvoiceRepo) SumIssued(ctx context.Context, merchantID int64) (int64, error) {
	var n int64
	err := sqlx.GetContext(ctx, r.db, &n,
		`SELECT COALESCE(SUM(amount_cents),0) FROM invoice
		 WHERE merchant_id = $1 AND status = 'issued'`, merchantID)
	return n, err
}
