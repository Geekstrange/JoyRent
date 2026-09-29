# 「一直加载中、后端零请求」诊断脚本

## ✅ 已定位根因（2026-09-24 22:1x）

**真凶：微信小程序基础库没有 `AbortController`。**

```
[probe] fetchQuery ✗ AbortController is not defined
```

`@tanstack/query-core` 的 `query.js` `#dispatch()` 里**无条件**执行：

```js
const abortController = new AbortController()   // ← query.js:313，无 typeof 守卫
```

这行在 fetch 流程的**最前端**（早于 retryer 启动、早于 queryFn）。

失败链条：
```
new AbortController() 抛 ReferenceError
  → #dispatch 直接抛出（异常发生在 this.#retryer 赋值之前）
  → query.fetchStatus 永远停在 "idle"（不是 "fetching"）
  → queryFn 从未执行 → Taro.request 从未调用 → 后端零日志
  → 界面永远「加载中」，且没有任何 toast/报错
```

**修复**：`src/utils/abortPolyfill.ts` 注入最小可用的 AbortController/AbortSignal，
在 `app.tsx` 顶部 `applyAbortPolyfill()`（早于所有查询）。

---

## 背景

症状：首页 / 分类 / 订单页都停在「加载中...」，后端日志里**一条小程序请求都没有**，
控制台也**没有 `[request] →` 日志**。后端本身健康（`curl` 直连 200）。

已静态排除：后端健康、系统代理（已关、无 TUN）、域名校验（已关）、
商户过滤、查询参数边界、Taro.request 本身可用（登录能通）。

## 本轮加了什么

| 文件 | 改动 |
|---|---|
| `src/utils/abortPolyfill.ts` | **新增**：补上小程序缺失的 AbortController/AbortSignal（根因修复） |
| `src/utils/taroReactShim.ts` | **新增**：把 `React.useSyncExternalStore` 换成 useEffect 版官方 shim 实现 |
| `src/app.tsx` | 顶部依次 `applyAbortPolyfill()` → `applyReactShims()`；加 queryCache 事件流日志、uSES 订阅探针、环境能力探针、启动期 `fetchQuery` 直连预热 |
| `src/pages/index|category|orders` | loading 态把 `fetchStatus` 显示到屏幕上 |
| `src/components/Empty` | loading 分支也渲染 `hint` |

## 验证（重编译后看控制台）

### 1. 补丁是否生效
```
[polyfill] ✓ 已注入原生缺失的全局对象: AbortController, AbortSignal
[shim] ✓ React.useSyncExternalStore 已替换为 useEffect 版实现
[probe] env: window=object ... | AbortController=function | uSES shim 已生效=true
```

### 2. 请求是否发出（关键）
```
[probe] fetchQuery ✓ 分类=N 设备=M
[request] → GET http://127.0.0.1:8080/api/v1/...
[qc] updated ['categories'] status=pending fetch=fetching
[request] ← 200 ... code=0 ...
```
- 有 `[request] →` + 后端日志同步收到 → **修好了**。

### 3. 屏幕上的 fetchStatus
- `cat:idle` → 订阅问题（仍存在）。
- `cat:fetching` → 请求已发出。
- `cat:paused` → 被 networkMode 当成离线暂停。

## 历史记录（已解决）

原假设是 React Query v5 的 `React.useSyncExternalStore` 订阅链路
在 Taro 环境未执行。**该假设经实机验证不成立** —— 补丁加上后订阅确实执行了
（`[probe] ✓ uSES 订阅回调执行`），observer 也正常建立（`[qc] observerAdded`），
但 `fetchStatus` 仍是 `idle`，直到发现 `AbortController is not defined`。

保留 uSES shim 是因为它无害且消除了一个潜在风险点；但**根因只有一个：AbortController**。

