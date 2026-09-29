// File Name: InvoiceDetailDrawer.jsx
// Created Time: 2026-09-22 19:47:56
// Update Time: 2026-09-22 19:47:56


import {
  Drawer,
  Descriptions,
  Button,
  Space,
  Divider,
  App,
} from 'antd'
import { useState } from 'react'
import dayjs from 'dayjs'

import StatusTag from '@/components/StatusTag/index.jsx'
import IssueModal from './IssueModal.jsx'
import {
  INVOICE_STATUS,
  INVOICE_TYPE,
} from '@/constants/domain'
import { formatMoney } from '@/utils/money'

export default function InvoiceDetailDrawer({ open, invoice, equipments, onClose, onChanged }) {
  const [modalMode, setModalMode] = useState(null)

  if (!invoice) {
    return (
      <Drawer open={open} onClose={onClose} width={620}>
        <div />
      </Drawer>
    )
  }

  const equipment = equipments.find((e) => e.id === invoice.eq || e.id === invoice.equipment_id)

  return (
    <Drawer
      title={`发票 ${invoice.no}`}
      open={open}
      onClose={onClose}
      width={620}
      destroyOnClose
    >
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="发票抬头" span={2}>
          {invoice.title}
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          <StatusTag map={INVOICE_STATUS} value={invoice.status} />
        </Descriptions.Item>
        <Descriptions.Item label="发票类型">
          {INVOICE_TYPE[invoice.type]}
        </Descriptions.Item>
        <Descriptions.Item label="纳税人识别号" span={2}>
          {invoice.tax_no || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="开票金额">
          <span style={{ color: '#cf1322', fontWeight: 600 }}>
            {formatMoney(invoice.amount_cents)}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="发票号码">
          {invoice.invoice_no || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="接收邮箱" span={2}>
          {invoice.email || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="关联订单">
          {invoice.order_no || invoice.order_id}
        </Descriptions.Item>
        <Descriptions.Item label="租赁设备">
          {equipment?.name || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="申请用户">
          {invoice.user_id}
        </Descriptions.Item>
        <Descriptions.Item label="申请时间">
          {dayjs(invoice.created_at).format('YYYY-MM-DD HH:mm')}
        </Descriptions.Item>
      </Descriptions>

      {invoice.reason && (
        <>
          <Divider />
          <div style={{ fontSize: 13, color: '#cf1322', lineHeight: 1.6 }}>
            拒绝原因：{invoice.reason}
          </div>
        </>
      )}

      <Divider />

      {invoice.status === 'pending' ? (
        <Space>
          <Button type="primary" onClick={() => setModalMode('issue')}>
            开具发票
          </Button>
          <Button danger onClick={() => setModalMode('reject')}>
            拒绝申请
          </Button>
        </Space>
      ) : (
        <div style={{ color: '#8c8c8c', fontSize: 13 }}>
          该申请已处理完毕
        </div>
      )}

      <IssueModal
        open={!!modalMode}
        mode={modalMode}
        invoice={invoice}
        onClose={() => setModalMode(null)}
        onSuccess={() => {
          onChanged?.()
          onClose?.()
        }}
      />
    </Drawer>
  )
}
