// File Name: equipment.ts
// Created Time: 2026-09-22 20:03:49
// Update Time: 2026-09-22 20:03:49


import { get } from '../request'

export interface Equipment {
  id: number
  merchant_id: number
  category_id: number
  name: string
  spec: string
  description: string
  cover_path: string
  daily_cents: number
  deposit_cents: number
  total: number
}

export interface AvailabilityBar {
  date: string
  count: number
}

export function listEquipments(params: { category_id?: number; keyword?: string } = {}) {
  return get<Equipment[]>('/app/equipments', params, { auth: false, silent: true })
}

export function getEquipment(id: number) {
  return get<Equipment>(`/app/equipments/${id}`, undefined, {
    auth: false,
    silent: true,
  })
}

export function getAvailability(id: number, days = 14) {
  return get<AvailabilityBar[]>(
    `/app/equipments/${id}/availability`,
    { days },
    { auth: false, silent: true }
  )
}

export function getAvailabilityForPeriod(id: number, start: string, end: string) {
  return get<{ available: number }>(
    `/app/equipments/${id}/availability`,
    { start, end },
    { auth: false, silent: true }
  )
}
