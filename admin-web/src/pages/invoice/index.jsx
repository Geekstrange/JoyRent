// File Name: index.jsx
// Created Time: 2026-09-22 19:48:10
// Update Time: 2026-09-22 19:48:10


import { useMemo, useState } from 'react'
import { Card, Col, Row, Select, Table, Space, Button, App } from 'antd'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'

import StatusTag from '@/components/StatusTag/index.jsx'
import InvoiceDetailDrawer from './InvoiceDetailDrawer.jsx'
import IssueModal from './IssueModal.jsx'
import { listInvoices, invoiceStats } from '@/services/invoice'
import { listEquipments } from '@/services/equipment'
import { INVOICE_STATUS, INVOICE_TYPE } from '@/constants/domain'
import { formatMoney, formatMoneyShort } from '@/utils/money'

export default function InvoicePage() {
  const [status, setStatus] = useState('')
  const [current, setCurrent] = useState(null)
  const [quickAction, setQuickAction] = useState(null) // { mode, invoice }

  const invQ = useQuery({
    queryKey: ['invoices', status],
    queryFn: () => listInvoices(status ? { status } : {}),
  })
  const statsQ = useQuery({
    queryKey: ['invoice-stats'],
    queryFn: invoiceStats,
  })
  const eqQ = useQuery({
    queryKey: ['equipments', 'all'],
    queryFn: () => listEquipments(),
  })

  const invoices = invQ.data || []
  const equipments = eqQ.data || []
  const stats = statsQ.data || { issued_cents: 0 }

  const pendingCount = useMemo(
    () => invoices.filter((v) => v.status === 'pending').length,
    [invoices]
  )

  const columns = [
    {
      title: '申请单号',
      dataIndex: 'no',
      width: 170,
      render: (v) => (
        <span className="moneyfont" style={{ color: '#595959' }}>
          {v}
        </span>
      ),
    },
    {
      title: '抬头 / 类型',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.title}</div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
            {INVOICE_TYPE[r.type]}
            {r.tax_no ? ` · ${r.tax_no}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: '关联订单',
      dataIndex: 'order_no',
      width: 150,
      render: (v, r) => (
        <span className="moneyfont" style={{ fontSize: 13, color: '#595959' }}>
          {v || `#${r.order_id}`}
        </span>
      ),
    },
    {
      title: '用户',
      dataIndex: 'user_id',
      width: 90,
      render: (v) => <span className="moneyfont">{v}</span>,
    },
    {
      title: '金额',
      dataIndex: 'amount_cents',
      width: 120,
      align: 'right',
      render: (v) => <span className="moneyfont">{formatMoney(v)}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v) => <StatusTag map={INVOICE_STATUS} value={v} />,
    },
    {
      title: '申请时间',
      dataIndex: 'created_at',
      width: 150,
      render: (v) => (
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>
          {dayjs(v).format('YYYY-MM-DD HH:mm')}
        </span>
      ),
    },
    {
      title: '操作',
      width: 180,
      render: (_, r) => (
        <Space size={12}>
          <a onClick={() => setCurrent(r)}>详情</a>
          {r.status === 'pending' && (
            <>
              <a onClick={() => setQuickAction({ mode: 'issue', invoice: r })}>
                开票
              </a>
              <a
                style={{ color: '#cf1322' }}
                onClick={() => setQuickAction({ mode: 'reject', invoice: r })}
              >
                拒绝
              </a>
            </>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">发票管理</h2>
        <Space>
          {pendingCount > 0 ? (
            <span style={{ color: '#fa8c16' }}>
              待审核 <b>{pendingCount}</b> 笔
            </span>
          ) : (
            <span style={{ color: '#8c8c8c' }}>暂无待审核</span>
          )}
          <Select
            value={status}
            onChange={setStatus}
            style={{ width: 140 }}
            options={[
              { label: '全部状态', value: '' },
              ...Object.entries(INVOICE_STATUS).map(([k, v]) => ({
                label: v.text,
                value: k,
              })),
            ]}
          />
        </Space>
      </div>

      <Row gutter={14} style={{ marginBottom: 14 }}>
        <Col span={6}>
          <div className="stat-card">
            <div className="stat-label">申请总数</div>
            <div className="stat-value">{invoices.length} 笔</div>
            <div className="stat-sub">—</div>
          </div>
        </Col>
        <Col span={6}>
          <div className="stat-card">
            <div className="stat-label">待审核</div>
            <div className="stat-value">{pendingCount} 笔</div>
            <div className="stat-sub">{pendingCount ? '需人工处理' : '已清空'}</div>
          </div>
        </Col>
        <Col span={6}>
          <div className="stat-card">
            <div className="stat-label">已开票金额</div>
            <div className="stat-value">
              {formatMoneyShort(stats.issued_cents)}
            </div>
            <div className="stat-sub">不含押金</div>
          </div>
        </Col>
        <Col span={6}>
          <div className="stat-card">
            <div className="stat-label">已拒绝</div>
            <div className="stat-value">
              {invoices.filter((v) => v.status === 'rejected').length} 笔
            </div>
            <div className="stat-sub">—</div>
          </div>
        </Col>
      </Row>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={invQ.isLoading}
          columns={columns}
          dataSource={invoices}
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (n) => `共 ${n} 笔`,
          }}
        />
        <div
          style={{
            padding: '12px 18px',
            color: '#8c8c8c',
            fontSize: 12,
            borderTop: '1px solid #f0f0f0',
          }}
        >
          开票金额仅计租金，押金为暂收款不开票。开票后系统记录发票号码，企业发票需校验纳税人识别号。
        </div>
      </Card>

      <InvoiceDetailDrawer
        open={!!current}
        invoice={current}
        equipments={equipments}
        onClose={() => setCurrent(null)}
        onChanged={() => {
          invQ.refetch()
          statsQ.refetch()
        }}
      />

      <IssueModal
        open={!!quickAction}
        mode={quickAction?.mode}
        invoice={quickAction?.invoice}
        onClose={() => setQuickAction(null)}
        onSuccess={() => {
          invQ.refetch()
          statsQ.refetch()
        }}
      />
    </div>
  )
}
