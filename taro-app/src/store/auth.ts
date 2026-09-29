// File Name: auth.ts
// Created Time: 2026-09-22 20:03:00
// Update Time: 2026-09-22 20:03:00


import { create } from 'zustand'
import Taro from '@tarojs/taro'

import { currentPlatform, getLoginCode } from '@/utils/platform'
import { loginWechat, loginAlipay, loginDev } from '@/services/api/auth'
import { DEV_LOGIN_ENABLED } from '@/utils/env'

const TOKEN_KEY = 'rental_token'
const USER_KEY = 'rental_user'

/** 生成稳定的开发态用户标识：同一台设备 + 同一平台始终登录到同一个用户 */
function devCode(platform: string): string {
  let key = ''
  try {
    key = Taro.getStorageSync('rental_dev_seed') || ''
    if (!key) {
      key = Math.random().toString(36).slice(2, 10)
      Taro.setStorageSync('rental_dev_seed', key)
    }
  } catch {
    key = 'default'
  }
  return `dev_${key}`
}

/**
 * Taro 的平台标识 → 后端的业务平台标识。
 *
 * ⚠️ 两者**不是同一套值**，混淆会直接 400：
 *   Taro `TARO_ENV`   = 'weapp' | 'alipay'   （构建目标）
 *   后端 platform      = 'wechat' | 'alipay'  （业务渠道，见 model.PlatformWechat）
 * 只有 alipay 恰好同名；weapp 必须映射成 wechat。
 */
function toBackendPlatform(platform: string): string {
  return platform === 'alipay' ? 'alipay' : 'wechat'
}

interface AppUser {
  id: number
  platform: string
  nickname: string
  avatar_path: string
  phone: string
  status: string
}

interface AuthState {
  token: string
  user: AppUser | null
  bootstrapped: boolean
  logging: boolean
  bootstrap: () => void
  login: () => Promise<void>
  logout: () => void
  setUser: (u: AppUser) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: '',
  user: null,
  bootstrapped: false,
  logging: false,

  bootstrap: () => {
    try {
      const token = Taro.getStorageSync(TOKEN_KEY) || ''
      const user = Taro.getStorageSync(USER_KEY) || null
      set({ token, user: user || null, bootstrapped: true })
    } catch {
      set({ bootstrapped: true })
    }
  },

  login: async () => {
    if (get().logging) return
    set({ logging: true })
    try {
      const platform = currentPlatform()
      let data: { token: string; user: AppUser }

      try {
        const code = await getLoginCode()
        data =
          platform === 'alipay'
            ? await loginAlipay(code)
            : await loginWechat(code)
      } catch (err: any) {
        // ── 测试态兜底 ────────────────────────────────────────────────
        // 本地没配小程序密钥时正式登录必然失败（模拟 code 也换不到 openid）。
        // 这里回落到后端 dev-login 旁路，让本地能完整走通登录 → 拿 token → 请求带鉴权。
        // 开关来自 TARO_APP_DEV_LOGIN（**不是** NODE_ENV，原因见 utils/env.ts）。
        if (!DEV_LOGIN_ENABLED) throw err

        const reason = err?.message || '登录失败'
        console.warn('[auth] 正式登录失败，回落到测试态旁路：', reason)
        Taro.showToast({ title: `已切测试态登录（${reason}）`, icon: 'none', duration: 2000 })
        data = await loginDev(toBackendPlatform(platform), devCode(platform))
      }

      Taro.setStorageSync(TOKEN_KEY, data.token)
      Taro.setStorageSync(USER_KEY, data.user)
      set({ token: data.token, user: data.user })
    } finally {
      set({ logging: false })
    }
  },

  logout: () => {
    Taro.removeStorageSync(TOKEN_KEY)
    Taro.removeStorageSync(USER_KEY)
    set({ token: '', user: null })
  },

  setUser: (u) => {
    Taro.setStorageSync(USER_KEY, u)
    set({ user: u })
  },
}))
