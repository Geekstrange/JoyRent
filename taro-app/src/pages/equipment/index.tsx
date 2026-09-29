import { useMemo, useState } from 'react'
import { View, Text, Image, ScrollView, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'

import Empty from '@/components/Empty'
import {
  getEquipment,
  getAvailability,
  type AvailabilityBar,
} from '@/services/api/equipment'
import { listCategories } from '@/services/api/category'
import { useAuthStore } from '@/store/auth'
import { assetUrl } from '@/utils/asset'
import { formatAmount, formatMoney } from '@/utils/money'
import { addDays, diffDays, today } from '@/utils/date'
import { toast } from '@/utils/platform'

import './index.scss'

export default function EquipmentPage() {
  const router = useRouter()
  const id = Number(router.params.id || 0)

  const [start, setStart] = useState(today())
  const [end, setEnd] = useState(addDays(today(), 3))

  const eqQ = useQuery({
    queryKey: ['equipment', id],
    queryFn: () => getEquipment(id),
    enabled: !!id,
  })
  const catQ = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  })
  const availQ = useQuery({
    queryKey: ['availability', id],
    queryFn: () => getAvailability(id, 14),
    enabled: !!id,
  })

  const equipment = eqQ.data
  const categories = catQ.data || []
  const bars: AvailabilityBar[] = availQ.data || []

  const categoryName = useMemo(() => {
    if (!equipment) return ''
    const c = categories.find((x) => x.id === equipment.category_id)
    return c?.name || ''
  }, [categories, equipment])

  const days = diffDays(start, end)
  const rentCents = equipment ? equipment.daily_cents * days : 0
  const depositCents = equipment?.deposit_cents || 0
  const totalCents = rentCents + depositCents

  const dayList = useMemo(() => {
    const arr: string[] = []
    for (let i = 0; i < 14; i++) arr.push(addDays(today(), i))
    return arr
  }, [])

  const currentAvail = useMemo(() => {
    const b = bars.find((x) => x.date === start)
    return b ? b.count : (equipment?.total ?? 0)
  }, [bars, start, equipment])

  const canRent = equipment && currentAvail > 0

  const handleStart = (d: string) => {
    setStart(d)
    if (diffDays(d, end) <= 0) {
      setEnd(addDays(d, 1))
    }
  }

  const handleEnd = (d: string) => {
    if (diffDays(start, d) <= 0) {
      toast('归还日须晚于起租日')
      return
    }
    setEnd(d)
  }

  const handleRent = async () => {
    if (!equipment) return

    const token = useAuthStore.getState().token
    if (!token) {
      try {
        await useAuthStore.getState().login()
      } catch (err: any) {
        toast(err?.message || '登录失败')
        return
      }
    }

    Taro.navigateTo({
      url: `/packageOrder/order-detail/index?equipment_id=${equipment.id}&start=${start}&end=${end}&mode=create`,
    })
  }

  if (!id) return <Empty text="设备不存在" />
  if (eqQ.isLoading || !equipment) {
    return <Empty text="加载中..." />
  }

  const cover = assetUrl(equipment.cover_path)
  const soldOut = currentAvail <= 0

  return (
    <View className="equipment-page">
      <View className="banner">
        {cover ? (
          <Image className="banner-img" src={cover} mode="aspectFill" />
        ) : (
          <View className="banner-fallback">
            <Text>{equipment.name.slice(0, 1)}</Text>
          </View>
        )}
      </View>

      <View className="card">
        <Text className="d-title">{equipment.name}</Text>
        <Text className="d-cat">
          {categoryName} · 共 {equipment.total} 台
        </Text>
        <View className="d-price-row">
          <Text className="d-price">{formatAmount(equipment.daily_cents)}</Text>
          <Text className="d-unit">元/天</Text>
          <Text className="d-deposit">
            押金 {formatMoney(equipment.deposit_cents)}
          </Text>
        </View>
        <Text className="d-desc">
          {equipment.description || '成色良好，含基础配件。支持同城自提或配送，租期内提供免费技术支持。'}
        </Text>
      </View>

      <View className="card">
        <Text className="sec">未来 14 天可用量</Text>
        <View className="bars">
          {bars.map((b, i) => {
            // demo 的柱高公式：min(70, 可租数*12+4) px → ×2 = min(140, n*24+8) rpx
            const h = Math.min(140, b.count * 24 + 8)
            // demo 只在偶数位标注日期，且格式为 MM/DD
            const lbl = i % 2 === 0 ? b.date.slice(5).replace('-', '/') : ''
            return (
              <View key={b.date} className="bar-col">
                <View
                  className={`bar ${b.count > 0 ? '' : 'out'}`}
                  style={{ height: `${h}rpx` }}
                />
                <Text className="bar-lbl">{lbl}</Text>
              </View>
            )
          })}
        </View>
      </View>

      <View className="card">
        <Text className="sec">选择租期</Text>
        <Text className="sub-label">起租日</Text>
        <ScrollView scrollX className="date-bar">
          {dayList.map((d) => (
            <View
              key={d}
              className={`date-chip ${d === start ? 'on' : ''}`}
              onClick={() => handleStart(d)}
            >
              <Text>{d.slice(5).replace("-", "/")}</Text>
            </View>
          ))}
        </ScrollView>

        <Text className="sub-label">归还日</Text>
        <ScrollView scrollX className="date-bar">
          {dayList.map((d) => {
            const dis = diffDays(start, d) <= 0
            return (
              <View
                key={d}
                className={`date-chip ${d === end ? 'on' : ''} ${dis ? 'dis' : ''}`}
                onClick={() => !dis && handleEnd(d)}
              >
                <Text>{d.slice(5).replace("-", "/")}</Text>
              </View>
            )
          })}
        </ScrollView>
      </View>

      <View className="card">
        <Text className="sec">费用明细</Text>
        <View className="fee-row">
          <Text className="fee-label">租期</Text>
          <Text className="fee-val">
            {days} 天（{start} 至 {end}）
          </Text>
        </View>
        <View className="fee-row">
          <Text className="fee-label">租金</Text>
          <Text className="fee-val">{formatMoney(rentCents)}</Text>
        </View>
        <View className="fee-row">
          <Text className="fee-label">押金（可退）</Text>
          <Text className="fee-val">{formatMoney(depositCents)}</Text>
        </View>
        <View className="fee-row big">
          <Text>应付总额</Text>
          <Text className="fee-total">{formatMoney(totalCents)}</Text>
        </View>
        <Text className={`avail-hint ${canRent ? 'ok' : 'warn'}`}>
          {canRent
            ? `该租期可租 ${currentAvail} 台`
            : '该租期已租完，请调整日期'}
        </Text>
      </View>

      <View className="footer-bar">
        <View className="footer-sum">
          <Text className="footer-price">{formatMoney(totalCents)}</Text>
          <Text className="footer-hint">
            含押金 {formatMoney(depositCents)}
          </Text>
        </View>
        <Button
          className={`btn-rent ${soldOut ? 'disabled' : ''}`}
          disabled={!!soldOut}
          onClick={handleRent}
        >
          {soldOut ? '已租完' : '立即租赁'}
        </Button>
      </View>
    </View>
  )
}
