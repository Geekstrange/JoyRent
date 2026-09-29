// File Name: auth.go
// Created Time: 2026-09-22 19:11:24
// Update Time: 2026-09-22 19:11:24

package service

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"

	"rental-platform/internal/model"
	"rental-platform/internal/repository"
	"rental-platform/pkg/errs"
	"rental-platform/pkg/jwtutil"
)

// WechatAuthClient 微信登录换 openID 的抽象，第四批接入真实 SDK
type WechatAuthClient interface {
	Code2Session(ctx context.Context, code string) (openID, unionID string, err error)
}

// AlipayAuthClient 支付宝登录换 user_id 的抽象
type AlipayAuthClient interface {
	AuthCode2UserID(ctx context.Context, code string) (userID string, err error)
}

type AuthService struct {
	db        *sqlx.DB
	userRepo  *repository.AppUserRepo
	adminRepo *repository.AdminUserRepo
	jwtMgr    *jwtutil.Manager
	wechat    WechatAuthClient
	alipay    AlipayAuthClient
}

func NewAuthService(
	db *sqlx.DB,
	jwtMgr *jwtutil.Manager,
	wechat WechatAuthClient,
	alipay AlipayAuthClient,
) *AuthService {
	return &AuthService{
		db:        db,
		userRepo:  repository.NewAppUserRepo(db),
		adminRepo: repository.NewAdminUserRepo(db),
		jwtMgr:    jwtMgr,
		wechat:    wechat,
		alipay:    alipay,
	}
}

// LoginWechat 微信小程序登录，首次进入自动注册
func (s *AuthService) LoginWechat(ctx context.Context, code string) (string, *model.AppUser, error) {
	if s.wechat == nil {
		return "", nil, fmt.Errorf("%w: 微信登录未配置", errs.ErrInvalidArgument)
	}
	openID, unionID, err := s.wechat.Code2Session(ctx, code)
	if err != nil {
		// 未配置 app_id/app_secret 属于**配置缺失**，不是服务端故障，
		// 返回 500 会让人误以为后端崩了。归为参数错误(400)并给出可操作的提示，
		// 前端据此可以自动回落到 dev-login 旁路（本地联调场景）。
		if errors.Is(err, ErrWechatNotConfigured) {
			return "", nil, fmt.Errorf(
				"%w: 未配置小程序 app_id/app_secret，本地联调请改用 /app/auth/dev-login",
				errs.ErrInvalidArgument,
			)
		}
		return "", nil, fmt.Errorf("code2session: %w", err)
	}
	if openID == "" {
		return "", nil, errs.ErrUnauthorized
	}
	u := &model.AppUser{
		Platform: model.PlatformWechat,
		OpenID:   openID,
		UnionID:  unionID,
	}
	if err := s.userRepo.Upsert(ctx, u); err != nil {
		return "", nil, err
	}
	token, err := s.jwtMgr.Issue(strconv.FormatInt(u.ID, 10), jwtutil.RoleUser, model.PlatformWechat, 0)
	if err != nil {
		return "", nil, err
	}
	return token, u, nil
}

// LoginAlipay 支付宝小程序登录
func (s *AuthService) LoginAlipay(ctx context.Context, code string) (string, *model.AppUser, error) {
	if s.alipay == nil {
		return "", nil, fmt.Errorf("%w: 支付宝登录未配置", errs.ErrInvalidArgument)
	}
	userID, err := s.alipay.AuthCode2UserID(ctx, code)
	if err != nil {
		// 与微信侧保持一致：能力/配置缺失属**参数错误(400)**，不是服务端故障。
		// 若这里返回 500，前端会误以为后端崩了，且无法自动回落到 dev-login 旁路。
		if errors.Is(err, ErrAlipayNotConfigured) {
			return "", nil, fmt.Errorf(
				"%w: 支付宝登录尚未接入（SDK/配置缺失），本地联调请改用 /app/auth/dev-login",
				errs.ErrInvalidArgument,
			)
		}
		return "", nil, fmt.Errorf("alipay auth: %w", err)
	}
	if userID == "" {
		return "", nil, errs.ErrUnauthorized
	}
	u := &model.AppUser{
		Platform: model.PlatformAlipay,
		OpenID:   userID,
	}
	if err := s.userRepo.Upsert(ctx, u); err != nil {
		return "", nil, err
	}
	token, err := s.jwtMgr.Issue(strconv.FormatInt(u.ID, 10), jwtutil.RoleUser, model.PlatformAlipay, 0)
	if err != nil {
		return "", nil, err
	}
	return token, u, nil
}

