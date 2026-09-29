import Taro from '@tarojs/taro'

import { useAuthStore } from '@/store/auth'
import { API_BASE } from '@/utils/env'

interface ApiBody<T = any> {
  code: number
  message: string
  data: T
}

class ApiError extends Error {
  code: number
  httpStatus: number

  constructor(message: string, code: number, httpStatus: number) {
    super(message)
    this.code = code
    this.httpStatus = httpStatus
  }
}

interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  auth?: boolean
  silent?: boolean
  /** 超时毫秒数，默认 10000。超时后 reject，避免界面无限「加载中」 */
  timeout?: number
}

/**
 * 默认超时。
 *
 * ⚠️ 这个兜底是**必需**的，不是锦上添花：
 * `Taro.request` 在小程序里的 `timeout` 默认行为不可靠 —— 当请求被
 * 代理拦下、DNS 卡住、或 devtools 与后端之间的连接被半开挂起时，
 * promise 会**永远 pending**（既不 resolve 也不 reject）。
 * 于是页面的 `isPending` 恒为 true，界面就一直是「加载中」，
 * **且后端日志一条都没有** —— 完全无法归因。
 * 加上超时后，这类「静默挂起」会变成一条明确的错误，能看见、能排查。
 */
const DEFAULT_TIMEOUT = 10000

let redirecting = false

/**
 * 剔除 data 里值为 `undefined` / `null` 的字段。
 *
 * ⚠️ 不剔会出大问题（真实踩坑）：
 * `Taro.request` 在 GET 时会把 data 对象序列化进 query string，
 * 而它对 **`undefined` 值的处理是拼成字符串 `"undefined"`**：
 *   { category_id: undefined, keyword: undefined }
 *     → ?category_id=undefined&keyword=undefined
 * 后端拿到的是**非空字符串** `"undefined"`，于是：
 *   - `keyword != ""` 成立 → 执行 `name ILIKE '%undefined%'` → 0 条命中
 *   - 返回空列表（Go 的 nil slice 序列化成 `null`）
 * 表现就是「明明有数据却显示没有找到匹配的设备」，极难归因。
 *
 * 所以这里统一在发请求前把 undefined/null 字段删掉，
 * 让「没传参数」真的表现为「不带这个 query 字段」。
 */
function stripEmptyParams(data: any): any {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return data
  const out: Record<string, any> = {}
  Object.keys(data).forEach((k) => {
    const v = data[k]
    // 只删 undefined / null（'' 是合法值，可能表示「显式清空筛选」）
    if (v !== undefined && v !== null) out[k] = v
  })
  return out
}

export async function request<T = any>(opts: RequestOptions): Promise<T> {
  const {
    url,
    method = 'GET',
    data,
    auth = true,
    silent = false,
    timeout = DEFAULT_TIMEOUT,
  } = opts

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (auth) {
    const token = useAuthStore.getState().token
    if (token) header.Authorization = `Bearer ${token}`
  }

  // GET 的 data 会被拼进 query string，必须先剔除 undefined/null/'' 字段，
  // 否则会变成字符串 "undefined" 传到后端（详见 stripEmptyParams 注释）。
  const payload = method === 'GET' ? stripEmptyParams(data) : data

  // ── 网络层失败必须单独兜住 ────────────────────────────────────────
  // 连不上服务器时（后端没起 / 地址不对 / 被代理拦 / 域名未配合法域名），
  // Taro.request 的 promise 会**直接 reject**，根本走不到下面的 statusCode 判断。
  // 若不加这层 try/catch，界面就只是「一片空白」，用户（和排查的人）
  // 完全看不出是「真的没数据」还是「请求没发出去」——这正是最难查的一类问题。
  // 这里统一转成 ApiError(httpStatus=0) 并给出带地址的具体提示。
  const fullUrl = API_BASE + url
  const t0 = Date.now()

  // 请求前打点。⚠️ 这条日志是「请求到底有没有发出去」的唯一凭证 ——
  // 后端只记录**到达**的请求，若前端压根没发（或卡在 Taro 拦截器里），
  // 后端日志会是空的，此时靠这条 + 下面的「响应/失败」成对出现与否就能判定。
  console.log('[request] →', method, fullUrl, payload ?? '')

  let res: any
  try {
    res = await Taro.request({
      url: fullUrl,
      method: method as any,
      data: payload,
      header,
      timeout,
    })
  } catch (err: any) {
    const detail = (err && (err.errMsg || err.message)) || '未知错误'
    // 区分「连接失败」与「超时挂起」——两者排查方向完全不同：
    //   连接失败 → 地址错/后端没起/被拦
    //   超时挂起 → 中间有代理/半开连接，请求可能根本没到后端
    const isTimeout = /timeout|超时/i.test(detail)
    const msg = isTimeout
      ? `请求超时（${timeout}ms），${API_BASE} 无响应`
      : `无法连接服务器（${detail}）`
    if (!silent) {
      Taro.showToast({ title: msg, icon: 'none', duration: 3000 })
    }
    // 同时打到控制台，方便在开发者工具 Console 里直接看到请求目标
    console.error(isTimeout ? '[request] ⏱ 请求超时' : '[request] ✗ 网络请求失败', {
      url: fullUrl,
      apiBase: API_BASE,
      detail,
      elapsed: `${Date.now() - t0}ms`,
    })
    throw new ApiError(msg, -1, 0)
  }

  const status = res.statusCode
  const body = res.data as ApiBody

  // 响应打点：把 statusCode 与业务 code 都打出来。
  // 「网络 200 但业务 code≠0」和「网络失败」是两回事，混在一起会误判。
  // ⚠️ data 为 null 要显式打出来 —— 后端空列表会序列化成 `null`，
  // 而 `typeof null === 'object'`，只打 typeof 会看不出「其实是空」。
  const dataDesc =
    body?.data === null
      ? 'data=null(空列表)'
      : Array.isArray(body?.data)
        ? `data.length=${body.data.length}`
        : typeof body?.data
  console.log('[request] ←', status, fullUrl, `code=${body?.code}`, `${Date.now() - t0}ms`, dataDesc)

  if (status === 401) {
    if (!redirecting) {
      redirecting = true
      useAuthStore.getState().logout()
      Taro.showToast({ title: '登录已过期', icon: 'none' })
      setTimeout(() => {
        redirecting = false
      }, 1500)
    }
    throw new ApiError(body?.message || '未认证', 40100, 401)
  }

  if (status >= 200 && status < 300 && body && body.code === 0) {
    return body.data as T
  }

  const msg = body?.message || `请求失败(${status})`
  if (!silent && status !== 409 && status !== 400) {
    Taro.showToast({ title: msg, icon: 'none' })
  }
  throw new ApiError(msg, body?.code ?? -1, status)
}

export const get = <T = any>(url: string, data?: any, opts: Partial<RequestOptions> = {}) =>
  request<T>({ url, method: 'GET', data, ...opts })

export const post = <T = any>(url: string, data?: any, opts: Partial<RequestOptions> = {}) =>
  request<T>({ url, method: 'POST', data, ...opts })

export const put = <T = any>(url: string, data?: any, opts: Partial<RequestOptions> = {}) =>
  request<T>({ url, method: 'PUT', data, ...opts })

export const del = <T = any>(url: string, data?: any, opts: Partial<RequestOptions> = {}) =>
  request<T>({ url, method: 'DELETE', data, ...opts })

export { ApiError }
