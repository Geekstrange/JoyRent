// File Name: auth.ts
// Created Time: 2026-09-22 20:03:27
// Update Time: 2026-09-22 20:03:27

import { post, get } from '../request'

export interface LoginResp {
  token: string
  user: {
    id: number
    platform: string
    nickname: string
    avatar_path: string
    phone: string
    status: string
  }
}

export function loginWechat(code: string) {
  return post<LoginResp>('/app/auth/wechat', { code }, { auth: false, silent: true })
}

export function loginAlipay(code: string) {
  return post<LoginResp>('/app/auth/alipay', { code }, { auth: false, silent: true })
}

/**
 * 开发态登录旁路（后端 `POST /app/auth/dev-login`）。
 *
 * 为什么需要它：
 * 后端只有在 `[payment.wechat] app_id/app_secret` 配齐时才能拿 code 去换 openid。
 * 本地开发通常没有真实小程序密钥，此时走正式接口必然 500
 * （`code2session: wechat miniprogram not configured`）。
 * 而开发者工具 `wx.login()` 返回的是**模拟 code**，即使配了密钥也无法在
 * 微信服务器换取成功。所以本地联调必须走这个不校验 code 的旁路。
 *
 * 该路由**仅在** `server.allow_dev_login = true` 且 `server.mode != "release"`
 * 时注册；线上不存在此路径，因此这里失败也不影响生产。
 */
export function loginDev(platform: string, code: string) {
  return post<LoginResp>('/app/auth/dev-login', { platform, code }, { auth: false, silent: true })
}

export function fetchMe() {
  return get<LoginResp['user']>('/app/me')
}

