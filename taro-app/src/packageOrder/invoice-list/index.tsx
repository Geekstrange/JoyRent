import { useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import Empty from '@/components/Empty'
import StatusTag from '@/components/StatusTag'
import { listMyInvoices, type Invoice } from '@/services/api/invoice'
import { INVOICE_STATUS, INVOICE_TYPE } from '@/constants/domain'
import { formatMoney, formatMoneyShort } from '@/utils/money'
import { formatDateTime } from '@/utils/date'

import './index.scss'

const TABS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待审核' },
  { key: 'issued', label: '已开票' },
  { key: 'rejected', label: '已拒绝' },
]

export default function InvoiceListPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('')

  const invQ = useQuery({
    queryKey: ['my-invoices', tab],
    queryFn: () => listMyInvoices(tab ? { status: tab } : {}),
  })

  const list = invQ.data || []

  const stats = useMemo(() => {
    const issuedSum = list
      .filter((v) => v.status === 'issued')
      .reduce((s, v) => s + v.amount_cents, 0)
    const pending = list.filter((v) => v.status === 'pending').length
    return { issuedSum, pending, total: list.length }
  }, [list])

  useDidShow(() => {
    qc.invalidateQueries({ queryKey: ['my-invoices'] })
  })

  usePullDownRefresh(async () => {
    await qc.invalidateQueries({ queryKey: ['my-invoices'] })
    Taro.stopPullDownRefresh()
  })

  const goDetail = (v: Invoice) => {
    Taro.navigateTo({
      url: `/packageOrder/invoice-detail/index?id=${v.id}`,
    })
  }

  return (
    <View className="invoice-list-page">
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

      <View className="summary-card">
        <Text className="summary-title">开票概览</Text>
        <View className="summary-row">
          <Text className="summary-label">累计开票金额</Text>
          <Text className="summary-val">
            {formatMoney(stats.issuedSum)}
          </Text>
        </View>
        <View className="summary-row">
          <Text className="summary-label">申请笔数</Text>
          <Text className="summary-val">{stats.total} 笔</Text>
        </View>
        {stats.pending > 0 && (
          <Text className="summary-tip">
            {stats.pending} 笔待审核
          </Text>
        )}
      </View>

      {invQ.isLoading ? (
        <Empty text="加载中..." />
      ) : list.length ? (
        <View className="inv-list">
          {list.map((v) => (
            <View
              key={v.id}
              className="inv-card"
              onClick={() => goDetail(v)}
            >
              <View className="inv-head">
                <Text className="inv-no">{v.no}</Text>
                <StatusTag map={INVOICE_STATUS} value={v.status} />
              </View>
              <View className="inv-body">
                <View className="inv-thumb">
                  <Text>{v.title.slice(0, 1) || '·'}</Text>
                </View>
                <View className="inv-info">
                  <Text className="inv-title">{v.title}</Text>
                  <Text className="inv-sub">
                    {INVOICE_TYPE[v.type]}
                    {v.tax_no ? ` · ${v.tax_no}` : ''}
                  </Text>
                  <Text className="inv-time">
                    {formatDateTime(v.created_at)}
                  </Text>
                </View>
                <Text className="inv-amount">
                  {formatMoney(v.amount_cents)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Empty text="暂无发票申请" hint="在订单详情里点「申请发票」即可开票" />
      )}
    </View>
  )
}
