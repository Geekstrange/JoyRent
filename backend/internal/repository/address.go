// File Name: address.go
// Created Time: 2026-09-25 09:00:00
// Update Time: 2026-09-25 09:00:00

package repository

import (
	"context"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/pkg/errs"
)

type AddressRepo struct{ db ExtContext }

func NewAddressRepo(db ExtContext) *AddressRepo { return &AddressRepo{db: db} }

func (r *AddressRepo) WithTx(tx *sqlx.Tx) *AddressRepo { return &AddressRepo{db: tx} }

const addressColumns = `id, owner_user_id, receiver, phone, province, city, district, detail,
	is_default, created_at, updated_at`

// ListByOwner 列出某用户的全部地址。默认地址排最前，其次按 id 倒序（新加的在前）。
//
// 空结果返回空切片而非 nil：nil 会被 encoding/json 序列化成 `null`，
// 前端 `data.map(...)` 直接抛错（项目约定见 response.normalizeNilSlice 的说明）。
func (r *AddressRepo) ListByOwner(ctx context.Context, userID int64) ([]model.UserAddress, error) {
	list := make([]model.UserAddress, 0)
	err := sqlx.SelectContext(ctx, r.db, &list,
		`SELECT `+addressColumns+` FROM user_address
		  WHERE owner_user_id = $1
		  ORDER BY is_default DESC, id DESC`, userID)
	if err != nil {
		return nil, err
	}
	return list, nil
}

// GetByID 取单条地址，**同时校验归属**。
// 把 owner_user_id 写进 WHERE 而不是查出来再比对，是为了从 SQL 层彻底断掉越权读取，
// 也让「不存在」与「不属于你」返回同一个 errs.ErrNotFound（不泄露他人地址是否存在）。
func (r *AddressRepo) GetByID(ctx context.Context, userID, id int64) (*model.UserAddress, error) {
	var a model.UserAddress
	err := sqlx.GetContext(ctx, r.db, &a,
		`SELECT `+addressColumns+` FROM user_address
		  WHERE id = $1 AND owner_user_id = $2`, id, userID)
	if err != nil {
		return nil, normalize(err)
	}
	return &a, nil
}

// GetDefault 取默认地址。没有默认地址时返回 errs.ErrNotFound，
// 调用方（下单页）据此提示「请先选择收货地址」，而不是当成错误。
func (r *AddressRepo) GetDefault(ctx context.Context, userID int64) (*model.UserAddress, error) {
	var a model.UserAddress
	err := sqlx.GetContext(ctx, r.db, &a,
		`SELECT `+addressColumns+` FROM user_address
		  WHERE owner_user_id = $1 AND is_default
		  ORDER BY id DESC LIMIT 1`, userID)
	if err != nil {
		return nil, normalize(err)
	}
	return &a, nil
}

func (r *AddressRepo) CountByOwner(ctx context.Context, userID int64) (int, error) {
	var n int
	err := sqlx.GetContext(ctx, r.db, &n,
		`SELECT count(*) FROM user_address WHERE owner_user_id = $1`, userID)
	return n, err
}

func (r *AddressRepo) Create(ctx context.Context, a *model.UserAddress) error {
	return sqlx.GetContext(ctx, r.db, &a.ID,
		`INSERT INTO user_address
		   (owner_user_id, receiver, phone, province, city, district, detail, is_default)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
		a.OwnerUserID, a.Receiver, a.Phone, a.Province, a.City, a.District, a.Detail, a.IsDefault)
}

// Update 覆盖地址内容。is_default 有意不在这里改 —— 它涉及「同用户其它地址取消默认」，
// 必须走 SetDefault 的事务路径，否则会撞 uq_user_address_default 部分唯一索引。
func (r *AddressRepo) Update(ctx context.Context, a *model.UserAddress) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE user_address
		    SET receiver=$1, phone=$2, province=$3, city=$4, district=$5, detail=$6,
		        updated_at = now()
		  WHERE id=$7 AND owner_user_id=$8`,
		a.Receiver, a.Phone, a.Province, a.City, a.District, a.Detail,
		a.ID, a.OwnerUserID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errs.ErrNotFound
	}
	return nil
}

// Delete 删除地址，带归属校验。
func (r *AddressRepo) Delete(ctx context.Context, userID, id int64) error {
	res, err := r.db.ExecContext(ctx,
		`DELETE FROM user_address WHERE id = $1 AND owner_user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errs.ErrNotFound
	}
	return nil
}

// ClearDefault 清掉该用户当前的默认标记。
//
// 必须在 SetDefault 的**同一事务内先执行**：
// uq_user_address_default 是「每用户至多一条 is_default=true」的部分唯一索引，
// 不先清旧的就直接置新的 → 唯一约束冲突（23505）。
// 用 `AND is_default` 限定，避免无谓地更新所有行（会白白触发 updated_at 触发器）。
func (r *AddressRepo) ClearDefault(ctx context.Context, userID int64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE user_address SET is_default = false
		  WHERE owner_user_id = $1 AND is_default`, userID)
	return err
}

// SetDefault 把指定地址置为默认（调用方需已清过旧默认）。
func (r *AddressRepo) SetDefault(ctx context.Context, userID, id int64) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE user_address SET is_default = true
		  WHERE id = $1 AND owner_user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errs.ErrNotFound
	}
	return nil
}

// CountDefault 统计该用户的默认地址数量，用于服务层的兜底校验。
func (r *AddressRepo) CountDefault(ctx context.Context, userID int64) (int, error) {
	var n int
	err := sqlx.GetContext(ctx, r.db, &n,
		`SELECT count(*) FROM user_address WHERE owner_user_id = $1 AND is_default`, userID)
	return n, err
}
