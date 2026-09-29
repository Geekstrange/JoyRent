// File Name: domain.js
// Created Time: 2026-09-22 19:38:07
// Update Time: 2026-09-22 19:38:07


export const ORDER_STATUS = {
  pending:   { text: '待支付', color: 'orange' },
  paid:      { text: '已支付', color: 'blue' },
  renting:   { text: '租赁中', color: 'cyan' },
  returned:  { text: '已归还', color: 'green' },
  closed:    { text: '已完成', color: 'default' },
  cancelled: { text: '已取消', color: 'red' },
}

export const DEPOSIT_STATUS = {
  unpaid:   { text: '未支付', color: 'orange' },
  paid:     { text: '已收取', color: 'blue' },
  refunded: { text: '已退还', color: 'green' },
}

export const SHIP_STATUS = {
  none:       { text: '待发货', color: 'default' },
  shipped:    { text: '运输中', color: 'blue' },
  delivering: { text: '派送中', color: 'orange' },
  signed:     { text: '已签收', color: 'green' },
  returning:  { text: '寄回中', color: 'cyan' },
  received:   { text: '已收回', color: 'green' },
}

export const INVOICE_STATUS = {
  pending:  { text: '待审核', color: 'orange' },
  issued:   { text: '已开票', color: 'green' },
  rejected: { text: '已拒绝', color: 'red' },
}

export const INVOICE_TYPE = {
  personal: '个人',
  company:  '企业',
}

export const MERCHANT_STATUS = {
  pending:  { text: '待审核', color: 'orange' },
  active:   { text: '正常',   color: 'green' },
  rejected: { text: '已拒绝', color: 'red' },
  disabled: { text: '已停用', color: 'default' },
}

export const EXPRESS = {
  sf:   '顺丰速运',
  jd:   '京东物流',
  zto:  '中通快递',
  yto:  '圆通速递',
  yd:   '韵达快递',
  ems:  '中国邮政 EMS',
  self: '同城自提',
}

// ⚠️ 社区版（CE）**不含商家入驻 / 商家管理**（对应后端 API 也已移除）。
// 菜单项**保留可见**（让用户知道有这个能力），但 `upgrade: true` 会让点击时
// 弹出「需升级」提示而不是进入页面 —— 见 BasicLayout 的菜单 onClick。
// roles：允许看到该菜单的角色；upgrade：该功能 Community 版不含，
// 点击进入升级提示页（与小程序「商家入驻保留入口」同一策略）。
// 排序原则与 BE/EE 保持一致：概览 → 交易链路 → 商品目录 → 平台运营 → 客服 → 系统设置
export const MENU = [
  { key: '/dashboard',      label: '经营概览' },
  // ── 交易链路 ──
  { key: '/order',          label: '订单管理' },
  { key: '/shipping',       label: '物流管理' },
  { key: '/invoice',        label: '发票管理' },
  // ── 商品目录 ──
  { key: '/category',       label: '分类管理' },
  { key: '/equipment',      label: '设备管理' },
  { key: '/equipment-unit', label: '设备单元' },
  // ── 平台运营（Community 版为升级提示）──
  { key: '/merchant',       label: '商家管理',   upgrade: true },
  { key: '/user',           label: '用户管理' },
  // ── 客服 ──
  { key: '/chat',           label: '客服工作台', upgrade: true },
  // ── 系统设置（均为升级提示）──
  { key: '/branding',       label: '品牌设置',   upgrade: true },
  { key: '/accounts',       label: '账号管理',   upgrade: true },
  { key: '/printing',       label: '面单打印',   upgrade: true },
]

// UPGRADE_NOTICE 版本升级提示文案（社区版统一使用，避免各处措辞不一致）
export const UPGRADE_NOTICE = {
  title: '该功能需要升级',
  content: '商家管理为 Business / Enterprise 版功能，社区版（Community Edition）不包含。\n\n如需开通，请升级到 Business 或 Enterprise 版本。',
}

// 按菜单 key 的升级文案：Community 版保留 BE/EE 的导航入口，
// 点击 / 直接访问时展示对应功能的升级说明 —— 与小程序「商家入驻保留入口」同一策略。
export const UPGRADE_NOTICES = {
  '/merchant': {
    title: '该功能需要升级',
    content: '商家管理为 Business / Enterprise 版功能，社区版（Community Edition）不包含。\n\n如需开通，请升级到 Business 或 Enterprise 版本。',
  },
  '/branding': {
    title: '该功能需要升级',
    content: '品牌设置（白标：自定义平台名称与 Logo）为 Business / Enterprise 版功能，社区版（Community Edition）不包含。\n\n如需开通，请升级到 Business 或 Enterprise 版本。',
  },
  '/accounts': {
    title: '该功能需要升级',
    content: '账号管理（后台子账号：平台客服 / 商家管理员）为 Business / Enterprise 版功能，社区版（Community Edition）不包含。\n\n如需开通，请升级到 Business 或 Enterprise 版本。',
  },
  '/chat': {
    title: '该功能需要升级',
    content: '在线客服工作台（IM 实时接待）为 Business / Enterprise 版功能，社区版（Community Edition）不包含。\n\n如需开通，请升级到 Business 或 Enterprise 版本。',
  },
  '/printing': {
    title: '该功能需要升级',
    content: '快递面单打印（电子面单申请与热敏打印）为 Enterprise 版专属功能，社区版（Community Edition）与 Business 版不包含。\n\n如需开通，请升级到 Enterprise 版本。',
  },
}

export const PAGE_TITLE = MENU.reduce((acc, m) => {
  acc[m.key] = m.label
  return acc
}, {})
