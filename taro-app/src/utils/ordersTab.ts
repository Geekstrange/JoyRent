/**
 * 跨页面传递「订单页初始 tab」的意图。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────
 * 「我的」页的三栏（待支付 / 租赁中 / 全部订单）都要跳到订单页，
 * 但**各自应该落在不同的 tab 上**。
 *
 * ⚠️ 不能靠 URL query 传参：`/pages/orders/index` 是 **tabBar 页面**，
 * 跳它必须用 `Taro.switchTab`，而 **`switchTab` 不支持 query 参数**
 * （微信、支付宝都会把 `?status=xxx` 直接丢掉）。实测传了也读不到。
 *
 * 所以用这个模块级变量承载「跳过去后要落在哪个 tab」：
 *   发起方（我的页）：`setPendingOrdersTab('pending')` → `Taro.switchTab(...)`
 *   接收方（订单页）：在 `useDidShow` 里 `consumePendingOrdersTab()` 取走并清空。
 *
 * 取走即清空（consume 语义），避免用户之后从 tabBar 手动进订单页时
 * 还残留着上次的筛选意图。
 */

/** 与订单页 TABS 的 key 对齐；'' 表示「全部」。 */
export type OrderTabKey = '' | 'pending' | 'renting' | 'returned'

let pendingTab: OrderTabKey | null = null

/** 设置跳转意图（由「我的」页在 switchTab 之前调用）。 */
export function setPendingOrdersTab(tab: OrderTabKey): void {
  pendingTab = tab
}

/**
 * 取走并清空跳转意图。
 * @returns 有意图时返回对应 tab key；无意图返回 `null`（调用方应保持现状）。
 */
export function consumePendingOrdersTab(): OrderTabKey | null {
  const t = pendingTab
  pendingTab = null
  return t
}
