import { useState, useEffect } from 'react'
import { Form, Input, Button, App } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { adminLogin } from '@/services/auth'
import { useAuthStore } from '@/stores/auth'
import BrandLogo from '@/components/BrandLogo'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()
  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.setAuth)

  useEffect(() => {
    if (token) {
      navigate(location.state?.from || '/dashboard', { replace: true })
    }
  }, [token, navigate, location.state])

  const onFinish = async (values) => {
    setLoading(true)
    try {
      const data = await adminLogin(values)
      setAuth(data.token, data.admin)
      message.success('登录成功')
      navigate(location.state?.from || '/dashboard', { replace: true })
    } catch (err) {
      message.error(err.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #e6f0ff, #f5f6f8)',
      }}
    >
      <div
        style={{
          width: 380,
          background: '#fff',
          borderRadius: 12,
          padding: '36px 32px',
          boxShadow: '0 8px 32px rgba(0,0,0,.08)',
        }}
      >
        <BrandLogo size={48} style={{ display: 'block', margin: '0 auto 14px' }} />
        <h1
          style={{
            textAlign: 'center',
            fontSize: 20,
            fontWeight: 600,
            margin: '0 0 4px',
          }}
        >
          JoyRent CE
        </h1>
        <p
          style={{
            textAlign: 'center',
            color: '#8c8c8c',
            fontSize: 13,
            margin: '0 0 24px',
          }}
        >
          管理后台
        </p>
        <Form onFinish={onFinish} size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登 录
            </Button>
          </Form.Item>
        </Form>
        <p
          style={{
            textAlign: 'center',
            color: '#8c8c8c',
            fontSize: 12,
            marginTop: 12,
          }}
        >
          Community Edition
        </p>
      </div>
    </div>
  )
}