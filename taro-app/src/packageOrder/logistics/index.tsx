import { View, Text, Button, Image } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'

import Empty from '@/components/Empty'
import StatusTag from '@/components/StatusTag'
import ShipTimeline from '@/components/ShipTimeline'
import { getShipmentByOrder } from '@/services/api/shipment'
import { getMyOrder } from '@/services/api/order'
import { getEquipment } from '@/services/api/equipment'
import { SHIP_STATUS, EXPRESS } from '@/constants/domain'
import { assetUrl } from '@/utils/asset'
import { copyText, toast } from '@/utils/platform'

import './index.scss'

export default function LogisticsPage() {
  const router = useRouter()
  const orderId = Number(router.params.order_id || 0)

  const orderQ = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => getMyOrder(orderId),
    enabled: !!orderId,
  })

  const shipQ = useQuery({
    queryKey: ['shipment', orderId],
    queryFn: () => getShipmentByOrder(orderId),
    enabled: !!orderId,
    retry: false,
  })

  const order = orderQ.data
  const equipQ = useQuery({
    queryKey: ['equipment', order?.equipment_id],
    queryFn: () => getEquipment(order!.equipment_id),
    enabled: !!order?.equipment_id,
  })

  const detail = shipQ.data
  const ship = detail?.shipment
  const traces = detail?.traces || []
  const equipment = equipQ.data
  // 设备封面：相对路径须经 assetUrl 拼成完整 http 地址（同订单详情页）
  const cover = equipment?.cover_path ? assetUrl(equipment.cover_path) : ''
  const coverInitial = equipment?.name ? equipment.name.slice(0, 1) : '·'

  if (!ship) return <Empty text="暂无物流信息" />

  const handleCopy = async () => {
    try {
      await copyText(ship.no)
      toast('单号已复制', 'success')
    } catch {
      toast('复制失败')
    }
  }

  return (
    <View className="logistics-page">
      <View className="card">
        <View className="head">
          <Text className="equip-name">{equipment?.name || '—'}</Text>
          <StatusTag map={SHIP_STATUS} value={ship.status} />
        </View>
        <Text className="order-no">{order?.no || ''}</Text>

        <View className="ship-row">
          <View className="ship-thumb">
            {cover ? (
              <Image className="ship-thumb-img" src={cover} mode="aspectFill" />
            ) : (
              <Text>{coverInitial}</Text>
            )}
          </View>
          <View className="ship-info">
            <Text className="express">{EXPRESS[ship.express] || '—'}</Text>
            <Text className="ship-no moneyfont">{ship.no}</Text>
          </View>
          <Button className="copy-btn" onClick={handleCopy}>
            复制
          </Button>
        </View>
      </View>

      <View className="card">
        <Text className="sec">收货信息</Text>
        <View className="info-row">
          <Text className="label">收货人</Text>
          <Text className="val">{ship.receiver}</Text>
        </View>
        <View className="info-row">
          <Text className="label">联系电话</Text>
          <Text className="val">{ship.phone}</Text>
        </View>
        <View className="info-row">
          <Text className="label">收货地址</Text>
          <Text className="val addr">{ship.address}</Text>
        </View>
      </View>

      <View className="card">
        <Text className="sec">物流轨迹</Text>
        <ShipTimeline traces={traces} />
      </View>

      <Text className="note">
        轨迹由快递公司回传，可能存在延迟。如遇异常请联系客服。
      </Text>
    </View>
  )
}
