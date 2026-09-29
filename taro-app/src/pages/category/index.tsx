import { useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useQuery } from '@tanstack/react-query'

import Empty from '@/components/Empty'
import ErrorState from '@/components/ErrorState'
import { listCategories } from '@/services/api/category'
import { listEquipments } from '@/services/api/equipment'

import './index.scss'

export default function CategoryPage() {
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

  const countMap = useMemo(() => {
    const m: Record<number, number> = {}
    equipments.forEach((e) => {
      m[e.category_id] = (m[e.category_id] || 0) + 1
    })
    return m
  }, [equipments])

  const groups = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories]
  )

  const handleTap = (subId: number) => {
    // 首页是 tabBar 页，只能用 switchTab（navigateTo 会失败），而 switchTab
    // **不支持带参数**，所以借 storage 传递筛选目标，由首页的 useDidShow 读取。
    Taro.setStorageSync('home_cat_filter', subId)
    Taro.switchTab({ url: '/pages/index/index' })
  }

  // 三态必须分开，顺序不能乱：
  //   出错 → ErrorState（含实际请求地址）
  //   加载中 → Empty loading（否则请求未回来时会误显示「暂无分类」）
  //   真的空 → Empty
  // 之前少了「加载中」这一支，导致请求 pending 时直接渲染「暂无分类」，
  // 和「后端连不上」的表现完全一样，无法归因。
  const loadError = catQ.error || eqQ.error
  const retry = () => {
    catQ.refetch()
    eqQ.refetch()
  }

  if (loadError) {
    return <ErrorState error={loadError} onRetry={retry} />
  }

  if (catQ.isPending) {
    return <Empty loading hint={`cat:${catQ.fetchStatus} eq:${eqQ.fetchStatus}`} />
  }

  if (!groups.length) {
    return <Empty text="暂无分类" />
  }

  // ⚠️ 数据形态兜底（真实踩坑）：
  // 分类数据可能有两种形态 ——
  //   ① 两级结构（demo 的形态）：顶级分类下挂若干子分类
  //   ② **平铺结构**：所有分类的 parent_id 都是 0，没有子分类
  // 后端当前返回的是 ②。原实现只按 ① 渲染（每个 group 只渲染 subs），
  // 结果 ② 时 subs 恒为空 → 页面上**一个可点的条目都没有**，
  // 表现为「全部分类的子条目点不开」。
  // 所以这里必须有分支：没有子分类时，让顶级分类自己成为可点条目。
  return (
    <View className="category-page">
      {groups.map((g) => {
        const subs = categories.filter((c) => c.parent_id === g.id)
        // 无子分类 → 顶级分类自身可点（数量按自身统计）
        const items = subs.length > 0 ? subs : [g]
        return (
          <View key={g.id} className="cat-group">
            <Text className="cat-group-title">{g.name}</Text>
            <View className="cat-subs">
              {items.map((s) => (
                <View
                  key={s.id}
                  className="cat-sub"
                  onClick={() => handleTap(s.id)}
                >
                  {/* demo 的格式是「名称 · 数量」一体文本 */}
                  <Text className="cat-sub-text">
                    {s.name} · {countMap[s.id] || 0}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )
      })}
    </View>
  )
}
