import Taro from '@tarojs/taro'

// ⚠️ `@/data/region` 在构建期按平台被 alias 到不同实现（见 config/index.ts）：
//   微信  → region.weapp.ts（空实现，不打包省市区数据）
//   支付宝 → region.ts（真实现，含省市区数据）
// 因此这里写静态 import 是安全的：微信构建不会把数据带进包。
import { toMultiLevelList } from '@/data/region'

export type Platform = 'weapp' | 'alipay'

// TARO_ENV 由 Taro 在构建期注入为字面量（'weapp' / 'alipay'）。
// 必须静态书写，否则不会被替换。
const TARO_ENV = process.env.TARO_ENV || 'weapp'

export function currentPlatform(): Platform {
  return TARO_ENV === 'alipay' ? 'alipay' : 'weapp'
}

/**
 * 登录：微信 Taro.login 拿 code，支付宝 my.getAuthCode
 */
export async function getLoginCode(): Promise<string> {
  const platform = currentPlatform()

  if (platform === 'alipay') {
    return new Promise((resolve, reject) => {
      const my = (globalThis as any).my
      if (!my || typeof my.getAuthCode !== 'function') {
        reject(new Error('支付宝环境未就绪'))
        return
      }
      my.getAuthCode({
        scopes: 'auth_base',
        success: (res: any) => {
          if (res?.authCode) resolve(res.authCode)
          else reject(new Error('未获取到 authCode'))
        },
        fail: (err: any) => reject(new Error(err?.errorMessage || '登录失败')),
      })
    })
  }

  const res = await Taro.login()
  if (!res.code) throw new Error('未获取到 code')
  return res.code
}

/**
 * 支付：微信 Taro.requestPayment，支付宝 my.tradePay
 * params 由后端 /app/orders/:id/pay 返回
 */
export async function pay(params: Record<string, any>): Promise<void> {
  const platform = currentPlatform()

  if (platform === 'alipay') {
    return new Promise((resolve, reject) => {
      const my = (globalThis as any).my
      if (!my || typeof my.tradePay !== 'function') {
        reject(new Error('支付宝环境未就绪'))
        return
      }
      my.tradePay({
        tradeNO: params.trade_no || params.tradeNO,
        success: (res: any) => {
          if (res.resultCode === '9000' || res.resultCode === 9000) resolve()
          else reject(new Error(`支付未完成(${res.resultCode})`))
        },
        fail: (err: any) => reject(new Error(err?.errorMessage || '支付失败')),
      })
    })
  }

  await Taro.requestPayment({
    timeStamp: String(params.timeStamp || params.timestamp),
    nonceStr: params.nonceStr,
    package: params.package,
    signType: params.signType || 'RSA',
    paySign: params.paySign,
  })
}

/**
 * 复制到剪贴板
 */
export async function copyText(text: string): Promise<void> {
  await Taro.setClipboardData({ data: text })
}

/**
 * Toast 统一封装
 */
export function toast(title: string, icon: 'none' | 'success' | 'error' = 'none') {
  Taro.showToast({ title, icon, duration: 1600 })
}

/**
 * 确认弹窗
 */
export async function confirm(content: string, title = '提示'): Promise<boolean> {
  const res = await Taro.showModal({
    title,
    content,
    confirmText: '确定',
    cancelText: '取消',
  })
  return !!res.confirm
}

/**
 * 拉起**支付宝**的省市区级联选择器，返回 `[省, 市, 区]`；用户取消返回 `null`。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────
 * 微信的 `<Picker mode="region">` 由微信基础库实现，直接用即可；
 * 但**支付宝不支持 `mode="region"`**（Taro 的 `Picker.d.ts` 里 `mode`
 * 的 `@supported` 只有 `weapp, h5, rn, harmony, harmony_hybrid`，不含 alipay）。
 * 在支付宝传 `mode="region"` 不会报错，而是**静默退化成日期/单列选择器**，
 * 用户看到的就是一个「年月日」滚轮 —— 即「地区选择变成年月日选择」的原因。
 *
 * 所以支付宝侧改用官方级联 API `my.multiLevelSelect`；它要求调用方自带数据，
 * 故从 `@/data/region` 取内置的省市区树。
 *
 * 注意：本函数**只在支付宝端调用**。微信端继续用原生 `<Picker mode="region">`，
 * 不要用本函数替代（会丢掉微信原生体验）。
 */
export async function pickRegionAlipay(): Promise<string[] | null> {
  const my = (globalThis as any).my
  if (!my || typeof my.multiLevelSelect !== 'function') {
    throw new Error('当前支付宝基础库不支持省市区选择（需 2.7.0+）')
  }

  // 省市区数据由 alias 保证只进支付宝包（微信端是空实现，返回 []）。
  // 本函数只在支付宝端被调用（见 address-edit 的 isAlipay 分支）。
  const list = toMultiLevelList()

  return new Promise<string[] | null>((resolve, reject) => {
    my.multiLevelSelect({
      title: '选择所在地区',
      list,
      success: (res: any) => {
        // res.success 为 false 表示用户取消（或 list 为空）
        if (!res?.success) {
          resolve(null)
          return
        }
        // res.result 形如 [{name:'浙江省'},{name:'杭州市'},{name:'西湖区'}]
        const picked: string[] = (res.result || [])
          .map((it: any) => it?.name)
          .filter((n: any): n is string => typeof n === 'string' && !!n)
        resolve(picked.length ? picked : null)
      },
      fail: (err: any) => {
        reject(new Error(err?.errorMessage || '地区选择失败'))
      },
    })
  })
}
