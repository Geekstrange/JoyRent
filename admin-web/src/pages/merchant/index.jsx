// File Name: index.jsx
// Created Time: 2026-09-22 19:51:21
// Update Time: 2026-09-28 11:50:00
//
// 社区版（CE）：商家管理**不可用**，整页替换为升级提示。
//
// ⚠️ 为什么页面本身也要改，而不是只在菜单点击处拦一下：
// 管理员可能直接输入 URL（或刷新）访问 `/merchant`。若保留原页面，
// 它会去调 `listMerchants` —— 而后端商家入驻 API 在 CE 中已移除，
// 接口返回 404，用户看到的是「加载失败」这种**误导性错误**：
// 看起来像系统坏了，其实是版本限制。
//
// 所以两条路径（菜单点击 / 直接访问）给出一致的结论。
import { Card, Result } from 'antd'

import { UPGRADE_NOTICE } from '@/constants/domain'

export default function MerchantPage() {
  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">商家管理</h2>
      </div>

      <Card>
        <Result
          status="warning"
          title={UPGRADE_NOTICE.title}
          subTitle={
            <div style={{ whiteSpace: 'pre-line' }}>{UPGRADE_NOTICE.content}</div>
          }
        />
      </Card>
    </div>
  )
}
