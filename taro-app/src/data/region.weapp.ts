/**
 * 微信端的「省市区数据」占位实现。
 *
 * 微信原生 `<Picker mode="region">` 自带行政区划数据，**不需要**内置这份表；
 * 若把完整数据打进微信包，`common` chunk 会白白多出约 80KB（实测）。
 *
 * 因此构建微信时，`@/data/region` 被 webpack alias 指向本文件（空实现），
 * 真正的数据（`region.ts` + `regionData.ts`）只会进入支付宝产物。
 * 对应 alias 见 `config/index.ts` 的 `mini.webpackChain`。
 *
 * 注意：本文件**不会**被支付宝构建加载；支付宝走真正的 `region.ts`。
 */

import type { RegionTree, MultiLevelItem } from './region'

/** 微信端不使用省市区树，恒为空。 */
export function regionTree(): RegionTree {
  return {}
}

export function provinces(): string[] {
  return []
}

export function citiesOf(): string[] {
  return []
}

export function districtsOf(): string[] {
  return []
}

/**
 * 微信端永远走原生 `mode="region"`，不会调用到这里。
 * 返回空数组以保证类型对齐（调用方若误用也不会崩）。
 */
export function toMultiLevelList(): MultiLevelItem[] {
  return []
}
