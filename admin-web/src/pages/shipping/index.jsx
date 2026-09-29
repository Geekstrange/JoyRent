// File Name: index.jsx
// Created Time: 2026-09-22 19:48:53
// Update Time: 2026-09-22 19:48:53


import { useMemo, useState } from 'react'
import { Card, Col, Input, Row, Select, Space, Table } from 'antd'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'

import StatusTag from '@/components/StatusTag/index.jsx'
import ShipDetailDrawer from './ShipDetailDrawer.jsx'
import ShipModal from './ShipModal.jsx'
import { listOrders } from '@/services/order'
import { listEquipments } from '@/services/equipment'
import { getShipmentByOrder } from '@/services/shipment'
import { SHIP_STATUS, EXPRESS } from '@/constants/domain'

export default function ShippingPage() {
  const [status, setStatus] = useState('')
  const [keyword, setKeyword] = useState('')
  const [current, setCurrent] = useState(null)
  const [shipModal, setShipModal] = useState(null)

  // 用订单列表作为运单列表的主源，每笔订单的 ship 状态从详情接口按需拉
  // 这里为简化，取订单列表后在前端只按订单状态展示，进入抽屉加载运单详情
  const orderQ = useQuery({
    queryKey: ['orders', 'all'],
    queryFn: () => listOrders(),
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

  // 运单状态需要在抽屉里加载；列表页展示简化版，不含运单号
  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return orders.filter((o) => {
      if (!kw) return true
      return (
        String(o.no).toLowerCase().includes(kw) ||
        (equipmentName[o.equipment_id] || '').toLowerCase().includes(kw)
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
      title: '订单状态',
      dataIndex: 'status',
      width: 110,
      render: (v) => (
        <StatusTag
          map={{
            pending:   { text: '待支付', color: 'orange' },
            paid:      { text: '已支付', color: 'blue' },
            renting:   { text: '租赁中', color: 'cyan' },
            returned:  { text: '已归还', color: 'green' },
            closed:    { text: '已完成', color: 'default' },
            cancelled: { text: '已取消', color: 'red' },
          }}
          value={v}
        />
      ),
    },
    {
      title: '起租',
      dataIndex: 'start_at',
      width: 120,
      render: (v) => (
        <span style={{ fontSize: 13, color: '#595959' }}>
          {String(v).slice(0, 10)}
        </span>
      ),
    },
    {
      title: '到期',
      dataIndex: 'end_at',
      width: 120,
      render: (v) => (
        <span style={{ fontSize: 13, color: '#595959' }}>
          {String(v).slice(0, 10)}
        </span>
      ),
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
      width: 180,
      render: (_, r) => (
        <Space size={12}>
          <a onClick={() => setCurrent(r)}>物流详情</a>
          <a onClick={() => setShipModal(r)}>发货 / 修改</a>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">物流管理</h2>
        <Space>
          <Input
            placeholder="订单号 / 设备名"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
            style={{ width: 230 }}
          />
          <Select
            value={status}
            onChange={setStatus}
            style={{ width: 140 }}
            options={[
              { label: '全部物流状态', value: '' },
              ...Object.entries(SHIP_STATUS).map(([k, v]) => ({
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
          loading={orderQ.isLoading}
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
          物流状态按「待发货 → 运输中 → 派送中 → 已签收 → 寄回中 → 已收回」推进。
          发货需登记快递公司与运单号，用户端可实时查看轨迹。
        </div>
      </Card>

      <ShipDetailDrawer
        open={!!current}
        order={current}
        equipment={current ? equipments.find((e) => e.id === current.equipment_id) : null}
        onClose={() => setCurrent(null)}
      />

      <ShipModal
        open={!!shipModal}
        order={shipModal}
        equipment={
          shipModal ? equipments.find((e) => e.id === shipModal.equipment_id) : null
        }
        existing={null}
        onClose={() => setShipModal(null)}
        onSuccess={() => orderQ.refetch()}
      />
    </div>
  )
}
