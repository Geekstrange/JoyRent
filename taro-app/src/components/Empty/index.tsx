import { View, Text } from '@tarojs/components'

import './index.scss'

interface Props {
  text?: string
  hint?: string
  /**
   * 加载中态。
   *
   * ⚠️ 为什么必须有这个区分（曾经踩过的大坑）：
   * 页面若只写 `data.length ? <列表/> : <Empty/>`，那么**请求还在路上时**
   * `data` 是 `undefined` → 长度 0 → 直接渲染「没有找到匹配的设备」。
   * 于是「后端没连上 / 请求还没回来」和「确实没有数据」长得**一模一样**，
   * 无论开发者还是用户都无法区分 —— 这正是「界面什么也显示不了」的根源。
   *
   * 调用方必须显式传入 `loading={query.isPending}`，把三态彻底分开：
   *   加载中 → <Empty loading />      （转圈 + 「加载中...」）
   *   出错   → <ErrorState />         （'!' + 实际请求地址 + 重试）
   *   真为空 → <Empty text="..." />   （'□' + 业务空文案）
   */
  loading?: boolean
}

export default function Empty({ text = '暂无数据', hint, loading = false }: Props) {
  if (loading) {
    return (
      <View className="empty">
        <Text className="empty-icon empty-spin">◌</Text>
        <Text className="empty-text">加载中...</Text>
        {/* hint 在加载态也渲染：用于把 fetchStatus 之类的诊断信息显示到屏幕上 */}
        {hint ? <Text className="empty-hint">{hint}</Text> : null}
      </View>
    )
  }

  return (
    <View className="empty">
      <Text className="empty-icon">□</Text>
      <Text className="empty-text">{text}</Text>
      {hint ? <Text className="empty-hint">{hint}</Text> : null}
    </View>
  )
}
