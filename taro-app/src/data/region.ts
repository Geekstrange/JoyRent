/**
 * 省市区数据（静态内置）+ 选择器辅助函数。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────
 * 微信端的 `<Picker mode="region">` 是**微信原生实现**，行政区划数据由微信基础库
 * 自带；而**支付宝端根本不支持 `mode="region"`** —— 见
 * `@tarojs/components/types/Picker.d.ts`，所有 `mode` 系列的 `@supported`
 * 只列了 `weapp, h5, rn, harmony, harmony_hybrid`，**没有 alipay**。
 *
 * 在支付宝里传 `mode="region"` 不会报错，而是**静默退化成默认选择器**
 * （`selector`/`date`），于是用户看到的就是一个「年月日」滚轮 —— 这正是
 * 「地区选择实际上是年月日选择」的原因。
 *
 * 支付宝要弹省市区得用 `my.multiLevelSelect`，而该 API **要求调用方自己传数据**，
 * 所以这里内置一份。
 *
 * ── 数据 ─────────────────────────────────────────────────────────────
 * 来源 `china-division` 的 pca（省-市-区三级），生成期已规整：
 *   · 直辖市（京津沪渝）的占位层「市辖区」「县」被展开并合并，
 *     规整为「北京市 → 北京市 → 东城区」这种层级统一的结构（三层恒定），
 *     前端取省市区三个字段时逻辑最简单。
 *   · `省直辖县级行政区划` 等占位层同样被展开。
 * 规模：31 省 / 341 市 / 3056 区县。
 * 原始 JSON 字符串 23KB；转成 multiLevelSelect 的 list 结构（含 subList
 * 包装）后 80.3KB，仍低于该 API 的 200KB 上限。
 */

import { REGION_JSON } from './regionData'

/** 三级结构：省 → 市 → 区县 */
export type RegionTree = Record<string, Record<string, string[]>>

/** `my.multiLevelSelect` 需要的节点结构 */
export type MultiLevelItem = { name: string; subList?: MultiLevelItem[] }

let cached: RegionTree | null = null

/** 解析并缓存省市区树（首次调用时 JSON.parse，之后复用） */
export function regionTree(): RegionTree {
  if (!cached) {
    cached = JSON.parse(REGION_JSON) as RegionTree
  }
  return cached
}

/** 省列表（第一列） */
export function provinces(): string[] {
  return Object.keys(regionTree())
}

/** 某省下的市列表（第二列） */
export function citiesOf(province: string): string[] {
  const cities = regionTree()[province]
  return cities ? Object.keys(cities) : []
}

/** 某市下的区县列表（第三列） */
export function districtsOf(province: string, city: string): string[] {
  return regionTree()[province]?.[city] ?? []
}

/**
 * 转成 `my.multiLevelSelect` 的 `list` 结构：
 *   [{ name: '省', subList: [{ name: '市', subList: [{ name: '区' }] }] }]
 *
 * 结果序列化后 80.3KB，小于该 API 的 200KB 上限。
 */
export function toMultiLevelList(): MultiLevelItem[] {
  const tree = regionTree()
  return Object.keys(tree).map((province) => ({
    name: province,
    subList: Object.keys(tree[province]).map((city) => ({
      name: city,
      subList: tree[province][city].map((district) => ({ name: district })),
    })),
  }))
}
