// File Name: invoice.js
// Created Time: 2026-09-22 19:46:05
// Update Time: 2026-09-22 19:46:05


import request from './request'

export function listInvoices(params = {}) {
  return request.get('/admin/invoices', { params })
}

export function getInvoice(id) {
  return request.get(`/admin/invoices/${id}`)
}

export function issueInvoice(id, invoiceNo) {
  return request.post(`/admin/invoices/${id}/issue`, { invoice_no: invoiceNo })
}

export function rejectInvoice(id, reason) {
  return request.post(`/admin/invoices/${id}/reject`, { reason })
}

export function invoiceStats() {
  return request.get('/admin/invoices/stats')
}
