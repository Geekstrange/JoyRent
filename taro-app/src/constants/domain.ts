// File Name: domain.ts
// Created Time: 2026-09-22 20:02:03
// Update Time: 2026-09-22 20:02:03


export const ORDER_STATUS: Record<string, { text: string; color: string }> = {
  pending: { text: '待支付', color: 'orange' },
  paid: { text: '已支付', color: 'blue' },
  renting: { text: '租赁中', color: 'cyan' },
  returned: { text: '已归还', color: 'green' },
  closed: { text: '已完成', color: 'default' },
  cancelled: { text: '已取消', color: 'red' },
}

export const DEPOSIT_STATUS: Record<string, { text: string; color: string }> = {
  unpaid: { text: '未支付', color: 'orange' },
  paid: { text: '已收取', color: 'blue' },
  refunded: { text: '已退还', color: 'green' },
}

export const SHIP_STATUS: Record<string, { text: string; color: string }> = {
  none: { text: '待发货', color: 'default' },
  shipped: { text: '运输中', color: 'blue' },
  delivering: { text: '派送中', color: 'orange' },
  signed: { text: '已签收', color: 'green' },
  returning: { text: '寄回中', color: 'cyan' },
  received: { text: '已收回', color: 'green' },
}

export const INVOICE_STATUS: Record<string, { text: string; color: string }> = {
  pending: { text: '待审核', color: 'orange' },
  issued: { text: '已开票', color: 'green' },
  rejected: { text: '已拒绝', color: 'red' },
}

export const INVOICE_TYPE: Record<string, string> = {
  personal: '个人',
  company: '企业',
}

export const EXPRESS: Record<string, string> = {
  sf: '顺丰速运',
  jd: '京东物流',
  zto: '中通快递',
  yto: '圆通速递',
  yd: '韵达快递',
  ems: '中国邮政 EMS',
  self: '同城自提',
}

// 可开票的订单状态（与后端 InvoiceAllowedOrderStatus 一致）
export const INVOICE_ALLOWED_STATUS = ['paid', 'renting', 'returned', 'closed']
