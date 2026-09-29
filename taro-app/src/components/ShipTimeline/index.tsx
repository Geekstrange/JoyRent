import { View, Text } from '@tarojs/components'

import { formatDateTime } from '@/utils/date'
import type { ShipmentTrace } from '@/services/api/shipment'

import './index.scss'

interface Props {
  traces: ShipmentTrace[]
}

export default function ShipTimeline({ traces }: Props) {
  if (!traces.length) {
    return (
      <View className="ship-timeline-empty">
        <Text>暂无轨迹</Text>
      </View>
    )
  }

  // 后端按时间升序存储，展示时倒序，最新在最上
  const list = [...traces].sort((a, b) => {
    const ta = new Date(a.trace_at).getTime()
    const tb = new Date(b.trace_at).getTime()
    if (tb !== ta) return tb - ta
    return b.id - a.id
  })

  return (
    <View className="ship-timeline">
      {list.map((t, i) => {
        const on = i === 0
        return (
          <View
            key={t.id}
            className={`ship-tl-item ${on ? 'on' : ''}`}
          >
            <View className="ship-tl-dot" />
            <View className="ship-tl-body">
              <Text className="ship-tl-text">{t.text}</Text>
              <Text className="ship-tl-time">{formatDateTime(t.trace_at)}</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}
