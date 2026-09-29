// File Name: index.jsx
// Created Time: 2026-09-22 19:46:26
// Update Time: 2026-09-22 19:46:26


import dayjs from 'dayjs'

export default function ShipTimeline({ traces = [] }) {
  if (!traces.length) {
    return (
      <div
        style={{
          padding: '40px 0',
          textAlign: 'center',
          color: '#8c8c8c',
          fontSize: 13,
        }}
      >
        暂无轨迹
      </div>
    )
  }

  // 后端按时间升序存储，展示时倒序，最新在最上
  const list = [...traces].sort((a, b) => {
    const ta = dayjs(a.trace_at).valueOf()
    const tb = dayjs(b.trace_at).valueOf()
    if (tb !== ta) return tb - ta
    return b.id - a.id
  })

  return (
    <div style={{ position: 'relative', paddingLeft: 22 }}>
      <div
        style={{
          position: 'absolute',
          left: 6,
          top: 6,
          bottom: 6,
          width: 2,
          background: '#f0f0f0',
        }}
      />
      {list.map((t, i) => {
        const on = i === 0
        return (
          <div
            key={t.id ?? `${t.trace_at}-${i}`}
            style={{ position: 'relative', paddingBottom: i === list.length - 1 ? 0 : 16 }}
          >
            <span
              style={{
                position: 'absolute',
                left: -22,
                top: 4,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: on ? '#1677ff' : '#d9d9d9',
                border: '2px solid #fff',
                boxShadow: on
                  ? '0 0 0 3px #e6f0ff'
                  : '0 0 0 1px #f0f0f0',
              }}
            />
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                color: on ? '#1f2329' : '#595959',
                fontWeight: on ? 600 : 400,
              }}
            >
              {t.text}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#8c8c8c',
                marginTop: 3,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {dayjs(t.trace_at).format('YYYY-MM-DD HH:mm')}
            </div>
          </div>
        )
      })}
    </div>
  )
}
