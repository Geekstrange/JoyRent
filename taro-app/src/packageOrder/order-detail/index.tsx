import { useState } from 'react'
import { View, Text, Button, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'

import Empty from '@/components/Empty'
import StatusTag from '@/components/StatusTag'
import {
  getMyOrder,
  createOrder,
} from '@/services/api/order'
import { payOrder } from '@/services/payFlow'
import { getEquipment, type Equipment } from '@/services/api/equipment'
import { getShipmentByOrder } from '@/services/api/shipment'
import { getDefaultAddress, fullAddress, type Address } from '@/services/api/address'
import { getCreditStatus, authorizeCredit } from '@/services/api/credit'
import { useAuthStore } from '@/store/auth'
import { ORDER_STATUS, DEPOSIT_STATUS, SHIP_STATUS, EXPRESS, INVOICE_ALLOWED_STATUS } from '@/constants/domain'
import { formatMoney } from '@/utils/money'
import { formatDate, formatDateTime } from '@/utils/date'
import { assetUrl } from '@/utils/asset'
import { toast, confirm } from '@/utils/platform'

import './index.scss'

export default function OrderDetailPage() {
  const router = useRouter()
  const mode = router.params.mode || 'view'
  const orderId = Number(router.params.id || 0)
  const equipmentId = Number(router.params.equipment_id || 0)
  const start = router.params.start || ''
  const end = router.params.end || ''

  const token = useAuthStore((s) => s.token)

  // 创建模式：先拉设备信息，用户确认后调 createOrder
  const createEqQ = useQuery({
    queryKey: ['equipment', equipmentId],
    queryFn: () => getEquipment(equipmentId),
    enabled: mode === 'create' && !!equipmentId,
  })

  // 查看模式：拉订单 + 设备 + 物流
  const orderQ = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => getMyOrder(orderId),
    enabled: mode === 'view' && !!orderId,
  })

  const order = orderQ.data
  const equipmentFromOrder = useQuery({
    queryKey: ['equipment', order?.equipment_id],
    queryFn: () => getEquipment(order!.equipment_id),
    enabled: mode === 'view' && !!order?.equipment_id,
  })

  const shipQ = useQuery({
    queryKey: ['shipment', orderId],
    queryFn: () => getShipmentByOrder(orderId),
    enabled: mode === 'view' && !!orderId && ['paid', 'renting', 'returned', 'closed'].includes(order?.status || ''),
    retry: false,
  })

  const [submitting, setSubmitting] = useState(false)

  // ── 创建订单：收货地址 ────────────────────────────────────────────
  // 默认地址：未下单前带出来，用户可点击卡片改选。
  // 放在 create 模式才请求，view 模式不打扰。
  const defaultAddrQ = useQuery({
    queryKey: ['address-default'],
    queryFn: getDefaultAddress,
    enabled: mode === 'create' && !!token,
    staleTime: 0,
  })
  // 用户手动选择的地址（优先级高于默认地址）
  const [picked, setPicked] = useState<Address | null>(null)
  // 默认地址返回 null 时 picked 保持 null，-> 界面提示「请选择收货地址」
  const chosen = picked || defaultAddrQ.data || null

  // ── 信用分：押金减免依据 ──────────────────────────────────────────
  // 只在 create 模式拉：view 模式的押金是订单快照，与当前信用分无关。
  // 未授权也返回 200（authorized:false），此时押金按全额展示。
  const creditQ = useQuery({
    queryKey: ['credit'],
    queryFn: getCreditStatus,
    enabled: mode === 'create' && !!token,
    retry: false,
  })

  // 授权信用分（本地为模拟分；真实芝麻会先拉起授权页）
  const handleAuthorizeCredit = async () => {
    try {
      await authorizeCredit()
      await creditQ.refetch()
      toast('信用授权成功', 'success')
    } catch (err: any) {
      toast(err?.message || '信用授权失败')
    }
  }

  const goPickAddress = () => {
    // select=1 让地址列表页进入「选用」模式
    Taro.navigateTo({
      url: '/packageUser/address/index?select=1',
      // 通过 EventChannel 接收列表页选中的地址
      success: (res) => {
        res.eventChannel.on('addressSelected', (a: Address) => setPicked(a))
      },
    })
  }

  if (mode === 'create') {
    const eq: Equipment | undefined = createEqQ.data
    if (!eq) return <Empty text="加载中..." />

    const days = Math.max(
      1,
      Math.round(
        (new Date(end).getTime() - new Date(start).getTime()) / 86400000
      ) + 1
    )
    const rentCents = eq.daily_cents * days

    // 押金按信用分档位减免（≥700 全免 / 650-699 半价 / 其余全额）。
    //
    // ⚠️ 只依赖后端下发的 `deposit_tier`（三档），**不硬编码分数阈值** ——
    // 阈值归后端管，调整档位（如 700→720）时前端无需改动。
    // 半价用 `Math.floor` 与后端的整数除法（originalCents/2）保持一致，
    // 否则会出现「页面显示 ¥500、实际收 ¥500.5」这种对不上的情况。
    const depositOriginal = eq.deposit_cents
    const tier = creditQ.data?.deposit_tier || 'full'
    const depositCents =
      tier === 'full_free'
        ? 0
        : tier === 'half'
          ? Math.floor(depositOriginal / 2)
          : depositOriginal
    const depositSaved = depositOriginal - depositCents
    const totalCents = rentCents + depositCents

    const handleConfirm = async () => {
      if (!token) {
        try {
          await useAuthStore.getState().login()
        } catch (err: any) {
          toast(err?.message || '登录失败')
          return
        }
      }
      // 收货地址是下单必需项：后端也会拦，这里先拦一次省掉一次往返，
      // 并直接把用户引到选地址的页面（而不是只弹一句错就没了）。
      if (!chosen) {
        toast('请先选择收货地址')
        goPickAddress()
        return
      }
      setSubmitting(true)
      try {
        const created = await createOrder({
          equipment_id: eq.id,
          start_at: start,
          end_at: end,
          address_id: chosen.id,
        })
        toast('下单成功', 'success')
        // 下单成功后直接跳订单详情（view 模式），用户可继续支付
        Taro.redirectTo({
          url: `/packageOrder/order-detail/index?id=${created.id}`,
        })
      } catch (err: any) {
        toast(err?.message || '下单失败')
      } finally {
        setSubmitting(false)
      }
    }

    return (
      <View className="order-detail-page">
        {/* 收货地址：下单必填。有默认地址时自动带出，点击可改选 */}
        <View className="card addr-card" onClick={goPickAddress}>
          {chosen ? (
            <View className="addr-body">
              <View className="addr-line">
                <Text className="addr-name">{chosen.receiver}</Text>
                <Text className="addr-phone">{chosen.phone}</Text>
              </View>
              <Text className="addr-text">{fullAddress(chosen)}</Text>
            </View>
          ) : (
            <View className="addr-body">
              <Text className="addr-empty">请选择收货地址</Text>
              <Text className="addr-sub">下单后按此地址发货</Text>
            </View>
          )}
          <Text className="addr-arrow">›</Text>
        </View>

        <View className="card">
          <View className="head">
            <Text className="title">{eq.name}</Text>
          </View>
          <View className="row">
            <Text className="label">租期</Text>
            <Text className="val">
              {start} 至 {end} · {days} 天
            </Text>
          </View>
          <View className="row">
            <Text className="label">租金</Text>
            <Text className="val">{formatMoney(rentCents)}</Text>
          </View>
          <View className="row">
            <Text className="label">押金</Text>
            <View className="val-group">
              {/* 有减免时把原价划掉，让用户一眼看出省了多少 */}
              {depositSaved > 0 && (
                <Text className="val-origin">{formatMoney(depositOriginal)}</Text>
              )}
              <Text className="val">{formatMoney(depositCents)}</Text>
            </View>
          </View>

          {depositSaved > 0 && (
            <Text className="credit-note">
              {creditQ.data?.tier_label}
              {creditQ.data?.authorized ? `（信用分 ${creditQ.data.score}）` : ''}
              ，已减免 {formatMoney(depositSaved)}
            </Text>
          )}

          {/* 未授权时给一个直接的授权入口 —— 否则用户不知道押金还能减免 */}
          {mode === 'create' && !!token && creditQ.data && !creditQ.data.authorized && (
            <View className="credit-cta" onClick={handleAuthorizeCredit}>
              <Text className="credit-cta-text">
                授权芝麻信用，最高可全免押金 ›
              </Text>
            </View>
          )}
          <View className="row total">
            <Text>应付总额</Text>
            <Text className="total-val">{formatMoney(totalCents)}</Text>
          </View>
        </View>

        <View className="footer-bar">
          <View className="sum">
            <Text className="price">{formatMoney(totalCents)}</Text>
            <Text className="hint">含押金 {formatMoney(depositCents)}</Text>
          </View>
          <Button
            className="primary-btn"
            loading={submitting}
            onClick={handleConfirm}
          >
            提交订单
          </Button>
        </View>
      </View>
    )
  }

  // view 模式
  if (!order) return <Empty text="加载中..." />
  const equipment = equipmentFromOrder.data
  // 设备封面：后端返回的是相对路径（/equipment/2026/09/xxx.png），
  // 必须经 assetUrl 拼成完整 http 地址，否则小程序会当包内路径去找 → 404 空图。
  const cover = equipment?.cover_path ? assetUrl(equipment.cover_path) : ''
  const coverInitial = equipment?.name ? equipment.name.slice(0, 1) : '·'
  const canPay = order.status === 'pending'
  const canInvoice =
    INVOICE_ALLOWED_STATUS.includes(order.status)

  const handlePay = async () => {
    setSubmitting(true)
    try {
      // payOrder 内部会区分「真实渠道」与「Mock 渠道」：
      // 真实渠道调起 wx.requestPayment / my.tradePay；
      // Mock 渠道（后端未配置支付时）改为回调后端推进订单状态。
      const r = await payOrder(order.id, order.rent_cents + order.deposit_cents)
      // 明确区分文案，避免本地 Mock 支付被误认为真实扣款成功
      toast(r.mocked ? '支付成功（本地 Mock 渠道）' : '支付成功', 'success')
      orderQ.refetch()
    } catch (err: any) {
      toast(err?.message || '支付失败')
    } finally {
      setSubmitting(false)
    }
  }

  const goShipment = () => {
    Taro.navigateTo({
      url: `/packageOrder/logistics/index?order_id=${order.id}`,
    })
  }

  const goInvoice = () => {
    Taro.navigateTo({
      url: `/packageOrder/invoice-apply/index?order_id=${order.id}`,
    })
  }

  const goInvoiceDetail = (id: number) => {
    Taro.navigateTo({
      url: `/packageOrder/invoice-detail/index?id=${id}`,
    })
  }

  const ship = shipQ.data?.shipment
  const lastTrace = shipQ.data?.traces?.[shipQ.data.traces.length - 1]

  return (
    <View className="order-detail-page">
      <View className="card">
        <View className="head">
          <Text className="order-no">{order.no}</Text>
          <StatusTag map={ORDER_STATUS} value={order.status} />
        </View>
        <View className="equip-row">
          {/* 缩略图：优先真实封面，缺失时退化为「底色 + 首字」 */}
          <View className="equip-thumb">
            {cover ? (
              <Image className="equip-thumb-img" src={cover} mode="aspectFill" />
            ) : (
              <Text>{coverInitial}</Text>
            )}
          </View>
          <View className="equip-info">
            <Text className="equip-name">
              {equipment?.name || `#${order.equipment_id}`}
            </Text>
            <Text className="equip-sub">平台自营</Text>
          </View>
        </View>
      </View>

      <View className="card">
        <Text className="sec">租期信息</Text>
        <View className="row">
          <Text className="label">起租</Text>
          <Text className="val">{formatDate(order.start_at)}</Text>
        </View>
        <View className="row">
          <Text className="label">归还</Text>
          <Text className="val">{formatDate(order.end_at)}</Text>
        </View>
        <View className="row">
          <Text className="label">共</Text>
          <Text className="val">{order.days} 天</Text>
        </View>
      </View>

      <View className="card">
        <Text className="sec">费用</Text>
        <View className="row">
          <Text className="label">租金</Text>
          <Text className="val">{formatMoney(order.rent_cents)}</Text>
        </View>
        <View className="row">
          <Text className="label">押金</Text>
          <Text className="val">{formatMoney(order.deposit_cents)}</Text>
        </View>
        <View className="row">
          <Text className="label">押金状态</Text>
          <View>
            <StatusTag map={DEPOSIT_STATUS} value={order.dep_status} />
          </View>
        </View>
        <View className="row total">
          <Text>合计</Text>
          <Text className="total-val">
            {formatMoney(order.rent_cents + order.deposit_cents)}
          </Text>
        </View>
      </View>

      <View className="card">
        <View className="sec-row" onClick={ship ? goShipment : undefined}>
          <Text className="sec">物流</Text>
          {ship ? (
            <Text className="sec-more">查看轨迹 ›</Text>
          ) : (
            <Text className="sec-more muted">
              {order.status === 'pending' ? '付款后安排发货' : '待发货'}
            </Text>
          )}
        </View>
        {ship && (
          <>
            <View className="row">
              <Text className="label">快递</Text>
              <Text className="val">{EXPRESS[ship.express] || '—'}</Text>
            </View>
            <View className="row">
              <Text className="label">运单号</Text>
              <Text className="val moneyfont">{ship.no}</Text>
            </View>
            <View className="row">
              <Text className="label">状态</Text>
              <View>
                <StatusTag map={SHIP_STATUS} value={ship.status} />
              </View>
            </View>
            {lastTrace && (
              <Text className="last-trace">{lastTrace.text}</Text>
            )}
          </>
        )}
      </View>

      <View className="card">
        <Text className="sec">发票</Text>
        {canInvoice ? (
          <View className="invoice-row" onClick={goInvoice}>
            <Text className="invoice-hint">
              可开票金额 {formatMoney(order.rent_cents)}（押金不计入）
            </Text>
            <Text className="invoice-btn">申请发票 ›</Text>
          </View>
        ) : (
          <Text className="muted-text">
            {order.status === 'pending'
              ? '订单支付完成后即可申请开票'
              : '该订单状态不支持开票'}
          </Text>
        )}
      </View>

      <View className="card">
        <Text className="sec">其他</Text>
        <View className="row">
          <Text className="label">下单时间</Text>
          <Text className="val">{formatDateTime(order.created_at)}</Text>
        </View>
        <View className="row">
          <Text className="label">商家</Text>
          <Text className="val">平台自营</Text>
        </View>
      </View>

      {canPay && (
        <View className="footer-bar">
          <View className="sum">
            <Text className="price">
              {formatMoney(order.rent_cents + order.deposit_cents)}
            </Text>
            <Text className="hint">待支付</Text>
          </View>
          <Button
            className="primary-btn"
            loading={submitting}
            onClick={handlePay}
          >
            立即支付
          </Button>
        </View>
      )}
    </View>
  )
}
