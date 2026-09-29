import { View, Text, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'

import Empty from '@/components/Empty'
import StatusTag from '@/components/StatusTag'
import { getMyInvoice } from '@/services/api/invoice'
import { getEquipment } from '@/services/api/equipment'
import { INVOICE_STATUS, INVOICE_TYPE } from '@/constants/domain'
import { formatMoney } from '@/utils/money'
import { formatDateTime } from '@/utils/date'

import './index.scss'

export default function InvoiceDetailPage() {
  const router = useRouter()
  const id = Number(router.params.id || 0)

  const invQ = useQuery({
    queryKey: ['my-invoice', id],
    queryFn: () => getMyInvoice(id),
    enabled: !!id,
  })

  const inv = invQ.data
  const eqQ = useQuery({
    queryKey: ['equipment', inv?.order_id],
    queryFn: () => getEquipment(0),
    enabled: false,
  })

  if (!inv) return <Empty text="加载中..." />

  const handleReapply = () => {
    Taro.navigateTo({
      url: `/packageOrder/invoice-apply/index?order_id=${inv.order_id}`,
    })
  }

  return (
    <View className="invoice-detail-page">
      <View className="card">
        <View className="head">
          <Text className="inv-no">{inv.no}</Text>
          <StatusTag map={INVOICE_STATUS} value={inv.status} />
        </View>
        <View className="title-row">
          <View className="inv-thumb">
            <Text>{inv.title.slice(0, 1) || '·'}</Text>
          </View>
          <View className="inv-info">
            <Text className="inv-title">{inv.title}</Text>
            <Text className="inv-sub">
              {INVOICE_TYPE[inv.type]}
              {inv.tax_no ? ` · ${inv.tax_no}` : ''}
            </Text>
          </View>
        </View>
      </View>

      <View className="card">
        <Text className="sec">票面信息</Text>
        <View className="row">
          <Text className="label">发票类型</Text>
          <Text className="val">{INVOICE_TYPE[inv.type]}</Text>
        </View>
        <View className="row">
          <Text className="label">发票抬头</Text>
          <Text className="val">{inv.title}</Text>
        </View>
        {inv.tax_no && (
          <View className="row">
            <Text className="label">税号</Text>
            <Text className="val">{inv.tax_no}</Text>
          </View>
        )}
        <View className="row">
          <Text className="label">开票金额</Text>
          <Text className="val red">{formatMoney(inv.amount_cents)}</Text>
        </View>
        <View className="row">
          <Text className="label">接收邮箱</Text>
          <Text className="val">{inv.email || '—'}</Text>
        </View>
        {inv.invoice_no && (
          <View className="row">
            <Text className="label">发票号码</Text>
            <Text className="val moneyfont">{inv.invoice_no}</Text>
          </View>
        )}
      </View>

      <View className="card">
        <Text className="sec">关联订单</Text>
        <View className="row">
          <Text className="label">订单号</Text>
          <Text className="val moneyfont">{inv.order_id}</Text>
        </View>
        <View className="row">
          <Text className="label">申请时间</Text>
          <Text className="val">{formatDateTime(inv.created_at)}</Text>
        </View>
      </View>

      {inv.status === 'rejected' && inv.reason && (
        <View className="card">
          <Text className="sec">拒绝原因</Text>
          <Text className="reason">{inv.reason}</Text>
        </View>
      )}

      <View className="card">
        <Text className="sec">处理进度</Text>
        <View className="step">
          <View className="step-dot on">
            <Text>1</Text>
          </View>
          <View className="step-body">
            <Text className="step-title on">提交申请</Text>
            <Text className="step-sub">{formatDateTime(inv.created_at)}</Text>
          </View>
        </View>
        <View className="step">
          <View className={`step-dot ${inv.status !== 'pending' ? 'on' : ''}`}>
            <Text>2</Text>
          </View>
          <View className="step-body">
            <Text className={`step-title ${inv.status !== 'pending' ? 'on' : ''}`}>
              平台审核
            </Text>
            <Text className="step-sub">
              {inv.status === 'pending' ? '审核中' : '已处理'}
            </Text>
          </View>
        </View>
        <View className="step">
          <View className={`step-dot ${inv.status === 'issued' ? 'on' : ''}`}>
            <Text>3</Text>
          </View>
          <View className="step-body">
            <Text className={`step-title ${inv.status === 'issued' ? 'on' : ''}`}>
              开票完成
            </Text>
            <Text className="step-sub">
              {inv.status === 'issued'
                ? `发票号 ${inv.invoice_no}`
                : '—'}
            </Text>
          </View>
        </View>
      </View>

      {inv.status === 'rejected' && (
        <Button className="reapply-btn" onClick={handleReapply}>
          重新申请
        </Button>
      )}
    </View>
  )
}
