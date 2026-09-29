// File Name: ShipDetailDrawer.jsx
// Created Time: 2026-09-22 19:48:39
// Update Time: 2026-09-22 19:48:39


import {
  Drawer,
  Descriptions,
  Button,
  Space,
  Divider,
  Empty,
  App,
} from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import StatusTag from '@/components/StatusTag/index.jsx'
import ShipTimeline from '@/components/ShipTimeline/index.jsx'
import ShipModal from './ShipModal.jsx'
import { getShipmentByOrder, setShipmentStatus } from '@/services/shipment'
import { SHIP_STATUS, EXPRESS } from '@/constants/domain'

const SHIP_FLOW = {
  none:       ['shipped', 'delivering'],
  shipped:    ['delivering', 'signed'],
  delivering: ['signed'],
  signed:     ['returning'],
  returning:  ['received'],
}

const DEFAULT_TEXT = {
  shipped:    '【平台】快件已揽收，装车发出',
  delivering: '【平台】快件正在派送中',
  signed:     '【平台】快件已签收，签收人：本人',
  returning:  '【平台】用户已预约归还，上门取件',
  received:   '【平台】平台已验机签收，设备完好',
}

export default function ShipDetailDrawer({ open, order, equipment, onClose }) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)

  const shipQ = useQuery({
    queryKey: ['shipment', order?.id],
    queryFn: () => getShipmentByOrder(order.id),
    enabled: open && !!order?.id,
  })

  const statusMut = useMutation({
    mutationFn: ({ next }) =>
      setShipmentStatus(order.id, next, DEFAULT_TEXT[next] || ''),
    onSuccess: () => {
      message.success('状态已更新')
      qc.invalidateQueries({ queryKey: ['shipment', order.id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (e) => message.error(e.message),
  })

  if (!order) {
    return (
      <Drawer open={open} onClose={onClose} width={620}>
        <div />
      </Drawer>
    )
  }

  const detail = shipQ.data
  const shipment = detail?.shipment
  const traces = detail?.traces || []

  return (
    <Drawer
      title={shipment ? `运单 ${shipment.no}` : `订单 ${order.no}`}
      open={open}
      onClose={onClose}
      width={620}
      destroyOnClose
    >
      {shipment ? (
        <>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="关联订单">
              {order.no}
            </Descriptions.Item>
            <Descriptions.Item label="设备">
              {equipment?.name || `#${order.equipment_id}`}
            </Descriptions.Item>
            <Descriptions.Item label="快递公司">
              {EXPRESS[shipment.express] || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="物流状态">
              <StatusTag map={SHIP_STATUS} value={shipment.status} />
            </Descriptions.Item>
            <Descriptions.Item label="运单号" span={2}>
              <span className="moneyfont">{shipment.no}</span>
            </Descriptions.Item>
            <Descriptions.Item label="收货人">
              {shipment.receiver}
            </Descriptions.Item>
            <Descriptions.Item label="联系电话">
              {shipment.phone}
            </Descriptions.Item>
            <Descriptions.Item label="收货地址" span={2}>
              {shipment.address}
            </Descriptions.Item>
          </Descriptions>

          <Space style={{ marginTop: 16 }} wrap>
            {(SHIP_FLOW[shipment.status] || []).map((n) => (
              <Button
                key={n}
                size="small"
                loading={statusMut.isPending}
                onClick={() => statusMut.mutate({ next: n })}
              >
                置为{SHIP_STATUS[n].text}
              </Button>
            ))}
            <Button size="small" onClick={() => setModalOpen(true)}>
              修改运单
            </Button>
          </Space>

          <Divider />

          <div style={{ fontWeight: 600, marginBottom: 12 }}>
            轨迹（{traces.length} 条）
          </div>
          {traces.length ? (
            <ShipTimeline traces={traces} />
          ) : (
            <Empty description="暂无轨迹" />
          )}
        </>
      ) : (
        <Empty description="该订单尚未发货" style={{ padding: 60 }}>
          <Button type="primary" onClick={() => setModalOpen(true)}>
            立即发货
          </Button>
        </Empty>
      )}

      <ShipModal
        open={modalOpen}
        order={order}
        equipment={equipment}
        existing={shipment}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['shipment', order.id] })
          qc.invalidateQueries({ queryKey: ['orders'] })
        }}
      />
    </Drawer>
  )
}
