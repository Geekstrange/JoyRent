// File Name: index.jsx
// Created Time: 2026-09-22 19:40:44
// Update Time: 2026-09-22 19:40:44


import { useMemo } from 'react'
import { Row, Col, Card, Table, Spin, Empty } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'

import TrendChart from './TrendChart.jsx'
import StatusTag from '@/components/StatusTag/index.jsx'
import {
  ORDER_STATUS,
  DEPOSIT_STATUS,
  SHIP_STATUS,
} from '@/constants/domain'
import { formatMoney, formatMoneyShort } from '@/utils/money'
import {
  listEquipments,
  listOrders,
  listInvoices,
} from '@/services/dashboard'

const ACTIVE_STATUS = ['pending', 'paid', 'renting']
const DONE_STATUS = ['paid', 'renting', 'returned', 'closed']

export default function DashboardPage() {
  const navigate = useNavigate()

  const equipQ = useQuery({
    queryKey: ['dashboard', 'equipments'],
    queryFn: () => listEquipments(),
  })
  const orderQ = useQuery({
    queryKey: ['dashboard', 'orders'],
    queryFn: () => listOrders(),
  })
  const invoiceQ = useQuery({
    queryKey: ['dashboard', 'invoices', 'pending'],
    queryFn: () => listInvoices({ status: 'pending' }),
  })

  const loading = equipQ.isLoading || orderQ.isLoading || invoiceQ.isLoading
  const equipments = equipQ.data || []
  const orders = orderQ.data || []
  const pendInvoices = invoiceQ.data || []

  const stats = useMemo(() => {
    const done = orders.filter((o) => DONE_STATUS.includes(o.status))
    const gmv = done.reduce((s, o) => s + (o.rent_cents || 0), 0)
    const avg = done.length ? Math.round(gmv / done.length) : 0
    const active = orders.filter((o) => ACTIVE_STATUS.includes(o.status))
    return {
      equipmentCount: equipments.length,
      orderCount: orders.length,
      activeOrderCount: active.length,
      gmv,
      avg,
    }
  }, [orders, equipments])

  const trend = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i -= 1) {
      days.push(dayjs().subtract(i, 'day').format('YYYY-MM-DD'))
    }
    return days.map((d) => {
      const amount = orders
        .filter((o) => DONE_STATUS.includes(o.status))
        .filter((o) => (o.created_at || '').slice(0, 10) === d)
        .reduce((s, o) => s + (o.rent_cents || 0), 0)
      return { date: d, amount }
    })
  }, [orders])

  const recent = useMemo(
    () => [...orders].sort((a, b) => b.id - a.id).slice(0, 6),
    [orders]
  )

  const equipmentName = useMemo(() => {
    const m = {}
    equipments.forEach((e) => {
      m[e.id] = e.name
    })
    return m
  }, [equipments])

  const columns = [
    {
      title: '订单号',
      dataIndex: 'no',
      width: 160,
      render: (v) => (
        <span className="moneyfont" style={{ color: '#595959' }}>
          {v}
        </span>
      ),
    },
    {
      title: '设备',
      dataIndex: 'equipment_id',
      render: (id) => equipmentName[id] || `#${id}`,
    },
    {
      title: '租期',
      width: 200,
      render: (_, r) => (
        <span style={{ color: '#595959', fontSize: 13 }}>
          {String(r.start_at).slice(0, 10)} ~ {String(r.end_at).slice(0, 10)}
        </span>
      ),
    },
    { title: '天数', dataIndex: 'days', width: 70 },
    {
      title: '租金',
      dataIndex: 'rent_cents',
      width: 120,
      align: 'right',
      render: (v) => <span className="moneyfont">{formatMoney(v)}</span>,
    },
    {
      title: '押金',
      dataIndex: 'dep_status',
      width: 100,
      render: (v) => <StatusTag map={DEPOSIT_STATUS} value={v} />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v) => <StatusTag map={ORDER_STATUS} value={v} />,
    },
    {
      title: '物流',
      width: 110,
      render: () => <StatusTag map={SHIP_STATUS} value="none" />,
    },
  ]

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin />
      </div>
    )
  }

  return (
    <div>
      <Row gutter={14} style={{ marginBottom: 14 }}>
        <Col span={6}>
          <div className="stat-card">
            <div className="stat-label">在架设备</div>
            <div className="stat-value">{stats.equipmentCount} 个</div>
            <div className="stat-sub">平台自营</div>
          </div>
        </Col>
        <Col span={6}>
          <div className="stat-card">
            <div className="stat-label">订单总数</div>
            <div className="stat-value">{stats.orderCount} 笔</div>
            <div className="stat-sub">进行中 {stats.activeOrderCount} 笔</div>
          </div>
        </Col>
        <Col span={6}>
          <div className="stat-card">
            <div className="stat-label">累计租金 GMV</div>
            <div className="stat-value">{formatMoneyShort(stats.gmv)}</div>
            <div className="stat-sub">不含押金</div>
          </div>
        </Col>
        <Col span={6}>
          <div className="stat-card">
            <div className="stat-label">客单价</div>
            <div className="stat-value">{formatMoneyShort(stats.avg)}</div>
            <div className="stat-sub">租金口径</div>
          </div>
        </Col>
      </Row>

      {pendInvoices.length > 0 && (
        <Card
          style={{
            marginBottom: 14,
            borderLeft: '3px solid #fa8c16',
            borderRadius: 8,
          }}
          styles={{ body: { padding: '14px 18px' } }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>
              <b>{pendInvoices.length}</b> 笔发票申请待审核
            </span>
            <a onClick={() => navigate('/invoice')}>去处理 ›</a>
          </div>
        </Card>
      )}

      <Card
        title="近 7 日租金趋势"
        style={{ marginBottom: 14 }}
        styles={{ body: { padding: '12px 18px' } }}
      >
        <TrendChart data={trend} />
      </Card>

      <Card title="最新订单" styles={{ body: { padding: 0 } }}>
        {recent.length > 0 ? (
          <Table
            rowKey="id"
            size="middle"
            pagination={false}
            columns={columns}
            dataSource={recent}
          />
        ) : (
          <Empty style={{ padding: 60 }} description="暂无订单" />
        )}
        <div
          style={{
            padding: '12px 18px',
            color: '#8c8c8c',
            fontSize: 12,
            borderTop: '1px solid #f0f0f0',
          }}
        >
          金额均以「元」展示；后端以「分」存储和传输，避免浮点误差。
        </div>
      </Card>
    </div>
  )
}
