// File Name: dashboard.js
// Created Time: 2026-09-22 19:37:26
// Update Time: 2026-09-22 19:37:26


import request from './request'

export function listEquipments(params = {}) {
  return request.get('/admin/equipments', { params })
}

export function listOrders(params = {}) {
  return request.get('/admin/orders', { params })
}

export function listInvoices(params = {}) {
  return request.get('/admin/invoices', { params })
}

export function invoiceStats() {
  return request.get('/admin/invoices/stats')
}
