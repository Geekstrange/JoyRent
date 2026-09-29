// File Name: address.go
// Created Time: 2026-09-25 09:00:00
// Update Time: 2026-09-25 09:00:00

package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/internal/repository"
	"rental-platform/pkg/errs"
)

// 单个用户的地址数量上限。地址簿是「常用几个」的场景，
// 不设上限的话会被脚本灌成垃圾数据，列表页也没法用。
const maxAddressPerUser = 20

type AddressService struct {
	db   *sqlx.DB
	repo *repository.AddressRepo
}

func NewAddressService(db *sqlx.DB) *AddressService {
	return &AddressService{
		db:   db,
		repo: repository.NewAddressRepo(db),
	}
}

// AddressInput 新增/编辑地址的入参
type AddressInput struct {
	UserID   int64
	Receiver string
	Phone    string
	Province string
	City     string
	District string
	Detail   string
	// SetDefault 为 true 时把该地址设为默认。
	SetDefault bool
}

// normalize 去空白并校验。返回校验失败的中文说明（空字符串表示通过）。
func (in *AddressInput) normalize() string {
	in.Receiver = strings.TrimSpace(in.Receiver)
	in.Phone = strings.TrimSpace(in.Phone)
	in.Province = strings.TrimSpace(in.Province)
	in.City = strings.TrimSpace(in.City)
	in.District = strings.TrimSpace(in.District)
	in.Detail = strings.TrimSpace(in.Detail)

	switch {
	case in.Receiver == "":
		return "收货人姓名不能为空"
	case len([]rune(in.Receiver)) > 20:
		return "收货人姓名不能超过 20 个字"
	case !phonePattern.MatchString(in.Phone):
		return "手机号格式不正确"
	case in.Province == "":
		return "请选择所在地区"
	case in.Detail == "":
		return "详细地址不能为空"
	case len([]rune(in.Detail)) > 100:
		return "详细地址不能超过 100 个字"
	}
	// 城市缺省时用省补上：部分选择器在直辖市只回传一级
	if in.City == "" {
		in.City = in.Province
	}
	return ""
}

func (s *AddressService) List(ctx context.Context, userID int64) ([]model.UserAddress, error) {
	if userID <= 0 {
		return nil, errs.ErrUnauthorized
	}
	return s.repo.ListByOwner(ctx, userID)
}

func (s *AddressService) Get(ctx context.Context, userID, id int64) (*model.UserAddress, error) {
	if userID <= 0 {
		return nil, errs.ErrUnauthorized
	}
	return s.repo.GetByID(ctx, userID, id)
}

// GetDefault 取默认地址；没有默认地址返回 errs.ErrNotFound，
// handler 会归一化成 200 + null（未设置是正常状态，不是错误）。
func (s *AddressService) GetDefault(ctx context.Context, userID int64) (*model.UserAddress, error) {
	if userID <= 0 {
		return nil, errs.ErrUnauthorized
	}
	return s.repo.GetDefault(ctx, userID)
}

