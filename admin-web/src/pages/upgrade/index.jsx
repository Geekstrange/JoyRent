// File Name: index.jsx
// Created Time: 2026-09-29 13:49:00
// Update Time: 2026-09-29 13:49:00
//
// 社区版（CE）：Business / Enterprise 专属功能的统一「升级提示」页。
//
// ⚠️ 与商家管理页（merchant/index.jsx）同一设计理由：
// 保留导航入口而不是隐藏 —— 让用户知道该能力存在、去哪获得；
// 页面级提示而不是点击时拦截 —— 直接输 URL / 刷新也要给出一致结论，
// 否则用户看到的是「加载失败」这类误导性错误（像系统坏了，其实是版本限制）。
import { Card, Result } from 'antd'
import { useLocation } from 'react-router-dom'

import { MENU, UPGRADE_NOTICE, UPGRADE_NOTICES } from '@/constants/domain'

export default function UpgradePage() {
  const location = useLocation()
  // 按 URL 反查菜单标题与文案；找不到匹配时退回通用文案
  const item = MENU.find((m) => m.key === location.pathname)
  const notice = UPGRADE_NOTICES[location.pathname] || UPGRADE_NOTICE

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">{item?.label || '功能不可用'}</h2>
      </div>

      <Card>
        <Result
          status="warning"
          title={notice.title}
          subTitle={
            <div style={{ whiteSpace: 'pre-line' }}>{notice.content}</div>
          }
        />
      </Card>
    </div>
  )
}
