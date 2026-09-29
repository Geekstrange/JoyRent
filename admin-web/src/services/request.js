// File Name: request.js
// Created Time: 2026-09-22 19:36:58
// Update Time: 2026-09-22 19:36:58


import axios from 'axios'
import { message } from 'antd'
import { useAuthStore } from '@/stores/auth'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api/v1',
  timeout: 15000,
})

request.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

request.interceptors.response.use(
  (resp) => {
    const body = resp.data
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) {
        return body.data
      }
      const err = new Error(body.message || '请求失败')
      err.code = body.code
      err.httpStatus = resp.status
      throw err
    }
    return body
  },
  (error) => {
    const status = error.response?.status
    const body = error.response?.data
    const msg = body?.message || error.message || '网络错误'

    if (status === 401) {
      useAuthStore.getState().logout()
      message.error('登录已过期，请重新登录')
      if (window.location.pathname !== '/login') {
        window.location.replace('/login')
      }
    } else if (status === 403) {
      message.error(msg || '无权限')
    } else if (status >= 500) {
      message.error('服务异常，请稍后重试')
    } else if (status !== 409 && status !== 400) {
      message.error(msg)
    }

    const err = new Error(msg)
    err.code = body?.code
    err.httpStatus = status
    return Promise.reject(err)
  }
)

export default request
