// File Name: category.js
// Created Time: 2026-09-22 19:42:08
// Update Time: 2026-09-22 19:42:08

import request from './request'

export function listCategories() {
  return request.get('/admin/categories')
}

export function createCategory(payload) {
  return request.post('/admin/categories', payload)
}

export function updateCategory(id, payload) {
  return request.put(`/admin/categories/${id}`, payload)
}

export function deleteCategory(id) {
  return request.delete(`/admin/categories/${id}`)
}

