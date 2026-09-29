// File Name: BasicLayout.jsx
// Created Time: 2026-09-22 19:39:53
// Update Time: 2026-09-23 18:12:00


import { useMemo, useState } from 'react'
import { App, Layout, Menu } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { MENU, PAGE_TITLE, UPGRADE_NOTICE } from '@/constants/domain'
import { MenuIcon } from '@/components/AdminIcon'
import BrandLogo from '@/components/BrandLogo'
import ChangePasswordModal from '@/components/ChangePasswordModal'
import { useAuthStore } from '@/stores/auth'

const { Sider, Header, Content } = Layout

export default function BasicLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const [pwdOpen, setPwdOpen] = useState(false)
  // 用 App.useApp() 拿 modal 实例（而非静态 Modal）—— 静态调用拿不到
  // 应用的主题/上下文配置，弹窗样式会与站内其余弹窗不一致。
  const { modal } = App.useApp()

  // 社区版：标记了 `upgrade` 的菜单项（商家管理）**保留可见但不可用**，
  // 点击弹「需升级」提示而不跳转。
  //   保留可见 —— 让用户知道有这个能力、以及怎么获得；
  //   而不是隐藏 —— 隐藏会让人以为产品缺了这块。
  const handleMenuClick = ({ key }) => {
    const item = MENU.find((m) => m.key === key)
    if (item?.upgrade) {
      modal.info({
        title: UPGRADE_NOTICE.title,
        content: (
          <div style={{ whiteSpace: 'pre-line' }}>{UPGRADE_NOTICE.content}</div>
        ),
        okText: '知道了',
      })
      return
    }
    navigate(key)
  }

  const selectedKey = useMemo(() => {
    const seg = '/' + (location.pathname.split('/')[1] || 'dashboard')
    return seg
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <Layout className="admin-shell">
      <Sider width={208} theme="dark" className="admin-sider">
        <div className="brand">
          <BrandLogo size={24} />
          <span>JoyRent CE</span>
        </div>
        <Menu
          className="side-menu"
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={handleMenuClick}
          items={MENU.map((m) => ({
            key: m.key,
            icon: <MenuIcon name={m.key} />,
            label: m.label,
          }))}
          style={{ background: '#001529', borderRight: 'none' }}
        />
        <div className="side-foot">平台自营 · merchant_id = 1</div>
      </Sider>
      <Layout className="admin-main">
        <Header className="side-admin-topbar">
          <span className="crumb">{PAGE_TITLE[selectedKey] || ''}</span>
          <div className="top-right">
            <span className="sub">管理员</span>
            <span className="link" onClick={() => setPwdOpen(true)}>
              修改密码
            </span>
            <span className="link" onClick={handleLogout}>
              退出
            </span>
          </div>
        </Header>
        <Content className="admin-content">
          <Outlet />
        </Content>
      </Layout>

      <ChangePasswordModal
        open={pwdOpen}
        onClose={() => setPwdOpen(false)}
        onDone={() => navigate('/login', { replace: true })}
      />
    </Layout>
  )
}
