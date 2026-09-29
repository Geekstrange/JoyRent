export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/category/index',
    'pages/equipment/index',
    'pages/orders/index',
    'pages/mine/index',
  ],
  subPackages: [
    {
      root: 'packageOrder',
      pages: [
        'order-detail/index',
        'logistics/index',
        'invoice-list/index',
        'invoice-apply/index',
        'invoice-detail/index',
      ],
    },
    // ⚠️ 社区版（CE）**不含商家入驻**：packageMerchant 分包已移除。
    // 「我的」页保留「商家入驻」入口，但点击只提示需升级到
    // Business / Enterprise 版 —— 后端接口仍然保留（见 README 的版本说明）。
    {
      // 账号维度的个人资料类页面（收货地址等）。
      // 与 packageOrder（订单事务）分开，
      // 避免把「个人设置」混进订单分包里；后续加实名、发票抬头等也往这里放。
      root: 'packageUser',
      pages: ['address/index', 'address-edit/index'],
    },
  ],
  // tabBar：首页 / 订单 / 我的
  // 注意：tabBar 图标必须是 PNG 图片（小程序不支持 SVG），见 src/assets/tabbar/。
  tabBar: {
    color: '#bfc4cf',
    selectedColor: '#1677ff',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/tabbar/home.png',
        selectedIconPath: 'assets/tabbar/home-on.png',
      },
      {
        pagePath: 'pages/orders/index',
        text: '订单',
        iconPath: 'assets/tabbar/order.png',
        selectedIconPath: 'assets/tabbar/order-on.png',
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的',
        iconPath: 'assets/tabbar/mine.png',
        selectedIconPath: 'assets/tabbar/mine-on.png',
      },
    ],
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: 'JoyRent CE',
    navigationBarTextStyle: 'black',
  },
})
