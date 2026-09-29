// File Name: AvailabilityDrawer.jsx
// Created Time: 2026-09-22 19:43:34
// Update Time: 2026-09-22 19:43:34


import { Drawer, Descriptions, Spin, Empty } from 'antd'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'

import { getAvailability } from '@/services/equipment'
import { formatMoney } from '@/utils/money'

const BAR_MAX_H = 110
const BAR_UNIT_H = 14

export default function AvailabilityDrawer({ open, equipment, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['availability', equipment?.id],
    queryFn: () => getAvailability(equipment.id, 14),
    enabled: open && !!equipment?.id,
  })

  const bars = data || []
  const max = Math.max(1, ...bars.map((b) => b.count))

  const exampleStart = dayjs().add(1, 'day').format('YYYY-MM-DD')
  const exampleEnd = dayjs().add(4, 'day').format('YYYY-MM-DD')
  const exampleDays = 4
  const exampleRent = equipment
    ? equipment.daily_cents * exampleDays
    : 0
  const exampleDeposit = equipment?.deposit_cents || 0
  const exampleAvail = bars.find((b) => b.date === exampleStart)?.count ?? 0

  return (
    <Drawer
      title={equipment ? `可用量 · ${equipment.name}` : '可用量'}
      open={open}
      width={620}
      onClose={onClose}
      destroyOnClose
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : !equipment ? (
        <Empty />
      ) : (
        <>
          <Descriptions
            column={2}
            size="small"
            bordered
            items={[
              { key: 'id', label: '设备 ID', children: equipment.id },
              { key: 'total', label: '总台数', children: `${equipment.total} 台` },
              {
                key: 'daily',
                label: '日租金',
                children: formatMoney(equipment.daily_cents),
              },
              {
                key: 'deposit',
                label: '押金',
                children: formatMoney(equipment.deposit_cents),
              },
            ]}
          />

          <div style={{ marginTop: 20, marginBottom: 8, fontWeight: 600 }}>
            未来 14 天可用台数
          </div>

          {bars.length === 0 ? (
            <Empty description="暂无数据" />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 4,
                height: 150,
                paddingTop: 8,
              }}
            >
              {bars.map((b) => {
                const h = Math.max(
                  4,
                  Math.round((b.count / max) * BAR_MAX_H)
                )
                const out = b.count <= 0
                return (
                  <div
                    key={b.date}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      height: '100%',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: '#595959',
                        marginBottom: 4,
                      }}
                    >
                      {b.count}
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: h,
                        borderRadius: '3px 3px 0 0',
                        background: out
                          ? '#ffccc7'
                          : 'linear-gradient(180deg,#69b1ff,#1677ff)',
                      }}
                    />
                    <div
                      style={{
                        fontSize: 10,
                        color: '#bfbfbf',
                        marginTop: 4,
                      }}
                    >
                      {b.date.slice(5)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ marginTop: 24, marginBottom: 8, fontWeight: 600 }}>
            下单试算
          </div>
          <Descriptions
            column={2}
            size="small"
            bordered
            items={[
              {
                key: 'period',
                label: '示例租期',
                children: `${exampleStart} 至 ${exampleEnd}`,
                span: 2,
              },
              { key: 'days', label: '租期', children: `${exampleDays} 天` },
              {
                key: 'avail',
                label: '该租期可租',
                children: `${exampleAvail} 台`,
              },
              {
                key: 'rent',
                label: '租金',
                children: formatMoney(exampleRent),
              },
              {
                key: 'deposit',
                label: '押金',
                children: formatMoney(exampleDeposit),
              },
              {
                key: 'total',
                label: '应付总额',
                children: (
                  <span style={{ color: '#cf1322', fontWeight: 600 }}>
                    {formatMoney(exampleRent + exampleDeposit)}
                  </span>
                ),
              },
            ]}
          />

          <div
            style={{
              marginTop: 16,
              fontSize: 12,
              color: '#8c8c8c',
              lineHeight: 1.7,
            }}
          >
            可用量按「设备单元」维度计算，已排除租期重叠的占用记录。
            后端通过 PostgreSQL 的 gist 排他约束保证不超卖。
          </div>
        </>
      )}
    </Drawer>
  )
}
