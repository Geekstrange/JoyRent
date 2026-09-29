import { useMemo, useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import Empty from '@/components/Empty'
import ErrorState from '@/components/ErrorState'
import StatusTag from '@/components/StatusTag'
import {
  listMyOrders,
  type Order,
} from '@/services/api/order'
import { getEquipment, type Equipment } from '@/services/api/equipment'
import { listMyInvoices, type Invoice } from '@/services/api/invoice'
import { getShipmentByOrder, type ShipmentDetail } from '@/services/api/shipment'
import { listCategories } from '@/services/api/category'
import { ORDER_STATUS, DEPOSIT_STATUS, SHIP_STATUS, INVOICE_STATUS, INVOICE_ALLOWED_STATUS } from '@/constants/domain'
import { formatMoney } from '@/utils/money'
import { formatDate } from '@/utils/date'
import { assetUrl } from '@/utils/asset'
import { consumePendingOrdersTab } from '@/utils/ordersTab'

import iconInvoice from '@/assets/mine/invoice.png'
import iconShip from '@/assets/mine/ship.png'

import './index.scss'

const TABS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待支付' },
  { key: 'renting', label: '租赁中' },
  { key: 'returned', label: '已归还' },
]

/** 与首页同一套浅色板，按一级分类顺序轮转 */
const CAT_COLORS = ['#e6f4ff', '#f9f0ff', '#e6fffb', '#f6ffed', '#fff7e6']

/** 发票状态标签底色（与后台同一套色板） */
const INV_BG: Record<string, string> = {
  pending: '#fff7e6',
  issued: '#f6ffed',
  rejected: '#fff1f0',
}

/** 物流状态标签底色 */
const SHIP_BG: Record<string, string> = {
  none: '#f5f5f5',
  shipped: '#e6f4ff',
  delivering: '#fff7e6',
  signed: '#f6ffed',
  returning: '#e6fffb',
  received: '#f6ffed',
}

