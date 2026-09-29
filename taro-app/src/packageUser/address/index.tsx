import { useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import Empty from '@/components/Empty'
import ErrorState from '@/components/ErrorState'
import {
  listAddresses,
  deleteAddress,
  setDefaultAddress,
  fullAddress,
  type Address,
} from '@/services/api/address'
import { useAuthStore } from '@/store/auth'
import { toast, confirm } from '@/utils/platform'

import './index.scss'

export default function AddressListPage() {
  const router = useRouter()
  // select=1 时本页作为「下单选用地址」的选择器：点一条即返回并带上地址
  const isSelectMode = router.params.select === '1'

  const token = useAuthStore((s) => s.token)
  const qc = useQueryClient()
  const [busyId, setBusyId] = useState(0)

  const listQ = useQuery({
    queryKey: ['addresses'],
    queryFn: listAddresses,
    enabled: !!token,
  })

  /**
   * 从编辑页返回时刷新列表。
   *
   * ⚠️ 不能用 useQuery 的 staleTime 兜底：Taro 的 navigateBack 不会重新挂载本页，
   * 组件不重挂载 → query 不重取；若在编辑页新增了一条地址，返回后列表里看不到，
   * 用户会以为「没保存成功」。所以显式在页面重新可见时失效缓存。
   */
  useDidShow(() => {
    if (token) qc.invalidateQueries({ queryKey: ['addresses'] })
  })

  const addresses = listQ.data || []

  const goEdit = (id?: number) => {
    const suffix = id ? `?id=${id}` : ''
    Taro.navigateTo({ url: `/packageUser/address-edit/index${suffix}` })
  }

  /**
   * 选中地址（仅选择模式）。
   *
   * 返回上一页的方式有两种，必须区分：
   *   - 上一页是**下单页**（navigateTo 进来）→ navigateBack 即可；
   *   - 用户可能是从扫码/分享**直接进**本页（没有上一页）→ navigateBack 会失败，
   *     此时回落到首页，避免把用户卡在一个空白页上。
   */
  const pick = (a: Address) => {
    if (!isSelectMode) {
      goEdit(a.id)
      return
    }
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) {
      // 通过 EventChannel 把选中的地址回传给下单页
      const ch = Taro.getCurrentInstance().page?.getOpenerEventChannel?.()
      ch?.emit?.('addressSelected', a)
      Taro.navigateBack()
    } else {
      Taro.switchTab({ url: '/pages/index/index' })
    }
  }

  const handleDelete = async (a: Address) => {
    const ok = await confirm(
      a.is_default
        ? '删除后默认地址将为空，下单时需重新选择。确定删除？'
        : '确定删除该收货地址？'
    )
    if (!ok) return
    setBusyId(a.id)
    try {
      await deleteAddress(a.id)
      toast('已删除', 'success')
      // 列表与「默认地址」缓存都要失效：删掉的可能正是默认那条
      qc.invalidateQueries({ queryKey: ['addresses'] })
      qc.invalidateQueries({ queryKey: ['address-default'] })
    } catch (err: any) {
      toast(err?.message || '删除失败')
    } finally {
      setBusyId(0)
    }
  }

  const handleSetDefault = async (a: Address) => {
    if (a.is_default) return
    setBusyId(a.id)
    try {
      await setDefaultAddress(a.id)
      toast('已设为默认', 'success')
      qc.invalidateQueries({ queryKey: ['addresses'] })
      qc.invalidateQueries({ queryKey: ['address-default'] })
    } catch (err: any) {
      toast(err?.message || '设置失败')
    } finally {
      setBusyId(0)
    }
  }

  if (!token) {
    return <Empty text="请先登录" />
  }

  const body = () => {
    if (listQ.isPending) return <Empty loading />
    if (listQ.isError) {
      return <ErrorState onRetry={() => listQ.refetch()} />
    }
    if (addresses.length === 0) {
      return <Empty text="还没有收货地址" hint="添加一个，下单时就不用重复填写了" />
    }
    return addresses.map((a) => (
      <View className="addr-card" key={a.id} onClick={() => pick(a)}>
        <View className="addr-head">
          <Text className="addr-name">{a.receiver}</Text>
          <Text className="addr-phone">{a.phone}</Text>
          {a.is_default && <Text className="addr-tag">默认</Text>}
        </View>
        <Text className="addr-text">{fullAddress(a)}</Text>

        <View className="addr-ops">
          <View
            className={`op ${a.is_default ? 'op-disabled' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              if (busyId) return
              handleSetDefault(a)
            }}
          >
            <View className={`radio ${a.is_default ? 'on' : ''}`} />
            <Text className="op-text">{a.is_default ? '默认地址' : '设为默认'}</Text>
          </View>
          <View className="op-right">
            <Text
              className="op-link"
              onClick={(e) => {
                e.stopPropagation()
                goEdit(a.id)
              }}
            >
              编辑
            </Text>
            <Text
              className="op-link danger"
              onClick={(e) => {
                e.stopPropagation()
                if (busyId) return
                handleDelete(a)
              }}
            >
              删除
            </Text>
          </View>
        </View>
      </View>
    ))
  }

  return (
    <View className="addr-page">
      {isSelectMode && (
        <View className="pick-tip">
          <Text className="pick-tip-text">请选择本次下单的收货地址</Text>
        </View>
      )}

      <View className="addr-list">{body()}</View>

      <View className="footer-bar">
        <Button className="primary-btn" onClick={() => goEdit()}>
          新增收货地址
        </Button>
      </View>
    </View>
  )
}
