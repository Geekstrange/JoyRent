import { useEffect, useState, useSyncExternalStore } from 'react'
import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { useAuthStore } from '@/store/auth'
import { listCategories } from '@/services/api/category'
import { listEquipments } from '@/services/api/equipment'
import { applyReactShims, isShimActive } from '@/utils/taroReactShim'
import { applyAbortPolyfill } from '@/utils/abortPolyfill'

import './app.scss'

// ⚠️ 必须最先执行（顺序有讲究）：
//  1. applyAbortPolyfill() —— 小程序基础库没有 AbortController，
//     而 query-core 的 #dispatch 会无条件 `new AbortController()`，
//     不补则异常在 fetch 流程最前端抛出 → fetchStatus 永远是 idle →
//     页面永远「加载中」、后端零请求。详见 utils/abortPolyfill.ts 头注释。
//  2. applyReactShims() —— 在任何页面组件渲染前替换 React.useSyncExternalStore。
applyAbortPolyfill()
applyReactShims()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 只在「可能是瞬时故障」时重试；4xx（参数/鉴权错）重试无意义且会拖长等待。
      // ⚠️ 配合 request.ts 的 10s 超时：若网络层挂起，最坏等待 = 10s × (1+1) = 20s，
      // 之后一定落到 error 态展示 ErrorState，不会无限「加载中」。
      retry: (failureCount, error: any) => {
        const status = error?.httpStatus
        if (status >= 400 && status < 500) return false
        return failureCount < 1
      },
      retryDelay: 800,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
    },
  },
})

// ── 诊断：queryCache 全局事件流（不依赖任何 React 订阅机制）──
// 页面 mount 后若连 observerAdded 都没有 → useQuery 的订阅链路死了；
// 有 observerAdded 但没有 fetch 事件 → onSubscribe 没触发 fetch。
// 排查完这轮问题后可以删掉。
queryClient.getQueryCache().subscribe((event: any) => {
  const q = event.query
  const state = q?.state
  console.log(
    '[qc]',
    event.type,
    q?.queryHash ?? '',
    state ? `status=${state.status} fetch=${state.fetchStatus}` : ''
  )
})

// ── 诊断：最小 uSES 订阅探针（走替换后的 shim 实现）──
let probeSubscribed = false
const probeSubscribe = (cb: () => void) => {
  probeSubscribed = true
  console.log('[probe] ✓ uSES 订阅回调执行（shim 生效）')
  return () => {}
}
const PROBE_SNAPSHOT = 42

function App({ children }: PropsWithChildren) {
  const bootstrap = useAuthStore((s) => s.bootstrap)

  // passive effects 是否存活的直接证据
  useEffect(() => {
    console.log('[probe] ✓ App useEffect 执行（passive effects 存活）')
    // 给订阅一个宏任务窗口，下一行在卸载时检查
    setTimeout(() => {
      console.log(
        '[probe] 500ms 复查: uSES 订阅' + (probeSubscribed ? '✓ 已执行' : ' ✗ 从未执行')
      )
    }, 500)
  }, [])

  const probeValue = useSyncExternalStore(probeSubscribe, () => PROBE_SNAPSHOT)
  if (probeValue !== PROBE_SNAPSHOT) {
    console.error('[probe] uSES 读值异常:', probeValue)
  }

  useLaunch(() => {
    bootstrap()

    // 环境能力探针：决定 react-reconciler 调度器走哪个端口
    // （setImmediate → MessageChannel → setTimeout 三级 fallback）
    console.log(
      '[probe] env:',
      'window=' + typeof window,
      'setImmediate=' + typeof setImmediate,
      'MessageChannel=' + typeof MessageChannel,
      'performance=' + typeof performance,
      '| AbortController=' + typeof AbortController,
      '| uSES shim 已生效=' + isShimActive()
    )

    // 直连探针 + 缓存预热：完全绕过 observer/uSES 链路发请求。
    // queryKey 与首页页面对齐 —— 即使订阅链路仍坏，页面任意后续重渲染
    // （tab 切换 / 下拉 / 输入）都能直接从缓存出数据。
    const t0 = Date.now()
    Promise.all([
      queryClient.fetchQuery({
        queryKey: ['categories'],
        queryFn: listCategories,
      }),
      queryClient.fetchQuery({
        queryKey: ['equipments', 0, ''],
        queryFn: () => listEquipments({}),
      }),
    ])
      .then(([cats, eqs]) => {
        console.log(
          `[probe] fetchQuery ✓ 分类=${(cats as any[])?.length} 设备=${(eqs as any[])?.length}`,
          `${Date.now() - t0}ms`
        )
      })
      .catch((e) => {
        console.error('[probe] fetchQuery ✗', (e as Error)?.message || e)
      })
  })

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

export default App
