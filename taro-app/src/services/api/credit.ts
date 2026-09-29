// File Name: credit.ts
// Created Time: 2026-09-28 09:45:00
//
// 信用分（芝麻信用）接口。
//
// 押金按信用分减免：≥700 全免 / 650-699 半价 / 其余全额。
// 规则表由后端下发（`rules`），前端**不要硬编码** —— 后端调整档位时前端无需改代码，
// 否则会出现「页面写着 700 免押、实际按新规则收了钱」。
import { get, post } from '../request'

/** 押金档位规则（后端下发，用于展示「怎么算的」） */
export interface TierRule {
  min_score: number
  tier: string
  label: string
  discount: string
}

export interface CreditStatus {
  /** 是否已授权且未过期 */
  authorized: boolean
  /** 信用分；未授权为 0 */
  score: number
  /** 押金档位：full_free / half / full */
  deposit_tier: string
  /** 档位中文说明，可直接展示 */
  tier_label: string
  /** 授权时间 */
  authorized_at?: string
  /** 分数来源实现：local（本地模拟）/ zhima（真实芝麻） */
  scorer: string
  rules: TierRule[]
}

/** 查询当前信用与押金状态（未授权也返回 200，用 authorized:false 表达） */
export function getCreditStatus() {
  return get<CreditStatus>('/app/credit')
}

/**
 * 完成信用授权。
 *
 * `mockScore` 用于本地联调时指定分数（测试各押金档位）；
 * 真实芝麻场景下由前端先拉起芝麻授权页拿到 authCode 再传给后端。
 */
export function authorizeCredit(mockScore?: number) {
  const body = mockScore ? { mock_score: mockScore } : {}
  return post<CreditStatus>('/app/credit/authorize', body)
}
