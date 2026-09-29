// File Name: user.js
// Created Time: 2026-09-22 19:51:07
// Update Time: 2026-09-22 19:51:07


import request from './request'

export function listUsers(params = {}) {
  return request.get('/admin/users', { params })
}

export function toggleUserStatus(id) {
  return request.post(`/admin/users/${id}/toggle-status`)
}
