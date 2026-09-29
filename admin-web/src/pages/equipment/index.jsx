// File Name: index.jsx
// Created Time: 2026-09-22 19:43:50
// Update Time: 2026-09-22 19:43:50


import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Popconfirm,
  App,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import EquipmentForm from './EquipmentForm.jsx'
import AvailabilityDrawer from './AvailabilityDrawer.jsx'
import {
  listEquipments,
  createEquipment,
  updateEquipment,
  deleteEquipment,
} from '@/services/equipment'
import { listCategories } from '@/services/category'
import { formatMoney } from '@/utils/money'

export default function EquipmentPage() {
  const { message } = App.useApp()
  const qc = useQueryClient()

  const [keyword, setKeyword] = useState('')
  const [categoryId, setCategoryId] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [availTarget, setAvailTarget] = useState(null)

  const eqQ = useQuery({
    queryKey: ['equipments', categoryId],
    queryFn: () => listEquipments(categoryId ? { category_id: categoryId } : {}),
  })
  const catQ = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  })

  const equipments = eqQ.data || []
  const categories = catQ.data || []

  const categoryName = useMemo(() => {
    const m = {}
    categories.forEach((c) => {
      m[c.id] = c.name
    })
    return m
  }, [categories])

  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return equipments.filter(
      (e) => !kw || e.name.toLowerCase().includes(kw)
    )
  }, [equipments, keyword])

  const createMut = useMutation({
    mutationFn: createEquipment,
    onSuccess: () => {
      message.success('已创建')
      setFormOpen(false)
      qc.invalidateQueries({ queryKey: ['equipments'] })
    },
    onError: (e) => message.error(e.message),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }) => updateEquipment(id, payload),
    onSuccess: () => {
      message.success('已更新')
      setFormOpen(false)
      qc.invalidateQueries({ queryKey: ['equipments'] })
    },
    onError: (e) => message.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: deleteEquipment,
    onSuccess: () => {
      message.success('已删除')
      qc.invalidateQueries({ queryKey: ['equipments'] })
    },
    onError: (e) => message.error(e.message),
  })

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setFormOpen(true)
  }

  const submitForm = (payload) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, payload })
    } else {
      createMut.mutate(payload)
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    {
      title: '设备名称',
      dataIndex: 'name',
      render: (v) => <span style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '分类',
      dataIndex: 'category_id',
      width: 120,
      render: (v) => (
        <span style={{ color: '#595959' }}>{categoryName[v] || '—'}</span>
      ),
    },
    {
      title: '日租金',
      dataIndex: 'daily_cents',
      width: 120,
      align: 'right',
      render: (v) => <span className="moneyfont">{formatMoney(v)}</span>,
    },
    {
      title: '押金',
      dataIndex: 'deposit_cents',
      width: 130,
      align: 'right',
      render: (v) => <span className="moneyfont">{formatMoney(v)}</span>,
    },
    {
      title: '总台数',
      dataIndex: 'total',
      width: 90,
      render: (v) => (
        <Tag style={{ color: '#1677ff', background: '#e6f4ff', border: 'none' }}>
          {v} 台
        </Tag>
      ),
    },
    {
      title: '操作',
      width: 220,
      render: (_, r) => (
        <Space size={12}>
          <a onClick={() => setAvailTarget(r)}>可用量</a>
          <a onClick={() => openEdit(r)}>编辑</a>
          <Popconfirm
            title="确定删除该设备？"
            description="有进行中的订单时无法删除"
            okText="确定"
            cancelText="取消"
            onConfirm={() => deleteMut.mutate(r.id)}
          >
            <a style={{ color: '#cf1322' }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const categoryOptions = useMemo(
    () => [
      { label: '全部分类', value: 0 },
      ...categories.map((c) => ({
        label: c.parent_id ? `  ${c.name}` : c.name,
        value: c.id,
      })),
    ],
    [categories]
  )

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">设备管理</h2>
        <Space>
          <Input
            placeholder="搜索设备名"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
            style={{ width: 180 }}
          />
          <Select
            value={categoryId}
            onChange={setCategoryId}
            options={categoryOptions}
            style={{ width: 160 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建设备
          </Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={eqQ.isLoading}
          columns={columns}
          dataSource={list}
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (n) => `共 ${n} 条`,
          }}
        />
        <div
          style={{
            padding: '12px 18px',
            color: '#8c8c8c',
            fontSize: 12,
            borderTop: '1px solid #f0f0f0',
          }}
        >
          点「可用量」可查看未来 14 天可用台数，并按租期试算租金与押金。
        </div>
      </Card>

      <EquipmentForm
        open={formOpen}
        editing={editing}
        categories={categories}
        submitting={createMut.isPending || updateMut.isPending}
        onCancel={() => setFormOpen(false)}
        onSubmit={submitForm}
      />

      <AvailabilityDrawer
        open={!!availTarget}
        equipment={availTarget}
        onClose={() => setAvailTarget(null)}
      />
    </div>
  )
}
