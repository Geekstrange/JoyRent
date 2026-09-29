// File Name: credit.go
// Created Time: 2026-09-28 09:00:00
//
// 信用分与押金减免。
//
// ── 为什么要有这一层抽象 ──────────────────────────────────────────────
// 真实芝麻信用分（`zhima.credit.score.get`）**需要企业实名认证 + 签约芝麻免押产品**，
// 且该产品目前是**邀约制、不支持自助接入**（见支付宝开放平台「接入准备」文档：
// 「目前芝麻免押产品仅开放汽车免押租赁、线上实物免押租赁、充电宝免押租赁、
//   两轮电动车及换电免押租赁、线下共享免押租赁五个信用解决方案支持商家自助接入。
//   目前为邀约制，不支持自助接入」）。
//
// 也就是说**本地开发阶段不可能拿到真实分数**。因此把「分数从哪来」抽成接口：
//   · LocalCreditScorer  —— 本地实现：按用户标识生成**稳定**的模拟分，
//     便于完整跑通「授权 → 算押金 → 下单 → 支付」全链路并做端到端验证
//   · ZhimaCreditScorer  —— 真实芝麻实现（占位，签约并配好 serviceId 后填充）
//
// 上层（订单服务）只依赖 `CreditScorer` 接口，后续切换实现**不需要改业务代码**。
package service

import (
	"context"
	"fmt"
	"hash/fnv"
	"time"

	"rental-platform/internal/model"
)

// ── 押金档位 ──────────────────────────────────────────────────────────

// 押金减免档位标识（落库到 order.deposit_tier，便于统计「免押带来的转化」）
const (
	DepositTierFullFree = "full_free" // 全免押
	DepositTierHalf     = "half"      // 半价
	DepositTierFull     = "full"      // 全额
)

// 信用分档位阈值。
//
// 规则（与产品确认）：
//
//	score >= 700          → 全免押
//	650 <= score < 700    → 减半
//	其余 / 未授权          → 全额
const (
	CreditScoreFullFreeMin = 700
	CreditScoreHalfMin     = 650
)

// CreditValidDays 信用分有效期（天）。
// 真实芝麻的授权结果也有时效，过期需重新授权；本地模拟沿用同一语义，
// 避免「一套代码两套行为」。
const CreditValidDays = 30

// tierOf 返回分数对应的押金档位（只判档位，不涉及金额）。
//
// 把档位判定单独抽出来，是为了让「档位」与「金额」两个关注点各只有一处实现 ——
// 状态查询接口只要档位，订单创建要金额，两者复用同一份判定，不会漂移。
func tierOf(score int) string {
	switch {
	case score >= CreditScoreFullFreeMin:
		return DepositTierFullFree
	case score >= CreditScoreHalfMin:
		return DepositTierHalf
	default:
		return DepositTierFull
	}
}

// DepositFor 按信用分计算**实收押金**。
//
// ⚠️ `valid=false`（未授权/取不到分）时一律走**全额** —— 保守方向不能反。
// 宁可多收押金，也绝不能因为「拿不到分数」就默认给优惠。
func DepositFor(originalCents int64, score int, valid bool) (actual int64, tier string) {
	if !valid {
		return originalCents, DepositTierFull
	}
	switch tier = tierOf(score); tier {
	case DepositTierFullFree:
		return 0, tier
	case DepositTierHalf:
		return originalCents / 2, tier
	default:
		return originalCents, tier
	}
}

// ── 信用分来源抽象 ────────────────────────────────────────────────────

// CreditScorer 信用分来源。
type CreditScorer interface {
	// Name 实现名，用于启动日志与排查
	Name() string

	// Authorize 完成一次信用授权，返回信用分。
	//
	// mockScore > 0 表示调用方指定分数 —— **仅本地实现支持**，用于测试各档位边界；
	// 真实实现应忽略该参数（返回错误或直接无视），否则等于允许用户自己报分。
	Authorize(ctx context.Context, user *model.AppUser, mockScore int) (int, error)

	// Score 读取**当前有效**的信用分。
	// valid=false 表示未授权或已过期，调用方应据此走全额押金分支。
	Score(ctx context.Context, user *model.AppUser) (score int, valid bool)
}

// creditValid 判断 user 记录里的信用分是否仍然有效。
//
// ⚠️ 过期判断不能省：真实芝麻的授权结果是有时效的，
// 若把过期分数一直当有效，用户就会长期享受早已不成立的免押额度。
// 两个实现共用本函数，保证行为一致。
func creditValid(user *model.AppUser) bool {
	if user == nil || user.CreditScore <= 0 || user.CreditAuthorizedAt == nil {
		return false
	}
	return time.Since(*user.CreditAuthorizedAt) <= CreditValidDays*24*time.Hour
}

