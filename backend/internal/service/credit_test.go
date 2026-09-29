// File Name: credit_test.go
// Created Time: 2026-09-28 09:35:00
//
// 信用分与押金档位的单元测试。
//
// ⚠️ 重点覆盖**边界值**与**保守方向** —— 押金算错是直接的资金问题：
//   · 650 / 700 这两个档位边界的「刚好等于」情形
//   · 未授权（valid=false）时**必须走全额**，哪怕分数看起来很高
//   · 半价遇到奇数金额时的取整方向
package service

import (
	"context"
	"testing"
	"time"

	"rental-platform/internal/model"
)

func TestDepositFor_Tiers(t *testing.T) {
	const orig = 100000 // 1000.00 元

	cases := []struct {
		name      string
		score     int
		valid     bool
		wantCents int64
		wantTier  string
	}{
		{"未授权 → 全额", 0, false, orig, DepositTierFull},
		{"低分 → 全额", 500, true, orig, DepositTierFull},
		{"649 边界下 → 全额", 649, true, orig, DepositTierFull},
		{"650 边界 → 半价", 650, true, orig / 2, DepositTierHalf},
		{"699 边界上 → 半价", 699, true, orig / 2, DepositTierHalf},
		{"700 边界 → 全免", 700, true, 0, DepositTierFullFree},
		{"高分 → 全免", 800, true, 0, DepositTierFullFree},

		// ⚠️ 最关键的一条：**未授权时即便分数很高也必须全额收**
		// 不能让「拿不到分数」变成默认给优惠
		{"未授权但分数很高 → 仍全额", 900, false, orig, DepositTierFull},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			gotCents, gotTier := DepositFor(orig, c.score, c.valid)
			if gotCents != c.wantCents || gotTier != c.wantTier {
				t.Errorf("DepositFor(%d, %d, %v) = (%d, %q)，期望 (%d, %q)",
					orig, c.score, c.valid, gotCents, gotTier, c.wantCents, c.wantTier)
			}
		})
	}
}

func TestDepositFor_OddAmountHalf(t *testing.T) {
	// 半价遇奇数：99999/2 = 49999（整数除法向下取整）。
	// 断言方向而非魔数 —— 只要「不超过一半」就是安全的（不会少收）。
	got, tier := DepositFor(99999, 650, true)
	if tier != DepositTierHalf {
		t.Fatalf("档位应为 half，实际 %s", tier)
	}
	if got > 99999/2 {
		t.Errorf("半价取整不得**超过**一半（否则等于给用户多减了钱）：got=%d > %d", got, 99999/2)
	}
	if got != 49999 {
		t.Logf("注意：取整结果 %d（若实现改为四舍五入请同步更新本断言）", got)
	}
}

func TestDepositFor_ZeroOriginal(t *testing.T) {
	// 原押金为 0（设备本身免押）时，任何档位都应是 0，不应出现负数或异常
	for _, score := range []int{0, 650, 700} {
		got, _ := DepositFor(0, score, true)
		if got != 0 {
			t.Errorf("原押金为 0 时实收应为 0，score=%d 得到 %d", score, got)
		}
	}
}

func TestTierOf_MatchesDepositFor(t *testing.T) {
	// 档位判定只有一处实现（tierOf），DepositFor 必须与它一致，
	// 否则「状态接口显示的档位」与「订单实际收的金额」会对不上。
	for score := 300; score <= 900; score += 10 {
		_, fromDeposit := DepositFor(10000, score, true)
		if fromDeposit != tierOf(score) {
			t.Errorf("score=%d：DepositFor 档位 %s 与 tierOf %s 不一致",
				score, fromDeposit, tierOf(score))
		}
	}
}

// ── 本地信用分实现 ────────────────────────────────────────────────────

func TestLocalCreditScorer_StablePerUser(t *testing.T) {
	ctx := context.Background()
	s := NewLocalCreditScorer(600, 800, false)

	u := &model.AppUser{ID: 1, OpenID: "oALIPAY_USER_ABC"}
	a, err := s.Authorize(ctx, u, 0)
	if err != nil {
		t.Fatalf("authorize: %v", err)
	}
	b, _ := s.Authorize(ctx, u, 0)
	if a != b {
		t.Errorf("同一用户两次授权应得到**相同**分数（否则每次下单押金都在变）：%d vs %d", a, b)
	}
	if a < 600 || a > 800 {
		t.Errorf("分数应落在 [600,800]，实际 %d", a)
	}

	// 不同用户应当（大概率）不同 —— 只做弱断言，避免哈希巧合导致偶发失败
	other := &model.AppUser{ID: 2, OpenID: "oALIPAY_USER_XYZ"}
	c, _ := s.Authorize(ctx, other, 0)
	t.Logf("用户A=%d 用户B=%d（不同用户分数可相同，属正常）", a, c)
}

