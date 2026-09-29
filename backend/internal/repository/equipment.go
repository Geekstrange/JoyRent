// File Name: equipment.go
// Created Time: 2026-09-22 19:01:28
// Update Time: 2026-09-22 19:01:28

package repository

import (
	"context"
	"time"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/pkg/errs"
)

type EquipmentRepo struct{ db ExtContext }

func NewEquipmentRepo(db ExtContext) *EquipmentRepo { return &EquipmentRepo{db: db} }

func (r *EquipmentRepo) WithTx(tx *sqlx.Tx) *EquipmentRepo { return &EquipmentRepo{db: tx} }

type EquipmentFilter struct {
	CategoryID   int64
	Keyword      string
	OnlyHasAvail bool
}

func (r *EquipmentRepo) List(ctx context.Context, merchantID int64, f EquipmentFilter) ([]model.Equipment, error) {
	q := `SELECT id, merchant_id, category_id, name, spec, description, cover_path,
	             daily_cents, deposit_cents, total, created_at, updated_at
	      FROM equipment WHERE merchant_id = $1`
	args := []any{merchantID}

	if f.CategoryID > 0 {
		args = append(args, f.CategoryID)
		q += ` AND category_id = $` + itoa(len(args))
	}
	if f.Keyword != "" {
		args = append(args, "%"+f.Keyword+"%")
		q += ` AND name ILIKE $` + itoa(len(args))
	}
	q += ` ORDER BY id`

	var list []model.Equipment
	if err := sqlx.SelectContext(ctx, r.db, &list, q, args...); err != nil {
		return nil, err
	}
	return list, nil
}

func (r *EquipmentRepo) GetByID(ctx context.Context, merchantID, id int64) (*model.Equipment, error) {
	var e model.Equipment
	err := sqlx.GetContext(ctx, r.db, &e,
		`SELECT id, merchant_id, category_id, name, spec, description, cover_path,
		        daily_cents, deposit_cents, total, created_at, updated_at
		 FROM equipment WHERE id = $1 AND merchant_id = $2`, id, merchantID)
	if err != nil {
		return nil, normalize(err)
	}
	return &e, nil
}

func (r *EquipmentRepo) Create(ctx context.Context, e *model.Equipment) error {
	return sqlx.GetContext(ctx, r.db, &e.ID,
		`INSERT INTO equipment
		 (merchant_id, category_id, name, spec, description, cover_path,
		  daily_cents, deposit_cents, total)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
		e.MerchantID, e.CategoryID, e.Name, e.Spec, e.Description, e.CoverPath,
		e.DailyCents, e.DepositCents, e.Total)
}

func (r *EquipmentRepo) Update(ctx context.Context, e *model.Equipment) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE equipment SET category_id=$1, name=$2, spec=$3, description=$4,
		        cover_path=$5, daily_cents=$6, deposit_cents=$7, total=$8
		 WHERE id=$9 AND merchant_id=$10`,
		e.CategoryID, e.Name, e.Spec, e.Description, e.CoverPath,
		e.DailyCents, e.DepositCents, e.Total, e.ID, e.MerchantID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errs.ErrNotFound
	}
	return nil
}

func (r *EquipmentRepo) Delete(ctx context.Context, merchantID, id int64) error {
	res, err := r.db.ExecContext(ctx,
		`DELETE FROM equipment WHERE id=$1 AND merchant_id=$2`, id, merchantID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errs.ErrNotFound
	}
	return nil
}

// CountActiveOrders 统计进行中的订单数，用于删除前校验
func (r *EquipmentRepo) CountActiveOrders(ctx context.Context, merchantID, equipmentID int64) (int, error) {
	var n int
	err := sqlx.GetContext(ctx, r.db, &n,
		`SELECT COUNT(*) FROM "order"
		 WHERE merchant_id = $1 AND equipment_id = $2
		   AND status IN ('pending','paid','renting')`, merchantID, equipmentID)
	return n, err
}

// ---------- 设备单元 ----------

type UnitRepo struct{ db ExtContext }

func NewUnitRepo(db ExtContext) *UnitRepo { return &UnitRepo{db: db} }

func (r *UnitRepo) WithTx(tx *sqlx.Tx) *UnitRepo { return &UnitRepo{db: tx} }

func (r *UnitRepo) ListByEquipment(ctx context.Context, merchantID, equipmentID int64) ([]model.EquipmentUnit, error) {
	var list []model.EquipmentUnit
	err := sqlx.SelectContext(ctx, r.db, &list,
		`SELECT id, merchant_id, equipment_id, sn, status, created_at, updated_at
		 FROM equipment_unit
		 WHERE merchant_id = $1 AND equipment_id = $2
		 ORDER BY id`, merchantID, equipmentID)
	return list, err
}

