// File Name: ChangePasswordModal/index.jsx
// Created Time: 2026-09-23 18:10:00
// Update Time: 2026-09-23 18:10:00

import { useState } from 'react'
import { Modal, Form, Input, App } from 'antd'
import { changeAdminPassword } from '@/services/auth'
import { useAuthStore } from '@/stores/auth'

/**
 * 管理员修改密码弹窗
 * props:
 *   open     受控显示
 *   onClose  关闭回调（成功后也会调用）
 *   onDone   修改成功后的回调（用于提示重新登录等）
 */
export default function ChangePasswordModal({ open, onClose, onDone }) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const logout = useAuthStore((s) => s.logout)
  const { message } = App.useApp()

  const handleOk = async () => {
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSubmitting(true)
    try {
      await changeAdminPassword({
        old_password: values.old_password,
        new_password: values.new_password,
      })
      message.success('密码修改成功，请重新登录')
      form.resetFields()
      onClose?.()
      onDone?.()
      logout()
    } catch (err) {
      // request 拦截器已统一抛出，这里只做兜底提示
      const msg = err?.message || '密码修改失败'
      if (msg.includes('原密码')) {
        form.setFields([{ name: 'old_password', errors: ['原密码不正确'] }])
      } else {
        message.error(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    form.resetFields()
    onClose?.()
  }

  return (
    <Modal
      title="修改密码"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={submitting}
      okText="确认修改"
      cancelText="取消"
      destroyOnHidden
      width={420}
      maskClosable={false}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="old_password"
          label="原密码"
          rules={[{ required: true, message: '请输入原密码' }]}
        >
          <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
        </Form.Item>

        <Form.Item
          name="new_password"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, message: '新密码至少 6 位' },
          ]}
        >
          <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
        </Form.Item>

        <Form.Item
          name="confirm_password"
          label="确认新密码"
          dependencies={['new_password']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('new_password') === value) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error('两次输入的密码不一致'))
              },
            }),
          ]}
        >
          <Input.Password placeholder="再次输入新密码" autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
