// File Name: ShipmentPanel.jsx
// Created Time: 2026-09-22 19:46:52
// Update Time: 2026-09-22 19:46:52


import { useState } from 'react'
import {
  Button,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  App,
} from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'

import StatusTag from '@/components/StatusTag/index.jsx'
import ShipTimeline from '@/components/ShipTimeline/index.jsx'
import {
  getShipmentByOrder,
  upsertShipment,
  setShipmentStatus,
} from '@/services/shipment'
import { SHIP_STATUS, EXPRESS } from '@/constants/domain'

// 各状态可推进的下一步（与后端 SHIP_FLOW 一致）
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

export default function ShipmentPanel({ order }) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [shipModalOpen, setShipModalOpen] = useState(false)
  const [shipForm] = Form.useForm()

  const shipQ = useQuery({
    queryKey: ['shipment', order.id],
    queryFn: () => getShipmentByOrder(order.id),
    enabled: !!order?.id,
  })

  const detail = shipQ.data
  const shipment = detail?.shipment
  const traces = detail?.traces || []

  const upsertMut = useMutation({
    mutationFn: (payload) => upsertShipment(order.id, payload),
    onSuccess: () => {
      message.success(shipment?.no ? '运单已更新' : '已发货')
      setShipModalOpen(false)
      qc.invalidateQueries({ queryKey: ['shipment', order.id] })
    },
    onError: (e) => message.error(e.message),
  })

  const statusMut = useMutation({
    mutationFn: ({ next }) =>
      setShipmentStatus(order.id, next, DEFAULT_TEXT[next] || ''),
    onSuccess: () => {
      message.success('状态已更新')
      qc.invalidateQueries({ queryKey: ['shipment', order.id] })
    },
    onError: (e) => message.error(e.message),
  })

  const openShipModal = () => {
    shipForm.setFieldsValue({
      express: shipment?.express || '',
      no: shipment?.no || '',
    })
    setShipModalOpen(true)
  }

  const submitShip = async () => {
    const v = await shipForm.validateFields()
    upsertMut.mutate({
      express: v.express,
      no: v.no.trim().toUpperCase(),
      receiver: shipment?.receiver || '王先生',
      phone: shipment?.phone || '138****0001',
      address:
        shipment?.address ||
        '浙江省宁波市鄞州区中山东路 1088 号',
    })
  }

  if (shipQ.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 30 }}>
        <Spin />
      </div>
    )
  }

  // 尚未发货
  if (!shipment || shipment.status === 'none') {
    return (
      <div>
        <div
          style={{
            padding: 16,
            background: '#fafafa',
            borderRadius: 6,
            color: '#8c8c8c',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>尚未发货</span>
          <Button type="primary" size="small" onClick={openShipModal}>
            立即发货
          </Button>
        </div>

        <Modal
          title="登记发货"
          open={shipModalOpen}
          onOk={submitShip}
          onCancel={() => setShipModalOpen(false)}
          confirmLoading={upsertMut.isPending}
          okText="确定"
          cancelText="取消"
          destroyOnClose
        >
          <Form
            form={shipForm}
            layout="vertical"
            preserve={false}
            style={{ marginTop: 8 }}
          >
            <Form.Item
              name="express"
              label="快递公司"
              rules={[{ required: true, message: '请选择快递公司' }]}
            >
              <Select
                placeholder="请选择"
                options={Object.entries(EXPRESS).map(([k, v]) => ({
                  label: v,
                  value: k,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="no"
              label="运单号"
              rules={[
                { required: true, message: '请输入运单号' },
                {
                  pattern: /^[A-Za-z0-9-]{6,32}$/,
                  message: '运单号应为 6-32 位字母/数字',
                },
              ]}
            >
              <Input placeholder="如 SF7712048953672" />
            </Form.Item>
            <div style={{ color: '#8c8c8c', fontSize: 12 }}>
              保存后运单状态置为「运输中」，用户端可查看轨迹。
            </div>
          </Form>
        </Modal>
      </div>
    )
  }

  const next = SHIP_FLOW[shipment.status] || []
  const lastTrace = traces[traces.length - 1]

  return (
    <div>
      <Descriptions column={2} size="small" bordered>
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
          {shipment.receiver} {shipment.phone}
        </Descriptions.Item>
        <Descriptions.Item label="收货地址">{shipment.address}</Descriptions.Item>
      </Descriptions>

      {lastTrace && (
        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            color: '#595959',
          }}
        >
          最新：
          {lastTrace.text}
          <span style={{ color: '#8c8c8c', marginLeft: 8, fontSize: 12 }}>
            {dayjs(lastTrace.trace_at).format('YYYY-MM-DD HH:mm')}
          </span>
        </div>
      )}

      <Space wrap style={{ marginTop: 12 }}>
        {next.map((n) => (
          <Button
            key={n}
            size="small"
            onClick={() => statusMut.mutate({ next: n })}
            loading={statusMut.isPending}
          >
            置为{SHIP_STATUS[n].text}
          </Button>
        ))}
        <Button size="small" onClick={openShipModal}>
          修改运单
        </Button>
      </Space>

      <div style={{ marginTop: 20, marginBottom: 8, fontWeight: 600 }}>
        物流轨迹（{traces.length} 条）
      </div>
      {traces.length ? (
        <ShipTimeline traces={traces} />
      ) : (
        <Empty description="暂无轨迹" style={{ padding: 20 }} />
      )}

      <Modal
        title="修改运单"
        open={shipModalOpen}
        onOk={submitShip}
        onCancel={() => setShipModalOpen(false)}
        confirmLoading={upsertMut.isPending}
        okText="确定"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={shipForm} layout="vertical" preserve={false}>
          <Form.Item
            name="express"
            label="快递公司"
            rules={[{ required: true, message: '请选择快递公司' }]}
          >
            <Select
              placeholder="请选择"
              options={Object.entries(EXPRESS).map(([k, v]) => ({
                label: v,
                value: k,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="no"
            label="运单号"
            rules={[
              { required: true, message: '请输入运单号' },
              {
                pattern: /^[A-Za-z0-9-]{6,32}$/,
                message: '运单号应为 6-32 位字母/数字',
              },
            ]}
          >
            <Input placeholder="如 SF7712048953672" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
