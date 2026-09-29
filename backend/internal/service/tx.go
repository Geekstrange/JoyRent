// File Name: tx.go
// Created Time: 2026-09-22 19:04:31
// Update Time: 2026-09-22 19:04:31


package service

import (
	"context"

	"github.com/jmoiron/sqlx"
)

type txKey struct{}

// WithTx 在事务中执行 fn。fn 内通过 TxFrom(ctx) 取事务句柄
func WithTx(ctx context.Context, db *sqlx.DB, fn func(context.Context) error) error {
	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(context.WithValue(ctx, txKey{}, tx)); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

// TxFrom 从 ctx 取事务句柄；不在事务内返回 nil
func TxFrom(ctx context.Context) *sqlx.Tx {
	if tx, ok := ctx.Value(txKey{}).(*sqlx.Tx); ok {
		return tx
	}
	return nil
}
