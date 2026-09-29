// File Name: credit_service.go
// Created Time: 2026-09-28 09:25:00
//
// 信用分的授权与查询。
//
// 「授权」在真实芝麻场景里是：用户在小程序侧拉起芝麻授权页 → 拿到授权码 →
// 后端查询信用分 → 落库。本地模拟实现沿用同一套流程（只是分数来源不同），
// 这样将来换成真实芝麻时，上层接口与前端交互都不用改。
package service

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/internal/repository"
	"rental-platform/pkg/errs"
)

// TierRule 押金档位规则（供前端展示「怎么算的」）
type TierRule struct {
	MinScore int    `json:"min_score"`
	Tier     string `json:"tier"`
	Label    string `json:"label"`
	Discount string `json:"discount"`
}

// CreditStatus 当前用户的信用与押金状态
type CreditStatus struct {
	// Authorized 是否已授权且未过期
	Authorized bool `json:"authorized"`
	// Score 信用分（未授权时为 0）
	Score int `json:"score"`
	// DepositTier 该分数对应的押金档位：full_free / half / full
	DepositTier string `json:"deposit_tier"`
	// TierLabel 档位中文说明，前端直接展示
	TierLabel string `json:"tier_label"`
	// AuthorizedAt 授权时间（未授权为空）
	AuthorizedAt *time.Time `json:"authorized_at,omitempty"`
	// ScorerName 分数来源实现（local / zhima），便于排查「怎么是这个分」
	ScorerName string `json:"scorer"`
	// Rules 押金规则表，前端用于展示「信用分怎么影响押金」
	Rules []TierRule `json:"rules"`
}

// TierLabelOf 档位的中文说明
func TierLabelOf(tier string) string {
	switch tier {
	case DepositTierFullFree:
		return "信用良好，已全免押金"
	case DepositTierHalf:
		return "信用较好，押金减半"
	default:
		return "押金全额"
	}
}

// DepositRules 返回押金规则表（与 DepositFor 的判定必须一致）
func DepositRules() []TierRule {
	return []TierRule{
		{MinScore: CreditScoreFullFreeMin, Tier: DepositTierFullFree, Label: "全免押金", Discount: "免押"},
		{MinScore: CreditScoreHalfMin, Tier: DepositTierHalf, Label: "押金减半", Discount: "5 折"},
		{MinScore: 0, Tier: DepositTierFull, Label: "押金全额", Discount: "无优惠"},
	}
}

type CreditService struct {
	scorer   CreditScorer
	userRepo *repository.AppUserRepo
}

func NewCreditService(db *sqlx.DB, scorer CreditScorer) *CreditService {
	return &CreditService{
		scorer:   scorer,
		userRepo: repository.NewAppUserRepo(db),
	}
}

// Authorize 完成一次信用授权：取分 → 落库 → 返回最新状态。
//
// `mockScore > 0` 表示指定分数，**仅本地实现支持**（用于测试各押金档位），
// 真实实现会忽略它（见 CreditScorer.Authorize 的约定）。
func (s *CreditService) Authorize(
	ctx context.Context, userID int64, mockScore int,
) (*CreditStatus, error) {
	u, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	score, err := s.scorer.Authorize(ctx, u, mockScore)
	if err != nil {
		// 例如芝麻未签约 —— 必须把原因透出去，不能静默给个分数
		return nil, fmt.Errorf("%w: %v", errs.ErrInvalidArgument, err)
	}

	if err := s.userRepo.UpdateCreditScore(ctx, userID, score); err != nil {
		return nil, err
	}

	// 重新读一遍拿到落库后的授权时间（避免本地拼时间与 DB 不一致）
	u, err = s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.statusOf(ctx, u), nil
}

// Status 查询当前信用状态（不触发授权）。
func (s *CreditService) Status(ctx context.Context, userID int64) (*CreditStatus, error) {
	u, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.statusOf(ctx, u), nil
}

func (s *CreditService) statusOf(ctx context.Context, u *model.AppUser) *CreditStatus {
	st := &CreditStatus{
		ScorerName: s.scorer.Name(),
		Rules:      DepositRules(),
	}
	score, valid := s.scorer.Score(ctx, u)
	if !valid {
		// 未授权/过期：押金按全额，前端据此提示「授权后可减免」
		st.DepositTier = DepositTierFull
		st.TierLabel = TierLabelOf(DepositTierFull)
		return st
	}
	st.Authorized = true
	st.Score = score
	st.AuthorizedAt = u.CreditAuthorizedAt
	st.DepositTier = tierOf(score)
	st.TierLabel = TierLabelOf(st.DepositTier)
	return st
}
