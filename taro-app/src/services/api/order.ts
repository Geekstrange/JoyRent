// File Name: order.ts
// Created Time: 2026-09-22 20:09:51
// Update Time: 2026-09-22 20:09:51


import { get, post } from '../request'

export interface Order {
  id: number
  merchant_id: number
  no: string
  user_id: number
  equipment_id: number
  unit_id: number
  start_at: string
  end_at: string
  days: number
  rent_cents: number
  deposit_cents: number
  status: string
  dep_status: string
  /** 收货信息快照：下单时从地址簿拷入，之后不随地址簿变动 */
  receiver: string
  phone: string
  address: string
  created_at: string
  updated_at: string
}

export interface CreateOrderInput {
  equipment_id: number
  start_at: string
  end_at: string
  /** 收货地址 ID（地址簿里的 id）。必填，后端会校验归属。 */
  address_id: number
}

export function listMyOrders(params: { status?: string } = {}) {
  return get<Order[]>('/app/orders', params)
}

export function getMyOrder(id: number) {
  return get<Order>(`/app/orders/${id}`)
}

export function createOrder(input: CreateOrderInput) {
  return post<Order>('/app/orders', input)
}

export function createPayment(orderId: number, channel: string) {
  return post<{ params: Record<string, any> }>(
    `/app/orders/${orderId}/pay`,
    { channel }
  )
}

/**
 * 模拟支付成功 —— **仅供 Mock 渠道**（后端未配置真实支付时）。
 *
 * ⚠️ 为什么需要它：
 * 后端在 `[payment.wechat]` 未配置时会注册 `MockProvider`，下单返回的参数
 * 是**伪造的**（带 `mock:true`，缺 `timeStamp/nonceStr/package/paySign`）。
 * 拿它去调 `wx.requestPayment` 必然失败 —— 也就是「本地点击支付永远报错」。
 *
 * 这里改为调后端的**公开回调接口**，让 `MockProvider.ParseCallback` 把订单
 * 推进为已支付，于是本地能完整走通「下单 → 支付 → 订单变为已支付」。
 *
 * 生产环境不会走到这里：真实渠道返回的参数没有 `mock` 标记。
 * 回调地址 `POST /api/v1/pay/callback/:channel` 本就是公开路由（渠道服务器调用），
 * 因此这里不带鉴权头。
 */
export function mockPayCallback(
  channel: string,
  orderId: number,
  amountCents: number
) {
  return post<{ code: string; message: string }>(
    `/pay/callback/${channel}`,
    {
      order_id: orderId,
      transaction_id: `mock_${channel}_${orderId}_${Date.now()}`,
      amount_cents: amountCents,
    },
    { auth: false }
  )
}
