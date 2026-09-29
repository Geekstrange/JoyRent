// File Name: auth.js
// Created Time: 2026-09-22 19:37:13
// Update Time: 2026-09-22 19:37:13


import request from './request'

export function adminLogin(payload) {
  return request.post('/admin/login', payload)
}

// 管理员修改密码：payload = { old_password, new_password }
export function changeAdminPassword(payload) {
  return request.post('/admin/password', payload)
}
