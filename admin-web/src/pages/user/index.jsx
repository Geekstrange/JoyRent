// File Name: index.jsx
// Created Time: 2026-09-22 19:51:36
// Update Time: 2026-09-22 19:51:36


import { useMemo, useState } from 'react'
import {
  Card,
  Input,
  Popconfirm,
  Space,
  Table,
  Tag,
  Avatar,
  App,
} from 'antd'
import { UserOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'

import { listUsers, toggleUserStatus } from '@/services/user'
import { assetUrl } from '@/utils/asset'

const PLATFORM_TEXT = {
  wechat: { label: '微信', color: '#52c41a', bg: '#f6ffed' },
  alipay: { label: '支付宝', color: '#1677ff', bg: '#e6f4ff' },
}

export default function UserPage() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [keyword, setKeyword] = useState('')

  const userQ = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers(),
  })

  const users = userQ.data || []

  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return users
    return users.filter(
      (u) =>
        String(u.phone || '').includes(kw) ||
        String(u.nickname || '').toLowerCase().includes(kw)
    )
  }, [users, keyword])

  const toggleMut = useMutation({
    mutationFn: toggleUserStatus,
    onSuccess: () => {
      message.success('状态已更新')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => message.error(e.message),
  })

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    {
      title: '用户',
      render: (_, r) => (
        <Space size={10}>
          <Avatar
            size={32}
            src={r.avatar_path ? assetUrl(r.avatar_path) : undefined}
            icon={<UserOutlined />}
          />
          <span style={{ fontWeight: 500 }}>{r.nickname || '未设置'}</span>
        </Space>
      ),
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      width: 150,
      render: (v) => (
        <span className="moneyfont">{v || '—'}</span>
      ),
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 100,
      render: (v) => {
        const p = PLATFORM_TEXT[v]
        if (!p) return <Tag>{v}</Tag>
        return (
          <Tag style={{ color: p.color, background: p.bg, border: 'none' }}>
            {p.label}
          </Tag>
        )
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v) => {
        const on = v === 'active'
        return (
          <Tag
            style={{
              color: on ? '#52c41a' : '#8c8c8c',
              background: on ? '#f6ffed' : '#f5f5f5',
              border: 'none',
            }}
          >
            {on ? '正常' : '已停用'}
          </Tag>
        )
      },
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      width: 160,
      render: (v) => (
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>
          {dayjs(v).format('YYYY-MM-DD HH:mm')}
        </span>
      ),
    },
    {
      title: '操作',
      width: 100,
      render: (_, r) => {
        const on = r.status === 'active'
        return (
          <Popconfirm
            title={on ? '停用该用户？' : '启用该用户？'}
            description={on ? '停用后该用户无法下单' : undefined}
            okText="确定"
            cancelText="取消"
            onConfirm={() => toggleMut.mutate(r.id)}
          >
            <a style={{ color: on ? '#cf1322' : '#1677ff' }}>
              {on ? '停用' : '启用'}
            </a>
          </Popconfirm>
        )
      },
    },
  ]

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">用户管理</h2>
        <Space>
          <Input
            placeholder="手机号 / 昵称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
        </Space>
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={userQ.isLoading}
          columns={columns}
          dataSource={list}
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (n) => `共 ${n} 人`,
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
          用户以「平台 + 平台内唯一 ID」作为身份标识，同一自然人跨微信与支付宝不自动合并。
        </div>
      </Card>
    </div>
  )
}
