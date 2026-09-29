// File Name: equipment.js
// Created Time: 2026-09-22 19:42:19
// Update Time: 2026-09-22 19:42:19


import request from './request'

export function listEquipments(params = {}) {
  return request.get('/admin/equipments', { params })
}

export function getEquipment(id) {
  return request.get(`/admin/equipments/${id}`)
}

export function createEquipment(payload) {
  return request.post('/admin/equipments', payload)
}

export function updateEquipment(id, payload) {
  return request.put(`/admin/equipments/${id}`, payload)
}

export function deleteEquipment(id) {
  return request.delete(`/admin/equipments/${id}`)
}

export function listUnits(equipmentId) {
  return request.get(`/admin/equipments/${equipmentId}/units`)
}

export function generateUnits(equipmentId, count) {
  return request.post(`/admin/equipments/${equipmentId}/units/generate`, {
    count,
  })
}

export function updateUnitStatus(unitId, status) {
  return request.put(`/admin/units/${unitId}/status`, { status })
}

export function getAvailability(equipmentId, days = 14) {
  return request.get(`/admin/equipments/${equipmentId}/availability`, {
    params: { days },
  })
}
