// File Name: IssueModal.jsx
// Created Time: 2026-09-22 19:47:42
// Update Time: 2026-09-22 19:47:42


import { useEffect, useState } from 'react'
import { Modal, Form, Input, Descriptions, App } from 'antd'

import { issueInvoice, rejectInvoice } from '@/services/invoice'
import { formatMoney } from '@/utils/money'
import { INVOICE_TYPE } from '@/constants/domain'

export default function IssueModal({ open, invoice, mode, onClose, onSuccess }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) form.resetFields()
  }, [open, form])

  const handleOk = async () => {
    try {
      const v = await form.validateFields()
      setLoading(true)
      if (mode === 'issue') {
        await issueInvoice(invoice.id, v.invoice_no.trim())
        message.success('已开票')
      } else {
        await rejectInvoice(invoice.id, v.reason.trim())
        message.success('已拒绝')
      }
      onSuccess?.()
      onClose?.()
    } catch (err) {
      if (err?.message) message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!invoice) return null

  return (
    <Modal
      title={mode === 'issue' ? `开具发票 · ${invoice.no}` : `拒绝开票申请 · ${invoice.no}`}
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
        <Descriptions.Item label="发票抬头">
          {invoice.title}
        </Descriptions.Item>
        <Descriptions.Item label="发票类型">
          {INVOICE_TYPE[invoice.type]}
        </Descriptions.Item>
        {invoice.tax_no && (
          <Descriptions.Item label="纳税人识别号">
            {invoice.tax_no}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="开票金额">
          <span style={{ color: '#cf1322', fontWeight: 600 }}>
            {formatMoney(invoice.amount_cents)}
          </span>
        </Descriptions.Item>
        {invoice.email && (
          <Descriptions.Item label="接收邮箱">
            {invoice.email}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="关联订单">
          {invoice.order_no || invoice.order_id}
        </Descriptions.Item>
      </Descriptions>

      <Form form={form} layout="vertical" preserve={false}>
        {mode === 'issue' ? (
          <Form.Item
            name="invoice_no"
            label="发票号码"
            rules={[
              { required: true, message: '请输入发票号码' },
              {
                pattern: /^\d{8,20}$/,
                message: '发票号码应为 8-20 位数字',
              },
            ]}
          >
            <Input placeholder="请输入 8-20 位发票号码" />
          </Form.Item>
        ) : (
          <Form.Item
            name="reason"
            label="拒绝原因"
            rules={[{ required: true, message: '请填写拒绝原因' }]}
          >
            <Input placeholder="如：租期尚未结束，请在归还后重新申请" />
          </Form.Item>
        )}
      </Form>

      <div style={{ color: '#8c8c8c', fontSize: 12 }}>
        {mode === 'issue'
          ? '确认后状态置为「已开票」，用户可在前端查看票面信息并接收邮件。'
          : '拒绝原因会展示给用户，用户可据此修改后重新申请。'}
      </div>
    </Modal>
  )
}
