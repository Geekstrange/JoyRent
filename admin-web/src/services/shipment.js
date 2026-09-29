// File Name: shipment.js
// Created Time: 2026-09-22 19:46:15
// Update Time: 2026-09-22 19:46:15


import request from './request'

export function getShipmentByOrder(orderId) {
  return request.get(`/admin/orders/${orderId}/shipment`)
}

export function upsertShipment(orderId, payload) {
  return request.post(`/admin/orders/${orderId}/shipment`, payload)
}

export function setShipmentStatus(orderId, status, text = '') {
  return request.post(`/admin/orders/${orderId}/shipment/status`, {
    status,
    text,
  })
}
