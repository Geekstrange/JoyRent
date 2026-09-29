/**
 * 微信小程序运行环境补丁：AbortController / AbortSignal
 *
 * 为什么必须补（真实故障，非理论问题）：
 * @tanstack/query-core 在 `query.js` 的 `#dispatch()` 里**无条件**执行
 *   const abortController = new AbortController()
 * 这行位于 fetch 流程的最前端（早于 retryer 启动、早于 queryFn 调用）。
 * 而微信小程序基础库（实测 3.17.3）**没有 AbortController 全局对象**。
 *
 * 后果链条非常隐蔽：
 *   new AbortController() 抛 ReferenceError
 *     → #dispatch 直接抛出（异常发生在 `this.#retryer = ...` 赋值之前）
 *     → query.fetchStatus 永远停在 "idle"
 *     → 页面永远「加载中」、无任何报错弹出、后端零请求日志
 *     → Console 里只有 fetchQuery 的 catch 能捕获到这个错误名
 *
 * 补的是最小可用实现：只需支持 query-core 实际用到的三件事
 *   1. 可直接 new
 *   2. 实例有 .signal（getter `addSignalProperty` 会读它）
 *   3. 实例有 .abort()，调用后 signal.aborted 变 true 并触发 abort 事件
 * query-core 只在 `addEventListener` 里挂 abort 回调，因此事件派发要真实现。
 *
 * 参考：AbortController/AbortSignal 是 DOM 标准 API，小程序运行时未提供。
 */

interface AbortSignalLike {
  aborted: boolean
  reason?: unknown
  onabort: ((this: unknown, ev: unknown) => unknown) | null
  addEventListener(type: string, listener: (ev: unknown) => void): void
  removeEventListener(type: string, listener: (ev: unknown) => void): void
  dispatchEvent(ev: unknown): boolean
}

class AbortSignalPolyfill implements AbortSignalLike {
  aborted = false
  reason: unknown = undefined
  onabort: ((this: unknown, ev: unknown) => unknown) | null = null
  private listeners = new Set<(ev: unknown) => void>()

  addEventListener(type: string, listener: (ev: unknown) => void): void {
    if (type === 'abort' && typeof listener === 'function') {
      this.listeners.add(listener)
    }
  }

  removeEventListener(type: string, listener: (ev: unknown) => void): void {
    if (type === 'abort') this.listeners.delete(listener)
  }

  dispatchEvent(ev: unknown): boolean {
    if (typeof this.onabort === 'function') {
      ;(this.onabort as any).call(this, ev)
    }
    this.listeners.forEach((l) => {
      try {
        l(ev)
      } catch (e) {
        console.error('[polyfill] AbortSignal listener error', e)
      }
    })
    return true
  }

  /** 供 AbortController.abort() 内部调用 */
  _fireAbort(reason?: unknown): void {
    if (this.aborted) return
    this.aborted = true
    this.reason = reason
    try {
      this.dispatchEvent({ type: 'abort', target: this })
    } catch (e) {
      console.error('[polyfill] AbortSignal dispatch error', e)
    }
  }
}

class AbortControllerPolyfill {
  signal: AbortSignalPolyfill
  constructor() {
    this.signal = new AbortSignalPolyfill()
  }
  abort(reason?: unknown): void {
    this.signal._fireAbort(reason)
  }
}

let applied = false

export function applyAbortPolyfill(): void {
  if (applied) return
  applied = true

  const g = globalThis as any
  let installed: string[] = []

  if (typeof g.AbortController === 'undefined') {
    g.AbortController = AbortControllerPolyfill
    installed.push('AbortController')
  }
  if (typeof g.AbortSignal === 'undefined') {
    g.AbortSignal = AbortSignalPolyfill
    installed.push('AbortSignal')
  }

  if (installed.length) {
    console.log('[polyfill] ✓ 已注入原生缺失的全局对象:', installed.join(', '))
  } else {
    console.log('[polyfill] 环境已自带 AbortController/AbortSignal，无需注入')
  }
}
