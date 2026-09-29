import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { assetUrl } from '@/utils/asset'
import { formatAmount } from '@/utils/money'
import type { Equipment } from '@/services/api/equipment'

import './index.scss'

interface Props {
  item: Equipment
  available?: number
  /** 分类底色，用于封面缺失时的兜底 */
  fallbackBg?: string
}

const DEFAULT_FALLBACK_BG = '#eaf2fd'

export default function EquipmentCard({ item, available, fallbackBg }: Props) {
  const soldOut = available !== undefined && available <= 0
  const cover = assetUrl(item.cover_path)

  const handleTap = () => {
    Taro.navigateTo({ url: `/pages/equipment/index?id=${item.id}` })
  }

  return (
    <View className="eq-card" onClick={handleTap}>
      <View className="eq-cover">
        {cover ? (
          <Image
            className="eq-cover-img"
            src={cover}
            mode="aspectFill"
            lazyLoad
          />
        ) : (
          <View
            className="eq-cover-fallback"
            style={{ background: fallbackBg || DEFAULT_FALLBACK_BG }}
          >
            <Text>{item.name.slice(0, 1)}</Text>
          </View>
        )}
        {available !== undefined && (
          <View className="eq-stock">可租 {available}</View>
        )}
        {soldOut && <View className="eq-soldout">已租完</View>}
      </View>
      <View className="eq-body">
        <Text className="eq-name">{item.name}</Text>
        <Text className="eq-spec">{item.spec || ''}</Text>
        <View className="eq-foot">
          <Text className="eq-price">{formatAmount(item.daily_cents)}</Text>
          <Text className="eq-unit">元/天</Text>
        </View>
      </View>
    </View>
  )
}
