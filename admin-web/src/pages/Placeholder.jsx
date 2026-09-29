// File Name: Placeholder.jsx
// Created Time: 2026-09-22 19:40:18
// Update Time: 2026-09-22 19:40:18


import { Empty } from 'antd'

export default function Placeholder({ title }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 8,
        padding: 60,
        textAlign: 'center',
      }}
    >
      <Empty description={`${title} · 待实现`} />
    </div>
  )
}
