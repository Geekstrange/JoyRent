import { View, Text, Button, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'

import { useAuthStore } from '@/store/auth'
import { assetUrl } from '@/utils/asset'
import { fetchMe } from '@/services/api/auth'
import { listMyOrders } from '@/services/api/order'
import { listAddresses } from '@/services/api/address'
import { toast } from '@/utils/platform'
import { setPendingOrdersTab, type OrderTabKey } from '@/utils/ordersTab'

import './index.scss'

interface MenuItemProps {
  label: string
  icon?: string
  extra?: string
  onClick: () => void
}

// 线性图标来源为内联 SVG，构建时渲染成 PNG（小程序 WXML 不能直接内联 SVG）
import iconOrders from '@/assets/mine/orders.png'
import iconAddress from '@/assets/mine/address.png'
import iconService from '@/assets/mine/service.png'
import iconHead from '@/assets/mine/head.png'

function MenuItem({ label, icon, extra, onClick }: MenuItemProps) {
  return (
    <View className="menu-item" onClick={onClick}>
      <View className="menu-left">
        {icon && <Image className="menu-ico" src={icon} mode="aspectFit" />}
        <Text className="menu-label">{label}</Text>
      </View>
      <View className="menu-right">
        {extra && <Text className="menu-extra">{extra}</Text>}
        <Text className="menu-arrow">›</Text>
      </View>
    </View>
  )
}

export default function MinePage() {
  const { token, user, login, logout, setUser, logging } = useAuthStore()

  // 已登录时后台静默刷新用户信息
  const meQ = useQuery({
    queryKey: ['me', token],
    queryFn: fetchMe,
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  // 订单统计（「待支付 / 租赁中 / 全部订单」三栏）
  const orderQ = useQuery({
    queryKey: ['mine-order-stats'],
    queryFn: () => listMyOrders(),
    enabled: !!token,
    staleTime: 30 * 1000,
  })

  // 收货地址条数：用于「收货地址」入口右侧的计数提示。
  // 只取条数，不展示具体地址 —— 菜单一行放不下完整地址，
  // 展示半截反而让用户以为地址被截断了。进入列表页看全即可。
  const addrQ = useQuery({
    queryKey: ['addresses'],
    queryFn: listAddresses,
    enabled: !!token,
    staleTime: 30 * 1000,
  })
  const addressCount = addrQ.data?.length ?? 0

  const orders = orderQ.data || []
  const paidCount = orders.filter((o) => o.status === 'pending').length
  const rentingCount = orders.filter((o) => o.status === 'renting').length
  const orderCount = orders.length

  if (meQ.data && JSON.stringify(meQ.data) !== JSON.stringify(user)) {
    setUser(meQ.data)
  }

  const handleLogin = async () => {
    try {
      await login()
      toast('登录成功', 'success')
    } catch (err: any) {
      toast(err?.message || '登录失败')
    }
  }

  const handleLogout = async () => {
    const res = await Taro.showModal({
      title: '提示',
      content: '确定退出登录？',
      confirmText: '退出',
      cancelText: '取消',
    })
    if (res.confirm) {
      logout()
      toast('已退出')
    }
  }

  const goOrders = (tab: OrderTabKey = '') => {
    // 订单页是主包 tabBar 页面，必须用 switchTab（navigateTo 会失败）。
    // ⚠️ switchTab **不支持 query 参数**，所以「落在哪个 tab」不能用 URL 传，
    // 改由 setPendingOrdersTab 承载意图，订单页在 useDidShow 里消费。
    setPendingOrdersTab(tab)
    Taro.switchTab({ url: '/pages/orders/index' })
  }

  // ── 商家入驻入口：社区版**不显示** ────────────────────────────────
  // 这里原本有入口 + 点击弹「需升级」提示，现已按产品要求**整体移除**：
  //   · 小程序端：不渲染该菜单项，也不保留 assets/mine/merchant.png
  //   · 管理端（admin-web）：菜单项保留可见，点击弹升级提示（运营侧需要知道有这个能力）
  //   · 后端：商家入驻 API 已移除（merchant 表保留，order 有外键）
  //
  // ⚠️ 与管理端刻意不一致是有意的：小程序是**面向终端用户**的，展示一个
  //    点了也用不了的入口只会造成困惑；后台是**面向运营**的，展示并说明
  //    「升级可获得」才有引导价值。

  const goAddress = () => {
    if (!token) {
      toast('请先登录')
      return
    }
    Taro.navigateTo({ url: '/packageUser/address/index' })
  }

  const handleService = () => {
    Taro.showModal({
      title: '联系客服',
      content: '客服电话：400-800-1234\n服务时间：每日 9:00 - 21:00',
      showCancel: false,
      confirmText: '知道了',
    })
  }

  const avatar = assetUrl(user?.avatar_path)

  return (
    <View className="mine-page">
      <View className="profile-card">
        <View className="profile-row">
          <View className="avatar">
            {avatar ? (
              <Image className="avatar-img" src={avatar} mode="aspectFill" />
            ) : (
              <Image className="avatar-svg" src={iconHead} mode="aspectFit" />
            )}
          </View>
          <View className="profile-info">
            <Text className="profile-name">
              {user?.nickname || '未登录'}
            </Text>
            <Text className="profile-sub">
              {user?.phone || (token ? '已登录' : '点击登录，享完整服务')}
            </Text>
          </View>
        </View>

        {/* 统计行：待支付 / 租赁中 / 全部订单 —— 各自跳到订单页的对应 tab */}
        <View className="profile-stats">
          <View className="stat-cell" onClick={() => goOrders('pending')}>
            <Text className="stat-num">{paidCount}</Text>
            <Text className="stat-label">待支付</Text>
          </View>
          <View className="stat-cell" onClick={() => goOrders('renting')}>
            <Text className="stat-num">{rentingCount}</Text>
            <Text className="stat-label">租赁中</Text>
          </View>
          <View className="stat-cell" onClick={() => goOrders('')}>
            <Text className="stat-num">{orderCount}</Text>
            <Text className="stat-label">全部订单</Text>
          </View>
        </View>

        {!token && (
          <Button
            className="login-btn"
            loading={logging}
            onClick={handleLogin}
          >
            一键登录
          </Button>
        )}
      </View>

      <View className="menu-card">
        <MenuItem label="我的订单" icon={iconOrders} onClick={goOrders} />
        <MenuItem
          label="收货地址"
          icon={iconAddress}
          extra={addressCount ? `${addressCount} 个` : ''}
          onClick={goAddress}
        />
        <MenuItem label="联系客服" icon={iconService} onClick={handleService} />
      </View>

      {token && (
        <View className="menu-card">
          <MenuItem label="退出登录" icon={iconHead} onClick={handleLogout} />
        </View>
      )}

      <View className="note-card">
        <Text className="note-title">关于平台</Text>
        <Text className="note-text">
          设备租赁支持同城自提或物流配送，租期内提供免费技术支持。
          押金在设备完好归还后按原路退回。
        </Text>
      </View>
    </View>
  )
}
