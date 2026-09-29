// File Name: OrderDetailDrawer.jsx
// Created Time: 2026-09-22 19:47:13
// Update Time: 2026-09-22 19:47:13


import {
  Drawer,
  Descriptions,
  Button,
  Space,
  Divider,
  App,
} from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'

import StatusTag from '@/components/StatusTag/index.jsx'
import ShipmentPanel from './ShipmentPanel.jsx'
import { transitionOrder, refundDeposit } from '@/services/order'
import { ORDER_STATUS, DEPOSIT_STATUS } from '@/constants/domain'
import { formatMoney } from '@/utils/money'

// 与后端 OrderFlow 一致
const ORDER_FLOW = {
  pending:   ['paid', 'cancelled'],
  paid:      ['renting', 'cancelled'],
  renting:   ['returned'],
  returned:  ['closed'],
}

export default function OrderDetailDrawer({ open, order, equipments, onClose }) {
  const { message } = App.useApp()
  const qc = useQueryClient()

  const transitionMut = useMutation({
    mutationFn: ({ id, next }) => transitionOrder(id, next),
    onSuccess: (_, vars) => {
      message.success(`已置为 ${ORDER_STATUS[vars.next].text}`)
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (e) => message.error(e.message),
  })

  const refundMut = useMutation({
    mutationFn: refundDeposit,
    onSuccess: () => {
      message.success('押金已退还')
      qc.invalidateQueries({ queryKey: ['orders'] })
      onClose()
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

  const equipment = equipments.find((e) => e.id === order.equipment_id)
  const next = ORDER_FLOW[order.status] || []
  const canRefund = order.dep_status === 'paid'

  return (
    <Drawer
      title={`订单 ${order.no}`}
      open={open}
      onClose={onClose}
      width={620}
      destroyOnClose
    >
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="设备" span={2}>
          {equipment?.name || `#${order.equipment_id}`}
        </Descriptions.Item>
        <Descriptions.Item label="订单状态">
          <StatusTag map={ORDER_STATUS} value={order.status} />
        </Descriptions.Item>
        <Descriptions.Item label="押金状态">
          <StatusTag map={DEPOSIT_STATUS} value={order.dep_status} />
        </Descriptions.Item>
        <Descriptions.Item label="起租">
          {String(order.start_at).slice(0, 10)}
        </Descriptions.Item>
        <Descriptions.Item label="到期">
          {String(order.end_at).slice(0, 10)}
        </Descriptions.Item>
        <Descriptions.Item label="租期">{order.days} 天</Descriptions.Item>
        <Descriptions.Item label="租金">
          {formatMoney(order.rent_cents)}
        </Descriptions.Item>
        <Descriptions.Item label="押金">
          {formatMoney(order.deposit_cents)}
        </Descriptions.Item>
        <Descriptions.Item label="设备单元">{order.unit_id}</Descriptions.Item>
        <Descriptions.Item label="用户 ID">{order.user_id}</Descriptions.Item>
        <Descriptions.Item label="下单时间" span={2}>
          {dayjs(order.created_at).format('YYYY-MM-DD HH:mm')}
        </Descriptions.Item>
      </Descriptions>

      <Space style={{ marginTop: 16 }} wrap>
        <Button
          type="primary"
          disabled={!canRefund}
          loading={refundMut.isPending}
          onClick={() => refundMut.mutate(order.id)}
        >
          退还押金
        </Button>
        {next.map((n) => (
          <Button
            key={n}
            danger={n === 'cancelled'}
            loading={transitionMut.isPending}
            onClick={() => transitionMut.mutate({ id: order.id, next: n })}
          >
            {ORDER_STATUS[n].text}
          </Button>
        ))}
      </Space>
      <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>
        押金退还仅在「已收取」状态下可操作，避免重复退款。
      </div>

      <Divider />

      <div style={{ fontWeight: 600, marginBottom: 12 }}>物流</div>
      <ShipmentPanel order={order} />
    </Drawer>
  )
}
