// File Name: index.jsx
// Created Time: 2026-09-22 19:39:21
// Update Time: 2026-09-22 19:39:21


import { Tag } from 'antd'

const COLOR_MAP = {
  orange:  { color: '#fa8c16', bg: '#fff7e6' },
  blue:    { color: '#1677ff', bg: '#e6f4ff' },
  cyan:    { color: '#13c2c2', bg: '#e6fffb' },
  green:   { color: '#52c41a', bg: '#f6ffed' },
  red:     { color: '#cf1322', bg: '#fff1f0' },
  default: { color: '#8c8c8c', bg: '#f5f5f5' },
}

export default function StatusTag({ map, value }) {
  const item = map?.[value]
  if (!item) return <Tag>{value || '—'}</Tag>
  const { color, bg } = COLOR_MAP[item.color] || COLOR_MAP.default
  return (
    <Tag style={{ color, background: bg, border: 'none', padding: '1px 8px' }}>
      {item.text}
    </Tag>
  )
}