// Create 新增地址。
//
// 两条容易忽略的规则：
//  1. **第一条地址自动成为默认**。否则用户新建完地址，下单页仍取不到默认地址，
//     必须再手动点一次「设为默认」——凭空多一步，且新用户几乎必踩。
//  2. 新增时显式要求设为默认，或库中尚无默认地址，都要走「先清后置」的事务，
//     不能直接 INSERT is_default=true（会撞部分唯一索引）。
func (s *AddressService) Create(ctx context.Context, in AddressInput) (*model.UserAddress, error) {
	if in.UserID <= 0 {
		return nil, fmt.Errorf("%w: 请先登录", errs.ErrUnauthorized)
	}
	if msg := in.normalize(); msg != "" {
		return nil, fmt.Errorf("%w: %s", errs.ErrInvalidArgument, msg)
	}

	n, err := s.repo.CountByOwner(ctx, in.UserID)
	if err != nil {
		return nil, err
	}
	if n >= maxAddressPerUser {
		return nil, fmt.Errorf("%w: 最多只能保存 %d 个收货地址", errs.ErrInvalidArgument, maxAddressPerUser)
	}

	hasDefault, err := s.repo.CountDefault(ctx, in.UserID)
	if err != nil {
		return nil, err
	}
	// 第一条地址 / 显式要求默认 → 成为默认
	wantDefault := in.SetDefault || hasDefault == 0

	a := &model.UserAddress{
		OwnerUserID: in.UserID,
		Receiver:    in.Receiver,
		Phone:       in.Phone,
		Province:    in.Province,
		City:        in.City,
		District:    in.District,
		Detail:      in.Detail,
		IsDefault:   false, // 默认标记统一由 SetDefault 事务来打
	}

	if !wantDefault {
		if err := s.repo.Create(ctx, a); err != nil {
			return nil, err
		}
		return s.repo.GetByID(ctx, in.UserID, a.ID)
	}

	// 需要成为默认：先插（非默认）再在同一事务里清旧默认 + 置新默认
	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	repo := s.repo.WithTx(tx)
	if err := repo.Create(ctx, a); err != nil {
		return nil, err
	}
	if err := repo.ClearDefault(ctx, in.UserID); err != nil {
		return nil, err
	}
	if err := repo.SetDefault(ctx, in.UserID, a.ID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.repo.GetByID(ctx, in.UserID, a.ID)
}

// Update 编辑地址内容。is_default 有意不在这里改（见 SetDefault）。
// 但若该地址**本身就是默认地址**，需要保持它默认（Update 语句没碰 is_default，天然保持）。
func (s *AddressService) Update(ctx context.Context, id int64, in AddressInput) (*model.UserAddress, error) {
	if in.UserID <= 0 {
		return nil, fmt.Errorf("%w: 请先登录", errs.ErrUnauthorized)
	}
	if msg := in.normalize(); msg != "" {
		return nil, fmt.Errorf("%w: %s", errs.ErrInvalidArgument, msg)
	}

	a := &model.UserAddress{
		ID:          id,
		Receiver:    in.Receiver,
		Phone:       in.Phone,
		Province:    in.Province,
		City:        in.City,
		District:    in.District,
		Detail:      in.Detail,
		OwnerUserID: in.UserID,
	}
	// repo.Update 的 WHERE 带 owner_user_id：不属于当前用户 → RowsAffected=0 → ErrNotFound
	if err := s.repo.Update(ctx, a); err != nil {
		return nil, err
	}

	// 编辑时勾选了「设为默认」，顺带切换默认
	if in.SetDefault {
		if err := s.SetDefault(ctx, in.UserID, id); err != nil {
			return nil, err
		}
	}
	return s.repo.GetByID(ctx, in.UserID, id)
}

// SetDefault 切换默认地址。
//
// 先清旧默认再置新默认，必须在**同一事务**内完成 ——
// 中间态（一个默认都没有）不能对外可见，否则并发下单可能读到「无默认地址」。
func (s *AddressService) SetDefault(ctx context.Context, userID, id int64) error {
	if userID <= 0 {
		return fmt.Errorf("%w: 请先登录", errs.ErrUnauthorized)
	}
	// 先确认归属与存在，避免无谓开事务
	if _, err := s.repo.GetByID(ctx, userID, id); err != nil {
		return err
	}

	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	repo := s.repo.WithTx(tx)
	if err := repo.ClearDefault(ctx, userID); err != nil {
		return err
	}
	if err := repo.SetDefault(ctx, userID, id); err != nil {
		return err
	}
	return tx.Commit()
}

// Delete 删除地址。
//
// **删掉默认地址后不自动把默认让给别的地址**：自动提升是"猜"用户意图，
// 而「我明明删了这个，怎么另一个变成默认了」比「没有默认地址」更让人困惑。
// 前端在删除默认地址后引导用户重新指定即可；下单页取不到默认地址时，
// 用列表第一条兜底（见小程序侧 resolveAddress）。
func (s *AddressService) Delete(ctx context.Context, userID, id int64) error {
	if userID <= 0 {
		return fmt.Errorf("%w: 请先登录", errs.ErrUnauthorized)
	}
	return s.repo.Delete(ctx, userID, id)
}
