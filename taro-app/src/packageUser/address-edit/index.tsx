import { useEffect, useState } from 'react'
import { View, Text, Input, Button, Picker, Switch } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import Empty from '@/components/Empty'
import {
  getAddress,
  createAddress,
  updateAddress,
  listAddresses,
  type AddressInput,
} from '@/services/api/address'
import { useAuthStore } from '@/store/auth'
import { toast, currentPlatform, pickRegionAlipay } from '@/utils/platform'

import './index.scss'

export default function AddressEditPage() {
  const router = useRouter()
  const editId = Number(router.params.id || 0)
  const isEdit = !!editId

  // 支付宝不支持 <Picker mode="region">，需走 my.multiLevelSelect 分支
  const isAlipay = currentPlatform() === 'alipay'

  const token = useAuthStore((s) => s.token)
  const qc = useQueryClient()

  const [receiver, setReceiver] = useState('')
  const [phone, setPhone] = useState('')
  // Picker mode="region" 的 value 是 [省, 市, 区] 三元数组
  const [region, setRegion] = useState<string[]>([])
  const [detail, setDetail] = useState('')
  const [setDefault, setSetDefault] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 编辑模式：拉出原地址填充表单
  const detailQ = useQuery({
    queryKey: ['address', editId],
    queryFn: () => getAddress(editId),
    enabled: isEdit && !!token,
  })

  /**
   * 是否已有地址 —— 决定「设为默认」开关的默认值与文案。
   *
   * ⚠️ 不能写死 `setDefault = false`：
   * 后端对**首条**地址会自动置为默认（wantDefault := in.SetDefault || hasDefault == 0），
   * 若不把这一点显式告诉用户，用户会以为「我没勾默认，怎么成默认了」；
   * 而若用户已经有一条默认地址，新增时也不该默认勾选（会把旧的顶掉）。
   * 所以这里按实际条数渲染不同文案。
   */
  const listQ = useQuery({
    queryKey: ['addresses'],
    queryFn: listAddresses,
    enabled: !!token && !isEdit,
  })
  const isFirst = !isEdit && (listQ.data?.length ?? 0) === 0

  // 原地址数据到达后回填（只回填一次，之后的编辑以本地 state 为准）
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    const a = detailQ.data
    if (!a || filled) return
    setReceiver(a.receiver)
    setPhone(a.phone)
    setRegion([a.province, a.city, a.district].filter(Boolean))
    setDetail(a.detail)
    setSetDefault(a.is_default)
    setFilled(true)
  }, [detailQ.data, filled])

  /**
   * 支付宝端：拉起 my.multiLevelSelect 选择省市区。
   * 用户取消（res.success === false）返回 null，此时保持原值不动。
   */
  const handlePickRegion = async () => {
    try {
      const picked = await pickRegionAlipay()
      if (picked) setRegion(picked)
    } catch (err: any) {
      toast(err?.message || '地区选择失败')
    }
  }

  const handleSubmit = async () => {
    const r = receiver.trim()
    const p = phone.trim()
    const d = detail.trim()

    if (!r) {
      toast('请输入收货人姓名')
      return
    }
    if (!/^1\d{10}$/.test(p)) {
      toast('手机号格式不正确')
      return
    }
    if (region.length < 3 || !region[0]) {
      toast('请选择所在地区')
      return
    }
    if (!d) {
      toast('请输入详细地址')
      return
    }

    const payload: AddressInput = {
      receiver: r,
      phone: p,
      province: region[0] || '',
      city: region[1] || '',
      district: region[2] || '',
      detail: d,
      set_default: setDefault,
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await updateAddress(editId, payload)
        toast('已保存', 'success')
      } else {
        await createAddress(payload)
        toast('已添加', 'success')
      }
      qc.invalidateQueries({ queryKey: ['addresses'] })
      qc.invalidateQueries({ queryKey: ['address-default'] })
      setTimeout(() => Taro.navigateBack(), 400)
    } catch (err: any) {
      toast(err?.message || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (isEdit && detailQ.isPending) return <Empty loading />
  if (isEdit && !detailQ.data) return <Empty text="地址不存在" />

  const regionText = region.length ? region.join(' ') : ''

  return (
    <View className="addr-edit-page">
      <View className="card">
        <View className="field">
          <Text className="label">收货人</Text>
          <Input
            className="input"
            placeholder="请输入收货人姓名"
            value={receiver}
            onInput={(e) => setReceiver((e.target as any).value || '')}
          />
        </View>

        <View className="field">
          <Text className="label">手机号</Text>
          <Input
            className="input"
            type="number"
            maxlength={11}
            placeholder="请输入收货人手机号"
            value={phone}
            onInput={(e) => setPhone((e.target as any).value || '')}
          />
        </View>

        <View className="field">
          <Text className="label">所在地区</Text>
          {/*
            ⚠️ 支付宝**不支持** `<Picker mode="region">`（Taro 的 Picker.d.ts 里
            mode 的 @supported 只有 weapp/h5/rn/harmony，不含 alipay）。
            传了不报错，而是静默退化成日期选择器 → 用户看到「年月日」滚轮。
            所以支付宝侧改用 my.multiLevelSelect（见 pickRegionAlipay）。
          */}
          {isAlipay ? (
            <View
              className={`picker ${regionText ? '' : 'placeholder'}`}
              onClick={handlePickRegion}
            >
              <Text>{regionText || '请选择省 / 市 / 区'}</Text>
              <Text className="picker-arrow">›</Text>
            </View>
          ) : (
            <Picker
              mode="region"
              value={region}
              onChange={(e) => setRegion((e.detail.value as string[]) || [])}
            >
              <View className={`picker ${regionText ? '' : 'placeholder'}`}>
                <Text>{regionText || '请选择省 / 市 / 区'}</Text>
                <Text className="picker-arrow">›</Text>
              </View>
            </Picker>
          )}
        </View>

        <View className="field">
          <Text className="label">详细地址</Text>
          <Input
            className="input"
            placeholder="街道、门牌号、小区楼栋等"
            value={detail}
            onInput={(e) => setDetail((e.target as any).value || '')}
          />
        </View>

        <View className="switch-row">
          <View className="switch-left">
            <Text className="switch-label">设为默认地址</Text>
            <Text className="switch-hint">
              {isFirst
                ? '这是你的第一条地址，将自动成为默认地址'
                : '下单时会优先带出该地址'}
            </Text>
          </View>
          <Switch
            checked={setDefault || isFirst}
            disabled={isFirst}
            color="#1677ff"
            onChange={(e) => setSetDefault(!!e.detail.value)}
          />
        </View>
      </View>

      <View className="footer-bar">
        <Button className="primary-btn" loading={submitting} onClick={handleSubmit}>
          {isEdit ? '保存' : '添加'}
        </Button>
      </View>
    </View>
  )
}
