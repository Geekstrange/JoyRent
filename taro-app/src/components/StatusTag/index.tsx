import { View, Text } from '@tarojs/components'

import './index.scss'

type ColorKey = 'orange' | 'blue' | 'cyan' | 'green' | 'red' | 'default'

interface MapItem {
  text: string
  color: string
}

interface Props {
  map: Record<string, MapItem>
  value: string
}

export default function StatusTag({ map, value }: Props) {
  const item = map?.[value]
  if (!item) {
    return (
      <View className="status-tag st-default">
        <Text>{value || '—'}</Text>
      </View>
    )
  }
  const key = (item.color as ColorKey) || 'default'
  return (
    <View className={`status-tag st-${key}`}>
      <Text>{item.text}</Text>
    </View>
  )
}
