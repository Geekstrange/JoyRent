package errs

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

// 业务错误哨兵值，service 层返回，handler 层映射为 HTTP 状态码
var (
	ErrNotFound         = errors.New("not found")
	ErrConflict         = errors.New("conflict")
	ErrInvalidState     = errors.New("invalid state transition")
	ErrNoAvailableUnit  = errors.New("no available unit for the given period")
	ErrInvalidPeriod    = errors.New("invalid period")
	ErrInvalidArgument  = errors.New("invalid argument")
	ErrForbidden        = errors.New("forbidden")
	ErrUnauthorized     = errors.New("unauthorized")
	ErrAlreadyExists    = errors.New("already exists")
	ErrDuplicateInvoice = errors.New("invoice already exists for this order")
)

// IsExclusionViolation 判断 PostgreSQL 排他约束冲突（SQLSTATE 23P01）
func IsExclusionViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23P01"
}

// IsUniqueViolation 判断唯一约束冲突（SQLSTATE 23505）
func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
