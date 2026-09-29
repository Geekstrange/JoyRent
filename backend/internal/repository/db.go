// File Name: db.go
// Created Time: 2026-09-22 19:00:26
// Update Time: 2026-09-22 19:00:26


package repository

import (
	"database/sql"
	"errors"

	"github.com/jmoiron/sqlx"

	"rental-platform/pkg/errs"
)

// ExtContext 兼容 *sqlx.DB 与 *sqlx.Tx
type ExtContext = sqlx.ExtContext

// base 提供 WithTx 与错误归一化
type base struct {
	db ExtContext
}

func (b base) WithTx(tx *sqlx.Tx) base { return base{db: tx} }

// normalize 把 sql.ErrNoRows 归一成 errs.ErrNotFound
func normalize(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return errs.ErrNotFound
	}
	return err
}
