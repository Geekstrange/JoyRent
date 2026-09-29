// File Name: EquipmentForm.jsx
// Created Time: 2026-09-22 19:43:20
// Update Time: 2026-09-23 19:22:00


import { useEffect, useRef } from 'react'
import { Drawer, Form, Input, InputNumber, Select, Button, Space } from 'antd'
import ImageUpload from '@/components/ImageUpload/index.jsx'
import { yuanToCents, centsToYuan } from '@/utils/money'

/** 把一条设备记录转成表单字段值 */
function toFormValues(e) {
  if (!e) {
    return {
      name: '',
      category_id: undefined,
      spec: '',
      description: '',
      cover_path: '',
      daily_yuan: 0,
      deposit_yuan: 0,
      total: 1,
    }
  }
  return {
    name: e.name,
    category_id: e.category_id,
    spec: e.spec,
    description: e.description,
    cover_path: e.cover_path,
    daily_yuan: Number(centsToYuan(e.daily_cents)),
    deposit_yuan: Number(centsToYuan(e.deposit_cents)),
    total: e.total,
  }
}

export default function EquipmentForm({
  open,
  editing,
  categories,
  submitting,
  onCancel,
  onSubmit,
}) {
  const [form] = Form.useForm()
  // 记录已经回填过的「目标记录」，避免无谓的重复 setFieldsValue
  const filledFor = useRef(null)

  // 回填时机有两个要点，缺一就会「打开编辑抽屉但内容是空的」：
  // 1) 抽屉带 destroyOnHidden，Form.Item 会随 open 变化销毁重建；
  // 2) Form 又设了 preserve={false}，字段一卸载其值就被丢弃。
  // 因此只能在「字段已挂载之后」写值，且用 initialValues 让每次挂载都带上初值。
  useEffect(() => {
    if (!open) {
      filledFor.current = null
      return
    }
    if (filledFor.current === editing) return
    filledFor.current = editing
    form.setFieldsValue(toFormValues(editing))
  }, [open, editing, form])

  const handleOk = async () => {
    const v = await form.validateFields()
    onSubmit({
      name: v.name.trim(),
      category_id: v.category_id,
      spec: (v.spec || '').trim(),
      description: (v.description || '').trim(),
      cover_path: v.cover_path || '',
      daily_cents: yuanToCents(v.daily_yuan || 0),
      deposit_cents: yuanToCents(v.deposit_yuan || 0),
      total: v.total || 0,
    })
  }

  return (
    <Drawer
      title={editing ? '编辑设备' : '新建设备'}
      open={open}
      width={620}
      onClose={onCancel}
      destroyOnHidden
      // 字段实际挂载完成后再同步一次，兜住 editing 在 open 之后才变化的情况
      afterOpenChange={(o) => {
        if (o) form.setFieldsValue(toFormValues(editing))
      }}
      footer={
        <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" loading={submitting} onClick={handleOk}>
            确定
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        // 每次挂载都带上初值：destroyOnHidden 会重建 Form，initialValues 在此刻生效
        initialValues={toFormValues(editing)}
      >
        <Form.Item
          name="name"
          label="设备名称"
          rules={[{ required: true, message: '请输入设备名称' }]}
        >
          <Input placeholder="如：Mavic 4 Pro" maxLength={64} />
        </Form.Item>

        <Form.Item
          name="category_id"
          label="所属分类"
          rules={[{ required: true, message: '请选择分类' }]}
        >
          <Select
            placeholder="请选择"
            options={categories.map((c) => ({
              label: c.parent_id
                ? `${categories.find((x) => x.id === c.parent_id)?.name || ''} / ${c.name}`
                : c.name,
              value: c.id,
            }))}
          />
        </Form.Item>

        <Form.Item name="spec" label="规格描述">
          <Input placeholder="如：DJI · 三摄旗舰" maxLength={64} />
        </Form.Item>

        <Form.Item name="description" label="详情描述">
          <Input.TextArea
            rows={3}
            maxLength={500}
            showCount
            placeholder="设备卖点、配件清单等"
          />
        </Form.Item>

        <Form.Item name="cover_path" label="封面图">
          <ImageUpload scope="equipment" />
        </Form.Item>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 14,
          }}
        >
          <Form.Item
            name="daily_yuan"
            label="日租金（元）"
            rules={[{ required: true, message: '请输入日租金' }]}
          >
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="deposit_yuan"
            label="押金（元）"
            rules={[{ required: true, message: '请输入押金' }]}
          >
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="total"
            label="总台数"
            rules={[{ required: true, message: '请输入总台数' }]}
          >
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
        </div>

        <div style={{ color: '#8c8c8c', fontSize: 12 }}>
          金额按元录入，后端以「分」存储，提交时自动 ×100。
        </div>
      </Form>
    </Drawer>
  )
}
