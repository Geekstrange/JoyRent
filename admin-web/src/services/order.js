// File Name: order.js
// Created Time: 2026-09-22 19:45:52
// Update Time: 2026-09-22 19:45:52


import request from './request'

export function listOrders(params = {}) {
  return request.get('/admin/orders', { params })
}

export function getOrder(id) {
  return request.get(`/admin/orders/${id}`)
}

export function transitionOrder(id, next) {
  return request.post(`/admin/orders/${id}/transition`, { next })
}

export function refundDeposit(id) {
  return request.post(`/admin/orders/${id}/refund-deposit`)
}
