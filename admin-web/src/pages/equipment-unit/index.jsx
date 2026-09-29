// File Name: index.jsx
// Created Time: 2026-09-22 19:44:06
// Update Time: 2026-09-22 19:44:06


import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  App,
} from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import {
  listEquipments,
  listUnits,
  generateUnits,
  updateUnitStatus,
} from '@/services/equipment'

const UNIT_STATUS = {
  idle:        { text: '空闲',   color: '#52c41a', bg: '#f6ffed' },
  rented:      { text: '出租中', color: '#1677ff', bg: '#e6f4ff' },
  maintenance: { text: '维护中', color: '#fa8c16', bg: '#fff7e6' },
  retired:     { text: '已退役', color: '#8c8c8c', bg: '#f5f5f5' },
}

export default function EquipmentUnitPage() {
  const { message } = App.useApp()
  const qc = useQueryClient()

  const [equipmentId, setEquipmentId] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [genOpen, setGenOpen] = useState(false)
  const [genForm] = Form.useForm()

  const eqQ = useQuery({
    queryKey: ['equipments', 'all'],
    queryFn: () => listEquipments(),
  })

  const equipments = eqQ.data || []

  useEffect(() => {
    if (!equipmentId && equipments.length > 0) {
      setEquipmentId(equipments[0].id)
    }
  }, [equipments, equipmentId])

  const current = useMemo(
    () => equipments.find((e) => e.id === equipmentId) || null,
    [equipments, equipmentId]
  )

  const unitQ = useQuery({
    queryKey: ['units', equipmentId],
    queryFn: () => listUnits(equipmentId),
    enabled: !!equipmentId,
  })

  const units = unitQ.data || []

  const list = useMemo(
    () => units.filter((u) => !statusFilter || u.status === statusFilter),
    [units, statusFilter]
  )

  const stats = useMemo(() => {
    const m = { idle: 0, rented: 0, maintenance: 0, retired: 0 }
    units.forEach((u) => {
      if (m[u.status] != null) m[u.status] += 1
    })
    return m
  }, [units])

  const genMut = useMutation({
    mutationFn: ({ id, count }) => generateUnits(id, count),
    onSuccess: (data) => {
      message.success(`已生成 ${data.created} 个单元`)
      setGenOpen(false)
      genForm.resetFields()
      qc.invalidateQueries({ queryKey: ['units', equipmentId] })
    },
    onError: (e) => message.error(e.message),
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => updateUnitStatus(id, status),
    onSuccess: () => {
      message.success('状态已更新')
      qc.invalidateQueries({ queryKey: ['units', equipmentId] })
    },
    onError: (e) => message.error(e.message),
  })

  const openGenerate = () => {
    genForm.setFieldsValue({ count: 1 })
    setGenOpen(true)
  }

  const submitGenerate = async () => {
    const v = await genForm.validateFields()
    genMut.mutate({ id: equipmentId, count: v.count })
  }

  const columns = [
    {
      title: '#',
      width: 70,
      render: (_, __, idx) => idx + 1,
    },
    {
      title: '序列号',
      dataIndex: 'sn',
      render: (v) => <span className="moneyfont">{v}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (v) => {
        const s = UNIT_STATUS[v] || UNIT_STATUS.idle
        return (
          <Tag style={{ color: s.color, background: s.bg, border: 'none' }}>
            {s.text}
          </Tag>
        )
      },
    },
    {
      title: '操作',
      width: 240,
      render: (_, r) => (
        <Space size={8}>
          {r.status !== 'idle' && (
            <a onClick={() => statusMut.mutate({ id: r.id, status: 'idle' })}>
              置为空闲
            </a>
          )}
          {r.status !== 'maintenance' && (
            <a
              onClick={() =>
                statusMut.mutate({ id: r.id, status: 'maintenance' })
              }
            >
              维护中
            </a>
          )}
          {r.status !== 'retired' && (
            <a
              style={{ color: '#cf1322' }}
              onClick={() => statusMut.mutate({ id: r.id, status: 'retired' })}
            >
              退役
            </a>
          )}
        </Space>
      ),
    },
  ]

  const equipmentOptions = equipments.map((e) => ({
    label: `${e.name}（${e.total} 台）`,
    value: e.id,
  }))

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">设备单元（序列号）</h2>
        <Space>
          <Select
            value={equipmentId || undefined}
            onChange={setEquipmentId}
            options={equipmentOptions}
            placeholder="选择设备"
            style={{ width: 260 }}
            showSearch
            optionFilterProp="label"
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: '全部状态', value: '' },
              { label: '空闲', value: 'idle' },
              { label: '出租中', value: 'rented' },
              { label: '维护中', value: 'maintenance' },
              { label: '已退役', value: 'retired' },
            ]}
            style={{ width: 140 }}
          />
          <Button
            type="primary"
            onClick={openGenerate}
            disabled={!equipmentId}
          >
            批量生成
          </Button>
        </Space>
      </div>

      {current && (
        <Card style={{ marginBottom: 14 }} styles={{ body: { padding: '14px 18px' } }}>
          <Space size={24}>
            <span>
              <span style={{ color: '#8c8c8c' }}>总台数：</span>
              <b>{units.length}</b>
            </span>
            <span>
              <span style={{ color: '#8c8c8c' }}>空闲：</span>
              <b style={{ color: '#52c41a' }}>{stats.idle}</b>
            </span>
            <span>
              <span style={{ color: '#8c8c8c' }}>出租中：</span>
              <b style={{ color: '#1677ff' }}>{stats.rented}</b>
            </span>
            <span>
              <span style={{ color: '#8c8c8c' }}>维护中：</span>
              <b style={{ color: '#fa8c16' }}>{stats.maintenance}</b>
            </span>
            <span>
              <span style={{ color: '#8c8c8c' }}>已退役：</span>
              <b style={{ color: '#8c8c8c' }}>{stats.retired}</b>
            </span>
          </Space>
        </Card>
      )}

      <Card styles={{ body: { padding: 0 } }}>
        {!equipmentId ? (
          <Empty
            style={{ padding: 70 }}
            description="请先选择设备，查看其序列号清单"
          />
        ) : (
          <Table
            rowKey="id"
            loading={unitQ.isLoading}
            columns={columns}
            dataSource={list}
            pagination={{
              pageSize: 20,
              showSizeChanger: false,
              showTotal: (n) => `共 ${n} 台`,
            }}
          />
        )}
        <div
          style={{
            padding: '12px 18px',
            color: '#8c8c8c',
            fontSize: 12,
            borderTop: '1px solid #f0f0f0',
          }}
        >
          租期排他约束以「设备单元」为维度生效：同一台设备在重叠租期内不会被重复分配。
        </div>
      </Card>

      <Modal
        title="批量生成设备单元"
        open={genOpen}
        onOk={submitGenerate}
        onCancel={() => setGenOpen(false)}
        confirmLoading={genMut.isPending}
        okText="生成"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={genForm} layout="vertical" preserve={false}>
          <Form.Item
            name="count"
            label="生成数量"
            rules={[
              { required: true, message: '请输入数量' },
              {
                type: 'number',
                min: 1,
                max: 1000,
                message: '数量需在 1-1000 之间',
              },
            ]}
          >
            <InputNumber min={1} max={1000} style={{ width: '100%' }} />
          </Form.Item>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>
            序列号将按「设备ID-序号」自动生成，例如 {equipmentId || '101'}
            -0001。已存在的序列号会被跳过。
          </div>
        </Form>
      </Modal>
    </div>
  )
}
