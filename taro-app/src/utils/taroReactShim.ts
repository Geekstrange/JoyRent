/**
 * React 18 useSyncExternalStore 在 Taro 小程序环境的兼容补丁
 *
 * 背景：@tanstack/react-query v5 的 useBaseQuery 直接调用
 * React.useSyncExternalStore 订阅 QueryObserver —— 这是它触发请求的唯一路径
 * （observer.onSubscribe → executeFetch → queryFn → Taro.request）。
 * 在微信开发者工具的实际运行环境中，这条订阅链路被观察到从未执行：
 * 页面正常渲染（说明渲染期 getSnapshot 正常）、但请求一个都不发、
 * 无任何报错、查询永远停留在 pending。
 *
 * 本机最小复现（react 18.3.1 + react-reconciler 0.29.0 同款组合）证明
 * reconciler 的 uSES 机制本身没有问题，因此按「原生 uSES 在该环境的
 * 订阅路径失效」处理：将 React.useSyncExternalStore 替换为
 * use-sync-external-store 官方 shim 的客户端实现（useState + useEffect 版，
 * 与 zustand 兼容层同源，逻辑照抄 node_modules/use-sync-external-store
 * 的 useSyncExternalStoreShimClient，MIT License, Copyright Meta Platforms）。
 *
 * 生效方式：app.tsx 模块顶层调用 applyReactShims()，在任何页面组件
 * 渲染前完成替换（编译产物中 react 是 CJS 模块，各 chunk 引用同一个
 * exports 对象，属性替换对所有消费方可见）。
 */
import * as React from 'react'
import { useEffect, useLayoutEffect, useState } from 'react'

const is = (x: unknown, y: unknown): boolean =>
  (x === y && (x !== 0 || 1 / (x as number) === 1 / (y as number))) ||
  (x !== x && y !== y)

function checkIfSnapshotChanged(inst: {
  value: unknown
  getSnapshot: () => unknown
}): boolean {
  const latestGetSnapshot = inst.getSnapshot
  const prevValue = inst.value
  try {
    const nextValue = latestGetSnapshot()
    return !is(prevValue, nextValue)
  } catch {
    return true
  }
}

/**
 * useSyncExternalStore 客户端 shim 实现。
 * 注意：必须忽略第三个参数（getServerSnapshot）—— react-query 传的是
 * () => observer.getCurrentResult()，客户端路径本就不用。
 */
export function useSyncExternalStoreShim(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => unknown
): unknown {
  const value = getSnapshot()
  const [{ inst }, forceStoreRerender] = useState({
    inst: { value, getSnapshot },
  })

  useLayoutEffect(() => {
    // 当 value / getSnapshot 变化时同步 inst，若快照已变则强制重渲染
    inst.value = value
    inst.getSnapshot = getSnapshot
    if (checkIfSnapshotChanged(inst)) {
      forceStoreRerender({ inst })
    }
  }, [subscribe, value, getSnapshot])

  useEffect(() => {
    // 真正的订阅 effect —— react-query 的 fetch 就是被这里触发的
    if (checkIfSnapshotChanged(inst)) {
      forceStoreRerender({ inst })
    }
    const handleStoreChange = () => {
      if (checkIfSnapshotChanged(inst)) {
        forceStoreRerender({ inst })
      }
    }
    return subscribe(handleStoreChange)
  }, [subscribe])

  return value
}

let applied = false
let shimActive = false

/** 探针用：补丁是否已成功替换 */
export function isShimActive(): boolean {
  return shimActive
}

export function applyReactShims(): void {
  if (applied) return
  applied = true

  // `import * as React`（react 为 CJS）在 webpack 下得到 interop namespace，
  // 真实 exports 对象挂在 .default 上；若未做 interop 则 namespace 本身
  // 就是原对象。两种情况都兼容。
  const raw = (React as any).default ?? (React as any)

  try {
    if (typeof raw.useSyncExternalStore !== 'function') {
      console.warn('[shim] React.useSyncExternalStore 不存在，跳过替换')
      return
    }
    // 保留原始实现，便于诊断时对比
    raw.__originalUseSyncExternalStore = raw.useSyncExternalStore
    raw.useSyncExternalStore = useSyncExternalStoreShim
    shimActive = true
    console.log(
      '[shim] ✓ React.useSyncExternalStore 已替换为 useEffect 版实现'
    )
  } catch (e) {
    console.error('[shim] ✗ 替换失败（exports 对象可能被冻结）', e)
  }
}