// ── 本地实现（开发/联调） ─────────────────────────────────────────────

// LocalCreditScorer 本地信用分实现。
//
// 分数生成策略：对用户标识做 **FNV 哈希**，映射到 [MinScore, MaxScore]。
// 用哈希而非随机数，是为了**同一用户始终得到同一个分** —— 这样
// 「授权一次 → 多次下单」的押金一致，不会出现「每次下单押金都变」的怪异现象。
type LocalCreditScorer struct {
	// MinScore / MaxScore 哈希生成的分数区间。
	// 默认 600~800：刚好覆盖「全额 / 半价 / 全免」三档，便于本地验证。
	MinScore int
	MaxScore int

	// AllowMockScore 是否允许调用方指定分数（`mockScore`）。
	// 仅应在非 release 模式下开启 —— 线上允许用户自报分数等于把押金交给用户决定。
	AllowMockScore bool
}

func NewLocalCreditScorer(minScore, maxScore int, allowMockScore bool) *LocalCreditScorer {
	if minScore <= 0 || maxScore <= minScore {
		// 兜底到能覆盖三档的区间，避免配置写错导致所有用户都落同一档
		minScore, maxScore = 600, 800
	}
	return &LocalCreditScorer{MinScore: minScore, MaxScore: maxScore, AllowMockScore: allowMockScore}
}

func (s *LocalCreditScorer) Name() string { return "local" }

func (s *LocalCreditScorer) Authorize(
	_ context.Context, user *model.AppUser, mockScore int,
) (int, error) {
	if mockScore > 0 {
		if !s.AllowMockScore {
			return 0, fmt.Errorf("指定信用分仅限本地联调使用（当前环境已关闭）")
		}
		return s.clamp(mockScore), nil
	}
	return s.hashScore(user), nil
}

// Score 从用户记录里读分数（授权后由 Authorize 写入）。
//
// 这里**不重新生成**分数：真实芝麻也是「授权一次、结果落库」的模型，
// 保持同一套语义可以让后续切换实现时行为不漂移。
func (s *LocalCreditScorer) Score(_ context.Context, user *model.AppUser) (int, bool) {
	if !creditValid(user) {
		return 0, false
	}
	return user.CreditScore, true
}

// hashScore 按用户标识生成稳定的分数。
// 优先用 open_id（每个渠道唯一），退化为 id。
func (s *LocalCreditScorer) hashScore(user *model.AppUser) int {
	key := user.OpenID
	if key == "" {
		key = fmt.Sprintf("user:%d", user.ID)
	}
	h := fnv.New32a()
	_, _ = h.Write([]byte(key))
	span := s.MaxScore - s.MinScore + 1
	return s.MinScore + int(h.Sum32()%uint32(span))
}

// clamp 把外部传入的分数夹到合法区间（信用分语义上是 350~950）。
func (s *LocalCreditScorer) clamp(score int) int {
	const lo, hi = 350, 950
	if score < lo {
		return lo
	}
	if score > hi {
		return hi
	}
	return score
}

// ── 真实芝麻实现（占位） ──────────────────────────────────────────────

// ZhimaCreditScorer 真实芝麻信用实现。
//
// ⚠️ **尚未实现**。接入前需要先满足（见支付宝开放平台「接入准备」）：
//  1. 企业实名认证账户
//  2. 开通「预授权支付」+「芝麻免押」产品
//  3. 申请信用服务，取得 `category`（芝麻信用类目）与 `serviceId`（信用服务 ID）
//  4. 且产品为**邀约制**，需联系业务经理开通
//
// 拿到 serviceId 后，把 Authorize 换成调用 `zhima.credit.score.get`
// （前端需先在小程序侧拉起芝麻授权页拿到授权码）。
// 在配置齐全之前，本实现一律返回明确错误 —— **绝不静默降级为「给个分」**，
// 否则线上会出现「没签约却以为接好了」。
type ZhimaCreditScorer struct {
	AppID     string
	ServiceID string
}

func NewZhimaCreditScorer(appID, serviceID string) *ZhimaCreditScorer {
	return &ZhimaCreditScorer{AppID: appID, ServiceID: serviceID}
}

func (s *ZhimaCreditScorer) Name() string { return "zhima" }

func (s *ZhimaCreditScorer) Authorize(
	_ context.Context, _ *model.AppUser, _ int,
) (int, error) {
	return 0, fmt.Errorf(
		"芝麻信用尚未接入：需企业签约「芝麻免押」并配置 service_id（当前 service_id=%q）",
		s.ServiceID,
	)
}

func (s *ZhimaCreditScorer) Score(_ context.Context, user *model.AppUser) (int, bool) {
	if !creditValid(user) {
		return 0, false
	}
	return user.CreditScore, true
}
