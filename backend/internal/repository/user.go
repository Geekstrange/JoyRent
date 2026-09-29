// File Name: user.go
// Created Time: 2026-09-22 19:04:15
// Update Time: 2026-09-22 19:04:15

package repository

import (
	"context"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/pkg/errs"
)

// ---------- 小程序用户 ----------

type AppUserRepo struct{ db ExtContext }

func NewAppUserRepo(db ExtContext) *AppUserRepo { return &AppUserRepo{db: db} }

func (r *AppUserRepo) WithTx(tx *sqlx.Tx) *AppUserRepo { return &AppUserRepo{db: tx} }

const appUserColumns = `id, platform, open_id, union_id, nickname, avatar_path,
	phone, status, credit_score, credit_authorized_at, created_at, updated_at`

func (r *AppUserRepo) GetByPlatformOpenID(ctx context.Context, platform, openID string) (*model.AppUser, error) {
	var u model.AppUser
	err := sqlx.GetContext(ctx, r.db, &u,
		`SELECT `+appUserColumns+` FROM app_user
		 WHERE platform = $1 AND open_id = $2`, platform, openID)
	if err != nil {
		return nil, normalize(err)
	}
	return &u, nil
}

func (r *AppUserRepo) GetByID(ctx context.Context, id int64) (*model.AppUser, error) {
	var u model.AppUser
	err := sqlx.GetContext(ctx, r.db, &u,
		`SELECT `+appUserColumns+` FROM app_user WHERE id = $1`, id)
	if err != nil {
		return nil, normalize(err)
	}
	return &u, nil
}

func (r *AppUserRepo) Upsert(ctx context.Context, u *model.AppUser) error {
	return sqlx.GetContext(ctx, r.db, &u.ID,
		`INSERT INTO app_user (platform, open_id, union_id, nickname, avatar_path, phone)
		 VALUES ($1,$2,$3,$4,$5,$6)
		 ON CONFLICT (platform, open_id) DO UPDATE
		 SET union_id    = COALESCE(NULLIF(EXCLUDED.union_id,''), app_user.union_id),
		     nickname    = COALESCE(NULLIF(EXCLUDED.nickname,''), app_user.nickname),
		     avatar_path = COALESCE(NULLIF(EXCLUDED.avatar_path,''), app_user.avatar_path),
		     updated_at  = now()
		 RETURNING id`,
		u.Platform, u.OpenID, u.UnionID, u.Nickname, u.AvatarPath, u.Phone)
}

// UpdateCreditScore 写入信用授权结果（分数 + 授权时间）。
//
// ⚠️ 授权时间必须一并更新：`service.CreditScorer.Score` 要靠它判断是否过期。
func (r *AppUserRepo) UpdateCreditScore(ctx context.Context, userID int64, score int) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE app_user
		    SET credit_score = $1, credit_authorized_at = now(), updated_at = now()
		  WHERE id = $2`, score, userID)
	return err
}

func (r *AppUserRepo) List(ctx context.Context, keyword string) ([]model.AppUser, error) {
	var list []model.AppUser
	q := `SELECT ` + appUserColumns + ` FROM app_user`
	args := []any{}
	if keyword != "" {
		q += ` WHERE phone ILIKE $1 OR nickname ILIKE $1`
		args = append(args, "%"+keyword+"%")
	}
	q += ` ORDER BY id DESC LIMIT 500`
	if err := sqlx.SelectContext(ctx, r.db, &list, q, args...); err != nil {
		return nil, err
	}
	return list, nil
}

func (r *AppUserRepo) ToggleStatus(ctx context.Context, id int64) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE app_user
		 SET status = CASE status WHEN 'active' THEN 'disabled' ELSE 'active' END
		 WHERE id = $1`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errs.ErrNotFound
	}
	return nil
}

// ---------- 管理后台账号 ----------

type AdminUserRepo struct{ db ExtContext }

func NewAdminUserRepo(db ExtContext) *AdminUserRepo { return &AdminUserRepo{db: db} }

func (r *AdminUserRepo) WithTx(tx *sqlx.Tx) *AdminUserRepo { return &AdminUserRepo{db: tx} }

func (r *AdminUserRepo) GetByUsername(ctx context.Context, username string) (*model.AdminUser, error) {
	var u model.AdminUser
	err := sqlx.GetContext(ctx, r.db, &u,
		`SELECT id, username, password_hash, merchant_id, role, status,
		        created_at, updated_at
		 FROM admin_user WHERE username = $1`, username)
	if err != nil {
		return nil, normalize(err)
	}
	return &u, nil
}

// GetByID 按主键取管理后台账号
func (r *AdminUserRepo) GetByID(ctx context.Context, id int64) (*model.AdminUser, error) {
	var u model.AdminUser
	err := sqlx.GetContext(ctx, r.db, &u,
		`SELECT id, username, password_hash, merchant_id, role, status,
		        created_at, updated_at
		 FROM admin_user WHERE id = $1`, id)
	if err != nil {
		return nil, normalize(err)
	}
	return &u, nil
}

// UpdatePassword 更新指定账号的密码哈希
func (r *AdminUserRepo) UpdatePassword(ctx context.Context, id int64, passwordHash string) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE admin_user
		 SET password_hash = $2, updated_at = now()
		 WHERE id = $1`, id, passwordHash)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errs.ErrNotFound
	}
	return nil
}