// LoginAdmin 管理后台登录
func (s *AuthService) LoginAdmin(ctx context.Context, username, password string) (string, *model.AdminUser, error) {
	u, err := s.adminRepo.GetByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, errs.ErrNotFound) {
			return "", nil, errs.ErrUnauthorized
		}
		return "", nil, err
	}
	if u.Status != "active" {
		return "", nil, errs.ErrForbidden
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return "", nil, errs.ErrUnauthorized
	}
	token, err := s.jwtMgr.Issue(
		strconv.FormatInt(u.ID, 10),
		jwtutil.RoleAdmin,
		"",
		u.MerchantID,
	)
	if err != nil {
		return "", nil, err
	}
	return token, u, nil
}

// Me 返回当前用户信息（用户端）
func (s *AuthService) Me(ctx context.Context, userID int64) (*model.AppUser, error) {
	return s.userRepo.GetByID(ctx, userID)
}

// LoginDev 测试态登录旁路：跳过微信/支付宝的 code 换取，直接用 code 拼一个
// 稳定的 open_id 建/取用户并签发 token。仅供本地联调与冒烟测试使用，
// 是否放行由路由层根据配置决定（release 模式下不会注册该路由）。
func (s *AuthService) LoginDev(ctx context.Context, platform, code string) (string, *model.AppUser, error) {
	switch platform {
	case model.PlatformWechat, model.PlatformAlipay:
	default:
		return "", nil, fmt.Errorf("%w: platform 仅支持 wechat / alipay", errs.ErrInvalidArgument)
	}
	if code == "" {
		return "", nil, fmt.Errorf("%w: code 不能为空", errs.ErrInvalidArgument)
	}

	// 同一个 code → 同一个 open_id，保证幂等，多次调用拿到同一个测试用户
	u := &model.AppUser{
		Platform: platform,
		OpenID:   "dev_" + platform + "_" + code,
		Nickname: "冒烟测试用户",
	}
	if err := s.userRepo.Upsert(ctx, u); err != nil {
		return "", nil, err
	}
	// Upsert 只回填 id，状态需要重新读取才能判断
	saved, err := s.userRepo.GetByPlatformOpenID(ctx, platform, u.OpenID)
	if err != nil {
		return "", nil, err
	}
	if saved.Status == "disabled" {
		return "", nil, errs.ErrForbidden
	}
	token, err := s.jwtMgr.Issue(
		strconv.FormatInt(saved.ID, 10), jwtutil.RoleUser, platform, 0,
	)
	if err != nil {
		return "", nil, err
	}
	return token, saved, nil
}

// AdminPasswordMinLen 新密码最小长度
const AdminPasswordMinLen = 6

// ChangeAdminPassword 管理后台修改密码：校验旧密码后写入新密码哈希
func (s *AuthService) ChangeAdminPassword(ctx context.Context, adminID int64, oldPassword, newPassword string) error {
	if adminID <= 0 {
		return errs.ErrUnauthorized
	}
	if len(newPassword) < AdminPasswordMinLen {
		return fmt.Errorf("%w: 新密码至少 %d 位", errs.ErrInvalidArgument, AdminPasswordMinLen)
	}
	if oldPassword == newPassword {
		return fmt.Errorf("%w: 新密码不能与原密码相同", errs.ErrInvalidArgument)
	}

	u, err := s.adminRepo.GetByID(ctx, adminID)
	if err != nil {
		if errors.Is(err, errs.ErrNotFound) {
			return errs.ErrUnauthorized
		}
		return err
	}
	if u.Status != "active" {
		return errs.ErrForbidden
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(oldPassword)); err != nil {
		return fmt.Errorf("%w: 原密码不正确", errs.ErrInvalidArgument)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	return s.adminRepo.UpdatePassword(ctx, adminID, string(hash))
}
