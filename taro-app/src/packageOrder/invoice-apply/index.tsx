import { useMemo, useState } from 'react'
import { View, Text, Input, Button, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'

import Empty from '@/components/Empty'
import { getMyOrder } from '@/services/api/order'
import { getEquipment } from '@/services/api/equipment'
import { applyInvoice, listMyInvoices } from '@/services/api/invoice'
import { INVOICE_ALLOWED_STATUS } from '@/constants/domain'
import { formatMoney } from '@/utils/money'
import { assetUrl } from '@/utils/asset'
import { toast } from '@/utils/platform'

import './index.scss'

export default function InvoiceApplyPage() {
  const router = useRouter()
  const orderId = Number(router.params.order_id || 0)

  const orderQ = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => getMyOrder(orderId),
    enabled: !!orderId,
  })

  const order = orderQ.data
  const eqQ = useQuery({
    queryKey: ['equipment', order?.equipment_id],
    queryFn: () => getEquipment(order!.equipment_id),
    enabled: !!order?.equipment_id,
  })

  const existingQ = useQuery({
    queryKey: ['my-invoices-all'],
    queryFn: () => listMyInvoices(),
  })

  const existing = useMemo(
    () => (existingQ.data || []).find((v) => v.order_id === orderId),
    [existingQ.data, orderId]
  )

  const [type, setType] = useState<'personal' | 'company'>('personal')
  const [title, setTitle] = useState('')
  const [taxNo, setTaxNo] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!order) return <Empty text="加载中..." />

  if (!INVOICE_ALLOWED_STATUS.includes(order.status)) {
    return (
      <Empty
        text="暂不可开票"
        hint={
          order.status === 'pending'
            ? '订单支付完成后即可申请开票'
            : '该订单状态不支持开票'
        }
      />
    )
  }

  if (existing) {
    return (
      <View className="invoice-apply-page">
        <View className="card">
          <Text className="sec">该订单已申请过发票</Text>
          <Text className="info">申请单号：{existing.no}</Text>
          <Button
            className="primary-btn"
            onClick={() =>
              Taro.redirectTo({
                url: `/packageOrder/invoice-detail/index?id=${existing.id}`,
              })
            }
          >
            查看发票详情
          </Button>
        </View>
      </View>
    )
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast('请输入发票抬头')
      return
    }
    if (type === 'company') {
      if (!taxNo.trim()) {
        toast('企业发票必须填写税号')
        return
      }
      if (!/^[A-Z0-9]{15,20}$/i.test(taxNo.trim())) {
        toast('税号格式不正确（15-20 位）')
        return
      }
    }
    if (!email.trim()) {
      toast('请输入接收邮箱')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast('邮箱格式不正确')
      return
    }

    setSubmitting(true)
    try {
      const created = await applyInvoice({
        order_id: order.id,
        type,
        title: title.trim(),
        tax_no: type === 'company' ? taxNo.trim().toUpperCase() : undefined,
        email: email.trim(),
      })
      toast('申请已提交', 'success')
      setTimeout(() => {
        Taro.redirectTo({
          url: `/packageOrder/invoice-detail/index?id=${created.id}`,
        })
      }, 500)
    } catch (err: any) {
      toast(err?.message || '申请失败')
    } finally {
      setSubmitting(false)
    }
  }

  const eq = eqQ.data
  // 设备封面：相对路径须经 assetUrl 拼成完整 http 地址（同订单详情页）
  const cover = eq?.cover_path ? assetUrl(eq.cover_path) : ''
  const coverInitial = eq?.name ? eq.name.slice(0, 1) : '·'

  return (
    <View className="invoice-apply-page">
      <View className="card">
        <View className="equip-row">
          <View className="equip-thumb">
            {cover ? (
              <Image className="equip-thumb-img" src={cover} mode="aspectFill" />
            ) : (
              <Text>{coverInitial}</Text>
            )}
          </View>
          <View className="equip-info">
            <Text className="equip-name">{eq?.name || '—'}</Text>
            <Text className="equip-sub">
              {order.no} · 租金 {formatMoney(order.rent_cents)}
            </Text>
          </View>
        </View>
      </View>

      <View className="card">
        <Text className="sec">发票类型</Text>
        <View className="type-row">
          <View
            className={`type-chip ${type === 'personal' ? 'on' : ''}`}
            onClick={() => setType('personal')}
          >
            <Text className="type-label">个人</Text>
            <Text className="type-hint">无需税号</Text>
          </View>
          <View
            className={`type-chip ${type === 'company' ? 'on' : ''}`}
            onClick={() => setType('company')}
          >
            <Text className="type-label">企业</Text>
            <Text className="type-hint">需填写税号</Text>
          </View>
        </View>
      </View>

      <View className="card">
        <Text className="sec">抬头信息</Text>

        <View className="field">
          <Text className="label">发票抬头</Text>
          <Input
            className="input"
            placeholder={type === 'company' ? '请输入公司名称' : '请输入个人姓名'}
            value={title}
            onInput={(e) => setTitle((e.target as any).value || '')}
          />
        </View>

        {type === 'company' && (
          <View className="field">
            <Text className="label">纳税人识别号</Text>
            <Input
              className="input"
              placeholder="请输入 15-20 位税号"
              value={taxNo}
              onInput={(e) => setTaxNo((e.target as any).value || '')}
            />
          </View>
        )}

        <View className="field">
          <Text className="label">接收邮箱</Text>
          <Input
            className="input"
            type="text"
            placeholder="用于接收电子发票"
            value={email}
            onInput={(e) => setEmail((e.target as any).value || '')}
          />
        </View>

        <View className="amount-row">
          <Text className="amount-label">开票金额</Text>
          <Text className="amount-val">{formatMoney(order.rent_cents)}</Text>
        </View>
        <Text className="amount-tip">
          押金 {formatMoney(order.deposit_cents)} 为暂收款，不计入开票金额。
        </Text>
      </View>

      <Button
        className="submit-btn"
        loading={submitting}
        onClick={handleSubmit}
      >
        提交申请
      </Button>

      <Text className="note">
        电子发票通常在审核通过后 1-3 个工作日内发送至邮箱。
      </Text>
    </View>
  )
}
