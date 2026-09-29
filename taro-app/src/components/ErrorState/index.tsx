import { View, Text } from '@tarojs/components'

import { API_BASE } from '@/utils/env'

import './index.scss'

interface Props {
  /** 错误对象或错误文案 */
  error?: unknown
  /** 点击重试 */
  onRetry?: () => void
}

function messageOf(error: unknown): string {
  if (!error) return '数据加载失败'
  if (typeof error === 'string') return error
  const e = error as { message?: string }
  return e.message || '数据加载失败'
}

/**
 * 加载失败状态。
 *
 * 为什么要单独做一个组件，而不是复用 Empty：
 * 之前接口挂掉时页面渲染的是 Empty（「没有找到匹配的设备」），
 * 和「真的没有数据」长得一模一样 —— 于是「后端没连上」和「确实没数据」
 * 完全无法区分，排查时只能靠猜。这里把两者彻底分开，并**把请求地址显示出来**，
 * 一眼就能看出是地址不对、后端没起，还是被代理/域名校验拦了。
 */
export default function ErrorState({ error, onRetry }: Props) {
  return (
    <View className="err-state">
      <Text className="err-icon">!</Text>
      <Text className="err-text">{messageOf(error)}</Text>
      <Text className="err-hint">请确认后端已启动，且开发者工具已勾选「不校验合法域名」</Text>
      <Text className="err-addr">{API_BASE}</Text>
      {onRetry ? (
        <View className="err-btn" onClick={onRetry}>
          <Text>重新加载</Text>
        </View>
      ) : null}
    </View>
  )
}
