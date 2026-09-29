// 收货地址簿。
//
// 后端为账号维度的地址簿（表 user_address），与订单上的收货信息快照是两回事：
//   - 地址簿：可增删改，随用户维护，最多 20 条，可指定 1 条默认；
//   - 订单快照：下单选地址后把 receiver/phone/address 拷进订单，之后改地址簿
//     也不会影响历史订单，删掉地址也不会让订单的收货信息悬空。

import { get, post, put, del } from '../request'

export interface Address {
  id: number
  owner_user_id: number
  receiver: string
  phone: string
  province: string
  city: string
  district: string
  detail: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface AddressInput {
  receiver: string
  phone: string
  province: string
  city: string
  district: string
  detail: string
  /** 是否设为默认。首条地址后端会**自动**置为默认，无需显式传。 */
  set_default?: boolean
}

/**
 * 完整地址文本。
 *
 * ⚠️ 与后端 `UserAddress.FullAddress()` 必须保持一致：**直辖市要去重**。
 * 北京市的 province 与 city 都是「北京市」，直接拼接会得到
 * 「北京市 北京市 东城区」，而订单快照里存的是后端拼好的、去了重的文本。
 * 若这里不按同样规则拼，就会出现「同一地址在地址簿和订单里显示不一样」。
 */
export function fullAddress(a: Pick<Address, 'province' | 'city' | 'district' | 'detail'>): string {
  const parts = [a.province, a.city, a.district, a.detail]
  const out: string[] = []
  parts.forEach((p, i) => {
    if (!p) return
    // city 与 province 相同（直辖市）时跳过，避免「北京市 北京市」
    if (i === 1 && a.city === a.province) return
    out.push(p)
  })
  return out.join(' ')
}

export function listAddresses() {
  // 空地址簿后端返回 200 + []（不是 null），直接当数组用即可
  return get<Address[]>('/app/addresses')
}

/**
 * 查询默认地址。
 *
 * 契约：**没有默认地址时返回 200 + `data: null`**（不是 404）。
 * 与 merchant.getMyApplication 同理 —— 「查询成功但没有数据」是正常状态，
 * 用 404 表达会让每次进入下单页都在 Console 打一条红色报错，掩盖真正的接口故障。
 * 这里把 null 透传，调用方统一判断 `== null`；
 * 保留 404→null 兜底，兼容仍返回 404 的旧后端。
 */
export async function getDefaultAddress(): Promise<Address | null> {
  try {
    const data = await get<Address | null>('/app/addresses/default', undefined, { silent: true })
    return data ?? null
  } catch (err: any) {
    if (err?.httpStatus === 404) return null
    throw err
  }
}

export function getAddress(id: number) {
  return get<Address>(`/app/addresses/${id}`)
}

export function createAddress(input: AddressInput) {
  return post<Address>('/app/addresses', input)
}

export function updateAddress(id: number, input: AddressInput) {
  return put<Address>(`/app/addresses/${id}`, input)
}

/** 把某条地址设为默认（后端在同一事务里先清旧默认再置新默认）。 */
export function setDefaultAddress(id: number) {
  return post<null>(`/app/addresses/${id}/default`)
}

export function deleteAddress(id: number) {
  return del<null>(`/app/addresses/${id}`)
}
