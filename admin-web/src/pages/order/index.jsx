// File Name: index.jsx
// Created Time: 2026-09-22 19:47:28
// Update Time: 2026-09-22 19:47:28


import { useMemo, useState } from 'react'
import {
  Card,
  Input,
  Select,
  Space,
  Table,
  Tooltip,
  App,
} from 'antd'
import { useQuery } from '@tanstack/react-query'

import StatusTag from '@/components/StatusTag/index.jsx'
import OrderDetailDrawer from './OrderDetailDrawer.jsx'
import { listOrders } from '@/services/order'
import { listEquipments } from '@/services/equipment'
import { ORDER_STATUS, DEPOSIT_STATUS } from '@/constants/domain'
import { formatMoney } from '@/utils/money'
import dayjs from 'dayjs'

export default function OrderPage() {
  const [status, setStatus] = useState('')
  const [keyword, setKeyword] = useState('')
  const [current, setCurrent] = useState(null)

  const orderQ = useQuery({
    queryKey: ['orders', status],
    queryFn: () => listOrders(status ? { status } : {}),
  })
  const eqQ = useQuery({
    queryKey: ['equipments', 'all'],
    queryFn: () => listEquipments(),
  })

  const orders = orderQ.data || []
  const equipments = eqQ.data || []

  const equipmentName = useMemo(() => {
    const m = {}
    equipments.forEach((e) => {
      m[e.id] = e.name
    })
    return m
  }, [equipments])

  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return orders.filter((o) => {
      if (!kw) return true
      const name = (equipmentName[o.equipment_id] || '').toLowerCase()
      return (
        String(o.no).toLowerCase().includes(kw) || name.includes(kw)
      )
    })
  }, [orders, keyword, equipmentName])

  const columns = [
    {
      title: '订单号',
      dataIndex: 'no',
      width: 170,
      render: (v) => (
        <span className="moneyfont" style={{ color: '#595959' }}>
          {v}
        </span>
      ),
    },
    {
      title: '设备',
      dataIndex: 'equipment_id',
      render: (v) => equipmentName[v] || `#${v}`,
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
      title: '下单时间',
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
      width: 80,
      render: (_, r) => <a onClick={() => setCurrent(r)}>详情</a>,
    },
  ]

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">订单管理</h2>
        <Space>
          <Input
            placeholder="订单号 / 设备名"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Select
            value={status}
            onChange={setStatus}
            style={{ width: 140 }}
            options={[
              { label: '全部状态', value: '' },
              ...Object.entries(ORDER_STATUS).map(([k, v]) => ({
                label: v.text,
                value: k,
              })),
            ]}
          />
        </Space>
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={orderQ.isLoading || eqQ.isLoading}
          columns={columns}
          dataSource={list}
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
          点击「详情」进入订单抽屉，可执行状态流转、押金退还、发货与轨迹查看。
        </div>
      </Card>

      <OrderDetailDrawer
        open={!!current}
        order={current}
        equipments={equipments}
        onClose={() => setCurrent(null)}
      />
    </div>
  )
}