func (r *UnitRepo) GetByID(ctx context.Context, merchantID, id int64) (*model.EquipmentUnit, error) {
	var u model.EquipmentUnit
	err := sqlx.GetContext(ctx, r.db, &u,
		`SELECT id, merchant_id, equipment_id, sn, status, created_at, updated_at
		 FROM equipment_unit WHERE id = $1 AND merchant_id = $2`, id, merchantID)
	if err != nil {
		return nil, normalize(err)
	}
	return &u, nil
}

// ListCandidateUnits 查询某设备在给定期内未被占用的单元
// 返回的列表按 id 升序，调用方逐个尝试占用
func (r *UnitRepo) ListCandidateUnits(ctx context.Context, equipmentID int64, startAt, endAt time.Time) ([]int64, error) {
	var ids []int64
	err := sqlx.SelectContext(ctx, r.db, &ids,
		`SELECT u.id FROM equipment_unit u
		 WHERE u.equipment_id = $1
		   AND u.status = 'idle'
		   AND NOT EXISTS (
		       SELECT 1 FROM equipment_unit_occupation o
		       WHERE o.unit_id = u.id
		         AND o.period && daterange($2::date, $3::date + 1, '[)')
		   )
		 ORDER BY u.id`,
		equipmentID, dateOnly(startAt), dateOnly(endAt))
	return ids, err
}

// CountUsable 统计某设备可参与分配的单元数（status = 'idle'）。
//
// 可用量必须以真实存在的单元为准，而不是 equipment.total 这个"声明的总台数"。
// 两者可能不一致：新建设备时只填了 total 还没点「批量生成」，此时
// 实际一台可租的机器都没有，若按 total 计算会虚报可用量。
func (r *UnitRepo) CountUsable(ctx context.Context, equipmentID int64) (int, error) {
	var n int
	err := sqlx.GetContext(ctx, r.db, &n,
		`SELECT COUNT(*) FROM equipment_unit
		 WHERE equipment_id = $1 AND status = 'idle'`, equipmentID)
	return n, err
}

// CountAll 统计某设备已生成的单元总数（含维护/停用）。
func (r *UnitRepo) CountAll(ctx context.Context, equipmentID int64) (int, error) {
	var n int
	err := sqlx.GetContext(ctx, r.db, &n,
		`SELECT COUNT(*) FROM equipment_unit WHERE equipment_id = $1`, equipmentID)
	return n, err
}

func (r *UnitRepo) Create(ctx context.Context, u *model.EquipmentUnit) error {
	return sqlx.GetContext(ctx, r.db, &u.ID,
		`INSERT INTO equipment_unit (merchant_id, equipment_id, sn, status)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		u.MerchantID, u.EquipmentID, u.SN, u.Status)
}

// CreateBatch 批量生成单元，sn 前缀为 equipmentID-，序号 4 位补零
func (r *UnitRepo) CreateBatch(ctx context.Context, merchantID, equipmentID int64, from, to int) (int, error) {
	tag, err := r.db.ExecContext(ctx,
		`INSERT INTO equipment_unit (merchant_id, equipment_id, sn, status)
		 SELECT $1, $2, $3 || '-' || LPAD(g::text, 4, '0'), 'idle'
		 FROM generate_series($4::int, $5::int) g
		 ON CONFLICT (merchant_id, sn) DO NOTHING`,
		merchantID, equipmentID, intToStr(int(equipmentID)), from, to)
	if err != nil {
		return 0, err
	}
	n, _ := tag.RowsAffected()
	return int(n), nil
}

func (r *UnitRepo) UpdateStatus(ctx context.Context, merchantID, id int64, status string) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE equipment_unit SET status = $1 WHERE id = $2 AND merchant_id = $3`,
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

// ---------- 内部工具 ----------

func dateOnly(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return intToStr(n)
}

func intToStr(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// itoa / intToStr 只是为了拼 SQL 占位符（$1 / $2）。实际可以直接用 strconv.Itoa。下面把这些换成标准库版本：
// 顶部 import 加 "strconv"
// 全局替换 itoa -> strconv.Itoa, intToStr -> strconv.Itoa，并删除最后两个函数
// 最终 equipment.go 应该用 strconv.Itoa，不再需要自定义。为了节省篇幅这里不重复。请以标准库为准。
