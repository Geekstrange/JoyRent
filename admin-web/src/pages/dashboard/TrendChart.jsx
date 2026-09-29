// File Name: TrendChart.jsx
// Created Time: 2026-09-22 19:40:30
// Update Time: 2026-09-22 19:40:30


import { formatMoneyShort } from '@/utils/money'

const W = 880
const H = 220
const PL = 64
const PB = 28
const PT = 14

export default function TrendChart({ data = [] }) {
  const max = Math.max(1, ...data.map((d) => d.amount))
  const iw = W - PL - 24
  const ih = H - PB - PT

  const sx = (i) =>
    PL + (data.length <= 1 ? iw / 2 : (iw * i) / (data.length - 1))
  const sy = (v) => PT + ih - (ih * v) / max

  const path = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(d.amount).toFixed(1)}`)
    .join(' ')

  const area =
    data.length > 0
      ? `${path} L${sx(data.length - 1).toFixed(1)},${PT + ih} L${sx(0).toFixed(1)},${PT + ih} Z`
      : ''

  const grid = [0, 0.25, 0.5, 0.75, 1].map((r) => {
    const y = PT + ih * r
    return (
      <g key={r}>
        <line x1={PL} x2={W - 24} y1={y} y2={y} stroke="#f0f0f0" />
        <text
          x={PL - 8}
          y={y + 4}
          textAnchor="end"
          fontSize="11"
          fill="#8c8c8c"
        >
          {formatMoneyShort(Math.round(max * (1 - r)))}
        </text>
      </g>
    )
  })

  const points = data.map((d, i) => {
    const x = sx(i)
    const y = sy(d.amount)
    return (
      <g key={d.date}>
        <circle
          cx={x.toFixed(1)}
          cy={y.toFixed(1)}
          r="3.5"
          fill="#fff"
          stroke="#1677ff"
          strokeWidth="2"
        />
        <text
          x={x.toFixed(1)}
          y={H - 8}
          textAnchor="middle"
          fontSize="11"
          fill="#8c8c8c"
        >
          {d.date.slice(5)}
        </text>
      </g>
    )
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220 }}>
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1677ff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#1677ff" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {grid}
      {area && <path d={area} fill="url(#trendGrad)" />}
      {path && (
        <path d={path} fill="none" stroke="#1677ff" strokeWidth="2" />
      )}
      {points}
    </svg>
  )
}
