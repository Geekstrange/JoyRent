/**
 * 支付编排层：统一处理「真实渠道」与「Mock 渠道」两条路径。
 *
 * ── 为什么单独一层，而不是塞进 utils/platform ─────────────────────────
 * `utils/platform.pay()` 是**纯客户端调起能力**（微信 `Taro.requestPayment` /
 * 支付宝 `my.tradePay`），它不应该知道后端渠道是怎么配置的。
 * 而「后端是 Mock 时要回头调回调接口把订单推进」属于**业务编排**，
 * 依赖 `services/api/order`，因此放在 services 层，避免 utils 反向依赖 services。
 *
 * ── 两条路径 ──────────────────────────────────────────────────────────
 *   真实渠道：后端返回 timeStamp/nonceStr/package/paySign → 交给 pay() 调起
 *   Mock 渠道：后端返回 `mock:true` 的伪造参数（缺签名字段，调起必然失败）
 *              → 改为调后端公开回调接口，让 MockProvider 推进订单状态
 *
 * 这样本地未配置商户号时也能完整走通「下单 → 支付 → 订单变已支付」，
 * 便于端到端自测；生产环境不会命中 Mock 分支。
 */
import { createPayment, mockPayCallback } from '@/services/api/order'
import { pay, currentPlatform } from '@/utils/platform'

export interface PayOutcome {
  /** 是否走了 Mock 渠道（后端 `[payment.*]` 未配置真实支付时为 true） */
  mocked: boolean
}

/**
 * 发起订单支付。
 *
 * @param orderId            订单 ID
 * @param fallbackAmountCents 兜底金额（分）。仅当 Mock 返回里没带 total_fee 时使用，
 *                            用于满足后端回调的**金额校验**（金额不符会被拒）。
 */
export async function payOrder(
  orderId: number,
  fallbackAmountCents?: number
): Promise<PayOutcome> {
  const channel = currentPlatform() === 'alipay' ? 'alipay' : 'wechat'

  const res = await createPayment(orderId, channel)
  const params = (res && (res as any).params) || {}

  if (params.mock) {
    // Mock 渠道：参数是伪造的，调真实支付必然失败（缺 paySign 等）。
    // 改为回调后端，让 MockProvider.ParseCallback 把订单推进为已支付。
    await mockPayCallback(
      String(params.channel || channel),
      Number(params.order_id || orderId),
      Number(params.total_fee || fallbackAmountCents || 0)
    )
    return { mocked: true }
  }

  await pay(params)
  return { mocked: false }
}
