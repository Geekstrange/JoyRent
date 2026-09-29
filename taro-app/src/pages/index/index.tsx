import { useMemo, useState } from 'react'
import { View, Text, ScrollView, Input, Image } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import EquipmentCard from '@/components/EquipmentCard'
import Empty from '@/components/Empty'
import ErrorState from '@/components/ErrorState'
import { listCategories } from '@/services/api/category'
import {
  listEquipments,
  getAvailability,
  type Equipment,
} from '@/services/api/equipment'

import './index.scss'

// 搜索图标来自 demo/user.html 的 SVG_SEARCH，构建时渲染成 PNG（小程序不能内联 SVG）
import iconSearch from '@/assets/search.png'
// 「全部分类」格图标，来自 demo/user.html 的 SVG_ALLCAT（同样不能内联 SVG）
import iconAllCat from '@/assets/allcat.png'

/** 分类底色：与全站宫格同一套浅色板，按分类顺序轮转 */
const CAT_COLORS = ['#e6f4ff', '#f9f0ff', '#e6fffb', '#f6ffed', '#fff7e6']

export default function HomePage() {
  const qc = useQueryClient()
  const [catFilter, setCatFilter] = useState(0)
  const [keyword, setKeyword] = useState('')

  const catQ = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  })

  const eqQ = useQuery({
    queryKey: ['equipments', catFilter, keyword],
    queryFn: () =>
      listEquipments({
        category_id: catFilter || undefined,
        keyword: keyword || undefined,
      }),
  })

  // 请求失败 ≠ 没有数据。这两者之前都渲染成 Empty，长得一模一样，
  // 导致「后端没连上」被误判成「确实没数据」，排查时完全靠猜。
  // 现在单独区分：任一查询出错就展示 ErrorState（含实际请求地址与重试按钮）。
  const loadError = catQ.error || eqQ.error
  const retry = () => {
    qc.invalidateQueries({ queryKey: ['categories'] })
    qc.invalidateQueries({ queryKey: ['equipments'] })
  }

  const categories = catQ.data || []
  const equipments = eqQ.data || []

  // 一级分类宫格。
  // 宫格每行 5 格（20%），末位固定是「全部分类」入口 —— 它跳转到分类页，
  // 而不是做筛选。一级分类超过 4 个时，第 5 个及以后只能在分类页看到，
  // 这样宫格始终是整齐的一行，不会出现第 6 格被挤到第二行的错位。
  const MAX_TOP_CELLS = 4
  const tops = useMemo(
    () => categories.filter((c) => !c.parent_id).slice(0, MAX_TOP_CELLS),
    [categories]
  )

  // 选中一级分类后，其下二级分类
  const subs = useMemo(() => {
    if (!catFilter) return []
    const cur = categories.find((c) => c.id === catFilter)
    if (!cur) return []
    const pid = cur.parent_id || cur.id
    return categories.filter((c) => c.parent_id === pid)
  }, [categories, catFilter])

  // 批量计算可用量：并发查询每台设备 1 天可用量，作为列表展示
  const availableMap = useQuery({
    queryKey: ['availability-batch', equipments.map((e) => e.id).join(',')],
    queryFn: async () => {
      const map: Record<number, number> = {}
      await Promise.all(
        equipments.map(async (e) => {
          try {
            const bars = await getAvailability(e.id, 1)
            map[e.id] = bars[0]?.count ?? e.total
          } catch {
            map[e.id] = e.total
          }
        })
      )
      return map
    },
    enabled: equipments.length > 0,
  }).data || {}

  useDidShow(() => {
    // 分类页点了子分类后回首页：那边只留了个 storage 标记（switchTab 不能带参数），
    // 必须在这里读出来并应用，否则「点了没反应」。
    // 读后立即删除，避免下次进首页又被旧筛选粘住。
    const pending = Taro.getStorageSync('home_cat_filter')
    if (pending) {
      Taro.removeStorageSync('home_cat_filter')
      setCatFilter(Number(pending) || 0)
      if (Number(pending)) {
        // 自动滚动到设备列表，让用户直接看到筛选结果
        Taro.pageScrollTo({ scrollTop: 400, duration: 200 })
      }
    }
    qc.invalidateQueries({ queryKey: ['equipments'] })
  })

  usePullDownRefresh(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['categories'] }),
      qc.invalidateQueries({ queryKey: ['equipments'] }),
    ])
    Taro.stopPullDownRefresh()
  })

  const handleCategory = (id: number) => {
    setCatFilter((prev) => (prev === id ? 0 : id))
  }

  const gridCards = useMemo(() => {
    const cells = tops.map((c, i) => (
      <View
        key={c.id}
        className={`cat-cell ${catFilter === c.id ? 'on' : ''}`}
        onClick={() => handleCategory(c.id)}
      >
        <View
          className="cat-cell-ico"
          style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}
        >
          <Text>{c.name.slice(0, 1)}</Text>
        </View>
        <Text className="cat-cell-name">{c.name}</Text>
      </View>
    ))
    cells.push(
      <View
        key="all"
        className="cat-cell"
        onClick={() => Taro.navigateTo({ url: '/pages/category/index' })}
      >
        {/* demo 里「全部分类」格用的不是首字，而是 SVG_ALLCAT（2×2 方块）图标 */}
        <View className="cat-cell-ico all">
          <Image className="cat-cell-ico-img" src={iconAllCat} mode="aspectFit" />
        </View>
        <Text className="cat-cell-name">全部分类</Text>
      </View>
    )
    return cells
  }, [tops, catFilter])

  // 设备所属一级分类的底色，供封面缺失时兜底
  const catColorOf = useMemo(() => {
    const map: Record<number, string> = {}
    categories.forEach((c) => {
      const rootId = c.parent_id || c.id
      const idx = tops.findIndex((t) => t.id === rootId)
      map[c.id] = CAT_COLORS[(idx < 0 ? 0 : idx) % CAT_COLORS.length]
    })
    return map
  }, [categories, tops])

  const list: Equipment[] = equipments

  return (
    <View className="home-page">
      <View className="hero">
        <Text className="hero-title">租设备，上这儿</Text>
        <Text className="hero-sub">办公设备 · 摄影器材 · 无人机 · 户外装备</Text>
      </View>

      <View className="search-box">
        <Image className="search-ico" src={iconSearch} mode="aspectFit" />
        <Input
          className="search-input"
          placeholder="搜索设备名称"
          placeholderClass="search-ph"
          value={keyword}
          onInput={(e) => setKeyword((e.target as any).value || '')}
          confirmType="search"
        />
      </View>

      <View className="cat-grid">
        <View className="cat-grid-head">
          <Text className="cat-grid-title">分类导航</Text>
          <Text className="cat-grid-more" onClick={() => setCatFilter(0)}>
            {catFilter ? '清除筛选' : `共 ${equipments.length} 台设备`}
          </Text>
        </View>
        <View className="cat-cells">{gridCards}</View>
      </View>

      {subs.length > 0 && (
        <ScrollView scrollX className="sub-bar" enableFlex>
          <View
            className={`sub-chip ${catFilter === subs[0].parent_id ? 'on' : ''}`}
            onClick={() => setCatFilter(subs[0].parent_id || 0)}
          >
            <Text>全部</Text>
          </View>
          {subs.map((c) => (
            <View
              key={c.id}
              className={`sub-chip ${catFilter === c.id ? 'on' : ''}`}
              onClick={() => setCatFilter(c.id)}
            >
              <Text>{c.name}</Text>
            </View>
          ))}
          <View className="sub-chip" onClick={() => setCatFilter(0)}>
            <Text>重置</Text>
          </View>
        </ScrollView>
      )}

      {loadError ? (
        <ErrorState error={loadError} onRetry={retry} />
      ) : eqQ.isPending || catQ.isPending ? (
        // ⚠️ 这一支必须存在。否则请求还在路上时 `list` 是空数组，
        // 会直接落到下面的 Empty，把「加载中」误显示成「没有找到匹配的设备」。
        // hint 里的 fetchStatus 是诊断用：idle=订阅从未触发(hook 层故障)、
        // fetching=请求已发出、paused=被 networkMode 暂停。
        <Empty
          loading
          hint={`cat:${catQ.fetchStatus} eq:${eqQ.fetchStatus}`}
        />
      ) : list.length > 0 ? (
        <View className="eq-grid">
          {list.map((e) => (
            <View className="eq-grid-cell" key={e.id}>
              <EquipmentCard
                item={e}
                available={availableMap[e.id]}
                fallbackBg={catColorOf[e.category_id]}
              />
            </View>
          ))}
        </View>
      ) : (
        <Empty
          text="没有找到匹配的设备"
          hint={
            catFilter
              ? `当前筛选：${categories.find((c) => c.id === catFilter)?.name || catFilter}，点上方「清除筛选」看全部`
              : '换个分类或关键词试试'
          }
        />
      )}
    </View>
  )
}
