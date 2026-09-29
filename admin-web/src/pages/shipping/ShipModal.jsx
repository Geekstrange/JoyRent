// File Name: ShipModal.jsx
// Created Time: 2026-09-22 19:48:27
// Update Time: 2026-09-22 19:48:27


import { useEffect, useState } from 'react'
import { Modal, Form, Input, Select, Descriptions, App } from 'antd'

import { upsertShipment } from '@/services/shipment'
import { EXPRESS } from '@/constants/domain'

export default function ShipModal({ open, order, equipment, existing, onClose, onSuccess }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  // Modal 带 destroyOnClose + Form 带 preserve={false}，字段会随开关销毁重建、
  // 卸载即丢值，所以初值必须走 initialValues（每次挂载生效），setFieldsValue 仅作兜底。
  const formInitialValues = {
    express: existing?.express || '',
    no: existing?.no || '',
  }

  useEffect(() => {
    if (open) form.setFieldsValue(formInitialValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing, form])

  const handleOk = async () => {
    try {
      const v = await form.validateFields()
      setLoading(true)
      await upsertShipment(order.id, {
        express: v.express,
        no: v.no.trim().toUpperCase(),
        receiver: existing?.receiver || '王先生',
        phone: existing?.phone || '138****0001',
        address:
          existing?.address || '浙江省宁波市鄞州区中山东路 1088 号',
      })
      message.success(existing?.no ? '运单已更新' : '已发货')
      onSuccess?.()
      onClose?.()
    } catch (err) {
      if (err?.message) message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!order) return null

  return (
    <Modal
      title={`${existing?.no ? '修改运单' : '登记发货'} · ${order.no}`}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={loading}
      okText="确定"
      cancelText="取消"
      width={620}
      destroyOnClose
    >
      <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="设备">
          {equipment?.name || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="收货人">
          {existing?.receiver || '王先生'}
        </Descriptions.Item>
        <Descriptions.Item label="联系电话">
          {existing?.phone || '138****0001'}
        </Descriptions.Item>
        <Descriptions.Item label="收货地址">
          {existing?.address || '浙江省宁波市鄞州区中山东路 1088 号'}
        </Descriptions.Item>
      </Descriptions>

      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={formInitialValues}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
        </div>
      </Form>

      <div style={{ color: '#8c8c8c', fontSize: 12 }}>
        保存后运单状态置为「运输中」，用户端在订单页与物流查询中可看到轨迹。
      </div>
    </Modal>
  )
}