export default function OrdersPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('')
  const [eqMap, setEqMap] = useState<Record<number, Equipment>>({})
  const [shipMap, setShipMap] = useState<Record<number, ShipmentDetail>>({})

  const orderQ = useQuery({
    queryKey: ['my-orders', tab],
    queryFn: () => listMyOrders(tab ? { status: tab } : {}),
  })

  const invQ = useQuery({
    queryKey: ['my-invoices'],
    queryFn: () => listMyInvoices(),
  })

  const catQ = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  })

  const orders = orderQ.data || []
  const invoices = invQ.data || []
  const categories = catQ.data || []

  // 订单所属一级分类的底色（缩略图兜底用），与首页同一套算法
  const catColorOf = useMemo(() => {
    const tops = categories.filter((c) => !c.parent_id)
    const map: Record<number, string> = {}
    categories.forEach((c) => {
      const rootId = c.parent_id || c.id
      const idx = tops.findIndex((t) => t.id === rootId)
      map[c.id] = CAT_COLORS[(idx < 0 ? 0 : idx) % CAT_COLORS.length]
    })
    return map
  }, [categories])

  // 批量补充设备信息，用于卡片展示
  const missingIds = useMemo(() => {
    const ids = new Set<number>()
    orders.forEach((o) => {
      if (!eqMap[o.equipment_id]) ids.add(o.equipment_id)
    })
    return Array.from(ids)
  }, [orders, eqMap])

  useMemo(() => {
    if (!missingIds.length) return
    Promise.all(
      missingIds.map(async (id) => {
        try {
          const e = await getEquipment(id)
          setEqMap((prev) => ({ ...prev, [id]: e }))
        } catch {
          // ignore
        }
      })
    )
  }, [missingIds])

  // 物流：只有「已支付及之后」的订单才可能有运单，逐个查并缓存。
  // 没有运单的接口会返回错误，这里静默忽略即可（渲染时按「待发货」处理）。
  const shipIds = useMemo(() => {
    const ids = new Set<number>()
    orders.forEach((o) => {
      if (o.status !== 'pending' && o.status !== 'cancelled' && !shipMap[o.id]) {
        ids.add(o.id)
      }
    })
    return Array.from(ids)
  }, [orders, shipMap])

  useMemo(() => {
    if (!shipIds.length) return
    Promise.all(
      shipIds.map(async (id) => {
        try {
          const d = await getShipmentByOrder(id)
          setShipMap((prev) => ({ ...prev, [id]: d }))
        } catch {
          // 无运单，保持缺省（渲染为待发货）
        }
      })
    )
  }, [shipIds])

  useDidShow(() => {
    // 从「我的」页跳进来时可能带着「落在哪个 tab」的意图。
    // 本页是 tabBar 页，switchTab 不支持 query 参数，所以意图靠
    // utils/ordersTab 这个模块级变量传递（取走即清空）。
    const wanted = consumePendingOrdersTab()
    if (wanted !== null) setTab(wanted)
    qc.invalidateQueries({ queryKey: ['my-orders'] })
    qc.invalidateQueries({ queryKey: ['my-invoices'] })
  })

  usePullDownRefresh(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['my-orders'] }),
      qc.invalidateQueries({ queryKey: ['my-invoices'] }),
    ])
    Taro.stopPullDownRefresh()
  })

  const retry = () => {
    qc.invalidateQueries({ queryKey: ['my-orders'] })
    qc.invalidateQueries({ queryKey: ['my-invoices'] })
    qc.invalidateQueries({ queryKey: ['categories'] })
  }

  const goDetail = (o: Order) => {
    Taro.navigateTo({
      url: `/packageOrder/order-detail/index?id=${o.id}`,
    })
  }

  const goInvoiceList = () => {
    Taro.navigateTo({ url: '/packageOrder/invoice-list/index' })
  }

  const goInvoiceDetail = (id: number) => {
    Taro.navigateTo({ url: `/packageOrder/invoice-detail/index?id=${id}` })
  }

  const goApplyInvoice = (orderId: number) => {
    Taro.navigateTo({
      url: `/packageOrder/invoice-apply/index?order_id=${orderId}`,
    })
  }

  const goShipment = (o: Order) => {
    Taro.navigateTo({ url: `/packageOrder/logistics/index?order_id=${o.id}` })
  }

  /** 发票行：有发票→状态+查看；可申请→申请入口；否则置灰 */
  const renderInvoiceRow = (o: Order) => {
    const v: Invoice | undefined = invoices.find((x) => x.order_id === o.id)
    const canApply = INVOICE_ALLOWED_STATUS.indexOf(o.status) >= 0 && !v

    if (v) {
      const st = INVOICE_STATUS[v.status]
      return (
        <View
          className="order-line"
          onClick={(e) => {
            e.stopPropagation()
            goInvoiceDetail(v.id)
          }}
        >
          <Image className="line-ico" src={iconInvoice} mode="aspectFit" />
          <Text className="line-label">发票</Text>
          <View
            className="line-tag"
            style={{ background: INV_BG[v.status] || '#f5f5f5' }}
          >
            <Text className="line-tag-text" style={{ color: tagColor(st?.color) }}>
              {st?.text || v.status}
            </Text>
          </View>
          <Text className="line-act">查看 ›</Text>
        </View>
      )
    }

    if (canApply) {
      return (
        <View
          className="order-line"
          onClick={(e) => {
            e.stopPropagation()
            goApplyInvoice(o.id)
          }}
        >
          <Image className="line-ico" src={iconInvoice} mode="aspectFit" />
          <Text className="line-label pri">申请发票</Text>
          <Text className="line-act">可开 {formatMoney(o.rent_cents)} ›</Text>
        </View>
      )
    }

    return (
      <View className="order-line dim">
        <Image className="line-ico" src={iconInvoice} mode="aspectFit" />
        <Text className="line-label">发票</Text>
        <Text className="line-act">暂不可开票</Text>
      </View>
    )
  }

  /** 物流行：有运单→状态+最新轨迹+轨迹入口；否则置灰提示 */
  const renderShipRow = (o: Order) => {
    const d = shipMap[o.id]
    const sp = d?.shipment
    const status = sp?.status || 'none'
    const st = SHIP_STATUS[status] || SHIP_STATUS.none
    const traces = d?.traces || []
    const last = traces.length ? traces[traces.length - 1] : null

    if (!sp || status === 'none') {
      return (
        <View className="order-line dim">
          <Image className="line-ico" src={iconShip} mode="aspectFit" />
          <Text className="line-label">物流</Text>
          <Text className="line-act">
            {o.status === 'pending' ? '付款后安排发货' : '待发货'}
          </Text>
        </View>
      )
    }

    return (
      <View
        className="order-line"
        onClick={(e) => {
          e.stopPropagation()
          goShipment(o)
        }}
      >
        <Image className="line-ico" src={iconShip} mode="aspectFit" />
        <View
          className="line-tag"
          style={{ background: SHIP_BG[status] || '#f5f5f5' }}
        >
          <Text className="line-tag-text" style={{ color: tagColor(st.color) }}>
            {st.text}
          </Text>
        </View>
        {last ? <Text className="line-latest">{last.text}</Text> : null}
        <Text className="line-act">轨迹 ›</Text>
      </View>
    )
  }

  const renderCard = (o: Order) => {
    const eq = eqMap[o.equipment_id]
    const cover = eq?.cover_path ? assetUrl(eq.cover_path) : ''
    const initial = eq?.name ? eq.name.slice(0, 1) : '·'
    const bg = catColorOf[eq?.category_id ?? 0] || CAT_COLORS[0]

    return (
      <View
        key={o.id}
        className="order-card"
        onClick={() => goDetail(o)}
      >
        <View className="order-head">
          <Text className="order-no">{o.no}</Text>
          <StatusTag map={ORDER_STATUS} value={o.status} />
        </View>

        <View className="order-body">
          {/* 缩略图：优先真实封面，缺失时退化为「分类底色 + 首字」
              （与 demo 一致；demo 因是静态原型只用底色+首字） */}
          <View className="order-thumb" style={{ background: bg }}>
            {cover ? (
              <Image className="order-thumb-img" src={cover} mode="aspectFill" />
            ) : (
              <Text className="order-thumb-text">{initial}</Text>
            )}
          </View>
          <View className="order-info">
            <Text className="order-name">{eq?.name || `#${o.equipment_id}`}</Text>
            <Text className="order-period">
              {formatDate(o.start_at)} 至 {formatDate(o.end_at)} · {o.days} 天
            </Text>
            <View className="order-tags">
              <StatusTag map={DEPOSIT_STATUS} value={o.dep_status} />
            </View>
          </View>
          <View className="order-amount">
            <Text className="order-price">{formatMoney(o.rent_cents)}</Text>
            <Text className="order-dep">
              押金 {formatMoney(o.deposit_cents)}
            </Text>
          </View>
        </View>

        {renderShipRow(o)}
        {renderInvoiceRow(o)}

        {o.status === 'pending' && (
          <View className="order-action">
            <Text className="order-hint">待支付</Text>
            <View
              className="order-btn"
              onClick={(e) => {
                e.stopPropagation()
                goDetail(o)
              }}
            >
              <Text>去支付</Text>
            </View>
          </View>
        )}
      </View>
    )
  }

  // 发票汇总卡（demo：有发票时展示在订单列表顶部）
  const issuedSum = invoices
    .filter((v) => v.status === 'issued')
    .reduce((s, v) => s + v.amount_cents, 0)
  const pendingInv = invoices.filter((v) => v.status === 'pending').length

  return (
    <View className="orders-page">
      <View className="otabs">
        {TABS.map((t) => (
          <View
            key={t.key}
            className={`otab ${tab === t.key ? 'on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <Text>{t.label}</Text>
          </View>
        ))}
      </View>

      {invoices.length > 0 && (
        <View className="inv-card" onClick={goInvoiceList}>
          <View className="inv-card-head">
            <Image className="inv-ico" src={iconInvoice} mode="aspectFit" />
            <Text className="inv-title">我的发票</Text>
            <Text className="inv-more">全部 ›</Text>
          </View>
          <View className="inv-card-sum">
            <Text className="inv-sum-item">
              已开票 <Text className="inv-sum-strong">{formatMoney(issuedSum)}</Text>
            </Text>
            <Text className="inv-sum-item">
              {pendingInv ? (
                <>
                  待审核{' '}
                  <Text className="inv-sum-warn">{pendingInv}</Text> 笔
                </>
              ) : (
                <>共 {invoices.length} 笔</>
              )}
            </Text>
          </View>
        </View>
      )}

      {orderQ.error ? (
        <ErrorState error={orderQ.error} onRetry={retry} />
      ) : orderQ.isPending ? (
        <Empty loading hint={`orders:${orderQ.fetchStatus}`} />
      ) : orders.length ? (
        <View className="order-list">{orders.map(renderCard)}</View>
      ) : (
        <Empty text="暂无订单" hint="去首页挑台设备吧" />
      )}
    </View>
  )
}

/** 语义色名 → 实际色值（与后台标签配色保持一致） */
function tagColor(name?: string): string {
  switch (name) {
    case 'orange':
      return '#fa8c16'
    case 'blue':
      return '#1677ff'
    case 'cyan':
      return '#13c2c2'
    case 'green':
      return '#52c41a'
    case 'red':
      return '#cf1322'
    default:
      return '#8c8c8c'
  }
}