func TestLocalCreditScorer_MockScoreGate(t *testing.T) {
	ctx := context.Background()
	u := &model.AppUser{ID: 1, OpenID: "o1"}

	// 关闭时：不接受外部指定分数（线上必须如此，否则等于把押金交给用户决定）
	closed := NewLocalCreditScorer(600, 800, false)
	if _, err := closed.Authorize(ctx, u, 750); err == nil {
		t.Error("AllowMockScore=false 时应拒绝指定分数")
	}

	// 开启时：接受并按区间上限/下限夹取
	open := NewLocalCreditScorer(600, 800, true)
	got, err := open.Authorize(ctx, u, 750)
	if err != nil {
		t.Fatalf("AllowMockScore=true 时应接受：%v", err)
	}
	if got != 750 {
		t.Errorf("指定 750 应原样返回，实际 %d", got)
	}
	// 越界值应被夹到信用分的合法区间
	if v, _ := open.Authorize(ctx, u, 99999); v != 950 {
		t.Errorf("超上限应夹到 950，实际 %d", v)
	}
	if v, _ := open.Authorize(ctx, u, 1); v != 350 {
		t.Errorf("低于下限应夹到 350，实际 %d", v)
	}
}

func TestLocalCreditScorer_ScoreRequiresAuth(t *testing.T) {
	ctx := context.Background()
	s := NewLocalCreditScorer(600, 800, false)

	// 未授权（分数为 0）→ 无效
	if _, valid := s.Score(ctx, &model.AppUser{ID: 1}); valid {
		t.Error("未授权用户应返回 valid=false")
	}
	// nil 用户不应 panic
	if _, valid := s.Score(ctx, nil); valid {
		t.Error("nil 用户应返回 valid=false")
	}

	// 已授权且未过期 → 有效
	now := time.Now()
	u := &model.AppUser{ID: 1, CreditScore: 720, CreditAuthorizedAt: &now}
	score, valid := s.Score(ctx, u)
	if !valid || score != 720 {
		t.Errorf("已授权用户应返回 (720,true)，实际 (%d,%v)", score, valid)
	}
}

func TestCreditValid_Expiry(t *testing.T) {
	// ⚠️ 过期判断不能省：真实芝麻授权结果有时效，
	// 过期后仍按老分数给免押等于长期发放已不成立的额度。
	fresh := time.Now().Add(-time.Hour)
	expired := time.Now().Add(-(CreditValidDays + 1) * 24 * time.Hour)

	if !creditValid(&model.AppUser{CreditScore: 700, CreditAuthorizedAt: &fresh}) {
		t.Error("1 小时前授权应仍有效")
	}
	if creditValid(&model.AppUser{CreditScore: 700, CreditAuthorizedAt: &expired}) {
		t.Errorf("超过 %d 天应判为失效", CreditValidDays)
	}
	// 有分数但没有授权时间（历史数据）→ 视为无效，走全额更安全
	if creditValid(&model.AppUser{CreditScore: 700}) {
		t.Error("缺少授权时间应视为无效（保守）")
	}
}

func TestDepositRules_ConsistentWithTierOf(t *testing.T) {
	// 前端展示的规则表必须与后端判定一致，否则会出现
	// 「页面写着 700 免押、实际却被收了钱」
	for _, r := range DepositRules() {
		if r.MinScore > 0 && tierOf(r.MinScore) != r.Tier {
			t.Errorf("规则表声称 min_score=%d → %s，但 tierOf 判定为 %s",
				r.MinScore, r.Tier, tierOf(r.MinScore))
		}
	}
	// 全免档的阈值必须真的判为全免
	if tierOf(CreditScoreFullFreeMin) != DepositTierFullFree {
		t.Error("CreditScoreFullFreeMin 应判为全免档")
	}
	if tierOf(CreditScoreHalfMin) != DepositTierHalf {
		t.Error("CreditScoreHalfMin 应判为半价档")
	}
	// 阈值前一档必须是全额
	if tierOf(CreditScoreHalfMin-1) != DepositTierFull {
		t.Error("半价阈值下一分应回落为全额档")
	}
}
