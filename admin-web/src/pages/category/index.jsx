// File Name: index.jsx
// Created Time: 2026-09-22 19:43:00
// Update Time: 2026-09-22 19:43:00


import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  App,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '@/services/category'
import { listEquipments } from '@/services/equipment'

export default function CategoryPage() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [editing, setEditing] = useState(null) // null 表示新建
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()

  const catQ = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  })
  const eqQ = useQuery({
    queryKey: ['equipments', 'all'],
    queryFn: () => listEquipments(),
  })

  const categories = catQ.data || []
  const equipments = eqQ.data || []

  const equipmentCount = useMemo(() => {
    const m = {}
    equipments.forEach((e) => {
      m[e.category_id] = (m[e.category_id] || 0) + 1
    })
    return m
  }, [equipments])

  const topOptions = useMemo(
    () =>
      categories
        .filter((c) => !c.parent_id)
        .filter((c) => !editing || c.id !== editing.id)
        .map((c) => ({ label: c.name, value: c.id })),
    [categories, editing]
  )

  const list = useMemo(() => {
    const kw = keyword.trim()
    return categories
      .filter((c) => !kw || c.name.includes(kw))
      .sort((a, b) => a.id - b.id)
  }, [categories, keyword])

  // 表单回填不能只靠 setFieldsValue：Modal 带 destroyOnClose，字段会随开关销毁重建，
  // 而 Form 又是 preserve={false}，字段一卸载其值就被丢弃。
  // 所以把目标值放进 initialValues（每次挂载时生效），setFieldsValue 只作兜底。
  const formInitialValues = useMemo(() => {
    if (!editing) return { name: '', parent_id: 0, sort: 0 }
    return {
      name: editing.name,
      parent_id: editing.parent_id,
      sort: editing.sort,
    }
  }, [editing])

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setModalOpen(true)
  }

  const createMut = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      message.success('已创建')
      setModalOpen(false)
      qc.invalidateQueries({ queryKey: ['categories'] })
    },
    onError: (e) => message.error(e.message),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }) => updateCategory(id, payload),
    onSuccess: () => {
      message.success('已更新')
      setModalOpen(false)
      qc.invalidateQueries({ queryKey: ['categories'] })
    },
    onError: (e) => message.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      message.success('已删除')
      qc.invalidateQueries({ queryKey: ['categories'] })
    },
    onError: (e) => message.error(e.message),
  })

  const submit = async () => {
    const values = await form.validateFields()
    const payload = {
      name: values.name.trim(),
      parent_id: values.parent_id || 0,
      sort: values.sort || 0,
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, payload })
    } else {
      createMut.mutate(payload)
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    {
      title: '分类名称',
      dataIndex: 'name',
      render: (v) => <span style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '层级',
      dataIndex: 'parent_id',
      width: 100,
      render: (v) =>
        v ? (
          <Tag style={{ color: '#1677ff', background: '#e6f4ff', border: 'none' }}>
            二级
          </Tag>
        ) : (
          <Tag style={{ color: '#595959', background: '#f5f5f5', border: 'none' }}>
            一级
          </Tag>
        ),
    },
    { title: '排序', dataIndex: 'sort', width: 80 },
    {
      title: '设备数',
      width: 90,
      render: (_, r) => equipmentCount[r.id] || 0,
    },
    {
      title: '状态',
      width: 90,
      render: () => (
        <Tag style={{ color: '#52c41a', background: '#f6ffed', border: 'none' }}>
          启用
        </Tag>
      ),
    },
    {
      title: '操作',
      width: 140,
      render: (_, r) => (
        <Space size={12}>
          <a onClick={() => openEdit(r)}>编辑</a>
          <Popconfirm
            title="确定删除该分类？"
            description={
              equipmentCount[r.id]
                ? '该分类下仍有设备，无法删除'
                : '删除后不可恢复'
            }
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

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">分类管理</h2>
        <Space>
          <Input
            placeholder="搜索分类名"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建分类
          </Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={catQ.isLoading}
          columns={columns}
          dataSource={list}
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
        <div
          style={{
            padding: '12px 18px',
            color: '#8c8c8c',
            fontSize: 12,
            borderTop: '1px solid #f0f0f0',
          }}
        >
          分类下仍有设备时不可删除，后端会返回 409 并提示设备数量。
        </div>
      </Card>

      <Modal
        title={editing ? '编辑分类' : '新建分类'}
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={createMut.isPending || updateMut.isPending}
        okText="确定"
        cancelText="取消"
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          initialValues={formInitialValues}
        >
          <Form.Item
            name="name"
            label="分类名称"
            rules={[{ required: true, message: '请输入分类名称' }]}
          >
            <Input placeholder="如：无人机" maxLength={32} />
          </Form.Item>
          <Form.Item name="parent_id" label="上级分类">
            <Select
              allowClear
              placeholder="作为一级分类"
              options={topOptions}
            />
          </Form.Item>
          <Form.Item name="sort" label="排序">
            <InputNumber min={0} max={9999} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
